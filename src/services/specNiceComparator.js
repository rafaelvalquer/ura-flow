import { normalizeKey, normalizeText } from '../utils/normalizeText.js';
import { getDirectMenuCaseBranches } from './niceMenuRouting.js';

const CHANGE_LABELS = {
  'missing-option': 'Opcao faltando no NICE',
  'extra-option': 'Opcao extra no NICE',
  'scriptpoint-mismatch': 'Scriptpoint diferente',
  'audio-mismatch': 'Audio diferente',
  'next-step-mismatch': 'NEXT_STEP divergente',
  'missing-rule': 'Regra nao implementada',
  'unmapped-nice-logic': 'Logica NICE sem spec',
  'missing-audio': 'Audio faltando no NICE',
  'extra-audio': 'Audio extra no NICE',
  'option-match': 'Opcao validada',
  'rule-match': 'Regra validada',
  'audio-match': 'Audio validado',
};

const CHANGE_SEVERITY = {
  'missing-option': 'critical',
  'extra-option': 'warning',
  'scriptpoint-mismatch': 'critical',
  'audio-mismatch': 'warning',
  'next-step-mismatch': 'critical',
  'missing-rule': 'warning',
  'unmapped-nice-logic': 'info',
  'missing-audio': 'warning',
  'extra-audio': 'info',
};

export function compareSpecStateWithNiceScript(state, niceScript) {
  const spec = normalizeSpecState(state);
  const nice = extractNiceFunctionalModel(niceScript);
  const changes = [];
  const matches = [];
  const matchedNiceOptionIds = new Set();

  spec.options.forEach((expected) => {
    const actual = findBestNiceOption(expected, nice);
    if (!actual) {
      changes.push(makeChange('missing-option', { expected }));
      return;
    }
    if (actual.id) matchedNiceOptionIds.add(actual.id);

    const mismatchCount = [
      compareField(changes, 'scriptpoint-mismatch', 'scriptpoint', expected, actual, normalizeScriptpoint),
      compareField(changes, 'audio-mismatch', 'audio', expected, actual, normalizeAudio, audioMatches),
      compareField(changes, 'next-step-mismatch', 'nextStep', expected, actual, normalizeNextStep, nextStepMatches),
    ].filter(Boolean).length;

    if (mismatchCount === 0) {
      matches.push(makeMatch('option-match', { expected, actual }));
    }
  });

  nice.options.forEach((actual) => {
    if (!spec.optionsByKey.has(actual.key) && !matchedNiceOptionIds.has(actual.id)) {
      changes.push(makeChange('extra-option', { actual }));
    }
  });

  spec.rules.forEach((expected) => {
    const actual = nice.rulesByKey.get(expected.key);
    if (!actual) {
      changes.push(makeChange('missing-rule', { expected }));
    } else {
      matches.push(makeMatch('rule-match', { expected, actual }));
    }
  });

  nice.rules.forEach((actual) => {
    if (!spec.ruleKeys.has(actual.key)) {
      changes.push(makeChange('unmapped-nice-logic', { actual }));
    }
  });

  spec.audioCatalog.forEach((expected) => {
    const actual = findMatchingAudio(expected, nice.audioReferences);
    if (!actual) {
      changes.push(makeChange('missing-audio', { expected }));
    } else {
      matches.push(makeMatch('audio-match', { expected, actual }));
    }
  });

  if (spec.audioCatalog.length) {
    nice.audioReferences.forEach((actual) => {
      if (!isExpectedSpecAudio(actual, spec)) {
        changes.push(makeChange('extra-audio', { actual }));
      }
    });
  }

  return {
    stateName: state?.sheetName || '',
    scriptName: niceScript?.name || '',
    hasDedicatedFields: spec.hasDedicatedFields,
    summary: buildSummary(changes, matches),
    changes,
    matches,
    spec,
    nice,
  };
}

export function getSpecNiceChangeLabel(type) {
  return CHANGE_LABELS[type] ?? type;
}

function normalizeSpecState(state) {
  const options = [];
  const rules = new Map();
  const audioCatalog = (state?.audioCatalog ?? []).map((audio) => ({
    key: normalizeAudio(audio.fileName),
    label: audio.fileName,
    audio: audio.fileName,
    audioText: audio.text,
    rowNumber: audio.rowNumber,
  })).filter((audio) => audio.key);
  let hasDedicatedFields = false;

  (state?.transitions ?? []).forEach((transition) => {
    const optionKey = extractSpecOptionKey(transition);
    const inferredAudio = transition.audio || inferAudioFromPrompt(transition.prompt);
    const inferredScriptpoint = transition.scriptpoint || transition.biCode;
    const inferredNextStep = transition.nextStep || transition.to;
    const hasComparisonFields = Boolean(
      transition.audio
      || transition.scriptpoint
      || transition.nextStep
      || transition.transferCode
      || inferredAudio
      || inferredScriptpoint
      || inferredNextStep,
    );
    if (hasComparisonFields) hasDedicatedFields = true;

    if (optionKey) {
      options.push({
        key: optionKey,
        label: makeSpecOptionLabel(optionKey, transition),
        audio: inferredAudio,
        scriptpoint: inferredScriptpoint,
        nextStep: inferredNextStep,
        transferCode: transition.transferCode,
        transition,
        rowNumber: transition.rowNumber,
      });
    }

    (transition.conditions ?? []).forEach((condition) => {
      if (isOptionCondition(condition)) return;
      if (!isSpecRuleCondition(condition)) return;
      const key = normalizeRuleKey(condition);
      if (!key || rules.has(key)) return;
      rules.set(key, {
        key,
        label: condition,
        transition,
        rowNumber: transition.rowNumber,
      });
    });
  });

  return {
    options,
    optionsByKey: new Map(options.map((option) => [option.key, option])),
    rules: [...rules.values()],
    ruleKeys: new Set(rules.keys()),
    audioCatalog,
    audioCatalogByKey: new Map(audioCatalog.map((audio) => [audio.key, audio])),
    audioKeys: new Set([
      ...audioCatalog.map((audio) => audio.key),
      ...options.map((option) => normalizeAudio(option.audio)).filter(Boolean),
    ]),
    hasDedicatedFields,
  };
}

function extractNiceFunctionalModel(script) {
  const actions = script?.actions ?? [];
  const actionsById = new Map(actions.map((action) => [Number(action.actionId), action]));
  const options = [];
  const optionsByKey = new Map();
  const rules = [];
  const audioByKey = new Map();

  const registerNiceOption = (option) => {
    if (!option?.key) return;
    const normalized = {
      id: option.id || `nice-option-${options.length + 1}`,
      ...option,
    };
    const duplicateKey = [
      normalized.key,
      normalized.actionId,
      normalizeScriptpoint(normalized.scriptpoint),
      normalizeAudio(normalized.audio),
      normalizeNextStep(normalized.nextStep),
    ].join('|');
    if (options.some((item) => item.duplicateKey === duplicateKey)) return;
    options.push({ ...normalized, duplicateKey });
    mergeNiceOption(optionsByKey, normalized);
  };

  actions.forEach((action) => {
    if (action.action === 'SNIPPET') {
      extractAudioReferences(action.parameters?.[0] ?? '').forEach((audio) => {
        if (!audioByKey.has(audio.key)) {
          audioByKey.set(audio.key, {
            ...audio,
            actionId: Number(action.actionId),
            source: action.caption || 'SNIPPET',
          });
        }
      });

      extractSnippetSwitchCases(action.parameters?.[0] ?? '').forEach((item) => {
        registerNiceOption({
          key: item.key,
          label: `Opcao ${item.key}`,
          actionId: Number(action.actionId),
          source: `SWITCH ${item.switchValue}`,
          niceSnippet: makeSnippetPreview(item.body),
          ...extractOutputFromCode(item.body),
        });
      });

      extractSnippetIfConditions(action.parameters?.[0] ?? '').forEach((condition) => {
        addRule(rules, condition, Number(action.actionId), 'Snippet');
      });
      return;
    }

    if (action.action === 'CASE') {
      (action.cases ?? []).forEach((branch) => {
        const key = normalizeOptionKey(branch.text);
        if (!key) return;
        const target = actionsById.get(Number(branch.actionId));
        registerNiceOption({
          key,
          label: `Opcao ${key}`,
          actionId: Number(action.actionId),
          targetActionId: Number(branch.actionId),
          targetCaption: target?.caption || '',
          source: 'CASE',
          niceSnippet: makeActionPreview(target),
          ...extractActionOutput(target),
        });
      });
      return;
    }

    if (action.action === 'IF') {
      addRule(rules, action.parameters?.[0] || action.caption, Number(action.actionId), 'IF');
    }
  });

  buildMenuRouteOptions(actions, actionsById).forEach(registerNiceOption);

  const dedupedRules = dedupeRules(rules);
  const optionCandidatesByKey = new Map();
  options.forEach((option) => {
    const candidates = optionCandidatesByKey.get(option.key) ?? [];
    candidates.push(option);
    optionCandidatesByKey.set(option.key, candidates);
  });

  return {
    options,
    optionsByKey,
    optionCandidatesByKey,
    rules: dedupedRules,
    rulesByKey: new Map(dedupedRules.map((rule) => [rule.key, rule])),
    ruleKeys: new Set(dedupedRules.map((rule) => rule.key)),
    audioReferences: [...audioByKey.values()],
    audioByKey,
  };
}

function mergeNiceOption(map, option) {
  const existing = map.get(option.key);
  if (!existing) {
    map.set(option.key, option);
    return;
  }

  map.set(option.key, {
    ...existing,
    ...option,
    audio: existing.audio || option.audio,
    scriptpoint: existing.scriptpoint || option.scriptpoint,
    nextStep: existing.nextStep || option.nextStep,
    transferCode: existing.transferCode || option.transferCode,
    actionId: existing.actionId || option.actionId,
    targetActionId: existing.targetActionId || option.targetActionId,
    source: [existing.source, option.source].filter(Boolean).join(' + '),
  });
}

function buildMenuRouteOptions(actions, actionsById) {
  const routes = [];
  actions
    .filter((action) => action.action === 'MENU')
    .forEach((menu) => {
      getDirectMenuCaseBranches(menu).forEach((branch) => {
        const key = normalizeOptionKey(branch.text);
        if (!key) return;
        walkNiceRoute({
          key,
          actionId: Number(branch.actionId),
          actionsById,
          routes,
          context: {
            menu,
            labels: [`Case ${key}`],
            output: {},
            visited: new Set(),
          },
        });
      });
    });
  return routes;
}

function walkNiceRoute({ key, actionId, actionsById, routes, context }) {
  if (!actionId || actionId < 0) return;
  const action = actionsById.get(Number(actionId));
  if (!action) return;

  const visitKey = `${key}:${actionId}:${context.labels.join('>')}`;
  if (context.visited.has(visitKey) || context.visited.size > 80) return;
  const visited = new Set(context.visited);
  visited.add(visitKey);

  const actionOutput = extractActionOutput(action);
  const output = mergeOutputs(context.output, actionOutput);
  const labels = [...context.labels];
  if (action.action === 'IF') {
    labels.push(action.caption || 'IF');
  }

  if (action.action === 'SNIPPET' && hasComparableOutput(actionOutput)) {
    routes.push(makeRouteOption({ key, action, context, labels, output }));
  }

  if (action.action === 'RUNSCRIPT' || action.action === 'RETURN' || !getDefaultNextActionId(action)) {
    if (hasComparableOutput(output)) {
      routes.push(makeRouteOption({ key, action, context, labels, output }));
    }
    return;
  }

  if (action.action === 'IF' || action.action === 'LOOP') {
    (action.branches ?? []).forEach((branch) => {
      walkNiceRoute({
        key,
        actionId: Number(branch.actionId),
        actionsById,
        routes,
        context: {
          ...context,
          labels: [...labels, normalizeText(branch.text) || `Branch ${branch.index ?? ''}`.trim()],
          output,
          visited,
        },
      });
    });
    return;
  }

  if (action.action === 'CASE') {
    const sameCase = (action.cases ?? []).find((branch) => normalizeOptionKey(branch.text) === key);
    const branches = sameCase ? [sameCase] : (action.cases ?? []);
    branches.forEach((branch) => {
      walkNiceRoute({
        key,
        actionId: Number(branch.actionId),
        actionsById,
        routes,
        context: {
          ...context,
          labels: [...labels, `Case ${normalizeText(branch.text)}`],
          output,
          visited,
        },
      });
    });
    if (!sameCase && action.defaultNextAction?.actionId > 0) {
      walkNiceRoute({
        key,
        actionId: Number(action.defaultNextAction.actionId),
        actionsById,
        routes,
        context: {
          ...context,
          labels: [...labels, 'Default'],
          output,
          visited,
        },
      });
    }
    return;
  }

  walkNiceRoute({
    key,
    actionId: getDefaultNextActionId(action),
    actionsById,
    routes,
    context: {
      ...context,
      labels,
      output,
      visited,
    },
  });
}

function makeRouteOption({ key, action, context, labels, output }) {
  const pathLabel = labels.filter(Boolean).join(' > ');
  return {
    id: `route-${key}-${action.actionId}-${normalizeKey(pathLabel).replace(/\s+/g, '-')}`,
    key,
    label: `Opcao ${key}${pathLabel ? ` - ${pathLabel}` : ''}`,
    actionId: Number(action.actionId),
    source: `Fluxo MENU${pathLabel ? ` > ${pathLabel}` : ''}`,
    niceSnippet: makeActionPreview(action),
    targetActionId: Number(action.actionId),
    targetCaption: action.caption || '',
    ...output,
  };
}

function getDefaultNextActionId(action) {
  return Number(action?.defaultNextAction?.actionId) || -1;
}

function mergeOutputs(current, next) {
  const merged = { ...current };
  Object.entries(next ?? {}).forEach(([field, value]) => {
    if (!value) return;
    if (field === 'nextStep' && isGenericNextStep(value) && merged.nextStep) return;
    if (field === 'audio' && merged.audio && normalizeAudio(merged.audio) === normalizeAudio(value)) return;
    merged[field] = value;
  });
  return merged;
}

function hasComparableOutput(output) {
  return Boolean(output?.audio || output?.scriptpoint || output?.nextStep || output?.transferCode);
}

function isGenericNextStep(value) {
  const normalized = normalizeNextStep(value);
  return normalized === 'nextstep' || normalized === 'next step';
}

function extractActionOutput(action) {
  if (!action) return {};
  if (action.action === 'SNIPPET') return extractOutputFromCode(action.parameters?.[0] ?? '');
  if (action.action === 'ASSIGN') return { [normalizeAssignmentName(action.parameters?.[0])]: cleanValue(action.parameters?.[1]) };
  if (action.action === 'RUNSCRIPT') return { nextStep: cleanValue(action.parameters?.[0]) };
  return {};
}

function extractOutputFromCode(code) {
  const output = {};
  const cleaned = stripLineComments(code);
  const assignRegex = /(?:^|\n)\s*(?:ASSIGN\s+)?([A-Za-z_][\w:.$]*)\s*=\s*([^\n\r]+)/gi;
  let match;

  while ((match = assignRegex.exec(cleaned))) {
    const name = normalizeAssignmentName(match[1]);
    const value = cleanValue(match[2]);
    if (name === 'audio') output.audio = value;
    if (name === 'scriptpoint') output.scriptpoint = value;
    if (name === 'nextstep') output.nextStep = value;
    if (name === 'transfercode') output.transferCode = value;
  }

  return output;
}

function extractSnippetSwitchCases(code) {
  const cleaned = stripLineComments(code);
  const cases = [];
  const switchRegex = /\bSWITCH\s+([A-Za-z_][\w:]*)\s*\{/gi;
  let switchMatch;

  while ((switchMatch = switchRegex.exec(cleaned))) {
    const switchValue = switchMatch[1];
    const openIndex = cleaned.indexOf('{', switchMatch.index);
    const closeIndex = findMatchingBrace(cleaned, openIndex);
    if (closeIndex < 0) continue;
    const body = cleaned.slice(openIndex + 1, closeIndex);
    const caseRegex = /\bCASE\s+"?([^"{\n\r]+)"?\s*\{/gi;
    let caseMatch;
    while ((caseMatch = caseRegex.exec(body))) {
      const open = body.indexOf('{', caseMatch.index);
      const close = findMatchingBrace(body, open);
      if (close < 0) continue;
      const key = normalizeOptionKey(caseMatch[1]);
      if (key) {
        cases.push({
          key,
          switchValue,
          body: body.slice(open + 1, close),
        });
      }
      caseRegex.lastIndex = close + 1;
    }
    switchRegex.lastIndex = closeIndex + 1;
  }

  return cases;
}

function extractSnippetIfConditions(code) {
  const cleaned = stripLineComments(code);
  const conditions = [];
  const ifRegex = /\bIF\s*(?:\(([^)]+)\)|([^{\n\r]+))\s*\{/gi;
  let match;

  while ((match = ifRegex.exec(cleaned))) {
    const condition = normalizeText(match[1] || match[2] || '');
    if (condition) conditions.push(condition);
  }

  return conditions;
}

function findBestNiceOption(expected, nice) {
  const candidates = nice.optionCandidatesByKey.get(expected.key) ?? [];
  if (!candidates.length) return nice.optionsByKey.get(expected.key) ?? null;

  const scored = candidates
    .map((actual) => ({ actual, score: scoreNiceOption(expected, actual) }))
    .sort((a, b) => b.score - a.score);
  const best = scored[0];
  return best?.score > 0 ? best.actual : candidates[0];
}

function scoreNiceOption(expected, actual) {
  let score = 0;
  if (expected.scriptpoint && normalizeScriptpoint(expected.scriptpoint) === normalizeScriptpoint(actual.scriptpoint)) score += 120;
  if (expected.audio && audioMatches(expected.audio, actual.audio)) score += 80;
  if (expected.nextStep && nextStepMatches(expected.nextStep, actual.nextStep)) score += 60;
  if (expected.transferCode && normalizeKey(expected.transferCode) === normalizeKey(actual.transferCode)) score += 40;

  const expectedOutcome = extractOutcomeKey(expected.label);
  const actualText = normalizeKey([actual.label, actual.source, actual.niceSnippet].filter(Boolean).join(' '));
  if (expectedOutcome && actualText.includes(expectedOutcome)) score += 15;
  return score;
}

function compareField(changes, type, field, expected, actual, normalizer, matcher = null) {
  if (!expected[field]) return false;
  const expectedValue = normalizer(expected[field]);
  const actualValue = normalizer(actual[field]);
  const matches = matcher ? matcher(expected[field], actual[field]) : expectedValue === actualValue;
  if (!actualValue || !matches) {
    changes.push(makeChange(type, { expected, actual, field }));
    return true;
  }
  return false;
}

function makeChange(type, { expected = null, actual = null, field = '' }) {
  const reference = expected?.transition ?? null;
  return {
    id: makeComparisonItemId(type, expected, actual, field),
    type,
    severity: CHANGE_SEVERITY[type] ?? 'info',
    label: getSpecNiceChangeLabel(type),
    expected,
    actual,
    field,
    rowNumber: reference?.rowNumber ?? expected?.rowNumber ?? null,
    transitionId: reference?.id ?? null,
    actionId: actual?.actionId ?? actual?.targetActionId ?? null,
  };
}

function makeMatch(type, { expected = null, actual = null }) {
  const reference = expected?.transition ?? null;
  return {
    id: makeComparisonItemId(type, expected, actual),
    type,
    severity: 'success',
    label: getSpecNiceChangeLabel(type),
    expected,
    actual,
    rowNumber: reference?.rowNumber ?? expected?.rowNumber ?? null,
    transitionId: reference?.id ?? null,
    actionId: actual?.actionId ?? actual?.targetActionId ?? null,
  };
}

function makeComparisonItemId(type, expected, actual, field = '') {
  const reference = expected?.transition ?? null;
  return [
    type,
    field,
    expected?.key,
    reference?.id,
    reference?.rowNumber ?? expected?.rowNumber,
    actual?.id,
    actual?.key,
    actual?.label,
    actual?.source,
    actual?.actionId,
    actual?.targetActionId,
    normalizeScriptpoint(expected?.scriptpoint),
    normalizeScriptpoint(actual?.scriptpoint),
    normalizeAudio(expected?.audio),
    normalizeAudio(actual?.audio),
    normalizeNextStep(expected?.nextStep),
    normalizeNextStep(actual?.nextStep),
  ]
    .filter((part) => part !== undefined && part !== null && part !== '')
    .map((part) => String(part).replace(/[^A-Za-z0-9_-]+/g, '-'))
    .join('-') || `${type}-${Math.random().toString(36).slice(2, 8)}`;
}

function buildSummary(changes, matches = []) {
  return {
    total: changes.length,
    matches: matches.length,
    critical: changes.filter((item) => item.severity === 'critical').length,
    warning: changes.filter((item) => item.severity === 'warning').length,
    info: changes.filter((item) => item.severity === 'info').length,
    byType: changes.reduce((acc, change) => {
      acc[change.type] = (acc[change.type] ?? 0) + 1;
      return acc;
    }, {}),
  };
}

function extractSpecOptionKey(transition) {
  const text = [
    ...(transition?.conditions ?? []),
    transition?.observation,
    transition?.prompt,
  ].filter(Boolean).join(' ');
  return normalizeOptionKey(text.match(/\b(?:DTMF|opcao|opção|option|tecla)\s*[:=-]?\s*([0-9*#]+)/i)?.[1])
    || normalizeOptionKey(text.match(/\bcase\s*([0-9*#]+)/i)?.[1]);
}

function makeSpecOptionLabel(optionKey, transition) {
  const path = (transition?.conditions ?? [])
    .map((condition) => normalizeText(condition))
    .filter(Boolean);
  const tail = path.length ? path.join(' > ') : `Opcao ${optionKey}`;
  return tail.includes(optionKey) ? tail : `Opcao ${optionKey} > ${tail}`;
}

function inferAudioFromPrompt(prompt) {
  const text = normalizeText(prompt);
  if (!text) return '';
  return text
    .replace(/^\*\s*_?/, '')
    .replace(/^_+/, '')
    .replace(/\.wav$/i, '');
}

function extractOutcomeKey(value) {
  const key = normalizeKey(value);
  if (key.includes('sucesso')) return 'ok';
  if (key.includes('erro')) return 'erro';
  if (key.includes('rej')) return 'rej';
  if (key.includes('sil')) return 'sil';
  if (key.includes('ath')) return 'ath';
  return '';
}

function isSpecRuleCondition(condition) {
  const key = normalizeKey(condition);
  if (!key) return false;
  if (key.includes('sucesso no envio') || key.includes('erro no envio')) return false;
  if (key === 'tratativas de erro' || key === 'rej' || key === 'sil') return false;
  if (key === 'maxrej' || key === 'maxsil') return false;
  if (key.includes('primeira tentativa') || key.includes('segunda tentativa')) return false;
  return /[?=]/.test(String(condition)) || key.includes('chave') || key.includes('regra') || key.includes('validacao');
}

function findMatchingAudio(expected, audioReferences) {
  return audioReferences.find((actual) => audioMatches(expected.audio, actual.audio)) ?? null;
}

function isExpectedSpecAudio(actual, spec) {
  return [...spec.audioCatalog, ...spec.options].some((expected) => audioMatches(expected.audio, actual.audio));
}

function isOptionCondition(condition) {
  return Boolean(extractSpecOptionKey({ conditions: [condition] }));
}

function addRule(rules, condition, actionId, source) {
  const label = normalizeText(condition);
  const key = normalizeRuleKey(label);
  if (!key) return;
  rules.push({ key, label, actionId, source });
}

function dedupeRules(rules) {
  const seen = new Map();
  rules.forEach((rule) => {
    if (!seen.has(rule.key)) seen.set(rule.key, rule);
  });
  return [...seen.values()];
}

function normalizeRuleKey(value) {
  return normalizeKey(value)
    .replace(/\b(if|se|condicao|condição)\b/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function normalizeOptionKey(value) {
  const text = String(value ?? '').trim();
  const match = text.match(/([0-9*#]+)/);
  return match?.[1] ?? '';
}

function normalizeAssignmentName(value) {
  return normalizeKey(value).replace(/\s+/g, '');
}

function normalizeScriptpoint(value) {
  return String(value ?? '').match(/\d+/)?.[0] ?? '';
}

function normalizeAudio(value) {
  return normalizeKey(String(value ?? '')
    .replace(/\{path_audio\}/gi, '')
    .replace(/^.*[\\/]/, '')
    .replace(/\.wav$/i, '')
    .replace(/^\*\s*_?/, '')
    .replace(/^_+/, ''))
    .replace(/\s+/g, '');
}

function normalizeNextStep(value) {
  return normalizeKey(String(value ?? '')
    .replace(/\{pathstep\}/gi, '')
    .replace(/\{next_step\}/gi, 'next_step')
    .replace(/^pathstep/i, ''))
    .replace(/\s+/g, '');
}

function audioMatches(expected, actual) {
  const expectedValue = normalizeAudio(expected);
  const actualValue = normalizeAudio(actual);
  if (!expectedValue || !actualValue) return false;
  return expectedValue === actualValue
    || actualValue.endsWith(expectedValue)
    || expectedValue.endsWith(actualValue);
}

function nextStepMatches(expected, actual) {
  const expectedValue = normalizeNextStep(expected);
  const actualValue = normalizeNextStep(actual);
  if (!expectedValue || !actualValue) return false;
  return expectedValue === actualValue
    || actualValue.endsWith(expectedValue)
    || expectedValue.endsWith(actualValue);
}

function cleanValue(value) {
  return normalizeText(String(value ?? '')
    .replace(/\/\/.*$/, '')
    .replace(/^ASSIGN\s+/i, '')
    .replace(/["']/g, '')
    .replace(/[;\t]+$/g, '')
    .trim());
}

function stripLineComments(code) {
  return String(code ?? '')
    .split(/\r?\n/)
    .map((line) => line.replace(/\/\/.*$/, ''))
    .join('\n');
}

function extractAudioReferences(code) {
  const cleaned = stripLineComments(code);
  const references = new Map();
  const quotedValueRegex = /["']([^"'\r\n]*(?:\.wav|\{path_audio\})[^"'\r\n]*)["']/gi;
  let match;

  while ((match = quotedValueRegex.exec(cleaned))) {
    const audio = cleanValue(match[1]);
    const key = normalizeAudio(audio);
    if (!key) continue;
    references.set(key, {
      key,
      label: audio,
      audio,
      niceSnippet: makeSnippetPreviewAround(cleaned, match.index),
    });
  }

  return [...references.values()];
}

function makeSnippetPreviewAround(code, index) {
  const before = code.slice(0, index).split(/\r?\n/).length - 1;
  const lines = code
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  return lines.slice(Math.max(0, before - 2), before + 5).join('\n');
}

function makeSnippetPreview(code) {
  const lines = stripLineComments(code)
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  return lines.slice(0, 8).join('\n');
}

function makeActionPreview(action) {
  if (!action) return '';
  if (action.action === 'SNIPPET') return makeSnippetPreview(action.parameters?.[0] ?? '');
  return [
    `${action.action} #${action.actionId}`,
    action.caption,
    ...(action.parameters ?? []).filter(Boolean).slice(0, 6),
  ].filter(Boolean).join('\n');
}

function findMatchingBrace(text, openIndex) {
  if (openIndex < 0) return -1;
  let depth = 0;
  for (let index = openIndex; index < text.length; index += 1) {
    if (text[index] === '{') depth += 1;
    if (text[index] === '}') {
      depth -= 1;
      if (depth === 0) return index;
    }
  }
  return -1;
}

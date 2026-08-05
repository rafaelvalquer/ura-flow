const PROJECT_SCHEMA_VERSION = 1;

const BRANCH_TYPES = new Set(['IF', 'ELSE_IF', 'ELSE', 'CASE', 'ACTION', 'DIRECTIVE']);

export function createProjectFromParsedData(parsedData, options = {}) {
  const now = new Date().toISOString();
  const sourceFileName = options.sourceFileName || parsedData?.fileName || 'SPEC importada.xlsx';
  const projectName = options.name || stripExtension(sourceFileName) || 'Projeto de URA';
  const stateNames = (parsedData?.states ?? []).map((state) => state.sheetName).filter(Boolean);

  const states = (parsedData?.states ?? []).map((state, stateIndex) => {
    const transitionById = new Map((state.transitions ?? []).map((transition) => [transition.id, transition]));
    const usedTransitionIds = new Set();
    const usedRows = new Set();

    const rules = convertDecisionNodes({
      nodes: state.decisionTree ?? [],
      transitionById,
      usedTransitionIds,
      usedRows,
      stateName: state.sheetName,
      parentSeed: `${stateIndex}`,
    });

    (state.transitions ?? []).forEach((transition, transitionIndex) => {
      if (usedTransitionIds.has(transition.id)) return;
      if (usedRows.has(Number(transition.rowNumber))) return;

      rules.push(makeRule({
        id: stableId('rule', state.sheetName, transition.rowNumber || transitionIndex, transition.to),
        result: transition.conditions?.at(-1) || inferFallbackResult(transition, transitionIndex),
        branchType: inferLeafBranchType(transition, transitionIndex),
        destination: transition.to || '',
        prompt: transition.prompt || '',
        observation: transition.observation || '',
        bi: transition.bi || '',
        sourceRow: transition.rowNumber || null,
        imported: true,
        confidence: transition.conditions?.length ? 'medium' : 'high',
      }));
    });

    return {
      id: stableId('state', state.sheetName, stateIndex),
      name: state.sheetName,
      sheetName: state.sheetName,
      description: '',
      previousStates: [],
      audioCatalog: (state.audioCatalog ?? []).map((audio, audioIndex) => ({
        id: stableId('audio', state.sheetName, audio.fileName, audio.rowNumber || audioIndex),
        fileName: audio.fileName || '',
        text: audio.text || '',
        context: audio.context || '',
        development: audio.development || '',
        bi: audio.bi || '',
        sourceRow: audio.rowNumber || null,
      })),
      rules,
      source: {
        originalSheetName: state.sheetName,
        stateIndex,
      },
      metadata: {
        imported: true,
        modified: false,
      },
    };
  });

  const project = {
    schemaVersion: PROJECT_SCHEMA_VERSION,
    id: makeUuid('project'),
    name: projectName,
    sourceFileName,
    importedAt: now,
    updatedAt: now,
    stateNames,
    states,
    metadata: {
      originalDiagnostics: parsedData?.diagnostics ?? null,
      importedSheetNames: parsedData?.sheetNames ?? stateNames,
    },
  };

  return refreshProjectIndexes(project);
}

export function createEmptyProject(name = 'Nova URA') {
  const now = new Date().toISOString();
  const initialState = createEmptyState('EstadoInicial');
  return {
    schemaVersion: PROJECT_SCHEMA_VERSION,
    id: makeUuid('project'),
    name,
    sourceFileName: '',
    importedAt: now,
    updatedAt: now,
    stateNames: [initialState.name],
    states: [initialState],
    metadata: {
      originalDiagnostics: null,
      importedSheetNames: [],
    },
  };
}

export function createEmptyState(name = 'NovoEstado') {
  const normalizedName = String(name || 'NovoEstado').trim() || 'NovoEstado';
  return {
    id: makeUuid('state'),
    name: normalizedName,
    sheetName: normalizedName,
    description: '',
    previousStates: [],
    audioCatalog: [],
    rules: [createEmptyRule({ branchType: 'ACTION', result: 'Fluxo padrão' })],
    source: {
      originalSheetName: '',
      stateIndex: null,
    },
    metadata: {
      imported: false,
      modified: true,
    },
  };
}

export function createEmptyRule(overrides = {}) {
  return makeRule({
    id: makeUuid('rule'),
    result: '',
    branchType: 'IF',
    destination: '',
    prompt: '',
    observation: '',
    bi: '',
    sourceRow: null,
    imported: false,
    confidence: 'high',
    ...overrides,
  });
}

export function refreshProjectIndexes(project) {
  const states = project?.states ?? [];
  return {
    ...project,
    stateNames: states.map((state) => state.name),
  };
}

export function renameState(project, stateId, nextName) {
  const cleanName = String(nextName ?? '').trim();
  if (!cleanName) return project;

  const currentState = project.states.find((state) => state.id === stateId);
  if (!currentState || currentState.name === cleanName) return project;
  const previousName = currentState.name;

  const states = project.states.map((state) => ({
    ...state,
    name: state.id === stateId ? cleanName : state.name,
    sheetName: state.id === stateId ? cleanName : state.sheetName,
    rules: mapRuleTree(state.rules, (rule) => (
      normalizeKey(rule.destination) === normalizeKey(previousName)
        ? { ...rule, destination: cleanName }
        : rule
    )),
    metadata: state.id === stateId
      ? { ...state.metadata, modified: true }
      : state.metadata,
  }));

  return touchProject(refreshProjectIndexes({ ...project, states }));
}

export function addState(project, requestedName = 'NovoEstado') {
  const name = makeUniqueStateName(project.states, requestedName);
  const state = createEmptyState(name);
  return {
    project: touchProject(refreshProjectIndexes({
      ...project,
      states: [...project.states, state],
    })),
    state,
  };
}

export function duplicateState(project, stateId) {
  const source = project.states.find((state) => state.id === stateId);
  if (!source) return { project, state: null };
  const name = makeUniqueStateName(project.states, `${source.name}_Copia`);
  const state = {
    ...clone(source),
    id: makeUuid('state'),
    name,
    sheetName: name,
    rules: cloneRuleTreeWithNewIds(source.rules),
    audioCatalog: source.audioCatalog.map((audio) => ({ ...audio, id: makeUuid('audio') })),
    source: { originalSheetName: '', stateIndex: null },
    metadata: { imported: false, modified: true },
  };

  return {
    project: touchProject(refreshProjectIndexes({
      ...project,
      states: [...project.states, state],
    })),
    state,
  };
}

export function deleteState(project, stateId) {
  if ((project.states ?? []).length <= 1) return project;
  const states = project.states.filter((state) => state.id !== stateId);
  return touchProject(refreshProjectIndexes({ ...project, states }));
}

export function updateState(project, stateId, patch) {
  const states = project.states.map((state) => (
    state.id === stateId
      ? {
          ...state,
          ...patch,
          metadata: { ...state.metadata, modified: true },
        }
      : state
  ));
  return touchProject(refreshProjectIndexes({ ...project, states }));
}

export function updateRuleInState(project, stateId, ruleId, patch) {
  return updateStateRules(project, stateId, (rules) => updateRule(rules, ruleId, patch));
}

export function addRootRuleToState(project, stateId, branchType = 'IF') {
  const rule = createEmptyRule({ branchType, result: branchType === 'ACTION' ? 'Novo resultado' : 'Nova condição' });
  return {
    project: updateStateRules(project, stateId, (rules) => [...rules, rule]),
    rule,
  };
}

export function addChildRuleToState(project, stateId, parentRuleId) {
  const child = createEmptyRule({ branchType: 'CASE', result: 'Nova regra' });
  const nextProject = updateStateRules(project, stateId, (rules) => addChildRule(rules, parentRuleId, child));
  return { project: nextProject, rule: child };
}

export function duplicateRuleInState(project, stateId, ruleId) {
  return updateStateRules(project, stateId, (rules) => duplicateRule(rules, ruleId));
}

export function deleteRuleInState(project, stateId, ruleId) {
  return updateStateRules(project, stateId, (rules) => deleteRule(rules, ruleId));
}

export function moveRuleInState(project, stateId, ruleId, direction) {
  return updateStateRules(project, stateId, (rules) => moveRule(rules, ruleId, direction));
}

export function indentRuleInState(project, stateId, ruleId) {
  return updateStateRules(project, stateId, (rules) => indentRule(rules, ruleId));
}

export function outdentRuleInState(project, stateId, ruleId) {
  return updateStateRules(project, stateId, (rules) => outdentRule(rules, ruleId));
}

export function addAudioToState(project, stateId) {
  const audio = {
    id: makeUuid('audio'),
    fileName: 'NovoPrompt_INI',
    text: '',
    context: '',
    development: '',
    bi: '',
    sourceRow: null,
  };
  const state = project.states.find((item) => item.id === stateId);
  if (!state) return { project, audio: null };
  return {
    project: updateState(project, stateId, { audioCatalog: [...state.audioCatalog, audio] }),
    audio,
  };
}

export function updateAudioInState(project, stateId, audioId, patch) {
  const state = project.states.find((item) => item.id === stateId);
  if (!state) return project;
  const audioCatalog = state.audioCatalog.map((audio) => (
    audio.id === audioId ? { ...audio, ...patch } : audio
  ));
  return updateState(project, stateId, { audioCatalog });
}

export function deleteAudioInState(project, stateId, audioId) {
  const state = project.states.find((item) => item.id === stateId);
  if (!state) return project;
  return updateState(project, stateId, {
    audioCatalog: state.audioCatalog.filter((audio) => audio.id !== audioId),
  });
}

export function flattenVisibleRules(rules, expandedIds = new Set()) {
  const visible = [];
  const visit = (items, depth, parentId = null) => {
    items.forEach((rule, index) => {
      visible.push({
        rule,
        depth,
        parentId,
        siblingIndex: index,
        siblingCount: items.length,
        hasChildren: Boolean(rule.children?.length),
      });
      if (rule.children?.length && expandedIds.has(rule.id)) {
        visit(rule.children, depth + 1, rule.id);
      }
    });
  };
  visit(rules ?? [], 0);
  return visible;
}

export function collectRuleIds(rules) {
  const ids = [];
  walkRules(rules, (rule) => ids.push(rule.id));
  return ids;
}

export function collectPromptUsage(state) {
  const usage = new Map();
  walkRules(state?.rules ?? [], (rule) => {
    const key = normalizeKey(rule.prompt);
    if (!key) return;
    usage.set(key, (usage.get(key) ?? 0) + 1);
  });
  return usage;
}

export function validateProject(project) {
  const issues = [];
  const states = project?.states ?? [];
  const stateByKey = new Map();

  states.forEach((state) => {
    const key = normalizeKey(state.name);
    if (!key) {
      issues.push(makeIssue('error', 'state-empty-name', 'Estado sem nome.', state.id));
      return;
    }
    if (stateByKey.has(key)) {
      issues.push(makeIssue('error', 'state-duplicate', `Nome de estado duplicado: ${state.name}.`, state.id));
    } else {
      stateByKey.set(key, state);
    }
  });

  states.forEach((state) => {
    if (!(state.rules ?? []).length) {
      issues.push(makeIssue('warning', 'state-empty', `O estado ${state.name} não possui regras.`, state.id));
    }

    const promptCatalog = new Set((state.audioCatalog ?? []).map((audio) => normalizeKey(audio.fileName)).filter(Boolean));
    const referencedPrompts = new Set();

    walkRules(state.rules, (rule, context) => {
      const result = String(rule.result || '').trim();
      const destination = String(rule.destination || '').trim();
      const prompt = String(rule.prompt || '').trim();

      if (!result && !destination && !prompt) {
        issues.push(makeIssue('error', 'rule-empty', 'Regra sem resultado, destino ou prompt.', state.id, rule.id));
      }

      if (rule.children?.length === 0 && !destination && rule.branchType !== 'DIRECTIVE') {
        issues.push(makeIssue('warning', 'rule-dangling', `A regra “${result || 'sem texto'}” não possui filhos nem destino.`, state.id, rule.id));
      }

      if (destination && !isKnownExternalDestination(destination) && !stateByKey.has(normalizeKey(destination))) {
        issues.push(makeIssue('error', 'destination-missing', `Destino não encontrado: ${destination}.`, state.id, rule.id));
      }

      if (prompt) {
        const promptKey = normalizeKey(prompt);
        referencedPrompts.add(promptKey);
        if (promptCatalog.size && !promptCatalog.has(promptKey)) {
          issues.push(makeIssue('warning', 'prompt-missing', `Prompt não cadastrado no estado: ${prompt}.`, state.id, rule.id));
        }
      }

      if (context.depth > 14) {
        issues.push(makeIssue('warning', 'rule-depth', `A regra “${result || rule.id}” possui profundidade elevada (${context.depth}).`, state.id, rule.id));
      }
    });

    (state.audioCatalog ?? []).forEach((audio) => {
      const key = normalizeKey(audio.fileName);
      if (key && !referencedPrompts.has(key)) {
        issues.push(makeIssue('info', 'prompt-unused', `Prompt cadastrado e não utilizado: ${audio.fileName}.`, state.id, null, audio.id));
      }
    });
  });

  const counts = issues.reduce((result, issue) => {
    result[issue.severity] = (result[issue.severity] ?? 0) + 1;
    return result;
  }, { error: 0, warning: 0, info: 0 });

  return {
    issues,
    counts,
    isValid: counts.error === 0,
  };
}

export function projectToParsedData(project) {
  const validation = validateProject(project);
  const states = (project?.states ?? []).map((state) => {
    const transitions = [];
    let fallbackRow = 1;

    const convert = (rules, parentPath = [], depth = 0) => rules.map((rule) => {
      const rowNumber = Number(rule.sourceRow) || fallbackRow++;
      const ruleText = String(rule.result || '').trim();
      const path = ruleText ? [...parentPath, ruleText] : [...parentPath];
      const hasTransitionData = Boolean(rule.destination || rule.prompt || rule.observation || rule.bi);
      let transitionId = '';

      if (hasTransitionData) {
        transitionId = rule.id;
        const bi = parseBiMarking(rule.bi);
        transitions.push({
          id: rule.id,
          from: state.name,
          to: rule.destination || '',
          conditions: path,
          prompt: rule.prompt || '',
          observation: rule.observation || '',
          bi: rule.bi || '',
          biCode: bi.code,
          biDescription: bi.description,
          hasBiMarking: bi.hasBiMarking,
          changeColor: '',
          hasChangeColor: false,
          sheetName: state.name,
          rowNumber,
        });
      }

      return {
        id: rule.id,
        text: ruleText || branchLabel(rule.branchType),
        level: depth,
        rawLevel: depth,
        branchKey: `${depth}:${rule.branchType}`,
        branchValue: branchLabel(rule.branchType),
        rowNumber,
        destination: rule.destination || '',
        prompt: rule.prompt || '',
        observation: rule.observation || '',
        bi: rule.bi || '',
        audio: '',
        scriptpoint: '',
        nextStep: '',
        transferCode: '',
        changeColor: '',
        hasChangeColor: false,
        isDirective: rule.branchType === 'DIRECTIVE',
        transitionId,
        path,
        pathNodeIds: [],
        children: convert(rule.children ?? [], path, depth + 1),
      };
    });

    return {
      id: state.id,
      label: state.name,
      sheetName: state.name,
      transitions,
      decisionTree: convert(state.rules ?? []),
      audioCatalog: state.audioCatalog ?? [],
    };
  });

  return {
    fileName: project?.sourceFileName || `${project?.name || 'URA'}.json`,
    sheetNames: states.map((state) => state.sheetName),
    states,
    diagnostics: {
      warnings: validation.issues.map((issue) => ({
        type: issue.code,
        severity: issue.severity,
        sheetName: states.find((state) => state.id === issue.stateId)?.sheetName || '',
        rowNumber: null,
        message: issue.message,
      })),
      summary: validation.counts,
    },
  };
}

export function touchProject(project) {
  return {
    ...project,
    updatedAt: new Date().toISOString(),
  };
}

export function normalizeKey(value) {
  return String(value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function convertDecisionNodes({ nodes, transitionById, usedTransitionIds, usedRows, stateName, parentSeed }) {
  return (nodes ?? []).map((node, nodeIndex, siblings) => {
    const transition = node.transitionId
      ? transitionById.get(node.transitionId)
      : [...transitionById.values()].find((candidate) => Number(candidate.rowNumber) === Number(node.rowNumber));

    if (transition?.id) usedTransitionIds.add(transition.id);
    if (node.rowNumber) usedRows.add(Number(node.rowNumber));

    const children = convertDecisionNodes({
      nodes: node.children ?? [],
      transitionById,
      usedTransitionIds,
      usedRows,
      stateName,
      parentSeed: `${parentSeed}-${nodeIndex}`,
    });

    return makeRule({
      id: node.id || stableId('rule', stateName, node.rowNumber || parentSeed, node.text),
      result: node.text || '',
      branchType: inferBranchType(node, nodeIndex, siblings),
      destination: node.destination || transition?.to || '',
      prompt: node.prompt || transition?.prompt || '',
      observation: node.observation || transition?.observation || '',
      bi: node.bi || transition?.bi || '',
      sourceRow: node.rowNumber || transition?.rowNumber || null,
      children,
      imported: true,
      confidence: node.rawLevel === undefined ? 'medium' : 'high',
    });
  });
}

function inferBranchType(node, index, siblings) {
  const text = normalizeKey(node?.text);
  const branchValue = normalizeKey(node?.branchValue);
  if (node?.isDirective) return 'DIRECTIVE';
  if (/^(senao|else|caso contrario|default|demais|outros)$/.test(text) || /^(nao|false|else|default|demais|outros)$/.test(branchValue)) return 'ELSE';
  if (/^(senao se|else if)/.test(text)) return 'ELSE_IF';
  if ((node?.children?.length ?? 0) > 0) return index === 0 ? 'IF' : 'ELSE_IF';
  if ((siblings?.length ?? 0) > 1 || node?.level > 0) return 'CASE';
  return node?.destination ? 'ACTION' : 'IF';
}

function inferLeafBranchType(transition, index) {
  const result = normalizeKey(transition?.conditions?.at(-1));
  if (/^(nao|false|senao|else|default|demais|outros)$/.test(result)) return 'ELSE';
  return index === 0 && !(transition?.conditions?.length) ? 'ACTION' : 'CASE';
}

function inferFallbackResult(transition, index) {
  if (transition?.to) return index === 0 ? 'Fluxo padrão' : `Resultado ${index + 1}`;
  return `Regra ${index + 1}`;
}

function makeRule({
  id,
  result,
  branchType,
  destination,
  prompt,
  observation,
  bi,
  sourceRow,
  children = [],
  imported,
  confidence,
}) {
  return {
    id: id || makeUuid('rule'),
    result: result || '',
    branchType: BRANCH_TYPES.has(branchType) ? branchType : 'IF',
    destination: destination || '',
    prompt: prompt || '',
    observation: observation || '',
    bi: bi || '',
    sourceRow: sourceRow || null,
    children: children ?? [],
    metadata: {
      imported: Boolean(imported),
      modified: !imported,
      confidence: confidence || 'high',
    },
  };
}

function updateStateRules(project, stateId, updater) {
  const state = project.states.find((item) => item.id === stateId);
  if (!state) return project;
  return updateState(project, stateId, { rules: updater(state.rules ?? []) });
}

function updateRule(rules, ruleId, patch) {
  return (rules ?? []).map((rule) => {
    if (rule.id === ruleId) {
      return {
        ...rule,
        ...patch,
        metadata: { ...rule.metadata, modified: true },
      };
    }
    if (!rule.children?.length) return rule;
    return { ...rule, children: updateRule(rule.children, ruleId, patch) };
  });
}

function addChildRule(rules, parentRuleId, child) {
  return (rules ?? []).map((rule) => {
    if (rule.id === parentRuleId) {
      return {
        ...rule,
        children: [...(rule.children ?? []), child],
        metadata: { ...rule.metadata, modified: true },
      };
    }
    return { ...rule, children: addChildRule(rule.children ?? [], parentRuleId, child) };
  });
}

function deleteRule(rules, ruleId) {
  return (rules ?? [])
    .filter((rule) => rule.id !== ruleId)
    .map((rule) => ({ ...rule, children: deleteRule(rule.children ?? [], ruleId) }));
}

function duplicateRule(rules, ruleId) {
  const draft = clone(rules ?? []);
  const location = findRuleLocation(draft, ruleId);
  if (!location) return rules;
  const duplicated = cloneRuleWithNewIds(location.container[location.index]);
  location.container.splice(location.index + 1, 0, duplicated);
  return draft;
}

function moveRule(rules, ruleId, direction) {
  const draft = clone(rules ?? []);
  const location = findRuleLocation(draft, ruleId);
  if (!location) return rules;
  const nextIndex = direction === 'up' ? location.index - 1 : location.index + 1;
  if (nextIndex < 0 || nextIndex >= location.container.length) return rules;
  const [item] = location.container.splice(location.index, 1);
  location.container.splice(nextIndex, 0, item);
  return draft;
}

function indentRule(rules, ruleId) {
  const draft = clone(rules ?? []);
  const location = findRuleLocation(draft, ruleId);
  if (!location || location.index <= 0) return rules;
  const previousSibling = location.container[location.index - 1];
  const [item] = location.container.splice(location.index, 1);
  previousSibling.children = [...(previousSibling.children ?? []), item];
  previousSibling.metadata = { ...previousSibling.metadata, modified: true };
  return draft;
}

function outdentRule(rules, ruleId) {
  const draft = clone(rules ?? []);
  const location = findRuleLocation(draft, ruleId);
  if (!location?.parentRule || !location.parentContainer) return rules;
  const [item] = location.container.splice(location.index, 1);
  const parentIndex = location.parentContainer.findIndex((candidate) => candidate.id === location.parentRule.id);
  if (parentIndex < 0) return rules;
  location.parentContainer.splice(parentIndex + 1, 0, item);
  return draft;
}

function findRuleLocation(rules, ruleId, parentRule = null, parentContainer = null) {
  for (let index = 0; index < rules.length; index += 1) {
    const rule = rules[index];
    if (rule.id === ruleId) {
      return { container: rules, index, rule, parentRule, parentContainer };
    }
    const child = findRuleLocation(rule.children ?? [], ruleId, rule, rules);
    if (child) return child;
  }
  return null;
}

function mapRuleTree(rules, mapper) {
  return (rules ?? []).map((rule) => {
    const mapped = mapper(rule);
    return {
      ...mapped,
      children: mapRuleTree(mapped.children ?? [], mapper),
    };
  });
}

function walkRules(rules, visitor, depth = 0, parent = null) {
  (rules ?? []).forEach((rule, index) => {
    visitor(rule, { depth, parent, index, siblings: rules });
    walkRules(rule.children ?? [], visitor, depth + 1, rule);
  });
}

function cloneRuleTreeWithNewIds(rules) {
  return (rules ?? []).map(cloneRuleWithNewIds);
}

function cloneRuleWithNewIds(rule) {
  return {
    ...clone(rule),
    id: makeUuid('rule'),
    children: (rule.children ?? []).map(cloneRuleWithNewIds),
    metadata: { imported: false, modified: true, confidence: rule.metadata?.confidence || 'high' },
  };
}

function makeUniqueStateName(states, requestedName) {
  const base = String(requestedName || 'NovoEstado').trim() || 'NovoEstado';
  const existing = new Set(states.map((state) => normalizeKey(state.name)));
  if (!existing.has(normalizeKey(base))) return base;
  let suffix = 2;
  while (existing.has(normalizeKey(`${base}_${suffix}`))) suffix += 1;
  return `${base}_${suffix}`;
}

function isKnownExternalDestination(destination) {
  const key = normalizeKey(destination);
  if (!key) return true;
  return [
    'tchau',
    'fim',
    'finaliza',
    'finalizar',
    'encerra',
    'encerrar',
    'ath',
    'atendimento',
    'transferencia',
    'transfere',
    'hangup',
    'return',
    'externo',
  ].some((token) => key === token || key.startsWith(`${token} `) || key.includes(` ${token} `));
}

function makeIssue(severity, code, message, stateId = null, ruleId = null, audioId = null) {
  return {
    id: makeUuid('issue'),
    severity,
    code,
    message,
    stateId,
    ruleId,
    audioId,
  };
}

function parseBiMarking(value) {
  const text = String(value || '').trim();
  if (!text) return { code: '', description: '', hasBiMarking: false };
  const match = text.match(/^(\d+)\s*[-–:]?\s*(.*)$/);
  if (!match) return { code: '', description: text, hasBiMarking: true };
  return { code: match[1], description: match[2] || '', hasBiMarking: true };
}

function branchLabel(type) {
  const labels = {
    IF: 'IF',
    ELSE_IF: 'ELSE IF',
    ELSE: 'ELSE',
    CASE: 'CASO',
    ACTION: 'AÇÃO',
    DIRECTIVE: 'DIRETIVA',
  };
  return labels[type] || type || 'REGRA';
}

function stripExtension(fileName) {
  return String(fileName || '').replace(/\.[^.]+$/, '');
}

function stableId(prefix, ...parts) {
  const raw = parts.map((part) => normalizeKey(part)).filter(Boolean).join('-');
  return `${prefix}-${raw || Math.random().toString(36).slice(2, 9)}`;
}

function makeUuid(prefix) {
  const value = globalThis.crypto?.randomUUID?.()
    || `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
  return `${prefix}-${value}`;
}

function clone(value) {
  if (typeof structuredClone === 'function') return structuredClone(value);
  return JSON.parse(JSON.stringify(value));
}

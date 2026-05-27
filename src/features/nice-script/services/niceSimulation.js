import { makeNiceEdgeId } from '../../../components/NiceScriptCanvas.jsx';
import { findDirectMenuCaseBranch, getDirectMenuCaseBranches, getDirectMenuCaseKeys } from '../../../services/niceMenuRouting.js';

export function simulateNiceFlow(script, context = {}) {
  const actions = script?.actions ?? [];
  if (!actions.length) {
    return {
      actionIds: [],
      edgeIds: [],
      reason: 'Canvas vazio para simular.',
      steps: [],
      variables: { ...(context.variables ?? {}) },
      warnings: [],
    };
  }

  const actionsById = new Map(actions.map((action) => [Number(action.actionId), action]));
  const root = actions.find((action) => action.action === 'BEGIN') ?? actions[0];
  const variables = { ...(context.variables ?? {}) };
  const nodeOutputs = context.nodeOutputs ?? {};
  const actionIds = [];
  const edgeIds = [];
  const steps = [];
  const warnings = [];
  const visited = new Set();
  let current = root;
  let reason = '';

  while (current && !visited.has(Number(current.actionId)) && actionIds.length < 80) {
    const currentId = Number(current.actionId);
    visited.add(currentId);
    actionIds.push(currentId);

    const nodeOutput = nodeOutputs[currentId] ?? {};
    const changes = applyNodeSimulationOutput(current, variables, nodeOutput, warnings);
    const next = chooseSimulationNext(current, actions, variables, nodeOutput);
    getNodeSimulationWarnings(current, variables, nodeOutput).forEach((message) => pushSimulationWarning(warnings, message));
    if (next?.warning) pushSimulationWarning(warnings, next.warning);
    steps.push({
      actionId: currentId,
      action: current.action,
      caption: current.caption,
      branchLabel: next?.label ?? '',
      changes,
    });

    if (!next?.branch || Number(next.branch.actionId) <= 0) {
      if (next?.reason) reason = next.reason;
      break;
    }

    const target = actionsById.get(Number(next.branch.actionId));
    if (!target) {
      reason = `${current.caption}: destino #${next.branch.actionId} nao existe.`;
      break;
    }

    edgeIds.push(makeNiceEdgeId(current.actionId, next.branch.actionId, next.label, next.branch.index));
    current = target;
  }

  if (current && visited.has(Number(current.actionId)) && !reason) {
    reason = `Simulacao parou para evitar loop no node #${current.actionId}.`;
  }

  if (!variables.NEXT_STEP && steps.some((step) => step.action === 'RUNSCRIPT')) {
    warnings.push('RUNSCRIPT encontrado, mas NEXT_STEP simulado esta vazio.');
  }

  return { actionIds, edgeIds, reason, steps, variables, warnings };
}

function chooseSimulationNext(action, actions, variables, nodeOutput = {}) {
  if (action.action === 'IF') {
    const wanted = String(nodeOutput.branch || 'True').toLowerCase();
    const branch = (action.branches ?? []).find((item) => normalizeBranchText(item.text) === wanted);
    return branch ? edgeChoice(branch, branch.text || capitalize(wanted)) : { reason: `${action.caption}: branch ${nodeOutput.branch || 'True'} nao configurada.` };
  }

  if (action.action === 'MENU') {
    const isTimeout = nodeOutput.mode === 'timeout';
    if (isTimeout) {
      const branch = (action.branches ?? []).find((item) => /timeout/i.test(item.text));
      const label = branch?.text || 'Timeout';
      return branch ? edgeChoice(branch, label) : { reason: `${action.caption}: saida de Timeout nao configurada.` };
    }

    const directCases = getDirectMenuCaseBranches(action);
    if (directCases.length) {
      const responseVariable = action.parameters?.[7] || 'MRES';
      const responseValue = variables[responseVariable] ?? variables.MRES ?? variables.mres ?? '';
      const branch = findDirectMenuCaseBranch(action, responseValue);
      if (branch) return edgeChoice(branch, branch.text || 'Case');
      const warning = responseValue ? `${action.caption}: ${responseVariable} "${responseValue}" nao existe nos CaseBranches.` : '';
      return action.defaultNextAction
        ? edgeChoice(action.defaultNextAction, 'Default', warning)
        : { reason: `${action.caption}: MENU sem CaseBranch ${responseValue || '(vazio)'} e sem default.`, warning };
    }

    const branch = action.defaultNextAction;
    const label = 'Default';
    return branch ? edgeChoice(branch, label) : { reason: `${action.caption}: saida de MENU nao configurada.` };
  }

  if (action.action === 'LOCATE') {
    const mask = findMenuMask(actions);
    const responseValue = variables.MRES ?? variables.mres ?? '';
    const forced = nodeOutput.branch && nodeOutput.branch !== 'auto' ? nodeOutput.branch : '';
    const found = forced
      ? forced === 'Found'
      : Boolean(responseValue) && mask.includes(String(responseValue));
    const branch = found
      ? (action.branches ?? []).find((item) => /found/i.test(item.text))
      : action.defaultNextAction;
    let warning = '';
    if (!forced && !responseValue) {
      warning = `${action.caption}: MRES ainda nao foi definido; LOCATE seguira Default.`;
    } else if (!found && responseValue && mask.length > 0) {
      warning = `${action.caption}: MRES "${responseValue}" nao esta na mascara ${mask.join('-')}.`;
    }
    return branch ? edgeChoice(branch, found ? (branch.text || 'Found') : 'Default', warning) : { reason: `${action.caption}: saida de LOCATE nao configurada.`, warning };
  }

  if (action.action === 'CASE') {
    const value = String(nodeOutput.value && nodeOutput.value !== '__default__' ? nodeOutput.value : variables.MRES ?? '').trim();
    const caseBranch = (action.cases ?? []).find((item) => String(item.text).trim() === value);
    if (caseBranch) return edgeChoice(caseBranch, caseBranch.text || 'Case');
    const warning = value ? '' : `${action.caption}: MRES ainda nao foi definido; CASE seguira Default.`;
    return action.defaultNextAction
      ? edgeChoice(action.defaultNextAction, 'Default', warning)
      : { reason: `${action.caption}: CASE sem opcao ${value || '(vazia)'} e sem default.`, warning };
  }

  if (action.action === 'LOOP') {
    const wanted = nodeOutput.branch || 'Finished';
    const branch = (action.branches ?? []).find((item) => normalizeBranchText(item.text) === wanted.toLowerCase()) ?? action.branches?.[0];
    return branch ? edgeChoice(branch, branch.text || wanted) : { reason: `${action.caption}: LOOP sem branch para simular.` };
  }

  if (action.action === 'RUNSUB') {
    return action.defaultNextAction
      ? edgeChoice(action.defaultNextAction, 'Default')
      : { reason: `${action.caption}: RUNSUB finalizou sem proxima action.` };
  }

  if (action.defaultNextAction) return edgeChoice(action.defaultNextAction, 'Default');
  return { reason: `${action.caption}: fim do caminho simulado.` };
}

function applyNodeSimulationOutput(action, variables, nodeOutput = {}, warnings = []) {
  if (action.action === 'MENU') {
    const responseVariable = action.parameters?.[7] || 'MRES';
    if (nodeOutput.mode === 'timeout') {
      variables[responseVariable] = '';
      return [{ name: responseVariable, value: '' }];
    }
    const value = nodeOutput.mode === 'custom'
      ? nodeOutput.customValue ?? nodeOutput.value ?? ''
      : nodeOutput.mode === 'value'
        ? nodeOutput.value ?? ''
        : variables[responseVariable] ?? variables.MRES ?? '';
    variables[responseVariable] = value;
    return [{ name: responseVariable, value }];
  }

  if (action.action === 'RUNSUB') {
    const name = nodeOutput.returnVariable || 'api_RET';
    const value = nodeOutput.returnValue ?? variables[name] ?? '';
    variables[name] = value;
    return [{ name, value }];
  }

  if (action.action === 'SNIPPET') {
    return applyAssignments(
      variables,
      extractSimulationAssignmentsForCode(action.parameters?.[0] ?? '', variables, warnings, action),
    );
  }

  if (action.action === 'ASSIGN') {
    return applyAssignments(variables, extractAssignAction(action));
  }

  return [];
}

function applyAssignments(variables, assignments) {
  const changes = [];
  assignments.forEach((assignment) => {
    const value = normalizeSimulationAssignmentValue(assignment.name, resolveSimulationValue(assignment.value, variables));
    variables[assignment.name] = value;
    changes.push({ ...assignment, value });

    if (isScriptpointVariable(assignment.name) && value !== '') {
      const nextPath = appendSimulationScriptpoint(variables.scriptpoint_path, value);
      variables.scriptpoint_path = nextPath;
      changes.push({ name: 'scriptpoint_path', value: nextPath });
    }
  });
  return changes;
}

function getNodeSimulationWarnings(action, variables, nodeOutput = {}) {
  if (action.action === 'RUNSUB') {
    const name = nodeOutput.returnVariable || 'api_RET';
    const value = variables[name] ?? '';
    if (!value) return [`${action.caption}: retorno ${name} ainda nao foi preenchido no node.`];
  }
  return [];
}

function pushSimulationWarning(warnings, message) {
  if (message && !warnings.includes(message)) warnings.push(message);
}

function edgeChoice(branch, label, warning = '') {
  return { branch, label, warning };
}

function findMenuMask(actions) {
  const configCode = actions.find((action) => action.caption === 'CONFIG_MENU')?.parameters?.[0] ?? '';
  const mask = configCode.match(/ASSIGN\s+MASCARA\s*=\s*"([^"]+)"/i)?.[1] ?? '';
  return mask.split('-').map((item) => item.trim()).filter(Boolean);
}

export function getMenuMaskOptions(actions, menu = null) {
  const mask = findMenuMask(actions);
  if (mask.length > 0) return mask;
  const directMenuOptions = getDirectMenuCaseKeys(menu);
  if (directMenuOptions.length > 0) return [...new Set(directMenuOptions)];
  const caseOptions = actions
    .flatMap((action) => action.cases ?? [])
    .map((item) => String(item.text ?? '').trim())
    .filter(Boolean);
  return [...new Set(caseOptions.length > 0 ? caseOptions : ['1', '2'])];
}

export function extractSnippetAssignments(code) {
  const assignments = [];
  const pattern = /^\s*ASSIGN\s+([A-Za-z_][\w:]*|global:[A-Za-z_][\w:]*)\s*=\s*(.+?)\s*$/gim;
  for (const match of code.matchAll(pattern)) {
    assignments.push({
      name: match[1],
      value: cleanSimulationValue(match[2]),
    });
  }
  return assignments;
}

function extractSimulationAssignmentsForCode(code, variables, warnings, action) {
  const cleanCode = stripNiceLineComments(code);
  const workingVariables = { ...variables };
  return collectSimulationAssignmentsFromBlock(cleanCode, workingVariables, warnings, action?.caption || 'Snippet');
}

function collectSimulationAssignmentsFromBlock(code, variables, warnings, caption) {
  const assignments = [];
  let cursor = 0;
  const controlPattern = /\b(SWITCH|SELECT|IF)\b/gi;

  while (cursor < code.length) {
    controlPattern.lastIndex = cursor;
    const match = controlPattern.exec(code);
    if (!match) {
      const finalAssignments = extractPlainSimulationAssignments(code.slice(cursor));
      assignments.push(...finalAssignments);
      previewSimulationAssignments(variables, finalAssignments);
      break;
    }

    const plainAssignments = extractPlainSimulationAssignments(code.slice(cursor, match.index));
    assignments.push(...plainAssignments);
    previewSimulationAssignments(variables, plainAssignments);
    const keyword = match[1].toUpperCase();

    if (keyword === 'IF') {
      const parsedIf = parseNiceIfBlock(code, match.index);
      if (!parsedIf) {
        assignments.push(...extractPlainSimulationAssignments(code.slice(match.index, controlPattern.lastIndex)));
        cursor = controlPattern.lastIndex;
        continue;
      }

      const conditionResult = evaluateSimulationExpression(parsedIf.condition, variables);
      if (conditionResult.value === null) {
        pushSimulationWarning(
          warnings,
          `${caption}: condicao "${shortenSimulationText(parsedIf.condition, 80)}" nao pode ser avaliada; simulacao seguiu pelo True.`,
        );
      }
      const selectedBlock = conditionResult.value === false ? parsedIf.falseBlock : parsedIf.trueBlock;
      assignments.push(...collectSimulationAssignmentsFromBlock(selectedBlock, variables, warnings, caption));
      cursor = parsedIf.end;
      continue;
    }

    const parsedSelection = parseNiceSelectionBlock(code, match.index, keyword);
    if (!parsedSelection) {
      assignments.push(...extractPlainSimulationAssignments(code.slice(match.index, controlPattern.lastIndex)));
      cursor = controlPattern.lastIndex;
      continue;
    }

    const selectedBlock = keyword === 'SWITCH'
      ? pickSwitchCaseBlock(parsedSelection, variables, warnings, caption)
      : pickSelectCaseBlock(parsedSelection, variables);
    assignments.push(...collectSimulationAssignmentsFromBlock(selectedBlock, variables, warnings, caption));
    cursor = parsedSelection.end;
  }

  return assignments;
}

function previewSimulationAssignments(variables, assignments) {
  assignments.forEach((assignment) => {
    variables[assignment.name] = normalizeSimulationAssignmentValue(assignment.name, resolveSimulationValue(assignment.value, variables));
  });
}

function extractPlainSimulationAssignments(code) {
  const assignments = [];
  const pattern = /^\s*(?:ASSIGN\s+)?((?:global:)?[A-Za-z_][\w:.\[\]$]*)\s*=\s*(.+?)\s*$/gim;
  for (const match of code.matchAll(pattern)) {
    const name = match[1].trim();
    if (/^(IF|CASE|DEFAULT|ELSE|SWITCH|SELECT|FOR)$/i.test(name)) continue;
    assignments.push({
      name,
      value: cleanSimulationValue(match[2]),
    });
  }
  return assignments;
}

function parseNiceSelectionBlock(code, startIndex, keyword) {
  const openIndex = findNextCharOutsideQuotes(code, '{', startIndex);
  if (openIndex < 0) return null;
  const closeIndex = findMatchingBraceIndex(code, openIndex);
  if (closeIndex < 0) return null;
  const header = code.slice(startIndex + keyword.length, openIndex).trim();
  return {
    keyword,
    variable: header,
    cases: parseNiceCaseBlocks(code.slice(openIndex + 1, closeIndex)),
    end: closeIndex + 1,
  };
}

function parseNiceCaseBlocks(body) {
  const cases = [];
  const casePattern = /\b(CASE|DEFAULT)\b/gi;
  let match;

  while ((match = casePattern.exec(body))) {
    const keyword = match[1].toUpperCase();
    const openIndex = findNextCharOutsideQuotes(body, '{', casePattern.lastIndex);
    if (openIndex < 0) continue;
    const closeIndex = findMatchingBraceIndex(body, openIndex);
    if (closeIndex < 0) continue;
    const expression = body.slice(casePattern.lastIndex, openIndex).trim();
    cases.push({
      keyword,
      expression,
      value: keyword === 'CASE' ? cleanSimulationValue(expression) : 'DEFAULT',
      block: body.slice(openIndex + 1, closeIndex),
    });
    casePattern.lastIndex = closeIndex + 1;
  }

  return cases;
}

function pickSwitchCaseBlock(selection, variables, warnings, caption) {
  const variableName = cleanSimulationValue(selection.variable);
  const switchValue = getSimulationVariableValue(variables, variableName);
  const normalizedValue = String(switchValue ?? '').trim();
  const selectedCase = selection.cases.find((item) => (
    item.keyword === 'CASE' && String(item.value).trim().toLowerCase() === normalizedValue.toLowerCase()
  ));
  if (selectedCase) return selectedCase.block;

  const defaultCase = selection.cases.find((item) => item.keyword === 'DEFAULT');
  if (defaultCase) return defaultCase.block;

  pushSimulationWarning(
    warnings,
    `${caption}: SWITCH ${variableName || '(sem variavel)'} nao encontrou CASE para "${normalizedValue || 'vazio'}".`,
  );
  return '';
}

function pickSelectCaseBlock(selection, variables) {
  for (const item of selection.cases) {
    if (item.keyword === 'DEFAULT') continue;
    const result = evaluateSimulationExpression(item.expression, variables);
    if (result.value === true) return item.block;
  }
  return selection.cases.find((item) => item.keyword === 'DEFAULT')?.block ?? '';
}

function parseNiceIfBlock(code, startIndex) {
  const openIndex = findNextCharOutsideQuotes(code, '{', startIndex);
  if (openIndex < 0) return null;
  const closeIndex = findMatchingBraceIndex(code, openIndex);
  if (closeIndex < 0) return null;

  const condition = code.slice(startIndex + 2, openIndex).trim();
  let end = closeIndex + 1;
  let falseBlock = '';
  const afterTrue = skipWhitespace(code, end);

  if (/^ELSE\b/i.test(code.slice(afterTrue))) {
    const elseContentStart = skipWhitespace(code, afterTrue + 4);
    if (/^IF\b/i.test(code.slice(elseContentStart))) {
      const parsedElseIf = parseNiceIfBlock(code, elseContentStart);
      if (parsedElseIf) {
        falseBlock = code.slice(elseContentStart, parsedElseIf.end);
        end = parsedElseIf.end;
      }
    } else {
      const elseOpenIndex = findNextCharOutsideQuotes(code, '{', elseContentStart);
      if (elseOpenIndex >= 0) {
        const elseCloseIndex = findMatchingBraceIndex(code, elseOpenIndex);
        if (elseCloseIndex >= 0) {
          falseBlock = code.slice(elseOpenIndex + 1, elseCloseIndex);
          end = elseCloseIndex + 1;
        }
      }
    }
  }

  return {
    condition,
    trueBlock: code.slice(openIndex + 1, closeIndex),
    falseBlock,
    end,
  };
}

function evaluateSimulationExpression(expression, variables) {
  const text = trimOuterParentheses(String(expression ?? '').trim());
  if (!text) return { value: null };

  const orParts = splitSimulationExpression(text, /\|\||\|/);
  if (orParts.length > 1) {
    let hasUnknown = false;
    for (const part of orParts) {
      const result = evaluateSimulationExpression(part, variables);
      if (result.value === true) return { value: true };
      if (result.value === null) hasUnknown = true;
    }
    return { value: hasUnknown ? null : false };
  }

  const andParts = splitSimulationExpression(text, /&&|&/);
  if (andParts.length > 1) {
    let hasUnknown = false;
    for (const part of andParts) {
      const result = evaluateSimulationExpression(part, variables);
      if (result.value === false) return { value: false };
      if (result.value === null) hasUnknown = true;
    }
    return { value: hasUnknown ? null : true };
  }

  const containsMatch = text.match(/^(.+?)\.contains\((.+)\)$/i);
  if (containsMatch) {
    const source = getSimulationVariableValue(variables, containsMatch[1].trim());
    const needle = resolveSimulationExpressionValue(containsMatch[2].trim(), variables);
    if (source === undefined || needle === undefined) return { value: null };
    return { value: String(source).includes(String(needle)) };
  }

  const comparison = text.match(/^(.+?)\s*(==|=|!=|<>)\s*(.+)$/);
  if (comparison) {
    const leftUsesUpper = /\.upper\(\)$/i.test(comparison[1]);
    const rightUsesUpper = /\.upper\(\)$/i.test(comparison[3]);
    const left = getSimulationVariableValue(variables, comparison[1].replace(/\.upper\(\)$/i, '').trim());
    const right = resolveSimulationComparisonValue(comparison[3].replace(/\.upper\(\)$/i, '').trim(), variables);
    if (left === undefined || right === undefined) return { value: null };
    const normalizeUpper = leftUsesUpper || rightUsesUpper;
    const leftText = normalizeUpper ? String(left).toUpperCase() : String(left);
    const rightText = normalizeUpper ? String(right).toUpperCase() : String(right);
    const isEqual = leftText === rightText;
    return { value: comparison[2] === '!=' || comparison[2] === '<>' ? !isEqual : isEqual };
  }

  const booleanValue = getSimulationVariableValue(variables, text);
  if (booleanValue === undefined) return { value: null };
  return { value: coerceSimulationBoolean(booleanValue) };
}

function splitSimulationExpression(expression, delimiterPattern) {
  const parts = [];
  let quote = '';
  let depth = 0;
  let start = 0;

  for (let index = 0; index < expression.length; index += 1) {
    const char = expression[index];
    if (quote) {
      if (char === quote) quote = '';
      continue;
    }
    if (char === '"' || char === "'") {
      quote = char;
      continue;
    }
    if (char === '(') depth += 1;
    if (char === ')') depth = Math.max(0, depth - 1);
    if (depth === 0) {
      const rest = expression.slice(index);
      const match = rest.match(delimiterPattern);
      if (match && match.index === 0) {
        parts.push(expression.slice(start, index).trim());
        index += match[0].length - 1;
        start = index + 1;
      }
    }
  }

  parts.push(expression.slice(start).trim());
  return parts.filter(Boolean);
}

function resolveSimulationExpressionValue(value, variables) {
  const text = cleanSimulationValue(value);
  if (/^true$/i.test(text)) return 'true';
  if (/^false$/i.test(text)) return 'false';
  if (/^-?\d+(?:\.\d+)?$/.test(text)) return text;
  if (text.includes('{')) return resolveSimulationValue(text, variables);
  const variableValue = getSimulationVariableValue(variables, text);
  return variableValue === undefined ? text : variableValue;
}

function resolveSimulationComparisonValue(value, variables) {
  const rawText = String(value ?? '').trim();
  const text = cleanSimulationValue(rawText);
  const isQuoted = /^["'].*["']$/.test(rawText);
  if (isQuoted || /^true$/i.test(text) || /^false$/i.test(text) || /^-?\d+(?:\.\d+)?$/.test(text)) return text;
  if (text.includes('{')) return resolveSimulationValue(text, variables);
  return getSimulationVariableValue(variables, text);
}

function coerceSimulationBoolean(value) {
  const text = String(value ?? '').trim().toLowerCase();
  if (['true', 'sim', '1', 'ligado', 'ok', 'yes'].includes(text)) return true;
  if (['false', 'nao', '0', 'desligado', 'nok', 'no', ''].includes(text)) return false;
  return null;
}

function resolveSimulationValue(value, variables) {
  return String(value ?? '').replace(/\{([^}]+)\}/g, (_, variableName) => {
    const variableValue = getSimulationVariableValue(variables, variableName.trim());
    return variableValue ?? '';
  });
}

function getSimulationVariableValue(variables, variableName) {
  const cleanName = cleanSimulationValue(variableName).replace(/^\{|\}$/g, '');
  if (!cleanName) return undefined;
  if (Object.prototype.hasOwnProperty.call(variables, cleanName)) return variables[cleanName];
  const foundKey = Object.keys(variables).find((key) => key.toLowerCase() === cleanName.toLowerCase());
  return foundKey ? variables[foundKey] : undefined;
}

function normalizeSimulationAssignmentValue(name, value) {
  if (isMapaDnaVariable(name)) return normalizeScriptpointMapValue(value);
  return cleanSimulationValue(value);
}

function normalizeScriptpointMapValue(value) {
  return String(value ?? '')
    .split('|')
    .map((item) => item.trim())
    .filter(Boolean)
    .join('|');
}

function appendSimulationScriptpoint(currentPath, scriptpoint) {
  return [...normalizeScriptpointMapValue(currentPath).split('|').filter(Boolean), String(scriptpoint).trim()]
    .filter(Boolean)
    .join('|');
}

function isScriptpointVariable(name) {
  return String(name ?? '').replace(/^global:/i, '').toLowerCase() === 'scriptpoint';
}

function isMapaDnaVariable(name) {
  return ['mapa_dna', 'mapadna'].includes(String(name ?? '').replace(/^global:/i, '').toLowerCase());
}

function stripNiceLineComments(code) {
  return String(code ?? '')
    .split(/\r?\n/)
    .map(stripNiceLineComment)
    .join('\n');
}

function stripNiceLineComment(line) {
  let quote = '';
  for (let index = 0; index < line.length - 1; index += 1) {
    const char = line[index];
    if (quote) {
      if (char === quote) quote = '';
      continue;
    }
    if (char === '"' || char === "'") {
      quote = char;
      continue;
    }
    if (char === '/' && line[index + 1] === '/') return line.slice(0, index);
  }
  return line;
}

function findNextCharOutsideQuotes(text, target, startIndex = 0) {
  let quote = '';
  for (let index = startIndex; index < text.length; index += 1) {
    const char = text[index];
    if (quote) {
      if (char === quote) quote = '';
      continue;
    }
    if (char === '"' || char === "'") {
      quote = char;
      continue;
    }
    if (char === target) return index;
  }
  return -1;
}

function findMatchingBraceIndex(text, openIndex) {
  let quote = '';
  let depth = 0;
  for (let index = openIndex; index < text.length; index += 1) {
    const char = text[index];
    if (quote) {
      if (char === quote) quote = '';
      continue;
    }
    if (char === '"' || char === "'") {
      quote = char;
      continue;
    }
    if (char === '{') depth += 1;
    if (char === '}') {
      depth -= 1;
      if (depth === 0) return index;
    }
  }
  return -1;
}

function skipWhitespace(text, startIndex) {
  let index = startIndex;
  while (index < text.length && /\s/.test(text[index])) index += 1;
  return index;
}

function trimOuterParentheses(value) {
  let text = value.trim();
  while (text.startsWith('(') && text.endsWith(')')) {
    const closeIndex = findMatchingParenthesisIndex(text, 0);
    if (closeIndex !== text.length - 1) break;
    text = text.slice(1, -1).trim();
  }
  return text;
}

function findMatchingParenthesisIndex(text, openIndex) {
  let quote = '';
  let depth = 0;
  for (let index = openIndex; index < text.length; index += 1) {
    const char = text[index];
    if (quote) {
      if (char === quote) quote = '';
      continue;
    }
    if (char === '"' || char === "'") {
      quote = char;
      continue;
    }
    if (char === '(') depth += 1;
    if (char === ')') {
      depth -= 1;
      if (depth === 0) return index;
    }
  }
  return -1;
}

function shortenSimulationText(value, maxLength) {
  const text = String(value ?? '').replace(/\s+/g, ' ').trim();
  return text.length > maxLength ? `${text.slice(0, maxLength - 3)}...` : text;
}

export function extractAssignAction(action) {
  const name = action.parameters?.[0];
  if (!name) return [];
  return [{
    name,
    value: cleanSimulationValue(action.parameters?.[1] ?? ''),
  }];
}

function cleanSimulationValue(value) {
  return String(value ?? '')
    .trim()
    .replace(/^["']|["']$/g, '');
}

function normalizeBranchText(text) {
  const normalized = String(text || '').toLowerCase();
  if (normalized === 'else') return 'false';
  return normalized;
}


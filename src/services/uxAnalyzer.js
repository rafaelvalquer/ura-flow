import { classifyDestination } from '../utils/classifyDestination.js';
import { normalizeKey, normalizeText } from '../utils/normalizeText.js';

const WORDS_PER_MINUTE = 140;
const MAX_PATH_DEPTH = 24;
const MAX_PATHS = 2000;

export function buildUxAnalysis(parsedData, targetStateName = '') {
  if (!parsedData?.states?.length || !targetStateName) return emptyAnalysis(targetStateName);

  const stateByKey = new Map(parsedData.states.map((state) => [normalizeKey(state.sheetName), state]));
  const targetKey = normalizeKey(targetStateName);
  const targetState = stateByKey.get(targetKey);
  if (!targetState) return emptyAnalysis(targetStateName);

  const graph = buildNavigationGraph(parsedData);
  const reachable = collectReachableToTarget({ targetKey, graph });
  const paths = findPathsToTarget({ targetKey, graph });
  const roots = findPathRoots(paths, stateByKey);
  const nodeAnalyses = buildNodeAnalyses(parsedData, graph);
  const report = buildReport({ parsedData, graph, paths, nodeAnalyses, targetState });

  return {
    targetStateName: targetState.sheetName,
    roots: roots.map((state) => state.sheetName),
    relevantStateKeys: reachable.stateKeys,
    relevantEdges: reachable.edges,
    paths,
    nodeAnalyses,
    summary: report.summary,
    sections: report.sections,
    warnings: report.warnings,
  };
}

export function estimatePromptSeconds(prompt = '') {
  const words = normalizeText(prompt).split(/\s+/).filter(Boolean).length;
  if (!words) return 0;
  return Math.max(1, Math.round((words * 60) / WORDS_PER_MINUTE));
}

function emptyAnalysis(targetStateName = '') {
  return {
    targetStateName,
    roots: [],
    paths: [],
    nodeAnalyses: {},
    summary: {
      score: 100,
      status: 'Bom',
      averageDepth: 0,
      longestPath: 0,
      totalPaths: 0,
      criticalCount: 0,
      warningCount: 0,
    },
    sections: {
      critical: [],
      longPaths: [],
      complexMenus: [],
      longAudios: [],
      loops: [],
      deadEnds: [],
      suggestions: [],
      alerts: [],
    },
    warnings: [],
  };
}

function buildNavigationGraph(parsedData) {
  const stateKeys = new Set(parsedData.states.map((state) => normalizeKey(state.sheetName)));
  const outgoingByState = new Map();
  const incomingByState = new Map();
  const allEdges = [];

  parsedData.states.forEach((state) => {
    const edges = [];
    state.transitions.forEach((transition) => {
      const type = classifyDestination(transition.to, parsedData.sheetNames, state.sheetName);
      const targetName = type === 'self' ? state.sheetName : transition.to;
      const targetKey = normalizeKey(targetName);
      const edge = {
        id: transition.id,
        from: state.sheetName,
        fromKey: normalizeKey(state.sheetName),
        to: targetName,
        toKey: targetKey,
        type,
        transition,
        audioSeconds: estimatePromptSeconds(transition.prompt),
      };

      edges.push(edge);
      allEdges.push(edge);

      if ((type === 'state' || type === 'self') && stateKeys.has(targetKey)) {
        const incoming = incomingByState.get(targetKey) ?? [];
        incoming.push(edge);
        incomingByState.set(targetKey, incoming);
      }
    });
    outgoingByState.set(normalizeKey(state.sheetName), edges);
  });

  return { outgoingByState, incomingByState, allEdges };
}

function findPathsToTarget({ targetKey, graph }) {
  const paths = [];

  walkBackToOrigins({
    currentKey: targetKey,
    targetKey,
    graph,
    visited: [targetKey],
    backwardSteps: [],
    paths,
  });

  return dedupePaths(paths).slice(0, MAX_PATHS).map((path, index) => enrichPath(path, index));
}

function collectReachableToTarget({ targetKey, graph }) {
  const stateKeys = new Set([targetKey]);
  const edges = new Map();

  function visit(currentKey, visited) {
    const incomingEdges = (graph.incomingByState.get(currentKey) ?? [])
      .filter((edge) => edge.type === 'state' || edge.type === 'self')
      .filter((edge) => edge.fromKey !== edge.toKey);

    incomingEdges.forEach((edge) => {
      if (visited.includes(edge.fromKey)) return;
      edges.set(edge.id, edge);
      stateKeys.add(edge.fromKey);
      stateKeys.add(edge.toKey);
      visit(edge.fromKey, [...visited, edge.fromKey]);
    });
  }

  visit(targetKey, [targetKey]);
  return {
    stateKeys: [...stateKeys],
    edges: [...edges.values()],
  };
}

function walkBackToOrigins({ currentKey, targetKey, graph, visited, backwardSteps, paths }) {
  if (!currentKey || paths.length >= MAX_PATHS) return;

  if (backwardSteps.length >= MAX_PATH_DEPTH) {
    paths.push(makeForwardPath({ targetKey, backwardSteps, loopDetected: true }));
    return;
  }

  const incomingEdges = (graph.incomingByState.get(currentKey) ?? [])
    .filter((edge) => edge.type === 'state' || edge.type === 'self')
    .filter((edge) => edge.fromKey !== edge.toKey);

  if (!incomingEdges.length) {
    paths.push(makeForwardPath({ targetKey, backwardSteps, loopDetected: false }));
    return;
  }

  let expanded = false;

  incomingEdges.forEach((edge) => {
    const nextBackwardSteps = [...backwardSteps, edge];
    if (visited.includes(edge.fromKey)) {
      return;
    }

    expanded = true;
    walkBackToOrigins({
      currentKey: edge.fromKey,
      targetKey,
      graph,
      visited: [...visited, edge.fromKey],
      backwardSteps: nextBackwardSteps,
      paths,
    });
  });

  if (!expanded) {
    paths.push(makeForwardPath({ targetKey, backwardSteps, loopDetected: false }));
  }
}

function makeForwardPath({ targetKey, backwardSteps, loopDetected }) {
  const steps = [...backwardSteps].reverse();
  const states = steps.length
    ? [steps[0].fromKey, ...steps.map((edge) => edge.toKey)]
    : [targetKey];

  return {
    states,
    steps,
    loopDetected,
    deadEnd: false,
  };
}

function dedupePaths(paths) {
  const seen = new Set();
  return paths.filter((path) => {
    const key = path.steps.map((step) => step.id).join('>');
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function findPathRoots(paths, stateByKey) {
  const rootKeys = unique(paths.map((path) => path.states[0]).filter(Boolean));
  return rootKeys.map((key) => stateByKey.get(key)).filter(Boolean);
}

function enrichPath(path, index) {
  const steps = path.steps.length;
  const audioSeconds = path.steps.reduce((total, edge) => total + edge.audioSeconds, 0);
  const menuCount = new Set(path.steps.map((edge) => edge.fromKey)).size;
  const digitOptions = path.steps.filter((edge) => hasTypedOption(edge.transition)).length;
  const text = path.steps.map((edge) => [
    edge.transition?.conditions?.join(' '),
    edge.transition?.prompt,
    edge.to,
  ].filter(Boolean).join(' ')).join(' ');
  const hasBackOption = hasConcept(text, ['voltar', 'retornar', 'menu anterior']);
  const hasAgentOption = hasConcept(text, ['atendente', 'operador', 'humano', 'especialista']);
  const risk = steps > 7 || path.loopDetected || path.deadEnd
    ? 'alto'
    : steps > 5 || audioSeconds > 60 || !hasBackOption
      ? 'medio'
      : 'baixo';

  return {
    id: `ux-path-${index + 1}`,
    label: path.steps.length
      ? path.steps.map((edge) => edge.from).concat(path.steps.at(-1)?.to).filter(Boolean).join(' > ')
      : 'Alvo inicial',
    states: path.states,
    steps: path.steps,
    stepCount: steps,
    audioSeconds,
    menuCount,
    digitOptions,
    hasBackOption,
    hasAgentOption,
    loopDetected: path.loopDetected,
    deadEnd: path.deadEnd,
    risk,
  };
}

function buildNodeAnalyses(parsedData, graph) {
  return parsedData.states.reduce((items, state) => {
    const key = normalizeKey(state.sheetName);
    items[key] = analyzeStateNode(state, graph);
    return items;
  }, {});
}

function analyzeStateNode(state, graph) {
  const outgoing = graph.outgoingByState.get(normalizeKey(state.sheetName)) ?? [];
  const incoming = graph.incomingByState.get(normalizeKey(state.sheetName)) ?? [];
  const optionCount = countMenuOptions(state);
  const maxAudioSeconds = Math.max(0, ...state.transitions.map((transition) => estimatePromptSeconds(transition.prompt)));
  const combinedText = state.transitions.map((transition) => [
    transition.conditions?.join(' '),
    transition.prompt,
    transition.to,
    transition.observation,
  ].filter(Boolean).join(' ')).join(' ');
  const hasBackOption = hasConcept(combinedText, ['voltar', 'retornar', 'menu anterior']);
  const hasAgentOption = hasConcept(combinedText, ['atendente', 'operador', 'humano', 'especialista']);
  const hasRepeatOption = hasConcept(combinedText, ['repetir', 'repete', 'ouvir novamente', 'segunda via do menu']);
  const hasTimeout = hasConcept(combinedText, ['timeout', 'silencio', 'silêncio', 'no dtmf', 'sem digitar', 'nao digitou', 'não digitou']);
  const hasInvalidOption = hasConcept(combinedText, ['invalida', 'inválida', 'incorreta', 'opcao invalida', 'opção inválida', 'no match']);
  const hasLoop = outgoing.some((edge) => edge.toKey === normalizeKey(state.sheetName));
  const hasExit = outgoing.some((edge) => ['state', 'terminal', 'transfer'].includes(edge.type));
  const isMenu = optionCount > 1;
  const problems = [];
  const suggestions = [];

  if (optionCount > 5) {
    problems.push(`Menu possui ${optionCount} opcoes`);
    suggestions.push('Reduzir opcoes para no maximo 5');
    suggestions.push('Dividir opcoes por categoria');
  }
  if (maxAudioSeconds > 25) {
    problems.push(`Audio possui ${maxAudioSeconds} segundos`);
    suggestions.push('Revisar ou quebrar o prompt em mensagens menores');
  }
  if (isMenu && !hasBackOption) {
    problems.push('Nao possui opcao de voltar');
    suggestions.push('Adicionar opcao para repetir ou voltar');
  }
  if (isMenu && !hasAgentOption) suggestions.push('Criar atalho para falar com atendente');
  if (isMenu && !hasRepeatOption) suggestions.push('Adicionar opcao para repetir as opcoes');
  if (isMenu && !hasTimeout) problems.push('Nao possui tratamento de timeout');
  if (isMenu && !hasInvalidOption) problems.push('Nao possui tratamento de opcao invalida');
  if (hasLoop && !hasExit) problems.push('Pode entrar em loop sem saida');
  if (!hasExit) problems.push('Estado sem saida detectada');

  const score = clampScore(100
    - Math.max(0, optionCount - 5) * 6
    - Math.max(0, maxAudioSeconds - 25)
    - (isMenu && !hasBackOption ? 10 : 0)
    - (isMenu && !hasAgentOption ? 6 : 0)
    - (isMenu && !hasRepeatOption ? 4 : 0)
    - (isMenu && !hasTimeout ? 12 : 0)
    - (isMenu && !hasInvalidOption ? 12 : 0)
    - (hasLoop && !hasExit ? 18 : 0)
    - (!hasExit ? 18 : 0));

  return {
    stateName: state.sheetName,
    score,
    optionCount,
    maxAudioSeconds,
    hasBackOption,
    hasAgentOption,
    hasRepeatOption,
    hasTimeout,
    hasInvalidOption,
    hasLoop,
    hasExit,
    isMenu,
    problems: unique(problems),
    suggestions: unique(suggestions),
  };
}

function buildReport({ parsedData, graph, paths, nodeAnalyses, targetState }) {
  const sections = {
    critical: [],
    longPaths: [],
    complexMenus: [],
    longAudios: [],
    loops: [],
    deadEnds: [],
    suggestions: [],
    alerts: [],
  };
  const warnings = [];

  Object.values(nodeAnalyses).forEach((analysis) => {
    if (analysis.isMenu && !analysis.hasInvalidOption) addIssue(sections.critical, warnings, {
      severity: 'error',
      sheetName: analysis.stateName,
      message: `Menu "${analysis.stateName}" nao trata opcao invalida`,
      type: 'ux-missing-invalid',
    });
    if (analysis.isMenu && !analysis.hasTimeout) addIssue(sections.critical, warnings, {
      severity: 'error',
      sheetName: analysis.stateName,
      message: `Menu "${analysis.stateName}" nao trata timeout`,
      type: 'ux-missing-timeout',
    });
    if (analysis.optionCount > 5) addIssue(sections.complexMenus, warnings, {
      severity: 'warning',
      sheetName: analysis.stateName,
      message: `${analysis.stateName} possui ${analysis.optionCount} opcoes`,
      type: 'ux-complex-menu',
    });
    if (analysis.maxAudioSeconds > 25) addIssue(sections.longAudios, warnings, {
      severity: 'warning',
      sheetName: analysis.stateName,
      message: `Audio de "${analysis.stateName}" possui ${analysis.maxAudioSeconds} segundos`,
      type: 'ux-long-audio',
    });
    if (analysis.hasLoop && !analysis.hasExit) addIssue(sections.loops, warnings, {
      severity: 'error',
      sheetName: analysis.stateName,
      message: `Estado "${analysis.stateName}" pode entrar em loop sem saida`,
      type: 'ux-loop',
    });
    if (!analysis.hasExit) addIssue(sections.deadEnds, warnings, {
      severity: 'error',
      sheetName: analysis.stateName,
      message: `Estado "${analysis.stateName}" nao possui saida clara`,
      type: 'ux-dead-end',
    });
    sections.suggestions.push(...analysis.suggestions.map((message) => `${message} no menu "${analysis.stateName}"`));
  });

  paths.forEach((path) => {
    if (path.stepCount > 5) addIssue(sections.longPaths, warnings, {
      severity: 'warning',
      sheetName: targetState.sheetName,
      message: `Caminho ate "${targetState.sheetName}" possui ${path.stepCount} passos`,
      type: 'ux-long-path',
    });
    if (path.loopDetected) addIssue(sections.loops, warnings, {
      severity: 'error',
      sheetName: targetState.sheetName,
      message: `Caminho "${path.label}" encontrou loop`,
      type: 'ux-path-loop',
    });
    if (path.deadEnd) addIssue(sections.deadEnds, warnings, {
      severity: 'error',
      sheetName: targetState.sheetName,
      message: `Caminho "${path.label}" termina sem chegar ao alvo`,
      type: 'ux-path-dead-end',
    });
    if (!path.hasAgentOption) sections.suggestions.push(`Criar atalho para falar com atendente no caminho "${path.label}"`);
  });

  sections.alerts = unique([
    ...sections.complexMenus,
    ...sections.longPaths,
    ...sections.longAudios,
  ]).slice(0, 30);
  sections.suggestions = unique(sections.suggestions).slice(0, 30);

  const totalCritical = sections.critical.length + sections.loops.length + sections.deadEnds.length;
  const totalWarnings = sections.alerts.length;
  const averageNodeScore = average(Object.values(nodeAnalyses).map((item) => item.score));
  const pathPenalty = paths.reduce((total, path) => total + (path.stepCount > 5 ? 4 : 0) + (path.loopDetected ? 8 : 0) + (path.deadEnd ? 8 : 0), 0);
  const stateCount = Math.max(1, parsedData.states.length);
  const criticalPenalty = Math.min(30, (totalCritical / stateCount) * 18);
  const warningPenalty = Math.min(12, (totalWarnings / stateCount) * 8);
  const score = clampScore(Math.round(averageNodeScore - criticalPenalty - warningPenalty - Math.min(15, pathPenalty)));

  return {
    summary: {
      score,
      status: score >= 85 ? 'Bom' : score >= 65 ? 'Atencao' : 'Critico',
      averageDepth: roundOne(average(paths.map((path) => path.stepCount))),
      longestPath: Math.max(0, ...paths.map((path) => path.stepCount)),
      totalPaths: paths.length,
      criticalCount: totalCritical,
      warningCount: totalWarnings,
      processedStates: parsedData.states.length,
    },
    sections,
    warnings,
  };
}

function addIssue(list, warnings, issue) {
  list.push(issue.message);
  warnings.push(issue);
}

function countMenuOptions(state) {
  const options = new Set();
  state.transitions.forEach((transition) => {
    const text = transition.conditions?.join(' ') ?? '';
    const dtmf = normalizeText(text).match(/\b(?:dtmf|opcao|opção)?\s*([0-9])\b/gi) ?? [];
    dtmf.forEach((match) => {
      const digit = match.match(/[0-9]/)?.[0];
      if (digit) options.add(digit);
    });
  });
  return options.size || state.transitions.length;
}

function hasTypedOption(transition) {
  return /\b(?:dtmf|opcao|opção)?\s*[0-9]\b/i.test(transition?.conditions?.join(' ') ?? '');
}

function hasConcept(text, terms) {
  const key = normalizeKey(text);
  return terms.some((term) => key.includes(normalizeKey(term)));
}

function unique(items) {
  return [...new Set(items.filter(Boolean))];
}

function average(values) {
  const valid = values.filter((value) => Number.isFinite(value));
  if (!valid.length) return 0;
  return valid.reduce((total, value) => total + value, 0) / valid.length;
}

function roundOne(value) {
  return Math.round(value * 10) / 10;
}

function clampScore(value) {
  return Math.max(0, Math.min(100, Math.round(value)));
}

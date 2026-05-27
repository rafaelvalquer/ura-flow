import { getDirectMenuCaseBranches } from './niceMenuRouting.js';

export function buildNiceMermaidDiagram(script, documentationFlow = {}, options = {}) {
  const journey = buildMermaidJourney(script, options);
  if (journey.nodes.length) {
    const diagram = createJourneyMermaidText(journey.nodes, journey.edges);
    const safeDiagram = createSafeMermaidText(journey.nodes, journey.edges);
    const actionMap = new Map(journey.nodes.filter((node) => node.actionId).map((node) => [mermaidNodeId(node.id), node.actionId]));
    return { diagram, safeDiagram, actionMap };
  }

  if (documentationFlow?.nodes?.length) {
    const finalNodes = fallbackNodesFromDocumentation(documentationFlow);
    const diagram = createSafeMermaidText(finalNodes, dedupeEdges(documentationFlow.edges ?? []));
    const actionMap = new Map(finalNodes.filter((node) => node.actionId).map((node) => [mermaidNodeId(node.id), node.actionId]));
    return { diagram, safeDiagram: diagram, actionMap };
  }

  const actions = getSortedActions(script);
  const actionsById = new Map(actions.map((action) => [Number(action.actionId), action]));
  const nodes = new Map();
  const edges = [];
  const actionNodeIds = new Map();

  actions.forEach((action) => {
    const node = makeActionNode(action);
    if (!node) return;
    nodes.set(node.id, node);
    actionNodeIds.set(Number(action.actionId), node.id);
  });

  actions.forEach((action) => {
    const source = actionNodeIds.get(Number(action.actionId));
    if (!source) return;
    getOutgoing(action).forEach((branch) => {
      const target = actionNodeIds.get(Number(branch.actionId));
      if (target) addEdge(edges, source, target, branch.label);
    });
  });

  actions.filter((action) => action.action === 'CASE').forEach((action) => {
    const source = actionNodeIds.get(Number(action.actionId));
    if (!source) return;
    (action.cases ?? []).forEach((branch, index) => {
      const target = actionsById.get(Number(branch.actionId));
      const output = summarizeActionOutput(target);
      const optionNode = {
        id: `case_${action.actionId}_${safeId(branch.text || index)}`,
        type: 'option',
        title: `Opcao ${branch.text || index + 1}`,
        lines: compactLines([
          output.audio && `Audio: ${output.audio}`,
          output.nextStep && `NEXT_STEP: ${output.nextStep}`,
          output.scriptpoint && `scriptpoint: ${output.scriptpoint}`,
        ]),
        actionId: Number(action.actionId),
      };
      nodes.set(optionNode.id, optionNode);
      addEdge(edges, source, optionNode.id, `Case ${branch.text || index + 1}`);
      addOutputForAssignments(nodes, edges, optionNode.id, target ? summarizeActionCode(target) : '', `case_${action.actionId}_${index}`, Number(branch.actionId));
    });
  });

  actions.filter((action) => action.action === 'SNIPPET').forEach((action) => {
    const source = actionNodeIds.get(Number(action.actionId));
    if (!source) return;
    const code = action.parameters?.[0] ?? '';

    extractSnippetSwitchCases(code).forEach((item, index) => {
      const optionNode = {
        id: `switch_${action.actionId}_${safeId(item.caseValue)}_${index}`,
        type: 'option',
        title: `Opcao ${item.caseValue}`,
        lines: compactLines([
          `Origem: SWITCH ${item.switchValue}`,
          item.output.audio && `Audio: ${item.output.audio}`,
          item.output.nextStep && `NEXT_STEP: ${item.output.nextStep}`,
          item.output.scriptpoint && `scriptpoint: ${item.output.scriptpoint}`,
        ]),
        actionId: Number(action.actionId),
      };
      nodes.set(optionNode.id, optionNode);
      addEdge(edges, source, optionNode.id, `Case ${item.caseValue}`);
      addOutputForAssignments(nodes, edges, optionNode.id, item.block, `switch_${action.actionId}_${index}`, Number(action.actionId));
    });

    extractSnippetIfBlocks(code).forEach((item, index) => {
      const ruleNode = {
        id: `snippet_if_${action.actionId}_${index}`,
        type: 'rule',
        title: 'Condicao em snippet',
        lines: [item.expression],
        actionId: Number(action.actionId),
      };
      nodes.set(ruleNode.id, ruleNode);
      addEdge(edges, source, ruleNode.id, 'IF');
      addOutputForAssignments(nodes, edges, ruleNode.id, item.trueBlock, `if_${action.actionId}_${index}_true`, Number(action.actionId), 'True');
      if (item.falseBlock) {
        addOutputForAssignments(nodes, edges, ruleNode.id, item.falseBlock, `if_${action.actionId}_${index}_false`, Number(action.actionId), 'False');
      }
    });

    const outputs = extractSnippetOutputs(code);
    if (!outputs.nextStep && !outputs.audio && isAdvancedSnippet(code)) {
      const advancedNode = {
        id: `advanced_${action.actionId}`,
        type: 'advanced',
        title: 'Logica avancada',
        lines: compactLines([
          extractInlineStatements(code, 'IF').slice(0, 2).map((item) => `IF: ${item}`).join(' | '),
          extractSnippetSwitchCases(code).length ? `CASEs: ${extractSnippetSwitchCases(code).map((item) => item.caseValue).join(', ')}` : '',
          `Variaveis: ${Object.keys(extractAssignments(code)).slice(0, 8).join(', ')}`,
        ]),
        actionId: Number(action.actionId),
      };
      nodes.set(advancedNode.id, advancedNode);
      addEdge(edges, source, advancedNode.id, 'Resumo');
    }
  });

  actions.forEach((action) => {
    const source = actionNodeIds.get(Number(action.actionId));
    if (!source) return;
    if (['SNIPPET', 'ASSIGN', 'PLAY', 'RUNSCRIPT', 'RETURN'].includes(action.action)) {
      addOutputForAssignments(nodes, edges, source, summarizeActionCode(action), `action_${action.actionId}`, Number(action.actionId));
    }
  });

  const finalNodes = nodes.size ? [...nodes.values()] : fallbackNodesFromDocumentation(documentationFlow);
  const diagram = createMermaidText(finalNodes, dedupeEdges(edges));
  const safeDiagram = createSafeMermaidText(finalNodes, dedupeEdges(edges));
  const actionMap = new Map(finalNodes.filter((node) => node.actionId).map((node) => [mermaidNodeId(node.id), node.actionId]));

  return { diagram, safeDiagram, actionMap };
}

function buildMermaidJourney(script, options = {}) {
  const actions = getSortedActions(script);
  const actionsById = new Map(actions.map((action) => [Number(action.actionId), action]));
  const menus = actions.filter((action) => action.action === 'MENU');

  if (!menus.length) {
    return buildNoMenuStructuralJourney(actions, actionsById);
  }

  if (options.mode === 'detail' && menus.length) {
    return buildDetailedMenuJourney(actions, actionsById, menus);
  }

  const nodes = new Map();
  const edges = [];
  const outputNodes = new Map();

  if (!menus.length) return { nodes: [], edges: [] };

  const menuActionIds = menus.map((menu) => Number(menu.actionId)).sort((a, b) => a - b);

  menus.forEach((menu, menuIndex) => {
    const range = actionRangeForMenu(menuActionIds, menuIndex);
    const menuNode = makeJourneyNode({
      id: `menu_${menu.actionId}`,
      kind: 'menu',
      title: `Menu: ${cleanCaption(menu.caption)}`,
      lines: [
        `Audio: ${menu.parameters?.[0] || 'nao informado'}`,
        `Resposta: ${menu.parameters?.[7] || 'MRES'}`,
        `Timeout: ${menu.parameters?.[5] || '-'}`,
      ],
      actionId: Number(menu.actionId),
    });
    const routerNode = makeJourneyNode({
      id: `router_${menu.actionId}`,
      kind: 'router',
      title: 'Roteamento de opcoes',
      lines: [`Variavel: ${menu.parameters?.[7] || 'MRES'}`],
      actionId: Number(menu.actionId),
    });

    nodes.set(menuNode.id, menuNode);
    nodes.set(routerNode.id, routerNode);
    addEdge(edges, menuNode.id, routerNode.id, 'Roteia');

    collectMenuOptions(actions, actionsById, range, menu).forEach((option, index) => {
      const optionNode = makeJourneyNode({
        id: `option_${menu.actionId}_${safeId(option.key)}_${index}`,
        kind: 'option',
        title: `Opcao ${option.key}`,
        lines: compactLines([
          option.output.audio && `Audio: ${option.output.audio}`,
          option.output.nextStep && `NEXT_STEP: ${option.output.nextStep}`,
          option.output.scriptpoint && `scriptpoint: ${option.output.scriptpoint}`,
          option.output.transferCode && `TransferCode: ${option.output.transferCode}`,
        ]),
        actionId: option.actionId,
      });
      nodes.set(optionNode.id, optionNode);
      addEdge(edges, routerNode.id, optionNode.id, `Case ${option.key}`);
      connectOptionDestination({ nodes, edges, outputNodes, optionNode, option, actionsById });
    });

    collectRetries(actions, range).forEach((retry) => {
      const retryNode = makeJourneyNode({
        id: `${retry.kind}_${menu.actionId}_${retry.actionId}`,
        kind: retry.kind,
        title: retry.kind === 'silence' ? 'SIL / Timeout' : 'REJ',
        lines: retry.lines,
        actionId: retry.actionId,
      });
      nodes.set(retryNode.id, retryNode);
      addEdge(edges, menuNode.id, retryNode.id, retry.kind === 'silence' ? 'SIL' : 'REJ');
      addEdge(edges, retryNode.id, menuNode.id, 'Repete menu');
    });
  });

  if (nodes.size === 0) {
    actions.filter((action) => ['RUNSUB', 'REST_API', 'IF', 'RUNSCRIPT', 'RETURN', 'PLAY'].includes(action.action)).forEach((action) => {
      const node = makeActionNode(action);
      if (node) nodes.set(node.id, node);
    });
  }

  return {
    nodes: [...nodes.values()],
    edges: dedupeEdges(edges),
  };
}

function buildNoMenuStructuralJourney(actions, actionsById) {
  const nodes = new Map();
  const edges = [];
  const expanded = new Set();
  const root = actions.find((action) => action.action === 'BEGIN') ?? actions[0];

  function visit(actionId, sourceNodeId = '', edgeLabel = 'Segue') {
    const action = actionsById.get(Number(actionId));
    if (!action) return;

    const node = makeStructuralActionNode(action);
    nodes.set(node.id, node);
    if (sourceNodeId) addEdge(edges, sourceNodeId, node.id, edgeLabel);

    const currentId = Number(action.actionId);
    if (expanded.has(currentId)) return;
    expanded.add(currentId);

    getStructuralOutgoing(action).forEach((branch) => {
      visit(Number(branch.actionId), node.id, branch.label);
    });
  }

  if (root) visit(Number(root.actionId));

  actions
    .filter((action) => action.action === 'ONRELEASE')
    .forEach((action) => visit(Number(action.actionId)));

  return {
    nodes: [...nodes.values()],
    edges: dedupeEdges(edges),
  };
}

function makeStructuralActionNode(action) {
  if (action.action === 'BEGIN') {
    const variables = extractBeginVariables(action);
    return makeJourneyNode({
      id: `struct_action_${action.actionId}`,
      kind: 'start',
      title: `Inicio: ${cleanCaption(action.caption || 'Fluxo')}`,
      lines: variables.length ? [`Variaveis: ${variables.slice(0, 10).join(', ')}`, variables.length > 10 && `+${variables.length - 10} variaveis`] : ['Sem variaveis de entrada declaradas'],
      actionId: Number(action.actionId),
    });
  }

  if (action.action === 'ONRELEASE') {
    return makeJourneyNode({
      id: `struct_action_${action.actionId}`,
      kind: 'onrelease',
      title: cleanCaption(action.caption || 'OnRelease'),
      lines: ['Fluxo ao desligar chamada'],
      actionId: Number(action.actionId),
    });
  }

  const output = summarizeActionOutput(action);

  if (action.action === 'IF') {
    return makeJourneyNode({
      id: `struct_action_${action.actionId}`,
      kind: 'rule',
      title: cleanCaption(action.caption || 'Regra / IF'),
      lines: [`IF ${action.parameters?.[0] || 'sem expressao'}`],
      actionId: Number(action.actionId),
    });
  }

  if (['RUNSUB', 'REST_API', 'WORKFLOWDATA'].includes(action.action)) {
    return makeJourneyNode({
      id: `struct_action_${action.actionId}`,
      kind: 'api',
      title: cleanCaption(action.caption || action.action),
      lines: linesForAction(action, output),
      actionId: Number(action.actionId),
    });
  }

  if (['RUNSCRIPT', 'RETURN', 'PLAY'].includes(action.action)) {
    return makeJourneyNode({
      id: `struct_action_${action.actionId}`,
      kind: 'output',
      title: cleanCaption(action.caption || action.action),
      lines: linesForAction(action, output),
      actionId: Number(action.actionId),
    });
  }

  if (action.action === 'LOOP') {
    return makeJourneyNode({
      id: `struct_action_${action.actionId}`,
      kind: /sil/i.test(`${action.caption ?? ''} ${action.parameters?.[1] ?? ''}`) ? 'silence' : 'error',
      title: cleanCaption(action.caption || 'Loop'),
      lines: [`Tentativas: ${action.parameters?.[0] || '-'}`, action.parameters?.[1] && `Variavel: ${action.parameters[1]}`],
      actionId: Number(action.actionId),
    });
  }

  if (action.action === 'ASSIGN') {
    return makeJourneyNode({
      id: `struct_action_${action.actionId}`,
      kind: 'output',
      title: cleanCaption(action.caption || 'Assign'),
      lines: compactLines([`${action.parameters?.[0] || 'VAR'} = ${action.parameters?.[1] || ''}`]),
      actionId: Number(action.actionId),
    });
  }

  if (action.action === 'SNIPPET' && isAdvancedSnippet(action.parameters?.[0] ?? '') && !hasOutput(output)) {
    return makeJourneyNode({
      id: `struct_action_${action.actionId}`,
      kind: 'advanced',
      title: cleanCaption(action.caption || 'Logica avancada'),
      lines: summarizeAdvancedSnippet(action.parameters?.[0] ?? ''),
      actionId: Number(action.actionId),
    });
  }

  return makeJourneyNode({
    id: `struct_action_${action.actionId}`,
    kind: action.action === 'SNIPPET' && isAdvancedSnippet(action.parameters?.[0] ?? '') ? 'advanced' : 'output',
    title: cleanCaption(action.caption || action.action),
    lines: linesForAction(action, output),
    actionId: Number(action.actionId),
  });
}

function getStructuralOutgoing(action) {
  const branches = [];

  if (action.defaultNextAction?.actionId && Number(action.defaultNextAction.actionId) > 0) {
    branches.push({ ...action.defaultNextAction, label: defaultStructuralEdgeLabel(action) });
  }

  (action.branches ?? [])
    .filter((branch) => Number(branch.actionId) > 0)
    .forEach((branch) => {
      branches.push({ ...branch, label: structuralBranchLabel(action, branch) });
    });

  const cases = action.action === 'MENU' ? getDirectMenuCaseBranches(action) : (action.cases ?? []);
  cases
    .filter((branch) => Number(branch.actionId) > 0)
    .forEach((branch) => {
      branches.push({ ...branch, label: branch.text ? `Case ${branch.text}` : 'Case' });
    });

  return branches;
}

function defaultStructuralEdgeLabel(action) {
  if (['RUNSUB', 'REST_API', 'WORKFLOWDATA'].includes(action.action)) return 'Retorno';
  return 'Segue';
}

function structuralBranchLabel(action, branch) {
  const text = String(branch.text ?? '').trim();
  if (text) return text;
  if (action.action === 'IF') return Number(branch.index) === 1 ? 'False' : 'True';
  if (action.action === 'LOOP') return Number(branch.index) === 1 ? 'Repeat' : 'Finished';
  return `Branch ${branch.index ?? ''}`.trim();
}

function buildDetailedMenuJourney(actions, actionsById, menus) {
  const nodes = new Map();
  const edges = [];
  const outputNodes = new Map();
  const context = { actionsById, nodes, edges, outputNodes };
  const menuActionIds = menus.map((menu) => Number(menu.actionId)).sort((a, b) => a - b);

  menus.forEach((menu, menuIndex) => {
    const range = actionRangeForMenu(menuActionIds, menuIndex);
    const menuNode = makeJourneyNode({
      id: `detail_menu_${menu.actionId}`,
      kind: 'menu',
      title: `Menu: ${cleanCaption(menu.caption)}`,
      lines: [
        `Audio: ${menu.parameters?.[0] || 'nao informado'}`,
        `Resposta: ${menu.parameters?.[7] || 'MRES'}`,
        `Timeout: ${menu.parameters?.[5] || '-'}`,
      ],
      actionId: Number(menu.actionId),
    });
    const routerNode = makeJourneyNode({
      id: `detail_router_${menu.actionId}`,
      kind: 'router',
      title: 'Roteamento de opcoes',
      lines: [`Variavel: ${menu.parameters?.[7] || 'MRES'}`],
      actionId: Number(menu.actionId),
    });

    nodes.set(menuNode.id, menuNode);
    nodes.set(routerNode.id, routerNode);
    addEdge(edges, menuNode.id, routerNode.id, 'Roteia');

    collectDetailedMenuOptions(actions, actionsById, range, menu).forEach((option, index) => {
      const optionNode = makeJourneyNode({
        id: `detail_option_${menu.actionId}_${safeId(option.key)}_${index}`,
        kind: 'option',
        title: `Opcao ${option.key}`,
        lines: compactLines([
          option.output.audio && `Audio: ${option.output.audio}`,
          option.output.nextStep && `NEXT_STEP: ${option.output.nextStep}`,
          option.output.scriptpoint && `scriptpoint: ${option.output.scriptpoint}`,
          option.output.transferCode && `TransferCode: ${option.output.transferCode}`,
        ]),
        actionId: option.actionId,
      });
      nodes.set(optionNode.id, optionNode);
      addEdge(edges, routerNode.id, optionNode.id, `Case ${option.key}`);

      const renderedSnippetLogic = option.block && renderSnippetDecisionTree({
        ...context,
        sourceNodeId: optionNode.id,
        code: option.block,
        actionId: option.actionId,
        idPrefix: `detail_option_${menu.actionId}_${safeId(option.key)}`,
      });

      if (!renderedSnippetLogic) {
        const output = option.block ? summarizeCodeOutput(option.block) : option.output;
        if (hasOutput(output)) {
          const outputNode = getOutputNode(outputNodes, nodes, output, option.actionId);
          addEdge(edges, optionNode.id, outputNode.id, output.nextStep ? 'NEXT_STEP' : 'Saida');
        } else if (option.caseTargetActionId) {
          traverseDetailedAction({
            ...context,
            sourceNodeId: optionNode.id,
            actionId: option.caseTargetActionId,
            edgeLabel: option.block ? 'Destino' : 'Segue',
            visited: new Set(),
          });
        }
      }

      if (renderedSnippetLogic && option.caseTargetActionId && !hasOutput(option.output)) {
        traverseDetailedAction({
          ...context,
          sourceNodeId: optionNode.id,
          actionId: option.caseTargetActionId,
          edgeLabel: 'Destino tecnico',
          visited: new Set(),
        });
      }
    });

    renderDetailedMenuRetries({ ...context, menu, menuNode, actions, range });
  });

  return {
    nodes: [...nodes.values()],
    edges: dedupeEdges(edges),
  };
}

function collectDetailedMenuOptions(actions, actionsById, range, menu) {
  const optionsByKey = new Map();
  const menuRoutingVariables = getMenuRoutingVariables(actions, range, menu);

  getDirectMenuCaseBranches(menu).forEach((branch) => {
    const key = normalizeOptionKey(branch.text);
    if (!key) return;
    const target = actionsById.get(Number(branch.actionId));
    const current = optionsByKey.get(key) ?? {
      key: branch.text || key,
      output: {},
      actionId: Number(target?.actionId ?? branch.actionId),
      sourceActionIds: [],
    };
    current.key = branch.text || key;
    current.caseTargetActionId = Number(branch.actionId);
    current.caseActionId = Number(menu.actionId);
    current.targetAction = target;
    current.actionId = Number(target?.actionId ?? branch.actionId);
    current.caseOutput = summarizeActionOutput(target);
    current.sourceActionIds.push(Number(menu.actionId));
    optionsByKey.set(key, current);
  });

  actions
    .filter((action) => action.action === 'CASE' && actionInRange(Number(action.actionId), range))
    .forEach((action) => {
      (action.cases ?? []).forEach((branch) => {
        const key = normalizeOptionKey(branch.text || `#${branch.index ?? optionsByKey.size + 1}`);
        if (!key) return;
        const target = actionsById.get(Number(branch.actionId));
        const current = optionsByKey.get(key) ?? {
          key: branch.text || key,
          output: {},
          actionId: Number(action.actionId),
          sourceActionIds: [],
        };
        current.caseTargetActionId = Number(branch.actionId);
        current.caseActionId = Number(action.actionId);
        current.actionId = Number(target?.actionId ?? action.actionId);
        current.caseOutput = summarizeActionOutput(target);
        current.sourceActionIds.push(Number(action.actionId));
        optionsByKey.set(key, current);
      });
    });

  actions
    .filter((action) => action.action === 'SNIPPET' && actionInRange(Number(action.actionId), range))
    .forEach((action) => {
      extractSnippetSwitchCases(action.parameters?.[0] ?? '').forEach((item) => {
        if (!isMenuRoutingSwitch(item.switchValue, menuRoutingVariables)) return;
        const key = normalizeOptionKey(item.caseValue);
        if (!key) return;
        const current = optionsByKey.get(key) ?? {
          key: item.caseValue,
          output: {},
          actionId: Number(action.actionId),
          sourceActionIds: [],
        };
        current.key = item.caseValue;
        current.block = item.block;
        current.switchActionId = Number(action.actionId);
        current.switchOutput = item.output;
        current.actionId = Number(action.actionId);
        current.sourceActionIds.push(Number(action.actionId));
        optionsByKey.set(key, current);
      });
    });

  return [...optionsByKey.values()].map((option) => {
    const switchMeaningful = isMeaningfulOutput(option.switchOutput);
    const caseMeaningful = isMeaningfulOutput(option.caseOutput);
    return {
      ...option,
      output: switchMeaningful ? option.switchOutput : caseMeaningful ? option.caseOutput : option.switchOutput ?? option.caseOutput ?? {},
      actionId: option.switchActionId ?? option.caseTargetActionId ?? option.caseActionId ?? option.actionId,
    };
  });
}

function renderDetailedMenuRetries({ nodes, edges, outputNodes, menu, menuNode, actions, range, actionsById }) {
  actions
    .filter((action) => action.action === 'LOOP' && actionInRange(Number(action.actionId), range))
    .forEach((loop) => {
      const text = `${loop.caption ?? ''} ${loop.parameters?.[1] ?? ''}`;
      const isSil = /sil/i.test(text);
      const isRej = /rej/i.test(text);
      if (!isSil && !isRej) return;
      const loopNode = makeJourneyNode({
        id: `detail_loop_${loop.actionId}`,
        kind: isSil ? 'silence' : 'error',
        title: isSil ? 'SIL / Timeout' : 'REJ',
        lines: [`Tentativas: ${loop.parameters?.[0] || '-'}`],
        actionId: Number(loop.actionId),
      });
      nodes.set(loopNode.id, loopNode);
      addEdge(edges, menuNode.id, loopNode.id, isSil ? 'Timeout/SIL' : 'REJ');
      (loop.branches ?? []).forEach((branch) => {
        const label = /repeat/i.test(branch.text ?? '') || Number(branch.index) === 1 ? 'Repeat' : 'Finished';
        if (label === 'Repeat') {
          const retryAction = actionsById.get(Number(branch.actionId));
          if (retryAction) {
            const retryNode = makeDetailedActionNode(retryAction);
            nodes.set(retryNode.id, retryNode);
            addEdge(edges, loopNode.id, retryNode.id, label);
            addEdge(edges, retryNode.id, menuNode.id, 'Repete menu');
          } else {
            addEdge(edges, loopNode.id, menuNode.id, 'Repete menu');
          }
          return;
        }
        traverseDetailedAction({
          nodes,
          edges,
          outputNodes,
          actionsById,
          sourceNodeId: loopNode.id,
          actionId: Number(branch.actionId),
          edgeLabel: label,
          visited: new Set(),
        });
      });
    });
}

function traverseDetailedAction({ nodes, edges, outputNodes, actionsById, sourceNodeId, actionId, edgeLabel = 'Segue', visited = new Set() }) {
  const action = actionsById.get(Number(actionId));
  if (!action) return;
  const visitKey = `${sourceNodeId}->${action.actionId}`;
  if (visited.has(visitKey)) {
    const loopNode = makeJourneyNode({
      id: `detail_loop_guard_${safeId(sourceNodeId)}_${safeId(action.actionId)}`,
      kind: 'advanced',
      title: 'Loop detectado',
      lines: [`Retorna para ${cleanCaption(action.caption || action.action)}`],
      actionId: Number(action.actionId),
    });
    nodes.set(loopNode.id, loopNode);
    addEdge(edges, sourceNodeId, loopNode.id, edgeLabel);
    return;
  }
  const nextVisited = new Set(visited);
  nextVisited.add(visitKey);

  const actionNode = makeDetailedActionNode(action);
  nodes.set(actionNode.id, actionNode);
  addEdge(edges, sourceNodeId, actionNode.id, edgeLabel);

  if (action.action === 'IF') {
    (action.branches ?? []).forEach((branch) => {
      traverseDetailedAction({
        nodes,
        edges,
        outputNodes,
        actionsById,
        sourceNodeId: actionNode.id,
        actionId: Number(branch.actionId),
        edgeLabel: /false/i.test(branch.text ?? '') || Number(branch.index) === 1 ? 'False' : 'True',
        visited: nextVisited,
      });
    });
    return;
  }

  if (action.action === 'CASE') {
    (action.cases ?? []).forEach((branch) => {
      traverseDetailedAction({
        nodes,
        edges,
        outputNodes,
        actionsById,
        sourceNodeId: actionNode.id,
        actionId: Number(branch.actionId),
        edgeLabel: branch.text ? `Case ${branch.text}` : 'Case',
        visited: nextVisited,
      });
    });
    if (action.defaultNextAction?.actionId) {
      traverseDetailedAction({
        nodes,
        edges,
        outputNodes,
        actionsById,
        sourceNodeId: actionNode.id,
        actionId: Number(action.defaultNextAction.actionId),
        edgeLabel: 'Default',
        visited: nextVisited,
      });
    }
    return;
  }

  if (action.action === 'LOOP') {
    (action.branches ?? []).forEach((branch) => {
      traverseDetailedAction({
        nodes,
        edges,
        outputNodes,
        actionsById,
        sourceNodeId: actionNode.id,
        actionId: Number(branch.actionId),
        edgeLabel: /repeat/i.test(branch.text ?? '') || Number(branch.index) === 1 ? 'Repeat' : 'Finished',
        visited: nextVisited,
      });
    });
    return;
  }

  if (action.action === 'SNIPPET') {
    const rendered = renderSnippetDecisionTree({
      nodes,
      edges,
      outputNodes,
      actionsById,
      sourceNodeId: actionNode.id,
      code: action.parameters?.[0] ?? '',
      actionId: Number(action.actionId),
      idPrefix: `detail_snippet_${action.actionId}`,
    });
    const output = summarizeActionOutput(action);
    if (!rendered && hasOutput(output)) {
      const outputNode = getOutputNode(outputNodes, nodes, output, Number(action.actionId));
      addEdge(edges, actionNode.id, outputNode.id, output.nextStep ? 'NEXT_STEP' : 'Saida');
      return;
    }
  }

  if (['RUNSCRIPT', 'RETURN'].includes(action.action)) return;

  if (action.defaultNextAction?.actionId) {
    traverseDetailedAction({
      nodes,
      edges,
      outputNodes,
      actionsById,
      sourceNodeId: actionNode.id,
      actionId: Number(action.defaultNextAction.actionId),
      edgeLabel: 'Segue',
      visited: nextVisited,
    });
  }
}

function makeDetailedActionNode(action) {
  if (action.action === 'IF') {
    return makeJourneyNode({
      id: `detail_action_${action.actionId}`,
      kind: 'rule',
      title: cleanCaption(action.caption || 'Regra / IF'),
      lines: [action.parameters?.[0] || 'IF sem expressao'],
      actionId: Number(action.actionId),
    });
  }
  if (['RUNSUB', 'REST_API', 'WORKFLOWDATA'].includes(action.action)) {
    return makeJourneyNode({
      id: `detail_action_${action.actionId}`,
      kind: 'api',
      title: cleanCaption(action.caption || action.action),
      lines: linesForAction(action, summarizeActionOutput(action)),
      actionId: Number(action.actionId),
    });
  }
  if (['RUNSCRIPT', 'RETURN', 'PLAY'].includes(action.action)) {
    return makeJourneyNode({
      id: `detail_action_${action.actionId}`,
      kind: 'output',
      title: cleanCaption(action.caption || action.action),
      lines: linesForAction(action, summarizeActionOutput(action)),
      actionId: Number(action.actionId),
    });
  }
  if (action.action === 'LOOP') {
    return makeJourneyNode({
      id: `detail_action_${action.actionId}`,
      kind: /sil/i.test(`${action.caption ?? ''} ${action.parameters?.[1] ?? ''}`) ? 'silence' : 'error',
      title: cleanCaption(action.caption || 'Loop'),
      lines: [`Tentativas: ${action.parameters?.[0] || '-'}`, action.parameters?.[1] && `Variavel: ${action.parameters[1]}`],
      actionId: Number(action.actionId),
    });
  }
  if (action.action === 'ASSIGN') {
    return makeJourneyNode({
      id: `detail_action_${action.actionId}`,
      kind: 'output',
      title: cleanCaption(action.caption || 'Assign'),
      lines: compactLines([`${action.parameters?.[0] || 'VAR'} = ${action.parameters?.[1] || ''}`]),
      actionId: Number(action.actionId),
    });
  }
  return makeJourneyNode({
    id: `detail_action_${action.actionId}`,
    kind: action.action === 'SNIPPET' && isAdvancedSnippet(action.parameters?.[0] ?? '') ? 'advanced' : 'output',
    title: cleanCaption(action.caption || action.action),
    lines: linesForAction(action, summarizeActionOutput(action)),
    actionId: Number(action.actionId),
  });
}

function renderSnippetDecisionTree({ nodes, edges, outputNodes, sourceNodeId, code, actionId, idPrefix }) {
  const tree = extractSnippetIfTree(code);
  if (!tree.length) return false;
  tree.forEach((item, index) => {
    renderSnippetIfNode({ nodes, edges, outputNodes, sourceNodeId, item, actionId, idPrefix: `${idPrefix}_if_${index}`, edgeLabel: 'IF' });
  });
  return true;
}

function renderSnippetIfNode({ nodes, edges, outputNodes, sourceNodeId, item, actionId, idPrefix, edgeLabel }) {
  const ruleNode = makeJourneyNode({
    id: `detail_${safeId(idPrefix)}`,
    kind: 'rule',
    title: 'Condicao em snippet',
    lines: [item.expression || 'IF sem expressao'],
    actionId,
  });
  nodes.set(ruleNode.id, ruleNode);
  addEdge(edges, sourceNodeId, ruleNode.id, edgeLabel);
  renderSnippetBranch({ nodes, edges, outputNodes, sourceNodeId: ruleNode.id, branch: item.trueBranch, actionId, idPrefix: `${idPrefix}_true`, label: 'True' });
  renderSnippetBranch({ nodes, edges, outputNodes, sourceNodeId: ruleNode.id, branch: item.falseBranch, actionId, idPrefix: `${idPrefix}_false`, label: 'False' });
}

function renderSnippetBranch({ nodes, edges, outputNodes, sourceNodeId, branch, actionId, idPrefix, label }) {
  if (!branch) return;
  if (branch.children.length) {
    branch.children.forEach((child, index) => {
      renderSnippetIfNode({ nodes, edges, outputNodes, sourceNodeId, item: child, actionId, idPrefix: `${idPrefix}_${index}`, edgeLabel: label });
    });
    return;
  }
  if (hasOutput(branch.output)) {
    const outputNode = getOutputNode(outputNodes, nodes, branch.output, actionId);
    addEdge(edges, sourceNodeId, outputNode.id, label);
    return;
  }
  const assignments = Object.keys(extractAssignments(branch.code ?? ''));
  if (assignments.length) {
    const advancedNode = makeJourneyNode({
      id: `detail_logic_${safeId(idPrefix)}`,
      kind: 'advanced',
      title: 'Logica do branch',
      lines: [`Variaveis: ${assignments.slice(0, 6).join(', ')}`],
      actionId,
    });
    nodes.set(advancedNode.id, advancedNode);
    addEdge(edges, sourceNodeId, advancedNode.id, label);
  }
}

function extractSnippetIfTree(code) {
  return parseTopLevelIfBlocks(stripCommentLines(code));
}

function parseTopLevelIfBlocks(code) {
  const text = String(code ?? '');
  const items = [];
  let index = 0;
  while (index < text.length) {
    const match = findNextIfAtDepth(text, index);
    if (!match) break;
    const openBrace = text.indexOf('{', match.index);
    if (openBrace < 0) break;
    const trueEnd = findMatchingBrace(text, openBrace);
    if (trueEnd < 0) break;
    const expression = text.slice(match.index + match.token.length, openBrace).trim();
    const trueCode = text.slice(openBrace + 1, trueEnd);
    const elseInfo = readElseBlock(text, trueEnd + 1);
    items.push({
      expression,
      trueBranch: makeSnippetBranch(trueCode),
      falseBranch: elseInfo ? makeSnippetBranch(elseInfo.code) : null,
    });
    index = elseInfo ? elseInfo.end + 1 : trueEnd + 1;
  }
  return items;
}

function makeSnippetBranch(code) {
  return {
    code,
    output: summarizeCodeOutput(code),
    children: parseTopLevelIfBlocks(code),
  };
}

function findNextIfAtDepth(text, fromIndex) {
  let depth = 0;
  for (let index = fromIndex; index < text.length; index += 1) {
    const char = text[index];
    if (char === '{') depth += 1;
    if (char === '}') depth = Math.max(0, depth - 1);
    if (depth === 0 && /\bIF\b/i.test(text.slice(index, index + 2)) && !/[A-Za-z0-9_]/.test(text[index - 1] ?? '') && !/[A-Za-z0-9_]/.test(text[index + 2] ?? '')) {
      return { index, token: text.slice(index, index + 2) };
    }
  }
  return null;
}

function readElseBlock(text, fromIndex) {
  const rest = text.slice(fromIndex);
  const elseMatch = rest.match(/^\s*ELSE\s*(?:\r?\n|\s)*\{/i);
  if (!elseMatch) return null;
  const openBrace = fromIndex + elseMatch[0].lastIndexOf('{');
  const end = findMatchingBrace(text, openBrace);
  if (end < 0) return null;
  return {
    code: text.slice(openBrace + 1, end),
    end,
  };
}

function stripCommentLines(code) {
  return String(code ?? '')
    .split(/\r?\n/)
    .filter((line) => !line.trim().startsWith('//'))
    .join('\n');
}

function hasOutput(output) {
  return Boolean(output?.nextStep || output?.audio || output?.scriptpoint || output?.transferCode);
}

function isMeaningfulOutput(output = {}) {
  return Boolean(
    output.audio ||
      output.scriptpoint ||
      output.transferCode ||
      (output.nextStep && !isGenericNextStep(output.nextStep))
  );
}

function hasApiJourney(actions) {
  return actions.some((action) => ['REST_API', 'WORKFLOWDATA', 'RUNSUB', 'RETURN'].includes(action.action));
}

function buildApiJourney(actions, actionsById) {
  const nodes = new Map();
  const edges = [];
  const relevantActions = actions.filter(isApiJourneyAction);

  relevantActions.forEach((action) => {
    const node = makeApiJourneyNode(action);
    if (node) nodes.set(node.id, node);
  });

  relevantActions.forEach((action) => {
    const source = apiJourneyNodeId(action);
    if (!nodes.has(source)) return;
    getOutgoing(action).forEach((branch) => {
      const target = actionsById.get(Number(branch.actionId));
      if (!target || !isApiJourneyAction(target)) return;
      const targetId = apiJourneyNodeId(target);
      if (nodes.has(targetId)) addEdge(edges, source, targetId, normalizeApiEdgeLabel(branch.label, action, target));
    });
  });

  collectApiAttentionNodes(actions, nodes, edges);

  return {
    nodes: [...nodes.values()],
    edges: dedupeEdges(edges),
  };
}

function isApiJourneyAction(action) {
  if (!action) return false;
  if (['BEGIN', 'WORKFLOWDATA', 'REST_API', 'RUNSUB', 'RETURN', 'IF'].includes(action.action)) return true;
  if (action.action === 'SNIPPET') return isApiJourneySnippet(action);
  return false;
}

function isApiJourneySnippet(action) {
  const text = `${action.caption ?? ''}\n${action.parameters?.[0] ?? ''}`;
  return /CHAVES_?APIs|Dados REQUEST|Dados RESPONSE|dados CDR|Cria[cç][aã]o de par[aâ]metros|Tratamento erro|API Fechada|bloqueioApis|REQUEST|headerjson|__HTTPSTATUSCODE|ivrServices|resultBody/i.test(text);
}

function apiJourneyNodeId(action) {
  return `api_action_${action.actionId}`;
}

function makeApiJourneyNode(action) {
  if (action.action === 'BEGIN') {
    const variables = extractBeginVariables(action);
    return makeJourneyNode({
      id: apiJourneyNodeId(action),
      kind: 'start',
      title: `Inicio: ${cleanCaption(action.caption || 'Fluxo API')}`,
      lines: variables.length ? [`Variaveis: ${variables.slice(0, 10).join(', ')}`, variables.length > 10 && `+${variables.length - 10} variaveis`] : ['Sem variaveis de entrada declaradas'],
      actionId: Number(action.actionId),
    });
  }

  if (action.action === 'WORKFLOWDATA') {
    return makeJourneyNode({
      id: apiJourneyNodeId(action),
      kind: 'api',
      title: 'WorkflowData',
      lines: summarizeWorkflowData(action),
      actionId: Number(action.actionId),
    });
  }

  if (action.action === 'REST_API') {
    return makeJourneyNode({
      id: apiJourneyNodeId(action),
      kind: 'api',
      title: `REST API: ${cleanCaption(action.caption || 'Chamada')}`,
      lines: summarizeRestApiAction(action),
      actionId: Number(action.actionId),
    });
  }

  if (action.action === 'RUNSUB') {
    const isAlert = /alerta|erro/i.test(`${action.caption ?? ''} ${action.parameters?.[0] ?? ''}`);
    return makeJourneyNode({
      id: apiJourneyNodeId(action),
      kind: isAlert ? 'error' : 'api',
      title: cleanCaption(action.caption || 'RUNSUB'),
      lines: summarizeRunsubAction(action),
      actionId: Number(action.actionId),
    });
  }

  if (action.action === 'RETURN') {
    return makeJourneyNode({
      id: apiJourneyNodeId(action),
      kind: 'output',
      title: 'RETURN',
      lines: [`Valor: ${action.parameters?.[0] || '0'}`],
      actionId: Number(action.actionId),
    });
  }

  if (action.action === 'IF') {
    return makeJourneyNode({
      id: apiJourneyNodeId(action),
      kind: 'rule',
      title: cleanCaption(action.caption || 'Regra / IF'),
      lines: [`IF ${action.parameters?.[0] || 'sem expressao'}`],
      actionId: Number(action.actionId),
    });
  }

  if (action.action === 'SNIPPET') {
    const summary = summarizeApiSnippet(action);
    return makeJourneyNode({
      id: apiJourneyNodeId(action),
      kind: summary.kind,
      title: summary.title,
      lines: summary.lines,
      actionId: Number(action.actionId),
    });
  }

  return null;
}

function extractBeginVariables(beginAction) {
  return (beginAction?.parameters ?? [])
    .slice(3)
    .map((item) => String(item ?? '').trim())
    .filter(Boolean)
    .filter((item, index, list) => list.indexOf(item) === index);
}

function summarizeWorkflowData(action) {
  return compactLines([
    `Chave: ${action.parameters?.[0] || 'nao informada'}`,
  ]);
}

function summarizeRestApiAction(action) {
  return compactLines([
    `Operacao: ${action.parameters?.[0] || '-'}`,
    `${action.parameters?.[4] || 'REST'} ${action.parameters?.[1] || '-'}`,
    `Header: ${action.parameters?.[2] || '-'}`,
    `Body: ${action.parameters?.[3] || '-'}`,
    `Timeout: ${action.parameters?.[5] || '-'}`,
    `Resultset: ${action.parameters?.[6] || '-'}`,
    `Erro: ${action.parameters?.[7] || '-'}`,
  ]);
}

function summarizeRunsubAction(action) {
  return compactLines([
    `Script: ${action.parameters?.[0] || 'nao informado'}`,
    `Retorno: ${action.parameters?.[2] || 'RTN'}`,
    `Params: ${(action.parameters ?? []).slice(3, 9).join(', ')}`,
  ]);
}

function summarizeApiSnippet(action) {
  const caption = cleanCaption(action.caption || 'Snippet');
  const code = action.parameters?.[0] ?? '';
  if (/CHAVES_?APIs|bloqueioApis/i.test(caption) || /bloqueioApis/i.test(code)) {
    return {
      kind: 'api',
      title: 'Chaves API',
      lines: summarizeApiKeysSnippet(code),
    };
  }
  if (/Dados REQUEST|REQUEST|headerjson/i.test(caption) || /\bREQUEST\b|headerjson|DYNAMIC\s+body/i.test(code)) {
    return {
      kind: 'api',
      title: 'Dados REQUEST',
      lines: summarizeRequestSnippet(code),
    };
  }
  if (/Dados RESPONSE|RESPONSE|HTTPSTATUS/i.test(caption) || /__HTTPSTATUSCODE|returnStatus|_RET/i.test(code)) {
    const isClosed = /fechada|bloqueio|NOK/i.test(caption);
    return {
      kind: isClosed ? 'error' : 'api',
      title: isClosed ? 'API fechada' : 'Dados RESPONSE',
      lines: summarizeResponseSnippet(code),
    };
  }
  if (/dados CDR|CDR|ivrServices/i.test(caption) || /ivrServices/i.test(code)) {
    return {
      kind: 'advanced',
      title: 'Dados CDR',
      lines: summarizeCdrSnippet(code),
    };
  }
  if (/Tratamento erro|erro/i.test(caption)) {
    return {
      kind: 'error',
      title: 'Tratamento erro',
      lines: summarizeGenericApiSnippet(code),
    };
  }
  if (/Cria[cç][aã]o de par[aâ]metros|par[aâ]metros/i.test(caption)) {
    return {
      kind: 'output',
      title: 'Criacao de parametros',
      lines: summarizeParameterSnippet(code),
    };
  }
  return {
    kind: 'advanced',
    title: caption,
    lines: summarizeGenericApiSnippet(code),
  };
}

function summarizeApiKeysSnippet(code) {
  const assignments = extractAssignments(code);
  const keys = Object.entries(assignments)
    .filter(([key]) => /bloqueioApis/i.test(key))
    .map(([key, value]) => `${key}: ${value}`);
  const dynamicKeys = [...String(code ?? '').matchAll(/\bDYNAMIC\s+([A-Za-z_][\w:]*|global:[A-Za-z_][\w:]*)/gi)].map((match) => `Dynamic: ${match[1]}`);
  return compactLines([...dynamicKeys, ...keys]).slice(0, 6);
}

function summarizeRequestSnippet(code) {
  const text = String(code ?? '');
  const urls = [...text.matchAll(/\burl\s*=\s*["']([^"']+)["']/gi)].map((match) => match[1]);
  const variables = extractPlaceholderVariables(text).slice(0, 8);
  return compactLines([
    urls[0] && `URL: ${urls[0]}`,
    urls.length > 1 && `URL PRD: ${urls[1]}`,
    /\bDYNAMIC\s+body\b/i.test(text) && 'Body: dynamic body',
    /\bDYNAMIC\s+header\b/i.test(text) && 'Header: dynamic header',
    /\bASSIGN\s+REQUEST\b/i.test(text) && 'Request: REQUEST',
    /headerjson/i.test(text) && 'Header JSON: headerjson',
    variables.length && `Variaveis: ${variables.join(', ')}`,
  ]);
}

function summarizeResponseSnippet(code) {
  const text = String(code ?? '');
  const assignments = extractAssignments(text);
  const retAssignments = Object.entries(assignments)
    .filter(([key]) => /_RET$|returnStatus|StatusCode/i.test(key))
    .map(([key, value]) => `${key}: ${value}`);
  return compactLines([
    /__HTTPSTATUSCODE\s*=\s*200/i.test(text) && 'Sucesso: __HTTPSTATUSCODE=200',
    ...retAssignments,
  ]).slice(0, 6);
}

function summarizeCdrSnippet(code) {
  const text = String(code ?? '');
  const serviceName = text.match(/nomeServico\s*=\s*["']([^"']+)["']/i)?.[1];
  return compactLines([
    /APIGEE/i.test(text) && 'Tipo: APIGEE',
    serviceName && `Servico: ${serviceName}`,
    /ivrServices_returnStatus/i.test(text) && 'Marca returnStatus',
    /ivrServices_returnCode/i.test(text) && 'Marca returnCode',
    /ivrServices_responseTime/i.test(text) && 'Marca responseTime',
  ]);
}

function summarizeParameterSnippet(code) {
  const assignments = Object.entries(extractAssignments(code))
    .filter(([key]) => /^global:/i.test(key))
    .map(([key, value]) => `${key}: ${value || 'vazio'}`);
  return assignments.slice(0, 6);
}

function summarizeGenericApiSnippet(code) {
  const assignments = Object.entries(extractAssignments(code)).slice(0, 5).map(([key, value]) => `${key}: ${value}`);
  const ifs = extractSnippetIfBlocks(code).slice(0, 2).map((item) => `IF ${item.expression}`);
  return compactLines([...ifs, ...assignments]).slice(0, 6);
}

function extractPlaceholderVariables(code) {
  return [...String(code ?? '').matchAll(/\{([^{}]+)\}/g)]
    .map((match) => match[1].trim())
    .filter(Boolean)
    .filter((item, index, list) => list.indexOf(item) === index);
}

function normalizeApiEdgeLabel(label, sourceAction, targetAction) {
  const source = `${sourceAction?.action ?? ''} ${sourceAction?.caption ?? ''}`;
  const target = `${targetAction?.action ?? ''} ${targetAction?.caption ?? ''}`;
  const raw = String(label || 'Default');
  if (/true/i.test(raw)) return 'True';
  if (/false/i.test(raw)) return 'False';
  if (/WORKFLOWDATA/i.test(target)) return 'Coleta';
  if (/CHAVES_?APIs|Chaves API/i.test(target)) return 'Chaves';
  if (/Cria[cç][aã]o de par[aâ]metros/i.test(target)) return 'Define';
  if (/Dados REQUEST/i.test(target)) return 'Request';
  if (/REST_API/i.test(target)) return 'Chama API';
  if (/Dados RESPONSE/i.test(target)) return 'Response';
  if (/dados CDR/i.test(target)) return 'CDR';
  if (/Ret OK/i.test(target)) return 'Valida';
  if (/Tratamento erro|Alerta/i.test(target)) return 'Erro';
  if (/RETURN/i.test(target)) return /Tratamento erro|Alerta/i.test(source) ? 'Return' : 'OK';
  return raw === 'Default' ? 'Segue' : raw;
}

function collectApiAttentionNodes(actions, nodes, edges) {
  const expected = [
    { id: 'missing_begin', test: actions.some((action) => action.action === 'BEGIN'), text: 'BEGIN nao encontrado' },
    { id: 'missing_rest', test: actions.some((action) => action.action === 'REST_API' || action.action === 'RUNSUB'), text: 'Chamada REST_API/RUNSUB nao encontrada' },
    { id: 'missing_return', test: actions.some((action) => action.action === 'RETURN'), text: 'RETURN nao encontrado' },
  ].filter((item) => !item.test);

  if (!expected.length) return;
  const firstNode = [...nodes.values()][0];
  expected.forEach((item, index) => {
    const node = makeJourneyNode({
      id: `attention_${item.id}`,
      kind: 'advanced',
      title: 'Ponto de atencao',
      lines: [item.text],
      actionId: firstNode?.actionId,
    });
    nodes.set(node.id, node);
    if (firstNode && index === 0) addEdge(edges, firstNode.id, node.id, 'Atencao');
  });
}

function collectMenuOptions(actions, actionsById, range, menu) {
  const caseOptions = [];
  const switchOptions = [];
  const directOptions = [];
  const menuRoutingVariables = getMenuRoutingVariables(actions, range, menu);

  getDirectMenuCaseBranches(menu).forEach((branch) => {
    const target = actionsById.get(Number(branch.actionId));
    directOptions.push({
      key: branch.text,
      actionId: Number(target?.actionId ?? branch.actionId),
      targetAction: target,
      output: summarizeActionOutput(target),
      source: 'MENU CaseBranches',
    });
  });

  actions
    .filter((action) => action.action === 'CASE' && actionInRange(Number(action.actionId), range))
    .forEach((action) => {
      (action.cases ?? []).forEach((branch) => {
        const target = actionsById.get(Number(branch.actionId));
        caseOptions.push({
          key: branch.text || `#${branch.index ?? caseOptions.length + 1}`,
          actionId: Number(target?.actionId ?? action.actionId),
          targetAction: target,
          output: summarizeActionOutput(target),
          source: 'CASE',
        });
      });
    });

  actions
    .filter((action) => action.action === 'SNIPPET' && actionInRange(Number(action.actionId), range))
    .forEach((action) => {
      extractSnippetSwitchCases(action.parameters?.[0] ?? '').forEach((item) => {
        if (!isMenuRoutingSwitch(item.switchValue, menuRoutingVariables)) return;
        switchOptions.push({
          key: item.caseValue,
          actionId: Number(action.actionId),
          targetAction: action,
          output: item.output,
          block: item.block,
          source: `SWITCH ${item.switchValue}`,
        });
      });
    });

  const switchByKey = new Map();
  switchOptions.forEach((option) => {
    const key = normalizeOptionKey(option.key);
    const current = switchByKey.get(key);
    if (!current || isMeaningfulOption(option)) {
      switchByKey.set(key, option);
    }
  });

  const filteredCaseOptions = caseOptions.filter((option) => {
    const switchOption = switchByKey.get(normalizeOptionKey(option.key));
    return !(switchOption && isMeaningfulOption(switchOption) && isGenericNextStepOption(option));
  });

  return dedupeOptions([...directOptions, ...switchOptions, ...filteredCaseOptions]);
}

function connectOptionDestination({ nodes, edges, outputNodes, optionNode, option, actionsById }) {
  const targetAction = option.targetAction;
  if (targetAction && ['RUNSUB', 'REST_API', 'WORKFLOWDATA'].includes(targetAction.action)) {
    const apiNode = makeJourneyNode({
      id: `api_${targetAction.actionId}`,
      kind: 'api',
      title: `API: ${cleanCaption(targetAction.caption || targetAction.action)}`,
      lines: linesForAction(targetAction, summarizeActionOutput(targetAction)),
      actionId: Number(targetAction.actionId),
    });
    nodes.set(apiNode.id, apiNode);
    addEdge(edges, optionNode.id, apiNode.id, 'API');
    connectDefaultActionDestination({ nodes, edges, outputNodes, sourceNode: apiNode, action: targetAction, actionsById });
    return;
  }

  if (targetAction && targetAction.action === 'IF') {
    const ruleNode = makeJourneyNode({
      id: `rule_${targetAction.actionId}`,
      kind: 'rule',
      title: `Regra: ${cleanCaption(targetAction.caption || 'IF')}`,
      lines: [targetAction.parameters?.[0] || 'IF sem expressao'],
      actionId: Number(targetAction.actionId),
    });
    nodes.set(ruleNode.id, ruleNode);
    addEdge(edges, optionNode.id, ruleNode.id, 'Regra');
    connectRuleBranches({ nodes, edges, outputNodes, ruleNode, action: targetAction, actionsById });
    return;
  }

  const output = option.block ? summarizeCodeOutput(option.block) : option.output;
  if (output.nextStep || output.audio || output.scriptpoint || output.transferCode) {
    const outputNode = getOutputNode(outputNodes, nodes, output, option.actionId);
    addEdge(edges, optionNode.id, outputNode.id, output.nextStep ? 'NEXT_STEP' : 'Saida');
    return;
  }

  if (targetAction && targetAction.action === 'SNIPPET' && isAdvancedSnippet(targetAction.parameters?.[0] ?? '')) {
    const advancedNode = makeJourneyNode({
      id: `advanced_${targetAction.actionId}`,
      kind: 'advanced',
      title: 'Logica avancada',
      lines: summarizeAdvancedSnippet(targetAction.parameters?.[0] ?? ''),
      actionId: Number(targetAction.actionId),
    });
    nodes.set(advancedNode.id, advancedNode);
    addEdge(edges, optionNode.id, advancedNode.id, 'Logica');
  }
}

function connectDefaultActionDestination({ nodes, edges, outputNodes, sourceNode, action, actionsById }) {
  const target = actionsById.get(Number(action.defaultNextAction?.actionId));
  if (!target) return;
  if (target.action === 'IF') {
    const ruleNode = makeJourneyNode({
      id: `rule_${target.actionId}`,
      kind: 'rule',
      title: `Regra: ${cleanCaption(target.caption || 'IF')}`,
      lines: [target.parameters?.[0] || 'IF sem expressao'],
      actionId: Number(target.actionId),
    });
    nodes.set(ruleNode.id, ruleNode);
    addEdge(edges, sourceNode.id, ruleNode.id, 'Retorno');
    connectRuleBranches({ nodes, edges, outputNodes, ruleNode, action: target, actionsById });
    return;
  }
  const output = summarizeActionOutput(target);
  if (output.nextStep || output.audio || output.scriptpoint || output.transferCode) {
    const outputNode = getOutputNode(outputNodes, nodes, output, Number(target.actionId));
    addEdge(edges, sourceNode.id, outputNode.id, 'Saida');
  }
}

function connectRuleBranches({ nodes, edges, outputNodes, ruleNode, action, actionsById }) {
  (action.branches ?? []).forEach((branch) => {
    const target = actionsById.get(Number(branch.actionId));
    const label = /true/i.test(branch.text) ? 'True' : /false/i.test(branch.text) ? 'False' : branch.text || 'Branch';
    const output = summarizeActionOutput(target);
    if (output.nextStep || output.audio || output.scriptpoint || output.transferCode) {
      const outputNode = getOutputNode(outputNodes, nodes, output, Number(target?.actionId ?? action.actionId));
      addEdge(edges, ruleNode.id, outputNode.id, label);
    }
  });
}

function collectRetries(actions, range) {
  const retries = [];
  actions
    .filter((action) => actionInRange(Number(action.actionId), range))
    .forEach((action) => {
      const text = `${action.action} ${action.caption ?? ''}`.toLowerCase();
      if (action.action === 'LOOP' && /sil/.test(text)) {
        retries.push({ kind: 'silence', actionId: Number(action.actionId), lines: [`Tentativas: ${action.parameters?.[0] || '-'}`] });
      }
      if (action.action === 'LOOP' && /rej/.test(text)) {
        retries.push({ kind: 'error', actionId: Number(action.actionId), lines: [`Tentativas: ${action.parameters?.[0] || '-'}`] });
      }
      if (action.action === 'SNIPPET' && /maxsil|sil/i.test(action.caption ?? '')) {
        const output = summarizeActionOutput(action);
        retries.push({ kind: 'silence', actionId: Number(action.actionId), lines: compactLines([output.audio && `Audio: ${output.audio}`, output.nextStep && `NEXT_STEP: ${output.nextStep}`]) });
      }
      if (action.action === 'SNIPPET' && /maxrej|rej/i.test(action.caption ?? '')) {
        const output = summarizeActionOutput(action);
        retries.push({ kind: 'error', actionId: Number(action.actionId), lines: compactLines([output.audio && `Audio: ${output.audio}`, output.nextStep && `NEXT_STEP: ${output.nextStep}`]) });
      }
    });
  return dedupeRetries(retries);
}

function getOutputNode(outputNodes, nodes, output, actionId) {
  const key = normalizeOutputKey(output);
  if (outputNodes.has(key)) return outputNodes.get(key);
  const node = makeJourneyNode({
    id: `output_${safeId(key)}`,
    kind: outputKind(output),
    title: outputTitle(output),
    lines: compactLines([
      output.audio && `Audio: ${output.audio}`,
      output.nextStep && `NEXT_STEP: ${output.nextStep}`,
      output.scriptpoint && `scriptpoint: ${output.scriptpoint}`,
      output.mapaDna && `MAPA_DNA: ${output.mapaDna}`,
      output.transferCode && `TransferCode: ${output.transferCode}`,
    ]),
    actionId,
  });
  outputNodes.set(key, node);
  nodes.set(node.id, node);
  return node;
}

function makeJourneyNode({ id, kind, title, lines = [], actionId }) {
  return {
    id,
    type: kind,
    title,
    lines: compactLines(lines),
    actionId,
  };
}

function createJourneyMermaidText(nodes, edges) {
  const nodeById = new Map(nodes.map((node) => [node.id, node]));
  const lines = [
    'flowchart TD',
    '  %% Fluxograma funcional NICE',
    ...nodes.map(nodeLine),
  ];

  dedupeEdges(edges).forEach((edge) => {
    lines.push(`  ${mermaidEdgeLine(edge, nodeById)}`);
  });

  nodes.forEach((node) => {
    lines.push(`  class ${mermaidNodeId(node.id)} ${classNameForType(node.type)};`);
  });
  lines.push(...classDefinitions());
  return lines.join('\n');
}

function getSortedActions(script) {
  return [...(script?.actions ?? [])].sort((a, b) => Number(a.actionId) - Number(b.actionId));
}

function actionRangeForMenu(menuActionIds, index) {
  return {
    start: menuActionIds[index] ?? Number.NEGATIVE_INFINITY,
    end: menuActionIds[index + 1] ?? Number.POSITIVE_INFINITY,
  };
}

function actionInRange(actionId, range) {
  if (!Number.isFinite(actionId)) return true;
  return actionId >= range.start && actionId < range.end;
}

function normalizeOptionKey(value) {
  return String(value ?? '').trim().toUpperCase();
}

function getMenuRoutingVariables(actions, range, menu) {
  const variables = new Set(['MRES', 'OP_ESCOLHIDA']);
  const responseVariable = normalizeVariableName(menu?.parameters?.[7]);
  if (responseVariable) variables.add(responseVariable);

  actions
    .filter((action) => actionInRange(Number(action.actionId), range))
    .forEach((action) => {
      if (action.action === 'LOCATE') {
        [action.parameters?.[1], action.parameters?.[2]].forEach((value) => {
          const variable = normalizeVariableName(value);
          if (variable) variables.add(variable);
        });
      }
      if (action.action === 'CASE') {
        const variable = normalizeVariableName(action.parameters?.[0]);
        if (variable) variables.add(variable);
      }
    });

  return variables;
}

function isMenuRoutingSwitch(switchValue, menuRoutingVariables) {
  const variable = normalizeVariableName(switchValue);
  if (!variable) return false;
  return menuRoutingVariables.has(variable);
}

function normalizeVariableName(value) {
  return String(value ?? '')
    .replace(/[{}"']/g, '')
    .trim()
    .split(/\s+/)[0]
    .replace(/^global:/i, '')
    .toUpperCase();
}

function isGenericNextStep(value) {
  const text = String(value ?? '')
    .replace(/[{}"]/g, '')
    .trim()
    .toUpperCase();
  return text === 'NEXT_STEP';
}

function isMeaningfulOption(option) {
  const output = option?.output ?? {};
  return Boolean(
    output.audio ||
      output.scriptpoint ||
      output.transferCode ||
      (output.nextStep && !isGenericNextStep(output.nextStep))
  );
}

function isGenericNextStepOption(option) {
  const target = option?.targetAction;
  if (isGenericNextStep(option?.output?.nextStep)) return true;
  return target?.action === 'RUNSCRIPT' && isGenericNextStep(target.parameters?.[0]);
}

function dedupeOptions(options) {
  const seen = new Set();
  return options.filter((option) => {
    const key = `${option.key}:${option.output.nextStep || option.output.audio || option.output.scriptpoint || option.actionId}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function dedupeRetries(retries) {
  const seen = new Set();
  return retries.filter((retry) => {
    const key = `${retry.kind}:${retry.actionId}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function summarizeAdvancedSnippet(code) {
  const switches = extractSnippetSwitchCases(code);
  const ifs = extractSnippetIfBlocks(code);
  const assignments = Object.keys(extractAssignments(code));
  return compactLines([
    switches.length ? `Cases: ${switches.map((item) => item.caseValue).slice(0, 8).join(', ')}` : '',
    ifs.length ? `IFs: ${ifs.map((item) => item.expression).slice(0, 2).join(' | ')}` : '',
    assignments.length ? `Variaveis: ${assignments.slice(0, 8).join(', ')}` : '',
  ]);
}

function normalizeOutputKey(output) {
  return output.nextStep || output.audio || output.transferCode || output.scriptpoint || 'saida';
}

function outputKind(output) {
  const text = `${output.nextStep ?? ''} ${output.audio ?? ''} ${output.transferCode ?? ''}`.toLowerCase();
  if (/erro|error|rej|maxrej/.test(text)) return 'error';
  if (/sil|timeout/.test(text)) return 'silence';
  return 'output';
}

function outputTitle(output) {
  const text = `${output.nextStep ?? ''} ${output.audio ?? ''} ${output.transferCode ?? ''}`.toLowerCase();
  if (/transfer/.test(text)) return 'Transferencia / proximo fluxo';
  if (/tchau|desliga|final/.test(text)) return 'Saida final';
  return 'Proximo fluxo';
}

function makeActionNode(action) {
  const type = classifyAction(action);
  if (!type) return null;
  const output = summarizeActionOutput(action);
  return {
    id: `action_${action.actionId}`,
    type,
    title: titleForAction(action, type),
    lines: compactLines(linesForAction(action, output)),
    actionId: Number(action.actionId),
  };
}

function classifyAction(action) {
  if (action.action === 'BEGIN') return 'start';
  if (action.action === 'MENU') return 'menu';
  if (action.action === 'CASE') return 'optionHub';
  if (action.action === 'IF') return 'rule';
  if (['RUNSUB', 'REST_API', 'WORKFLOWDATA'].includes(action.action)) return 'api';
  if (['RUNSCRIPT', 'RETURN', 'PLAY'].includes(action.action)) return 'output';
  if (action.action === 'ONRELEASE') return 'onrelease';
  if (action.action === 'LOOP' && /sil/i.test(action.caption)) return 'silence';
  if (action.action === 'LOOP' && /rej/i.test(action.caption)) return 'error';
  if (action.action === 'SNIPPET' && /maxsil|sil/i.test(action.caption)) return 'silence';
  if (action.action === 'SNIPPET' && /maxrej|rej/i.test(action.caption)) return 'error';
  if (action.action === 'SNIPPET' && /\bSWITCH\b/i.test(action.parameters?.[0] ?? '')) return 'optionHub';
  if (action.action === 'SNIPPET' && /\bIF\b/i.test(action.parameters?.[0] ?? '')) return 'rule';
  if (action.action === 'SNIPPET' && isOutputSnippet(action.parameters?.[0] ?? '', action.caption)) return 'output';
  if (action.action === 'ASSIGN') return 'output';
  return null;
}

function titleForAction(action, type) {
  if (type === 'start') return 'Inicio';
  if (type === 'menu') return cleanCaption(action.caption || 'Menu');
  if (type === 'optionHub') return cleanCaption(action.caption || 'Roteamento de opcoes');
  if (type === 'rule') return cleanCaption(action.caption || 'Regra / IF');
  if (type === 'api') return cleanCaption(action.caption || action.action);
  if (type === 'output') return cleanCaption(action.caption || 'Saida');
  if (type === 'error') return cleanCaption(action.caption || 'Erro / REJ');
  if (type === 'silence') return cleanCaption(action.caption || 'Silencio');
  if (type === 'onrelease') return 'OnRelease';
  return cleanCaption(action.caption || action.action);
}

function linesForAction(action, output) {
  if (action.action === 'MENU') {
    return [
      `Audio: ${action.parameters?.[0] || 'nao informado'}`,
      `Resposta: ${action.parameters?.[7] || 'MRES'}`,
      `Timeout: ${action.parameters?.[5] || '-'}`,
    ];
  }
  if (action.action === 'IF') return [`IF ${action.parameters?.[0] || 'sem expressao'}`];
  if (action.action === 'RUNSUB') {
    return [
      `Script: ${action.parameters?.[0] || 'nao informado'}`,
      `Retorno: ${action.parameters?.[2] || 'RTN'}`,
      `Params: ${(action.parameters ?? []).slice(3).join(', ')}`,
    ];
  }
  if (action.action === 'REST_API') {
    return [
      `${action.parameters?.[4] || 'REST'} ${action.parameters?.[1] || ''}`,
      `Timeout: ${action.parameters?.[5] || '-'}`,
      `Result: ${action.parameters?.[6] || '-'}`,
    ];
  }
  if (action.action === 'RUNSCRIPT') return [`Script: ${action.parameters?.[0] || output.nextStep || 'nao informado'}`];
  if (action.action === 'PLAY') return [`Audio: ${action.parameters?.[0] || 'nao informado'}`];
  return [
    output.audio && `Audio: ${output.audio}`,
    output.nextStep && `NEXT_STEP: ${output.nextStep}`,
    output.scriptpoint && `scriptpoint: ${output.scriptpoint}`,
    output.mapaDna && `MAPA_DNA: ${output.mapaDna}`,
    output.transferCode && `TransferCode: ${output.transferCode}`,
  ];
}

function addOutputForAssignments(nodes, edges, source, code, idPrefix, actionId, label = 'Saida') {
  const output = summarizeCodeOutput(code);
  if (!output.nextStep && !output.audio && !output.scriptpoint && !output.transferCode) return;
  const node = createOutputNodeFromAssignments(output, idPrefix, actionId);
  nodes.set(node.id, node);
  addEdge(edges, source, node.id, output.nextStep ? 'NEXT_STEP' : label);
}

export function createOutputNodeFromAssignments(output, idPrefix, actionId) {
  const isTransfer = /transfer/i.test(output.nextStep || output.audio || output.transferCode || '');
  const isError = /erro|rej|maxrej/i.test(output.nextStep || output.audio || output.transferCode || '');
  return {
    id: `output_${safeId(idPrefix)}_${safeId(output.nextStep || output.audio || output.scriptpoint || 'saida')}`,
    type: isError ? 'error' : 'output',
    title: isTransfer ? 'Transferencia / proximo fluxo' : 'Saida / proximo fluxo',
    lines: compactLines([
      output.audio && `Audio: ${output.audio}`,
      output.nextStep && `NEXT_STEP: ${output.nextStep}`,
      output.scriptpoint && `scriptpoint: ${output.scriptpoint}`,
      output.mapaDna && `MAPA_DNA: ${output.mapaDna}`,
      output.transferCode && `TransferCode: ${output.transferCode}`,
    ]),
    actionId,
  };
}

function createMermaidText(nodes, edges, options = {}) {
  if (options.summary) return createSummaryMermaidText(nodes, edges);
  const nodeById = new Map(nodes.map((node) => [node.id, node]));

  const lines = [
    'flowchart TD',
    '  %% Fluxograma funcional NICE gerado a partir do canvas',
    '  subgraph Entrada',
    '    direction TB',
    ...nodes.filter((node) => ['start', 'menu'].includes(node.type)).map(nodeLine),
    '  end',
    '  subgraph Opcoes',
    '    direction TB',
    ...nodes.filter((node) => ['optionHub', 'option'].includes(node.type)).map(nodeLine),
    '  end',
    '  subgraph Regras_APIs',
    '    direction TB',
    ...nodes.filter((node) => ['rule', 'api', 'advanced'].includes(node.type)).map(nodeLine),
    '  end',
    '  subgraph Saidas',
    '    direction TB',
    ...nodes.filter((node) => ['output', 'error', 'silence', 'onrelease'].includes(node.type)).map(nodeLine),
    '  end',
  ];

  edges.forEach((edge) => {
    lines.push(`  ${mermaidEdgeLine(edge, nodeById)}`);
  });

  nodes.forEach((node) => {
    lines.push(`  class ${mermaidNodeId(node.id)} ${classNameForType(node.type)};`);
  });
  lines.push(...classDefinitions());
  return lines.join('\n');
}

function nodeLine(node) {
  return `    ${mermaidNodeId(node.id)}${nodeShape(node)}`;
}

function nodeShape(node) {
  const label = nodeLabel(node);
  if (node.type === 'start') return `(["${label}"])`;
  if (node.type === 'rule') return `{"${label}"}`;
  if (['option', 'optionHub'].includes(node.type)) return `(["${label}"])`;
  if (['output', 'error', 'reject', 'silence'].includes(node.type)) return `(["${label}"])`;
  return `["${label}"]`;
}

function nodeLabel(node) {
  const maxLines = node.type === 'api' ? 6 : node.type === 'start' ? 4 : 3;
  return [node.title, ...(node.lines ?? []).slice(0, maxLines)]
    .map(sanitizeMermaidLabel)
    .filter(Boolean)
    .join('<br/>');
}

function classDefinitions() {
  return [
    '  classDef start fill:#dcfce7,stroke:#16a34a,stroke-width:2px,color:#14532d;',
    '  classDef menu fill:#dbeafe,stroke:#2563eb,stroke-width:2px,color:#0f172a;',
    '  classDef router fill:#ede9fe,stroke:#6d28d9,stroke-width:2px,color:#312e81;',
    '  classDef option fill:#f3e8ff,stroke:#7c3aed,stroke-width:2px,color:#0f172a;',
    '  classDef rule fill:#ccfbf1,stroke:#0f766e,stroke-width:2px,color:#0f172a;',
    '  classDef api fill:#cffafe,stroke:#0891b2,stroke-width:2px,color:#0f172a;',
    '  classDef output fill:#f1f5f9,stroke:#475569,stroke-width:2px,color:#0f172a;',
    '  classDef error fill:#fee2e2,stroke:#dc2626,stroke-width:2px,color:#7f1d1d;',
    '  classDef reject fill:#fee2e2,stroke:#dc2626,stroke-width:2px,color:#7f1d1d;',
    '  classDef silence fill:#fef3c7,stroke:#d97706,stroke-width:2px,color:#78350f;',
    '  classDef onrelease fill:#f3e8ff,stroke:#9333ea,stroke-width:2px,color:#581c87;',
    '  classDef hub fill:#e0f2fe,stroke:#0284c7,stroke-width:2px,color:#0c4a6e;',
    '  classDef advanced fill:#fff7ed,stroke:#ea580c,stroke-width:2px,color:#7c2d12;',
  ];
}

function classNameForType(type) {
  if (['optionHub', 'option'].includes(type)) return 'option';
  if (type === 'advanced') return 'advanced';
  if (type === 'reject') return 'error';
  return type;
}

function createSummaryMermaidText(nodes, edges) {
  const sortedNodes = [...nodes].sort((a, b) => {
    const ay = Number(a.position?.y ?? 0);
    const by = Number(b.position?.y ?? 0);
    const ax = Number(a.position?.x ?? 0);
    const bx = Number(b.position?.x ?? 0);
    return ay - by || ax - bx || String(a.title).localeCompare(String(b.title));
  });
  const sortedEdges = sortMermaidEdges(edges, nodes);
  const nodeById = new Map(sortedNodes.map((node) => [node.id, node]));
  const lines = [
    'flowchart TD',
    '  %% Fluxograma documental NICE - ordem orientada pela jornada',
    ...sortedNodes.map(nodeLine),
  ];

  sortedEdges.forEach((edge) => {
    lines.push(`  ${mermaidEdgeLine(edge, nodeById)}`);
  });

  sortedNodes.forEach((node) => {
    lines.push(`  class ${mermaidNodeId(node.id)} ${classNameForType(node.type)};`);
  });
  lines.push(...classDefinitions());
  return lines.join('\n');
}

function createSafeMermaidText(nodes, edges) {
  const sortedNodes = [...nodes].sort((a, b) => {
    const ay = Number(a.position?.y ?? 0);
    const by = Number(b.position?.y ?? 0);
    const ax = Number(a.position?.x ?? 0);
    const bx = Number(b.position?.x ?? 0);
    return ay - by || ax - bx || String(a.title).localeCompare(String(b.title));
  });
  const knownIds = new Set(sortedNodes.map((node) => node.id));
  const lines = [
    'flowchart TD',
    '  %% Fluxograma Mermaid simplificado para compatibilidade',
    ...sortedNodes.map((node) => `  ${mermaidNodeId(node.id)}["${sanitizeMermaidLabel(node.title || 'Fluxo')}"]`),
  ];

  dedupeEdges(edges)
    .filter((edge) => knownIds.has(edge.source) && knownIds.has(edge.target))
    .forEach((edge) => {
      lines.push(`  ${mermaidNodeId(edge.source)} --> ${mermaidNodeId(edge.target)}`);
    });

  return lines.join('\n');
}

function sortMermaidEdges(edges, nodes) {
  const nodeById = new Map(nodes.map((node) => [node.id, node]));
  return [...edges].sort((a, b) => {
    const sourceA = nodeById.get(a.source);
    const sourceB = nodeById.get(b.source);
    const targetA = nodeById.get(a.target);
    const targetB = nodeById.get(b.target);
    const ay = Number(sourceA?.position?.y ?? 0);
    const by = Number(sourceB?.position?.y ?? 0);
    const ax = Number(sourceA?.position?.x ?? 0);
    const bx = Number(sourceB?.position?.x ?? 0);
    const targetAy = Number(targetA?.position?.y ?? 0);
    const targetBy = Number(targetB?.position?.y ?? 0);
    return ay - by || ax - bx || targetAy - targetBy || String(a.label).localeCompare(String(b.label));
  });
}

function mermaidEdgeLine(edge, nodeById = new Map()) {
  const source = mermaidNodeId(edge.source);
  const target = mermaidNodeId(edge.target);
  const label = sanitizeMermaidEdgeLabel(edge.label || 'Default');
  const operator = getMermaidEdgeOperator(edge, nodeById);
  if (operator === '==>') return `${source} == ${label} ==> ${target}`;
  if (operator === '-.->') return `${source} -. ${label} .-> ${target}`;
  if (operator === '--x') return `${source} -- ${label} --x ${target}`;
  return `${source} -->|${label}| ${target}`;
}

function getMermaidEdgeOperator(edge, nodeById = new Map()) {
  const label = normalizeMermaidSemanticText(edge?.label);
  const sourceText = nodeSemanticText(nodeById.get(edge?.source));
  const targetText = nodeSemanticText(nodeById.get(edge?.target));
  const combined = `${label} ${sourceText} ${targetText}`;

  if (/\b(api fechada|bloqueio|bloq|nok|tchau|finaliza|finalizado|cancelado|encerra|encerramento)\b/.test(combined)) {
    return '--x';
  }

  if (/\b(false|erro|error|rej|maxrej|sil|timeout|alerta|tratamento erro|exception|falha|failed)\b/.test(combined)) {
    return '-.->';
  }

  if (/\b(true|ok|sucesso|success|next step|return|retorno esperado)\b/.test(combined)) {
    return '==>';
  }

  if (label === 'segue' && !/\b(logica|resumo|atencao)\b/.test(targetText)) {
    return '==>';
  }

  return '-->';
}

function nodeSemanticText(node) {
  if (!node) return '';
  return normalizeMermaidSemanticText([
    node.type,
    node.title,
    ...(node.lines ?? []),
  ].filter(Boolean).join(' '));
}

function normalizeMermaidSemanticText(value) {
  return String(value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/_/g, ' ')
    .toLowerCase();
}

function isReturnEdge(edge) {
  const label = String(edge?.label ?? '').toLowerCase();
  return /repete|retorna|volta|retry/.test(label);
}

function mermaidEdgeColor(edge) {
  const label = String(edge?.label ?? '').toLowerCase();
  const className = String(edge?.className ?? '').toLowerCase();
  if (className.includes('success') || /true|ok|sucesso/.test(label)) return '#16a34a';
  if (className.includes('warning') || /timeout|sil/.test(label)) return '#d97706';
  if (className.includes('error') || /false|erro|rej/.test(label)) return '#dc2626';
  if (/case|opcao|opção|dtmf/.test(label)) return '#7c3aed';
  return '#64748b';
}

function getOutgoing(action) {
  const cases = action.action === 'MENU' ? getDirectMenuCaseBranches(action) : (action.cases ?? []);
  return [
    action.defaultNextAction ? { ...action.defaultNextAction, label: 'Default' } : null,
    ...(action.branches ?? []).map((branch) => ({ ...branch, label: branch.text || `Branch ${branch.index}` })),
    ...cases.map((branch) => ({ ...branch, label: branch.text ? `Case ${branch.text}` : 'Case' })),
  ].filter(Boolean);
}

function summarizeActionCode(action) {
  if (!action) return '';
  if (action.action === 'ASSIGN') return `ASSIGN ${action.parameters?.[0] ?? ''} = ${action.parameters?.[1] ?? ''}`;
  if (action.action === 'RUNSCRIPT') return `ASSIGN NEXT_STEP = ${action.parameters?.[0] ?? ''}`;
  if (action.action === 'PLAY') return `ASSIGN AUDIO = ${action.parameters?.[0] ?? ''}`;
  return action.parameters?.[0] ?? '';
}

function summarizeActionOutput(action) {
  return summarizeCodeOutput(summarizeActionCode(action));
}

function summarizeCodeOutput(code) {
  const assignments = extractAssignments(code);
  return {
    audio: firstAssignment(assignments, ['AUDIO', 'audio']),
    nextStep: firstAssignment(assignments, ['NEXT_STEP', 'next_step']),
    scriptpoint: firstAssignment(assignments, ['scriptpoint']),
    mapaDna: firstAssignment(assignments, ['MAPA_DNA', 'mapa_dna', 'global:MAPA_DNA']),
    transferCode: firstAssignment(assignments, ['TRANSFERCODE', 'TransferCode', 'transferCode']),
  };
}

export function extractAssignments(code) {
  const assignments = {};
  const pattern = /(?:^|\n|\{)\s*(?:ASSIGN\s+)?([A-Za-z_][\w:]*|global:[A-Za-z_][\w:]*)\s*=\s*("[^"]*"|'[^']*'|[^\r\n}]+)/gi;
  for (const match of String(code ?? '').matchAll(pattern)) {
    assignments[match[1]] = cleanValue(match[2]);
  }
  return assignments;
}

export function extractSnippetSwitchCases(code) {
  const text = stripCommentLines(code);
  const switchMatch = text.match(/\bSWITCH\s+([^\r\n{]+)/i);
  const switchValue = switchMatch?.[1]?.trim() || 'SWITCH';
  const casePattern = /\bCASE\s+"?([^"\r\n{]+)"?\s*\{/gi;
  const matches = [...text.matchAll(casePattern)];
  return matches.map((match) => {
    const openBrace = text.indexOf('{', match.index);
    const end = findMatchingBrace(text, openBrace);
    const block = end > openBrace ? text.slice(openBrace + 1, end) : '';
    return {
      switchValue,
      caseValue: match[1].trim(),
      block,
      output: summarizeCodeOutput(block),
    };
  });
}

export function extractSnippetIfBlocks(code) {
  const text = String(code ?? '');
  const matches = [];
  const pattern = /\bIF\s+([^\r\n{]+)\s*\{/gi;
  for (const match of text.matchAll(pattern)) {
    const trueStart = match.index + match[0].length;
    const trueEnd = findMatchingBrace(text, trueStart - 1);
    if (trueEnd < 0) continue;
    const afterTrue = text.slice(trueEnd + 1);
    const elseMatch = afterTrue.match(/^\s*ELSE\s*\{/i);
    let falseBlock = '';
    if (elseMatch) {
      const falseStart = trueEnd + 1 + elseMatch[0].length;
      const falseEnd = findMatchingBrace(text, falseStart - 1);
      if (falseEnd > falseStart) falseBlock = text.slice(falseStart, falseEnd);
    }
    matches.push({
      expression: match[1].trim(),
      trueBlock: text.slice(trueStart, trueEnd),
      falseBlock,
    });
  }
  return matches;
}

export function extractSnippetOutputs(code) {
  return summarizeCodeOutput(code);
}

function extractInlineStatements(code, keyword) {
  const pattern = new RegExp(`\\b${keyword}\\s+([^\\r\\n{]+)`, 'gi');
  return [...String(code ?? '').matchAll(pattern)].map((match) => match[1].trim());
}

function isAdvancedSnippet(code) {
  return /\b(IF|SWITCH|CASE|FOREACH|FUNCTION|DYNAMIC)\b/i.test(code) && String(code ?? '').length > 120;
}

function isOutputSnippet(code, caption = '') {
  return /parametros de saida|maxrej|maxsil|set |saida|tchau|transfer/i.test(caption)
    || /\b(NEXT_STEP|AUDIO|TRANSFERCODE|scriptpoint|MAPA_DNA)\b/i.test(code);
}

function findMatchingBrace(text, openIndex) {
  let depth = 0;
  for (let index = openIndex; index < text.length; index += 1) {
    if (text[index] === '{') depth += 1;
    if (text[index] === '}') depth -= 1;
    if (depth === 0) return index;
  }
  return -1;
}

function firstAssignment(assignments, names) {
  const lowerMap = new Map(Object.entries(assignments).map(([key, value]) => [key.toLowerCase(), value]));
  for (const name of names) {
    if (lowerMap.has(name.toLowerCase())) return lowerMap.get(name.toLowerCase());
  }
  return '';
}

function addEdge(edges, source, target, label) {
  if (!source || !target || source === target) return;
  edges.push({ source, target, label: label || 'Default' });
}

function dedupeEdges(edges) {
  const seen = new Set();
  return edges.filter((edge) => {
    const key = `${edge.source}->${edge.target}:${edge.label}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function fallbackNodesFromDocumentation(flow) {
  return (flow?.nodes ?? []).map((node) => ({
    id: node.id,
    type: node.data?.docType ?? 'output',
    title: node.data?.title ?? 'Fluxo',
    lines: [node.data?.subtitle, ...(node.data?.details ?? []).slice(0, 3).map((item) => `${item.label}: ${item.value}`)].filter(Boolean),
    actionId: node.data?.actionIds?.[0],
    position: node.position,
  }));
}

function compactLines(lines) {
  return lines.filter((line) => line && String(line).trim()).map((line) => String(line).trim());
}

function mermaidNodeId(value) {
  return `N_${String(value).replace(/[^a-zA-Z0-9_]/g, '_')}`;
}

function sanitizeMermaidLabel(value) {
  return String(value ?? '')
    .replace(/<br\s*\/?>/gi, ' ')
    .replace(/"/g, "'")
    .replace(/[{}[\]|]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 92);
}

function sanitizeMermaidEdgeLabel(value) {
  return String(value ?? '')
    .replace(/<br\s*\/?>/gi, ' ')
    .replace(/"/g, "'")
    .replace(/[{}[\]|]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 220);
}

function safeId(value) {
  return String(value ?? 'item')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9_]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 64) || 'item';
}

function cleanCaption(value) {
  return String(value || '').replace(/_/g, ' ').trim() || 'Action';
}

function cleanValue(value) {
  return String(value ?? '')
    .trim()
    .replace(/\s*\/\/.*$/, '')
    .replace(/^"|"$/g, '')
    .replace(/^'|'$/g, '')
    .trim();
}

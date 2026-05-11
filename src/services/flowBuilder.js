import { MarkerType } from '@xyflow/react';
import { classifyDestination } from '../utils/classifyDestination.js';
import { layoutFlow } from '../utils/layoutFlow.js';
import { makeId, shortenLabel } from '../utils/normalizeText.js';

export function buildFlow(parsedData, selectedStateName, mode = 'stateView', options = {}) {
  const selectedState = parsedData?.states?.find((state) => state.sheetName === selectedStateName);
  if (!parsedData || !selectedState) return { nodes: [], edges: [] };

  const showChangeColors = Boolean(options.showChangeColors);
  const graph = mode === 'detailedView'
    ? buildDetailedView(parsedData, selectedState, showChangeColors)
    : buildStateView(parsedData, selectedState, showChangeColors);

  const laidOut = layoutFlow(graph.nodes, graph.edges, mode);
  return { nodes: laidOut.nodes, edges: laidOut.edges };
}

function buildStateView(parsedData, state, showChangeColors) {
  const nodes = [
    makeNode(`state-${state.id}`, 'stateNode', state.sheetName, {
      role: 'origin',
      nodeType: 'state',
      state,
      sheetName: state.sheetName,
      warningTargetRows: state.transitions.map((transition) => transition.rowNumber),
      transitionIds: state.transitions.map((transition) => transition.id),
      level: 0,
    }),
  ];
  const edges = [];
  const nodeIds = new Set(nodes.map((node) => node.id));
  const grouped = new Map();

  state.transitions.forEach((transition) => {
    const type = classifyDestination(transition.to, parsedData.sheetNames, state.sheetName);
    if (type === 'empty') return;
    const targetLabel = type === 'self' ? state.sheetName : transition.to;
    const key = `${type}:${targetLabel}`;
    const group = grouped.get(key) ?? { type, label: targetLabel, transitions: [] };
    group.transitions.push(transition);
    grouped.set(key, group);
  });

  [...grouped.values()].forEach((group, index) => {
    const targetId = group.type === 'self' ? `state-${state.id}` : `target-${makeId(group.label)}-${index}`;
    const changeColors = getTransitionChangeColors(group.transitions);
    const changeColor = showChangeColors ? changeColors[0] : '';
    const biMarkings = getTransitionBiMarkings(group.transitions);

    if (!nodeIds.has(targetId)) {
      nodes.push(makeNode(targetId, nodeTypeForDestination(group.type), group.label, {
        nodeType: group.type,
        transitions: group.transitions,
        biMarkings,
        sheetName: state.sheetName,
        warningTargetRows: group.transitions.map((transition) => transition.rowNumber),
        transitionIds: group.transitions.map((transition) => transition.id),
        hasChangeColor: changeColors.length > 0,
        changeColors,
        changeColor,
        level: 1,
      }));
      nodeIds.add(targetId);
    } else if (group.type === 'self' && changeColors.length > 0) {
      nodes[0] = {
        ...nodes[0],
        data: {
          ...nodes[0].data,
          hasChangeColor: true,
          changeColors,
          changeColor,
          warningTargetRows: group.transitions.map((transition) => transition.rowNumber),
          transitionIds: group.transitions.map((transition) => transition.id),
        },
      };
    }

    const prompts = [...new Set(group.transitions.map((item) => item.prompt).filter(Boolean))];
    const first = group.transitions[0];
    edges.push(makeEdge({
      id: `edge-${state.id}-${targetId}`,
      source: `state-${state.id}`,
      target: targetId,
      label: formatConditions(first.conditions),
      prompt: prompts.slice(0, 2).join(', '),
      transitions: group.transitions,
      biMarkings,
      changeColors,
      type: group.type,
    }));
  });

  return { nodes, edges };
}

function buildDetailedView(parsedData, state, showChangeColors) {
  if (state.decisionTree?.length) return buildDetailedViewFromTree(parsedData, state, showChangeColors);

  const nodes = [
    makeNode(`state-${state.id}`, 'stateNode', state.sheetName, {
      role: 'origin',
      nodeType: 'state',
      state,
      sheetName: state.sheetName,
      warningTargetRows: state.transitions.map((transition) => transition.rowNumber),
      transitionIds: state.transitions.map((transition) => transition.id),
      level: 0,
    }),
  ];
  const edges = [];
  const nodeIds = new Set(nodes.map((node) => node.id));
  const pathNodes = new Map();

  state.transitions.forEach((transition, transitionIndex) => {
    let previousId = `state-${state.id}`;

    transition.conditions.forEach((condition, conditionIndex) => {
      const pathKey = transition.conditions.slice(0, conditionIndex + 1).join('>');
      const nodeId = pathNodes.get(pathKey) ?? `cond-${state.id}-${pathNodes.size}`;
      if (!pathNodes.has(pathKey)) pathNodes.set(pathKey, nodeId);

      if (!nodeIds.has(nodeId)) {
        nodes.push(makeNode(nodeId, 'conditionNode', condition, {
          nodeType: 'condition',
          condition,
          sheetName: state.sheetName,
          warningTargetRows: [transition.rowNumber],
          transitionIds: [transition.id],
          level: conditionIndex + 1,
        }));
        nodeIds.add(nodeId);
      }

      const edgeId = `edge-${previousId}-${nodeId}`;
      if (!edges.some((edge) => edge.id === edgeId)) {
        edges.push(makeEdge({ id: edgeId, source: previousId, target: nodeId, label: condition }));
      }
      previousId = nodeId;
    });

    const targetId = ensureDestinationNode({ parsedData, state, showChangeColors, nodes, nodeIds, transition, transitionIndex });
    const type = classifyDestination(transition.to, parsedData.sheetNames, state.sheetName);

    edges.push(makeEdge({
      id: `edge-${previousId}-${targetId}-${transitionIndex}`,
      source: previousId,
      target: targetId,
      label: transition.prompt || 'Sem prompt',
      prompt: transition.prompt,
      transitions: [transition],
      biMarkings: transition.hasBiMarking ? [transition] : [],
      changeColors: transition.changeColor ? [transition.changeColor] : [],
      type,
    }));

    ensureTrailingBiNode({ nodes, edges, nodeIds, state, transition, sourceId: targetId, level: transition.conditions.length + 2 });
  });

  return { nodes, edges };
}

function buildDetailedViewFromTree(parsedData, state, showChangeColors) {
  const nodes = [
    makeNode(`state-${state.id}`, 'stateNode', state.sheetName, {
      role: 'origin',
      nodeType: 'state',
      state,
      sheetName: state.sheetName,
      warningTargetRows: state.transitions.map((transition) => transition.rowNumber),
      transitionIds: state.transitions.map((transition) => transition.id),
      level: 0,
    }),
  ];
  const edges = [];
  const nodeIds = new Set(nodes.map((node) => node.id));
  const transitionsById = new Map(state.transitions.map((transition) => [transition.id, transition]));

  function visit(decisionNodes, parentId, depth) {
    decisionNodes.forEach((decision, index) => {
      const conditionId = `decision-${state.id}-${decision.id}`;
      if (!nodeIds.has(conditionId)) {
        nodes.push(makeNode(conditionId, 'conditionNode', decision.text, {
          nodeType: 'condition',
          condition: decision.text,
          decision,
          sheetName: state.sheetName,
          rowNumber: decision.rowNumber,
          warningTargetRows: [decision.rowNumber],
          transitionIds: decision.transitionId ? [decision.transitionId] : [],
          level: depth,
        }));
        nodeIds.add(conditionId);
      }

      const edgeId = `edge-${parentId}-${conditionId}-${index}`;
      if (!edges.some((edge) => edge.id === edgeId)) {
        edges.push(makeEdge({
          id: edgeId,
          source: parentId,
          target: conditionId,
          label: decision.branchValue || decision.text,
          sheetName: state.sheetName,
          rowNumber: decision.rowNumber,
          warningTargetRows: [decision.rowNumber],
        }));
      }

      if (decision.destination) {
        const transition = transitionsById.get(decision.transitionId);
        const targetId = ensureDestinationNode({
          parsedData,
          state,
          showChangeColors,
          nodes,
          nodeIds,
          transition,
          decision,
        });
        const type = classifyDestination(decision.destination, parsedData.sheetNames, state.sheetName);

        edges.push(makeEdge({
          id: `edge-${conditionId}-${targetId}-${decision.rowNumber}`,
          source: conditionId,
          target: targetId,
          label: decision.prompt || decision.destination,
          prompt: decision.prompt,
          transitions: transition ? [transition] : [],
          biMarkings: transition?.hasBiMarking ? [transition] : [],
          changeColors: transition?.changeColor ? [transition.changeColor] : [],
          type,
        }));

        if (transition) {
          ensureTrailingBiNode({ nodes, edges, nodeIds, state, transition, sourceId: targetId, level: depth + 2 });
        }
      }

      if (decision.children?.length) {
        visit(decision.children, conditionId, depth + 1);
      }
    });
  }

  visit(state.decisionTree, `state-${state.id}`, 1);
  return { nodes, edges };
}

function ensureDestinationNode({ parsedData, state, showChangeColors, nodes, nodeIds, transition, transitionIndex = 0, decision = null }) {
  const destination = transition?.to ?? decision?.destination ?? '';
  const rowNumber = transition?.rowNumber ?? decision?.rowNumber ?? transitionIndex;
  const type = classifyDestination(destination, parsedData.sheetNames, state.sheetName);
  const targetLabel = type === 'self' ? state.sheetName : destination;
  const targetId = type === 'self'
    ? `state-${state.id}`
    : `detail-target-${makeId(targetLabel)}-${rowNumber}`;

  if (!nodeIds.has(targetId)) {
    nodes.push(makeNode(targetId, nodeTypeForDestination(type), targetLabel, {
      nodeType: type,
      transition,
      sheetName: state.sheetName,
      rowNumber,
      warningTargetRows: [rowNumber],
      transitionIds: transition?.id ? [transition.id] : [],
      hasChangeColor: Boolean(transition?.hasChangeColor),
      changeColors: transition?.changeColor ? [transition.changeColor] : [],
      changeColor: showChangeColors ? transition?.changeColor : '',
      level: (transition?.conditions?.length ?? decision?.level ?? 0) + 1,
    }));
    nodeIds.add(targetId);
  }

  return targetId;
}

function ensureTrailingBiNode({ nodes, edges, nodeIds, state, transition, sourceId, level }) {
  if (!transition?.hasBiMarking) return '';

  const biNodeId = `bi-${state.id}-${transition.rowNumber}`;
  if (!nodeIds.has(biNodeId)) {
    nodes.push(makeBiNode(biNodeId, transition, state.sheetName, level));
    nodeIds.add(biNodeId);
  }

  const edgeId = `edge-${sourceId}-${biNodeId}-${transition.rowNumber}`;
  if (!edges.some((edge) => edge.id === edgeId)) {
    edges.push(makeEdge({
      id: edgeId,
      source: sourceId,
      target: biNodeId,
      label: 'Marcação B.I.',
      transitions: [transition],
      biMarkings: [transition],
      type: 'bi',
    }));
  }

  return biNodeId;
}

function makeBiNode(id, transition, sheetName, level) {
  return makeNode(id, 'biMarkingNode', 'Marcação URA', {
    nodeType: 'biMarking',
    transition,
    transitions: [transition],
    bi: transition.bi,
    biCode: transition.biCode,
    biDescription: transition.biDescription,
    sheetName,
    rowNumber: transition.rowNumber,
    warningTargetRows: [transition.rowNumber],
    transitionId: transition.id,
    transitionIds: [transition.id],
    level,
  });
}

function makeNode(id, type, label, data) {
  return {
    id,
    type,
    position: { x: 0, y: 0 },
    data: {
      label,
      ...data,
    },
  };
}

function makeEdge({
  id,
  source,
  target,
  label,
  prompt = '',
  transitions = [],
  biMarkings = [],
  changeColors = [],
  type = 'state',
  sheetName = '',
  rowNumber = null,
  warningTargetRows = [],
}) {
  const transitionRows = transitions.map((transition) => transition.rowNumber).filter(Boolean);
  const transitionIds = transitions.map((transition) => transition.id).filter(Boolean);
  const rows = [...new Set([...warningTargetRows, ...transitionRows].filter(Boolean))];
  return {
    id,
    source,
    target,
    label: shortenLabel(label, 74),
    data: {
      prompt,
      transitions,
      biMarkings,
      changeColors,
      type,
      sheetName: sheetName || transitions[0]?.sheetName || '',
      rowNumber: rowNumber ?? transitionRows[0] ?? null,
      warningTargetRows: rows,
      transitionIds,
    },
    markerEnd: { type: MarkerType.ArrowClosed },
    className: `flow-edge edge-${type}`,
    type: source === target ? 'default' : 'smoothstep',
  };
}

function getTransitionChangeColors(transitions = []) {
  return [...new Set(transitions.map((transition) => transition.changeColor).filter(Boolean))];
}

function getTransitionBiMarkings(transitions = []) {
  return transitions.filter((transition) => transition.hasBiMarking);
}

function nodeTypeForDestination(type) {
  if (type === 'terminal') return 'terminalNode';
  if (type === 'transfer') return 'transferNode';
  if (type === 'unknown') return 'unknownNode';
  return 'stateNode';
}

function formatConditions(conditions = []) {
  return conditions.map((condition) => simplifyCondition(condition)).join(' > ');
}

function simplifyCondition(value) {
  return String(value)
    .replace(/Erro no serviço de religue\?/i, 'Erro religue')
    .replace(/SUSPENSOS PARCIAL E TOTAL/i, 'Suspensos Parcial')
    .replace(/1a ligação em 24hrs =/i, '1a ligação')
    .trim();
}

import { MarkerType } from '@xyflow/react';
import { classifyDestination } from '../utils/classifyDestination.js';
import { makeId, normalizeKey, shortenLabel } from '../utils/normalizeText.js';

const GROUP_WIDTH = 300;
const GROUP_PADDING_TOP = 58;
const GROUP_NODE_GAP = 118;
const GROUP_MIN_HEIGHT = 190;
const COLUMN_GAP = 420;
const GROUP_STACK_GAP = 70;
const GROUP_COLLISION_GAP = 90;
const START_X = 40;
const START_Y = 50;

const GROUP_COLORS = [
  { border: '#93c5fd', background: '#eff6ff' },
  { border: '#86efac', background: '#f0fdf4' },
  { border: '#fcd34d', background: '#fffbeb' },
  { border: '#c4b5fd', background: '#f5f3ff' },
  { border: '#67e8f9', background: '#ecfeff' },
  { border: '#f9a8d4', background: '#fdf2f8' },
];

export function buildUxFlow(parsedData, uxAnalysis) {
  if (!parsedData?.states?.length || !uxAnalysis?.targetStateName) return { nodes: [], edges: [] };

  const stateByKey = new Map(parsedData.states.map((state) => [normalizeKey(state.sheetName), state]));
  const targetKey = normalizeKey(uxAnalysis.targetStateName);
  const relevantEdges = uxAnalysis.relevantEdges?.length
    ? uxAnalysis.relevantEdges
    : uxAnalysis.paths.flatMap((path) => path.steps);
  const depthByState = calculateDepthsToTarget(relevantEdges, targetKey);
  const stateOrder = orderStatesByDepth(uxAnalysis.relevantStateKeys, depthByState, stateByKey, targetKey);
  const nodes = [];
  const edges = [];
  const nodeIds = new Set();
  const edgeIds = new Set();
  const groupLayouts = buildGroupLayouts({
    stateOrder,
    stateByKey,
    depthByState,
    relevantEdges,
    targetKey,
    uxAnalysis,
  });

  groupLayouts.forEach((layout, index) => {
    const { stateKey, state, depth, analysis, visibleTransitions, groupHeight, position } = layout;
    const groupId = `ux-group-${makeId(state.sheetName)}`;
    const color = GROUP_COLORS[index % GROUP_COLORS.length];

    nodes.push({
      id: groupId,
      type: 'group',
      position,
      data: {
        label: state.sheetName,
        nodeType: 'uxGroup',
        uxNodeAnalysis: analysis,
      },
      style: {
        width: GROUP_WIDTH,
        height: groupHeight,
        border: `2px solid ${color.border}`,
        background: color.background,
        borderRadius: 10,
        color: '#0f172a',
        fontSize: 13,
        fontWeight: 900,
        padding: 10,
      },
      selectable: false,
      draggable: true,
    });

    const stateNodeId = `ux-state-${makeId(state.sheetName)}`;
    nodes.push(makeNode(stateNodeId, 'stateNode', state.sheetName, {
      parentId: groupId,
      position: { x: 35, y: GROUP_PADDING_TOP },
      data: {
        role: stateKey === targetKey ? 'target' : 'ux-state',
        nodeType: 'uxState',
        sheetName: state.sheetName,
        state,
        uxNodeAnalysis: analysis,
        label: state.sheetName,
        level: depth,
      },
      className: stateKey === targetKey ? 'ux-target-node' : '',
    }));
    nodeIds.add(stateNodeId);

    visibleTransitions.forEach((transition, transitionIndex) => {
      const optionId = `ux-option-${makeId(state.sheetName)}-${transition.rowNumber}`;
      const optionLabel = transition.conditions?.slice(-1)[0] || transition.prompt || transition.to || 'Saida';
      nodes.push(makeNode(optionId, 'conditionNode', optionLabel, {
        parentId: groupId,
        position: { x: 35, y: GROUP_PADDING_TOP + 104 + transitionIndex * GROUP_NODE_GAP },
        data: {
          nodeType: 'uxOption',
          condition: optionLabel,
          sheetName: state.sheetName,
          rowNumber: transition.rowNumber,
          warningTargetRows: [transition.rowNumber],
          transition,
          transitions: [transition],
          uxNodeAnalysis: analysis,
          label: optionLabel,
          level: depth + 1,
        },
      }));
      nodeIds.add(optionId);

      addEdge(edges, edgeIds, {
        id: `ux-edge-${stateNodeId}-${optionId}`,
        source: stateNodeId,
        target: optionId,
        label: shortenLabel(transition.prompt || optionLabel, 56),
        transition,
        type: 'ux-inside',
      });
    });
  });

  relevantEdges.forEach((step) => {
    const sourceId = `ux-option-${makeId(step.from)}-${step.transition.rowNumber}`;
    const destinationType = classifyDestination(step.transition.to, parsedData.sheetNames, step.from);
    const targetStateKey = step.toKey;
    let targetId = `ux-state-${makeId(step.to)}`;

    if (!nodeIds.has(targetId) || !['state', 'self'].includes(destinationType)) {
      targetId = ensureExternalDestination({ nodes, nodeIds, step, destinationType });
    }

    addEdge(edges, edgeIds, {
      id: `ux-edge-cross-${sourceId}-${targetId}-${step.transition.rowNumber}`,
      source: sourceId,
      target: targetId,
      label: shortenLabel(step.to, 42),
      transition: step.transition,
      type: 'ux-path',
      risk: '',
      targetStateKey,
    });
  });

  return { nodes, edges };
}

function buildGroupLayouts({ stateOrder, stateByKey, depthByState, relevantEdges, targetKey, uxAnalysis }) {
  const nextYByDepth = new Map();

  const layouts = stateOrder.map((stateKey) => {
    const state = stateByKey.get(stateKey);
    if (!state) return null;

    const depth = depthByState.get(stateKey) ?? 0;
    const analysis = uxAnalysis.nodeAnalyses[stateKey];
    const usedTransitions = transitionsForState(relevantEdges, stateKey);
    const visibleTransitions = stateKey === targetKey
      ? []
      : usedTransitions.length
        ? usedTransitions
        : state.transitions.slice(0, 1);
    const groupHeight = Math.max(GROUP_MIN_HEIGHT, GROUP_PADDING_TOP + 86 + visibleTransitions.length * GROUP_NODE_GAP);
    const y = nextYByDepth.get(depth) ?? START_Y;

    nextYByDepth.set(depth, y + groupHeight + GROUP_STACK_GAP);

    return {
      stateKey,
      state,
      depth,
      analysis,
      visibleTransitions,
      groupHeight,
      position: {
        x: START_X + depth * COLUMN_GAP,
        y,
      },
    };
  }).filter(Boolean);

  return resolveGroupCollisions(layouts);
}

function resolveGroupCollisions(layouts) {
  const resolved = layouts.map((layout) => ({
    ...layout,
    position: { ...layout.position },
  }));
  let changed = true;
  let passes = 0;

  while (changed && passes < resolved.length * 2) {
    changed = false;
    passes += 1;

    const ordered = [...resolved].sort((first, second) => (
      first.position.x - second.position.x
      || first.position.y - second.position.y
      || first.state.sheetName.localeCompare(second.state.sheetName)
    ));

    for (let index = 0; index < ordered.length; index += 1) {
      const current = ordered[index];
      for (let nextIndex = index + 1; nextIndex < ordered.length; nextIndex += 1) {
        const candidate = ordered[nextIndex];
        if (!rectanglesOverlapHorizontally(current, candidate)) continue;
        if (!rectanglesOverlapVertically(current, candidate, GROUP_COLLISION_GAP)) continue;

        const nextY = current.position.y + current.groupHeight + GROUP_COLLISION_GAP;
        if (candidate.position.y < nextY) {
          candidate.position.y = nextY;
          changed = true;
        }
      }
    }
  }

  return resolved;
}

function rectanglesOverlapHorizontally(first, second) {
  const firstLeft = first.position.x;
  const firstRight = first.position.x + GROUP_WIDTH;
  const secondLeft = second.position.x;
  const secondRight = second.position.x + GROUP_WIDTH;

  return firstLeft < secondRight && secondLeft < firstRight;
}

function rectanglesOverlapVertically(first, second, gap = 0) {
  const firstTop = first.position.y;
  const firstBottom = first.position.y + first.groupHeight + gap;
  const secondTop = second.position.y;
  const secondBottom = second.position.y + second.groupHeight + gap;

  return firstTop < secondBottom && secondTop < firstBottom;
}

function calculateDepthsToTarget(relevantEdges, targetKey) {
  const incomingByState = new Map();
  relevantEdges.forEach((edge) => {
    const incoming = incomingByState.get(edge.toKey) ?? [];
    incoming.push(edge);
    incomingByState.set(edge.toKey, incoming);
  });

  const backwardDepth = new Map([[targetKey, 0]]);

  function visit(currentKey, depth, visited) {
    const currentDepth = backwardDepth.get(currentKey);
    if (currentDepth === undefined || depth > currentDepth) backwardDepth.set(currentKey, depth);

    (incomingByState.get(currentKey) ?? []).forEach((edge) => {
      if (visited.includes(edge.fromKey)) return;
      visit(edge.fromKey, depth + 1, [...visited, edge.fromKey]);
    });
  }

  visit(targetKey, 0, [targetKey]);

  const maxDepth = Math.max(0, ...backwardDepth.values());
  return new Map([...backwardDepth.entries()].map(([stateKey, depth]) => [stateKey, maxDepth - depth]));
}

function orderStatesByDepth(stateKeys = [], depthByState, stateByKey, targetKey) {
  const orderedKeys = stateKeys.length ? stateKeys : [targetKey];
  return orderedKeys
    .filter((stateKey) => stateByKey.has(stateKey))
    .sort((first, second) => (depthByState.get(first) ?? 0) - (depthByState.get(second) ?? 0)
      || first.localeCompare(second));
}

function transitionsForState(relevantEdges, stateKey) {
  const transitions = new Map();
  relevantEdges.forEach((step) => {
    if (step.fromKey === stateKey && step.transition?.id) transitions.set(step.transition.id, step.transition);
  });
  return [...transitions.values()];
}

function ensureExternalDestination({ nodes, nodeIds, step, destinationType }) {
  const id = `ux-external-${makeId(step.to || destinationType)}-${step.transition.rowNumber}`;
  if (nodeIds.has(id)) return id;
  const nodeType = destinationType === 'terminal'
    ? 'terminalNode'
    : destinationType === 'transfer'
      ? 'transferNode'
      : 'unknownNode';
  nodes.push(makeNode(id, nodeType, step.to || 'Destino vazio', {
    position: {
      x: START_X + (step.transition.conditions?.length ?? 1) * 120,
      y: START_Y + nodes.length * 26,
    },
    data: {
      nodeType: destinationType,
      sheetName: step.from,
      rowNumber: step.transition.rowNumber,
      transition: step.transition,
      transitions: [step.transition],
      warningTargetRows: [step.transition.rowNumber],
      label: step.to || 'Destino vazio',
    },
  }));
  nodeIds.add(id);
  return id;
}

function makeNode(id, type, label, options) {
  return {
    id,
    type,
    parentId: options.parentId,
    extent: options.parentId ? 'parent' : undefined,
    position: options.position,
    data: {
      label,
      ...options.data,
    },
    className: options.className,
  };
}

function addEdge(edges, edgeIds, { id, source, target, label, transition, type, risk = '' }) {
  if (edgeIds.has(id) || source === target) return;
  edgeIds.add(id);
  edges.push({
    id,
    source,
    target,
    label,
    data: {
      type,
      risk,
      transition,
      transitions: transition ? [transition] : [],
      sheetName: transition?.sheetName ?? '',
      rowNumber: transition?.rowNumber ?? null,
      warningTargetRows: transition?.rowNumber ? [transition.rowNumber] : [],
      transitionIds: transition?.id ? [transition.id] : [],
    },
    markerEnd: { type: MarkerType.ArrowClosed },
    className: `flow-edge edge-${type}`,
    type: 'smoothstep',
  });
}

const STATE_X_GAP = 360;
const STATE_Y_GAP = 160;
const TREE_X_GAP = 340;
const TREE_TO_BI_GAP = 460;
const TREE_Y_GAP = 150;
const START_X = 40;
const START_Y = 40;

export function layoutFlow(nodes, edges, mode = 'stateView') {
  if (mode === 'detailedView') return layoutDetailed(nodes, edges);
  return layoutStateView(nodes, edges);
}

function layoutStateView(nodes, edges) {
  const origin = nodes.find((node) => node.data?.role === 'origin') ?? nodes[0];
  const targetNodes = nodes.filter((node) => node.id !== origin?.id);
  const originY = targetNodes.length > 0
    ? START_Y + ((targetNodes.length - 1) * STATE_Y_GAP) / 2
    : START_Y;

  const laidOut = nodes.map((node, index) => {
    if (node.id === origin?.id) {
      return { ...node, position: { x: START_X, y: originY } };
    }

    const targetIndex = targetNodes.findIndex((targetNode) => targetNode.id === node.id);
    const y = START_Y + Math.max(0, targetIndex) * STATE_Y_GAP;
    const isLoop = edges.some((edge) => edge.source === node.id && edge.target === node.id);
    return {
      ...node,
      position: isLoop ? { x: START_X, y: y + STATE_Y_GAP } : { x: START_X + STATE_X_GAP, y },
    };
  });

  return { nodes: laidOut, edges };
}

function layoutDetailed(nodes, edges) {
  const origin = nodes.find((node) => node.data?.role === 'origin') ?? nodes[0];
  if (!origin) return { nodes, edges };

  const nodeById = new Map(nodes.map((node) => [node.id, node]));
  const childrenBySource = new Map();
  edges.forEach((edge) => {
    if (!nodeById.has(edge.source) || !nodeById.has(edge.target)) return;
    if (edge.source === edge.target) return;
    if (edge.target === origin.id) return;

    const children = childrenBySource.get(edge.source) ?? [];
    if (!children.includes(edge.target)) children.push(edge.target);
    childrenBySource.set(edge.source, children);
  });

  const positioned = new Map();
  let cursorY = START_Y;

  function layoutSubtree(nodeId, depth, visiting = new Set()) {
    if (positioned.has(nodeId)) return positioned.get(nodeId).y;
    if (visiting.has(nodeId)) return cursorY;

    visiting.add(nodeId);
    const children = childrenBySource.get(nodeId) ?? [];
    let y;

    if (children.length === 0) {
      y = cursorY;
      cursorY += TREE_Y_GAP;
    } else {
      const childYs = children.map((childId) => {
        const childDepth = depth + (nodeById.get(childId)?.data?.nodeType === 'biMarking'
          ? TREE_TO_BI_GAP / TREE_X_GAP
          : 1);
        return layoutSubtree(childId, childDepth, new Set(visiting));
      });
      y = (Math.min(...childYs) + Math.max(...childYs)) / 2;
    }

    positioned.set(nodeId, {
      x: START_X + depth * TREE_X_GAP,
      y,
    });
    return y;
  }

  layoutSubtree(origin.id, 0);

  nodes.forEach((node) => {
    if (!positioned.has(node.id)) {
      const level = node.data?.level ?? 0;
      positioned.set(node.id, {
        x: START_X + level * TREE_X_GAP,
        y: cursorY,
      });
      cursorY += TREE_Y_GAP;
    }
  });

  const laidOut = nodes.map((node) => {
    return {
      ...node,
      position: positioned.get(node.id) ?? node.position,
    };
  });

  return { nodes: laidOut, edges };
}

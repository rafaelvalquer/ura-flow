import { useEffect, useMemo, useRef } from 'react';
import {
  Background,
  Controls,
  MiniMap,
  ReactFlow,
  applyNodeChanges,
  useEdgesState,
  useNodesState,
  useReactFlow,
} from '@xyflow/react';
import { MarkerType } from '@xyflow/react';
import NiceActionNode from './nodes/NiceActionNode.jsx';

const nodeTypes = {
  niceActionNode: NiceActionNode,
};

export default function NiceScriptCanvas({
  script,
  selectedActionId,
  onSelectAction,
  onClearSelection,
  onMoveAction,
}) {
  const nodes = useMemo(() => makeNiceNodes(script, selectedActionId), [script, selectedActionId]);
  const edges = useMemo(() => makeNiceEdges(script), [script]);
  const [flowNodes, setNodes, onNodesChange] = useNodesState(nodes);
  const [flowEdges, setEdges, onEdgesChange] = useEdgesState(edges);
  const initializedRef = useRef(false);
  const { fitView } = useReactFlow();

  useEffect(() => {
    setNodes(nodes);
    setEdges(edges);
    window.requestAnimationFrame(() => {
      fitView({ padding: 0.22, duration: initializedRef.current ? 180 : 320 });
      initializedRef.current = true;
    });
  }, [nodes, edges, setNodes, setEdges, fitView]);

  function handleNodesChange(changes) {
    const updatedNodes = applyNodeChanges(changes, flowNodes);
    onNodesChange(changes);

    const endedMove = changes.filter((change) => (
      change.type === 'position'
      && change.position
      && change.dragging === false
    ));

    endedMove.forEach((change) => {
      const node = updatedNodes.find((item) => item.id === change.id);
      if (node) onMoveAction?.(node.data.actionId, node.position);
    });
  }

  function handleNodeDragStop(_, node) {
    onMoveAction?.(node.data.actionId, node.position);
  }

  return (
    <main className="nice-canvas-shell">
      <ReactFlow
        nodes={flowNodes}
        edges={flowEdges}
        nodeTypes={nodeTypes}
        onNodesChange={handleNodesChange}
        onEdgesChange={onEdgesChange}
        onNodeDragStop={handleNodeDragStop}
        onNodeClick={(_, node) => onSelectAction?.(node.data.actionId)}
        onPaneClick={onClearSelection}
        fitView
      >
        <Background color="#CBD5E1" gap={18} size={1} />
        <Controls />
        <MiniMap pannable zoomable nodeStrokeWidth={3} />
      </ReactFlow>
    </main>
  );
}

function makeNiceNodes(script, selectedActionId) {
  return (script?.actions ?? []).map((action) => ({
    id: String(action.actionId),
    type: 'niceActionNode',
    position: {
      x: Number(action.x) || 0,
      y: Number(action.y) || 0,
    },
    selected: Number(action.actionId) === Number(selectedActionId),
    data: {
      ...action,
      label: action.caption,
    },
  }));
}

function makeNiceEdges(script) {
  const actionsById = new Set((script?.actions ?? []).map((action) => Number(action.actionId)));
  const edges = [];

  (script?.actions ?? []).forEach((action) => {
    if (action.defaultNextAction && actionsById.has(Number(action.defaultNextAction.actionId))) {
      edges.push(makeEdge(action, action.defaultNextAction, 'Default', 'nice-edge-default'));
    }

    (action.branches ?? []).forEach((branch) => {
      if (!actionsById.has(Number(branch.actionId))) return;
      edges.push(makeEdge(action, branch, branch.text || `Branch ${branch.index}`, 'nice-edge-branch'));
    });

    (action.cases ?? []).forEach((branch) => {
      if (!actionsById.has(Number(branch.actionId))) return;
      edges.push(makeEdge(action, branch, branch.text || 'Case', 'nice-edge-case'));
    });
  });

  return edges;
}

function makeEdge(action, branch, label, className) {
  return {
    id: `nice-edge-${action.actionId}-${branch.actionId}-${label}-${branch.index}`,
    source: String(action.actionId),
    target: String(branch.actionId),
    label,
    className,
    markerEnd: {
      type: MarkerType.ArrowClosed,
      width: 18,
      height: 18,
    },
    data: { actionId: action.actionId, branch },
  };
}

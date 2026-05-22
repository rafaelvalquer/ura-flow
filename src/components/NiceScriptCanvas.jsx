import { useEffect, useMemo, useRef } from 'react';
import {
  Background,
  BaseEdge,
  Controls,
  MiniMap,
  ReactFlow,
  applyNodeChanges,
  getBezierPath,
  useEdgesState,
  useNodesState,
  useReactFlow,
} from '@xyflow/react';
import { MarkerType } from '@xyflow/react';
import NiceActionNode from './nodes/NiceActionNode.jsx';

const nodeTypes = {
  niceActionNode: NiceActionNode,
};

const edgeTypes = {
  animatedSvgEdge: AnimatedSvgEdge,
};

export default function NiceScriptCanvas({
  script,
  selectedActionId,
  simulation,
  readOnly = false,
  onSelectAction,
  onClearSelection,
  onMoveAction,
  onConnectActions,
  onDropAction,
  onDeleteConnection,
  onDeleteAction,
}) {
  const simulatedActionIds = useMemo(() => new Set(simulation?.actionIds ?? []), [simulation]);
  const simulatedEdgeIds = useMemo(() => new Set(simulation?.edgeIds ?? []), [simulation]);
  const nodes = useMemo(() => makeNiceNodes(script, selectedActionId, simulatedActionIds), [script, selectedActionId, simulatedActionIds]);
  const edges = useMemo(() => makeNiceEdges(script, simulatedEdgeIds), [script, simulatedEdgeIds]);
  const [flowNodes, setNodes, onNodesChange] = useNodesState(nodes);
  const [flowEdges, setEdges, onEdgesChange] = useEdgesState(edges);
  const initializedRef = useRef(false);
  const { fitView, screenToFlowPosition } = useReactFlow();

  useEffect(() => {
    setNodes(nodes);
    setEdges(edges);
    window.requestAnimationFrame(() => {
      fitView({ padding: 0.22, duration: initializedRef.current ? 180 : 320 });
      initializedRef.current = true;
    });
  }, [nodes, edges, setNodes, setEdges, fitView]);

  useEffect(() => {
    function handleKeyDown(event) {
      if (readOnly) return;
      if (event.key !== 'Delete' && event.key !== 'Backspace') return;
      if (isEditableTarget(event.target)) return;
      const selectedEdge = flowEdges.find((edge) => edge.selected);
      if (selectedEdge) {
        event.preventDefault();
        onDeleteConnection?.(selectedEdge.data);
        return;
      }

      if (event.key !== 'Delete') return;
      const selectedNode = flowNodes.find((node) => node.selected);
      if (!selectedNode) return;

      event.preventDefault();
      onDeleteAction?.(Number(selectedNode.data.actionId));
    }

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [flowEdges, flowNodes, onDeleteAction, onDeleteConnection, readOnly]);

  function handleNodesChange(changes) {
    if (readOnly) {
      onNodesChange(changes.filter((change) => change.type !== 'position'));
      return;
    }

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
    if (readOnly) return;
    onMoveAction?.(node.data.actionId, node.position);
  }

  function handleConnect(connection) {
    if (readOnly) return;
    if (!connection.source || !connection.target || connection.source === connection.target) return;
    onConnectActions?.({
      sourceId: Number(connection.source),
      targetId: Number(connection.target),
    });
  }

  function handleDragOver(event) {
    if (readOnly) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = 'copy';
  }

  function handleDrop(event) {
    if (readOnly) return;
    event.preventDefault();
    const actionType = event.dataTransfer.getData('application/nice-action');
    if (!actionType) return;

    onDropAction?.(actionType, screenToFlowPosition({
      x: event.clientX,
      y: event.clientY,
    }));
  }

  return (
    <main className={`nice-canvas-shell ${readOnly ? 'is-read-only' : ''}`}>
      <ReactFlow
        nodes={flowNodes}
        edges={flowEdges}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        onNodesChange={handleNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={handleConnect}
        onDragOver={handleDragOver}
        onDrop={handleDrop}
        onNodeDragStop={handleNodeDragStop}
        onNodeClick={(_, node) => onSelectAction?.(node.data.actionId)}
        onPaneClick={onClearSelection}
        edgesFocusable={!readOnly}
        nodesDraggable={!readOnly}
        nodesConnectable={!readOnly}
        nodesFocusable={!readOnly}
        deleteKeyCode={readOnly ? null : 'Delete'}
        fitView
      >
        <Background color="#CBD5E1" gap={18} size={1} />
        <Controls />
        <MiniMap pannable zoomable nodeStrokeWidth={3} />
      </ReactFlow>
    </main>
  );
}

function makeNiceNodes(script, selectedActionId, simulatedActionIds) {
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
      isSimulated: simulatedActionIds.has(Number(action.actionId)),
    },
  }));
}

function makeNiceEdges(script, simulatedEdgeIds) {
  const actionsById = new Set((script?.actions ?? []).map((action) => Number(action.actionId)));
  const edges = [];

  (script?.actions ?? []).forEach((action) => {
    if (action.defaultNextAction && actionsById.has(Number(action.defaultNextAction.actionId))) {
      edges.push(makeEdge(action, action.defaultNextAction, 'Default', 'nice-edge-default', 'default', simulatedEdgeIds));
    }

    (action.branches ?? []).forEach((branch) => {
      if (!actionsById.has(Number(branch.actionId))) return;
      edges.push(makeEdge(action, branch, branch.text || `Branch ${branch.index}`, 'nice-edge-branch', 'branch', simulatedEdgeIds));
    });

    (action.cases ?? []).forEach((branch) => {
      if (!actionsById.has(Number(branch.actionId))) return;
      edges.push(makeEdge(action, branch, branch.text || 'Case', 'nice-edge-case', 'case', simulatedEdgeIds));
    });
  });

  return edges;
}

function makeEdge(action, branch, label, className, kind, simulatedEdgeIds) {
  const id = makeNiceEdgeId(action.actionId, branch.actionId, label, branch.index);
  const isSimulated = simulatedEdgeIds.has(id);
  return {
    id,
    source: String(action.actionId),
    target: String(branch.actionId),
    label,
    type: isSimulated ? 'animatedSvgEdge' : undefined,
    animated: isSimulated,
    className: `${className}${isSimulated ? ' nice-edge-simulated' : ''}`,
    markerEnd: {
      type: MarkerType.ArrowClosed,
      width: 18,
      height: 18,
    },
    data: { actionId: action.actionId, branch, kind, isSimulated },
  };
}

export function makeNiceEdgeId(actionId, targetId, label, index) {
  return `nice-edge-${actionId}-${targetId}-${label}-${index}`;
}

function AnimatedSvgEdge({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  markerEnd,
  style,
}) {
  const [edgePath] = getBezierPath({
    sourceX,
    sourceY,
    sourcePosition,
    targetX,
    targetY,
    targetPosition,
  });

  return (
    <>
      <BaseEdge id={id} path={edgePath} markerEnd={markerEnd} style={style} />
      <circle r="5" fill="#2563eb">
        <animateMotion dur="1.4s" repeatCount="indefinite" path={edgePath} />
      </circle>
    </>
  );
}

function isEditableTarget(target) {
  const tagName = target?.tagName?.toLowerCase();
  return tagName === 'input' || tagName === 'textarea' || tagName === 'select' || target?.isContentEditable;
}

import { useEffect, useMemo, useRef } from 'react';
import {
  Background,
  Controls,
  MiniMap,
  ReactFlow,
  useEdgesState,
  useNodesState,
  useReactFlow,
} from '@xyflow/react';
import StateNode from './nodes/StateNode';
import ConditionNode from './nodes/ConditionNode';
import TerminalNode from './nodes/TerminalNode';
import TransferNode from './nodes/TransferNode';
import UnknownNode from './nodes/UnknownNode';
import BiMarkingNode from './nodes/BiMarkingNode';

const nodeTypes = {
  stateNode: StateNode,
  conditionNode: ConditionNode,
  terminalNode: TerminalNode,
  transferNode: TransferNode,
  unknownNode: UnknownNode,
  biMarkingNode: BiMarkingNode,
};

export default function FlowCanvas({
  nodes,
  edges,
  layoutVersion,
  focusRequest,
  onSelectionChange,
  canvasRef,
}) {
  const [flowNodes, setNodes, onNodesChange] = useNodesState(nodes);
  const [flowEdges, setEdges, onEdgesChange] = useEdgesState(edges);
  const wrapperRef = useRef(null);
  const { fitView, setCenter } = useReactFlow();

  useEffect(() => {
    setNodes(nodes.map((node) => ({ ...node, selected: false })));
    setEdges(edges.map((edge) => ({ ...edge, selected: false })));
    if (!focusRequest) {
      window.requestAnimationFrame(() => fitView({ padding: 0.24, duration: 250 }));
    }
  }, [nodes, edges, layoutVersion, focusRequest, setNodes, setEdges, fitView]);

  useEffect(() => {
    if (!focusRequest || nodes.length === 0) return;

    window.requestAnimationFrame(() => {
      const target = findFocusTarget(nodes, edges, focusRequest);
      if (!target) return;

      setNodes(nodes.map((node) => ({ ...node, selected: target.kind === 'node' && node.id === target.item.id })));
      setEdges(target.kind === 'node'
        ? applyNodeConnectionHighlight(edges, target.item.id)
        : applySingleEdgeHighlight(edges, target.item.id));

      if (target.kind === 'node') {
        const center = getNodeCenter(target.item);
        setCenter(center.x, center.y, { zoom: 1.1, duration: 500 });
        onSelectionChange?.(selectionFromNode(target.item));
        return;
      }

      const midpoint = getEdgeMidpoint(target.item, nodes);
      setCenter(midpoint.x, midpoint.y, { zoom: 1.1, duration: 500 });
      onSelectionChange?.(selectionFromEdge(target.item));
    });
  }, [focusRequest, nodes, edges, setNodes, setEdges, setCenter, onSelectionChange]);

  useEffect(() => {
    if (canvasRef) canvasRef.current = wrapperRef.current;
  }, [canvasRef]);

  const memoNodeTypes = useMemo(() => nodeTypes, []);

  function handleNodeClick(_, node) {
    setNodes(flowNodes.map((item) => ({ ...item, selected: item.id === node.id })));
    setEdges(applyNodeConnectionHighlight(flowEdges, node.id));
    onSelectionChange(selectionFromNode(node));
  }

  function handleEdgeClick(_, edge) {
    setNodes(flowNodes.map((node) => ({ ...node, selected: false })));
    setEdges(applySingleEdgeHighlight(flowEdges, edge.id));
    onSelectionChange(selectionFromEdge(edge));
  }

  function handlePaneClick() {
    setNodes(flowNodes.map((node) => ({ ...node, selected: false })));
    setEdges(clearEdgeHighlight(flowEdges));
    onSelectionChange(null);
  }

  return (
    <main className="flow-shell" ref={wrapperRef}>
      {nodes.length === 0 ? (
        <div className="canvas-empty">
          <strong>Nenhum fluxo carregado</strong>
          <span>Envie uma planilha .xlsx e selecione um estado para visualizar.</span>
        </div>
      ) : (
        <ReactFlow
          nodes={flowNodes}
          edges={flowEdges}
          nodeTypes={memoNodeTypes}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onNodeClick={handleNodeClick}
          onEdgeClick={handleEdgeClick}
          onPaneClick={handlePaneClick}
          fitView
        >
          <Background color="#CBD5E1" gap={18} size={1} />
          <Controls />
          <MiniMap pannable zoomable nodeStrokeWidth={3} />
        </ReactFlow>
      )}
    </main>
  );
}

function applyNodeConnectionHighlight(edges, nodeId) {
  return edges.map((edge) => {
    const directionClass = edge.target === nodeId
      ? 'edge-connected edge-incoming'
      : edge.source === nodeId
        ? 'edge-connected edge-outgoing'
        : '';

    return {
      ...edge,
      selected: Boolean(directionClass),
      className: mergeEdgeClasses(edge.className, directionClass),
    };
  });
}

function applySingleEdgeHighlight(edges, edgeId) {
  return edges.map((edge) => {
    const isSelected = edge.id === edgeId;
    return {
      ...edge,
      selected: isSelected,
      className: mergeEdgeClasses(edge.className, isSelected ? 'edge-connected edge-selected-direct' : ''),
    };
  });
}

function clearEdgeHighlight(edges) {
  return edges.map((edge) => ({
    ...edge,
    selected: false,
    className: mergeEdgeClasses(edge.className, ''),
  }));
}

function mergeEdgeClasses(className = '', highlightClass = '') {
  const baseClasses = String(className)
    .split(/\s+/)
    .filter(Boolean)
    .filter((item) => !item.startsWith('edge-connected')
      && item !== 'edge-incoming'
      && item !== 'edge-outgoing'
      && item !== 'edge-selected-direct');

  return [...baseClasses, ...highlightClass.split(/\s+/).filter(Boolean)].join(' ');
}

function findFocusTarget(nodes, edges, request) {
  const rowNumber = Number(request.rowNumber);
  const hasRow = Number.isFinite(rowNumber) && rowNumber > 0;
  const sheetName = request.sheetName ?? '';

  if (hasRow) {
    if (request.kind === 'bi') {
      const biNode = nodes.find((node) => (
        node.data?.nodeType === 'biMarking'
        && matchesSheet(node, sheetName)
        && matchesRow(node, rowNumber)
        && matchesTransition(node, request.transitionId)
      ));
      if (biNode) return { kind: 'node', item: biNode };
    }

    const conditionNode = nodes.find((node) => (
      node.data?.nodeType === 'condition'
      && matchesSheet(node, sheetName)
      && matchesRow(node, rowNumber)
    ));
    if (conditionNode) return { kind: 'node', item: conditionNode };

    const exactEdge = edges.find((edge) => matchesSheet(edge, sheetName) && matchesRow(edge, rowNumber));
    if (exactEdge) return { kind: 'edge', item: exactEdge };

    const targetNode = nodes.find((node) => (
      node.data?.role !== 'origin'
      && matchesSheet(node, sheetName)
      && matchesRow(node, rowNumber)
    ));
    if (targetNode) return { kind: 'node', item: targetNode };
  }

  const origin = nodes.find((node) => node.data?.role === 'origin' && matchesSheet(node, sheetName))
    ?? nodes.find((node) => node.data?.role === 'origin')
    ?? nodes[0];

  return origin ? { kind: 'node', item: origin } : null;
}

function matchesSheet(item, sheetName) {
  if (!sheetName) return true;
  const data = item.data ?? {};
  if (data.sheetName === sheetName) return true;
  return (data.transitions ?? []).some((transition) => transition.sheetName === sheetName);
}

function matchesRow(item, rowNumber) {
  const data = item.data ?? {};
  if (data.rowNumber === rowNumber) return true;
  if ((data.warningTargetRows ?? []).includes(rowNumber)) return true;
  return (data.transitions ?? []).some((transition) => transition.rowNumber === rowNumber);
}

function matchesTransition(item, transitionId) {
  if (!transitionId) return true;
  const data = item.data ?? {};
  if (data.transitionId === transitionId) return true;
  if ((data.transitionIds ?? []).includes(transitionId)) return true;
  return (data.transitions ?? []).some((transition) => transition.id === transitionId);
}

function getNodeCenter(node) {
  return {
    x: node.position.x + (node.measured?.width ?? node.width ?? 230) / 2,
    y: node.position.y + (node.measured?.height ?? node.height ?? 78) / 2,
  };
}

function getEdgeMidpoint(edge, nodes) {
  const source = nodes.find((node) => node.id === edge.source);
  const target = nodes.find((node) => node.id === edge.target);
  if (!source || !target) return { x: 0, y: 0 };

  const sourceCenter = getNodeCenter(source);
  const targetCenter = getNodeCenter(target);
  return {
    x: (sourceCenter.x + targetCenter.x) / 2,
    y: (sourceCenter.y + targetCenter.y) / 2,
  };
}

function selectionFromNode(node) {
  return { kind: 'nó', label: node.data?.label, data: node.data };
}

function selectionFromEdge(edge) {
  return { kind: 'transição', label: edge.label, data: edge.data };
}

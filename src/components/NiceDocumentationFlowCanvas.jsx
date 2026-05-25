import { memo, useMemo } from 'react';
import { Background, Controls, Handle, MarkerType, Position, ReactFlow, ReactFlowProvider } from '@xyflow/react';

const DOC_NODE_LABELS = {
  start: 'Inicio',
  menu: 'Menu',
  optionHub: 'Opcoes',
  option: 'DTMF',
  rule: 'Regra',
  api: 'API',
  hub: 'Hub',
  output: 'Saida',
  reject: 'Erro / REJ',
  silence: 'Silencio',
  onrelease: 'OnRelease',
};

function NiceDocumentationFlowCanvas({ flow, canvasRef, onFocusAction }) {
  return (
    <ReactFlowProvider>
      <NiceDocumentationFlowInner
        flow={flow}
        canvasRef={canvasRef}
        onFocusAction={onFocusAction}
      />
    </ReactFlowProvider>
  );
}

function NiceDocumentationFlowInner({ flow, canvasRef, onFocusAction }) {
  const nodeTypes = useMemo(() => ({ niceDocumentationNode: DocumentationNode }), []);
  const nodes = flow?.nodes ?? [];
  const edges = useMemo(
    () => (flow?.edges ?? []).map((edge) => ({
      ...edge,
      markerEnd: {
        type: MarkerType.ArrowClosed,
        width: 16,
        height: 16,
      },
      sourcePosition: Position.Bottom,
      targetPosition: Position.Top,
      pathOptions: { borderRadius: 18, offset: 34 },
      style: {
        strokeWidth: 2,
        strokeLinecap: 'round',
        strokeLinejoin: 'round',
      },
    })),
    [flow?.edges],
  );

  return (
    <div className="nice-documentation-flow-shell" ref={canvasRef}>
      {nodes.length === 0 ? (
        <div className="nice-documentation-empty">
          <strong>Nao foi possivel montar uma visao visual ainda.</strong>
          <span>Adicione BEGIN, MENU, IF, API ou saídas no canvas para gerar o fluxo documental.</span>
        </div>
      ) : (
        <ReactFlow
          nodes={nodes}
          edges={edges}
          nodeTypes={nodeTypes}
          nodesDraggable={false}
          nodesConnectable={false}
          edgesFocusable={false}
          fitView
          fitViewOptions={{ padding: 0.18, includeHiddenNodes: false }}
          minZoom={0.2}
          maxZoom={1.4}
          onNodeClick={(_, node) => {
            const actionId = node.data?.actionIds?.[0];
            if (actionId) onFocusAction?.(actionId);
          }}
        >
          <Background gap={22} size={1} color="#dbeafe" />
          <Controls showInteractive={false} />
        </ReactFlow>
      )}
    </div>
  );
}

const DocumentationNode = memo(function DocumentationNode({ data }) {
  const docType = data.docType ?? 'output';
  return (
    <article className={`nice-doc-flow-node is-${docType}`}>
      <Handle type="target" position={Position.Top} isConnectable={false} />
      <div className="nice-doc-flow-node-badge">{DOC_NODE_LABELS[docType] ?? 'Fluxo'}</div>
      <h3>{data.title}</h3>
      {data.subtitle && <p>{data.subtitle}</p>}
      {data.details?.length > 0 && (
        <dl>
          {data.details.slice(0, 4).map((item) => (
            <div key={`${item.label}-${item.value}`}>
              <dt>{item.label}</dt>
              <dd>{item.value}</dd>
            </div>
          ))}
        </dl>
      )}
      {data.actionIds?.length > 0 && (
        <span className="nice-doc-flow-node-action">
          #{data.actionIds.join(', #')}
        </span>
      )}
      <Handle type="source" position={Position.Bottom} isConnectable={false} />
    </article>
  );
});

export default NiceDocumentationFlowCanvas;

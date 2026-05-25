import { useEffect, useMemo, useRef, useState } from 'react';
import mermaid from 'mermaid';
import { buildNiceMermaidDiagram } from '../services/niceMermaidFlowBuilder.js';

mermaid.initialize({
  startOnLoad: false,
  securityLevel: 'loose',
  theme: 'base',
  flowchart: {
    curve: 'linear',
    htmlLabels: true,
    nodeSpacing: 96,
    rankSpacing: 128,
    padding: 28,
    useMaxWidth: false,
  },
  themeVariables: {
    fontFamily: 'Inter, ui-sans-serif, system-ui, sans-serif',
    primaryTextColor: '#0f172a',
    lineColor: '#475569',
    edgeLabelBackground: '#f8fafc',
  },
});

function NiceDocumentationMermaidFlowchart({ script, flow, mode, exportRef, onFocusAction }) {
  const mermaidFlow = useMemo(() => buildNiceMermaidDiagram(script, flow, { mode }), [script, flow, mode]);
  const diagram = mermaidFlow.diagram;
  const renderRef = useRef(null);
  const [status, setStatus] = useState('');

  useEffect(() => {
    let cancelled = false;

    async function renderDiagram() {
      if (!renderRef.current) return;
      if (!flow?.nodes?.length) {
        renderRef.current.innerHTML = '';
        setStatus('Nao foi possivel montar o fluxograma Mermaid.');
        return;
      }

      try {
        setStatus('');
        const renderId = `nice-mermaid-${Date.now()}-${Math.round(Math.random() * 100000)}`;
        const { svg, bindFunctions } = await renderMermaidWithFallback(renderId, diagram, mermaidFlow.safeDiagram);
        if (cancelled || !renderRef.current) return;
        renderRef.current.innerHTML = svg;
        bindFunctions?.(renderRef.current);
        wireNodeClicks(renderRef.current, mermaidFlow.actionMap, onFocusAction);
      } catch (error) {
        console.error('Erro ao renderizar Mermaid NICE', error, diagram);
        if (!cancelled) setStatus('Nao consegui renderizar o fluxograma Mermaid.');
      }
    }

    renderDiagram();
    return () => {
      cancelled = true;
    };
  }, [diagram, flow, mermaidFlow.actionMap, onFocusAction]);

  return (
    <div className="nice-mermaid-flowchart-shell">
      <div className="nice-mermaid-flowchart-toolbar">
        <strong>Fluxograma funcional Mermaid</strong>
        <span>Menu, roteamento de opcoes, DTMF, regras, APIs e saidas.</span>
      </div>
      <div className="nice-mermaid-flowchart-viewport">
        <div className="nice-mermaid-flowchart-stage" ref={exportRef}>
          {status ? (
            <div className="nice-documentation-empty">
              <strong>{status}</strong>
              <span>Confira se o fluxo possui nodes documentaveis.</span>
            </div>
          ) : (
            <div className="nice-mermaid-render" ref={renderRef} />
          )}
        </div>
      </div>
    </div>
  );
}

function wireNodeClicks(container, actionMap, onFocusAction) {
  container.querySelectorAll('[id^="flowchart-"]').forEach((element) => {
    const rawId = element.id.replace(/^flowchart-/, '').replace(/-\d+$/, '');
    const actionId = actionMap.get(rawId);
    if (!actionId) return;
    element.classList.add('nice-mermaid-clickable-node');
    element.addEventListener('click', () => onFocusAction?.(actionId));
  });
}

async function renderMermaidWithFallback(renderId, diagram, safeDiagram) {
  try {
    return await mermaid.render(renderId, diagram);
  } catch (error) {
    console.warn('Mermaid rico falhou, usando fallback simplificado.', error);
    if (!safeDiagram || safeDiagram === diagram) throw error;
    return mermaid.render(`${renderId}-safe`, safeDiagram);
  }
}

export default NiceDocumentationMermaidFlowchart;

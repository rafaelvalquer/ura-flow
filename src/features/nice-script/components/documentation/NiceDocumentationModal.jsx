import { useMemo, useRef, useState } from 'react';
import { toPng } from 'html-to-image';
import { Copy, Download, FileText, LayoutGrid, MousePointerClick } from 'lucide-react';
import NiceDocumentationD3Flowchart from '../../../../components/NiceDocumentationD3Flowchart.jsx';
import NiceDocumentationFlowCanvas from '../../../../components/NiceDocumentationFlowCanvas.jsx';
import NiceDocumentationMermaidFlowchart from '../../../../components/NiceDocumentationMermaidFlowchart.jsx';
import { normalizeDocumentationGraph } from '../../../../services/niceDocumentationGraphNormalizer.js';
import { createDocumentationExportElement, waitForExportLayout } from '../../services/niceDocumentationExport.js';

export default function NiceDocumentationModal({ script, scriptName, markdown, flow, onClose, onFocusAction }) {
  const [activeTab, setActiveTab] = useState('markdown');
  const [viewMode, setViewMode] = useState('summary');
  const [status, setStatus] = useState('');
  const flowCanvasRef = useRef(null);
  const d3FlowRef = useRef(null);
  const mermaidFlowRef = useRef(null);
  const visualFlow = useMemo(() => normalizeDocumentationGraph(flow, { mode: viewMode }), [flow, viewMode]);

  async function copyMarkdown() {
    try {
      await navigator.clipboard.writeText(markdown);
      setStatus('Markdown copiado para o clipboard.');
    } catch {
      setStatus('Nao consegui acessar o clipboard. Selecione o texto no preview para copiar.');
    }
  }

  function downloadMarkdown() {
    const blob = new Blob([markdown], { type: 'text/markdown;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${sanitizeFileName(scriptName || 'script-nice')}-documentacao.md`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
    setStatus('Arquivo .md gerado.');
  }

  async function exportVisualPng() {
    if (activeTab === 'd3') {
      await exportD3Png();
      return;
    }

    if (activeTab === 'mermaid') {
      await exportMermaidPng();
      return;
    }

    if (!visualFlow?.nodes?.length) {
      setStatus('Nao ha fluxo visual para exportar.');
      return;
    }

    const exportNode = createDocumentationExportElement(visualFlow);
    document.body.appendChild(exportNode);

    try {
      await waitForExportLayout();
      const dataUrl = await toPng(exportNode, {
        backgroundColor: '#f8fafc',
        cacheBust: true,
        pixelRatio: 1.25,
      });
      const link = document.createElement('a');
      link.href = dataUrl;
      link.download = `${sanitizeFileName(scriptName || 'script-nice')}-fluxo-documental.png`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      setStatus('Imagem PNG do fluxo completo gerada.');
    } catch {
      setStatus('Nao consegui gerar o PNG do fluxo visual.');
    } finally {
      exportNode.remove();
    }
  }

  async function exportD3Png() {
    if (!d3FlowRef.current) {
      setStatus('Abra a aba Fluxograma D3 para exportar a imagem.');
      return;
    }

    const zoomLayer = d3FlowRef.current.querySelector('.nice-d3-zoom-layer');
    const previousTransform = zoomLayer?.getAttribute('transform') ?? null;

    try {
      zoomLayer?.removeAttribute('transform');
      await waitForExportLayout();
      const dataUrl = await toPng(d3FlowRef.current, {
        backgroundColor: '#f8fafc',
        cacheBust: true,
        pixelRatio: 1.25,
      });
      const link = document.createElement('a');
      link.href = dataUrl;
      link.download = `${sanitizeFileName(scriptName || 'script-nice')}-fluxograma-d3.png`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      setStatus('Imagem PNG do fluxograma D3 gerada.');
    } catch {
      setStatus('Nao consegui gerar o PNG do fluxograma D3.');
    } finally {
      if (zoomLayer && previousTransform) {
        zoomLayer.setAttribute('transform', previousTransform);
      }
    }
  }

  async function exportMermaidPng() {
    if (!mermaidFlowRef.current) {
      setStatus('Abra a aba Mermaid para exportar a imagem.');
      return;
    }

    try {
      await waitForExportLayout();
      const dataUrl = await toPng(mermaidFlowRef.current, {
        backgroundColor: '#f8fafc',
        cacheBust: true,
        pixelRatio: 1.25,
      });
      const link = document.createElement('a');
      link.href = dataUrl;
      link.download = `${sanitizeFileName(scriptName || 'script-nice')}-fluxograma-mermaid.png`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      setStatus('Imagem PNG do fluxograma Mermaid gerada.');
    } catch {
      setStatus('Nao consegui gerar o PNG do fluxograma Mermaid.');
    }
  }

  return (
    <div className="nice-wizard-backdrop" role="presentation">
      <section className="nice-documentation-modal" role="dialog" aria-modal="true" aria-label="Documentacao do fluxo NICE">
        <header className="nice-wizard-header">
          <div>
            <h2>Documentacao do fluxo</h2>
            <p>{scriptName}</p>
          </div>
          <button className="ghost-button" type="button" onClick={onClose}>Fechar</button>
        </header>
        <div className="nice-documentation-toolbar">
          <button className="secondary-button" type="button" onClick={copyMarkdown}>
            <Copy size={15} />
            Copiar Markdown
          </button>
          <button className="ghost-button" type="button" onClick={downloadMarkdown}>
            <Download size={15} />
            Baixar .md
          </button>
          <button className="ghost-button" type="button" onClick={exportVisualPng}>
            <Download size={15} />
            Exportar PNG
          </button>
          {status && <span>{status}</span>}
        </div>
        <div className="nice-documentation-view-mode" role="group" aria-label="Nivel de detalhe da documentacao grafica">
          <span>Visualizacao</span>
          <button
            className={viewMode === 'summary' ? 'is-active' : ''}
            type="button"
            onClick={() => setViewMode('summary')}
          >
            Resumido
          </button>
          <button
            className={viewMode === 'detail' ? 'is-active' : ''}
            type="button"
            onClick={() => setViewMode('detail')}
          >
            Detalhado
          </button>
        </div>
        <div className="nice-documentation-tabs" role="tablist" aria-label="Visualizacoes da documentacao">
          {[
            ['markdown', 'Markdown'],
            ['flow', 'Fluxo visual'],
            ['d3', 'Fluxograma D3'],
            ['mermaid', 'Mermaid'],
            ['paths', 'Caminhos'],
          ].map(([tab, label]) => (
            <button
              className={activeTab === tab ? 'is-active' : ''}
              type="button"
              role="tab"
              aria-selected={activeTab === tab}
              key={tab}
              onClick={() => setActiveTab(tab)}
            >
              {label}
            </button>
          ))}
        </div>
        {activeTab === 'markdown' && (
          <div className="nice-documentation-preview" aria-label="Preview Markdown">
            {markdown.split('\n').map((line, index) => (
              <div className={documentationLineClass(line)} key={`${index}-${line.slice(0, 16)}`}>
                {renderDocumentationLine(line, onFocusAction)}
              </div>
            ))}
          </div>
        )}
        {activeTab === 'flow' && (
          <NiceDocumentationFlowCanvas
            flow={visualFlow}
            canvasRef={flowCanvasRef}
            onFocusAction={onFocusAction}
          />
        )}
        {activeTab === 'd3' && (
          <NiceDocumentationD3Flowchart
            flow={visualFlow}
            exportRef={d3FlowRef}
            onFocusAction={onFocusAction}
          />
        )}
        {activeTab === 'mermaid' && (
          <NiceDocumentationMermaidFlowchart
            script={script}
            flow={visualFlow}
            mode={viewMode}
            exportRef={mermaidFlowRef}
            onFocusAction={onFocusAction}
          />
        )}
        {activeTab === 'paths' && (
          <div className="nice-documentation-paths" aria-label="Caminhos documentados">
            {(flow?.paths ?? []).length === 0 ? (
              <div className="nice-documentation-empty">
                <strong>Nenhum caminho interpretado ainda.</strong>
                <span>Menus, IFs, RUNSUBs e REST_API aparecem aqui quando existem no canvas.</span>
              </div>
            ) : (
              flow.paths.map((path, index) => (
                <article className="nice-documentation-path-card" key={`${path.title}-${index}`}>
                  <h3>{path.title}</h3>
                  <ol>
                    {path.items.map((item, itemIndex) => (
                      <li key={`${item}-${itemIndex}`}>{renderDocumentationLine(item, onFocusAction)}</li>
                    ))}
                  </ol>
                </article>
              ))
            )}
          </div>
        )}
      </section>
    </div>
  );
}

function renderDocumentationLine(line, onFocusAction) {
  const parts = [];
  const pattern = /#(\d+)/g;
  let lastIndex = 0;
  let match;

  while ((match = pattern.exec(line)) !== null) {
    if (match.index > lastIndex) parts.push(line.slice(lastIndex, match.index));
    const actionId = Number(match[1]);
    parts.push(
      <button
        className="nice-doc-action-link"
        type="button"
        key={`${actionId}-${match.index}`}
        onClick={() => onFocusAction?.(actionId)}
        title={`Focar ActionID ${actionId}`}
      >
        #{actionId}
      </button>,
    );
    lastIndex = match.index + match[0].length;
  }

  if (lastIndex < line.length) parts.push(line.slice(lastIndex));
  return parts.length ? parts : '\u00a0';
}

function documentationLineClass(line) {
  if (line.startsWith('# ')) return 'nice-doc-line is-h1';
  if (line.startsWith('## ')) return 'nice-doc-line is-h2';
  if (line.startsWith('### ')) return 'nice-doc-line is-h3';
  if (line.startsWith('|')) return 'nice-doc-line is-table';
  if (line.startsWith('```')) return 'nice-doc-line is-code-fence';
  return 'nice-doc-line';
}
function sanitizeFileName(value) {
  return String(value || 'script-nice')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9._-]+/gi, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80) || 'script-nice';
}


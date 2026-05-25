import { useEffect, useMemo, useRef } from 'react';
import * as d3 from 'd3';

const NODE_WIDTH = 240;
const NODE_HEIGHT = 118;
const LEVEL_GAP = 185;
const NODE_GAP = 56;
const PADDING = 70;

const TYPE_LABELS = {
  start: 'Inicio',
  menu: 'Menu',
  optionHub: 'Opcoes',
  option: 'DTMF',
  rule: 'Regra / IF',
  api: 'API',
  hub: 'Hub',
  output: 'Saida',
  reject: 'Erro / REJ',
  silence: 'Silencio',
  onrelease: 'OnRelease',
};

const TYPE_STYLES = {
  start: { fill: '#dcfce7', stroke: '#16a34a', accent: '#15803d' },
  menu: { fill: '#dbeafe', stroke: '#2563eb', accent: '#1d4ed8' },
  optionHub: { fill: '#f3e8ff', stroke: '#7c3aed', accent: '#6d28d9' },
  option: { fill: '#f3e8ff', stroke: '#7c3aed', accent: '#6d28d9' },
  rule: { fill: '#ccfbf1', stroke: '#0f766e', accent: '#0f766e' },
  api: { fill: '#cffafe', stroke: '#0891b2', accent: '#0e7490' },
  hub: { fill: '#e0f2fe', stroke: '#0284c7', accent: '#0369a1' },
  output: { fill: '#f1f5f9', stroke: '#475569', accent: '#334155' },
  reject: { fill: '#fee2e2', stroke: '#dc2626', accent: '#b91c1c' },
  silence: { fill: '#fef3c7', stroke: '#d97706', accent: '#b45309' },
  onrelease: { fill: '#f3e8ff', stroke: '#9333ea', accent: '#7e22ce' },
};

const EDGE_COLORS = {
  success: '#16a34a',
  warning: '#d97706',
  error: '#dc2626',
  option: '#7c3aed',
  default: '#64748b',
};

function NiceDocumentationD3Flowchart({ flow, exportRef, onFocusAction }) {
  const svgRef = useRef(null);
  const zoomRef = useRef(null);
  const zoomLayerRef = useRef(null);
  const layout = useMemo(() => buildD3FlowchartLayout(flow), [flow]);

  useEffect(() => {
    const svgElement = svgRef.current;
    if (!svgElement) return;

    const svg = d3.select(svgElement);
    svg.selectAll('*').remove();
    svg.attr('viewBox', `0 0 ${layout.width} ${layout.height}`);

    const defs = svg.append('defs');
    Object.entries(EDGE_COLORS).forEach(([kind, color]) => {
      defs.append('marker')
        .attr('id', `d3-flow-arrow-${kind}`)
        .attr('viewBox', '0 0 10 10')
        .attr('refX', 9)
        .attr('refY', 5)
        .attr('markerWidth', 7)
        .attr('markerHeight', 7)
        .attr('orient', 'auto-start-reverse')
        .append('path')
        .attr('d', 'M 0 0 L 10 5 L 0 10 z')
        .attr('fill', color);
    });

    const zoomLayer = svg.append('g').attr('class', 'nice-d3-zoom-layer');
    zoomLayerRef.current = zoomLayer;

    drawEdges(zoomLayer.append('g').attr('class', 'nice-d3-edges'), layout);
    drawNodes(zoomLayer.append('g').attr('class', 'nice-d3-nodes'), layout, onFocusAction);

    const zoom = d3.zoom()
      .scaleExtent([0.35, 2.2])
      .on('zoom', (event) => {
        zoomLayer.attr('transform', event.transform);
      });

    zoomRef.current = zoom;
    svg.call(zoom);
    svg.call(zoom.transform, d3.zoomIdentity);
  }, [layout, onFocusAction]);

  function zoomBy(multiplier) {
    if (!svgRef.current || !zoomRef.current) return;
    d3.select(svgRef.current).transition().duration(180).call(zoomRef.current.scaleBy, multiplier);
  }

  function resetZoom() {
    if (!svgRef.current || !zoomRef.current) return;
    d3.select(svgRef.current).transition().duration(220).call(zoomRef.current.transform, d3.zoomIdentity);
  }

  if (!layout.nodes.length) {
    return (
      <div className="nice-d3-flowchart-shell">
        <div className="nice-documentation-empty">
          <strong>Nao foi possivel montar o fluxograma.</strong>
          <span>Adicione actions documentaveis como BEGIN, MENU, IF, API ou Saida.</span>
        </div>
      </div>
    );
  }

  return (
    <div className="nice-d3-flowchart-shell">
      <div className="nice-d3-flowchart-toolbar">
        <strong>Fluxograma documental</strong>
        <button type="button" className="ghost-button" onClick={() => zoomBy(1.15)}>Zoom +</button>
        <button type="button" className="ghost-button" onClick={() => zoomBy(0.85)}>Zoom -</button>
        <button type="button" className="ghost-button" onClick={resetZoom}>Resetar</button>
      </div>
      <div className="nice-d3-flowchart-viewport">
        <div
          className="nice-d3-flowchart-stage"
          ref={exportRef}
          style={{ width: layout.width, height: layout.height }}
        >
          <svg
            className="nice-d3-flowchart-svg"
            ref={svgRef}
            width={layout.width}
            height={layout.height}
            role="img"
            aria-label="Fluxograma documental da URA"
          />
        </div>
      </div>
      <div className="nice-d3-flowchart-legend">
        <span><i className="is-success" />True / OK</span>
        <span><i className="is-warning" />Timeout / SIL</span>
        <span><i className="is-error" />Erro / REJ</span>
        <span><i className="is-option" />DTMF / Case</span>
      </div>
    </div>
  );
}

function drawEdges(group, layout) {
  const routes = buildEdgeRoutes(layout);

  routes.forEach((route) => {
    const { edge } = route;
    const colorKind = edgeKind(edge);

    group.append('path')
      .attr('class', 'nice-d3-edge-shadow')
      .attr('d', route.path)
      .attr('fill', 'none');

    group.append('path')
      .attr('class', `nice-d3-edge is-${colorKind}`)
      .attr('d', route.path)
      .attr('fill', 'none')
      .attr('stroke', EDGE_COLORS[colorKind])
      .attr('stroke-width', 2)
      .attr('marker-end', `url(#d3-flow-arrow-${colorKind})`);

    if (edge.label) {
      group.append('text')
        .attr('class', 'nice-d3-edge-label')
        .attr('x', route.labelX)
        .attr('y', route.labelY)
        .attr('text-anchor', 'middle')
        .text(String(edge.label));
    }
  });
}

function buildEdgeRoutes(layout) {
  const nodeById = new Map(layout.nodes.map((node) => [node.id, node]));
  const outgoing = groupEdges(layout.edges, 'source');
  const incoming = groupEdges(layout.edges, 'target');

  return layout.edges.map((edge, index) => {
    const source = nodeById.get(edge.source);
    const target = nodeById.get(edge.target);
    if (!source || !target) return null;

    const sourceOffset = spreadOffset(outgoing.get(edge.source), edge, index, 28);
    const targetOffset = spreadOffset(incoming.get(edge.target), edge, index, 22);
    const isBackEdge = target.y <= source.y;

    if (isBackEdge) {
      const sx = source.x + NODE_WIDTH;
      const sy = source.y + NODE_HEIGHT / 2;
      const tx = target.x + NODE_WIDTH;
      const ty = target.y + NODE_HEIGHT / 2;
      const sideX = Math.max(source.x + NODE_WIDTH, target.x + NODE_WIDTH) + 70 + Math.abs(sourceOffset) * 0.55;
      const path = `M ${sx} ${sy} L ${sideX} ${sy} L ${sideX} ${ty} L ${tx} ${ty}`;
      return {
        edge,
        path,
        labelX: sideX + 4,
        labelY: (sy + ty) / 2 - 8,
      };
    }

    const sx = source.x + NODE_WIDTH / 2 + sourceOffset;
    const sy = source.y + NODE_HEIGHT;
    const tx = target.x + NODE_WIDTH / 2 + targetOffset;
    const ty = target.y;
    const midY = sy + Math.max(42, (ty - sy) / 2);
    const bend = Math.min(18, Math.max(8, Math.abs(tx - sx) / 12));
    const path = [
      `M ${sx} ${sy}`,
      `L ${sx} ${midY - bend}`,
      `Q ${sx} ${midY} ${sx + Math.sign(tx - sx || 1) * bend} ${midY}`,
      `L ${tx - Math.sign(tx - sx || 1) * bend} ${midY}`,
      `Q ${tx} ${midY} ${tx} ${midY + bend}`,
      `L ${tx} ${ty}`,
    ].join(' ');

    return {
      edge,
      path,
      labelX: (sx + tx) / 2,
      labelY: midY - 10,
    };
  }).filter(Boolean);
}

function groupEdges(edges, key) {
  const groups = new Map();
  edges.forEach((edge, index) => {
    const value = edge[key];
    if (!groups.has(value)) groups.set(value, []);
    groups.get(value).push({ edge, index });
  });
  return groups;
}

function spreadOffset(group = [], edge, edgeIndex, gap) {
  const sorted = [...group].sort((a, b) => a.index - b.index);
  const index = sorted.findIndex((item) => item.edge === edge || item.index === edgeIndex);
  const centered = index < 0 ? 0 : index - (sorted.length - 1) / 2;
  return centered * gap;
}

function drawNodes(group, layout, onFocusAction) {
  const node = group.selectAll('g')
    .data(layout.nodes)
    .join('g')
    .attr('class', (item) => `nice-d3-node is-${item.docType}`)
    .attr('transform', (item) => `translate(${item.x}, ${item.y})`)
    .attr('tabindex', 0)
    .attr('role', 'button')
    .style('cursor', (item) => item.actionIds?.length ? 'pointer' : 'default')
    .on('click', (_, item) => {
      const actionId = item.actionIds?.[0];
      if (actionId) onFocusAction?.(actionId);
    });

  node.each(function renderNode(item) {
    const style = TYPE_STYLES[item.docType] ?? TYPE_STYLES.output;
    const current = d3.select(this);

    if (item.docType === 'rule') {
      current.append('polygon')
        .attr('points', `${NODE_WIDTH / 2},0 ${NODE_WIDTH},${NODE_HEIGHT / 2} ${NODE_WIDTH / 2},${NODE_HEIGHT} 0,${NODE_HEIGHT / 2}`)
        .attr('fill', style.fill)
        .attr('stroke', style.stroke)
        .attr('stroke-width', 2);
    } else {
      current.append('rect')
        .attr('width', NODE_WIDTH)
        .attr('height', NODE_HEIGHT)
        .attr('rx', item.docType === 'start' ? 28 : 10)
        .attr('fill', style.fill)
        .attr('stroke', style.stroke)
        .attr('stroke-width', 2);
    }

    current.append('text')
      .attr('class', 'nice-d3-node-badge')
      .attr('x', NODE_WIDTH / 2)
      .attr('y', 24)
      .attr('text-anchor', 'middle')
      .attr('fill', style.accent)
      .text(TYPE_LABELS[item.docType] ?? 'Fluxo');

    current.append('text')
      .attr('class', 'nice-d3-node-title')
      .attr('x', NODE_WIDTH / 2)
      .attr('y', 48)
      .attr('text-anchor', 'middle')
      .text(shortText(item.title, 30));

    if (item.subtitle) {
      current.append('text')
        .attr('class', 'nice-d3-node-subtitle')
        .attr('x', NODE_WIDTH / 2)
        .attr('y', 68)
        .attr('text-anchor', 'middle')
        .text(shortText(item.subtitle, 34));
    }

    const details = (item.details ?? []).slice(0, 2);
    details.forEach((detail, index) => {
      current.append('text')
        .attr('class', 'nice-d3-node-detail')
        .attr('x', NODE_WIDTH / 2)
        .attr('y', 88 + index * 15)
        .attr('text-anchor', 'middle')
        .text(shortText(`${detail.label}: ${detail.value}`, 36));
    });
  });
}

function buildD3FlowchartLayout(flow) {
  const sourceNodes = flow?.nodes ?? [];
  const nodes = sourceNodes.map((node) => ({
    id: node.id,
    title: node.data?.title ?? 'Fluxo',
    subtitle: node.data?.subtitle ?? '',
    details: node.data?.details ?? [],
    actionIds: node.data?.actionIds ?? [],
    docType: node.data?.docType ?? 'output',
    position: node.position,
  }));

  const edges = flow?.edges ?? [];
  if (nodes.some((node) => node.position)) {
    const minX = Math.min(...nodes.map((node) => node.position?.x ?? 0), 0);
    const minY = Math.min(...nodes.map((node) => node.position?.y ?? 0), 0);
    nodes.forEach((node) => {
      node.x = (node.position?.x ?? 0) - minX + PADDING;
      node.y = (node.position?.y ?? 0) - minY + PADDING;
    });
    const maxX = Math.max(...nodes.map((node) => node.x + NODE_WIDTH), NODE_WIDTH);
    const maxY = Math.max(...nodes.map((node) => node.y + NODE_HEIGHT), NODE_HEIGHT);
    return {
      nodes,
      edges,
      width: Math.max(980, maxX + PADDING),
      height: Math.max(620, maxY + PADDING),
    };
  }

  const levels = new Map();
  nodes.forEach((node) => {
    const level = levelForType(node.docType);
    if (!levels.has(level)) levels.set(level, []);
    levels.get(level).push(node);
  });

  const sortedLevels = [...levels.entries()].sort(([a], [b]) => a - b);
  const maxColumns = Math.max(1, ...sortedLevels.map(([, items]) => items.length));
  const width = Math.max(980, PADDING * 2 + maxColumns * NODE_WIDTH + (maxColumns - 1) * NODE_GAP);
  const height = Math.max(620, PADDING * 2 + sortedLevels.length * NODE_HEIGHT + (sortedLevels.length - 1) * LEVEL_GAP);

  sortedLevels.forEach(([level, items]) => {
    items.sort((a, b) => orderForType(a.docType) - orderForType(b.docType) || String(a.title).localeCompare(String(b.title)));
    const rowWidth = items.length * NODE_WIDTH + Math.max(0, items.length - 1) * NODE_GAP;
    const startX = (width - rowWidth) / 2;
    items.forEach((node, index) => {
      node.x = startX + index * (NODE_WIDTH + NODE_GAP);
      node.y = PADDING + level * (NODE_HEIGHT + LEVEL_GAP);
    });
  });

  return { nodes, edges, width, height };
}

function levelForType(type) {
  return {
    start: 0,
    menu: 1,
    optionHub: 2,
    option: 3,
    rule: 4,
    api: 5,
    hub: 6,
    reject: 6,
    silence: 6,
    output: 7,
    onrelease: 8,
  }[type] ?? 5;
}

function orderForType(type) {
  return {
    start: 0,
    menu: 1,
    optionHub: 2,
    option: 3,
    rule: 4,
    api: 5,
    hub: 6,
    silence: 6,
    reject: 7,
    output: 8,
    onrelease: 9,
  }[type] ?? 10;
}

function edgeKind(edge) {
  const label = String(edge?.label ?? '').toLowerCase();
  const className = String(edge?.className ?? '').toLowerCase();
  if (className.includes('success') || label.includes('true') || label.includes('ok')) return 'success';
  if (className.includes('warning') || label.includes('timeout') || label.includes('sil')) return 'warning';
  if (className.includes('error') || label.includes('false') || label.includes('erro') || label.includes('rej')) return 'error';
  if (label.includes('case') || label.includes('opcao') || label.includes('dtmf')) return 'option';
  return 'default';
}

function shortText(value, limit) {
  const text = String(value ?? '').replace(/\s+/g, ' ').trim();
  if (text.length <= limit) return text;
  return `${text.slice(0, Math.max(0, limit - 1))}…`;
}

export default NiceDocumentationD3Flowchart;

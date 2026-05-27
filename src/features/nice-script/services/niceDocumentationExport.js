export function createDocumentationExportElement(flow) {
  const nodeWidth = 260;
  const nodeHeight = 142;
  const padding = 48;
  const nodes = flow?.nodes ?? [];
  const edges = flow?.edges ?? [];
  const minX = Math.min(...nodes.map((node) => node.position.x), 0);
  const minY = Math.min(...nodes.map((node) => node.position.y), 0);
  const maxX = Math.max(...nodes.map((node) => node.position.x + nodeWidth), nodeWidth);
  const maxY = Math.max(...nodes.map((node) => node.position.y + nodeHeight), nodeHeight);
  const width = Math.ceil(maxX - minX + padding * 2);
  const height = Math.ceil(maxY - minY + padding * 2);
  const offsetX = padding - minX;
  const offsetY = padding - minY;
  const nodeById = new Map(nodes.map((node) => [node.id, node]));

  const root = document.createElement('div');
  root.className = 'nice-documentation-export-canvas';
  root.style.width = `${width}px`;
  root.style.height = `${height}px`;
  root.style.position = 'fixed';
  root.style.left = '0';
  root.style.top = '0';
  root.style.zIndex = '-1';
  root.style.pointerEvents = 'none';
  root.style.background = '#f8fafc';

  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('width', String(width));
  svg.setAttribute('height', String(height));
  svg.setAttribute('viewBox', `0 0 ${width} ${height}`);
  svg.classList.add('nice-documentation-export-edges');

  const defs = document.createElementNS('http://www.w3.org/2000/svg', 'defs');
  ['default', 'success', 'warning', 'error'].forEach((kind) => {
    const marker = document.createElementNS('http://www.w3.org/2000/svg', 'marker');
    marker.setAttribute('id', `doc-export-arrow-${kind}`);
    marker.setAttribute('viewBox', '0 0 10 10');
    marker.setAttribute('refX', '9');
    marker.setAttribute('refY', '5');
    marker.setAttribute('markerWidth', '6');
    marker.setAttribute('markerHeight', '6');
    marker.setAttribute('orient', 'auto-start-reverse');
    const arrow = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    arrow.setAttribute('d', 'M 0 0 L 10 5 L 0 10 z');
    arrow.setAttribute('fill', documentationEdgeColor(kind));
    marker.appendChild(arrow);
    defs.appendChild(marker);
  });
  svg.appendChild(defs);

  edges.forEach((edge) => {
    const source = nodeById.get(edge.source);
    const target = nodeById.get(edge.target);
    if (!source || !target) return;
    const route = documentationExportEdgeRoute(edge, source, target, edges, offsetX, offsetY, nodeWidth, nodeHeight);
    const kind = documentationEdgeKind(edge);
    const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    const shadow = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    shadow.setAttribute('d', route.path);
    shadow.setAttribute('fill', 'none');
    shadow.setAttribute('stroke', '#f8fafc');
    shadow.setAttribute('stroke-width', '7');
    shadow.setAttribute('stroke-linecap', 'round');
    shadow.setAttribute('stroke-linejoin', 'round');
    svg.appendChild(shadow);

    path.setAttribute('d', route.path);
    path.setAttribute('fill', 'none');
    path.setAttribute('stroke', documentationEdgeColor(kind));
    path.setAttribute('stroke-width', '2');
    path.setAttribute('stroke-linecap', 'round');
    path.setAttribute('stroke-linejoin', 'round');
    path.setAttribute('marker-end', `url(#doc-export-arrow-${kind})`);
    svg.appendChild(path);

    if (edge.label) {
      const text = document.createElementNS('http://www.w3.org/2000/svg', 'text');
      text.setAttribute('x', String(route.labelX));
      text.setAttribute('y', String(route.labelY));
      text.setAttribute('text-anchor', 'middle');
      text.setAttribute('class', 'nice-documentation-export-edge-label');
      text.textContent = String(edge.label);
      svg.appendChild(text);
    }
  });

  root.appendChild(svg);

  nodes.forEach((node) => {
    const element = document.createElement('article');
    element.className = `nice-doc-flow-node nice-documentation-export-node is-${node.data?.docType ?? 'output'}`;
    element.style.left = `${node.position.x + offsetX}px`;
    element.style.top = `${node.position.y + offsetY}px`;
    element.style.width = `${nodeWidth}px`;

    const badge = document.createElement('div');
    badge.className = 'nice-doc-flow-node-badge';
    badge.textContent = documentationDocTypeLabel(node.data?.docType);
    element.appendChild(badge);

    const title = document.createElement('h3');
    title.textContent = node.data?.title ?? 'Fluxo';
    element.appendChild(title);

    if (node.data?.subtitle) {
      const subtitle = document.createElement('p');
      subtitle.textContent = node.data.subtitle;
      element.appendChild(subtitle);
    }

    if (node.data?.details?.length) {
      const dl = document.createElement('dl');
      node.data.details.slice(0, 4).forEach((item) => {
        const row = document.createElement('div');
        const dt = document.createElement('dt');
        const dd = document.createElement('dd');
        dt.textContent = item.label;
        dd.textContent = item.value;
        row.append(dt, dd);
        dl.appendChild(row);
      });
      element.appendChild(dl);
    }

    if (node.data?.actionIds?.length) {
      const action = document.createElement('span');
      action.className = 'nice-doc-flow-node-action';
      action.textContent = `#${node.data.actionIds.join(', #')}`;
      element.appendChild(action);
    }

    root.appendChild(element);
  });

  return root;
}

export function waitForExportLayout() {
  return new Promise((resolve) => {
    requestAnimationFrame(() => {
      requestAnimationFrame(resolve);
    });
  });
}

function documentationExportEdgeRoute(edge, source, target, edges, offsetX, offsetY, nodeWidth, nodeHeight) {
  const outgoing = edges.filter((item) => item.source === edge.source);
  const incoming = edges.filter((item) => item.target === edge.target);
  const sourceOffset = centeredEdgeOffset(outgoing, edge, 24);
  const targetOffset = centeredEdgeOffset(incoming, edge, 20);
  const sourceX = source.position.x + offsetX;
  const sourceY = source.position.y + offsetY;
  const targetX = target.position.x + offsetX;
  const targetY = target.position.y + offsetY;
  const isBackEdge = targetY <= sourceY;

  if (isBackEdge) {
    const sx = sourceX + nodeWidth;
    const sy = sourceY + nodeHeight / 2;
    const tx = targetX + nodeWidth;
    const ty = targetY + nodeHeight / 2;
    const sideX = Math.max(sourceX + nodeWidth, targetX + nodeWidth) + 64 + Math.abs(sourceOffset);
    return {
      path: `M ${sx} ${sy} L ${sideX} ${sy} L ${sideX} ${ty} L ${tx} ${ty}`,
      labelX: sideX + 4,
      labelY: (sy + ty) / 2 - 8,
    };
  }

  const sx = sourceX + nodeWidth / 2 + sourceOffset;
  const sy = sourceY + nodeHeight;
  const tx = targetX + nodeWidth / 2 + targetOffset;
  const ty = targetY;
  const midY = sy + Math.max(56, (ty - sy) / 2);
  const direction = Math.sign(tx - sx || 1);
  const bend = Math.min(18, Math.max(8, Math.abs(tx - sx) / 12));

  return {
    path: [
      `M ${sx} ${sy}`,
      `L ${sx} ${midY - bend}`,
      `Q ${sx} ${midY} ${sx + direction * bend} ${midY}`,
      `L ${tx - direction * bend} ${midY}`,
      `Q ${tx} ${midY} ${tx} ${midY + bend}`,
      `L ${tx} ${ty}`,
    ].join(' '),
    labelX: (sx + tx) / 2,
    labelY: midY - 10,
  };
}

function centeredEdgeOffset(group, edge, gap) {
  const index = group.indexOf(edge);
  if (index < 0) return 0;
  return (index - (group.length - 1) / 2) * gap;
}

function documentationEdgeKind(edge) {
  const className = String(edge?.className ?? '');
  if (className.includes('success')) return 'success';
  if (className.includes('warning')) return 'warning';
  if (className.includes('error')) return 'error';
  return 'default';
}

function documentationEdgeColor(kind) {
  return {
    success: '#16a34a',
    warning: '#d97706',
    error: '#dc2626',
    default: '#64748b',
  }[kind] ?? '#64748b';
}

function documentationDocTypeLabel(type) {
  return {
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
  }[type] ?? 'Fluxo';
}

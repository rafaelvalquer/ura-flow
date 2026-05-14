import html2canvas from 'html2canvas';
import jsPDF from 'jspdf';

const GRAPH_PADDING = 220;
const HEADER_HEIGHT = 58;
const PX_PER_MM = 5.2;
const MAX_CANVAS_AREA = 72000000;
const MAX_CANVAS_SIDE = 16000;
const MAX_PDF_MM_SIDE = 5080;

const NODE_SIZES = {
  stateNode: { width: 250, height: 96 },
  conditionNode: { width: 230, height: 76 },
  terminalNode: { width: 230, height: 86 },
  transferNode: { width: 230, height: 86 },
  unknownNode: { width: 230, height: 86 },
  biMarkingNode: { width: 240, height: 110 },
  default: { width: 230, height: 86 },
};

export async function exportFlowToPdf(element, { stateName, viewMode, nodes = [] }) {
  if (!element) throw new Error('Area do fluxo nao encontrada para exportacao.');

  const reactFlow = element.querySelector('.react-flow');
  const viewport = element.querySelector('.react-flow__viewport');
  if (!reactFlow || !viewport) throw new Error('Canvas do React Flow nao encontrado para exportacao.');

  const bounds = getGraphBounds(element, nodes);
  const exportWidth = Math.ceil(Math.max(1100, bounds.width + GRAPH_PADDING * 2));
  const exportHeight = Math.ceil(Math.max(720, bounds.height + GRAPH_PADDING * 2 + HEADER_HEIGHT));
  const offsetX = Math.round(GRAPH_PADDING - bounds.minX);
  const offsetY = Math.round(GRAPH_PADDING + HEADER_HEIGHT - bounds.minY);
  const scale = getCaptureScale(exportWidth, exportHeight);
  const restore = prepareElementForExport({
    element,
    reactFlow,
    viewport,
    exportWidth,
    exportHeight,
    offsetX,
    offsetY,
    stateName,
    viewMode,
  });

  try {
    await waitForPaint();

    const canvas = await html2canvas(element, {
      backgroundColor: '#F8FAFC',
      scale,
      useCORS: true,
      width: exportWidth,
      height: exportHeight,
      windowWidth: exportWidth,
      windowHeight: exportHeight,
      scrollX: 0,
      scrollY: 0,
      logging: false,
    });

    const pdf = buildSinglePagePdf(canvas, { exportWidth, exportHeight });
    pdf.save(`ura-flow-${sanitizeFileName(stateName || 'estado')}.pdf`);
  } finally {
    restore();
  }
}

function buildSinglePagePdf(canvas, { exportWidth, exportHeight }) {
  const size = getPdfPageSize(exportWidth, exportHeight);
  const pdf = new jsPDF({
    orientation: size.width >= size.height ? 'landscape' : 'portrait',
    unit: 'mm',
    format: [size.width, size.height],
    compress: true,
  });

  pdf.addImage(canvas.toDataURL('image/png'), 'PNG', 0, 0, size.width, size.height);
  return pdf;
}

function getPdfPageSize(widthPx, heightPx) {
  const rawWidth = widthPx / PX_PER_MM;
  const rawHeight = heightPx / PX_PER_MM;
  const ratio = Math.min(1, MAX_PDF_MM_SIDE / Math.max(rawWidth, rawHeight));
  return {
    width: Math.max(10, rawWidth * ratio),
    height: Math.max(10, rawHeight * ratio),
  };
}

function getGraphBounds(element, nodes) {
  const domBounds = getDomNodeBounds(element);
  if (domBounds) return domBounds;
  return getNodeDataBounds(nodes);
}

function getDomNodeBounds(element) {
  const nodeElements = [...element.querySelectorAll('.react-flow__node')];
  if (nodeElements.length === 0) return null;

  const boxes = nodeElements
    .map((node) => {
      const position = parseTranslate(node.style.transform);
      if (!position) return null;
      return {
        minX: position.x,
        minY: position.y,
        maxX: position.x + node.offsetWidth,
        maxY: position.y + node.offsetHeight,
      };
    })
    .filter(Boolean);

  if (boxes.length === 0) return null;
  return boundsFromBoxes(boxes);
}

function getNodeDataBounds(nodes) {
  if (!nodes?.length) {
    return { minX: 0, minY: 0, maxX: 1000, maxY: 650, width: 1000, height: 650 };
  }

  const boxes = nodes.map((node) => {
    const size = NODE_SIZES[node.type] ?? NODE_SIZES.default;
    const x = node.position?.x ?? 0;
    const y = node.position?.y ?? 0;
    return {
      minX: x,
      minY: y,
      maxX: x + (node.measured?.width ?? node.width ?? size.width),
      maxY: y + (node.measured?.height ?? node.height ?? size.height),
    };
  });

  return boundsFromBoxes(boxes);
}

function boundsFromBoxes(boxes) {
  const minX = Math.min(...boxes.map((box) => box.minX));
  const minY = Math.min(...boxes.map((box) => box.minY));
  const maxX = Math.max(...boxes.map((box) => box.maxX));
  const maxY = Math.max(...boxes.map((box) => box.maxY));
  return {
    minX,
    minY,
    maxX,
    maxY,
    width: Math.max(1, maxX - minX),
    height: Math.max(1, maxY - minY),
  };
}

function parseTranslate(value) {
  const match = String(value ?? '').match(/translate(?:3d)?\(\s*(-?\d+(?:\.\d+)?)px,\s*(-?\d+(?:\.\d+)?)px/i);
  if (!match) return null;
  return { x: Number(match[1]), y: Number(match[2]) };
}

function getCaptureScale(width, height) {
  const maxSideScale = MAX_CANVAS_SIDE / Math.max(width, height);
  const maxAreaScale = Math.sqrt(MAX_CANVAS_AREA / Math.max(1, width * height));
  return Math.max(0.7, Math.min(1.5, maxSideScale, maxAreaScale));
}

function prepareElementForExport({
  element,
  reactFlow,
  viewport,
  exportWidth,
  exportHeight,
  offsetX,
  offsetY,
  stateName,
  viewMode,
}) {
  const records = [];
  const hiddenElements = [
    ...element.querySelectorAll('.react-flow__controls, .react-flow__minimap, .react-flow__attribution'),
  ];
  const metadata = createMetadataBanner({ stateName, viewMode });

  saveStyles(records, element, ['width', 'height', 'minHeight', 'overflow', 'background']);
  saveStyles(records, reactFlow, ['width', 'height']);
  saveStyles(records, viewport, ['transform', 'transformOrigin']);
  hiddenElements.forEach((item) => saveStyles(records, item, ['display']));

  element.style.width = `${exportWidth}px`;
  element.style.height = `${exportHeight}px`;
  element.style.minHeight = `${exportHeight}px`;
  element.style.overflow = 'visible';
  element.style.background = '#F8FAFC';
  reactFlow.style.width = `${exportWidth}px`;
  reactFlow.style.height = `${exportHeight}px`;
  viewport.style.transformOrigin = '0 0';
  viewport.style.transform = `translate(${offsetX}px, ${offsetY}px) scale(1)`;
  hiddenElements.forEach((item) => {
    item.style.display = 'none';
  });
  element.appendChild(metadata);

  return () => {
    metadata.remove();
    records.reverse().forEach(({ element: target, property, value }) => {
      target.style[property] = value;
    });
  };
}

function createMetadataBanner({ stateName, viewMode }) {
  const banner = document.createElement('div');
  banner.className = 'pdf-export-metadata';
  banner.style.position = 'absolute';
  banner.style.left = '18px';
  banner.style.top = '14px';
  banner.style.right = '18px';
  banner.style.height = '42px';
  banner.style.zIndex = '80';
  banner.style.display = 'flex';
  banner.style.alignItems = 'center';
  banner.style.justifyContent = 'space-between';
  banner.style.gap = '16px';
  banner.style.padding = '0 14px';
  banner.style.border = '1px solid #E5E7EB';
  banner.style.borderRadius = '8px';
  banner.style.background = '#FFFFFF';
  banner.style.boxShadow = '0 10px 24px rgba(15, 23, 42, 0.10)';
  banner.style.color = '#111827';
  banner.style.fontFamily = 'Inter, Segoe UI, sans-serif';
  banner.style.fontSize = '13px';
  banner.innerHTML = `
    <strong style="font-size:14px;">URA Flow Builder - ${escapeHtml(stateName || 'Estado')}</strong>
    <span>${viewMode === 'detailedView' ? 'Visao detalhada' : 'Visao por estado'}</span>
    <span>Exportado em: ${new Date().toLocaleString('pt-BR')}</span>
  `;
  return banner;
}

function saveStyles(records, element, properties) {
  properties.forEach((property) => {
    records.push({ element, property, value: element.style[property] });
  });
}

async function waitForPaint() {
  if (document.fonts?.ready) {
    await document.fonts.ready;
  }
  await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function sanitizeFileName(value) {
  return String(value).replace(/[^a-z0-9_-]+/gi, '-').replace(/^-+|-+$/g, '') || 'estado';
}

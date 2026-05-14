import { getNodesBounds, getViewportForBounds } from '@xyflow/react';
import { toPng } from 'html-to-image';

const IMAGE_PADDING = 140;
const MIN_IMAGE_WIDTH = 1200;
const MIN_IMAGE_HEIGHT = 800;

export async function exportFlowToPng(element, { nodes = [], stateName = 'estado' } = {}) {
  if (!element) throw new Error('Area do fluxo nao encontrada para exportacao.');

  const viewportElement = element.querySelector('.react-flow__viewport');
  if (!viewportElement) throw new Error('Viewport do React Flow nao encontrado para exportacao.');
  if (!nodes.length) throw new Error('Nenhum node disponivel para exportacao.');

  const exportNodes = enrichNodesWithDomSizes(element, nodes);
  const nodesBounds = getNodesBounds(exportNodes);
  const { imageWidth, imageHeight } = getExportDimensions(nodesBounds);
  const viewport = getViewportForBounds(
    nodesBounds,
    imageWidth,
    imageHeight,
    0.5,
    2,
  );

  const restore = prepareViewportForExport(element, viewportElement);

  try {
    await waitForPaint();
    const dataUrl = await toPng(viewportElement, {
      backgroundColor: '#F8FAFC',
      cacheBust: true,
      pixelRatio: 1,
      width: imageWidth,
      height: imageHeight,
      style: {
        width: `${imageWidth}px`,
        height: `${imageHeight}px`,
        transform: `translate(${viewport.x}px, ${viewport.y}px) scale(${viewport.zoom})`,
      },
    });

    downloadImage(dataUrl, `ura-flow-${sanitizeFileName(stateName)}.png`);
  } finally {
    restore();
  }
}

function getExportDimensions(nodesBounds) {
  return {
    imageWidth: Math.ceil(Math.max(MIN_IMAGE_WIDTH, nodesBounds.width + IMAGE_PADDING * 2)),
    imageHeight: Math.ceil(Math.max(MIN_IMAGE_HEIGHT, nodesBounds.height + IMAGE_PADDING * 2)),
  };
}

function enrichNodesWithDomSizes(element, nodes) {
  return nodes.map((node) => {
    const nodeElement = element.querySelector(`.react-flow__node[data-id="${escapeCssValue(node.id)}"]`);
    if (!nodeElement) return node;

    return {
      ...node,
      width: node.width ?? nodeElement.offsetWidth,
      height: node.height ?? nodeElement.offsetHeight,
      measured: {
        ...node.measured,
        width: node.measured?.width ?? nodeElement.offsetWidth,
        height: node.measured?.height ?? nodeElement.offsetHeight,
      },
    };
  });
}

function escapeCssValue(value) {
  if (window.CSS?.escape) return window.CSS.escape(value);
  return String(value).replace(/"/g, '\\"');
}

function prepareViewportForExport(element, viewportElement) {
  const hiddenItems = [
    ...element.querySelectorAll('.react-flow__controls, .react-flow__minimap, .react-flow__attribution'),
  ];
  const records = [];
  hiddenItems.forEach((item) => saveStyles(records, item, ['display']));
  inlineEdgeSvgStyles(viewportElement, records);
  hiddenItems.forEach((item) => {
    item.style.display = 'none';
  });

  return () => {
    restoreInlineStyles(records);
  };
}

function inlineEdgeSvgStyles(viewportElement, records) {
  const edgeItems = [
    ...viewportElement.querySelectorAll(
      '.react-flow__edges, .react-flow__edge, .react-flow__edge path, .react-flow__edge text, .react-flow__edge rect, .react-flow__edge marker, .react-flow__edge marker path',
    ),
  ];

  edgeItems.forEach((item) => {
    saveStyles(records, item, [
      'display',
      'visibility',
      'opacity',
      'overflow',
      'stroke',
      'strokeWidth',
      'strokeDasharray',
      'fill',
      'fontWeight',
      'color',
    ]);

    const computed = window.getComputedStyle(item);
    item.style.visibility = 'visible';
    item.style.opacity = computed.opacity || '1';
    item.style.overflow = 'visible';
    if (computed.display === 'none') item.style.display = 'block';

    if (item instanceof SVGPathElement) {
      const stroke = computed.stroke && computed.stroke !== 'none' ? computed.stroke : '#64748b';
      item.style.stroke = stroke;
      item.style.strokeWidth = computed.strokeWidth || '2px';
      if (computed.strokeDasharray && computed.strokeDasharray !== 'none') {
        item.style.strokeDasharray = computed.strokeDasharray;
      }
      item.style.fill = computed.fill === 'none' ? 'none' : computed.fill;
    }

    if (item instanceof SVGTextElement) {
      item.style.fill = computed.fill && computed.fill !== 'none' ? computed.fill : '#111827';
      item.style.fontWeight = computed.fontWeight || '700';
    }

    if (item instanceof SVGRectElement) {
      item.style.fill = computed.fill && computed.fill !== 'none' ? computed.fill : '#ffffff';
      item.style.stroke = computed.stroke && computed.stroke !== 'none' ? computed.stroke : '#e5e7eb';
      item.style.strokeWidth = computed.strokeWidth || '1px';
    }

    if (item instanceof SVGMarkerElement) {
      item.style.overflow = 'visible';
    }
  });
}

function saveStyles(records, element, properties) {
  properties.forEach((property) => {
    records.push({ element, property, value: element.style[property] });
  });
}

function restoreInlineStyles(records) {
  records.reverse().forEach(({ element: target, property, value }) => {
    target.style[property] = value;
  });
}

async function waitForPaint() {
  if (document.fonts?.ready) {
    await document.fonts.ready;
  }
  await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
}

function downloadImage(dataUrl, fileName) {
  const link = document.createElement('a');
  link.setAttribute('download', fileName);
  link.setAttribute('href', dataUrl);
  link.click();
}

function sanitizeFileName(value) {
  return String(value).replace(/[^a-z0-9_-]+/gi, '-').replace(/^-+|-+$/g, '') || 'estado';
}

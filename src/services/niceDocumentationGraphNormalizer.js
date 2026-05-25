const NODE_WIDTH = 280;
const NODE_HEIGHT = 160;
const COLUMN_GAP = 92;
const ROW_GAP = 92;
const LEVEL_GAP = 190;
const PADDING_X = 80;
const PADDING_Y = 80;

const SUMMARY_OPTION_COLUMNS = 5;
const DETAIL_OPTION_COLUMNS = 8;
const SUMMARY_OUTPUT_COLUMNS = 4;
const DETAIL_OUTPUT_COLUMNS = 6;

export function normalizeDocumentationGraph(flow, options = {}) {
  const mode = options.mode === 'detail' ? 'detail' : 'summary';
  const sourceNodes = cloneNodes(flow?.nodes ?? []);
  const sourceEdges = cloneEdges(flow?.edges ?? []);
  const shouldSummarize = mode === 'summary';

  if (!sourceNodes.length) {
    return { nodes: [], edges: [], paths: flow?.paths ?? [] };
  }

  const { nodes: groupedNodes, edges: groupedEdges } = groupOutputNodes(sourceNodes, sourceEdges, {
    groupSingles: shouldSummarize,
  });
  const { nodes: journeyNodes, edges: journeyEdges } = applyMenuJourney(groupedNodes, groupedEdges);
  const { nodes: routedNodes, edges: routedEdges } = shouldSummarize
    ? routeEdgesThroughHubs(journeyNodes, journeyEdges)
    : { nodes: journeyNodes, edges: journeyEdges };

  return {
    nodes: applyDocumentationLayout(dedupeNodes(routedNodes), dedupeEdges(routedEdges), mode),
    edges: dedupeEdges(routedEdges),
    paths: flow?.paths ?? [],
  };
}

function applyMenuJourney(nodes, edges) {
  const menus = nodes.filter((node) => node.data?.docType === 'menu');
  if (!menus.length) return { nodes, edges };

  const menuActionIds = menus
    .map((node) => minActionId(node))
    .filter(Number.isFinite)
    .sort((a, b) => a - b);

  const nextEdges = edges
    .filter((edge) => {
      const source = nodes.find((node) => node.id === edge.source);
      const target = nodes.find((node) => node.id === edge.target);
      if (source?.data?.docType === 'start' || target?.data?.docType === 'start') return false;
      if (source?.data?.docType === 'menu' && /^default$/i.test(String(edge.label ?? ''))) return false;
      return true;
    });

  const nextNodes = nodes.filter((node) => node.data?.docType !== 'start');
  const optionHubs = nextNodes.filter((node) => node.data?.docType === 'optionHub');
  const options = nextNodes.filter((node) => node.data?.docType === 'option');
  const retryNodes = nextNodes.filter((node) => ['reject', 'silence'].includes(node.data?.docType));

  menus.forEach((menu, menuIndex) => {
    const range = actionRangeForMenu(menuActionIds, menuIndex);
    const localOptionHubs = optionHubs.filter((node) => actionInRange(minActionId(node), range));
    const localOptions = options.filter((node) => actionInRange(minActionId(node), range));
    const optionTargets = localOptionHubs.length ? localOptionHubs : localOptions;

    optionTargets.forEach((target) => {
      nextEdges.push(makeNormalizedEdge(menu.id, target.id, 'Opcoes', 'nice-doc-edge-default'));
    });

    retryNodes
      .filter((node) => actionInRange(minActionId(node), range) || menus.length === 1)
      .forEach((retryNode) => {
        const isSilence = retryNode.data?.docType === 'silence';
        const label = isSilence ? 'SIL / Timeout' : 'REJ';
        const className = isSilence ? 'nice-doc-edge-warning' : 'nice-doc-edge-error';
        nextEdges.push(makeNormalizedEdge(menu.id, retryNode.id, label, className));
        nextEdges.push(makeNormalizedEdge(retryNode.id, menu.id, 'Repete menu', className));
      });
  });

  return {
    nodes: nextNodes,
    edges: dedupeEdges(nextEdges),
  };
}

function cloneNodes(nodes) {
  return nodes.map((node) => ({
    ...node,
    data: {
      ...(node.data ?? {}),
      details: [...(node.data?.details ?? [])],
      actionIds: [...(node.data?.actionIds ?? [])],
    },
  }));
}

function cloneEdges(edges) {
  return edges.map((edge) => ({ ...edge }));
}

function groupOutputNodes(nodes, edges, { groupSingles }) {
  const groups = new Map();
  const nodeToGroup = new Map();
  const passthrough = [];

  nodes.forEach((node) => {
    if (!isOutputLike(node)) {
      passthrough.push(node);
      return;
    }

    const signature = outputSignature(node);
    const type = groupedOutputType(node, signature);
    const key = `${type}:${normalizeKey(signature)}`;
    if (!groups.has(key)) groups.set(key, { type, signature, members: [] });
    groups.get(key).members.push(node);
  });

  const groupedOutputNodes = [];
  groups.forEach((group, key) => {
    if (!groupSingles && group.members.length === 1) {
      passthrough.push(group.members[0]);
      return;
    }

    const groupNode = makeGroupedOutputNode(key, group);
    groupedOutputNodes.push(groupNode);
    group.members.forEach((member) => nodeToGroup.set(member.id, groupNode.id));
  });

  const nextEdges = edges.map((edge) => ({
    ...edge,
    source: nodeToGroup.get(edge.source) ?? edge.source,
    target: nodeToGroup.get(edge.target) ?? edge.target,
    label: simplifyEdgeLabel(edge.label),
  })).filter((edge) => edge.source && edge.target && edge.source !== edge.target);

  return {
    nodes: [...passthrough, ...groupedOutputNodes],
    edges: nextEdges,
  };
}

function makeGroupedOutputNode(key, group) {
  const actionIds = uniqueNumbers(group.members.flatMap((node) => node.data?.actionIds ?? []));
  const representative = group.members[0];
  const detailMap = mergedDetails(group.members);
  const title = titleForGroupedOutput(group.type, group.signature);

  return {
    id: `group-${safeId(key)}`,
    type: 'niceDocumentationNode',
    data: {
      docType: group.type,
      title,
      subtitle: group.signature,
      actionIds,
      isGroup: true,
      groupCount: group.members.length,
      details: compactDetails([
        ['Ocorrencias', group.members.length > 1 ? `${group.members.length} saidas agrupadas` : '1 saida'],
        ['NEXT_STEP', detailMap.get('next_step')],
        ['Audio', detailMap.get('audio')],
        ['TransferCode', detailMap.get('transfercode')],
        ['Scriptpoints', collectDetailValues(group.members, 'scriptpoint').slice(0, 6).join(', ')],
        ['Actions', actionIds.length ? `#${actionIds.join(', #')}` : ''],
      ]),
      sourceNodeIds: group.members.map((node) => node.id),
      originalDocType: representative.data?.docType,
    },
  };
}

function routeEdgesThroughHubs(nodes, edges) {
  const nodeById = new Map(nodes.map((node) => [node.id, node]));
  const hubs = new Map();
  const routedEdges = [];

  edges.forEach((edge) => {
    const source = nodeById.get(edge.source);
    const target = nodeById.get(edge.target);
    if (!source || !target) return;

    const hubKind = hubKindForEdge(edge, source, target);
    if (!hubKind || source.data?.docType === 'hub' || target.data?.docType === 'hub') {
      routedEdges.push(edge);
      return;
    }

    const hub = getHub(hubs, hubKind);
    routedEdges.push(makeNormalizedEdge(edge.source, hub.id, hub.label, hub.edgeClass));
    routedEdges.push(makeNormalizedEdge(hub.id, edge.target, destinationLabelForHub(hubKind, target), hub.edgeClass));
  });

  return {
    nodes: [...nodes, ...hubs.values()].filter((node) => hasIncidentEdge(node.id, routedEdges) || node.data?.docType !== 'hub'),
    edges: routedEdges,
  };
}

function getHub(hubs, kind) {
  if (hubs.has(kind)) return hubs.get(kind);
  const presets = {
    reject: {
      title: 'Hub REJ / erro',
      subtitle: 'Agrupa rejeicao, erro e false',
      label: 'Erro / REJ',
      edgeClass: 'nice-doc-edge-error',
    },
    silence: {
      title: 'Hub SIL / timeout',
      subtitle: 'Agrupa silencio e timeout',
      label: 'Timeout / SIL',
      edgeClass: 'nice-doc-edge-warning',
    },
    nextStep: {
      title: 'Hub NEXT_STEP',
      subtitle: 'Agrupa proximos fluxos',
      label: 'NEXT_STEP',
      edgeClass: 'nice-doc-edge-default',
    },
    api: {
      title: 'Hub APIs',
      subtitle: 'Agrupa chamadas externas',
      label: 'API',
      edgeClass: 'nice-doc-edge-success',
    },
  };
  const preset = presets[kind] ?? presets.nextStep;
  const node = {
    id: `hub-${kind}`,
    type: 'niceDocumentationNode',
    data: {
      docType: 'hub',
      title: preset.title,
      subtitle: preset.subtitle,
      actionIds: [],
      details: [],
    },
  };
  hubs.set(kind, { ...node, label: preset.label, edgeClass: preset.edgeClass });
  return hubs.get(kind);
}

function hubKindForEdge(edge, source, target) {
  const label = String(edge.label ?? '').toLowerCase();
  const targetType = target.data?.docType;
  const sourceType = source.data?.docType;
  const targetText = `${target.data?.title ?? ''} ${target.data?.subtitle ?? ''}`.toLowerCase();

  if (sourceType === 'menu' && ['reject', 'silence'].includes(targetType)) return null;
  if (['reject', 'silence'].includes(sourceType) && targetType === 'menu') return null;
  if (label.includes('timeout') || label.includes('sil') || targetType === 'silence') return 'silence';
  if (label.includes('rej') || label.includes('erro') || label.includes('false') || targetType === 'reject') return 'reject';
  if (targetType === 'api' && sourceType !== 'api') return 'api';
  if (targetType === 'output' && /next_step|pathstep|transfer|tchau|proximo|próximo/i.test(targetText)) return 'nextStep';
  return null;
}

function actionRangeForMenu(menuActionIds, index) {
  const start = menuActionIds[index] ?? Number.NEGATIVE_INFINITY;
  const end = menuActionIds[index + 1] ?? Number.POSITIVE_INFINITY;
  return { start, end };
}

function actionInRange(actionId, range) {
  if (!Number.isFinite(actionId)) return true;
  return actionId >= range.start && actionId < range.end;
}

function minActionId(node) {
  const ids = (node.data?.actionIds ?? []).map(Number).filter(Number.isFinite);
  return ids.length ? Math.min(...ids) : Number.NaN;
}

function destinationLabelForHub(kind, target) {
  if (kind === 'nextStep') return detailValue(target, 'NEXT_STEP') || shortLabel(target.data?.subtitle) || 'Destino';
  if (kind === 'api') return shortLabel(target.data?.title) || 'API';
  if (kind === 'silence') return 'Destino SIL';
  if (kind === 'reject') return 'Destino erro';
  return 'Destino';
}

function applyDocumentationLayout(nodes, edges, mode) {
  const nodeById = new Map(nodes.map((node) => [node.id, node]));
  const incomingCounts = new Map(nodes.map((node) => [node.id, 0]));
  edges.forEach((edge) => {
    if (incomingCounts.has(edge.target)) incomingCounts.set(edge.target, incomingCounts.get(edge.target) + 1);
  });

  const levels = new Map();
  nodes.forEach((node) => {
    const level = levelForDocType(node.data?.docType);
    if (!levels.has(level)) levels.set(level, []);
    levels.get(level).push(node);
  });

  const optionColumns = mode === 'summary' ? SUMMARY_OPTION_COLUMNS : DETAIL_OPTION_COLUMNS;
  const outputColumns = mode === 'summary' ? SUMMARY_OUTPUT_COLUMNS : DETAIL_OUTPUT_COLUMNS;
  const rows = [];

  [...levels.entries()].sort(([a], [b]) => a - b).forEach(([level, levelNodes]) => {
    levelNodes.sort((a, b) => {
      const aIncoming = incomingCounts.get(a.id) ?? 0;
      const bIncoming = incomingCounts.get(b.id) ?? 0;
      return orderForDocType(a.data?.docType) - orderForDocType(b.data?.docType)
        || bIncoming - aIncoming
        || String(a.data?.title).localeCompare(String(b.data?.title));
    });

    const maxColumns = columnsForLevel(levelNodes, optionColumns, outputColumns);
    for (let index = 0; index < levelNodes.length; index += maxColumns) {
      rows.push({
        level,
        nodes: levelNodes.slice(index, index + maxColumns),
      });
    }
  });

  const maxColumns = Math.max(1, ...rows.map((row) => row.nodes.length));
  const width = PADDING_X * 2 + maxColumns * NODE_WIDTH + Math.max(0, maxColumns - 1) * COLUMN_GAP;

  let currentY = PADDING_Y;
  rows.forEach((row, rowIndex) => {
    if (rowIndex > 0) {
      currentY += NODE_HEIGHT + (row.level !== rows[rowIndex - 1]?.level ? LEVEL_GAP : ROW_GAP);
    }
    const rowWidth = row.nodes.length * NODE_WIDTH + Math.max(0, row.nodes.length - 1) * COLUMN_GAP;
    const startX = Math.max(PADDING_X, (width - rowWidth) / 2);
    row.nodes.forEach((node, columnIndex) => {
      const positioned = nodeById.get(node.id);
      if (!positioned) return;
      positioned.position = {
        x: startX + columnIndex * (NODE_WIDTH + COLUMN_GAP),
        y: currentY,
      };
    });
  });

  return nodes.map((node) => ({
    ...node,
    position: node.position ?? { x: PADDING_X, y: PADDING_Y },
  }));
}

function columnsForLevel(levelNodes, optionColumns, outputColumns) {
  if (levelNodes.some((node) => ['option', 'optionHub'].includes(node.data?.docType))) return optionColumns;
  if (levelNodes.some((node) => ['output', 'reject', 'silence'].includes(node.data?.docType))) return outputColumns;
  if (levelNodes.some((node) => node.data?.docType === 'hub')) return 4;
  return 3;
}

function isOutputLike(node) {
  return ['output', 'reject', 'silence'].includes(node.data?.docType);
}

function outputSignature(node) {
  return detailValue(node, 'NEXT_STEP')
    || detailValue(node, 'Audio')
    || detailValue(node, 'TransferCode')
    || node.data?.subtitle
    || node.data?.title
    || node.id;
}

function groupedOutputType(node, signature) {
  const text = `${node.data?.docType ?? ''} ${node.data?.title ?? ''} ${signature}`.toLowerCase();
  if (/sil|timeout/.test(text)) return 'silence';
  if (/rej|erro|error|maxrej|false/.test(text)) return 'reject';
  return 'output';
}

function titleForGroupedOutput(type, signature) {
  if (type === 'silence') return 'Silencio / Timeout';
  if (type === 'reject') return 'Erro / Rejeicao';
  if (/transfer/i.test(signature)) return 'Transferencia / proximo fluxo';
  if (/tchau|desliga|final/i.test(signature)) return 'Saida final';
  return 'Proximo fluxo';
}

function detailValue(node, label) {
  const wanted = normalizeKey(label);
  const detail = (node.data?.details ?? []).find((item) => normalizeKey(item.label) === wanted);
  return detail?.value ?? '';
}

function mergedDetails(nodes) {
  const map = new Map();
  nodes.forEach((node) => {
    (node.data?.details ?? []).forEach((detail) => {
      const key = normalizeKey(detail.label);
      if (!map.has(key) && detail.value) map.set(key, detail.value);
    });
  });
  return map;
}

function collectDetailValues(nodes, label) {
  const wanted = normalizeKey(label);
  const values = [];
  nodes.forEach((node) => {
    (node.data?.details ?? []).forEach((detail) => {
      if (normalizeKey(detail.label) === wanted && detail.value) values.push(String(detail.value));
    });
  });
  return [...new Set(values)];
}

function compactDetails(details) {
  return details
    .filter(([, value]) => value !== undefined && value !== null && String(value).trim() !== '')
    .map(([label, value]) => ({ label, value: String(value) }));
}

function makeNormalizedEdge(source, target, label, className = '') {
  return {
    id: `doc-edge-${source}-${target}-${safeId(label)}`,
    source,
    target,
    label: simplifyEdgeLabel(label),
    type: 'smoothstep',
    animated: false,
    sourcePosition: 'bottom',
    targetPosition: 'top',
    className: `nice-doc-edge ${className || edgeClass(label)}`,
  };
}

function simplifyEdgeLabel(label) {
  const text = String(label ?? 'Default').trim();
  if (/^case\s+/i.test(text)) return text.replace(/^case/i, 'Case');
  if (/timeout/i.test(text)) return 'Timeout';
  if (/\bsil\b|silencio/i.test(text)) return 'SIL';
  if (/\brej\b|reje/i.test(text)) return 'REJ';
  if (/false|erro/i.test(text)) return 'False / erro';
  if (/true|ok/i.test(text)) return 'True / OK';
  if (/next_step|next step/i.test(text)) return 'NEXT_STEP';
  return shortLabel(text, 34);
}

function shortLabel(value, limit = 34) {
  const text = String(value ?? '').replace(/\s+/g, ' ').trim();
  if (text.length <= limit) return text;
  return `${text.slice(0, Math.max(0, limit - 1))}...`;
}

function levelForDocType(type) {
  return {
    start: 0,
    menu: 1,
    optionHub: 2,
    option: 3,
    rule: 4,
    api: 5,
    hub: 6,
    silence: 7,
    reject: 7,
    output: 8,
    onrelease: 9,
  }[type] ?? 5;
}

function orderForDocType(type) {
  return {
    start: 0,
    menu: 1,
    optionHub: 2,
    option: 3,
    rule: 4,
    api: 5,
    hub: 6,
    silence: 7,
    reject: 8,
    output: 9,
    onrelease: 10,
  }[type] ?? 20;
}

function edgeClass(label) {
  const text = String(label ?? '').toLowerCase();
  if (/true|ok|success|sucesso/.test(text)) return 'nice-doc-edge-success';
  if (/timeout|sil/.test(text)) return 'nice-doc-edge-warning';
  if (/false|erro|error|rej/.test(text)) return 'nice-doc-edge-error';
  return 'nice-doc-edge-default';
}

function hasIncidentEdge(nodeId, edges) {
  return edges.some((edge) => edge.source === nodeId || edge.target === nodeId);
}

function dedupeNodes(nodes) {
  const seen = new Set();
  return nodes.filter((node) => {
    if (seen.has(node.id)) return false;
    seen.add(node.id);
    return true;
  });
}

function dedupeEdges(edges) {
  const seen = new Set();
  return edges.filter((edge) => {
    const key = `${edge.source}->${edge.target}:${edge.label}`;
    if (!edge.source || !edge.target || edge.source === edge.target || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function uniqueNumbers(values) {
  return [...new Set(values.map(Number).filter(Number.isFinite))];
}

function normalizeKey(value) {
  return String(value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9]+/g, '')
    .toLowerCase();
}

function safeId(value) {
  return String(value ?? 'item')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9_]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 72) || 'item';
}

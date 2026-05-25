export function buildNiceDocumentationFlow(script) {
  const actions = [...(script?.actions ?? [])].sort((a, b) => Number(a.actionId) - Number(b.actionId));
  const actionsById = new Map(actions.map((action) => [Number(action.actionId), action]));
  const docNodes = [];
  const docEdges = [];
  const paths = [];
  const actionToDoc = new Map();

  actions.forEach((action) => {
    const node = makeActionDocNode(action, docNodes.length);
    if (!node) return;
    docNodes.push(node);
    actionToDoc.set(Number(action.actionId), node.id);
  });

  actions
    .filter((action) => action.action === 'CASE')
    .forEach((action) => {
      (action.cases ?? []).forEach((branch, index) => {
        const target = actionsById.get(Number(branch.actionId));
        const output = summarizeActionOutput(target);
        const node = makeDocNode({
          id: `option-${action.actionId}-${index}`,
          type: 'option',
          title: `Opcao ${branch.text || index + 1}`,
          subtitle: output.nextStep || output.audio || target?.caption || 'Destino nao interpretado',
          actionIds: [Number(action.actionId), Number(branch.actionId)].filter(Boolean),
          details: compactDetails([
            ['DTMF', branch.text],
            ['Audio', output.audio],
            ['NEXT_STEP', output.nextStep],
            ['Scriptpoint', output.scriptpoint],
            ['TransferCode', output.transferCode],
          ]),
          column: 2,
          row: docNodes.length,
        });
        docNodes.push(node);
        docEdges.push(makeDocEdge(actionToDoc.get(Number(action.actionId)), node.id, `Case ${branch.text}`));
        if (target && actionToDoc.has(Number(target.actionId))) {
          docEdges.push(makeDocEdge(node.id, actionToDoc.get(Number(target.actionId)), 'Destino'));
        }
      });
    });

  actions
    .filter((action) => action.action === 'SNIPPET')
    .forEach((action) => {
      extractSwitchCases(action.parameters?.[0] ?? '').forEach((item, index) => {
        const node = makeDocNode({
          id: `switch-${action.actionId}-${index}`,
          type: 'option',
          title: `Opcao ${item.caseValue}`,
          subtitle: item.output.nextStep || item.output.audio || `SWITCH ${item.switchValue}`,
          actionIds: [Number(action.actionId)],
          details: compactDetails([
            ['Origem', `SWITCH ${item.switchValue}`],
            ['Audio', item.output.audio],
            ['NEXT_STEP', item.output.nextStep],
            ['Scriptpoint', item.output.scriptpoint],
            ['TransferCode', item.output.transferCode],
          ]),
          column: 2,
          row: docNodes.length,
        });
        docNodes.push(node);
        docEdges.push(makeDocEdge(actionToDoc.get(Number(action.actionId)), node.id, `Case ${item.caseValue}`));
      });
    });

  actions.forEach((action) => {
    const source = actionToDoc.get(Number(action.actionId));
    if (!source) return;
    getOutgoing(action).forEach((edge) => {
      const target = actionToDoc.get(Number(edge.actionId));
      if (!target) return;
      docEdges.push(makeDocEdge(source, target, edge.label));
    });
  });

  buildMainPaths(actions, actionsById).forEach((path) => paths.push(path));

  const nodesWithoutPosition = dedupeNodes(docNodes);
  const edges = dedupeEdges(docEdges.filter((edge) => edge.source && edge.target && edge.source !== edge.target));
  const nodes = applyTreeLayout(nodesWithoutPosition, edges);

  return {
    nodes,
    edges,
    paths,
  };
}

function makeActionDocNode(action, index) {
  const type = classifyAction(action);
  if (!type) return null;
  const output = summarizeActionOutput(action);
  const details = detailsForAction(action, output);
  return makeDocNode({
    id: `action-${action.actionId}`,
    type,
    title: titleForAction(action, type),
    subtitle: subtitleForAction(action, type, output),
    actionIds: [Number(action.actionId)],
    details,
    column: fallbackDepth({ data: { docType: type } }),
    row: index,
  });
}

function makeDocNode({ id, type, title, subtitle, actionIds, details, column, row }) {
  return {
    id,
    type: 'niceDocumentationNode',
    data: { docType: type, title, subtitle, actionIds, details },
    column,
    row,
  };
}

function makeDocEdge(source, target, label) {
  return {
    id: `doc-edge-${source}-${target}-${label}`,
    source,
    target,
    label,
    type: 'smoothstep',
    animated: false,
    sourcePosition: 'bottom',
    targetPosition: 'top',
    className: `nice-doc-edge nice-doc-edge-${edgeClass(label)}`,
  };
}

function classifyAction(action) {
  if (action.action === 'BEGIN') return 'start';
  if (action.action === 'MENU') return 'menu';
  if (action.action === 'CASE') return 'optionHub';
  if (action.action === 'IF') return 'rule';
  if (['RUNSUB', 'REST_API', 'WORKFLOWDATA'].includes(action.action)) return 'api';
  if (['RUNSCRIPT', 'RETURN', 'PLAY'].includes(action.action)) return 'output';
  if (action.action === 'ONRELEASE') return 'onrelease';
  if (action.action === 'LOOP' && /sil/i.test(action.caption)) return 'silence';
  if (action.action === 'LOOP' && /rej/i.test(action.caption)) return 'reject';
  if (action.action === 'SNIPPET' && /maxsil|sil/i.test(action.caption)) return 'silence';
  if (action.action === 'SNIPPET' && /maxrej|rej/i.test(action.caption)) return 'reject';
  if (action.action === 'SNIPPET' && isOutputSnippet(action)) return 'output';
  if (action.action === 'SNIPPET' && /\bSWITCH\b/i.test(action.parameters?.[0] ?? '')) return 'optionHub';
  if (action.action === 'SNIPPET' && /\bIF\b/i.test(action.parameters?.[0] ?? '')) return 'rule';
  return null;
}

function titleForAction(action, type) {
  if (type === 'start') return 'Inicio';
  if (type === 'menu') return `Menu: ${cleanCaption(action.caption)}`;
  if (type === 'optionHub') return 'Roteamento de opcoes';
  if (type === 'rule') return `Regra: ${cleanCaption(action.caption)}`;
  if (type === 'api') return `API: ${cleanCaption(action.caption)}`;
  if (type === 'output') return `Saida: ${cleanCaption(action.caption)}`;
  if (type === 'reject') return 'Rejeicao / REJ';
  if (type === 'silence') return 'Silencio / SIL';
  if (type === 'onrelease') return 'OnRelease';
  return cleanCaption(action.caption);
}

function subtitleForAction(action, type, output) {
  if (type === 'menu') return `Resp: ${action.parameters?.[7] || 'MRES'} | Timeout ${action.parameters?.[5] || '-'}`;
  if (type === 'rule') return singleLine(action.parameters?.[0] || 'Regra em snippet');
  if (type === 'api') return action.action === 'REST_API' ? `${action.parameters?.[4] || ''} ${action.parameters?.[1] || ''}` : action.parameters?.[0] || action.action;
  if (type === 'output') return output.nextStep || output.audio || action.parameters?.[0] || action.action;
  if (type === 'reject' || type === 'silence') return output.nextStep || output.audio || 'Tratamento de tentativa';
  return `Action #${action.actionId}`;
}

function detailsForAction(action, output) {
  if (action.action === 'MENU') {
    return compactDetails([
      ['Prompt', action.parameters?.[0]],
      ['Resposta', action.parameters?.[7]],
      ['Timeout', action.parameters?.[5]],
      ['Interdigit', action.parameters?.[6]],
    ]);
  }
  if (action.action === 'IF') {
    return compactDetails([
      ['Expressao', action.parameters?.[0]],
      ['True', findBranch(action, 'True')?.actionId],
      ['False', findBranch(action, 'False')?.actionId],
    ]);
  }
  if (action.action === 'RUNSUB') {
    return compactDetails([
      ['Script', action.parameters?.[0]],
      ['Retorno', action.parameters?.[2]],
      ['Params', (action.parameters ?? []).slice(3).join(', ')],
    ]);
  }
  if (action.action === 'REST_API') {
    return compactDetails([
      ['Metodo', action.parameters?.[4]],
      ['URL', action.parameters?.[1]],
      ['Timeout', action.parameters?.[5]],
      ['Resultset', action.parameters?.[6]],
    ]);
  }
  return compactDetails([
    ['Audio', output.audio],
    ['NEXT_STEP', output.nextStep],
    ['Scriptpoint', output.scriptpoint],
    ['TransferCode', output.transferCode],
  ]);
}

function buildMainPaths(actions, actionsById) {
  const paths = [];
  actions.filter((action) => action.action === 'MENU').forEach((menu) => {
    const switchOptions = actions
      .filter((action) => action.action === 'SNIPPET')
      .flatMap((action) => extractSwitchCases(action.parameters?.[0] ?? ''))
      .map((item) => `Opcao ${item.caseValue} -> ${item.output.nextStep || item.output.audio || 'logica em snippet'}`);
    const options = actions
      .filter((action) => action.action === 'CASE')
      .flatMap((action) => action.cases ?? [])
      .map((branch) => `Opcao ${branch.text} -> ${targetName(branch, actionsById)}`);
    paths.push({
      title: `Menu ${menu.caption}`,
      items: [
        `Entrada: ${menu.parameters?.[0] || 'prompt nao informado'}`,
        `Resposta: ${menu.parameters?.[7] || 'MRES'}`,
        `Timeout: ${targetName((menu.branches ?? []).find((branch) => /timeout/i.test(branch.text)), actionsById)}`,
        ...options,
        ...switchOptions,
      ].filter(Boolean),
    });
  });

  actions.filter((action) => action.action === 'IF').forEach((action) => {
    paths.push({
      title: `Regra ${action.caption}`,
      items: [
        `Condicao: ${singleLine(action.parameters?.[0] || '')}`,
        `True -> ${targetName(findBranch(action, 'True'), actionsById)}`,
        `False -> ${targetName(findBranch(action, 'False'), actionsById)}`,
      ],
    });
  });

  actions.filter((action) => ['RUNSUB', 'REST_API'].includes(action.action)).forEach((action) => {
    paths.push({
      title: `Chamada ${action.caption}`,
      items: [
        action.action === 'REST_API' ? `REST ${action.parameters?.[4] || ''} ${action.parameters?.[1] || ''}` : `RUNSUB ${action.parameters?.[0] || ''}`,
        `Proxima action -> ${targetName(action.defaultNextAction, actionsById)}`,
      ],
    });
  });

  return paths;
}

function getOutgoing(action) {
  return [
    action.defaultNextAction ? { ...action.defaultNextAction, label: 'Default' } : null,
    ...(action.branches ?? []).map((branch) => ({ ...branch, label: branch.text || `Branch ${branch.index}` })),
    ...(action.cases ?? []).map((branch) => ({ ...branch, label: branch.text || 'Case' })),
  ].filter(Boolean);
}

function summarizeActionOutput(action) {
  if (!action) return {};
  const code = action.action === 'ASSIGN'
    ? `ASSIGN ${action.parameters?.[0] ?? ''} = ${action.parameters?.[1] ?? ''}`
    : action.parameters?.[0] ?? '';
  const assignments = parseAssignments(code);
  return {
    audio: firstAssignment(assignments, ['AUDIO', 'audio']),
    nextStep: firstAssignment(assignments, ['NEXT_STEP', 'next_step']),
    scriptpoint: firstAssignment(assignments, ['scriptpoint']),
    transferCode: firstAssignment(assignments, ['TRANSFERCODE', 'TransferCode', 'transferCode']),
  };
}

function extractSwitchCases(code) {
  const text = String(code ?? '');
  const switchMatch = text.match(/\bSWITCH\s+([^\r\n{]+)/i);
  const switchValue = switchMatch?.[1]?.trim() || 'SWITCH';
  const casePattern = /\bCASE\s+"?([^"\r\n{]+)"?\s*\{/gi;
  const matches = [...text.matchAll(casePattern)];
  return matches.map((match, index) => {
    const start = match.index + match[0].length;
    const end = matches[index + 1]?.index ?? text.length;
    const block = text.slice(start, end);
    return {
      switchValue,
      caseValue: match[1].trim(),
      output: summarizeCodeOutput(block),
    };
  });
}

function summarizeCodeOutput(code) {
  const assignments = parseAssignments(code);
  return {
    audio: firstAssignment(assignments, ['AUDIO', 'audio']),
    nextStep: firstAssignment(assignments, ['NEXT_STEP', 'next_step']),
    scriptpoint: firstAssignment(assignments, ['scriptpoint']),
    transferCode: firstAssignment(assignments, ['TRANSFERCODE', 'TransferCode', 'transferCode']),
  };
}

function parseAssignments(code) {
  const assignments = {};
  const pattern = /(?:^|\n)\s*(?:ASSIGN\s+)?([A-Za-z_][\w:]*|global:[A-Za-z_][\w:]*)\s*=\s*("[^"]*"|'[^']*'|[^\r\n]+)/gi;
  for (const match of String(code ?? '').matchAll(pattern)) {
    assignments[match[1]] = cleanValue(match[2]);
  }
  return assignments;
}

function firstAssignment(assignments, names) {
  const lowerMap = new Map(Object.entries(assignments).map(([key, value]) => [key.toLowerCase(), value]));
  for (const name of names) {
    if (lowerMap.has(name.toLowerCase())) return lowerMap.get(name.toLowerCase());
  }
  return '';
}

function findBranch(action, label) {
  return (action.branches ?? []).find((branch) => String(branch.text ?? '').toLowerCase() === label.toLowerCase());
}

function targetName(branch, actionsById) {
  if (!branch) return 'nao configurado';
  const target = actionsById.get(Number(branch.actionId));
  return target ? `#${target.actionId} ${target.caption}` : `#${branch.actionId} nao encontrado`;
}

function isOutputSnippet(action) {
  const code = action.parameters?.[0] ?? '';
  return /parametros de saida|maxrej|maxsil|set |saida|tchau|transfer/i.test(action.caption)
    || /\b(NEXT_STEP|AUDIO|TRANSFERCODE|scriptpoint|MAPA_DNA)\b/i.test(code);
}

function compactDetails(items) {
  return items
    .filter(([, value]) => value !== undefined && value !== null && String(value).trim() !== '')
    .map(([label, value]) => ({ label, value: singleLine(value) }));
}

function applyTreeLayout(nodes, edges) {
  const horizontalGap = 340;
  const verticalGap = 230;
  const nodeById = new Map(nodes.map((node) => [node.id, node]));
  const outgoing = new Map();
  const incomingCount = new Map(nodes.map((node) => [node.id, 0]));
  edges.forEach((edge) => {
    if (!nodeById.has(edge.source) || !nodeById.has(edge.target)) return;
    if (!outgoing.has(edge.source)) outgoing.set(edge.source, []);
    outgoing.get(edge.source).push(edge.target);
    incomingCount.set(edge.target, (incomingCount.get(edge.target) ?? 0) + 1);
  });

  outgoing.forEach((targets) => {
    targets.sort((a, b) => nodeSortScore(nodeById.get(a)) - nodeSortScore(nodeById.get(b)));
  });

  const rootIds = nodes
    .filter((node) => node.data.docType === 'start' || (incomingCount.get(node.id) ?? 0) === 0)
    .sort((a, b) => nodeSortScore(a) - nodeSortScore(b))
    .map((node) => node.id);
  const orderedRoots = rootIds.length ? rootIds : nodes.slice(0, 1).map((node) => node.id);
  const depths = computeDepths(nodes, outgoing, orderedRoots);
  const xById = new Map();
  const visiting = new Set();
  let leafCursor = 0;

  function assignX(nodeId) {
    if (xById.has(nodeId)) return xById.get(nodeId);
    if (visiting.has(nodeId)) {
      const fallback = leafCursor++ * horizontalGap;
      xById.set(nodeId, fallback);
      return fallback;
    }

    visiting.add(nodeId);
    const children = unique(outgoing.get(nodeId) ?? []).filter((targetId) => depths.get(targetId) > depths.get(nodeId));
    if (!children.length) {
      const x = leafCursor++ * horizontalGap;
      xById.set(nodeId, x);
      visiting.delete(nodeId);
      return x;
    }

    const childXs = children.map(assignX);
    const x = childXs.reduce((total, value) => total + value, 0) / childXs.length;
    xById.set(nodeId, x);
    visiting.delete(nodeId);
    return x;
  }

  orderedRoots.forEach(assignX);
  nodes.forEach((node) => assignX(node.id));

  spreadSameDepthNodes(nodes, depths, xById, horizontalGap * 0.82);
  const minX = Math.min(...nodes.map((node) => xById.get(node.id) ?? 0), 0);

  return nodes.map((node) => ({
    ...node,
    sourcePosition: 'bottom',
    targetPosition: 'top',
    position: {
      x: Math.round((xById.get(node.id) ?? 0) - minX),
      y: Math.round((depths.get(node.id) ?? fallbackDepth(node)) * verticalGap),
    },
  }));
}

function computeDepths(nodes, outgoing, rootIds) {
  const depths = new Map(nodes.map((node) => [node.id, Number.POSITIVE_INFINITY]));
  const queue = [];
  rootIds.forEach((id) => {
    depths.set(id, 0);
    queue.push(id);
  });

  while (queue.length) {
    const nodeId = queue.shift();
    const nextDepth = (depths.get(nodeId) ?? 0) + 1;
    unique(outgoing.get(nodeId) ?? []).forEach((targetId) => {
      if (nextDepth < (depths.get(targetId) ?? Number.POSITIVE_INFINITY)) {
        depths.set(targetId, nextDepth);
        queue.push(targetId);
      }
    });
  }

  nodes.forEach((node) => {
    if (!Number.isFinite(depths.get(node.id))) {
      depths.set(node.id, fallbackDepth(node));
    }
  });

  return depths;
}

function spreadSameDepthNodes(nodes, depths, xById, minGap) {
  const byDepth = new Map();
  nodes.forEach((node) => {
    const depth = depths.get(node.id) ?? 0;
    if (!byDepth.has(depth)) byDepth.set(depth, []);
    byDepth.get(depth).push(node.id);
  });

  byDepth.forEach((ids) => {
    ids.sort((a, b) => (xById.get(a) ?? 0) - (xById.get(b) ?? 0));
    for (let index = 1; index < ids.length; index += 1) {
      const previous = ids[index - 1];
      const current = ids[index];
      const requiredX = (xById.get(previous) ?? 0) + minGap;
      if ((xById.get(current) ?? 0) < requiredX) {
        xById.set(current, requiredX);
      }
    }
  });
}

function fallbackDepth(node) {
  return {
    start: 0,
    menu: 1,
    optionHub: 2,
    option: 3,
    rule: 4,
    api: 5,
    reject: 6,
    silence: 6,
    output: 7,
    onrelease: 8,
  }[node.data?.docType] ?? 5;
}

function nodeSortScore(node) {
  const typeScore = {
    start: 0,
    menu: 1,
    optionHub: 2,
    option: 3,
    rule: 4,
    api: 5,
    silence: 6,
    reject: 7,
    output: 8,
    onrelease: 9,
  }[node?.data?.docType] ?? 10;
  return typeScore * 10000 + Number(node?.data?.actionIds?.[0] ?? 9999);
}

function unique(items) {
  return [...new Set(items)];
}

function edgeClass(label) {
  const normalized = String(label || '').toLowerCase();
  if (normalized.includes('false') || normalized.includes('erro') || normalized.includes('rej')) return 'error';
  if (normalized.includes('timeout') || normalized.includes('sil')) return 'warning';
  if (normalized.includes('true') || normalized.includes('ok')) return 'success';
  return 'default';
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
    if (seen.has(edge.id)) return false;
    seen.add(edge.id);
    return true;
  });
}

function cleanCaption(value) {
  return String(value || '').replace(/_/g, ' ').trim() || 'Action';
}

function cleanValue(value) {
  return String(value ?? '')
    .trim()
    .replace(/\s*\/\/.*$/, '')
    .replace(/^"|"$/g, '')
    .replace(/^'|'$/g, '')
    .trim();
}

function singleLine(value) {
  return String(value ?? '').replace(/\s+/g, ' ').trim();
}

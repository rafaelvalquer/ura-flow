export function generateNiceDocumentation(script, validation = { errors: [], warnings: [] }) {
  const actions = [...(script?.actions ?? [])].sort((a, b) => Number(a.actionId) - Number(b.actionId));
  const actionsById = new Map(actions.map((action) => [Number(action.actionId), action]));
  const lines = [];

  addSection(lines, `# ${script?.name || 'Script NICE'}`);
  appendSummary(lines, script, actions, validation);
  appendJourney(lines, actions, actionsById);
  appendMenus(lines, actions, actionsById);
  appendMenuOptions(lines, actions, actionsById);
  appendBusinessRules(lines, actions, actionsById);
  appendExternalCalls(lines, actions);
  appendOutputs(lines, actions, actionsById);
  appendOnRelease(lines, actions, actionsById);
  appendAdvancedLogic(lines, actions);
  appendGaps(lines, actions, actionsById, validation);

  return lines.join('\n');
}

function appendSummary(lines, script, actions, validation) {
  const beginActions = actions.filter((action) => action.action === 'BEGIN');
  const terminalActions = actions.filter((action) => ['RUNSCRIPT', 'RETURN'].includes(action.action));
  const actionCounts = countBy(actions, (action) => action.action);

  addSection(lines, '## Resumo do script');
  lines.push(`- Nome: ${script?.name || 'Script NICE'}`);
  lines.push(`- Origem: ${script?.source || 'canvas'}`);
  lines.push(`- Template/tipo: ${script?.templateType || 'nao informado'}`);
  lines.push(`- Total de actions: ${actions.length}`);
  lines.push(`- BEGIN: ${beginActions.length ? beginActions.map(formatActionRef).join(', ') : 'nao encontrado'}`);
  lines.push(`- Finais encontrados: ${terminalActions.length ? terminalActions.map(formatActionRef).join(', ') : 'nenhum RUNSCRIPT/RETURN encontrado'}`);
  lines.push(`- Validacao atual: ${validation.errors?.length || 0} erro(s), ${validation.warnings?.length || 0} aviso(s)`);
  lines.push(`- Distribuicao de actions: ${Object.entries(actionCounts).map(([type, count]) => `${type}=${count}`).join(', ') || 'vazio'}`);
}

function appendJourney(lines, actions, actionsById) {
  addSection(lines, '## Jornada principal');
  if (!actions.length) {
    lines.push('- Canvas vazio.');
    return;
  }

  const start = actions.find((action) => action.action === 'BEGIN') ?? actions[0];
  const visited = new Set();
  const queue = [{ action: start, depth: 0, via: 'Inicio' }];
  let emitted = 0;

  while (queue.length && emitted < 80) {
    const { action, depth, via } = queue.shift();
    if (!action) continue;
    const id = Number(action.actionId);
    const indent = '  '.repeat(Math.min(depth, 6));
    const repeat = visited.has(id);
    lines.push(`${indent}- ${via}: ${formatActionRef(action)}${repeat ? ' (ja visitado)' : ''}`);
    emitted += 1;
    if (repeat) continue;
    visited.add(id);

    getActionOutgoing(action).forEach((edge) => {
      const target = actionsById.get(Number(edge.actionId));
      if (target) queue.push({ action: target, depth: depth + 1, via: edge.label });
      else lines.push(`${indent}  - ${edge.label}: destino #${edge.actionId} nao encontrado`);
    });
  }
}

function appendMenus(lines, actions, actionsById) {
  const menus = actions.filter((action) => action.action === 'MENU');
  addSection(lines, '## Menus');
  if (!menus.length) {
    lines.push('- Nenhum MENU encontrado.');
    return;
  }

  menus.forEach((menu) => {
    const config = findNearestConfig(menu, actions);
    const configVars = parseAssignments(config?.parameters?.[0] ?? '');
    const mask = configVars.MASCARA ?? findMaskInActions(actions);
    const locate = findConnectedAction(menu.defaultNextAction, actionsById, 'LOCATE');
    const timeoutBranch = (menu.branches ?? []).find((branch) => /timeout/i.test(branch.text));

    lines.push(`### ${formatActionRef(menu)}`);
    lines.push(`- Prompt/audio: ${menu.parameters?.[0] || 'nao informado'}`);
    lines.push(`- Variavel de resposta: ${menu.parameters?.[7] || 'nao informada'}`);
    lines.push(`- Timeout: ${menu.parameters?.[5] || 'nao informado'}`);
    lines.push(`- Interdigit: ${menu.parameters?.[6] || 'nao informado'}`);
    lines.push(`- Mascara: ${mask || 'nao encontrada'}`);
    lines.push(`- CONFIG_MENU: ${config ? formatActionRef(config) : 'nao encontrado'}`);
    lines.push(`- LOCATE: ${locate ? formatActionRef(locate) : 'nao encontrado'}`);
    lines.push(`- Timeout/SIL: ${timeoutBranch ? formatBranch(timeoutBranch, actionsById) : 'nao configurado'}`);
    lines.push(`- Default/opcao digitada: ${menu.defaultNextAction ? formatBranch(menu.defaultNextAction, actionsById) : 'nao configurado'}`);
    lines.push(`- QTD_MAX_REJ: ${configVars.QTD_MAX_REJ ?? 'nao encontrado'}`);
    lines.push(`- QTD_MAX_SIL: ${configVars.QTD_MAX_SIL ?? 'nao encontrado'}`);
    lines.push(`- Audio inicial: ${configVars.noteini ?? configVars.NOTEINI ?? configVars.NOTEMENU ?? 'nao encontrado'}`);
    lines.push(`- Audio REJ: ${configVars.noterej ?? configVars.NOTEREJ ?? 'nao encontrado'}`);
    lines.push(`- Audio SIL: ${configVars.notesil ?? configVars.NOTESIL ?? 'nao encontrado'}`);
  });
}

function appendMenuOptions(lines, actions, actionsById) {
  addSection(lines, '## Opcoes de menu');
  const rows = [];

  actions.filter((action) => action.action === 'CASE').forEach((caseAction) => {
    (caseAction.cases ?? []).forEach((caseBranch) => {
      const target = actionsById.get(Number(caseBranch.actionId));
      const output = summarizeActionOutput(target);
      rows.push([
        caseBranch.text || '(vazio)',
        formatActionRef(caseAction),
        target ? formatActionRef(target) : `#${caseBranch.actionId} nao encontrado`,
        output.audio || '',
        output.nextStep || '',
        output.scriptpoint || '',
        output.transferCode || '',
      ]);
    });
  });

  actions.filter((action) => action.action === 'SNIPPET').forEach((snippet) => {
    extractSwitchCases(snippet.parameters?.[0] ?? '').forEach((item) => {
      rows.push([
        item.caseValue,
        `${formatActionRef(snippet)} SWITCH ${item.switchValue}`,
        formatActionRef(snippet),
        item.output.audio || '',
        item.output.nextStep || '',
        item.output.scriptpoint || '',
        item.output.transferCode || '',
      ]);
    });
  });

  if (!rows.length) {
    lines.push('- Nenhuma opcao detectada em CASE ou SWITCH.');
    return;
  }

  pushTable(lines, ['Opcao', 'Origem', 'Destino/logica', 'Audio', 'NEXT_STEP', 'scriptpoint', 'TransferCode'], rows);
}

function appendBusinessRules(lines, actions, actionsById) {
  const ifActions = actions.filter((action) => action.action === 'IF');
  addSection(lines, '## Regras de negocio');

  if (!ifActions.length) {
    lines.push('- Nenhum IF encontrado.');
  } else {
    ifActions.forEach((action) => {
      const trueBranch = (action.branches ?? []).find((branch) => /true/i.test(branch.text));
      const falseBranch = (action.branches ?? []).find((branch) => /false/i.test(branch.text));
      lines.push(`### ${formatActionRef(action)} - ${action.caption}`);
      lines.push(`- Expressao: \`${singleLine(action.parameters?.[0] || 'nao informada')}\``);
      lines.push(`- True: ${trueBranch ? formatBranch(trueBranch, actionsById) : 'nao configurado'}`);
      lines.push(`- False: ${falseBranch ? formatBranch(falseBranch, actionsById) : 'nao configurado'}`);
    });
  }

  const conditionalSnippets = actions.filter((action) => (
    action.action === 'SNIPPET'
    && /\bIF\b/i.test(action.parameters?.[0] ?? '')
    && !isMostlyOutputSnippet(action)
  ));
  if (conditionalSnippets.length) {
    lines.push('### Regras em snippets');
    conditionalSnippets.forEach((snippet) => {
      const expressions = extractInlineStatements(snippet.parameters?.[0] ?? '', 'IF').slice(0, 8);
      lines.push(`- ${formatActionRef(snippet)}: ${expressions.length ? expressions.map((item) => `\`${singleLine(item)}\``).join('; ') : 'IF detectado em logica customizada'}`);
    });
  }
}

function appendExternalCalls(lines, actions) {
  const calls = actions.filter((action) => ['RUNSUB', 'REST_API', 'WORKFLOWDATA'].includes(action.action));
  addSection(lines, '## Chamadas externas');
  if (!calls.length) {
    lines.push('- Nenhuma chamada externa encontrada.');
    return;
  }

  const rows = calls.map((action) => {
    if (action.action === 'RUNSUB') {
      return [
        formatActionRef(action),
        'RUNSUB',
        action.parameters?.[0] || '',
        action.parameters?.[2] || '',
        (action.parameters ?? []).slice(3).join(', '),
        nextActionText(action),
      ];
    }
    if (action.action === 'REST_API') {
      return [
        formatActionRef(action),
        'REST_API',
        action.parameters?.[1] || '',
        `${action.parameters?.[4] || ''} timeout ${action.parameters?.[5] || ''}`,
        `header=${action.parameters?.[2] || ''}; body=${action.parameters?.[3] || ''}; result=${action.parameters?.[6] || ''}`,
        nextActionText(action),
      ];
    }
    return [
      formatActionRef(action),
      'WORKFLOWDATA',
      action.parameters?.[0] || '',
      '',
      '',
      nextActionText(action),
    ];
  });
  pushTable(lines, ['Action', 'Tipo', 'Destino/chave', 'Retorno/metodo', 'Parametros', 'Proxima'], rows);
}

function appendOutputs(lines, actions, actionsById) {
  addSection(lines, '## Saidas do fluxo');
  const outputActions = actions.filter((action) => (
    ['RUNSCRIPT', 'RETURN', 'PLAY', 'ASSIGN'].includes(action.action)
    || (action.action === 'SNIPPET' && isMostlyOutputSnippet(action))
  ));

  if (!outputActions.length) {
    lines.push('- Nenhuma saida detectada.');
    return;
  }

  const rows = outputActions.map((action) => {
    const output = summarizeActionOutput(action);
    return [
      formatActionRef(action),
      action.action,
      output.audio || (action.action === 'PLAY' ? action.parameters?.[0] || '' : ''),
      output.nextStep || (action.action === 'RUNSCRIPT' ? action.parameters?.[0] || '' : ''),
      output.scriptpoint || '',
      output.transferCode || '',
      action.defaultNextAction ? formatBranch(action.defaultNextAction, actionsById) : '',
    ];
  });
  pushTable(lines, ['Action', 'Tipo', 'Audio', 'NEXT_STEP/script', 'scriptpoint', 'TransferCode', 'Proxima'], rows);
}

function appendOnRelease(lines, actions, actionsById) {
  const onReleaseActions = actions.filter((action) => action.action === 'ONRELEASE');
  addSection(lines, '## OnRelease');
  if (!onReleaseActions.length) {
    lines.push('- Nenhum ONRELEASE encontrado.');
    return;
  }

  onReleaseActions.forEach((action) => {
    lines.push(`### ${formatActionRef(action)}`);
    let current = findTarget(action.defaultNextAction, actionsById);
    const visited = new Set();
    while (current && !visited.has(Number(current.actionId))) {
      visited.add(Number(current.actionId));
      const output = summarizeActionOutput(current);
      lines.push(`- ${formatActionRef(current)}: ${current.action}${output.nextStep ? ` -> ${output.nextStep}` : ''}${output.audio ? ` / audio ${output.audio}` : ''}`);
      current = findTarget(current.defaultNextAction, actionsById);
    }
  });
}

function appendAdvancedLogic(lines, actions) {
  const advanced = actions.filter((action) => (
    action.action === 'SNIPPET'
    && isAdvancedSnippet(action)
  ));
  addSection(lines, '## Logica avancada');
  if (!advanced.length) {
    lines.push('- Nenhuma logica avancada relevante detectada fora das secoes anteriores.');
    return;
  }

  advanced.forEach((action) => {
    const code = action.parameters?.[0] ?? '';
    const assignments = Object.keys(parseAssignments(code)).slice(0, 16);
    const ifs = extractInlineStatements(code, 'IF').slice(0, 6);
    const cases = [...code.matchAll(/\bCASE\s+"?([^"\r\n{]+)"?/gi)].map((match) => match[1].trim()).slice(0, 12);
    lines.push(`### ${formatActionRef(action)} - ${action.caption}`);
    if (assignments.length) lines.push(`- Variaveis atribuidas: ${assignments.join(', ')}`);
    if (ifs.length) lines.push(`- IFs detectados: ${ifs.map((item) => `\`${singleLine(item)}\``).join('; ')}`);
    if (cases.length) lines.push(`- CASEs detectados: ${cases.join(', ')}`);
    lines.push('```nice');
    lines.push(trimCode(code, 1800));
    lines.push('```');
  });
}

function appendGaps(lines, actions, actionsById, validation) {
  addSection(lines, '## Gaps e pontos de atencao');
  const gaps = [];
  (validation.errors ?? []).forEach((message) => gaps.push(`ERRO: ${message}`));
  (validation.warnings ?? []).forEach((message) => gaps.push(`AVISO: ${message}`));

  actions.forEach((action) => {
    getActionOutgoing(action).forEach((edge) => {
      if (Number(edge.actionId) > 0 && !actionsById.has(Number(edge.actionId))) {
        gaps.push(`${formatActionRef(action)} referencia destino inexistente #${edge.actionId}.`);
      }
    });
    if (action.action === 'IF' && !(action.branches ?? []).length) gaps.push(`${formatActionRef(action)} IF sem branches.`);
    if (action.action === 'MENU' && !findMaskInActions(actions)) gaps.push(`${formatActionRef(action)} MENU sem mascara detectada.`);
    if (action.action === 'SNIPPET' && isMostlyOutputSnippet(action) && !/NEXT_STEP/i.test(action.parameters?.[0] ?? '') && !/MAX_REJ|MAX_SIL/i.test(action.caption)) {
      gaps.push(`${formatActionRef(action)} snippet de saida sem NEXT_STEP.`);
    }
    if (action.action === 'REST_API' && !actions.some((item) => item.action === 'RUNSUB' && /Alerta erro API/i.test(item.caption))) {
      gaps.push(`${formatActionRef(action)} REST_API sem Alerta_ErroAPI detectado.`);
    }
  });

  if (!gaps.length) {
    lines.push('- Nenhum gap adicional detectado.');
    return;
  }
  unique(gaps).forEach((gap) => lines.push(`- ${gap}`));
}

function addSection(lines, title) {
  if (lines.length) lines.push('');
  lines.push(title);
}

function pushTable(lines, headers, rows) {
  lines.push(`| ${headers.join(' |')} |`);
  lines.push(`| ${headers.map(() => '---').join(' |')} |`);
  rows.forEach((row) => {
    lines.push(`| ${row.map((cell) => escapeTableCell(cell)).join(' |')} |`);
  });
}

function getActionOutgoing(action) {
  return [
    action.defaultNextAction ? { ...action.defaultNextAction, label: 'Default' } : null,
    ...(action.branches ?? []).map((branch) => ({ ...branch, label: branch.text || `Branch ${branch.index}` })),
    ...(action.cases ?? []).map((branch) => ({ ...branch, label: `Case ${branch.text}` })),
  ].filter(Boolean);
}

function findConnectedAction(branch, actionsById, expectedType = '') {
  const action = findTarget(branch, actionsById);
  if (!action) return null;
  if (expectedType && action.action !== expectedType) return null;
  return action;
}

function findTarget(branch, actionsById) {
  if (!branch) return null;
  return actionsById.get(Number(branch.actionId)) ?? null;
}

function formatBranch(branch, actionsById) {
  const target = findTarget(branch, actionsById);
  const label = branch.text || `Index ${branch.index}`;
  return `${label} -> ${target ? formatActionRef(target) : `#${branch.actionId} nao encontrado`}`;
}

function nextActionText(action) {
  return action.defaultNextAction ? `#${action.defaultNextAction.actionId}` : '';
}

function formatActionRef(action) {
  if (!action) return '';
  return `#${action.actionId} ${action.caption || action.action}`;
}

function findNearestConfig(menuAction, actions) {
  const configs = actions.filter((action) => action.action === 'SNIPPET' && /CONFIG_?MENU/i.test(action.caption));
  if (!configs.length) return null;
  return configs
    .slice()
    .sort((a, b) => Math.abs(Number(a.actionId) - Number(menuAction.actionId)) - Math.abs(Number(b.actionId) - Number(menuAction.actionId)))[0];
}

function findMaskInActions(actions) {
  for (const action of actions) {
    const code = action.parameters?.[0] ?? '';
    const match = code.match(/ASSIGN\s+MASCARA\s*=\s*"([^"]+)"/i);
    if (match) return match[1];
  }
  return '';
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
    mapaDna: firstAssignment(assignments, ['MAPA_DNA', 'mapa_dna']),
    transferCode: firstAssignment(assignments, ['TRANSFERCODE', 'TransferCode', 'transferCode']),
  };
}

function parseAssignments(code) {
  const assignments = {};
  const text = String(code ?? '');
  const pattern = /(?:^|\n)\s*(?:ASSIGN\s+)?([A-Za-z_][\w:]*|global:[A-Za-z_][\w:]*)\s*=\s*("[^"]*"|'[^']*'|[^\r\n]+)/gi;
  for (const match of text.matchAll(pattern)) {
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

function extractInlineStatements(code, keyword) {
  const pattern = new RegExp(`\\b${keyword}\\b\\s*([^\\r\\n{]+)`, 'gi');
  return [...String(code ?? '').matchAll(pattern)].map((match) => `${keyword.toUpperCase()} ${match[1].trim()}`);
}

function isMostlyOutputSnippet(action) {
  const code = action.parameters?.[0] ?? '';
  return /parametros de saida|maxrej|maxsil|set |saida|tchau|transfer/i.test(action.caption)
    || /\b(NEXT_STEP|AUDIO|TRANSFERCODE|scriptpoint|MAPA_DNA)\b/i.test(code);
}

function isAdvancedSnippet(action) {
  const code = action.parameters?.[0] ?? '';
  if (!/\b(IF|SWITCH|CASE|FOREACH|FUNCTION|DYNAMIC)\b/i.test(code)) return false;
  if (/CONFIG_?MENU|MAX_REJ|MAX_SIL/i.test(action.caption)) return false;
  return code.length > 220 || /\b(IF|SWITCH|CASE)\b/i.test(code);
}

function countBy(items, mapper) {
  return items.reduce((acc, item) => {
    const key = mapper(item);
    acc[key] = (acc[key] ?? 0) + 1;
    return acc;
  }, {});
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

function trimCode(code, maxLength) {
  const text = String(code ?? '').trim();
  if (text.length <= maxLength) return text;
  return `${text.slice(0, maxLength)}\n...`;
}

function escapeTableCell(value) {
  return singleLine(value || '').replace(/\|/g, '\\|') || '-';
}

function unique(items) {
  return [...new Set(items)];
}

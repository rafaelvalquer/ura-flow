const AUDIO_ASSIGN_RE = /ASSIGN\s+([A-Z0-9_:]*?(?:AUDIO|NOTE)[A-Z0-9_:]*)\s*=\s*"([^"]+)"/gi;

export function validateNiceScript(script) {
  const errors = [];
  const warnings = [];
  const actions = script.actions ?? [];
  const actionsById = new Map(actions.map((action) => [Number(action.actionId), action]));
  const beginActions = actions.filter((action) => action.action === 'BEGIN');
  const beginIsOptional = script.templateType === 'api';

  if (!beginIsOptional && beginActions.length !== 1) {
    errors.push(`O script precisa ter exatamente 1 BEGIN. Encontrados: ${beginActions.length}.`);
  } else if (beginIsOptional && beginActions.length > 1) {
    errors.push(`O bloco de API pode ter no maximo 1 BEGIN. Encontrados: ${beginActions.length}.`);
  }

  actions.forEach((action) => {
    validateActionReferences(action, actionsById, errors);

    if (action.action === 'MENU') validateMenu(action, actions, errors, warnings);
    if (action.action === 'CASE') validateCase(action, errors);
    if (action.action === 'LOOP') validateLoop(action, errors);
    if (action.action === 'RUNSCRIPT') validateRunscript(action, errors);
    if (action.action === 'RUNSUB') validateRunsub(action, errors);
    if (action.action === 'IF') validateIf(action, errors, warnings);
    if (action.action === 'PLAY') validatePlay(action, errors);
    if (action.action === 'REST_API') validateRestApi(action, errors);
    if (action.action === 'WORKFLOWDATA') validateWorkflowData(action, errors);
    if (action.action === 'RETURN') validateReturn(action, warnings);
    if (action.action === 'SNIPPET') validateSnippet(action, warnings);
  });

  validateMenuMask(actions, warnings);
  validateRestApiTemplate(actions, warnings);

  return {
    errors,
    warnings,
    isValid: errors.length === 0,
  };
}

function validateActionReferences(action, actionsById, errors) {
  const refs = [
    action.defaultNextAction,
    ...(action.branches ?? []),
    ...(action.cases ?? []),
  ].filter(Boolean);

  refs.forEach((ref) => {
    if (Number(ref.actionId) === -1) return;
    if (!actionsById.has(Number(ref.actionId))) {
      errors.push(`${action.caption}: referencia ActionID ${ref.actionId}, mas esse node nao existe.`);
    }
  });
}

function validateMenu(action, actions, errors, warnings) {
  const params = action.parameters ?? [];
  const timeout = params[5];
  const responseVariable = params[7];
  const hasTimeoutBranch = (action.branches ?? []).some((branch) => /timeout/i.test(branch.text));

  if (!responseVariable) errors.push(`${action.caption}: MENU sem variavel de resposta.`);
  if (!timeout) errors.push(`${action.caption}: MENU sem timeout configurado.`);
  if (!hasTimeoutBranch) errors.push(`${action.caption}: MENU precisa de branch Timeout.`);
}

function validateCase(action, errors) {
  if (!(action.cases ?? []).length) {
    errors.push(`${action.caption}: CASE precisa de pelo menos um case configurado.`);
  }
  if (!action.defaultNextAction || Number(action.defaultNextAction.actionId) === -1) {
    errors.push(`${action.caption}: CASE precisa de DefaultNextAction.`);
  }
}

function validateLoop(action, errors) {
  const labels = (action.branches ?? []).map((branch) => branch.text.toLowerCase());
  if (!labels.includes('finished')) errors.push(`${action.caption}: LOOP precisa da branch Finished.`);
  if (!labels.includes('repeat')) errors.push(`${action.caption}: LOOP precisa da branch Repeat.`);
}

function validateRunscript(action, errors) {
  const target = action.parameters?.[0];
  if (!target) errors.push(`${action.caption}: RUNSCRIPT sem script/path de destino.`);
}

function validateRunsub(action, errors) {
  const params = action.parameters ?? [];
  if (!params[0]) errors.push(`${action.caption}: RUNSUB sem script/API de destino.`);
  if (!params[2]) errors.push(`${action.caption}: RUNSUB sem tipo de retorno configurado.`);
  params.slice(3).forEach((param, index) => {
    if (!String(param ?? '').trim()) {
      errors.push(`${action.caption}: parametro ${index + 1} do RUNSUB esta vazio.`);
    }
  });
}

function validateIf(action, errors, warnings) {
  const expression = action.parameters?.[0];
  const branches = action.branches ?? [];
  const trueBranch = branches.find((branch) => branch.text.toLowerCase() === 'true');
  const falseBranch = branches.find((branch) => branch.text.toLowerCase() === 'false');

  if (!expression) errors.push(`${action.caption}: IF sem expressao de validacao.`);
  if (!trueBranch) errors.push(`${action.caption}: IF precisa da branch True.`);
  if (!falseBranch) errors.push(`${action.caption}: IF precisa da branch False.`);
  if (trueBranch && Number(trueBranch.actionId) === -1) warnings.push(`${action.caption}: branch True esta sem destino final.`);
  if (falseBranch && Number(falseBranch.actionId) === -1) warnings.push(`${action.caption}: branch False esta sem destino final.`);
}

function validatePlay(action, errors) {
  const prompt = String(action.parameters?.[0] ?? '').replace(/^"|"$/g, '').trim();
  if (!prompt) errors.push(`${action.caption}: PLAY sem prompt/audio configurado.`);
}

function validateRestApi(action, errors) {
  const params = action.parameters ?? [];
  if (!params[0]) errors.push(`${action.caption}: REST_API sem operacao configurada.`);
  if (!params[1]) errors.push(`${action.caption}: REST_API sem URL configurada.`);
  if (!params[4]) errors.push(`${action.caption}: REST_API sem metodo HTTP.`);
  if (!params[5]) errors.push(`${action.caption}: REST_API sem timeout.`);
  if (!params[6]) errors.push(`${action.caption}: REST_API sem variavel de resultset.`);
}

function validateWorkflowData(action, errors) {
  if (!String(action.parameters?.[0] ?? '').trim()) {
    errors.push(`${action.caption}: WORKFLOWDATA sem chave configurada.`);
  }
}

function validateReturn(action, warnings) {
  const value = String(action.parameters?.[0] ?? '').trim();
  if (value && value !== '0') {
    warnings.push(`${action.caption}: RETURN usa valor "${value}". Confira se este retorno e esperado.`);
  }
}

function validateSnippet(action, warnings) {
  const code = action.parameters?.[0] ?? '';
  if (!code) return;

  for (const match of code.matchAll(AUDIO_ASSIGN_RE)) {
    const value = match[2];
    if (value && !value.includes('{') && !/\.wav$/i.test(value)) {
      warnings.push(`${action.caption}: audio "${value}" nao termina em .wav.`);
    }
  }

  const looksLikeOutput = /parametros de saida|maxrej|maxsil|set /i.test(action.caption)
    || /scriptpoint|MAPA_DNA|NEXT_STEP/i.test(code);

  if (looksLikeOutput) {
    if (/scriptpoint/i.test(code) && !/MAPA_DNA/i.test(code)) {
      warnings.push(`${action.caption}: scriptpoint sem atualizacao de MAPA_DNA.`);
    }
    if (/MAPA_DNA/i.test(code) && !/scriptpoint/i.test(code)) {
      warnings.push(`${action.caption}: MAPA_DNA sem scriptpoint.`);
    }
    if (!/NEXT_STEP/i.test(code) && !/MAX_REJ|MAX_SIL/i.test(action.caption)) {
      warnings.push(`${action.caption}: snippet de saida sem NEXT_STEP.`);
    }
  }
}

function validateMenuMask(actions, warnings) {
  const configCode = actions.find((action) => action.caption === 'CONFIG_MENU')?.parameters?.[0] ?? '';
  const mask = configCode.match(/ASSIGN\s+MASCARA\s*=\s*"([^"]+)"/i)?.[1];
  if (!mask) return;
  const expected = mask.split('-').map((item) => item.trim()).filter(Boolean);
  const caseAction = actions.find((action) => action.action === 'CASE');
  const setParamsCode = actions.find((action) => action.caption === 'SET_PARAMS')?.parameters?.[0] ?? '';
  const switchCases = [...setParamsCode.matchAll(/CASE\s+"([^"]+)"/gi)].map((match) => match[1]);
  const actual = new Set(caseAction
    ? (caseAction.cases ?? []).map((item) => item.text)
    : switchCases);

  if (!actual.size) {
    warnings.push(`Mascara ${mask}: nenhuma opcao encontrada em CASE ou SWITCH OP_ESCOLHIDA.`);
    return;
  }

  expected.forEach((option) => {
    if (!actual.has(option)) {
      warnings.push(`Mascara ${mask}: opcao ${option} nao existe no CASE/SWITCH.`);
    }
  });
}

function validateRestApiTemplate(actions, warnings) {
  if (!actions.some((action) => action.action === 'REST_API')) return;

  if (!actions.some((action) => action.action === 'RUNSUB' && /Alerta erro API/i.test(action.caption))) {
    warnings.push('API REST: Alerta_ErroAPI esta desligado ou nao foi encontrado.');
  }

  const responseSnippet = actions.find((action) => action.action === 'SNIPPET' && /Dados RESPONSE/i.test(action.caption) && !/Fechada/i.test(action.caption));
  const responseCode = responseSnippet?.parameters?.[0] ?? '';
  if (responseSnippet && !/\b[A-Za-z0-9_:]+_RET\b/i.test(responseCode)) {
    warnings.push(`${responseSnippet.caption}: nao encontrei atribuicao para variavel *_RET.`);
  }
}

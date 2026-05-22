import { makeBranch, makeNiceAction, makeNiceScript } from './niceScriptModel.js';

export const DEFAULT_MENU_CONFIG = {
  scriptName: 'MenuPadrao',
  audioPathVar: '{path_audio}',
  pathStepVar: '{pathStep}',
  noteIni: 'CTL_MenuPadrao_INI.wav',
  responseVariable: 'MRES',
  timeout: '5',
  interDigitTimeout: '5',
  hasRej: true,
  hasSil: true,
  rejAttempts: '1',
  silAttempts: '1',
  rejRetryAudios: ['CTL_MenuPadrao_REJ.wav', 'CTL_MenuPadrao_REJ2.wav'],
  silRetryAudios: ['CTL_MenuPadrao_SIL.wav', 'CTL_MenuPadrao_SIL2.wav'],
  rejExit: makeExitConfig('PME_Transfer_ATH.wav', '{pathStep}transfer', '52192'),
  silExit: makeExitConfig('PME_Transfer_ATH.wav', '{pathStep}transfer', '52193'),
  options: [
    makeMenuOption('1', 'ProdutosResidenciais', 'CTL_ProdutosResidenciais_INI.wav', '1913107'),
    makeMenuOption('2', 'BloqOuDesbloqAnatel', 'CTL_BloqOuDesbloqAnatel_INI.wav', '1913108'),
  ],
};

export const DEFAULT_ENTRY_CONFIG = {
  scriptName: 'PCI_Entry_DEV',
  beginCaption: 'Entry',
  snippetCaption: 'env = PROD',
  envVar: 'global:env',
  appName: 'PCI',
  pathApi: '~\\{env}\\API\\',
  pathStep: '{env}\\{appname}\\',
  mapaDna: '0',
  nextStep: '{pathStep}PCI_Main',
  runscriptCaption: 'PCI_Main',
};

export const DEFAULT_API_CONFIG = {
  apiName: 'Ws_ChamadaApi',
  scriptPath: '{pathAPI}API_NomeDaApi',
  returnMode: 'RTN',
  paramsText: '_token\r\nclientIdentification',
  validationVariable: 'global:api_RET',
  validationOperator: '=',
  validationValue: '"OK"',
  ifExpressionOverride: '',
  trueDestination: makeApiDestination('SNIPPET', 'Sucesso API'),
  falseDestination: makeApiDestination('SNIPPET', 'Falha API'),
};

export function makeExitConfig(audio = '', nextStep = '', scriptpoint = '', transferCode = '') {
  return {
    audio,
    nextStep,
    scriptpoint,
    transferCode,
  };
}

export function makeApiDestination(type = 'SNIPPET', caption = '') {
  return {
    type,
    caption: caption || destinationCaption(type),
    snippetCode: '',
    prompt: '',
    nextStep: '',
  };
}

export function makeMenuOption(key, nextStep, audio, scriptpoint, transferCode = '') {
  return {
    key,
    label: nextStep,
    nextStep,
    audio,
    scriptpoint,
    transferCode,
  };
}

export function makeApiTemplate(config = {}) {
  const api = normalizeApiConfig({ ...DEFAULT_API_CONFIG, ...config });
  const trueAction = makeApiDestinationAction(19, api.trueDestination, 448, 176);
  const falseAction = makeApiDestinationAction(9, api.falseDestination, 448, 288);
  const actions = [
    makeNiceAction({
      actionId: 17,
      action: 'RUNSUB',
      caption: api.apiName,
      parameters: [api.scriptPath, '', api.returnMode, ...api.params],
      x: 304,
      y: 64,
      defaultNextAction: makeBranch(18),
    }),
    makeNiceAction({
      actionId: 18,
      action: 'IF',
      caption: 'If',
      parameters: [api.ifExpression],
      x: 448,
      y: 64,
      branches: [
        makeBranch(trueAction ? 19 : -1, 'True', 0),
        makeBranch(falseAction ? 9 : -1, 'False', 1),
      ],
    }),
    ...(trueAction ? [trueAction] : []),
    ...(falseAction ? [falseAction] : []),
  ];

  return makeNiceScript({
    name: api.apiName,
    source: 'template',
    templateType: 'api',
    metadata: { api },
    actions,
  });
}

export function makeMenuTemplate(config = {}) {
  const menu = normalizeMenuConfig({ ...DEFAULT_MENU_CONFIG, ...config });
  const actions = [
    makeNiceAction({
      actionId: 1,
      action: 'BEGIN',
      caption: menu.scriptName,
      parameters: ['', '', ''],
      x: 336,
      y: 64,
      defaultNextAction: makeBranch(14),
    }),
    makeNiceAction({
      actionId: 14,
      action: 'SNIPPET',
      caption: 'CONFIG_MENU',
      parameters: [menu.configSnippetOverride || makeMenuConfigSnippet(menu), 'Limit2K'],
      x: 336,
      y: 144,
      defaultNextAction: makeBranch(2),
    }),
    makeNiceAction({
      actionId: 2,
      action: 'MENU',
      caption: 'Menu',
      parameters: ['{NOTEMENU}', '', 'True', '1', '', menu.timeout, menu.interDigitTimeout, menu.responseVariable],
      x: 336,
      y: 240,
      defaultNextAction: makeBranch(4),
      branches: [makeBranch(menu.hasSil ? 24 : 23, 'Timeout', 2)],
    }),
    makeNiceAction({
      actionId: 4,
      action: 'LOCATE',
      caption: 'Op esta na Mascara?',
      parameters: ['{MASCARA}', `{${menu.responseVariable}}`, 'OP_ESCOLHIDA', 'False'],
      x: 336,
      y: 352,
      defaultNextAction: makeBranch(menu.hasRej ? 5 : 20),
      branches: [makeBranch(6, 'Found', 0)],
    }),
    makeNiceAction({
      actionId: 6,
      action: 'SNIPPET',
      caption: 'SET_PARAMS',
      parameters: [menu.setParamsSnippetOverride || makeSetParamsSnippet(menu), 'Limit2K'],
      x: 336,
      y: 480,
      defaultNextAction: makeBranch(13),
    }),
    ...makeRejActions(menu),
    ...makeSilActions(menu),
    makeNiceAction({
      actionId: 13,
      action: 'RUNSCRIPT',
      caption: 'next__step',
      parameters: ['{NEXT_STEP}'],
      x: 336,
      y: 656,
      defaultNextAction: null,
    }),
  ];

  return makeNiceScript({
    name: menu.scriptName,
    source: 'template',
    templateType: 'menu',
    metadata: { menu },
    actions,
  });
}

export function makeEntryTemplate(config = {}) {
  const entry = { ...DEFAULT_ENTRY_CONFIG, ...config };
  const actions = [
    makeNiceAction({
      actionId: 3,
      action: 'BEGIN',
      caption: entry.beginCaption,
      parameters: ['', '', ''],
      x: 128,
      y: 144,
      defaultNextAction: makeBranch(5),
      dependencyOrder: -1,
    }),
    makeNiceAction({
      actionId: 5,
      action: 'SNIPPET',
      caption: entry.snippetCaption,
      parameters: [makeEntrySnippet(entry), 'Limit2K'],
      x: 208,
      y: 144,
      defaultNextAction: makeBranch(15),
      dependencyOrder: 1,
    }),
    makeNiceAction({
      actionId: 15,
      action: 'RUNSCRIPT',
      caption: entry.runscriptCaption,
      parameters: ['{next_step}'],
      x: 288,
      y: 144,
      defaultNextAction: null,
      dependencyOrder: 2,
    }),
  ];

  return makeNiceScript({
    name: entry.scriptName,
    source: 'template',
    templateType: 'entry',
    metadata: { entry },
    actions,
  });
}

export function normalizeApiConfig(api) {
  const params = String(api.paramsText ?? '')
    .split(/\r?\n/)
    .map((item) => item.trim())
    .filter(Boolean);
  const validationVariable = String(api.validationVariable ?? '').trim();
  const validationOperator = String(api.validationOperator ?? '=').trim() || '=';
  const validationValue = String(api.validationValue ?? '"OK"').trim();
  const ifExpression = api.ifExpressionOverride?.trim()
    || [validationVariable, validationOperator, validationValue].filter(Boolean).join(' ');

  return {
    ...api,
    apiName: api.apiName || DEFAULT_API_CONFIG.apiName,
    scriptPath: api.scriptPath || DEFAULT_API_CONFIG.scriptPath,
    returnMode: api.returnMode || DEFAULT_API_CONFIG.returnMode,
    params,
    paramsText: params.join('\r\n'),
    validationVariable,
    validationOperator,
    validationValue,
    ifExpression,
    trueDestination: normalizeApiDestination(api.trueDestination, DEFAULT_API_CONFIG.trueDestination),
    falseDestination: normalizeApiDestination(api.falseDestination, DEFAULT_API_CONFIG.falseDestination),
  };
}

export function normalizeMenuConfig(menu) {
  const responseVariable = normalizeToken(menu.responseVariable || DEFAULT_MENU_CONFIG.responseVariable);
  const pathStepVar = menu.pathStepVar || DEFAULT_MENU_CONFIG.pathStepVar;
  const options = (menu.options?.length ? menu.options : DEFAULT_MENU_CONFIG.options)
    .map((option, index) => ({
      key: String(option.key || index + 1),
      label: option.label || option.nextStep?.replace(/^\{pathStep\}/, '') || `Opcao ${index + 1}`,
      nextStep: normalizeNextStep(option.nextStep || `Opcao${index + 1}`, pathStepVar),
      audio: option.audio || `CTL_Opcao${index + 1}_INI.wav`,
      scriptpoint: String(option.scriptpoint || ''),
      transferCode: option.transferCode || '',
    }));
  const rejAttempts = Math.max(0, Number(menu.rejAttempts ?? menu.maxRej ?? 1) || 0);
  const silAttempts = Math.max(0, Number(menu.silAttempts ?? menu.maxSil ?? 1) || 0);
  const hasRej = Boolean(menu.hasRej) && rejAttempts > 0;
  const hasSil = Boolean(menu.hasSil) && silAttempts > 0;

  return {
    ...menu,
    responseVariable,
    pathStepVar,
    options,
    hasRej,
    hasSil,
    rejAttempts: String(rejAttempts || 1),
    silAttempts: String(silAttempts || 1),
    rejRetryAudios: normalizeRetryAudios(menu.rejRetryAudios, rejAttempts, 'REJ'),
    silRetryAudios: normalizeRetryAudios(menu.silRetryAudios, silAttempts, 'SIL'),
    rejExit: normalizeExit(menu.rejExit, DEFAULT_MENU_CONFIG.rejExit, pathStepVar),
    silExit: normalizeExit(menu.silExit, DEFAULT_MENU_CONFIG.silExit, pathStepVar),
    mask: options.map((option) => option.key).join('-') || menu.mask,
  };
}

export function makeMenuSnippets(config = {}) {
  const menu = normalizeMenuConfig({ ...DEFAULT_MENU_CONFIG, ...config });
  return {
    config: makeMenuConfigSnippet(menu),
    setParams: makeSetParamsSnippet(menu),
    maxRej: menu.hasRej ? makeRetrySnippet('REJ', 'noterej', menu.rejRetryAudios.length, 9) : '',
    maxSil: menu.hasSil ? makeRetrySnippet('SIL', 'notesil', menu.silRetryAudios.length, 8) : '',
  };
}

function makeApiDestinationAction(actionId, destination, x, y) {
  if (!destination || destination.type === 'NONE') return null;

  if (destination.type === 'PLAY') {
    return makeNiceAction({
      actionId,
      action: 'PLAY',
      caption: destination.caption || 'Play',
      parameters: [`"${destination.prompt}"`, '', 'True', 'False', '', '', '', ''],
      x,
      y,
    });
  }

  if (destination.type === 'RUNSCRIPT') {
    return makeNiceAction({
      actionId,
      action: 'RUNSCRIPT',
      caption: destination.caption || 'next__step',
      parameters: [destination.nextStep || ''],
      x,
      y,
    });
  }

  return makeNiceAction({
    actionId,
    action: 'SNIPPET',
    caption: destination.caption || 'Snippet',
    parameters: [destination.snippetCode || '', 'Limit2K'],
    x,
    y,
  });
}

function normalizeApiDestination(destination = {}, fallback = {}) {
  const type = destination.type || fallback.type || 'SNIPPET';
  return {
    ...fallback,
    ...destination,
    type,
    caption: destination.caption || fallback.caption || destinationCaption(type),
    snippetCode: destination.snippetCode ?? fallback.snippetCode ?? '',
    prompt: destination.prompt ?? fallback.prompt ?? '',
    nextStep: destination.nextStep ?? fallback.nextStep ?? '',
  };
}

function destinationCaption(type) {
  if (type === 'PLAY') return 'Play';
  if (type === 'RUNSCRIPT') return 'next__step';
  if (type === 'NONE') return 'Sem destino';
  return 'Snippet';
}

function makeRejActions(menu) {
  const actions = [];

  if (menu.hasRej) {
    actions.push(makeNiceAction({
      actionId: 5,
      action: 'LOOP',
      caption: 'Loop MaxRej',
      parameters: ['{QTD_MAX_REJ}', 'REJ'],
      x: 192,
      y: 352,
      branches: [makeBranch(20, 'Finished', 0), makeBranch(11, 'Repeat', 1)],
    }));
    actions.push(makeNiceAction({
      actionId: 11,
      action: 'SNIPPET',
      caption: 'MAX_REJ',
      parameters: [menu.maxRejSnippetOverride || makeRetrySnippet('REJ', 'noterej', menu.rejRetryAudios.length, 9), 'Limit2K'],
      x: 192,
      y: 240,
      defaultNextAction: makeBranch(2),
    }));
  }

  actions.push(makeNiceAction({
    actionId: 20,
    action: 'SNIPPET',
    caption: 'Saida REJ',
    parameters: [makeExitSnippet(menu.rejExit), 'Limit2K'],
    x: 192,
    y: 480,
    defaultNextAction: makeBranch(13),
  }));

  return actions;
}

function makeSilActions(menu) {
  const actions = [];

  if (menu.hasSil) {
    actions.push(makeNiceAction({
      actionId: 24,
      action: 'LOOP',
      caption: 'Loop MaxSil',
      parameters: ['{QTD_MAX_SIL}', 'SIL'],
      x: 512,
      y: 352,
      branches: [makeBranch(23, 'Finished', 0), makeBranch(22, 'Repeat', 1)],
    }));
    actions.push(makeNiceAction({
      actionId: 22,
      action: 'SNIPPET',
      caption: 'MAX_SIL',
      parameters: [menu.maxSilSnippetOverride || makeRetrySnippet('SIL', 'notesil', menu.silRetryAudios.length, 8), 'Limit2K'],
      x: 512,
      y: 256,
      defaultNextAction: makeBranch(2),
    }));
  }

  actions.push(makeNiceAction({
    actionId: 23,
    action: 'SNIPPET',
    caption: 'Saida SIL',
    parameters: [makeExitSnippet(menu.silExit), 'Limit2K'],
    x: 512,
    y: 480,
    defaultNextAction: makeBranch(13),
  }));

  return actions;
}

function makeMenuConfigSnippet(menu) {
  const lines = [
    'ASSIGN sil = 0',
    'ASSIGN rej = 0',
    '',
    `ASSIGN noteini="${menu.audioPathVar}${menu.noteIni}"`,
  ];

  if (menu.hasRej) {
    menu.rejRetryAudios.forEach((audio, index) => {
      lines.push(`ASSIGN ${retryVar('noterej', index)}="${menu.audioPathVar}${audio}"`);
    });
  }

  if (menu.hasSil) {
    menu.silRetryAudios.forEach((audio, index) => {
      lines.push(`ASSIGN ${retryVar('notesil', index)}="${menu.audioPathVar}${audio}"`);
    });
  }

  lines.push(
    '',
    `ASSIGN MASCARA="${menu.mask}"`,
    '',
  );

  if (menu.hasRej) lines.push(`ASSIGN QTD_MAX_REJ=${menu.rejAttempts}`);
  if (menu.hasSil) lines.push(`ASSIGN QTD_MAX_SIL=${menu.silAttempts}`);

  lines.push('', 'ASSIGN NOTEMENU=noteini');
  return lines.join('\r\n');
}

function makeSetParamsSnippet(menu) {
  const responseValue = `{${menu.responseVariable.toLowerCase()}}`;
  const caseBlocks = menu.options.map((option) => [
    `  CASE "${option.key}"`,
    '  {',
    option.scriptpoint ? `    ASSIGN scriptpoint=${option.scriptpoint}` : '',
    '    ASSIGN mapa_dna = "{mapa_dna}|{scriptpoint}"',
    `    ASSIGN AUDIO="${option.audio}"`,
    `    ASSIGN NEXT_STEP="${option.nextStep}"`,
    option.transferCode ? `    ASSIGN TRANSFERCODE="${option.transferCode}"` : '',
    '    interactionLastDateTime=0',
    '  }',
  ].filter(Boolean).join('\r\n')).join('\r\n\r\n');

  return [
    '//SETA KEYTRACE',
    `ASSIGN global:KeyTrace="{KeyTrace}{${menu.responseVariable}}"`,
    `OP_ESCOLHIDA="${responseValue}"`,
    'SWITCH OP_ESCOLHIDA',
    '{',
    caseBlocks,
    '}',
  ].join('\r\n');
}

function makeRetrySnippet(counter, variablePrefix, attempts, lastDateTime) {
  const blocks = Array.from({ length: attempts }, (_, index) => {
    const keyword = index === 0 ? `IF ${counter} = ${index + 1}` : `ELSE\r\nIF ${counter} = ${index + 1}`;
    return [
      keyword,
      '{',
      `ASSIGN notemenu = ${retryVar(variablePrefix, index)}`,
      '}',
    ].join('\r\n');
  });

  return [
    ...blocks,
    '',
    `interactionLastDateTime = ${lastDateTime}`,
  ].join('\r\n');
}

function makeExitSnippet(exitConfig) {
  return [
    exitConfig.scriptpoint ? `ASSIGN scriptpoint=${exitConfig.scriptpoint}` : '',
    exitConfig.scriptpoint ? 'ASSIGN mapa_dna = "{mapa_dna}|{scriptpoint}"' : '',
    `ASSIGN AUDIO="${exitConfig.audio}"`,
    `ASSIGN NEXT_STEP="${exitConfig.nextStep}"`,
    exitConfig.transferCode ? `ASSIGN TRANSFERCODE="${exitConfig.transferCode}"` : '',
    'interactionLastDateTime=0',
  ].filter(Boolean).join('\r\n');
}

function makeEntrySnippet(entry) {
  return [
    'IF RUNSCRIPT.contains("DEV")',
    '{',
    `  ASSIGN ${entry.envVar}="DEV"`,
    '}',
    'ELSE',
    '{',
    `  ASSIGN ${entry.envVar}="PROD"`,
    '}',
    '',
    `ASSIGN appname="${entry.appName}"`,
    `ASSIGN global:PathAPI="${entry.pathApi}"`,
    `ASSIGN pathStep="${entry.pathStep}"`,
    `ASSIGN mapa_dna="${entry.mapaDna}"`,
    `ASSIGN next_step="${entry.nextStep}"`,
  ].join('\r\n');
}

function normalizeRetryAudios(audios = [], attempts, suffix) {
  return Array.from({ length: Math.max(0, attempts) }, (_, index) => (
    audios[index] || `CTL_MenuPadrao_${suffix}${index + 1 > 1 ? index + 1 : ''}.wav`
  ));
}

function normalizeExit(exitConfig, fallback, pathStepVar) {
  const exit = { ...fallback, ...(exitConfig ?? {}) };
  return {
    ...exit,
    nextStep: normalizeNextStep(exit.nextStep, pathStepVar),
    scriptpoint: String(exit.scriptpoint || ''),
  };
}

function normalizeNextStep(nextStep, pathStepVar) {
  const value = String(nextStep || '');
  if (!value) return '';
  if (value.includes('{') || value.includes('\\') || value.includes('/')) return value;
  return `${pathStepVar}${value}`;
}

function normalizeToken(value) {
  return String(value).replace(/[{}]/g, '').trim() || DEFAULT_MENU_CONFIG.responseVariable;
}

function retryVar(prefix, index) {
  return index === 0 ? prefix : `${prefix}${index + 1}`;
}

export const NICE_LIBRARY_IDS = {
  BEGIN: 'b2f794c5-0232-40e7-9830-76d573bf57d7',
  SNIPPET: 'b333da63-33c8-4297-a58a-e9546cf7f0f2',
  MENU: 'daee9c00-12ce-4222-a42e-307c37d53b7f',
  LOCATE: 'fa14bd7c-cc7f-43e3-a9b2-e56f78d5bdd8',
  CASE: '22050500-6dc0-4949-af9c-1e52975f141d',
  LOOP: 'a10f9f27-a5dd-48ba-ae37-e206fc6e101b',
  RUNSCRIPT: '93232e99-d607-4e7d-9300-17986d70da3c',
  RUNSUB: 'f8b958d0-8cd3-40df-97d3-5862930b0807',
  IF: '6695ba9c-e1d6-4f3c-a15a-94f1400e3169',
  ASSIGN: '9015c095-98d9-441f-bf92-e90f5c5ed8c8',
  PLAY: 'b1b9a2dd-65b6-4626-9cf5-9cfa69cf59e2',
};

export const NICE_ACTION_LABELS = {
  BEGIN: 'Início',
  SNIPPET: 'Snippet',
  MENU: 'Menu',
  LOCATE: 'Locate',
  CASE: 'Case',
  LOOP: 'Loop',
  RUNSCRIPT: 'Runscript',
  RUNSUB: 'Runsub',
  IF: 'If',
  ASSIGN: 'Assign',
  PLAY: 'Play',
};

export function makeNiceScript({ name, source = 'template', templateType = '', actions = [], metadata = {} }) {
  return {
    id: `nice-script-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    name,
    source,
    templateType,
    metadata: {
      busNo: 0,
      userId: 0,
      mediaType: 0,
      ...metadata,
    },
    actions,
  };
}

export function makeNiceAction({
  actionId,
  action,
  caption,
  parameters = [],
  x = 0,
  y = 0,
  defaultNextAction = null,
  branches = [],
  cases = [],
  dependencyOrder = 0,
  libraryId,
  implType = 0,
  extraInfo = null,
  xws = 0,
  yws = 0,
}) {
  return {
    id: `nice-action-${actionId}`,
    actionId: Number(actionId),
    action,
    caption: caption || action,
    parameters,
    x: Number(x) || 0,
    y: Number(y) || 0,
    defaultNextAction,
    branches,
    cases,
    dependencyOrder: Number(dependencyOrder) || 0,
    libraryId: libraryId || NICE_LIBRARY_IDS[action] || '',
    implType: Number(implType) || 0,
    extraInfo,
    xws: Number(xws) || 0,
    yws: Number(yws) || 0,
  };
}

export function makeBranch(actionId, text = '', index = 0, segments = []) {
  return {
    actionId: Number(actionId),
    index: Number(index) || 0,
    text,
    labelDistance: null,
    segments,
  };
}

export function cloneNiceScript(script, overrides = {}) {
  return {
    ...script,
    ...overrides,
    metadata: {
      ...script.metadata,
      ...(overrides.metadata ?? {}),
    },
    actions: script.actions.map((action) => ({
      ...action,
      parameters: [...(action.parameters ?? [])],
      branches: (action.branches ?? []).map(cloneBranch),
      cases: (action.cases ?? []).map(cloneBranch),
      defaultNextAction: action.defaultNextAction ? cloneBranch(action.defaultNextAction) : null,
      extraInfo: action.extraInfo ? structuredCloneSafe(action.extraInfo) : null,
    })),
  };
}

export function cloneBranch(branch) {
  return {
    ...branch,
    segments: (branch.segments ?? []).map((point) => ({ ...point })),
  };
}

export function getNextActionId(actions) {
  return Math.max(0, ...actions.map((action) => Number(action.actionId) || 0)) + 1;
}

function structuredCloneSafe(value) {
  if (typeof structuredClone === 'function') return structuredClone(value);
  return JSON.parse(JSON.stringify(value));
}

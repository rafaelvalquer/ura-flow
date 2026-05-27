import { makeBranch, makeNiceAction, NICE_ACTION_LABELS } from '../../../services/niceScriptModel.js';

export function makeDefaultAction(actionType, actionId, position = {}) {
  const base = {
    actionId,
    action: actionType,
    caption: defaultActionCaption(actionType),
    x: Math.round(position.x ?? 160),
    y: Math.round(position.y ?? 160),
  };

  if (actionType === 'BEGIN') {
    return makeNiceAction({
      ...base,
      caption: 'Begin',
      parameters: ['', '', ''],
      defaultNextAction: makeBranch(-1),
    });
  }
  if (actionType === 'SNIPPET') {
    return makeNiceAction({ ...base, parameters: ['', 'Limit2K'] });
  }
  if (actionType === 'PLAY') {
    return makeNiceAction({ ...base, parameters: ['""', '', 'True', 'False', '', '', '', ''] });
  }
  if (actionType === 'RUNSCRIPT') {
    return makeNiceAction({ ...base, caption: 'next__step', parameters: [''] });
  }
  if (actionType === 'RUNSUB') {
    return makeNiceAction({ ...base, caption: 'Ws_ChamadaApi', parameters: ['', '', 'RTN'] });
  }
  if (actionType === 'REST_API') {
    return makeNiceAction({
      ...base,
      caption: 'consulta_servico',
      parameters: ['MakeRestRequest', '{url}', '{headerjson}', '{bodyjson}', 'POST', '4000', 'resultSet', 'errorArgList', 'responseHeaders'],
      defaultNextAction: makeBranch(-1),
    });
  }
  if (actionType === 'WORKFLOWDATA') {
    return makeNiceAction({
      ...base,
      caption: 'CHAVE APIs',
      parameters: ['API_Desliga'],
      defaultNextAction: makeBranch(-1),
    });
  }
  if (actionType === 'RETURN') {
    return makeNiceAction({ ...base, caption: 'Default', parameters: ['0'] });
  }
  if (actionType === 'ANNOTATION') {
    return makeNiceAction({ ...base, caption: 'Annotation', parameters: ['', '191', '116'] });
  }
  if (actionType === 'IF') {
    return makeNiceAction({
      ...base,
      caption: 'If',
      parameters: [''],
      branches: [makeBranch(-1, 'True', 0), makeBranch(-1, 'False', 1)],
    });
  }
  if (actionType === 'LOOP') {
    return makeNiceAction({
      ...base,
      caption: 'Loop',
      parameters: ['', ''],
      branches: [makeBranch(-1, 'Finished', 0), makeBranch(-1, 'Repeat', 1)],
    });
  }
  if (actionType === 'MENU') {
    return makeNiceAction({
      ...base,
      caption: 'Menu',
      parameters: ['{NOTEMENU}', '', 'True', '1', '', '5', '5', 'MRES'],
      defaultNextAction: makeBranch(-1),
      branches: [makeBranch(-1, 'Timeout', 2)],
    });
  }
  if (actionType === 'LOCATE') {
    return makeNiceAction({
      ...base,
      caption: 'Op esta na Mascara?',
      parameters: ['{MASCARA}', '{MRES}', 'OP_ESCOLHIDA', 'False'],
      defaultNextAction: makeBranch(-1),
      branches: [makeBranch(-1, 'Found', 0)],
    });
  }
  if (actionType === 'CASE') {
    return makeNiceAction({
      ...base,
      caption: 'Case',
      parameters: ['{MRES}'],
      defaultNextAction: makeBranch(-1),
      cases: [makeBranch(-1, '1', 0)],
    });
  }
  if (actionType === 'ASSIGN') {
    return makeNiceAction({
      ...base,
      caption: 'Assign',
      parameters: ['', '', 'String', '', 'False', 'False', 'Limit2K'],
    });
  }

  return makeNiceAction({ ...base, parameters: [] });
}

export function upsertBranch(items, branch) {
  const branchText = String(branch.text ?? '').toLowerCase();
  const index = items.findIndex((item) => (
    Number(item.index) === Number(branch.index)
    || (branchText && String(item.text ?? '').toLowerCase() === branchText)
  ));

  if (index === -1) return [...items, branch];
  const nextItems = [...items];
  nextItems[index] = { ...nextItems[index], ...branch };
  return nextItems;
}

export function sameBranch(left, right) {
  return Number(left?.actionId) === Number(right?.actionId)
    && Number(left?.index) === Number(right?.index)
    && String(left?.text ?? '') === String(right?.text ?? '');
}

function defaultActionCaption(actionType) {
  return NICE_ACTION_LABELS[actionType] ?? actionType;
}

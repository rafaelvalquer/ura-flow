import { getDirectMenuCaseBranches } from '../../../services/niceMenuRouting.js';

export function getAvailableConnectionOptions(sourceAction) {
  if (!sourceAction) return [];

  if (sourceAction.action === 'IF') {
    return [
      makeBranchOption(sourceAction, 'True', 0, 'Branch True', 'Caminho executado quando o IF for verdadeiro.'),
      makeBranchOption(sourceAction, 'False', 1, 'Branch False', 'Caminho executado quando o IF for falso.'),
    ].filter(Boolean);
  }

  if (sourceAction.action === 'LOOP') {
    return [
      makeBranchOption(sourceAction, 'Finished', 0, 'Branch Finished', 'Caminho quando o limite do loop for atingido.'),
      makeBranchOption(sourceAction, 'Repeat', 1, 'Branch Repeat', 'Caminho para repetir o loop.'),
    ].filter(Boolean);
  }

  if (sourceAction.action === 'MENU') {
    const directCases = getDirectMenuCaseBranches(sourceAction);
    const nextCase = nextCaseValue(directCases);
    return [
      makeDefaultOption(sourceAction, 'DefaultNextAction', 'Caminho quando o cliente digita uma opcao.'),
      makeBranchOption(sourceAction, 'Timeout', 2, 'Branch Timeout', 'Caminho quando nao ha digitacao dentro do timeout.'),
      {
        key: `menu-case-${nextCase}`,
        type: 'case',
        label: nextCase,
        index: nextCaseIndex(directCases),
        selectLabel: 'Nova saida customizada',
        description: 'Cria uma saida do MENU pelo valor digitado na variavel de resposta.',
        editable: true,
        responseVariableEditable: true,
        responseVariable: sourceAction.parameters?.[7] || 'MRES',
      },
    ].filter(Boolean);
  }

  if (sourceAction.action === 'LOCATE') {
    return [
      makeBranchOption(sourceAction, 'Found', 0, 'Branch Found', 'Caminho quando o valor foi encontrado na mascara.'),
      makeDefaultOption(sourceAction, 'DefaultNextAction', 'Caminho quando o valor nao foi encontrado.'),
    ].filter(Boolean);
  }

  if (sourceAction.action === 'CASE') {
    const nextCase = nextCaseValue(sourceAction.cases ?? []);
    return [
      makeDefaultOption(sourceAction, 'DefaultNextAction', 'Caminho padrao quando nenhum case casar.'),
      {
        key: `case-${nextCase}`,
        type: 'case',
        label: nextCase,
        index: nextCaseIndex(sourceAction.cases ?? []),
        selectLabel: 'Novo Case',
        description: 'Cria uma nova opcao de CASE com valor editavel.',
        editable: true,
      },
    ].filter(Boolean);
  }

  if (['RUNSCRIPT', 'RETURN', 'ANNOTATION'].includes(sourceAction.action)) {
    return [];
  }

  return [
    makeDefaultOption(sourceAction, 'DefaultNextAction', 'Caminho padrao da action.'),
  ].filter(Boolean);
}

function makeDefaultOption(action, selectLabel, description) {
  if (isConnected(action.defaultNextAction)) return null;
  return {
    key: 'default',
    type: 'default',
    label: '',
    index: 0,
    selectLabel,
    description,
    editable: false,
  };
}

function makeBranchOption(action, label, index, selectLabel, description) {
  const existing = (action.branches ?? []).find((branch) => (
    String(branch.text ?? '').toLowerCase() === String(label).toLowerCase()
    || Number(branch.index) === Number(index)
  ));
  if (isConnected(existing)) return null;
  return {
    key: `branch-${label.toLowerCase()}`,
    type: 'branch',
    label,
    index,
    selectLabel,
    description,
    editable: false,
  };
}

function isConnected(branch) {
  return Number(branch?.actionId) > 0;
}

function nextCaseValue(cases) {
  const usedNumbers = new Set(
    cases
      .map((item) => Number(item.text))
      .filter((value) => Number.isFinite(value) && value > 0),
  );
  let value = 1;
  while (usedNumbers.has(value)) value += 1;
  return String(value);
}

function nextCaseIndex(cases) {
  return Math.max(-1, ...cases.map((item) => Number(item.index) || 0)) + 1;
}

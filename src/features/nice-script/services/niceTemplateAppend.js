import { getNextActionId } from '../../../services/niceScriptModel.js';

export function remapTemplateActionsForAppend(currentActions, templateActions) {
  const sourceActions = (templateActions ?? []).filter((action) => action.action !== 'BEGIN');
  if (sourceActions.length === 0) return { actions: [] };

  const currentMaxId = getNextActionId(currentActions) - 1;
  const idMap = new Map();
  sourceActions.forEach((action, index) => {
    idMap.set(Number(action.actionId), currentMaxId + index + 1);
  });

  const offset = calculateAppendOffset(currentActions, sourceActions);
  const actions = sourceActions.map((action) => remapTemplateAction(action, idMap, offset));
  return { actions };
}

function calculateAppendOffset(currentActions, sourceActions) {
  const currentMaxX = Math.max(120, ...currentActions.map((action) => Number(action.x) || 0));
  const currentMinY = Math.min(160, ...currentActions.map((action) => Number(action.y) || 0));
  const sourceMinX = Math.min(...sourceActions.map((action) => Number(action.x) || 0));
  const sourceMinY = Math.min(...sourceActions.map((action) => Number(action.y) || 0));
  return {
    x: currentMaxX + 260 - sourceMinX,
    y: Math.max(80, currentMinY) - sourceMinY,
  };
}

function remapTemplateAction(action, idMap, offset) {
  const nextId = idMap.get(Number(action.actionId));
  return {
    ...action,
    id: `nice-action-${nextId}`,
    actionId: nextId,
    x: Math.round((Number(action.x) || 0) + offset.x),
    y: Math.round((Number(action.y) || 0) + offset.y),
    defaultNextAction: remapBranch(action.defaultNextAction, idMap),
    branches: (action.branches ?? []).map((branch) => remapBranch(branch, idMap)).filter(Boolean),
    cases: (action.cases ?? []).map((branch) => remapBranch(branch, idMap)).filter(Boolean),
    parameters: [...(action.parameters ?? [])],
    extraInfo: remapExtraInfo(action.extraInfo, idMap),
  };
}

function remapBranch(branch, idMap) {
  if (!branch) return null;
  const oldId = Number(branch.actionId);
  const nextId = idMap.has(oldId) ? idMap.get(oldId) : -1;
  return {
    ...branch,
    actionId: nextId,
    segments: (branch.segments ?? []).map((segment) => ({ ...segment })),
  };
}

function remapExtraInfo(extraInfo, idMap) {
  if (!extraInfo) return null;
  const nextInfo = clonePlainObject(extraInfo);
  if (Array.isArray(nextInfo.Branches)) {
    nextInfo.Branches = nextInfo.Branches
      .map((branch) => remapExtraInfoBranch(branch, idMap))
      .filter(Boolean);
  }
  if (Array.isArray(nextInfo.CaseBranches)) {
    nextInfo.CaseBranches = nextInfo.CaseBranches
      .map((branch) => remapExtraInfoBranch(branch, idMap))
      .filter(Boolean);
  }
  if (nextInfo.DefaultBranch) {
    nextInfo.DefaultBranch = remapExtraInfoBranch(nextInfo.DefaultBranch, idMap) ?? {
      ...nextInfo.DefaultBranch,
      ActionId: -1,
    };
  }
  return nextInfo;
}

function remapExtraInfoBranch(branch, idMap) {
  if (!branch) return null;
  const oldId = Number(branch.ActionId);
  const nextId = idMap.has(oldId) ? idMap.get(oldId) : -1;
  if (nextId <= 0 && oldId > 0) return null;
  return {
    ...branch,
    ActionId: nextId,
    Segments: (branch.Segments ?? []).map((segment) => ({ ...segment })),
  };
}

function clonePlainObject(value) {
  if (typeof structuredClone === 'function') return structuredClone(value);
  return JSON.parse(JSON.stringify(value));
}

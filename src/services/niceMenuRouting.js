export function getDirectMenuCaseBranches(menu) {
  if (!menu || menu.action !== 'MENU') return [];

  const branches = [];
  const seen = new Set();

  (menu.cases ?? []).forEach((branch, index) => {
    addBranch(branches, seen, {
      actionId: branch.actionId,
      text: branch.text,
      index: branch.index ?? index,
      segments: branch.segments,
      labelDistance: branch.labelDistance,
    });
  });

  getExtraInfoCaseBranches(menu.extraInfo).forEach((branch, index) => {
    addBranch(branches, seen, {
      actionId: branch.actionId ?? branch.ActionId,
      text: branch.keyName ?? branch.KeyName,
      index,
      segments: branch.segments ?? branch.Segments,
    });
  });

  return branches;
}

export function hasDirectMenuCaseBranches(menu) {
  return getDirectMenuCaseBranches(menu).length > 0;
}

export function findDirectMenuCaseBranch(menu, value) {
  const wanted = normalizeCaseKey(value);
  if (!wanted) return null;
  return getDirectMenuCaseBranches(menu).find((branch) => normalizeCaseKey(branch.text) === wanted) ?? null;
}

export function getDirectMenuCaseKeys(menu) {
  return getDirectMenuCaseBranches(menu)
    .map((branch) => String(branch.text ?? '').trim())
    .filter(Boolean);
}

function getExtraInfoCaseBranches(extraInfo) {
  if (!extraInfo) return [];
  if (Array.isArray(extraInfo.caseBranches)) return extraInfo.caseBranches;
  if (Array.isArray(extraInfo.CaseBranches)) return extraInfo.CaseBranches;
  return [];
}

function addBranch(branches, seen, branch) {
  const text = String(branch.text ?? '').trim();
  const actionId = Number(branch.actionId);
  if (!text || !Number.isFinite(actionId) || actionId <= 0) return;

  const key = `${normalizeCaseKey(text)}:${actionId}`;
  if (seen.has(key)) return;
  seen.add(key);

  branches.push({
    actionId,
    index: Number(branch.index) || 0,
    text,
    labelDistance: branch.labelDistance ?? null,
    segments: normalizeSegments(branch.segments),
  });
}

function normalizeSegments(segments = []) {
  return (segments ?? []).map((segment) => ({
    X: Number(segment.X ?? segment.x) || 0,
    Y: Number(segment.Y ?? segment.y) || 0,
  }));
}

function normalizeCaseKey(value) {
  return String(value ?? '').trim().toUpperCase();
}

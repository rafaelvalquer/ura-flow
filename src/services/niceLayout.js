const START_X = 72;
const START_Y = 72;
const COLUMN_GAP = 280;
const ROW_GAP = 44;
const BASE_NODE_HEIGHT = 94;
const DECISION_SUMMARY_HEIGHT = 34;
const OUTPUT_LIST_HEADER_HEIGHT = 16;
const OUTPUT_ROW_HEIGHT = 30;
const LONG_SNIPPET_EXTRA_HEIGHT = 18;

export function organizeNiceScript(script) {
  const actions = script?.actions ?? [];
  if (!actions.length) return script;

  const actionById = new Map(actions.map((action) => [Number(action.actionId), action]));
  const root = actions.find((action) => action.action === 'BEGIN') ?? actions[0];
  const levels = new Map([[Number(root.actionId), 0]]);
  const queue = [root];

  while (queue.length) {
    const action = queue.shift();
    const level = levels.get(Number(action.actionId)) ?? 0;

    getOutgoingActionIds(action).forEach((targetId) => {
      if (!actionById.has(targetId) || targetId === Number(action.actionId)) return;
      const nextLevel = level + 1;
      const currentLevel = levels.get(targetId);
      if (currentLevel !== undefined && currentLevel <= nextLevel) return;
      levels.set(targetId, nextLevel);
      queue.push(actionById.get(targetId));
    });
  }

  const maxLevel = Math.max(0, ...levels.values());
  actions.forEach((action) => {
    const actionId = Number(action.actionId);
    if (!levels.has(actionId)) {
      levels.set(actionId, maxLevel + 1 + fallbackColumnOffset(action));
    }
  });

  const columns = new Map();
  actions.forEach((action) => {
    const level = levels.get(Number(action.actionId)) ?? 0;
    const column = columns.get(level) ?? [];
    column.push(action);
    columns.set(level, column);
  });

  const positions = new Map();
  const tallestColumnHeight = maxColumnHeight(columns);
  [...columns.entries()].forEach(([level, columnActions]) => {
    columnActions.sort(compareActionsForLayout);
    const columnHeight = estimateColumnHeight(columnActions);
    const baseY = START_Y + Math.max(0, (tallestColumnHeight - columnHeight) * 0.18);
    let nextY = baseY;

    columnActions.forEach((action) => {
      positions.set(Number(action.actionId), {
        x: START_X + level * COLUMN_GAP,
        y: Math.round(nextY),
      });
      nextY += estimateActionHeight(action) + ROW_GAP;
    });
  });

  return {
    ...script,
    actions: actions.map((action) => ({
      ...action,
      ...(positions.get(Number(action.actionId)) ?? {}),
    })),
  };
}

function getOutgoingActionIds(action) {
  return [
    action.defaultNextAction,
    ...(action.branches ?? []),
    ...(action.cases ?? []),
  ]
    .filter(Boolean)
    .map((branch) => Number(branch.actionId))
    .filter((actionId) => Number.isFinite(actionId) && actionId > 0);
}

function fallbackColumnOffset(action) {
  if (action.action === 'RUNSCRIPT' || action.action === 'RUNSUB') return 2;
  if (action.action === 'SNIPPET') return 1;
  return 0;
}

function compareActionsForLayout(left, right) {
  const leftPriority = actionLayoutPriority(left);
  const rightPriority = actionLayoutPriority(right);
  if (leftPriority !== rightPriority) return leftPriority - rightPriority;
  if (Number(left.y) !== Number(right.y)) return Number(left.y) - Number(right.y);
  if (Number(left.x) !== Number(right.x)) return Number(left.x) - Number(right.x);
  return Number(left.actionId) - Number(right.actionId);
}

function actionLayoutPriority(action) {
  const caption = String(action.caption ?? '').toLowerCase();
  if (action.action === 'BEGIN') return 0;
  if (caption.includes('config')) return 1;
  if (action.action === 'MENU') return 2;
  if (action.action === 'LOCATE') return 3;
  if (caption.includes('rej')) return 4;
  if (caption.includes('set_params')) return 5;
  if (caption.includes('sil')) return 6;
  if (action.action === 'RUNSCRIPT') return 8;
  return 7;
}

function maxColumnHeight(columns) {
  return Math.max(1, ...[...columns.values()].map(estimateColumnHeight));
}

function estimateColumnHeight(actions) {
  if (!actions.length) return 0;
  return actions.reduce((total, action, index) => (
    total + estimateActionHeight(action) + (index > 0 ? ROW_GAP : 0)
  ), 0);
}

function estimateActionHeight(action) {
  let height = BASE_NODE_HEIGHT;

  if (action.action === 'IF' || action.action === 'CASE') {
    height += DECISION_SUMMARY_HEIGHT;
  }

  const outputRows = estimateOutputRows(action);
  if (outputRows > 0) {
    height += OUTPUT_LIST_HEADER_HEIGHT + outputRows * OUTPUT_ROW_HEIGHT;
  }

  if (action.action === 'SNIPPET') {
    const code = String(action.parameters?.[0] ?? '');
    if (code.length > 600 || /\b(FUNCTION|SWITCH|FOREACH)\b/i.test(code)) {
      height += LONG_SNIPPET_EXTRA_HEIGHT;
    }
  }

  return height;
}

function estimateOutputRows(action) {
  if (action.action === 'IF') return 2;
  if (action.action === 'LOOP') return 2;
  if (action.action === 'CASE') {
    return Math.max(1, (action.cases?.length ?? 0) + (action.defaultNextAction ? 1 : 0));
  }
  if (action.action === 'MENU') {
    return action.cases?.length ?? 0;
  }
  return 0;
}

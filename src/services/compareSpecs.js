import { normalizeKey } from '../utils/normalizeText.js';

const FIELD_LABELS = {
  destination: 'Destino',
  prompt: 'Prompt',
  bi: 'B.I.',
  conditions: 'Condicoes',
  observation: 'Observacao',
};

const FIELD_PRIORITY = ['destination', 'prompt', 'bi', 'conditions', 'observation'];

export function compareSpecs(previousData, nextData) {
  if (!previousData || !nextData) return null;

  const previousStates = indexStates(previousData.states);
  const nextStates = indexStates(nextData.states);
  const stateChanges = [];
  const transitionChanges = [];

  const allStateKeys = new Set([...previousStates.keys(), ...nextStates.keys()]);

  allStateKeys.forEach((stateKey) => {
    const previousState = previousStates.get(stateKey);
    const nextState = nextStates.get(stateKey);
    const stateName = nextState?.sheetName ?? previousState?.sheetName ?? stateKey;

    if (!previousState && nextState) {
      stateChanges.push({
        type: 'added',
        stateName,
        before: null,
        after: nextState,
        transitionChangeCount: nextState.transitions.length,
      });
      nextState.transitions.forEach((transition) => {
        transitionChanges.push(makeAddedTransitionChange(stateName, transition));
      });
      return;
    }

    if (previousState && !nextState) {
      stateChanges.push({
        type: 'removed',
        stateName,
        before: previousState,
        after: null,
        transitionChangeCount: previousState.transitions.length,
      });
      previousState.transitions.forEach((transition) => {
        transitionChanges.push(makeRemovedTransitionChange(stateName, transition));
      });
      return;
    }

    const previousTransitions = indexTransitions(previousState);
    const nextTransitions = indexTransitions(nextState);
    const stateTransitionChanges = [];
    const allTransitionKeys = new Set([...previousTransitions.keys(), ...nextTransitions.keys()]);

    allTransitionKeys.forEach((transitionKey) => {
      const before = previousTransitions.get(transitionKey);
      const after = nextTransitions.get(transitionKey);

      if (!before && after) {
        stateTransitionChanges.push(makeAddedTransitionChange(stateName, after, transitionKey));
        return;
      }

      if (before && !after) {
        stateTransitionChanges.push(makeRemovedTransitionChange(stateName, before, transitionKey));
        return;
      }

      const changedFields = getChangedFields(before, after);
      if (changedFields.length) {
        stateTransitionChanges.push({
          type: `changed-${changedFields[0]}`,
          stateName,
          transitionKey,
          before,
          after,
          changedFields,
          beforeRowNumber: before.rowNumber,
          afterRowNumber: after.rowNumber,
        });
      }
    });

    if (stateTransitionChanges.length) {
      stateChanges.push({
        type: 'changed',
        stateName,
        before: previousState,
        after: nextState,
        transitionChangeCount: stateTransitionChanges.length,
      });
      transitionChanges.push(...stateTransitionChanges);
    }
  });

  const summary = buildSummary(stateChanges, transitionChanges);

  return {
    previousFileName: previousData.fileName,
    nextFileName: nextData.fileName,
    summary,
    stateChanges,
    transitionChanges,
  };
}

export function makeTransitionComparisonKey(transition) {
  const state = normalizeKey(transition?.from ?? transition?.sheetName ?? '');
  const conditions = normalizeConditions(transition?.conditions);
  return `${state}|${conditions}`;
}

export function getComparisonFieldLabel(field) {
  return FIELD_LABELS[field] ?? field;
}

function indexStates(states = []) {
  return new Map(states.map((state) => [normalizeKey(state.sheetName), state]));
}

function indexTransitions(state) {
  const counts = new Map();
  const index = new Map();

  state.transitions.forEach((transition) => {
    const baseKey = makeTransitionComparisonKey(transition);
    const occurrence = counts.get(baseKey) ?? 0;
    counts.set(baseKey, occurrence + 1);
    const transitionKey = occurrence ? `${baseKey}#${occurrence + 1}` : baseKey;
    index.set(transitionKey, transition);
  });

  return index;
}

function makeAddedTransitionChange(stateName, transition, transitionKey = makeTransitionComparisonKey(transition)) {
  return {
    type: 'added',
    stateName,
    transitionKey,
    before: null,
    after: transition,
    changedFields: ['destination', 'prompt', 'bi', 'conditions', 'observation'],
    beforeRowNumber: null,
    afterRowNumber: transition.rowNumber,
  };
}

function makeRemovedTransitionChange(stateName, transition, transitionKey = makeTransitionComparisonKey(transition)) {
  return {
    type: 'removed',
    stateName,
    transitionKey,
    before: transition,
    after: null,
    changedFields: ['destination', 'prompt', 'bi', 'conditions', 'observation'],
    beforeRowNumber: transition.rowNumber,
    afterRowNumber: null,
  };
}

function getChangedFields(before, after) {
  const changes = [];

  if (normalizeValue(before.to) !== normalizeValue(after.to)) changes.push('destination');
  if (normalizeValue(before.prompt) !== normalizeValue(after.prompt)) changes.push('prompt');
  if (normalizeBi(before) !== normalizeBi(after)) changes.push('bi');
  if (normalizeConditions(before.conditions) !== normalizeConditions(after.conditions)) changes.push('conditions');
  if (normalizeValue(before.observation) !== normalizeValue(after.observation)) changes.push('observation');

  return FIELD_PRIORITY.filter((field) => changes.includes(field));
}

function normalizeValue(value) {
  return normalizeKey(String(value ?? '').trim());
}

function normalizeBi(transition) {
  return normalizeKey([
    transition?.biCode,
    transition?.biDescription,
    transition?.bi,
  ].filter(Boolean).join(' '));
}

function normalizeConditions(conditions = []) {
  return conditions.map((condition) => normalizeValue(condition)).join('>');
}

function buildSummary(stateChanges, transitionChanges) {
  const summary = {
    addedStates: stateChanges.filter((change) => change.type === 'added').length,
    removedStates: stateChanges.filter((change) => change.type === 'removed').length,
    changedStates: stateChanges.filter((change) => change.type === 'changed').length,
    addedTransitions: transitionChanges.filter((change) => change.type === 'added').length,
    removedTransitions: transitionChanges.filter((change) => change.type === 'removed').length,
    changedTransitions: transitionChanges.filter((change) => change.type.startsWith('changed-')).length,
    changedDestination: 0,
    changedPrompt: 0,
    changedBi: 0,
    changedConditions: 0,
    changedObservation: 0,
    totalChanges: transitionChanges.length + stateChanges.filter((change) => change.type !== 'changed').length,
  };

  transitionChanges.forEach((change) => {
    if (change.changedFields.includes('destination')) summary.changedDestination += 1;
    if (change.changedFields.includes('prompt')) summary.changedPrompt += 1;
    if (change.changedFields.includes('bi')) summary.changedBi += 1;
    if (change.changedFields.includes('conditions')) summary.changedConditions += 1;
    if (change.changedFields.includes('observation')) summary.changedObservation += 1;
  });

  return summary;
}

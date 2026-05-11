import { normalizeKey, normalizeText } from './normalizeText.js';

export function classifyDestination(destination, sheetNames = [], currentState = '') {
  const cleaned = normalizeText(destination);
  if (!cleaned) return 'empty';

  const key = normalizeKey(cleaned);
  if (key === 'mesmo estado' || key === 'mesmoestado' || key === 'nesse mesmo estado' || key === 'neste mesmo estado') {
    return 'self';
  }
  if (key === normalizeKey(currentState)) return 'self';
  if (key === 'tchau') return 'terminal';
  if (key.includes('transfer')) return 'transfer';

  const sheetSet = new Set(sheetNames.map((name) => normalizeKey(name)));
  if (sheetSet.has(key)) return 'state';

  return 'unknown';
}

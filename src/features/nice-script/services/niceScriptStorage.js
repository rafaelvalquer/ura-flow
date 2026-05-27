import { CLONES_STORAGE_KEY, DRAFT_STORAGE_KEY } from '../constants/niceScriptConstants.js';

export function readStoredScript() {
  try {
    const raw = localStorage.getItem(DRAFT_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return parsed?.actions?.length ? parsed : null;
  } catch {
    return null;
  }
}

export function readClonedTemplates() {
  try {
    const raw = localStorage.getItem(CLONES_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((item) => item?.actions?.length) : [];
  } catch {
    return [];
  }
}

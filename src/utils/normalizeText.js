export function normalizeText(value = '') {
  return String(value ?? '')
    .replace(/\s+/g, ' ')
    .trim();
}

export function normalizeKey(value = '') {
  return normalizeText(value)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

export function makeId(value = '') {
  const normalized = normalizeText(value).replace(/[^A-Za-z0-9_-]+/g, '-');
  return normalized.replace(/^-+|-+$/g, '') || 'item';
}

export function shortenLabel(value = '', max = 68) {
  const text = normalizeText(value);
  if (text.length <= max) return text;
  return `${text.slice(0, max - 3).trim()}...`;
}

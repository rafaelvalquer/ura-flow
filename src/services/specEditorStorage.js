const INDEX_KEY = 'ura-flow:spec-editor-beta:index:v1';
const PROJECT_PREFIX = 'ura-flow:spec-editor-beta:project:';

export function listStoredSpecProjects() {
  try {
    const parsed = JSON.parse(localStorage.getItem(INDEX_KEY) || '[]');
    return Array.isArray(parsed)
      ? parsed.sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt)))
      : [];
  } catch {
    return [];
  }
}

export function loadStoredSpecProject(projectId) {
  try {
    const raw = localStorage.getItem(projectKey(projectId));
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function saveStoredSpecProject(project) {
  if (!project?.id) throw new Error('Projeto sem identificador.');
  const snapshot = {
    ...project,
    updatedAt: new Date().toISOString(),
  };

  try {
    localStorage.setItem(projectKey(project.id), JSON.stringify(snapshot));
    const index = listStoredSpecProjects().filter((item) => item.id !== project.id);
    index.unshift({
      id: snapshot.id,
      name: snapshot.name,
      sourceFileName: snapshot.sourceFileName,
      updatedAt: snapshot.updatedAt,
      stateCount: snapshot.states?.length ?? 0,
    });
    localStorage.setItem(INDEX_KEY, JSON.stringify(index.slice(0, 30)));
    return snapshot;
  } catch (error) {
    const storageError = new Error(
      error?.name === 'QuotaExceededError'
        ? 'O armazenamento local do navegador atingiu o limite. Exporte um backup JSON antes de continuar.'
        : 'Não foi possível salvar o projeto no armazenamento local.',
    );
    storageError.cause = error;
    throw storageError;
  }
}

export function deleteStoredSpecProject(projectId) {
  try {
    localStorage.removeItem(projectKey(projectId));
    const index = listStoredSpecProjects().filter((item) => item.id !== projectId);
    localStorage.setItem(INDEX_KEY, JSON.stringify(index));
  } catch {
    // A exclusão local é uma operação de melhor esforço.
  }
}

export function exportSpecProjectBackup(project) {
  const payload = {
    format: 'ura-flow-spec-editor-beta',
    schemaVersion: 1,
    exportedAt: new Date().toISOString(),
    project,
  };
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = `${safeFileName(project?.name || 'ura-spec')}-backup.json`;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

export async function importSpecProjectBackup(file) {
  const text = await file.text();
  let payload;
  try {
    payload = JSON.parse(text);
  } catch {
    throw new Error('O arquivo selecionado não contém um JSON válido.');
  }

  const project = payload?.project ?? payload;
  if (!project?.id || !Array.isArray(project.states)) {
    throw new Error('O arquivo não possui a estrutura de um projeto do Editor Beta.');
  }
  if (Number(project.schemaVersion || payload.schemaVersion || 1) > 1) {
    throw new Error('O backup foi criado por uma versão mais recente do Editor Beta.');
  }
  return project;
}

function projectKey(projectId) {
  return `${PROJECT_PREFIX}${projectId}:v1`;
}

function safeFileName(value) {
  return String(value || 'ura-spec')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9_-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .toLowerCase();
}

const LAST_PROJECT_KEY = 'ura-flow:spec-editor-beta:last-opened:v1';

export function getLastOpenedSpecProjectId() {
  try {
    return localStorage.getItem(LAST_PROJECT_KEY) || '';
  } catch {
    return '';
  }
}

export function setLastOpenedSpecProjectId(projectId) {
  try {
    if (projectId) localStorage.setItem(LAST_PROJECT_KEY, projectId);
    else localStorage.removeItem(LAST_PROJECT_KEY);
  } catch {
    // Persistência de conveniência; não bloqueia o editor.
  }
}

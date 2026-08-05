#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const packageRoot = path.dirname(fileURLToPath(import.meta.url));
const targetRoot = path.resolve(process.argv[2] || process.cwd());
const sourcePayload = path.join(packageRoot, 'src');
const targetSource = path.join(targetRoot, 'src');
const appPath = path.join(targetSource, 'App.jsx');

if (!fs.existsSync(appPath)) {
  console.error(`Não encontrei src/App.jsx em: ${targetRoot}`);
  console.error('Execute o instalador na raiz do ura-flow ou informe o caminho como argumento.');
  process.exit(1);
}

if (path.resolve(sourcePayload) !== path.resolve(targetSource)) {
  fs.cpSync(sourcePayload, targetSource, { recursive: true, force: true });
}

let app = fs.readFileSync(appPath, 'utf8');
const backupPath = `${appPath}.before-spec-editor-beta.bak`;
if (!fs.existsSync(backupPath)) fs.writeFileSync(backupPath, app, 'utf8');

app = insertImport(app);
app = patchShellClass(app);
app = patchWorkspaceRendering(app);
app = patchWorkspaceSwitch(app);

fs.writeFileSync(appPath, app, 'utf8');

console.log('Editor Beta instalado com sucesso.');
console.log(`Backup do App.jsx: ${path.relative(targetRoot, backupPath)}`);
console.log('Execute: npm install && npm run dev');

function insertImport(source) {
  const importLine = 'import SpecEditorWorkspace from "./components/spec-editor/SpecEditorWorkspace.jsx";';
  if (source.includes(importLine)) return source;

  const marker = 'import SpecNiceComparisonModal from "./components/SpecNiceComparisonModal";';
  if (!source.includes(marker)) {
    throw new Error('Ponto de integração não encontrado: importação de SpecNiceComparisonModal.');
  }
  return source.replace(marker, `${marker}\n${importLine}`);
}

function patchShellClass(source) {
  if (source.includes('"editor-workspace-shell"')) return source;
  const current = '<div className={`app-shell ${workspaceMode === "spec" ? "spec-workspace-shell" : "nice-workspace-shell"}`}>'.trim();
  const next = '<div className={`app-shell ${workspaceMode === "spec" ? "spec-workspace-shell" : workspaceMode === "nice" ? "nice-workspace-shell" : "editor-workspace-shell"}`}>'.trim();
  if (!source.includes(current)) {
    throw new Error('Ponto de integração não encontrado: classe principal do workspace.');
  }
  return source.replace(current, next);
}

function patchWorkspaceRendering(source) {
  if (source.includes('<SpecEditorWorkspace initialParsedData={parsedData} />')) return source;
  const current = `{workspaceMode === "nice" ? (\n          <NiceScriptWorkspace />\n        ) : (`;
  const next = `{workspaceMode === "nice" ? (\n          <NiceScriptWorkspace />\n        ) : workspaceMode === "editor" ? (\n          <SpecEditorWorkspace initialParsedData={parsedData} />\n        ) : (`;
  if (!source.includes(current)) {
    throw new Error('Ponto de integração não encontrado: renderização do workspace NICE.');
  }
  return source.replace(current, next);
}

function patchWorkspaceSwitch(source) {
  if (source.includes('onClick={() => onChange("editor")}')) return source;
  const niceButton = `      <button\n        type="button"\n        className={workspaceMode === "nice" ? "active" : ""}\n        onClick={() => onChange("nice")}\n      >\n        Script NICE\n      </button>`;
  const editorButton = `      <button\n        type="button"\n        className={workspaceMode === "editor" ? "active" : ""}\n        onClick={() => onChange("editor")}\n      >\n        Editor Beta\n      </button>\n`;
  if (!source.includes(niceButton)) {
    throw new Error('Ponto de integração não encontrado: botão Script NICE.');
  }
  return source.replace(niceButton, `${editorButton}${niceButton}`);
}

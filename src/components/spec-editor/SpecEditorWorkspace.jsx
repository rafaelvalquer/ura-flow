import { useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  ChevronLeft,
  Copy,
  Download,
  FileJson,
  FileSpreadsheet,
  FolderOpen,
  GitBranch,
  Plus,
  RefreshCw,
  Save,
  Search,
  Table2,
  Trash2,
  Upload,
  Volume2,
  Workflow,
  X,
} from 'lucide-react';
import LoadingOverlay from '../LoadingOverlay.jsx';
import FlowCanvas from '../FlowCanvas.jsx';
import { parseExcelFile } from '../../services/excelParserClient.js';
import { buildFlow } from '../../services/flowBuilder.js';
import {
  addAudioToState,
  addChildRuleToState,
  addRootRuleToState,
  addState,
  collectRuleIds,
  createEmptyProject,
  createProjectFromParsedData,
  deleteAudioInState,
  deleteRuleInState,
  deleteState,
  duplicateRuleInState,
  duplicateState,
  indentRuleInState,
  moveRuleInState,
  normalizeKey,
  outdentRuleInState,
  projectToParsedData,
  renameState,
  updateAudioInState,
  updateRuleInState,
  updateState,
  validateProject,
} from '../../services/specEditorProject.js';
import {
  deleteStoredSpecProject,
  exportSpecProjectBackup,
  getLastOpenedSpecProjectId,
  importSpecProjectBackup,
  listStoredSpecProjects,
  loadStoredSpecProject,
  saveStoredSpecProject,
  setLastOpenedSpecProjectId,
} from '../../services/specEditorStorage.js';
import SpecRuleTable from './SpecRuleTable.jsx';
import SpecAudioTable from './SpecAudioTable.jsx';
import SpecDiagnosticsPanel from './SpecDiagnosticsPanel.jsx';
import '../../styles/spec-editor.css';

const EMPTY_PROGRESS = {
  percent: 0,
  stage: '',
  sheetName: '',
  currentSheet: 0,
  totalSheets: 0,
};

export default function SpecEditorWorkspace({ initialParsedData = null }) {
  const [project, setProject] = useState(null);
  const [selectedStateId, setSelectedStateId] = useState('');
  const [activeTab, setActiveTab] = useState('rules');
  const [stateSearch, setStateSearch] = useState('');
  const [expandedRuleIds, setExpandedRuleIds] = useState(() => new Set());
  const [recentProjects, setRecentProjects] = useState([]);
  const [saveStatus, setSaveStatus] = useState('saved');
  const [storageError, setStorageError] = useState('');
  const [notice, setNotice] = useState('');
  const [isLoading, setLoading] = useState(false);
  const [loadingFileName, setLoadingFileName] = useState('');
  const [loadingProgress, setLoadingProgress] = useState(EMPTY_PROGRESS);
  const [flowSelection, setFlowSelection] = useState(null);
  const [layoutVersion, setLayoutVersion] = useState(0);
  const excelInputRef = useRef(null);
  const backupInputRef = useRef(null);
  const saveTimerRef = useRef(null);
  const noticeTimerRef = useRef(null);

  useEffect(() => {
    const projects = listStoredSpecProjects();
    setRecentProjects(projects);
    const lastProjectId = getLastOpenedSpecProjectId();
    if (!lastProjectId) return;
    const stored = loadStoredSpecProject(lastProjectId);
    if (stored) openProject(stored);
  }, []);

  useEffect(() => {
    if (!project) return undefined;
    setSaveStatus('saving');
    setStorageError('');
    window.clearTimeout(saveTimerRef.current);
    saveTimerRef.current = window.setTimeout(() => {
      try {
        const saved = saveStoredSpecProject(project);
        setSaveStatus('saved');
        setLastOpenedSpecProjectId(saved.id);
        setRecentProjects(listStoredSpecProjects());
      } catch (error) {
        setSaveStatus('error');
        setStorageError(error.message);
      }
    }, 700);

    return () => window.clearTimeout(saveTimerRef.current);
  }, [project]);

  useEffect(() => () => {
    window.clearTimeout(saveTimerRef.current);
    window.clearTimeout(noticeTimerRef.current);
  }, []);

  useEffect(() => {
    function handleShortcut(event) {
      if (!(event.ctrlKey || event.metaKey)) return;
      if (event.key.toLowerCase() === 's') {
        event.preventDefault();
        forceSave();
      }
    }
    window.addEventListener('keydown', handleShortcut);
    return () => window.removeEventListener('keydown', handleShortcut);
  });

  const selectedState = useMemo(
    () => project?.states?.find((state) => state.id === selectedStateId) ?? project?.states?.[0] ?? null,
    [project, selectedStateId],
  );

  const validation = useMemo(() => validateProject(project), [project]);

  const flowData = useMemo(
    () => (project && activeTab === 'flow' ? projectToParsedData(project) : null),
    [project, activeTab],
  );

  const flowGraph = useMemo(() => {
    if (!flowData || !selectedState || activeTab !== 'flow') return { nodes: [], edges: [] };
    return buildFlow(flowData, selectedState.name, 'detailedView', {
      showBiMarkings: true,
      showChangeColors: false,
    });
  }, [flowData, selectedState, activeTab]);

  if (!project) {
    return (
      <SpecEditorHome
        recentProjects={recentProjects}
        initialParsedData={initialParsedData}
        isLoading={isLoading}
        error={storageError}
        onExcelFile={(file) => importExcel(file)}
        onUseLoadedSpec={() => importParsedData(initialParsedData)}
        onOpenProject={(projectId) => {
          const stored = loadStoredSpecProject(projectId);
          if (stored) openProject(stored);
        }}
        onDeleteProject={(projectId) => {
          deleteStoredSpecProject(projectId);
          setRecentProjects(listStoredSpecProjects());
        }}
        onNewProject={() => openProject(createEmptyProject())}
        onImportBackup={() => backupInputRef.current?.click()}
        excelInputRef={excelInputRef}
        backupInputRef={backupInputRef}
        onBackupFile={(file) => importBackup(file)}
      />
    );
  }

  const filteredStates = project.states.filter((state) => normalizeKey(state.name).includes(normalizeKey(stateSearch)));
  const selectedStateIssues = validation.issues.filter((issue) => issue.stateId === selectedState?.id);

  return (
    <div className="spec-editor-workspace">
      {isLoading && (
        <LoadingOverlay
          fileName={loadingFileName}
          progress={loadingProgress}
          title="Importando SPEC para o Editor Beta"
        />
      )}

      <input
        ref={excelInputRef}
        className="sr-only"
        type="file"
        accept=".xlsx,.xls,.xlsm"
        onChange={(event) => {
          const file = event.target.files?.[0];
          event.target.value = '';
          if (file) importExcel(file);
        }}
      />
      <input
        ref={backupInputRef}
        className="sr-only"
        type="file"
        accept=".json,application/json"
        onChange={(event) => {
          const file = event.target.files?.[0];
          event.target.value = '';
          if (file) importBackup(file);
        }}
      />

      <header className="spec-editor-header">
        <div className="spec-editor-header-context">
          <button type="button" className="spec-editor-icon-button" title="Voltar aos projetos locais" onClick={closeProject}>
            <ChevronLeft size={18} />
          </button>
          <div className="spec-editor-project-title">
            <span className="spec-editor-eyebrow">Editor oficial de documentação · Beta local</span>
            <input
              value={project.name}
              aria-label="Nome do projeto"
              onChange={(event) => setProject((current) => ({ ...current, name: event.target.value }))}
            />
            <small>{project.sourceFileName || 'Projeto criado sem arquivo de origem'} · {project.states.length} estados</small>
          </div>
          <SaveStatus status={saveStatus} />
        </div>

        <div className="spec-editor-header-actions">
          <button type="button" className="spec-editor-secondary-button" onClick={() => excelInputRef.current?.click()}>
            <Upload size={16} /> Importar outra SPEC
          </button>
          <button type="button" className="spec-editor-secondary-button" onClick={() => backupInputRef.current?.click()}>
            <FolderOpen size={16} /> Restaurar JSON
          </button>
          <button type="button" className="spec-editor-secondary-button" onClick={() => exportSpecProjectBackup(project)}>
            <Download size={16} /> Backup JSON
          </button>
          <button type="button" className="spec-editor-primary-button" onClick={forceSave}>
            <Save size={16} /> Salvar local
          </button>
        </div>
      </header>

      {storageError && (
        <div className="spec-editor-global-alert is-error">
          <AlertTriangle size={17} />
          <span>{storageError}</span>
          <button type="button" onClick={() => setStorageError('')}><X size={15} /></button>
        </div>
      )}
      {notice && (
        <div className="spec-editor-global-alert is-success">
          <CheckCircle2 size={17} />
          <span>{notice}</span>
        </div>
      )}

      <div className="spec-editor-layout">
        <aside className="spec-editor-state-sidebar">
          <div className="spec-editor-sidebar-heading">
            <div>
              <span className="spec-editor-eyebrow">Navegação</span>
              <h2>Estados da URA</h2>
            </div>
            <button type="button" className="spec-editor-icon-button" title="Adicionar estado" onClick={handleAddState}>
              <Plus size={17} />
            </button>
          </div>

          <label className="spec-editor-search-field">
            <Search size={15} />
            <input value={stateSearch} placeholder="Buscar estado" onChange={(event) => setStateSearch(event.target.value)} />
          </label>

          <div className="spec-editor-state-list">
            {filteredStates.map((state) => {
              const issueCount = validation.issues.filter((issue) => issue.stateId === state.id && issue.severity !== 'info').length;
              return (
                <button
                  type="button"
                  key={state.id}
                  className={`spec-editor-state-item ${state.id === selectedState?.id ? 'is-selected' : ''}`}
                  onClick={() => selectState(state.id)}
                >
                  <span className="spec-editor-state-name">{state.name}</span>
                  <span className="spec-editor-state-meta">
                    <span>{countRules(state.rules)} regras</span>
                    {state.metadata?.modified && <em>alterado</em>}
                    {issueCount > 0 && <b>{issueCount}</b>}
                  </span>
                </button>
              );
            })}
          </div>

          <footer className="spec-editor-sidebar-footer">
            <button type="button" onClick={handleDuplicateState} disabled={!selectedState}>
              <Copy size={15} /> Duplicar estado
            </button>
            <button type="button" className="is-danger" onClick={handleDeleteState} disabled={project.states.length <= 1}>
              <Trash2 size={15} /> Excluir estado
            </button>
          </footer>
        </aside>

        <main className="spec-editor-main">
          <section className="spec-editor-state-header">
            <div>
              <span className="spec-editor-eyebrow">Estado selecionado</span>
              <EditableStateName
                key={selectedState?.id}
                value={selectedState?.name || ''}
                onCommit={(name) => setProject((current) => renameState(current, selectedState.id, name))}
              />
              <p>
                {selectedStateIssues.length
                  ? `${selectedStateIssues.length} apontamento(s) neste estado.`
                  : 'Nenhum apontamento neste estado.'}
              </p>
            </div>
            <nav className="spec-editor-tabs" aria-label="Visualizações do Editor Beta">
              <button type="button" className={activeTab === 'rules' ? 'is-active' : ''} onClick={() => setActiveTab('rules')}>
                <Table2 size={16} /> Regras
              </button>
              <button type="button" className={activeTab === 'flow' ? 'is-active' : ''} onClick={() => setActiveTab('flow')}>
                <Workflow size={16} /> Fluxo
              </button>
              <button type="button" className={activeTab === 'audio' ? 'is-active' : ''} onClick={() => setActiveTab('audio')}>
                <Volume2 size={16} /> Áudios
              </button>
            </nav>
          </section>

          {activeTab === 'rules' && selectedState && (
            <section className="spec-editor-rules-panel">
              <header className="spec-editor-panel-toolbar">
                <div>
                  <strong>Regras de negócio</strong>
                  <span>Expanda as linhas para visualizar os IFs, ELSEs e resultados amarrados.</span>
                </div>
                <div>
                  <button type="button" className="spec-editor-secondary-button" onClick={() => expandAllRules(selectedState)}>
                    Expandir tudo
                  </button>
                  <button type="button" className="spec-editor-secondary-button" onClick={() => setExpandedRuleIds(new Set())}>
                    Recolher tudo
                  </button>
                  <button type="button" className="spec-editor-secondary-button" onClick={() => handleAddRootRule('ACTION')}>
                    <GitBranch size={15} /> Adicionar ação
                  </button>
                  <button type="button" className="spec-editor-primary-button" onClick={() => handleAddRootRule('IF')}>
                    <Plus size={15} /> Adicionar condição
                  </button>
                </div>
              </header>

              <SpecRuleTable
                state={selectedState}
                stateNames={project.stateNames}
                expandedRuleIds={expandedRuleIds}
                onToggleExpanded={toggleExpandedRule}
                onExpandRule={(ruleId) => setExpandedRuleIds((current) => new Set([...current, ruleId]))}
                onUpdateRule={(ruleId, patch) => setProject((current) => updateRuleInState(current, selectedState.id, ruleId, patch))}
                onAddChild={(ruleId) => setProject((current) => addChildRuleToState(current, selectedState.id, ruleId).project)}
                onDuplicate={(ruleId) => setProject((current) => duplicateRuleInState(current, selectedState.id, ruleId))}
                onDelete={(ruleId) => handleDeleteRule(ruleId)}
                onMove={(ruleId, direction) => setProject((current) => moveRuleInState(current, selectedState.id, ruleId, direction))}
                onIndent={(ruleId) => setProject((current) => indentRuleInState(current, selectedState.id, ruleId))}
                onOutdent={(ruleId) => setProject((current) => outdentRuleInState(current, selectedState.id, ruleId))}
                onNavigateToState={navigateToStateName}
              />
            </section>
          )}

          {activeTab === 'audio' && selectedState && (
            <SpecAudioTable
              state={selectedState}
              onAdd={() => setProject((current) => addAudioToState(current, selectedState.id).project)}
              onUpdate={(audioId, patch) => setProject((current) => updateAudioInState(current, selectedState.id, audioId, patch))}
              onDelete={(audioId) => {
                if (window.confirm('Excluir este prompt do catálogo?')) {
                  setProject((current) => deleteAudioInState(current, selectedState.id, audioId));
                }
              }}
            />
          )}

          {activeTab === 'flow' && selectedState && (
            <section className="spec-editor-flow-panel">
              <header className="spec-editor-panel-toolbar">
                <div>
                  <strong>Fluxo derivado das regras editáveis</strong>
                  <span>As conexões são recalculadas a partir da tabela, sem criar uma segunda fonte de dados.</span>
                </div>
                <button type="button" className="spec-editor-secondary-button" onClick={() => setLayoutVersion((value) => value + 1)}>
                  <RefreshCw size={15} /> Organizar
                </button>
              </header>
              <div className="spec-editor-flow-canvas">
                <FlowCanvas
                  nodes={flowGraph.nodes}
                  edges={flowGraph.edges}
                  layoutVersion={layoutVersion}
                  focusRequest={null}
                  selection={flowSelection}
                  showBreadcrumb
                  onSelectionChange={setFlowSelection}
                  onNodePositionsChange={() => {}}
                  onNavigateToState={navigateToStateName}
                />
              </div>
              {flowSelection && <FlowSelectionSummary selection={flowSelection} />}
            </section>
          )}
        </main>

        <SpecDiagnosticsPanel
          validation={validation}
          project={project}
          selectedStateId={selectedState?.id}
          onOpenIssue={(issue) => {
            if (issue.stateId) selectState(issue.stateId);
            setActiveTab(issue.audioId ? 'audio' : 'rules');
            const state = project.states.find((item) => item.id === issue.stateId);
            if (state) expandAllRules(state);
          }}
        />
      </div>
    </div>
  );

  function openProject(nextProject) {
    if (!nextProject) return;
    setProject(nextProject);
    const firstState = nextProject.states?.[0];
    setSelectedStateId(firstState?.id || '');
    setExpandedRuleIds(new Set(collectRuleIds(firstState?.rules ?? [])));
    setActiveTab('rules');
    setStateSearch('');
    setFlowSelection(null);
    setLastOpenedSpecProjectId(nextProject.id);
    setStorageError('');
  }

  function closeProject() {
    forceSave();
    setProject(null);
    setSelectedStateId('');
    setLastOpenedSpecProjectId('');
    setRecentProjects(listStoredSpecProjects());
  }

  async function importExcel(file) {
    setLoading(true);
    setLoadingFileName(file.name);
    setLoadingProgress({ ...EMPTY_PROGRESS, stage: 'Lendo arquivo' });
    setStorageError('');
    try {
      const parsed = await parseExcelFile(file, setLoadingProgress);
      importParsedData(parsed, file.name);
    } catch (error) {
      setStorageError(error?.message || 'Não foi possível importar a SPEC.');
    } finally {
      setLoading(false);
      setLoadingFileName('');
      setLoadingProgress(EMPTY_PROGRESS);
    }
  }

  function importParsedData(parsedData, sourceFileName) {
    if (!parsedData?.states?.length) {
      setStorageError('A SPEC não possui estados reconhecidos pelo leitor atual.');
      return;
    }
    const imported = createProjectFromParsedData(parsedData, { sourceFileName: sourceFileName || parsedData.fileName });
    openProject(imported);
    showNotice(`${imported.states.length} estados importados para o Editor Beta.`);
  }

  async function importBackup(file) {
    setLoading(true);
    setLoadingFileName(file.name);
    setLoadingProgress({ ...EMPTY_PROGRESS, percent: 50, stage: 'Restaurando backup JSON' });
    try {
      const restored = await importSpecProjectBackup(file);
      openProject(restored);
      showNotice('Backup restaurado com sucesso.');
    } catch (error) {
      setStorageError(error?.message || 'Não foi possível restaurar o backup.');
    } finally {
      setLoading(false);
      setLoadingFileName('');
      setLoadingProgress(EMPTY_PROGRESS);
    }
  }

  function forceSave() {
    if (!project) return;
    window.clearTimeout(saveTimerRef.current);
    try {
      saveStoredSpecProject(project);
      setSaveStatus('saved');
      setStorageError('');
      setRecentProjects(listStoredSpecProjects());
      showNotice('Projeto salvo no navegador.');
    } catch (error) {
      setSaveStatus('error');
      setStorageError(error.message);
    }
  }

  function selectState(stateId) {
    const state = project.states.find((item) => item.id === stateId);
    if (!state) return;
    setSelectedStateId(state.id);
    setExpandedRuleIds(new Set(collectRuleIds(state.rules)));
    setFlowSelection(null);
  }

  function navigateToStateName(stateName) {
    const state = project.states.find((item) => normalizeKey(item.name) === normalizeKey(stateName));
    if (!state) return;
    selectState(state.id);
  }

  function handleAddState() {
    const result = addState(project);
    setProject(result.project);
    setSelectedStateId(result.state.id);
    setExpandedRuleIds(new Set(collectRuleIds(result.state.rules)));
    setFlowSelection(null);
  }

  function handleDuplicateState() {
    if (!selectedState) return;
    const result = duplicateState(project, selectedState.id);
    setProject(result.project);
    if (result.state) {
      setSelectedStateId(result.state.id);
      setExpandedRuleIds(new Set(collectRuleIds(result.state.rules)));
      setFlowSelection(null);
    }
  }

  function handleDeleteState() {
    if (!selectedState || project.states.length <= 1) return;
    if (!window.confirm(`Excluir o estado ${selectedState.name}? As referências para ele serão marcadas como inválidas.`)) return;
    const currentIndex = project.states.findIndex((state) => state.id === selectedState.id);
    const nextProject = deleteState(project, selectedState.id);
    const fallback = nextProject.states[Math.max(0, currentIndex - 1)] ?? nextProject.states[0];
    setProject(nextProject);
    if (fallback) {
      setSelectedStateId(fallback.id);
      setExpandedRuleIds(new Set(collectRuleIds(fallback.rules)));
      setFlowSelection(null);
    }
  }

  function handleAddRootRule(branchType) {
    setProject((current) => addRootRuleToState(current, selectedState.id, branchType).project);
  }

  function handleDeleteRule(ruleId) {
    if (!window.confirm('Excluir esta regra e todas as regras filhas?')) return;
    setProject((current) => deleteRuleInState(current, selectedState.id, ruleId));
  }

  function toggleExpandedRule(ruleId) {
    setExpandedRuleIds((current) => {
      const next = new Set(current);
      if (next.has(ruleId)) next.delete(ruleId);
      else next.add(ruleId);
      return next;
    });
  }

  function expandAllRules(state) {
    setExpandedRuleIds(new Set(collectRuleIds(state?.rules ?? [])));
  }

  function showNotice(message) {
    setNotice(message);
    window.clearTimeout(noticeTimerRef.current);
    noticeTimerRef.current = window.setTimeout(() => setNotice(''), 2800);
  }
}

function SpecEditorHome({
  recentProjects,
  initialParsedData,
  isLoading,
  error,
  onExcelFile,
  onUseLoadedSpec,
  onOpenProject,
  onDeleteProject,
  onNewProject,
  onImportBackup,
  excelInputRef,
  backupInputRef,
  onBackupFile,
}) {
  const [isDragging, setDragging] = useState(false);

  return (
    <div className="spec-editor-home">
      <input
        ref={excelInputRef}
        className="sr-only"
        type="file"
        accept=".xlsx,.xls,.xlsm"
        onChange={(event) => {
          const file = event.target.files?.[0];
          event.target.value = '';
          if (file) onExcelFile(file);
        }}
      />
      <input
        ref={backupInputRef}
        className="sr-only"
        type="file"
        accept=".json,application/json"
        onChange={(event) => {
          const file = event.target.files?.[0];
          event.target.value = '';
          if (file) onBackupFile(file);
        }}
      />

      {isLoading && <div className="spec-editor-home-loading">Processando arquivo...</div>}

      <section className="spec-editor-home-hero">
        <div className="spec-editor-home-copy">
          <span className="spec-editor-eyebrow">Nova aba · persistência local</span>
          <h1>Editor Beta de SPECs de URA</h1>
          <p>
            Importe a planilha, edite as regras em linhas hierárquicas, navegue pelos estados como hyperlinks e mantenha o projeto salvo no navegador.
          </p>
          <div className="spec-editor-home-actions">
            <button type="button" className="spec-editor-primary-button" onClick={() => excelInputRef.current?.click()}>
              <FileSpreadsheet size={17} /> Importar SPEC Excel
            </button>
            <button type="button" className="spec-editor-secondary-button" onClick={onNewProject}>
              <Plus size={17} /> Projeto vazio
            </button>
            <button type="button" className="spec-editor-secondary-button" onClick={onImportBackup}>
              <FileJson size={17} /> Restaurar backup
            </button>
          </div>
          {initialParsedData?.states?.length > 0 && (
            <button type="button" className="spec-editor-loaded-spec-button" onClick={onUseLoadedSpec}>
              <Workflow size={17} />
              <span>
                <strong>Usar a SPEC já aberta na aba “Spec Excel”</strong>
                <small>{initialParsedData.fileName} · {initialParsedData.states.length} estados reconhecidos</small>
              </span>
            </button>
          )}
          {error && <div className="spec-editor-home-error"><AlertTriangle size={17} /> {error}</div>}
        </div>

        <div
          className={`spec-editor-drop-zone ${isDragging ? 'is-dragging' : ''}`}
          onDragOver={(event) => { event.preventDefault(); setDragging(true); }}
          onDragLeave={() => setDragging(false)}
          onDrop={(event) => {
            event.preventDefault();
            setDragging(false);
            const file = event.dataTransfer.files?.[0];
            if (file) onExcelFile(file);
          }}
        >
          <Upload size={34} />
          <strong>Arraste a SPEC para esta área</strong>
          <span>Arquivos XLSX, XLS ou XLSM. O processamento ocorre somente no navegador.</span>
        </div>
      </section>

      <section className="spec-editor-recent-section">
        <header>
          <div>
            <span className="spec-editor-eyebrow">LocalStorage</span>
            <h2>Projetos recentes</h2>
          </div>
          <span>{recentProjects.length} projeto(s)</span>
        </header>

        <div className="spec-editor-recent-grid">
          {recentProjects.map((item) => (
            <article key={item.id} className="spec-editor-recent-card">
              <button type="button" className="spec-editor-recent-open" onClick={() => onOpenProject(item.id)}>
                <FileSpreadsheet size={21} />
                <span>
                  <strong>{item.name}</strong>
                  <small>{item.sourceFileName || 'Projeto local'} · {item.stateCount || 0} estados</small>
                  <time>{formatDateTime(item.updatedAt)}</time>
                </span>
              </button>
              <button
                type="button"
                className="spec-editor-icon-button is-danger"
                title="Excluir projeto local"
                onClick={() => {
                  if (window.confirm(`Excluir o projeto local “${item.name}”?`)) onDeleteProject(item.id);
                }}
              >
                <Trash2 size={15} />
              </button>
            </article>
          ))}
          {!recentProjects.length && (
            <div className="spec-editor-recent-empty">
              <FolderOpen size={26} />
              <strong>Nenhum projeto salvo neste navegador.</strong>
              <span>Importe uma SPEC para iniciar a primeira versão editável.</span>
            </div>
          )}
        </div>
      </section>
    </div>
  );
}

function SaveStatus({ status }) {
  if (status === 'saving') return <span className="spec-editor-save-status is-saving"><RefreshCw size={14} /> Salvando...</span>;
  if (status === 'error') return <span className="spec-editor-save-status is-error"><AlertTriangle size={14} /> Falha ao salvar</span>;
  return <span className="spec-editor-save-status is-saved"><CheckCircle2 size={14} /> Salvo localmente</span>;
}

function EditableStateName({ value, onCommit }) {
  const [draft, setDraft] = useState(value);
  return (
    <input
      className="spec-editor-state-name-input"
      value={draft}
      aria-label="Nome do estado"
      onChange={(event) => setDraft(event.target.value)}
      onBlur={() => onCommit(draft)}
      onKeyDown={(event) => {
        if (event.key === 'Enter') event.currentTarget.blur();
        if (event.key === 'Escape') {
          setDraft(value);
          event.currentTarget.blur();
        }
      }}
    />
  );
}

function FlowSelectionSummary({ selection }) {
  const data = selection?.data ?? {};
  const transition = data.transition ?? data.transitions?.[0];
  return (
    <div className="spec-editor-flow-selection">
      <strong>{selection.label || data.label || 'Item selecionado'}</strong>
      {transition && (
        <span>
          {transition.from} → {transition.to || 'sem destino'}
          {transition.prompt ? ` · ${transition.prompt}` : ''}
        </span>
      )}
    </div>
  );
}

function countRules(rules) {
  return (rules ?? []).reduce((total, rule) => total + 1 + countRules(rule.children), 0);
}

function formatDateTime(value) {
  if (!value) return 'Sem data';
  try {
    return new Intl.DateTimeFormat('pt-BR', {
      dateStyle: 'short',
      timeStyle: 'short',
    }).format(new Date(value));
  } catch {
    return value;
  }
}

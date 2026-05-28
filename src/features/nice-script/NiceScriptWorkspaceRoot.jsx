import { useEffect, useMemo, useRef, useState } from 'react';
import { ClipboardCopy, Copy, Database, FileCode2, FileInput, FileText, LayoutGrid, Menu, Milestone, Plus, Save, Trash2 } from 'lucide-react';
import NiceScriptCanvas from '../../components/NiceScriptCanvas.jsx';
import { cloneNiceScript, getNextActionId, makeBranch, NICE_ACTION_LABELS } from '../../services/niceScriptModel.js';
import { exportNiceClipboard } from '../../services/niceClipboardExporter.js';
import {
  DEFAULT_API_CONFIG,
  DEFAULT_MENU_CONFIG,
  DEFAULT_REST_API_CONFIG,
  makeApiDestination,
  makeApiTemplate,
  makeEntryTemplate,
  makeMenuOption,
  makeMenuSnippets,
  makeMenuTemplate,
  makeRestApiTemplate,
} from '../../services/niceTemplateFactory.js';
import { parseNiceXml } from '../../services/niceXmlParser.js';
import { validateNiceScript } from '../../services/niceValidator.js';
import { organizeNiceScript } from '../../services/niceLayout.js';
import { generateNiceDocumentation } from '../../services/niceDocumentationGenerator.js';
import { buildNiceDocumentationFlow } from '../../services/niceDocumentationFlowBuilder.js';
import { CLONES_STORAGE_KEY, DRAFT_STORAGE_KEY, MANUAL_ACTION_TYPES } from './constants/niceScriptConstants.js';
import { makeDefaultAction, sameBranch, upsertBranch } from './services/niceActionFactory.js';
import { readClonedTemplates, readStoredScript } from './services/niceScriptStorage.js';
import { remapTemplateActionsForAppend } from './services/niceTemplateAppend.js';
import { simulateNiceFlow } from './services/niceSimulation.js';
import SnippetStudio from './components/SnippetStudio.jsx';
import { CheckboxField, Field, SelectField, TextareaField } from './components/forms/NiceFormFields.jsx';
import ActionPalette from './components/builder/ActionPalette.jsx';
import ActionEditor from './components/builder/ActionEditor.jsx';
import ValidationPanel from './components/builder/ValidationPanel.jsx';
import {
  NiceSimulatorPanel,
  SimulationNodeInspector,
  SimulationTimeline,
  SimulationVariablesPanel,
} from './components/simulator/NiceSimulatorPanels.jsx';
import NiceDocumentationModal from './components/documentation/NiceDocumentationModal.jsx';
import ConnectionModal from './components/modals/ConnectionModal.jsx';

export default function NiceScriptWorkspace() {
  const [script, setScript] = useState(() => readStoredScript() ?? makeMenuTemplate());
  const [selectedActionId, setSelectedActionId] = useState(script.actions[0]?.actionId ?? null);
  const [clonedTemplates, setClonedTemplates] = useState(readClonedTemplates);
  const [copyText, setCopyText] = useState('');
  const [copyStatus, setCopyStatus] = useState('');
  const [importError, setImportError] = useState('');
  const [isMenuWizardOpen, setMenuWizardOpen] = useState(false);
  const [isApiWizardOpen, setApiWizardOpen] = useState(false);
  const [isRestApiWizardOpen, setRestApiWizardOpen] = useState(false);
  const [pendingTemplateInsert, setPendingTemplateInsert] = useState(null);
  const [templateInsertMode, setTemplateInsertMode] = useState('replace');
  const [manualActionType, setManualActionType] = useState('SNIPPET');
  const [leftPanelTab, setLeftPanelTab] = useState('actions');
  const [pendingConnection, setPendingConnection] = useState(null);
  const [snippetStudioActionId, setSnippetStudioActionId] = useState(null);
  const [isDocumentationOpen, setDocumentationOpen] = useState(false);
  const [niceMode, setNiceMode] = useState('builder');
  const [simulationNodeOutputs, setSimulationNodeOutputs] = useState({});
  const [focusActionRequest, setFocusActionRequest] = useState(null);
  const fileInputRef = useRef(null);
  const validation = useMemo(() => validateNiceScript(script), [script]);
  const documentationMarkdown = useMemo(() => generateNiceDocumentation(script, validation), [script, validation]);
  const documentationFlow = useMemo(() => buildNiceDocumentationFlow(script), [script]);
  const simulation = useMemo(
    () => simulateNiceFlow(script, { nodeOutputs: simulationNodeOutputs }),
    [script, simulationNodeOutputs],
  );
  const selectedAction = script.actions.find((action) => Number(action.actionId) === Number(selectedActionId));
  const snippetStudioAction = script.actions.find((action) => Number(action.actionId) === Number(snippetStudioActionId));

  useEffect(() => {
    localStorage.setItem(DRAFT_STORAGE_KEY, JSON.stringify(script));
  }, [script]);

  useEffect(() => {
    localStorage.setItem(CLONES_STORAGE_KEY, JSON.stringify(clonedTemplates));
  }, [clonedTemplates]);

  function loadScript(nextScript) {
    setScript(nextScript);
    setSelectedActionId(nextScript.actions[0]?.actionId ?? null);
    setCopyText('');
    setCopyStatus('');
    setImportError('');
  }

  function requestTemplateInsert(templateRequest) {
    if (script.actions.length > 0) {
      setPendingTemplateInsert(templateRequest);
      return;
    }

    executeTemplateInsert(templateRequest, 'replace');
  }

  function executeTemplateInsert(templateRequest, mode) {
    setPendingTemplateInsert(null);
    setTemplateInsertMode(mode);

    if (templateRequest.kind === 'menu') {
      setMenuWizardOpen(true);
      return;
    }

    if (templateRequest.kind === 'api') {
      setApiWizardOpen(true);
      return;
    }

    if (templateRequest.kind === 'restApi') {
      setRestApiWizardOpen(true);
      return;
    }

    const nextScript = templateRequest.getScript();
    if (mode === 'append') {
      appendTemplateScript(nextScript, { label: templateRequest.label });
      return;
    }

    loadScript(nextScript);
  }

  function handleCreateMenuFromWizard(nextScript) {
    setMenuWizardOpen(false);
    if (templateInsertMode === 'append') {
      appendTemplateScript(nextScript, { label: 'Menu padrao NICE' });
      setTemplateInsertMode('replace');
      return;
    }
    loadScript(nextScript);
  }

  function handleCreateApiFromWizard(nextScript) {
    setApiWizardOpen(false);
    if (templateInsertMode === 'append') {
      appendTemplateScript(nextScript, { label: 'Chamada API / RUNSUB' });
      setTemplateInsertMode('replace');
      return;
    }
    loadScript(nextScript);
  }

  function handleCreateRestApiFromWizard(nextScript) {
    setRestApiWizardOpen(false);
    if (templateInsertMode === 'append') {
      appendTemplateScript(nextScript, { label: 'API REST NICE' });
      setTemplateInsertMode('replace');
      return;
    }
    loadScript(nextScript);
  }

  async function handleImportXml(event) {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;

    try {
      const text = await file.text();
      loadScript(parseNiceXml(text, file.name));
    } catch (error) {
      setImportError(error?.message ?? 'Nao foi possivel importar o XML.');
    }
  }

  function handleCloneCurrent() {
    const clone = cloneNiceScript(script, {
      id: `nice-clone-${Date.now()}`,
      name: `${script.name} - clone`,
      source: 'clone',
    });
    setClonedTemplates((current) => [clone, ...current].slice(0, 12));
    setCopyStatus('Template clonado na biblioteca lateral.');
  }

  function handleDeleteClone(id) {
    setClonedTemplates((current) => current.filter((item) => item.id !== id));
  }

  function appendTemplateScript(templateScript, options = {}) {
    setScript((current) => {
      const remapped = remapTemplateActionsForAppend(current.actions, templateScript.actions);
      if (remapped.actions.length === 0) {
        setCopyStatus('Template nao possui actions para adicionar.');
        return current;
      }

      const appendedTemplates = [
        ...(current.metadata?.appendedTemplates ?? []),
        {
          name: options.label || templateScript.name || 'Template NICE',
          templateType: templateScript.templateType || '',
          addedAt: new Date().toISOString(),
          actions: remapped.actions.map((action) => action.actionId),
        },
      ];

      setSelectedActionId(remapped.actions[0]?.actionId ?? null);
      setCopyText('');
      setCopyStatus(`${options.label || templateScript.name || 'Template'} adicionado ao fluxo atual.`);
      setImportError('');

      return {
        ...current,
        metadata: {
          ...current.metadata,
          appendedTemplates,
        },
        actions: [...current.actions, ...remapped.actions],
      };
    });
  }

  function updateAction(actionId, updater) {
    setScript((current) => ({
      ...current,
      actions: current.actions.map((action) => (
        Number(action.actionId) === Number(actionId)
          ? { ...action, ...updater(action) }
          : action
      )),
    }));
    setCopyStatus('');
  }

  function updateActionPosition(actionId, position) {
    updateAction(actionId, () => ({
      x: Math.round(position.x),
      y: Math.round(position.y),
    }));
  }

  function updateParameter(actionId, index, value) {
    updateAction(actionId, (action) => {
      const parameters = [...(action.parameters ?? [])];
      parameters[index] = value;
      return { parameters };
    });
  }

  function applySnippetStudioCode(actionId, code) {
    updateParameter(actionId, 0, code);
    setSnippetStudioActionId(null);
  }

  function updateBranch(actionId, branchType, index, patch) {
    updateAction(actionId, (action) => {
      const key = branchType === 'case' ? 'cases' : 'branches';
      const items = [...(action[key] ?? [])];
      items[index] = { ...items[index], ...patch };
      return { [key]: items };
    });
  }

  function updateDefault(actionId, value) {
    updateAction(actionId, (action) => ({
      defaultNextAction: action.defaultNextAction
        ? { ...action.defaultNextAction, actionId: Number(value) || -1 }
        : { actionId: Number(value) || -1, index: 0, text: '', labelDistance: null, segments: [] },
    }));
  }

  function addManualAction(actionType = manualActionType, position = null) {
    const actionId = getNextActionId(script.actions);
    setScript((current) => {
      const fallbackPosition = selectedAction
        ? { x: Number(selectedAction.x) + 260, y: Number(selectedAction.y) }
        : { x: 160, y: 160 };
      const nextAction = makeDefaultAction(actionType, actionId, position ?? fallbackPosition);
      return {
        ...current,
        actions: [...current.actions, nextAction],
      };
    });
    setSelectedActionId(actionId);
    setFocusActionRequest({ actionId, nonce: Date.now() });
    setCopyStatus('');
  }

  function quickAddConnectedAction(sourceActionId, actionType) {
    const sourceId = Number(sourceActionId);
    const sourceAction = script.actions.find((action) => Number(action.actionId) === sourceId);
    if (!sourceAction) return;

    const actionId = getNextActionId(script.actions);
    const position = findQuickAddPosition(sourceAction, script.actions);
    const nextAction = makeDefaultAction(actionType, actionId, position);

    setScript((current) => ({
      ...current,
      actions: [...current.actions, nextAction],
    }));
    setSelectedActionId(actionId);
    setPendingConnection({ sourceId, targetId: actionId });
    setFocusActionRequest({ actionId, nonce: Date.now() });
    setCopyStatus('');
  }

  function removeAction(actionId) {
    setScript((current) => ({
      ...current,
      actions: current.actions.filter((action) => Number(action.actionId) !== Number(actionId)),
    }));
    setSelectedActionId(null);
    setCopyStatus('');
  }

  function removeActionAndConnections(actionId) {
    const removedId = Number(actionId);
    setScript((current) => ({
      ...current,
      actions: current.actions
        .filter((action) => Number(action.actionId) !== removedId)
        .map((action) => ({
          ...action,
          defaultNextAction: Number(action.defaultNextAction?.actionId) === removedId ? null : action.defaultNextAction,
          branches: (action.branches ?? []).filter((branch) => Number(branch.actionId) !== removedId),
          cases: (action.cases ?? []).filter((branch) => Number(branch.actionId) !== removedId),
        })),
    }));
    setSelectedActionId(null);
    setCopyStatus('');
  }

  function handleConnectActions(connection) {
    setPendingConnection(connection);
  }

  function applyConnection(config) {
    const sourceId = Number(pendingConnection?.sourceId);
    const targetId = Number(pendingConnection?.targetId);
    if (!sourceId || !targetId) return;

    setScript((current) => ({
      ...current,
      actions: current.actions.map((action) => {
        if (Number(action.actionId) !== sourceId) return action;
        const branch = makeBranch(targetId, config.label, config.index);
        if (config.type === 'default') {
          return { ...action, defaultNextAction: branch };
        }
        if (config.type === 'case') {
          if (action.action === 'MENU') {
            const parameters = [...(action.parameters ?? [])];
            parameters[7] = config.responseVariable || parameters[7] || 'MRES';
            return {
              ...action,
              parameters,
              cases: upsertBranch(action.cases ?? [], branch),
            };
          }
          return { ...action, cases: upsertBranch(action.cases ?? [], branch) };
        }
        return { ...action, branches: upsertBranch(action.branches ?? [], branch) };
      }),
    }));
    setPendingConnection(null);
    setCopyStatus('');
  }

  function deleteConnection(edgeData) {
    const sourceId = Number(edgeData?.actionId);
    if (!sourceId) return;

    setScript((current) => ({
      ...current,
      actions: current.actions.map((action) => {
        if (Number(action.actionId) !== sourceId) return action;

        if (edgeData.kind === 'default') {
          return { ...action, defaultNextAction: null };
        }

        const key = edgeData.kind === 'case' ? 'cases' : 'branches';
        return {
          ...action,
          [key]: (action[key] ?? []).filter((branch) => !sameBranch(branch, edgeData.branch)),
        };
      }),
    }));
    setCopyStatus('');
  }

  function updateMenuConfig(patch) {
    const nextScript = makeMenuTemplate({
      ...(script.metadata?.menu ?? {}),
      ...patch,
    });
    nextScript.id = script.id;
    loadScript(nextScript);
  }

  function updateMenuOption(index, patch) {
    const menu = script.metadata?.menu;
    if (!menu) return;
    const options = [...menu.options];
    options[index] = { ...options[index], ...patch };
    updateMenuConfig({ options });
  }

  function addMenuOption() {
    const menu = script.metadata?.menu;
    if (!menu) return;
    const nextIndex = menu.options.length + 1;
    updateMenuConfig({
      options: [
        ...menu.options,
        makeMenuOption(String(nextIndex), `Opcao${nextIndex}`, `CTL_Opcao${nextIndex}_INI.wav`, ''),
      ],
    });
  }

  function removeMenuOption(index) {
    const menu = script.metadata?.menu;
    if (!menu || menu.options.length <= 1) return;
    updateMenuConfig({ options: menu.options.filter((_, itemIndex) => itemIndex !== index) });
  }

  function updateEntryConfig(patch) {
    const nextScript = makeEntryTemplate({
      ...(script.metadata?.entry ?? {}),
      ...patch,
    });
    nextScript.id = script.id;
    loadScript(nextScript);
  }

  function handleOrganizeScript() {
    setScript((current) => organizeNiceScript(current));
    setCopyStatus('');
  }

  function clearCanvas() {
    setScript((current) => ({
      ...current,
      name: 'Fluxo NICE em branco',
      templateType: 'blank',
      metadata: {
        ...current.metadata,
        menu: undefined,
        entry: undefined,
        api: undefined,
      },
      actions: [],
    }));
    setSelectedActionId(null);
    setCopyText('');
    setCopyStatus('');
    setImportError('');
  }

  function resetSimulation() {
    setSimulationNodeOutputs({});
  }

  function updateSimulationNodeOutput(actionId, patch) {
    setSimulationNodeOutputs((current) => ({
      ...current,
      [actionId]: {
        ...(current[actionId] ?? {}),
        ...patch,
      },
    }));
  }

  function focusActionFromValidation(message) {
    const action = findValidationAction(script.actions, message);
    if (!action) return;
    focusAction(action.actionId);
  }

  function focusAction(actionId) {
    const action = script.actions.find((item) => Number(item.actionId) === Number(actionId));
    if (!action) return;
    setSelectedActionId(action.actionId);
    setFocusActionRequest({ actionId: action.actionId, nonce: Date.now() });
  }

  async function copyToNice() {
    const output = exportNiceClipboard(script);
    setCopyText(output);
    const draftNote = validation.isValid ? '' : ' Copiado como rascunho com alertas de validacao.';

    try {
      await navigator.clipboard.writeText(output);
      setCopyStatus(`Texto copiado para colar no NICE Studio.${draftNote}`);
    } catch {
      setCopyStatus(`Nao consegui acessar o clipboard; use o texto gerado abaixo.${draftNote}`);
    }
  }

  return (
    <>
      <header className="nice-toolbar">
        <div className="nice-toolbar-title">
          <h1>Script NICE</h1>
          <p>{script.name} - {script.actions.length} actions</p>
        </div>
        <div className="nice-toolbar-actions">
          {niceMode === 'builder' ? (
            <div className="nice-toolbar-group is-primary" aria-label="Acoes principais">
              <input ref={fileInputRef} className="sr-only" type="file" accept=".xml" onChange={handleImportXml} />
              <button className="ghost-button" type="button" onClick={() => fileInputRef.current?.click()}>
                <FileInput size={16} />
                Importar XML
              </button>
              <label className="nice-toolbar-add">
                <select value={manualActionType} onChange={(event) => setManualActionType(event.target.value)}>
                  {MANUAL_ACTION_TYPES.map((type) => (
                    <option value={type} key={type}>{type}</option>
                  ))}
                </select>
                <button className="ghost-button" type="button" onClick={() => addManualAction(manualActionType)}>
                  <Plus size={16} />
                  Adicionar
                </button>
              </label>
              <button className="ghost-button" type="button" onClick={handleOrganizeScript} disabled={!script.actions.length}>
                <LayoutGrid size={16} />
                Organizar
              </button>
              <button className="secondary-button" type="button" onClick={copyToNice}>
                <ClipboardCopy size={16} />
                Copiar NICE
              </button>
            </div>
          ) : (
            <div className="nice-toolbar-group is-primary" aria-label="Acoes do simulador">
              <button className="ghost-button" type="button" onClick={resetSimulation}>
                Resetar teste
              </button>
            </div>
          )}

          <div className="nice-toolbar-group is-secondary" aria-label="Acoes secundarias">
            <button className="ghost-button" type="button" onClick={() => setDocumentationOpen(true)} disabled={!script.actions.length}>
              <FileText size={16} />
              Documentar
            </button>
            {niceMode === 'builder' && (
              <button className="ghost-button" type="button" onClick={clearCanvas} disabled={!script.actions.length}>
                <Trash2 size={16} />
                Limpar
              </button>
            )}
          </div>

          <div className="nice-mode-toggle" role="group" aria-label="Modo Script NICE">
            <button
              className={niceMode === 'builder' ? 'is-active' : ''}
              type="button"
              onClick={() => setNiceMode('builder')}
            >
              Builder
            </button>
            <button
              className={niceMode === 'simulator' ? 'is-active' : ''}
              type="button"
              onClick={() => setNiceMode('simulator')}
            >
              Simulador
            </button>
          </div>
        </div>
      </header>

      {niceMode === 'simulator' ? (
        <div className="nice-simulator-grid">
          <aside className="nice-simulator-left">
            <NiceSimulatorPanel
              script={script}
              simulation={simulation}
              onReset={resetSimulation}
            />
            <SimulationNodeInspector
              action={selectedAction}
              actions={script.actions}
              variables={simulation.variables}
              nodeOutput={simulationNodeOutputs[selectedActionId] ?? {}}
              onNodeOutputChange={(patch) => updateSimulationNodeOutput(selectedActionId, patch)}
            />
          </aside>

          <NiceScriptCanvas
            script={script}
            selectedActionId={selectedActionId}
            simulation={simulation}
            readOnly
            focusActionRequest={focusActionRequest}
            onSelectAction={setSelectedActionId}
            onClearSelection={() => setSelectedActionId(null)}
          />

          <aside className="nice-simulator-right">
            <SimulationVariablesPanel variables={simulation.variables} warnings={simulation.warnings} />
            <SimulationTimeline simulation={simulation} />
            <ValidationPanel validation={validation} actions={script.actions} onFocusAction={focusActionFromValidation} />
          </aside>
        </div>
      ) : (
        <div className="nice-workspace-grid">
        <aside className="nice-left-panel">
          <section className="panel-section nice-panel nice-left-tabs-panel">
            <div className="nice-left-tabs" role="tablist" aria-label="Menu lateral Script NICE">
              <button
                className={leftPanelTab === 'actions' ? 'is-active' : ''}
                type="button"
                role="tab"
                aria-selected={leftPanelTab === 'actions'}
                onClick={() => setLeftPanelTab('actions')}
              >
                Actions
              </button>
              <button
                className={leftPanelTab === 'templates' ? 'is-active' : ''}
                type="button"
                role="tab"
                aria-selected={leftPanelTab === 'templates'}
                onClick={() => setLeftPanelTab('templates')}
              >
                Templates
              </button>
            </div>
          </section>

          {leftPanelTab === 'actions' ? (
            <ActionPalette onAddAction={(type) => addManualAction(type)} />
          ) : (
            <>
              <section className="panel-section nice-panel">
                <div className="section-header">
                  <h2>Templates</h2>
                </div>
                <button className="nice-template-button" type="button" onClick={() => requestTemplateInsert({ kind: 'menu', label: 'Menu padrao NICE' })}>
                  <Menu size={17} />
                  <span>
                    <strong>Menu padrao NICE</strong>
                    <small>Wizard com SET_PARAMS, SIL e REJ</small>
                  </span>
                </button>
                <button className="nice-template-button" type="button" onClick={() => requestTemplateInsert({ kind: 'entry', label: 'Entry padrao PCI', getScript: () => makeEntryTemplate() })}>
                  <FileCode2 size={17} />
                  <span>
                    <strong>Entry padrao PCI</strong>
                    <small>BEGIN, env/path, RUNSCRIPT</small>
                  </span>
                </button>
                <button className="nice-template-button" type="button" onClick={() => requestTemplateInsert({ kind: 'api', label: 'Chamada API / RUNSUB' })}>
                  <Milestone size={17} />
                  <span>
                    <strong>Chamada API / RUNSUB</strong>
                    <small>RUNSUB, IF e destinos True/False</small>
                  </span>
                </button>
                <button className="nice-template-button" type="button" onClick={() => requestTemplateInsert({ kind: 'restApi', label: 'API REST NICE' })}>
                  <Milestone size={17} />
                  <span>
                    <strong>API REST NICE</strong>
                    <small>WORKFLOWDATA, REST_API, tratamento e RETURN</small>
                  </span>
                </button>
                <button className="nice-template-button" type="button" onClick={() => fileInputRef.current?.click()}>
                  <FileInput size={17} />
                  <span>
                    <strong>Importar XML</strong>
                    <small>Visualizar e clonar script NICE</small>
                  </span>
                </button>
                {importError && <div className="nice-alert is-error">{importError}</div>}
              </section>

              <section className="panel-section nice-panel">
                <div className="section-header">
                  <h2>Templates clonados</h2>
                  <button className="icon-button" type="button" title="Clonar script atual" onClick={handleCloneCurrent}>
                    <Save size={15} />
                  </button>
                </div>
                {clonedTemplates.length === 0 ? (
                  <p className="nice-empty-text">Importe ou ajuste um script e salve uma copia reutilizavel.</p>
                ) : (
                  <div className="nice-clone-list">
                    {clonedTemplates.map((clone) => (
                      <article className="nice-clone-item" key={clone.id}>
                        <button type="button" onClick={() => requestTemplateInsert({ kind: 'clone', label: clone.name, getScript: () => clone })}>
                          <strong>{clone.name}</strong>
                          <small>{clone.actions.length} actions</small>
                        </button>
                        <button className="icon-button" type="button" onClick={() => handleDeleteClone(clone.id)} title="Remover clone">
                          <Trash2 size={14} />
                        </button>
                      </article>
                    ))}
                  </div>
                )}
              </section>
            </>
          )}
        </aside>

        <NiceScriptCanvas
          script={script}
          selectedActionId={selectedActionId}
          simulation={null}
          focusActionRequest={focusActionRequest}
          onSelectAction={setSelectedActionId}
          onClearSelection={() => {
            setSelectedActionId(null);
          }}
          onMoveAction={updateActionPosition}
          onConnectActions={handleConnectActions}
          onDropAction={addManualAction}
          onDeleteConnection={deleteConnection}
          onDeleteAction={removeActionAndConnections}
          onQuickAddAction={quickAddConnectedAction}
        />

        <aside className="nice-right-panel">
          <ValidationPanel validation={validation} actions={script.actions} onFocusAction={focusActionFromValidation} />
          {script.templateType === 'menu' && script.metadata?.menu && (
            <MenuConfigPanel
              menu={script.metadata.menu}
              onChange={updateMenuConfig}
              onOptionChange={updateMenuOption}
              onAddOption={addMenuOption}
              onRemoveOption={removeMenuOption}
            />
          )}
          {script.templateType === 'entry' && script.metadata?.entry && (
            <EntryConfigPanel entry={script.metadata.entry} onChange={updateEntryConfig} />
          )}
          <ActionEditor
            action={selectedAction}
            onChange={updateAction}
            onParameterChange={updateParameter}
            onBranchChange={updateBranch}
            onDefaultChange={updateDefault}
            onRemove={removeAction}
            onOpenSnippetStudio={setSnippetStudioActionId}
          />
          <section className="panel-section nice-panel">
            <div className="section-header">
              <h2>Saida NICE</h2>
              <button className="icon-button" type="button" onClick={copyToNice} title="Copiar para NICE">
                <Copy size={15} />
              </button>
            </div>
            {!validation.isValid && (
              <div className="nice-alert is-warning">
                Existem alertas bloqueantes, mas a saida pode ser copiada como rascunho.
              </div>
            )}
            {copyStatus && <div className="nice-alert is-success">{copyStatus}</div>}
            {copyText && <textarea className="nice-output-preview" readOnly value={copyText} />}
          </section>
        </aside>
        </div>
      )}
      {isMenuWizardOpen && (
        <NiceMenuWizard
          initialConfig={templateInsertMode === 'replace' && script.templateType === 'menu' ? script.metadata?.menu : DEFAULT_MENU_CONFIG}
          onCancel={() => {
            setMenuWizardOpen(false);
            setTemplateInsertMode('replace');
          }}
          onCreate={handleCreateMenuFromWizard}
        />
      )}
      {isApiWizardOpen && (
        <NiceApiWizard
          initialConfig={templateInsertMode === 'replace' && script.templateType === 'api' ? script.metadata?.api : DEFAULT_API_CONFIG}
          onCancel={() => {
            setApiWizardOpen(false);
            setTemplateInsertMode('replace');
          }}
          onCreate={handleCreateApiFromWizard}
        />
      )}
      {isRestApiWizardOpen && (
        <NiceRestApiWizard
          initialConfig={templateInsertMode === 'replace' && script.templateType === 'restApi' ? script.metadata?.restApi : DEFAULT_REST_API_CONFIG}
          onCancel={() => {
            setRestApiWizardOpen(false);
            setTemplateInsertMode('replace');
          }}
          onCreate={handleCreateRestApiFromWizard}
        />
      )}
      {pendingTemplateInsert && (
        <TemplateInsertChoiceModal
          templateName={pendingTemplateInsert.label}
          onCancel={() => setPendingTemplateInsert(null)}
          onReplace={() => executeTemplateInsert(pendingTemplateInsert, 'replace')}
          onAppend={() => executeTemplateInsert(pendingTemplateInsert, 'append')}
        />
      )}
      {isDocumentationOpen && (
        <NiceDocumentationModal
          script={script}
          scriptName={script.name}
          markdown={documentationMarkdown}
          flow={documentationFlow}
          onClose={() => setDocumentationOpen(false)}
          onFocusAction={focusAction}
        />
      )}
      {pendingConnection && (
        <ConnectionModal
          connection={pendingConnection}
          sourceAction={script.actions.find((action) => Number(action.actionId) === Number(pendingConnection.sourceId))}
          targetAction={script.actions.find((action) => Number(action.actionId) === Number(pendingConnection.targetId))}
          onCancel={() => setPendingConnection(null)}
          onApply={applyConnection}
        />
      )}
      {snippetStudioAction?.action === 'SNIPPET' && (
        <SnippetStudio
          action={snippetStudioAction}
          onCancel={() => setSnippetStudioActionId(null)}
          onApply={applySnippetStudioCode}
        />
      )}
    </>
  );
}

function findQuickAddPosition(sourceAction, actions) {
  const baseX = Number(sourceAction.x) || 160;
  const baseY = Number(sourceAction.y) || 160;
  const usedPositions = (actions ?? []).map((action) => ({
    x: Number(action.x) || 0,
    y: Number(action.y) || 0,
  }));
  let candidate = { x: baseX + 300, y: baseY };

  for (let attempt = 0; attempt < 20; attempt += 1) {
    const hasCollision = usedPositions.some((position) => (
      Math.abs(position.x - candidate.x) < 240
      && Math.abs(position.y - candidate.y) < 130
    ));
    if (!hasCollision) return candidate;
    candidate = { x: baseX + 300, y: baseY + (attempt + 1) * 140 };
  }

  return candidate;
}

function NiceMenuWizard({ initialConfig, onCancel, onCreate }) {
  const [step, setStep] = useState(0);
  const [config, setConfig] = useState(() => ({ ...DEFAULT_MENU_CONFIG, ...(initialConfig ?? {}) }));
  const [maskDraft, setMaskDraft] = useState(() => (
    (initialConfig?.options ?? DEFAULT_MENU_CONFIG.options).map((option) => option.key).join('-')
  ));
  const previewScript = useMemo(() => makeMenuTemplate(config), [config]);
  const validation = useMemo(() => validateNiceScript(previewScript), [previewScript]);
  const snippets = useMemo(() => makeMenuSnippets(config), [config]);
  const steps = ['Basico', 'REJ/SIL', 'Opcoes', 'Snippets', 'Revisao'];

  function updateConfig(patch) {
    setConfig((current) => ({ ...current, ...patch }));
  }

  function updateNested(key, patch) {
    setConfig((current) => ({ ...current, [key]: { ...current[key], ...patch } }));
  }

  function updateOption(index, patch) {
    setConfig((current) => {
      const options = [...current.options];
      options[index] = { ...options[index], ...patch };
      return { ...current, options };
    });
  }

  function updateMask(mask) {
    setMaskDraft(mask);
    setConfig((current) => ({ ...current, options: optionsFromMask(mask, current.options) }));
  }

  function addOption() {
    setConfig((current) => {
      const nextIndex = current.options.length + 1;
      const nextOptions = [
        ...current.options,
        makeMenuOption(String(nextIndex), `Opcao${nextIndex}`, `CTL_Opcao${nextIndex}_INI.wav`, ''),
      ];
      setMaskDraft(nextOptions.map((option) => option.key).join('-'));
      return {
        ...current,
        options: nextOptions,
      };
    });
  }

  function removeOption(index) {
    setConfig((current) => ({
      ...current,
      options: current.options.length <= 1
        ? current.options
        : current.options.filter((_, itemIndex) => itemIndex !== index),
    }));
    setMaskDraft((current) => current.split('-').filter((_, itemIndex) => itemIndex !== index).join('-'));
  }

  return (
    <div className="nice-wizard-backdrop" role="presentation">
      <section className="nice-wizard" role="dialog" aria-modal="true" aria-label="Criar menu NICE">
        <header className="nice-wizard-header">
          <div>
            <h2>Criar menu NICE</h2>
            <p>{steps[step]}</p>
          </div>
          <button className="ghost-button" type="button" onClick={onCancel}>Fechar</button>
        </header>

        <div className="nice-wizard-steps">
          {steps.map((label, index) => (
            <span className={index === step ? 'active' : ''} key={label}>{index + 1}. {label}</span>
          ))}
        </div>

        <div className="nice-wizard-body">
          {step === 0 && (
            <div className="nice-wizard-grid">
              <Field label="Nome do script" value={config.scriptName} onChange={(value) => updateConfig({ scriptName: value })} />
              <Field label="Variavel resposta" value={config.responseVariable} onChange={(value) => updateConfig({ responseVariable: value })} />
              <Field label="Audio INI" value={config.noteIni} onChange={(value) => updateConfig({ noteIni: value })} />
              <Field label="Timeout" value={config.timeout} onChange={(value) => updateConfig({ timeout: value })} />
              <Field label="Interdigit timeout" value={config.interDigitTimeout} onChange={(value) => updateConfig({ interDigitTimeout: value })} />
              <Field label="Prefixo audio" value={config.audioPathVar} onChange={(value) => updateConfig({ audioPathVar: value })} />
              <Field label="Prefixo step" value={config.pathStepVar} onChange={(value) => updateConfig({ pathStepVar: value })} />
            </div>
          )}

          {step === 1 && (
            <div className="nice-wizard-grid">
              <RetryConfig
                title="REJ"
                enabled={config.hasRej}
                attempts={config.rejAttempts}
                audios={config.rejRetryAudios}
                exit={config.rejExit}
                onChange={(patch) => updateConfig(renameRetryPatch('rej', patch))}
              />
              <RetryConfig
                title="SIL"
                enabled={config.hasSil}
                attempts={config.silAttempts}
                audios={config.silRetryAudios}
                exit={config.silExit}
                onChange={(patch) => updateConfig(renameRetryPatch('sil', patch))}
              />
            </div>
          )}

          {step === 2 && (
            <>
              <Field label="Mascara rapida" value={maskDraft} onChange={updateMask} />
              <div className="nice-options-header">
                <strong>Opcoes do menu</strong>
                <button className="icon-button" type="button" onClick={addOption} title="Adicionar opcao">
                  <Plus size={15} />
                </button>
              </div>
              <div className="nice-wizard-options">
                {config.options.map((option, index) => (
                  <article className="nice-option-card" key={`${option.key}-${index}`}>
                    <div className="nice-option-title">
                      <Field label="Tecla" value={option.key} onChange={(value) => updateOption(index, { key: value })} />
                      <button className="icon-button" type="button" onClick={() => removeOption(index)} title="Remover opcao">
                        <Trash2 size={14} />
                      </button>
                    </div>
                    <Field label="Audio saida" value={option.audio} onChange={(value) => updateOption(index, { audio: value })} />
                    <Field label="NEXT_STEP" value={option.nextStep} onChange={(value) => updateOption(index, { nextStep: value })} />
                    <Field label="scriptpoint" value={option.scriptpoint} onChange={(value) => updateOption(index, { scriptpoint: value })} />
                    <Field label="TransferCode" value={option.transferCode} onChange={(value) => updateOption(index, { transferCode: value })} />
                  </article>
                ))}
              </div>
            </>
          )}

          {step === 3 && (
            <div className="nice-wizard-snippets">
              <TextareaField label="CONFIG_MENU" value={config.configSnippetOverride ?? snippets.config} onChange={(value) => updateConfig({ configSnippetOverride: value })} />
              <TextareaField label="SET_PARAMS" value={config.setParamsSnippetOverride ?? snippets.setParams} onChange={(value) => updateConfig({ setParamsSnippetOverride: value })} />
              {config.hasRej && <TextareaField label="MAX_REJ" value={config.maxRejSnippetOverride ?? snippets.maxRej} onChange={(value) => updateConfig({ maxRejSnippetOverride: value })} />}
              {config.hasSil && <TextareaField label="MAX_SIL" value={config.maxSilSnippetOverride ?? snippets.maxSil} onChange={(value) => updateConfig({ maxSilSnippetOverride: value })} />}
            </div>
          )}

          {step === 4 && (
            <div className="nice-review-grid">
              <ValidationPanel validation={validation} />
              <section className="panel-section nice-panel">
                <div className="section-header">
                  <h2>Actions</h2>
                  <span className="selected-pill">{previewScript.actions.length}</span>
                </div>
                <div className="nice-action-review-list">
                  {previewScript.actions.map((action) => (
                    <span key={action.actionId}>#{action.actionId} {action.action} - {action.caption}</span>
                  ))}
                </div>
              </section>
            </div>
          )}
        </div>

        <footer className="nice-wizard-footer">
          <button className="ghost-button" type="button" onClick={step === 0 ? onCancel : () => setStep((value) => value - 1)}>
            {step === 0 ? 'Cancelar' : 'Voltar'}
          </button>
          {step < steps.length - 1 ? (
            <button className="secondary-button" type="button" onClick={() => setStep((value) => value + 1)}>Next</button>
          ) : (
            <button className="secondary-button" type="button" onClick={() => onCreate(previewScript)} disabled={!validation.isValid}>
              Criar menu no canvas
            </button>
          )}
        </footer>
      </section>
    </div>
  );
}

function TemplateInsertChoiceModal({ templateName, onCancel, onReplace, onAppend }) {
  return (
    <div className="nice-wizard-backdrop" role="presentation">
      <section className="nice-choice-modal" role="dialog" aria-modal="true" aria-label="Adicionar template NICE">
        <header className="nice-wizard-header">
          <div>
            <h2>Adicionar template</h2>
            <p>{templateName}</p>
          </div>
          <button className="ghost-button" type="button" onClick={onCancel}>Fechar</button>
        </header>
        <div className="nice-choice-body">
          <button className="nice-choice-card" type="button" onClick={onReplace}>
            <strong>Comecar do zero</strong>
            <small>Substitui o canvas atual pelo template selecionado.</small>
          </button>
          <button className="nice-choice-card" type="button" onClick={onAppend}>
            <strong>Adicionar ao fluxo atual</strong>
            <small>Insere o template sem BEGIN, mantendo o fluxo que ja esta no canvas.</small>
          </button>
        </div>
      </section>
    </div>
  );
}

function NiceApiWizard({ initialConfig, onCancel, onCreate }) {
  const [step, setStep] = useState(0);
  const [config, setConfig] = useState(() => ({ ...DEFAULT_API_CONFIG, ...(initialConfig ?? {}) }));
  const previewScript = useMemo(() => makeApiTemplate(config), [config]);
  const validation = useMemo(() => validateNiceScript(previewScript), [previewScript]);
  const steps = ['API', 'Parametros', 'Validacao', 'Caminhos', 'Revisao'];

  function updateConfig(patch) {
    setConfig((current) => ({ ...current, ...patch }));
  }

  function updateDestination(key, patch) {
    setConfig((current) => ({
      ...current,
      [key]: {
        ...(current[key] ?? makeApiDestination()),
        ...patch,
      },
    }));
  }

  return (
    <div className="nice-wizard-backdrop" role="presentation">
      <section className="nice-wizard" role="dialog" aria-modal="true" aria-label="Criar chamada de API NICE">
        <header className="nice-wizard-header">
          <div>
            <h2>Criar chamada API</h2>
            <p>{steps[step]}</p>
          </div>
          <button className="ghost-button" type="button" onClick={onCancel}>Fechar</button>
        </header>

        <div className="nice-wizard-steps">
          {steps.map((label, index) => (
            <span className={index === step ? 'active' : ''} key={label}>{index + 1}. {label}</span>
          ))}
        </div>

        <div className="nice-wizard-body">
          {step === 0 && (
            <div className="nice-wizard-grid">
              <Field label="Nome da chamada" value={config.apiName} onChange={(value) => updateConfig({ apiName: value })} />
              <Field label="Script/API chamado" value={config.scriptPath} onChange={(value) => updateConfig({ scriptPath: value })} />
              <Field label="Tipo de retorno" value={config.returnMode} onChange={(value) => updateConfig({ returnMode: value })} />
            </div>
          )}

          {step === 1 && (
            <TextareaField
              label="Parametros enviados ao RUNSUB (um por linha)"
              value={config.paramsText}
              onChange={(value) => updateConfig({ paramsText: value })}
            />
          )}

          {step === 2 && (
            <div className="nice-wizard-grid">
              <Field label="Variavel validadora" value={config.validationVariable} onChange={(value) => updateConfig({ validationVariable: value, ifExpressionOverride: '' })} />
              <Field label="Operador" value={config.validationOperator} onChange={(value) => updateConfig({ validationOperator: value, ifExpressionOverride: '' })} />
              <Field label="Valor esperado" value={config.validationValue} onChange={(value) => updateConfig({ validationValue: value, ifExpressionOverride: '' })} />
              <TextareaField
                label="Expressao final do IF"
                value={config.ifExpressionOverride || previewScript.metadata.api.ifExpression}
                onChange={(value) => updateConfig({ ifExpressionOverride: value })}
              />
            </div>
          )}

          {step === 3 && (
            <div className="nice-wizard-grid">
              <ApiDestinationEditor
                title="Caminho True"
                destination={config.trueDestination}
                onChange={(patch) => updateDestination('trueDestination', patch)}
              />
              <ApiDestinationEditor
                title="Caminho False"
                destination={config.falseDestination}
                onChange={(patch) => updateDestination('falseDestination', patch)}
              />
            </div>
          )}

          {step === 4 && (
            <div className="nice-review-grid">
              <ValidationPanel validation={validation} />
              <section className="panel-section nice-panel">
                <div className="section-header">
                  <h2>Actions</h2>
                  <span className="selected-pill">{previewScript.actions.length}</span>
                </div>
                <div className="nice-action-review-list">
                  {previewScript.actions.map((action) => (
                    <span key={action.actionId}>#{action.actionId} {action.action} - {action.caption}</span>
                  ))}
                </div>
              </section>
            </div>
          )}
        </div>

        <footer className="nice-wizard-footer">
          <button className="ghost-button" type="button" onClick={step === 0 ? onCancel : () => setStep((value) => value - 1)}>
            {step === 0 ? 'Cancelar' : 'Voltar'}
          </button>
          {step < steps.length - 1 ? (
            <button className="secondary-button" type="button" onClick={() => setStep((value) => value + 1)}>Next</button>
          ) : (
            <button className="secondary-button" type="button" onClick={() => onCreate(previewScript)} disabled={!validation.isValid}>
              Criar chamada no canvas
            </button>
          )}
        </footer>
      </section>
    </div>
  );
}

function NiceRestApiWizard({ initialConfig, onCancel, onCreate }) {
  const [step, setStep] = useState(0);
  const [config, setConfig] = useState(() => ({ ...DEFAULT_REST_API_CONFIG, ...(initialConfig ?? {}) }));
  const previewScript = useMemo(() => makeRestApiTemplate(config), [config]);
  const validation = useMemo(() => validateNiceScript(previewScript), [previewScript]);
  const restApi = previewScript.metadata.restApi;
  const steps = ['Dados', 'Request', 'Retorno', 'Tratamento', 'Snippets', 'Revisao'];

  function updateConfig(patch) {
    setConfig((current) => ({ ...current, ...patch }));
  }

  function updateSnippetOverride(key, value) {
    updateConfig({ [key]: value });
  }

  return (
    <div className="nice-wizard-backdrop" role="presentation">
      <section className="nice-wizard nice-rest-api-wizard" role="dialog" aria-modal="true" aria-label="Criar API REST NICE">
        <header className="nice-wizard-header">
          <div>
            <h2>Criar API REST NICE</h2>
            <p>{steps[step]}</p>
          </div>
          <button className="ghost-button" type="button" onClick={onCancel}>Fechar</button>
        </header>

        <div className="nice-wizard-steps">
          {steps.map((label, index) => (
            <span className={index === step ? 'active' : ''} key={label}>{index + 1}. {label}</span>
          ))}
        </div>

        <div className="nice-wizard-body">
          {step === 0 && (
            <div className="nice-wizard-grid">
              <Field label="Nome do script" value={config.scriptName} onChange={(value) => updateConfig({ scriptName: value })} />
              <Field label="Nome servico" value={config.serviceName} onChange={(value) => updateConfig({ serviceName: value })} />
              <SelectField
                label="Tipo de bloqueio"
                value={config.blockProvider}
                onChange={(value) => updateConfig({ blockProvider: value })}
                options={[
                  { value: 'Integrador', label: 'Integrador' },
                  { value: 'AWS', label: 'AWS' },
                  { value: 'Apigee', label: 'Apigee' },
                ]}
              />
              <Field label="Chave WORKFLOWDATA" value={config.workflowKey} onChange={(value) => updateConfig({ workflowKey: value })} />
            </div>
          )}

          {step === 1 && (
            <div className="nice-wizard-grid">
              <SelectField
                label="Metodo"
                value={config.method}
                onChange={(value) => updateConfig({ method: value })}
                options={[
                  { value: 'POST', label: 'POST' },
                  { value: 'GET', label: 'GET' },
                  { value: 'PUT', label: 'PUT' },
                  { value: 'PATCH', label: 'PATCH' },
                  { value: 'DELETE', label: 'DELETE' },
                ]}
              />
              <Field label="Timeout" value={config.timeout} onChange={(value) => updateConfig({ timeout: value })} />
              <Field label="Header JSON" value={config.headerJson} onChange={(value) => updateConfig({ headerJson: value })} />
              <Field label="Body JSON" value={config.bodyJson} onChange={(value) => updateConfig({ bodyJson: value })} />
              <Field label="Resultset" value={config.resultSetVar} onChange={(value) => updateConfig({ resultSetVar: value })} />
              <Field label="Error list" value={config.errorListVar} onChange={(value) => updateConfig({ errorListVar: value })} />
              <TextareaField label="URL DEV" value={config.urlDev} onChange={(value) => updateConfig({ urlDev: value })} />
              <TextareaField label="URL PRD" value={config.urlPrd} onChange={(value) => updateConfig({ urlPrd: value })} />
            </div>
          )}

          {step === 2 && (
            <div className="nice-wizard-grid">
              <TextareaField
                label="Variaveis globais de saida (uma por linha)"
                value={config.outputVarsText}
                onChange={(value) => updateConfig({ outputVarsText: value })}
              />
              <div>
                <Field label="Variavel principal RET" value={config.mainReturnVar} onChange={(value) => updateConfig({ mainReturnVar: value })} />
                <Field label="Valor API fechada" value={config.closedReturnValue} onChange={(value) => updateConfig({ closedReturnValue: value })} />
                <TextareaField label="Annotation opcional" value={config.annotationText} onChange={(value) => updateConfig({ annotationText: value })} />
              </div>
            </div>
          )}

          {step === 3 && (
            <div className="nice-wizard-grid">
              <TextareaField
                label="Expressao de sucesso"
                value={config.successExpression}
                onChange={(value) => updateConfig({ successExpression: value })}
              />
              <div>
                <CheckboxField label="Gerar Alerta_ErroAPI" checked={config.enableErrorAlert} onChange={(value) => updateConfig({ enableErrorAlert: value })} />
                <Field label="Script Alerta_ErroAPI" value={config.alertScriptPath} onChange={(value) => updateConfig({ alertScriptPath: value })} />
              </div>
            </div>
          )}

          {step === 4 && (
            <div className="nice-wizard-snippets">
              <TextareaField label="CHAVES_APIs" value={config.chavesSnippetOverride || restApi.chavesSnippetOverride || previewScript.actions.find((action) => action.caption === 'CHAVES_APIs')?.parameters?.[0] || ''} onChange={(value) => updateSnippetOverride('chavesSnippetOverride', value)} />
              <TextareaField label="Criacao de parametros" value={config.initSnippetOverride || previewScript.actions.find((action) => action.caption === 'Criacao de parametros')?.parameters?.[0] || ''} onChange={(value) => updateSnippetOverride('initSnippetOverride', value)} />
              <TextareaField label="Dados REQUEST" value={config.requestSnippetOverride || previewScript.actions.find((action) => action.caption === 'Dados REQUEST')?.parameters?.[0] || ''} onChange={(value) => updateSnippetOverride('requestSnippetOverride', value)} />
              <TextareaField label="Dados RESPONSE" value={config.responseSnippetOverride || previewScript.actions.find((action) => action.caption === 'Dados RESPONSE')?.parameters?.[0] || ''} onChange={(value) => updateSnippetOverride('responseSnippetOverride', value)} />
              <TextareaField label="dados CDR" value={config.cdrSnippetOverride || previewScript.actions.find((action) => action.caption === 'dados CDR')?.parameters?.[0] || ''} onChange={(value) => updateSnippetOverride('cdrSnippetOverride', value)} />
              <TextareaField label="Tratamento erro" value={config.errorSnippetOverride || previewScript.actions.find((action) => action.caption === 'Tratamento erro')?.parameters?.[0] || ''} onChange={(value) => updateSnippetOverride('errorSnippetOverride', value)} />
            </div>
          )}

          {step === 5 && (
            <div className="nice-review-grid">
              <ValidationPanel validation={validation} />
              <section className="panel-section nice-panel">
                <div className="section-header">
                  <h2>Actions</h2>
                  <span className="selected-pill">{previewScript.actions.length}</span>
                </div>
                <div className="nice-action-review-list">
                  {previewScript.actions.map((action) => (
                    <span key={action.actionId}>#{action.actionId} {action.action} - {action.caption}</span>
                  ))}
                </div>
              </section>
            </div>
          )}
        </div>

        <footer className="nice-wizard-footer">
          <button className="ghost-button" type="button" onClick={step === 0 ? onCancel : () => setStep((value) => value - 1)}>
            {step === 0 ? 'Cancelar' : 'Voltar'}
          </button>
          {step < steps.length - 1 ? (
            <button className="secondary-button" type="button" onClick={() => setStep((value) => value + 1)}>Next</button>
          ) : (
            <button className="secondary-button" type="button" onClick={() => onCreate(previewScript)} disabled={!validation.isValid}>
              Criar API no canvas
            </button>
          )}
        </footer>
      </section>
    </div>
  );
}

function MenuConfigPanel({ menu, onChange, onOptionChange, onAddOption, onRemoveOption }) {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <section className={`panel-section nice-panel nice-accordion-panel ${isOpen ? 'is-open' : ''}`}>
      <div className="section-header">
        <h2>Config menu</h2>
        <button className="ghost-button nice-accordion-toggle" type="button" onClick={() => setIsOpen((current) => !current)}>
          {isOpen ? 'Recolher' : 'Expandir'}
        </button>
      </div>
      {isOpen && (
        <div className="nice-accordion-content">
          <Field label="Nome" value={menu.scriptName} onChange={(value) => onChange({ scriptName: value })} />
          <Field label="Variavel resposta" value={menu.responseVariable} onChange={(value) => onChange({ responseVariable: value })} />
          <div className="nice-form-grid">
            <Field label="Prefixo audio" value={menu.audioPathVar} onChange={(value) => onChange({ audioPathVar: value })} />
            <Field label="Prefixo step" value={menu.pathStepVar} onChange={(value) => onChange({ pathStepVar: value })} />
          </div>
          <Field label="Audio INI" value={menu.noteIni} onChange={(value) => onChange({ noteIni: value })} />
          <div className="nice-form-grid">
            <Field label="Timeout" value={menu.timeout} onChange={(value) => onChange({ timeout: value })} />
            <Field label="Interdigit" value={menu.interDigitTimeout} onChange={(value) => onChange({ interDigitTimeout: value })} />
          </div>
          <RetryConfig title="REJ" enabled={menu.hasRej} attempts={menu.rejAttempts} audios={menu.rejRetryAudios} exit={menu.rejExit} onChange={(patch) => onChange(renameRetryPatch('rej', patch))} />
          <RetryConfig title="SIL" enabled={menu.hasSil} attempts={menu.silAttempts} audios={menu.silRetryAudios} exit={menu.silExit} onChange={(patch) => onChange(renameRetryPatch('sil', patch))} />
          <div className="nice-options-header">
            <strong>Opcoes</strong>
            <button className="icon-button" type="button" onClick={onAddOption} title="Adicionar opcao">
              <Plus size={15} />
            </button>
          </div>
          <div className="nice-option-list">
            {menu.options.map((option, index) => (
              <article className="nice-option-card" key={`${option.key}-${index}`}>
                <div className="nice-option-title">
                  <Field label="Tecla" value={option.key} onChange={(value) => onOptionChange(index, { key: value })} />
                  <button className="icon-button" type="button" onClick={() => onRemoveOption(index)} title="Remover opcao">
                    <Trash2 size={14} />
                  </button>
                </div>
                <Field label="Audio saida" value={option.audio} onChange={(value) => onOptionChange(index, { audio: value })} />
                <Field label="NEXT_STEP" value={option.nextStep} onChange={(value) => onOptionChange(index, { nextStep: value })} />
                <Field label="scriptpoint" value={option.scriptpoint} onChange={(value) => onOptionChange(index, { scriptpoint: value })} />
                <Field label="TransferCode" value={option.transferCode} onChange={(value) => onOptionChange(index, { transferCode: value })} />
              </article>
            ))}
          </div>
        </div>
      )}
    </section>
  );
}

function ApiDestinationEditor({ title, destination = {}, onChange }) {
  const type = destination.type || 'SNIPPET';

  return (
    <div className="nice-retry-card">
      <strong>{title}</strong>
      <SelectField
        label="Tipo de destino"
        value={type}
        onChange={(value) => onChange({ type: value, caption: defaultDestinationCaption(value) })}
        options={[
          { value: 'SNIPPET', label: 'Snippet' },
          { value: 'PLAY', label: 'Play' },
          { value: 'RUNSCRIPT', label: 'Runscript' },
          { value: 'NONE', label: 'Sem destino' },
        ]}
      />
      {type !== 'NONE' && (
        <Field label="Caption" value={destination.caption} onChange={(value) => onChange({ caption: value })} />
      )}
      {type === 'SNIPPET' && (
        <TextareaField label="Snippet code" value={destination.snippetCode} onChange={(value) => onChange({ snippetCode: value })} />
      )}
      {type === 'PLAY' && (
        <Field label="Prompt/audio" value={destination.prompt} onChange={(value) => onChange({ prompt: value })} />
      )}
      {type === 'RUNSCRIPT' && (
        <Field label="NEXT_STEP/script" value={destination.nextStep} onChange={(value) => onChange({ nextStep: value })} />
      )}
    </div>
  );
}

function RetryConfig({ title, enabled, attempts, audios = [], exit = {}, onChange }) {
  const count = Number(attempts) || 1;

  return (
    <div className="nice-retry-card">
      <CheckboxField label={`Tera ${title}`} checked={enabled} onChange={(checked) => onChange({ enabled: checked })} />
      <Field label={`Qtd ${title}`} value={attempts} onChange={(value) => onChange({ attempts: value, audios: resizeAudios(audios, value, title) })} />
      {enabled && Array.from({ length: Math.max(1, count) }, (_, index) => (
        <Field
          key={`${title}-audio-${index}`}
          label={`Audio ${title} tentativa ${index + 1}`}
          value={audios[index] ?? ''}
          onChange={(value) => {
            const nextAudios = resizeAudios(audios, count, title);
            nextAudios[index] = value;
            onChange({ audios: nextAudios });
          }}
        />
      ))}
      <Field label={`Saida ${title} audio`} value={exit.audio} onChange={(value) => onChange({ exit: { ...exit, audio: value } })} />
      <Field label={`Saida ${title} NEXT_STEP`} value={exit.nextStep} onChange={(value) => onChange({ exit: { ...exit, nextStep: value } })} />
      <Field label={`Saida ${title} scriptpoint`} value={exit.scriptpoint} onChange={(value) => onChange({ exit: { ...exit, scriptpoint: value } })} />
    </div>
  );
}

function EntryConfigPanel({ entry, onChange }) {
  return (
    <section className="panel-section nice-panel">
      <div className="section-header">
        <h2>Config entry</h2>
      </div>
      <Field label="Nome script" value={entry.scriptName} onChange={(value) => onChange({ scriptName: value })} />
      <Field label="App name" value={entry.appName} onChange={(value) => onChange({ appName: value })} />
      <Field label="PathAPI" value={entry.pathApi} onChange={(value) => onChange({ pathApi: value })} />
      <Field label="PathStep" value={entry.pathStep} onChange={(value) => onChange({ pathStep: value })} />
      <Field label="MAPA_DNA" value={entry.mapaDna} onChange={(value) => onChange({ mapaDna: value })} />
      <Field label="Next step" value={entry.nextStep} onChange={(value) => onChange({ nextStep: value })} />
    </section>
  );
}

function defaultDestinationCaption(type) {
  if (type === 'PLAY') return 'Play';
  if (type === 'RUNSCRIPT') return 'next__step';
  if (type === 'NONE') return 'Sem destino';
  return 'Snippet';
}

function renameRetryPatch(prefix, patch) {
  const keyPrefix = prefix === 'rej' ? 'rej' : 'sil';
  const result = {};
  if ('enabled' in patch) result[`has${capitalize(keyPrefix)}`] = patch.enabled;
  if ('attempts' in patch) result[`${keyPrefix}Attempts`] = patch.attempts;
  if ('audios' in patch) result[`${keyPrefix}RetryAudios`] = patch.audios;
  if ('exit' in patch) result[`${keyPrefix}Exit`] = patch.exit;
  return result;
}

function resizeAudios(audios = [], attempts, suffix) {
  const count = Math.max(1, Number(attempts) || 1);
  return Array.from({ length: count }, (_, index) => audios[index] || `CTL_MenuPadrao_${suffix}${index + 1 > 1 ? index + 1 : ''}.wav`);
}

function optionsFromMask(mask, currentOptions = []) {
  return String(mask)
    .split('-')
    .map((key) => key.trim())
    .filter(Boolean)
    .map((key, index) => {
      const existing = currentOptions.find((option) => option.key === key) ?? currentOptions[index];
      return existing
        ? { ...existing, key }
        : makeMenuOption(key, `Opcao${key}`, `CTL_Opcao${key}_INI.wav`, '');
    });
}

function capitalize(value) {
  return value.charAt(0).toUpperCase() + value.slice(1);
}







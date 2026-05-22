import { useEffect, useMemo, useRef, useState } from 'react';
import { AlertTriangle, CheckCircle2, ClipboardCopy, Copy, FileCode2, FileInput, LayoutGrid, Menu, Milestone, Plus, Save, Trash2 } from 'lucide-react';
import NiceScriptCanvas, { makeNiceEdgeId } from './NiceScriptCanvas.jsx';
import NiceSnippetCodeMirror from './NiceSnippetCodeMirror.jsx';
import { cloneNiceScript, getNextActionId, makeBranch, makeNiceAction, NICE_ACTION_LABELS } from '../services/niceScriptModel.js';
import { exportNiceClipboard } from '../services/niceClipboardExporter.js';
import {
  DEFAULT_API_CONFIG,
  DEFAULT_MENU_CONFIG,
  makeApiDestination,
  makeApiTemplate,
  makeEntryTemplate,
  makeMenuOption,
  makeMenuSnippets,
  makeMenuTemplate,
} from '../services/niceTemplateFactory.js';
import { parseNiceXml } from '../services/niceXmlParser.js';
import { validateNiceScript } from '../services/niceValidator.js';
import { organizeNiceScript } from '../services/niceLayout.js';

const DRAFT_STORAGE_KEY = 'ura-flow:nice-script:draft';
const CLONES_STORAGE_KEY = 'ura-flow:nice-script:clones';
const SNIPPET_THEME_STORAGE_KEY = 'ura-flow:nice-script:snippet-theme';
const MANUAL_ACTION_TYPES = ['BEGIN', 'SNIPPET', 'PLAY', 'RUNSCRIPT', 'RUNSUB', 'IF', 'LOOP', 'MENU', 'LOCATE', 'CASE', 'ASSIGN'];
const SNIPPET_VARIABLES = ['NEXT_STEP', 'AUDIO', 'MRES', 'OP_ESCOLHIDA', 'scriptpoint', 'MAPA_DNA', '{pathStep}', '{pathAPI}', '{path_audio}'];
const SNIPPET_BLOCKS = [
  {
    title: 'IF / ELSE',
    description: 'Estrutura condicional padrao.',
    code: 'IF NOME_VARIAVEL = "VALOR"\r\n{\r\n  \r\n}\r\nELSE\r\n{\r\n  \r\n}',
  },
  {
    title: 'SWITCH OP_ESCOLHIDA',
    description: 'Escolha por opcao digitada.',
    code: 'SWITCH OP_ESCOLHIDA\r\n{\r\n  CASE "1"\r\n  {\r\n    \r\n  }\r\n}',
  },
  {
    title: 'CASE "1"',
    description: 'Novo bloco CASE.',
    code: 'CASE "1"\r\n{\r\n  \r\n}',
  },
  {
    title: 'ASSIGN variavel',
    description: 'Atribuicao simples.',
    code: 'ASSIGN NOME_VARIAVEL="VALOR"',
  },
  {
    title: 'SET AUDIO + NEXT_STEP',
    description: 'Parametros principais de saida.',
    code: 'ASSIGN AUDIO="AUDIO.wav"\r\nASSIGN NEXT_STEP="{pathStep}Destino"\r\ninteractionLastDateTime=0',
  },
  {
    title: 'SET scriptpoint + MAPA_DNA',
    description: 'Rastreio de scriptpoint.',
    code: 'ASSIGN scriptpoint=0\r\nASSIGN MAPA_DNA="{MAPA_DNA}|{scriptpoint}"',
  },
  {
    title: 'SET TRANSFERCODE',
    description: 'Codigo de transferencia.',
    code: 'ASSIGN TRANSFERCODE="CODIGO.TRANSFER"',
  },
  {
    title: 'KeyTrace',
    description: 'Acumula opcao digitada.',
    code: 'ASSIGN global:KeyTrace="{KeyTrace}{MRES}"',
  },
  {
    title: 'Retorno API OK/ERRO',
    description: 'Trata retorno de API.',
    code: 'IF global:api_RET = "OK"\r\n{\r\n  ASSIGN NEXT_STEP="{pathStep}Sucesso"\r\n}\r\nELSE\r\n{\r\n  ASSIGN NEXT_STEP="{pathStep}Erro"\r\n}',
  },
  {
    title: 'Saida Transfer',
    description: 'Saida padrao para transferencia.',
    code: 'ASSIGN scriptpoint=0\r\nASSIGN MAPA_DNA="{MAPA_DNA}|{scriptpoint}"\r\nASSIGN AUDIO="PME_Transfer_ATH.wav"\r\nASSIGN NEXT_STEP="{pathStep}transfer"\r\nASSIGN TRANSFERCODE="TRANSFER.CODE"\r\ninteractionLastDateTime=0',
  },
  {
    title: 'Saida Tchau',
    description: 'Saida padrao de encerramento.',
    code: 'ASSIGN scriptpoint=0\r\nASSIGN MAPA_DNA="{MAPA_DNA}|{scriptpoint}"\r\nASSIGN AUDIO="PCI_Tchau.wav"\r\nASSIGN NEXT_STEP="{pathStep}Tchau"\r\ninteractionLastDateTime=0',
  },
  {
    title: 'Menu opcao escolhida',
    description: 'Normaliza resposta do menu.',
    code: 'OP_ESCOLHIDA="{mres}"\r\nASSIGN global:KeyTrace="{KeyTrace}{MRES}"',
  },
];

export default function NiceScriptWorkspace() {
  const [script, setScript] = useState(() => readStoredScript() ?? makeMenuTemplate());
  const [selectedActionId, setSelectedActionId] = useState(script.actions[0]?.actionId ?? null);
  const [clonedTemplates, setClonedTemplates] = useState(readClonedTemplates);
  const [copyText, setCopyText] = useState('');
  const [copyStatus, setCopyStatus] = useState('');
  const [importError, setImportError] = useState('');
  const [isMenuWizardOpen, setMenuWizardOpen] = useState(false);
  const [isApiWizardOpen, setApiWizardOpen] = useState(false);
  const [pendingTemplateInsert, setPendingTemplateInsert] = useState(null);
  const [templateInsertMode, setTemplateInsertMode] = useState('replace');
  const [manualActionType, setManualActionType] = useState('SNIPPET');
  const [pendingConnection, setPendingConnection] = useState(null);
  const [snippetStudioActionId, setSnippetStudioActionId] = useState(null);
  const [niceMode, setNiceMode] = useState('builder');
  const [simulationNodeOutputs, setSimulationNodeOutputs] = useState({});
  const fileInputRef = useRef(null);
  const validation = useMemo(() => validateNiceScript(script), [script]);
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
        <div>
          <h1>Script NICE</h1>
          <p>{script.name} - {script.actions.length} actions</p>
        </div>
        <div className="toolbar-context">
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
          {niceMode === 'builder' ? (
            <>
              <label className="nice-toolbar-add">
                <select value={manualActionType} onChange={(event) => setManualActionType(event.target.value)}>
                  {MANUAL_ACTION_TYPES.map((type) => (
                    <option value={type} key={type}>{type}</option>
                  ))}
                </select>
                <button className="ghost-button" type="button" onClick={() => addManualAction(manualActionType)}>
                  <Plus size={16} />
                  Adicionar action
                </button>
              </label>
              <button className="ghost-button" type="button" onClick={handleOrganizeScript} disabled={!script.actions.length}>
                <LayoutGrid size={16} />
                Organizar
              </button>
              <button className="ghost-button" type="button" onClick={clearCanvas} disabled={!script.actions.length}>
                <Trash2 size={16} />
                Limpar canvas
              </button>
              <button className="secondary-button" type="button" onClick={copyToNice}>
                <ClipboardCopy size={16} />
                Copiar para NICE
              </button>
            </>
          ) : (
            <button className="ghost-button" type="button" onClick={resetSimulation}>
              Resetar teste
            </button>
          )}
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
            onSelectAction={setSelectedActionId}
            onClearSelection={() => setSelectedActionId(null)}
          />

          <aside className="nice-simulator-right">
            <SimulationVariablesPanel variables={simulation.variables} warnings={simulation.warnings} />
            <SimulationTimeline simulation={simulation} />
            <ValidationPanel validation={validation} />
          </aside>
        </div>
      ) : (
        <div className="nice-workspace-grid">
        <aside className="nice-left-panel">
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
            <input ref={fileInputRef} className="sr-only" type="file" accept=".xml" onChange={handleImportXml} />
            <button className="nice-template-button" type="button" onClick={() => fileInputRef.current?.click()}>
              <FileInput size={17} />
              <span>
                <strong>Importar XML</strong>
                <small>Visualizar e clonar script NICE</small>
              </span>
            </button>
            {importError && <div className="nice-alert is-error">{importError}</div>}
          </section>

          <ActionPalette onAddAction={(type) => addManualAction(type)} />

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
        </aside>

        <NiceScriptCanvas
          script={script}
          selectedActionId={selectedActionId}
          simulation={null}
          onSelectAction={setSelectedActionId}
          onClearSelection={() => setSelectedActionId(null)}
          onMoveAction={updateActionPosition}
          onConnectActions={handleConnectActions}
          onDropAction={addManualAction}
          onDeleteConnection={deleteConnection}
          onDeleteAction={removeActionAndConnections}
        />

        <aside className="nice-right-panel">
          <ValidationPanel validation={validation} />
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
      {pendingTemplateInsert && (
        <TemplateInsertChoiceModal
          templateName={pendingTemplateInsert.label}
          onCancel={() => setPendingTemplateInsert(null)}
          onReplace={() => executeTemplateInsert(pendingTemplateInsert, 'replace')}
          onAppend={() => executeTemplateInsert(pendingTemplateInsert, 'append')}
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

function ConnectionModal({ connection, sourceAction, targetAction, onCancel, onApply }) {
  const connectionOptions = useMemo(() => getAvailableConnectionOptions(sourceAction), [sourceAction]);
  const [selectedKey, setSelectedKey] = useState(connectionOptions[0]?.key ?? '');
  const selectedOption = connectionOptions.find((option) => option.key === selectedKey) ?? connectionOptions[0] ?? null;
  const [caseValue, setCaseValue] = useState(selectedOption?.label ?? '');
  const [caseIndex, setCaseIndex] = useState(selectedOption?.index ?? 0);

  function selectOption(key) {
    const option = connectionOptions.find((item) => item.key === key);
    setSelectedKey(key);
    if (option) {
      setCaseValue(option.label);
      setCaseIndex(option.index);
    }
  }

  function applySelectedConnection() {
    if (!selectedOption) return;
    onApply({
      type: selectedOption.type,
      label: selectedOption.editable ? caseValue : selectedOption.label,
      index: selectedOption.editable ? caseIndex : selectedOption.index,
    });
  }

  return (
    <div className="nice-wizard-backdrop" role="presentation">
      <section className="nice-connection-modal" role="dialog" aria-modal="true" aria-label="Configurar conexao NICE">
        <header className="nice-wizard-header">
          <div>
            <h2>Configurar conexao</h2>
            <p>#{connection.sourceId} {sourceAction?.caption} {'->'} #{connection.targetId} {targetAction?.caption}</p>
          </div>
          <button className="ghost-button" type="button" onClick={onCancel}>Fechar</button>
        </header>
        <div className="nice-wizard-body">
          {connectionOptions.length ? (
            <>
              <SelectField
                label="Tipo de saida"
                value={selectedOption?.key}
                onChange={selectOption}
                options={connectionOptions.map((option) => ({
                  value: option.key,
                  label: option.selectLabel,
                }))}
              />
              {selectedOption?.editable ? (
                <div className="nice-form-grid">
                  <Field label="Valor do case" value={caseValue} onChange={setCaseValue} />
                  <Field label="Index" value={caseIndex} onChange={setCaseIndex} />
                </div>
              ) : (
                <div className="nice-selected-output">
                  <strong>{selectedOption?.selectLabel}</strong>
                  <small>{selectedOption?.description}</small>
                </div>
              )}
            </>
          ) : (
            <div className="nice-alert is-warning">
              Esse node nao possui saidas livres para nova conexao. Edite ou remova uma conexao existente no painel da action.
            </div>
          )}
        </div>
        <footer className="nice-wizard-footer">
          <button className="ghost-button" type="button" onClick={onCancel}>Cancelar</button>
          <button className="secondary-button" type="button" onClick={applySelectedConnection} disabled={!selectedOption}>Aplicar conexao</button>
        </footer>
      </section>
    </div>
  );
}

function SnippetStudio({ action, onCancel, onApply }) {
  const editorRef = useRef(null);
  const [code, setCode] = useState(action.parameters?.[0] ?? '');
  const [theme, setTheme] = useState(() => localStorage.getItem(SNIPPET_THEME_STORAGE_KEY) || 'light');
  const diagnostics = useMemo(() => validateNiceSnippetCode(code), [code]);

  useEffect(() => {
    localStorage.setItem(SNIPPET_THEME_STORAGE_KEY, theme);
  }, [theme]);

  function insertBlock(block) {
    editorRef.current?.insertText(block.code);
  }

  return (
    <div className="nice-wizard-backdrop" role="presentation">
      <section className="nice-snippet-studio" role="dialog" aria-modal="true" aria-label="Snippet Studio NICE">
        <header className="nice-wizard-header">
          <div>
            <h2>Snippet Studio</h2>
            <p>Action #{action.actionId} - {action.caption}</p>
          </div>
          <button className="ghost-button" type="button" onClick={onCancel}>Fechar</button>
        </header>

        <div className="nice-snippet-studio-body">
          <aside className="nice-snippet-library">
            <div className="section-header">
              <h2>Blocos prontos</h2>
            </div>
            <div className="nice-snippet-variable-list" aria-label="Variaveis comuns">
              {SNIPPET_VARIABLES.map((variable) => (
                <button type="button" key={variable} onClick={() => insertBlock({ code: variable })}>
                  {variable}
                </button>
              ))}
            </div>
            <div className="nice-snippet-block-list">
              {SNIPPET_BLOCKS.map((block) => (
                <button type="button" key={block.title} onClick={() => insertBlock(block)}>
                  <strong>{block.title}</strong>
                  <small>{block.description}</small>
                </button>
              ))}
            </div>
          </aside>

          <main className="nice-snippet-editor-shell">
            <div className="nice-snippet-editor-toolbar">
              <span>Snippet code</span>
              <div className="nice-theme-toggle" role="group" aria-label="Tema do editor">
                <button
                  className={theme === 'light' ? 'is-active' : ''}
                  type="button"
                  onClick={() => setTheme('light')}
                >
                  Claro
                </button>
                <button
                  className={theme === 'dark' ? 'is-active' : ''}
                  type="button"
                  onClick={() => setTheme('dark')}
                >
                  Escuro
                </button>
              </div>
            </div>
            <NiceSnippetCodeMirror
              ref={editorRef}
              value={code}
              diagnostics={diagnostics}
              theme={theme}
              onChange={setCode}
            />
          </main>

          <aside className="nice-snippet-validation">
            <div className="section-header">
              <h2>Validacao</h2>
            </div>
            {diagnostics.length ? (
              <div className="nice-validation-list">
                {diagnostics.map((diagnostic, index) => (
                  <div
                    className={`nice-alert ${diagnostic.severity === 'error' ? 'is-error' : 'is-warning'}`}
                    key={`${diagnostic.message}-${index}`}
                  >
                    {diagnostic.message}
                  </div>
                ))}
              </div>
            ) : (
              <p className="nice-empty-text">Nenhum aviso no snippet.</p>
            )}
          </aside>
        </div>

        <footer className="nice-wizard-footer">
          <button className="ghost-button" type="button" onClick={onCancel}>Cancelar</button>
          <div className="toolbar-context">
            <button className="ghost-button" type="button" onClick={() => setCode(formatNiceSnippet(code))}>Formatar</button>
            <button className="secondary-button" type="button" onClick={() => onApply(action.actionId, code)}>Aplicar no node</button>
          </div>
        </footer>
      </section>
    </div>
  );
}

function ActionPalette({ onAddAction }) {
  function handleDragStart(event, type) {
    event.dataTransfer.setData('application/nice-action', type);
    event.dataTransfer.effectAllowed = 'copy';
  }

  return (
    <section className="panel-section nice-panel">
      <div className="section-header">
        <h2>Paleta de actions</h2>
      </div>
      <div className="nice-action-palette">
        {MANUAL_ACTION_TYPES.map((type) => (
          <button
            className="nice-palette-item"
            draggable
            type="button"
            key={type}
            onClick={() => onAddAction(type)}
            onDragStart={(event) => handleDragStart(event, type)}
            title={`Arraste para o canvas ou clique para adicionar ${type}`}
          >
            <strong>{type}</strong>
            <small>{NICE_ACTION_LABELS[type] ?? type}</small>
          </button>
        ))}
      </div>
    </section>
  );
}

function ValidationPanel({ validation }) {
  return (
    <section className="panel-section nice-panel">
      <div className="section-header">
        <h2>Validacao</h2>
        {validation.isValid ? <CheckCircle2 size={16} /> : <AlertTriangle size={16} />}
      </div>
      {validation.errors.length === 0 && validation.warnings.length === 0 ? (
        <p className="nice-empty-text">Nenhum gap encontrado.</p>
      ) : (
        <div className="nice-validation-list">
          {validation.errors.map((message, index) => (
            <div className="nice-alert is-error" key={`error-${index}`}>{message}</div>
          ))}
          {validation.warnings.map((message, index) => (
            <div className="nice-alert is-warning" key={`warning-${index}`}>{message}</div>
          ))}
        </div>
      )}
    </section>
  );
}

function NiceSimulatorPanel({ script, simulation, onReset }) {
  const lastStep = simulation.steps.at(-1);

  return (
    <section className="panel-section nice-panel">
      <div className="section-header">
        <h2>Cenario de teste</h2>
        <span className="selected-pill">{simulation.actionIds.length} nodes</span>
      </div>
      <p className="nice-empty-text">
        Clique em cada node no canvas para escolher a saida simulada: MRES no MENU, retorno no RUNSUB, True/False no IF.
      </p>
      <button className="ghost-button full-width-button" type="button" onClick={onReset}>
        Resetar teste
      </button>
      {lastStep && (
        <div className="simulation-node-summary">
          <strong>Ultimo node: #{lastStep.actionId} {lastStep.caption}</strong>
          <small>{lastStep.branchLabel || 'sem saida configurada'}</small>
        </div>
      )}
      {simulation.reason && <div className="nice-alert is-warning">{simulation.reason}</div>}
      {script.actions.length === 0 && <div className="nice-alert is-warning">Canvas vazio. Volte ao Builder para montar um fluxo.</div>}
    </section>
  );
}

function SimulationNodeInspector({
  action,
  actions,
  variables,
  nodeOutput,
  onNodeOutputChange,
}) {
  if (!action) {
    return (
      <section className="panel-section nice-panel">
        <div className="section-header">
          <h2>Node selecionado</h2>
        </div>
        <p className="nice-empty-text">Selecione um node no canvas para configurar a saida dele durante o teste.</p>
      </section>
    );
  }

  const actionType = action.action;
  const responseVariable = action.parameters?.[7] || 'MRES';
  const menuOptions = getMenuMaskOptions(actions);
  const rawMenuOutputValue = nodeOutput.value ?? nodeOutput.customValue ?? '';
  const menuOutputValue = String(rawMenuOutputValue);
  const menuSelectionValue = nodeOutput.mode === 'timeout'
    ? '__timeout__'
    : nodeOutput.mode === 'custom' || (menuOutputValue && !menuOptions.includes(menuOutputValue))
      ? '__custom__'
      : nodeOutput.mode === 'value'
        ? menuOutputValue
        : '__initial__';
  const menuCustomValue = nodeOutput.customValue ?? (
    menuSelectionValue === '__custom__' ? menuOutputValue : variables[responseVariable] ?? variables.MRES ?? ''
  );
  const assignments = actionType === 'SNIPPET'
    ? extractSnippetAssignments(action.parameters?.[0] ?? '')
    : actionType === 'ASSIGN'
      ? extractAssignAction(action)
      : [];

  return (
    <section className="panel-section nice-panel">
      <div className="section-header">
        <h2>Node selecionado</h2>
        <span className="selected-pill">#{action.actionId} {actionType}</span>
      </div>
      <div className="simulation-node-summary">
        <strong>{action.caption}</strong>
        <small>{NICE_ACTION_LABELS[actionType] ?? actionType}</small>
      </div>

      {actionType === 'MENU' && (
        <>
          <SelectField
            label={`Saida ${responseVariable}`}
            value={menuSelectionValue}
            onChange={(value) => {
              if (value === '__initial__') {
                onNodeOutputChange({ type: 'menu', mode: 'initial', value: '', customValue: '' });
                return;
              }
              if (value === '__timeout__') {
                onNodeOutputChange({ type: 'menu', mode: 'timeout', value: '', customValue: '' });
                return;
              }
              if (value === '__custom__') {
                const customValue = menuCustomValue || variables[responseVariable] || variables.MRES || '';
                onNodeOutputChange({ type: 'menu', mode: 'custom', value: customValue, customValue });
                return;
              }
              onNodeOutputChange({ type: 'menu', mode: 'value', value });
            }}
            options={[
              { value: '__initial__', label: `Usar valor atual de ${responseVariable} (${variables[responseVariable] ?? variables.MRES ?? 'vazio'})` },
              ...menuOptions.map((option) => ({ value: option, label: `${responseVariable}=${option}` })),
              { value: '__custom__', label: 'Valor customizado / invalido' },
              { value: '__timeout__', label: 'Timeout' },
            ]}
          />
          {menuSelectionValue === '__custom__' && (
            <Field
              label={`${responseVariable} customizado`}
              value={menuCustomValue}
              onChange={(value) => {
                onNodeOutputChange({ type: 'menu', mode: 'custom', value, customValue: value });
              }}
            />
          )}
          <p className="nice-empty-text">Mascara detectada: {menuOptions.join('-') || 'nenhuma'}</p>
        </>
      )}

      {actionType === 'IF' && (
        <SelectField
          label="Resultado do IF"
          value={nodeOutput.branch ?? 'True'}
          onChange={(value) => onNodeOutputChange({ type: 'if', branch: value })}
          options={[
            { value: 'True', label: 'True' },
            { value: 'False', label: 'False / Else' },
          ]}
        />
      )}

      {actionType === 'CASE' && (
        <SelectField
          label="Case escolhido"
          value={nodeOutput.value ?? variables.MRES ?? '__default__'}
          onChange={(value) => {
            onNodeOutputChange({ type: 'case', value });
          }}
          options={[
            ...(action.cases ?? []).map((item) => ({ value: item.text, label: `CASE "${item.text}"` })),
            { value: '__default__', label: 'Default' },
          ]}
        />
      )}

      {actionType === 'LOCATE' && (
        <SelectField
          label="Resultado do LOCATE"
          value={nodeOutput.branch ?? 'auto'}
          onChange={(value) => onNodeOutputChange({ type: 'locate', branch: value })}
          options={[
            { value: 'auto', label: `Automatico por MRES=${variables.MRES ?? ''}` },
            { value: 'Found', label: 'Found' },
            { value: 'Default', label: 'Default' },
          ]}
        />
      )}

      {actionType === 'LOOP' && (
        <SelectField
          label="Resultado do LOOP"
          value={nodeOutput.branch ?? 'Finished'}
          onChange={(value) => onNodeOutputChange({ type: 'loop', branch: value })}
          options={[
            { value: 'Finished', label: 'Finished' },
            { value: 'Repeat', label: 'Repeat' },
          ]}
        />
      )}

      {actionType === 'RUNSUB' && (
        <div className="nice-form-grid">
          <Field
            label="Variavel retorno"
            value={nodeOutput.returnVariable ?? 'api_RET'}
            onChange={(value) => onNodeOutputChange({ type: 'runsub', returnVariable: value })}
          />
          <Field
            label="Valor retorno"
            value={nodeOutput.returnValue ?? variables[nodeOutput.returnVariable || 'api_RET'] ?? ''}
            onChange={(value) => {
              const variableName = nodeOutput.returnVariable || 'api_RET';
              onNodeOutputChange({ type: 'runsub', returnVariable: variableName, returnValue: value });
            }}
          />
        </div>
      )}

      {(actionType === 'SNIPPET' || actionType === 'ASSIGN') && (
        <div className="simulation-assignment-list">
          <strong>Variaveis detectadas</strong>
          {assignments.length === 0 ? (
            <p className="nice-empty-text">Nenhum ASSIGN simples detectado.</p>
          ) : assignments.map((item, index) => (
            <div className="simulation-assignment-row" key={`${item.name}-${index}`}>
              <span>{item.name}</span>
              <code>{item.value}</code>
            </div>
          ))}
        </div>
      )}

      {actionType === 'PLAY' && (
        <div className="nice-alert is-warning">Audio/prompt: {action.parameters?.[0] || 'nao preenchido'}</div>
      )}

      {actionType === 'RUNSCRIPT' && (
        <div className="nice-alert is-warning">Destino final: {action.parameters?.[0] || 'NEXT_STEP vazio'}</div>
      )}
    </section>
  );
}

function SimulationVariablesPanel({ variables, warnings }) {
  const entries = Object.entries(variables ?? {}).sort(([left], [right]) => left.localeCompare(right));

  return (
    <section className="panel-section nice-panel">
      <div className="section-header">
        <h2>Variaveis simuladas</h2>
        <span className="selected-pill">{entries.length}</span>
      </div>
      {entries.length === 0 ? (
        <p className="nice-empty-text">Nenhuma variavel definida no teste.</p>
      ) : (
        <div className="simulation-variable-table">
          {entries.map(([name, value]) => (
            <div className="simulation-variable-row" key={name}>
              <span>{name}</span>
              <code>{String(value)}</code>
            </div>
          ))}
        </div>
      )}
      {(warnings ?? []).map((message, index) => (
        <div className="nice-alert is-warning" key={`sim-warning-${index}`}>{message}</div>
      ))}
    </section>
  );
}

function SimulationTimeline({ simulation }) {
  return (
    <section className="panel-section nice-panel">
      <div className="section-header">
        <h2>Timeline</h2>
        <span className="selected-pill">{simulation.steps.length}</span>
      </div>
      {simulation.steps.length === 0 ? (
        <p className="nice-empty-text">Nenhum caminho executado.</p>
      ) : (
        <div className="simulation-timeline">
          {simulation.steps.map((step, index) => (
            <article className="simulation-timeline-item" key={`${step.actionId}-${index}`}>
              <div>
                <strong>#{step.actionId} {step.caption}</strong>
                <small>{step.action} - {step.branchLabel || 'sem saida'}</small>
              </div>
              {step.changes.length > 0 && (
                <div className="simulation-step-changes">
                  {step.changes.map((change) => (
                    <code key={`${change.name}-${change.value}`}>{change.name}={change.value}</code>
                  ))}
                </div>
              )}
            </article>
          ))}
        </div>
      )}
      {simulation.reason && <div className="nice-alert is-warning">{simulation.reason}</div>}
      {simulation.actionIds.length > 0 && (
        <div className="nice-simulation-path">
          {simulation.actionIds.map((actionId) => (
            <span key={actionId}>#{actionId}</span>
          ))}
        </div>
      )}
    </section>
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

function ActionEditor({ action, onChange, onParameterChange, onBranchChange, onDefaultChange, onRemove, onOpenSnippetStudio }) {
  if (!action) {
    return (
      <section className="panel-section nice-panel">
        <p className="nice-empty-text">Selecione uma action para editar propriedades.</p>
      </section>
    );
  }

  return (
    <section className="panel-section nice-panel">
      <div className="section-header">
        <h2>Action #{action.actionId}</h2>
        <span className="selected-pill">{action.action}</span>
      </div>
      <Field label="Caption" value={action.caption} onChange={(value) => onChange(action.actionId, () => ({ caption: value }))} />
      <Field label="Default ActionID" value={action.defaultNextAction?.actionId ?? ''} onChange={(value) => onDefaultChange(action.actionId, value)} />

      {action.action === 'MENU' && <MenuActionEditor action={action} onParameterChange={onParameterChange} />}
      {action.action === 'RUNSUB' && <RunsubActionEditor action={action} onParameterChange={onParameterChange} onChange={onChange} />}
      {action.action === 'PLAY' && <PlayActionEditor action={action} onParameterChange={onParameterChange} />}
      {action.action === 'IF' && <IfActionEditor action={action} onParameterChange={onParameterChange} />}
      {action.action === 'LOOP' && <LoopActionEditor action={action} onParameterChange={onParameterChange} />}
      {!['MENU', 'RUNSUB', 'PLAY', 'IF', 'LOOP'].includes(action.action) && (
        <GenericParameterEditor action={action} onParameterChange={onParameterChange} onOpenSnippetStudio={onOpenSnippetStudio} />
      )}

      <BranchEditor title="Branches" items={action.branches} type="branch" actionId={action.actionId} onChange={onBranchChange} />
      <BranchEditor title="Cases" items={action.cases} type="case" actionId={action.actionId} onChange={onBranchChange} />
      <button className="danger-button nice-remove-action" type="button" onClick={() => onRemove(action.actionId)}>
        <Trash2 size={15} />
        Remover action
      </button>
    </section>
  );
}

function MenuActionEditor({ action, onParameterChange }) {
  return (
    <div className="nice-editor-block">
      <strong>MENU</strong>
      <Field label="Prompt/menu audio" value={action.parameters?.[0] ?? ''} onChange={(value) => onParameterChange(action.actionId, 0, value)} />
      <div className="nice-form-grid">
        <Field label="Interruptible" value={action.parameters?.[2] ?? ''} onChange={(value) => onParameterChange(action.actionId, 2, value)} />
        <Field label="Min digits" value={action.parameters?.[3] ?? ''} onChange={(value) => onParameterChange(action.actionId, 3, value)} />
        <Field label="Timeout" value={action.parameters?.[5] ?? ''} onChange={(value) => onParameterChange(action.actionId, 5, value)} />
        <Field label="Interdigit" value={action.parameters?.[6] ?? ''} onChange={(value) => onParameterChange(action.actionId, 6, value)} />
      </div>
      <Field label="Variavel resposta" value={action.parameters?.[7] ?? ''} onChange={(value) => onParameterChange(action.actionId, 7, value)} />
    </div>
  );
}

function RunsubActionEditor({ action, onParameterChange, onChange }) {
  const params = action.parameters ?? [];
  const extraParams = params.slice(3).join('\n');

  return (
    <div className="nice-editor-block">
      <strong>RUNSUB</strong>
      <Field label="Script/API" value={params[0] ?? ''} onChange={(value) => onParameterChange(action.actionId, 0, value)} />
      <div className="nice-form-grid">
        <Field label="Destino retorno" value={params[1] ?? ''} onChange={(value) => onParameterChange(action.actionId, 1, value)} />
        <Field label="Tipo retorno" value={params[2] ?? ''} onChange={(value) => onParameterChange(action.actionId, 2, value)} />
      </div>
      <TextareaField
        label="Parametros enviados (um por linha)"
        value={extraParams}
        onChange={(value) => {
          const nextParams = value.split(/\r?\n/).map((item) => item.trim()).filter(Boolean);
          onChange(action.actionId, (current) => ({
            parameters: [
              current.parameters?.[0] ?? '',
              current.parameters?.[1] ?? '',
              current.parameters?.[2] ?? 'RTN',
              ...nextParams,
            ],
          }));
        }}
      />
    </div>
  );
}

function PlayActionEditor({ action, onParameterChange }) {
  return (
    <div className="nice-editor-block">
      <strong>PLAY</strong>
      <Field label="Prompt/audio" value={action.parameters?.[0] ?? ''} onChange={(value) => onParameterChange(action.actionId, 0, value)} />
      <div className="nice-form-grid">
        <Field label="Interruptible" value={action.parameters?.[2] ?? ''} onChange={(value) => onParameterChange(action.actionId, 2, value)} />
        <Field label="Clear digits" value={action.parameters?.[3] ?? ''} onChange={(value) => onParameterChange(action.actionId, 3, value)} />
      </div>
    </div>
  );
}

function IfActionEditor({ action, onParameterChange }) {
  return (
    <div className="nice-editor-block">
      <strong>IF</strong>
      <TextareaField label="Expressao" value={action.parameters?.[0] ?? ''} onChange={(value) => onParameterChange(action.actionId, 0, value)} />
    </div>
  );
}

function LoopActionEditor({ action, onParameterChange }) {
  return (
    <div className="nice-editor-block">
      <strong>LOOP</strong>
      <div className="nice-form-grid">
        <Field label="Quantidade max" value={action.parameters?.[0] ?? ''} onChange={(value) => onParameterChange(action.actionId, 0, value)} />
        <Field label="Contador" value={action.parameters?.[1] ?? ''} onChange={(value) => onParameterChange(action.actionId, 1, value)} />
      </div>
    </div>
  );
}

function GenericParameterEditor({ action, onParameterChange, onOpenSnippetStudio }) {
  return (
    <div className="nice-editor-block">
      <strong>Parametros</strong>
      {action.action === 'SNIPPET' ? (
        <>
          <label className="nice-field">
            <span>Snippet code</span>
            <textarea value={action.parameters?.[0] ?? ''} onChange={(event) => onParameterChange(action.actionId, 0, event.target.value)} />
          </label>
          <button className="secondary-button nice-snippet-studio-open" type="button" onClick={() => onOpenSnippetStudio(action.actionId)}>
            Abrir Snippet Studio
          </button>
          <Field label="Max string" value={action.parameters?.[1] ?? 'Limit2K'} onChange={(value) => onParameterChange(action.actionId, 1, value)} />
        </>
      ) : (
        <div className="nice-parameter-list">
          {(action.parameters ?? []).map((parameter, index) => (
            <Field
              key={`${action.actionId}-param-${index}`}
              label={`Parametro ${index + 1}`}
              value={parameter}
              onChange={(value) => onParameterChange(action.actionId, index, value)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function BranchEditor({ title, items = [], type, actionId, onChange }) {
  if (!items.length) return null;
  return (
    <div className="nice-editor-block">
      <strong>{title}</strong>
      {items.map((branch, index) => (
        <div className="nice-branch-row" key={`${type}-${actionId}-${index}`}>
          <input
            value={branch.text}
            onChange={(event) => onChange(actionId, type, index, { text: event.target.value })}
            aria-label={`${title} label`}
          />
          <input
            value={branch.actionId}
            onChange={(event) => onChange(actionId, type, index, { actionId: Number(event.target.value) || -1 })}
            aria-label={`${title} action id`}
          />
        </div>
      ))}
    </div>
  );
}

function CheckboxField({ label, checked, onChange }) {
  return (
    <label className="nice-checkbox-field">
      <input type="checkbox" checked={Boolean(checked)} onChange={(event) => onChange(event.target.checked)} />
      <span>{label}</span>
    </label>
  );
}

function TextareaField({ label, value, onChange }) {
  return (
    <label className="nice-field">
      <span>{label}</span>
      <textarea value={value ?? ''} onChange={(event) => onChange(event.target.value)} />
    </label>
  );
}

function SelectField({ label, value, onChange, options }) {
  return (
    <label className="nice-field">
      <span>{label}</span>
      <select value={value ?? ''} onChange={(event) => onChange(event.target.value)}>
        {options.map((option) => (
          <option key={option.value} value={option.value}>{option.label}</option>
        ))}
      </select>
    </label>
  );
}

function Field({ label, value, onChange }) {
  return (
    <label className="nice-field">
      <span>{label}</span>
      <input value={value ?? ''} onChange={(event) => onChange(event.target.value)} />
    </label>
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

function readStoredScript() {
  try {
    const raw = localStorage.getItem(DRAFT_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return parsed?.actions?.length ? parsed : null;
  } catch {
    return null;
  }
}

function readClonedTemplates() {
  try {
    const raw = localStorage.getItem(CLONES_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((item) => item?.actions?.length) : [];
  } catch {
    return [];
  }
}

function remapTemplateActionsForAppend(currentActions, templateActions) {
  const sourceActions = (templateActions ?? []).filter((action) => action.action !== 'BEGIN');
  if (sourceActions.length === 0) return { actions: [] };

  const currentMaxId = getNextActionId(currentActions) - 1;
  const idMap = new Map();
  sourceActions.forEach((action, index) => {
    idMap.set(Number(action.actionId), currentMaxId + index + 1);
  });

  const offset = calculateAppendOffset(currentActions, sourceActions);
  const actions = sourceActions.map((action) => remapTemplateAction(action, idMap, offset));
  return { actions };
}

function calculateAppendOffset(currentActions, sourceActions) {
  const currentMaxX = Math.max(120, ...currentActions.map((action) => Number(action.x) || 0));
  const currentMinY = Math.min(160, ...currentActions.map((action) => Number(action.y) || 0));
  const sourceMinX = Math.min(...sourceActions.map((action) => Number(action.x) || 0));
  const sourceMinY = Math.min(...sourceActions.map((action) => Number(action.y) || 0));
  return {
    x: currentMaxX + 260 - sourceMinX,
    y: Math.max(80, currentMinY) - sourceMinY,
  };
}

function remapTemplateAction(action, idMap, offset) {
  const nextId = idMap.get(Number(action.actionId));
  return {
    ...action,
    id: `nice-action-${nextId}`,
    actionId: nextId,
    x: Math.round((Number(action.x) || 0) + offset.x),
    y: Math.round((Number(action.y) || 0) + offset.y),
    defaultNextAction: remapBranch(action.defaultNextAction, idMap),
    branches: (action.branches ?? []).map((branch) => remapBranch(branch, idMap)).filter(Boolean),
    cases: (action.cases ?? []).map((branch) => remapBranch(branch, idMap)).filter(Boolean),
    parameters: [...(action.parameters ?? [])],
    extraInfo: remapExtraInfo(action.extraInfo, idMap),
  };
}

function remapBranch(branch, idMap) {
  if (!branch) return null;
  const oldId = Number(branch.actionId);
  const nextId = idMap.has(oldId) ? idMap.get(oldId) : -1;
  return {
    ...branch,
    actionId: nextId,
    segments: (branch.segments ?? []).map((segment) => ({ ...segment })),
  };
}

function remapExtraInfo(extraInfo, idMap) {
  if (!extraInfo) return null;
  const nextInfo = clonePlainObject(extraInfo);
  if (Array.isArray(nextInfo.Branches)) {
    nextInfo.Branches = nextInfo.Branches
      .map((branch) => remapExtraInfoBranch(branch, idMap))
      .filter(Boolean);
  }
  if (Array.isArray(nextInfo.CaseBranches)) {
    nextInfo.CaseBranches = nextInfo.CaseBranches
      .map((branch) => remapExtraInfoBranch(branch, idMap))
      .filter(Boolean);
  }
  if (nextInfo.DefaultBranch) {
    nextInfo.DefaultBranch = remapExtraInfoBranch(nextInfo.DefaultBranch, idMap) ?? {
      ...nextInfo.DefaultBranch,
      ActionId: -1,
    };
  }
  return nextInfo;
}

function remapExtraInfoBranch(branch, idMap) {
  if (!branch) return null;
  const oldId = Number(branch.ActionId);
  const nextId = idMap.has(oldId) ? idMap.get(oldId) : -1;
  if (nextId <= 0 && oldId > 0) return null;
  return {
    ...branch,
    ActionId: nextId,
    Segments: (branch.Segments ?? []).map((segment) => ({ ...segment })),
  };
}

function clonePlainObject(value) {
  if (typeof structuredClone === 'function') return structuredClone(value);
  return JSON.parse(JSON.stringify(value));
}

function makeDefaultAction(actionType, actionId, position = {}) {
  const base = {
    actionId,
    action: actionType,
    caption: defaultActionCaption(actionType),
    x: Math.round(position.x ?? 160),
    y: Math.round(position.y ?? 160),
  };

  if (actionType === 'BEGIN') {
    return makeNiceAction({
      ...base,
      caption: 'Begin',
      parameters: ['', '', ''],
      defaultNextAction: makeBranch(-1),
    });
  }
  if (actionType === 'SNIPPET') {
    return makeNiceAction({ ...base, parameters: ['', 'Limit2K'] });
  }
  if (actionType === 'PLAY') {
    return makeNiceAction({ ...base, parameters: ['""', '', 'True', 'False', '', '', '', ''] });
  }
  if (actionType === 'RUNSCRIPT') {
    return makeNiceAction({ ...base, caption: 'next__step', parameters: [''] });
  }
  if (actionType === 'RUNSUB') {
    return makeNiceAction({ ...base, caption: 'Ws_ChamadaApi', parameters: ['', '', 'RTN'] });
  }
  if (actionType === 'IF') {
    return makeNiceAction({
      ...base,
      caption: 'If',
      parameters: [''],
      branches: [makeBranch(-1, 'True', 0), makeBranch(-1, 'False', 1)],
    });
  }
  if (actionType === 'LOOP') {
    return makeNiceAction({
      ...base,
      caption: 'Loop',
      parameters: ['', ''],
      branches: [makeBranch(-1, 'Finished', 0), makeBranch(-1, 'Repeat', 1)],
    });
  }
  if (actionType === 'MENU') {
    return makeNiceAction({
      ...base,
      caption: 'Menu',
      parameters: ['{NOTEMENU}', '', 'True', '1', '', '5', '5', 'MRES'],
      defaultNextAction: makeBranch(-1),
      branches: [makeBranch(-1, 'Timeout', 2)],
    });
  }
  if (actionType === 'LOCATE') {
    return makeNiceAction({
      ...base,
      caption: 'Op esta na Mascara?',
      parameters: ['{MASCARA}', '{MRES}', 'OP_ESCOLHIDA', 'False'],
      defaultNextAction: makeBranch(-1),
      branches: [makeBranch(-1, 'Found', 0)],
    });
  }
  if (actionType === 'CASE') {
    return makeNiceAction({
      ...base,
      caption: 'Case',
      parameters: ['{MRES}'],
      defaultNextAction: makeBranch(-1),
      cases: [makeBranch(-1, '1', 0)],
    });
  }
  if (actionType === 'ASSIGN') {
    return makeNiceAction({
      ...base,
      caption: 'Assign',
      parameters: ['', '', 'String', '', 'False', 'False', 'Limit2K'],
    });
  }

  return makeNiceAction({ ...base, parameters: [] });
}

function defaultActionCaption(actionType) {
  return NICE_ACTION_LABELS[actionType] ?? actionType;
}

function upsertBranch(items, branch) {
  const branchText = String(branch.text ?? '').toLowerCase();
  const index = items.findIndex((item) => (
    Number(item.index) === Number(branch.index)
    || (branchText && String(item.text ?? '').toLowerCase() === branchText)
  ));

  if (index === -1) return [...items, branch];
  const nextItems = [...items];
  nextItems[index] = { ...nextItems[index], ...branch };
  return nextItems;
}

function sameBranch(left, right) {
  return Number(left?.actionId) === Number(right?.actionId)
    && Number(left?.index) === Number(right?.index)
    && String(left?.text ?? '') === String(right?.text ?? '');
}

function getAvailableConnectionOptions(sourceAction) {
  if (!sourceAction) return [];

  if (sourceAction.action === 'IF') {
    return [
      makeBranchOption(sourceAction, 'True', 0, 'Branch True', 'Caminho executado quando o IF for verdadeiro.'),
      makeBranchOption(sourceAction, 'False', 1, 'Branch False', 'Caminho executado quando o IF for falso.'),
    ].filter(Boolean);
  }

  if (sourceAction.action === 'LOOP') {
    return [
      makeBranchOption(sourceAction, 'Finished', 0, 'Branch Finished', 'Caminho quando o limite do loop for atingido.'),
      makeBranchOption(sourceAction, 'Repeat', 1, 'Branch Repeat', 'Caminho para repetir o loop.'),
    ].filter(Boolean);
  }

  if (sourceAction.action === 'MENU') {
    return [
      makeDefaultOption(sourceAction, 'DefaultNextAction', 'Caminho quando o cliente digita uma opcao.'),
      makeBranchOption(sourceAction, 'Timeout', 2, 'Branch Timeout', 'Caminho quando nao ha digitacao dentro do timeout.'),
    ].filter(Boolean);
  }

  if (sourceAction.action === 'LOCATE') {
    return [
      makeBranchOption(sourceAction, 'Found', 0, 'Branch Found', 'Caminho quando o valor foi encontrado na mascara.'),
      makeDefaultOption(sourceAction, 'DefaultNextAction', 'Caminho quando o valor nao foi encontrado.'),
    ].filter(Boolean);
  }

  if (sourceAction.action === 'CASE') {
    const nextCase = nextCaseValue(sourceAction.cases ?? []);
    return [
      makeDefaultOption(sourceAction, 'DefaultNextAction', 'Caminho padrao quando nenhum case casar.'),
      {
        key: `case-${nextCase}`,
        type: 'case',
        label: nextCase,
        index: nextCaseIndex(sourceAction.cases ?? []),
        selectLabel: 'Novo Case',
        description: 'Cria uma nova opcao de CASE com valor editavel.',
        editable: true,
      },
    ].filter(Boolean);
  }

  if (['RUNSCRIPT'].includes(sourceAction.action)) {
    return [];
  }

  return [
    makeDefaultOption(sourceAction, 'DefaultNextAction', 'Caminho padrao da action.'),
  ].filter(Boolean);
}

function makeDefaultOption(action, selectLabel, description) {
  if (isConnected(action.defaultNextAction)) return null;
  return {
    key: 'default',
    type: 'default',
    label: '',
    index: 0,
    selectLabel,
    description,
    editable: false,
  };
}

function makeBranchOption(action, label, index, selectLabel, description) {
  const existing = (action.branches ?? []).find((branch) => (
    String(branch.text ?? '').toLowerCase() === String(label).toLowerCase()
    || Number(branch.index) === Number(index)
  ));
  if (isConnected(existing)) return null;
  return {
    key: `branch-${label.toLowerCase()}`,
    type: 'branch',
    label,
    index,
    selectLabel,
    description,
    editable: false,
  };
}

function isConnected(branch) {
  return Number(branch?.actionId) > 0;
}

function nextCaseValue(cases) {
  const usedNumbers = new Set(
    cases
      .map((item) => Number(item.text))
      .filter((value) => Number.isFinite(value) && value > 0),
  );
  let value = 1;
  while (usedNumbers.has(value)) value += 1;
  return String(value);
}

function nextCaseIndex(cases) {
  return Math.max(-1, ...cases.map((item) => Number(item.index) || 0)) + 1;
}

function formatNiceSnippet(code) {
  let indent = 0;
  return String(code ?? '')
    .split(/\r?\n/)
    .map((line) => {
      const trimmed = line.trim();
      if (!trimmed) return '';
      if (trimmed.startsWith('}')) indent = Math.max(0, indent - 1);
      const formatted = `${'  '.repeat(indent)}${trimmed}`;
      if (trimmed.endsWith('{')) indent += 1;
      return formatted;
    })
    .join('\r\n');
}

function validateNiceSnippetCode(code) {
  const diagnostics = [];
  const text = String(code ?? '');
  if (!text.trim()) return diagnostics;

  diagnostics.push(...validateBalancedDelimiters(text));
  const lines = getSnippetLines(text);

  lines.forEach((line, index) => {
    const trimmed = stripLineComment(line.text).trim();
    if (!trimmed) return;

    const statementMatch = trimmed.match(/^(?:}\s*)?(IF|ELSE|SWITCH|SELECT|FUNCTION|FOR|FOREACH|REPEAT)\b/i);
    if (statementMatch && !hasBlockStart(lines, index)) {
      diagnostics.push(makeSnippetDiagnostic(
        'error',
        `${statementMatch[1].toUpperCase()} precisa abrir bloco com { }.`,
        line.from,
        line.from + line.text.length,
      ));
    }

    if (/^\s*ASSIGN\b/i.test(trimmed) && !trimmed.includes('=')) {
      diagnostics.push(makeSnippetDiagnostic('warning', 'ASSIGN sem sinal de =.', line.from, line.from + line.text.length));
    }

    const assignMatch = trimmed.match(/^\s*ASSIGN\s+([^\s=]+)/i);
    if (assignMatch && !isValidNiceVariable(assignMatch[1])) {
      const from = line.from + line.text.indexOf(assignMatch[1]);
      diagnostics.push(makeSnippetDiagnostic('warning', `Variavel "${assignMatch[1]}" pode ser invalida para NICE.`, from, from + assignMatch[1].length));
    }
  });

  if (/\bSWITCH\b/i.test(text) && !/\bCASE\b/i.test(text)) {
    const index = text.search(/\bSWITCH\b/i);
    diagnostics.push(makeSnippetDiagnostic('error', 'SWITCH precisa ter pelo menos um CASE.', index, index + 6));
  }

  findCaseOutsideSelection(text).forEach((diagnostic) => diagnostics.push(diagnostic));

  if (/scriptpoint/i.test(text) && !/MAPA_DNA/i.test(text)) {
    diagnostics.push(makeSnippetDiagnostic('warning', 'scriptpoint usado sem atualizar MAPA_DNA.', text.search(/scriptpoint/i)));
  }
  if (/MAPA_DNA/i.test(text) && !/scriptpoint/i.test(text)) {
    diagnostics.push(makeSnippetDiagnostic('warning', 'MAPA_DNA usado sem scriptpoint.', text.search(/MAPA_DNA/i)));
  }

  for (const match of text.matchAll(/ASSIGN\s+(?:global:)?AUDIO\s*=\s*"([^"]+)"/gi)) {
    const audio = match[1];
    if (audio && !audio.includes('{') && !/\.wav$/i.test(audio)) {
      diagnostics.push(makeSnippetDiagnostic('warning', `AUDIO "${audio}" nao termina em .wav.`, match.index, match.index + match[0].length));
    }
  }

  const looksLikeOutput = /AUDIO|TRANSFERCODE|scriptpoint|MAPA_DNA/i.test(text);
  if (looksLikeOutput && !/NEXT_STEP/i.test(text)) {
    diagnostics.push(makeSnippetDiagnostic('warning', 'Snippet parece ser de saida, mas nao define NEXT_STEP.', 0));
  }

  return diagnostics;
}

function makeSnippetDiagnostic(severity, message, from = 0, to = from + 1) {
  const safeFrom = Number.isFinite(from) && from >= 0 ? from : 0;
  const safeTo = Number.isFinite(to) && to > safeFrom ? to : safeFrom + 1;
  return { severity, message, from: safeFrom, to: safeTo };
}

function validateBalancedDelimiters(text) {
  const diagnostics = [];
  const openers = { '{': '}', '(': ')', '[': ']' };
  const closers = { '}': '{', ')': '(', ']': '[' };
  const stack = [];
  let quote = '';
  let escaped = false;
  let inComment = false;

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    const next = text[index + 1];

    if (inComment) {
      if (char === '\n') inComment = false;
      continue;
    }

    if (quote) {
      if (char === quote && !escaped) quote = '';
      escaped = char === '\\' && !escaped;
      if (char !== '\\') escaped = false;
      continue;
    }

    if (char === '/' && next === '/') {
      inComment = true;
      index += 1;
      continue;
    }

    if (char === '"' || char === "'") {
      quote = char;
      escaped = false;
      continue;
    }

    if (openers[char]) {
      stack.push({ char, index });
      continue;
    }

    if (closers[char]) {
      const last = stack.pop();
      if (!last || last.char !== closers[char]) {
        diagnostics.push(makeSnippetDiagnostic('error', `Fechamento "${char}" sem abertura correspondente.`, index, index + 1));
      }
    }
  }

  stack.forEach((item) => {
    diagnostics.push(makeSnippetDiagnostic('error', `Abertura "${item.char}" sem fechamento correspondente.`, item.index, item.index + 1));
  });

  return diagnostics;
}

function getSnippetLines(text) {
  return [...text.matchAll(/^.*$/gm)].map((match) => ({
    text: match[0],
    from: match.index,
  }));
}

function stripLineComment(line) {
  const index = line.indexOf('//');
  return index === -1 ? line : line.slice(0, index);
}

function hasBlockStart(lines, index) {
  const current = stripLineComment(lines[index]?.text ?? '');
  if (current.includes('{')) return true;
  const nextLine = lines.slice(index + 1).find((line) => stripLineComment(line.text).trim());
  return Boolean(nextLine && stripLineComment(nextLine.text).trim().startsWith('{'));
}

function isValidNiceVariable(variable) {
  return /^(?:global:)?[A-Za-z][A-Za-z0-9_$]*(?:\[[^\]]+\])?(?:\.[A-Za-z][A-Za-z0-9_$]*(?:\([^)]*\))?)*$/.test(variable);
}

function findCaseOutsideSelection(text) {
  const diagnostics = [];
  const lines = getSnippetLines(text);
  let depth = 0;
  let selectionDepth = 0;
  let pendingSelection = false;

  lines.forEach((line) => {
    const cleanLine = stripLineComment(line.text);
    const trimmed = cleanLine.trim();
    const startsSelection = /^(SWITCH|SELECT)\b/i.test(trimmed);
    const startsCase = /^(CASE|DEFAULT)\b/i.test(trimmed);
    const opens = (cleanLine.match(/\{/g) ?? []).length;
    const closes = (cleanLine.match(/\}/g) ?? []).length;

    if (startsCase && selectionDepth <= 0 && !pendingSelection) {
      diagnostics.push(makeSnippetDiagnostic('error', `${trimmed.split(/\s+/)[0].toUpperCase()} fora de SWITCH ou SELECT.`, line.from, line.from + line.text.length));
    }

    if (startsSelection) pendingSelection = true;
    if (pendingSelection && opens > 0) {
      selectionDepth += opens;
      pendingSelection = false;
    } else if (selectionDepth > 0) {
      selectionDepth += opens;
    }

    depth += opens - closes;
    if (selectionDepth > 0) selectionDepth = Math.max(0, selectionDepth - closes);
    if (depth < 0) depth = 0;
  });

  return diagnostics;
}

function simulateNiceFlow(script, context = {}) {
  const actions = script?.actions ?? [];
  if (!actions.length) {
    return {
      actionIds: [],
      edgeIds: [],
      reason: 'Canvas vazio para simular.',
      steps: [],
      variables: { ...(context.variables ?? {}) },
      warnings: [],
    };
  }

  const actionsById = new Map(actions.map((action) => [Number(action.actionId), action]));
  const root = actions.find((action) => action.action === 'BEGIN') ?? actions[0];
  const variables = { ...(context.variables ?? {}) };
  const nodeOutputs = context.nodeOutputs ?? {};
  const actionIds = [];
  const edgeIds = [];
  const steps = [];
  const warnings = [];
  const visited = new Set();
  let current = root;
  let reason = '';

  while (current && !visited.has(Number(current.actionId)) && actionIds.length < 80) {
    const currentId = Number(current.actionId);
    visited.add(currentId);
    actionIds.push(currentId);

    const nodeOutput = nodeOutputs[currentId] ?? {};
    const changes = applyNodeSimulationOutput(current, variables, nodeOutput);
    const next = chooseSimulationNext(current, actions, variables, nodeOutput);
    getNodeSimulationWarnings(current, variables, nodeOutput).forEach((message) => pushSimulationWarning(warnings, message));
    if (next?.warning) pushSimulationWarning(warnings, next.warning);
    steps.push({
      actionId: currentId,
      action: current.action,
      caption: current.caption,
      branchLabel: next?.label ?? '',
      changes,
    });

    if (!next?.branch || Number(next.branch.actionId) <= 0) {
      if (next?.reason) reason = next.reason;
      break;
    }

    const target = actionsById.get(Number(next.branch.actionId));
    if (!target) {
      reason = `${current.caption}: destino #${next.branch.actionId} nao existe.`;
      break;
    }

    edgeIds.push(makeNiceEdgeId(current.actionId, next.branch.actionId, next.label, next.branch.index));
    current = target;
  }

  if (current && visited.has(Number(current.actionId)) && !reason) {
    reason = `Simulacao parou para evitar loop no node #${current.actionId}.`;
  }

  if (!variables.NEXT_STEP && steps.some((step) => step.action === 'RUNSCRIPT')) {
    warnings.push('RUNSCRIPT encontrado, mas NEXT_STEP simulado esta vazio.');
  }

  return { actionIds, edgeIds, reason, steps, variables, warnings };
}

function chooseSimulationNext(action, actions, variables, nodeOutput = {}) {
  if (action.action === 'IF') {
    const wanted = String(nodeOutput.branch || 'True').toLowerCase();
    const branch = (action.branches ?? []).find((item) => normalizeBranchText(item.text) === wanted);
    return branch ? edgeChoice(branch, branch.text || capitalize(wanted)) : { reason: `${action.caption}: branch ${nodeOutput.branch || 'True'} nao configurada.` };
  }

  if (action.action === 'MENU') {
    const isTimeout = nodeOutput.mode === 'timeout';
    const branch = isTimeout
      ? (action.branches ?? []).find((item) => /timeout/i.test(item.text))
      : action.defaultNextAction;
    const label = isTimeout ? (branch?.text || 'Timeout') : 'Default';
    return branch ? edgeChoice(branch, label) : { reason: `${action.caption}: saida de MENU nao configurada.` };
  }

  if (action.action === 'LOCATE') {
    const mask = findMenuMask(actions);
    const responseValue = variables.MRES ?? variables.mres ?? '';
    const forced = nodeOutput.branch && nodeOutput.branch !== 'auto' ? nodeOutput.branch : '';
    const found = forced
      ? forced === 'Found'
      : Boolean(responseValue) && mask.includes(String(responseValue));
    const branch = found
      ? (action.branches ?? []).find((item) => /found/i.test(item.text))
      : action.defaultNextAction;
    let warning = '';
    if (!forced && !responseValue) {
      warning = `${action.caption}: MRES ainda nao foi definido; LOCATE seguira Default.`;
    } else if (!found && responseValue && mask.length > 0) {
      warning = `${action.caption}: MRES "${responseValue}" nao esta na mascara ${mask.join('-')}.`;
    }
    return branch ? edgeChoice(branch, found ? (branch.text || 'Found') : 'Default', warning) : { reason: `${action.caption}: saida de LOCATE nao configurada.`, warning };
  }

  if (action.action === 'CASE') {
    const value = String(nodeOutput.value && nodeOutput.value !== '__default__' ? nodeOutput.value : variables.MRES ?? '').trim();
    const caseBranch = (action.cases ?? []).find((item) => String(item.text).trim() === value);
    if (caseBranch) return edgeChoice(caseBranch, caseBranch.text || 'Case');
    const warning = value ? '' : `${action.caption}: MRES ainda nao foi definido; CASE seguira Default.`;
    return action.defaultNextAction
      ? edgeChoice(action.defaultNextAction, 'Default', warning)
      : { reason: `${action.caption}: CASE sem opcao ${value || '(vazia)'} e sem default.`, warning };
  }

  if (action.action === 'LOOP') {
    const wanted = nodeOutput.branch || 'Finished';
    const branch = (action.branches ?? []).find((item) => normalizeBranchText(item.text) === wanted.toLowerCase()) ?? action.branches?.[0];
    return branch ? edgeChoice(branch, branch.text || wanted) : { reason: `${action.caption}: LOOP sem branch para simular.` };
  }

  if (action.action === 'RUNSUB') {
    return action.defaultNextAction
      ? edgeChoice(action.defaultNextAction, 'Default')
      : { reason: `${action.caption}: RUNSUB finalizou sem proxima action.` };
  }

  if (action.defaultNextAction) return edgeChoice(action.defaultNextAction, 'Default');
  return { reason: `${action.caption}: fim do caminho simulado.` };
}

function applyNodeSimulationOutput(action, variables, nodeOutput = {}) {
  if (action.action === 'MENU') {
    const responseVariable = action.parameters?.[7] || 'MRES';
    if (nodeOutput.mode === 'timeout') {
      variables[responseVariable] = '';
      return [{ name: responseVariable, value: '' }];
    }
    const value = nodeOutput.mode === 'custom'
      ? nodeOutput.customValue ?? nodeOutput.value ?? ''
      : nodeOutput.mode === 'value'
        ? nodeOutput.value ?? ''
        : variables[responseVariable] ?? variables.MRES ?? '';
    variables[responseVariable] = value;
    return [{ name: responseVariable, value }];
  }

  if (action.action === 'RUNSUB') {
    const name = nodeOutput.returnVariable || 'api_RET';
    const value = nodeOutput.returnValue ?? variables[name] ?? '';
    variables[name] = value;
    return [{ name, value }];
  }

  if (action.action === 'SNIPPET') {
    return applyAssignments(variables, extractSnippetAssignments(action.parameters?.[0] ?? ''));
  }

  if (action.action === 'ASSIGN') {
    return applyAssignments(variables, extractAssignAction(action));
  }

  return [];
}

function applyAssignments(variables, assignments) {
  return assignments.map((assignment) => {
    variables[assignment.name] = assignment.value;
    return assignment;
  });
}

function getNodeSimulationWarnings(action, variables, nodeOutput = {}) {
  if (action.action === 'RUNSUB') {
    const name = nodeOutput.returnVariable || 'api_RET';
    const value = variables[name] ?? '';
    if (!value) return [`${action.caption}: retorno ${name} ainda nao foi preenchido no node.`];
  }
  return [];
}

function pushSimulationWarning(warnings, message) {
  if (message && !warnings.includes(message)) warnings.push(message);
}

function edgeChoice(branch, label, warning = '') {
  return { branch, label, warning };
}

function findMenuMask(actions) {
  const configCode = actions.find((action) => action.caption === 'CONFIG_MENU')?.parameters?.[0] ?? '';
  const mask = configCode.match(/ASSIGN\s+MASCARA\s*=\s*"([^"]+)"/i)?.[1] ?? '';
  return mask.split('-').map((item) => item.trim()).filter(Boolean);
}

function getMenuMaskOptions(actions) {
  const mask = findMenuMask(actions);
  if (mask.length > 0) return mask;
  const caseOptions = actions
    .flatMap((action) => action.cases ?? [])
    .map((item) => String(item.text ?? '').trim())
    .filter(Boolean);
  return [...new Set(caseOptions.length > 0 ? caseOptions : ['1', '2'])];
}

function extractSnippetAssignments(code) {
  const assignments = [];
  const pattern = /^\s*ASSIGN\s+([A-Za-z_][\w:]*|global:[A-Za-z_][\w:]*)\s*=\s*(.+?)\s*$/gim;
  for (const match of code.matchAll(pattern)) {
    assignments.push({
      name: match[1],
      value: cleanSimulationValue(match[2]),
    });
  }
  return assignments;
}

function extractAssignAction(action) {
  const name = action.parameters?.[0];
  if (!name) return [];
  return [{
    name,
    value: cleanSimulationValue(action.parameters?.[1] ?? ''),
  }];
}

function cleanSimulationValue(value) {
  return String(value ?? '')
    .trim()
    .replace(/^"|"$/g, '');
}

function normalizeBranchText(text) {
  const normalized = String(text || '').toLowerCase();
  if (normalized === 'else') return 'false';
  return normalized;
}

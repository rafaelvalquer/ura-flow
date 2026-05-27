import { useEffect, useMemo, useRef, useState } from 'react';
import { toPng } from 'html-to-image';
import { AlertTriangle, Braces, CheckCircle2, ClipboardCopy, Code2, Copy, CornerDownRight, Database, Download, FileCode2, FileInput, FileText, GitBranch, Globe2, KeyRound, LayoutGrid, LocateFixed, LogOut, Menu, MessageSquare, Milestone, MousePointerClick, PencilLine, Play, Plus, Repeat2, Save, Split, Trash2, Volume2, Workflow } from 'lucide-react';
import NiceScriptCanvas, { makeNiceEdgeId } from './NiceScriptCanvas.jsx';
import NiceDocumentationD3Flowchart from './NiceDocumentationD3Flowchart.jsx';
import NiceDocumentationFlowCanvas from './NiceDocumentationFlowCanvas.jsx';
import NiceDocumentationMermaidFlowchart from './NiceDocumentationMermaidFlowchart.jsx';
import NiceSnippetCodeMirror from './NiceSnippetCodeMirror.jsx';
import { cloneNiceScript, getNextActionId, makeBranch, makeNiceAction, NICE_ACTION_LABELS } from '../services/niceScriptModel.js';
import { exportNiceClipboard } from '../services/niceClipboardExporter.js';
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
} from '../services/niceTemplateFactory.js';
import { parseNiceXml } from '../services/niceXmlParser.js';
import { validateNiceScript } from '../services/niceValidator.js';
import { organizeNiceScript } from '../services/niceLayout.js';
import { generateNiceDocumentation } from '../services/niceDocumentationGenerator.js';
import { buildNiceDocumentationFlow } from '../services/niceDocumentationFlowBuilder.js';
import { normalizeDocumentationGraph } from '../services/niceDocumentationGraphNormalizer.js';
import { findDirectMenuCaseBranch, getDirectMenuCaseBranches, getDirectMenuCaseKeys } from '../services/niceMenuRouting.js';

const DRAFT_STORAGE_KEY = 'ura-flow:nice-script:draft';
const CLONES_STORAGE_KEY = 'ura-flow:nice-script:clones';
const SNIPPET_THEME_STORAGE_KEY = 'ura-flow:nice-script:snippet-theme';
const MANUAL_ACTION_TYPES = ['BEGIN', 'SNIPPET', 'PLAY', 'RUNSCRIPT', 'RUNSUB', 'REST_API', 'WORKFLOWDATA', 'RETURN', 'ANNOTATION', 'IF', 'LOOP', 'MENU', 'LOCATE', 'CASE', 'ASSIGN'];
const ACTION_PALETTE_GROUPS = [
  {
    key: 'entry',
    title: 'Entrada',
    accent: '#f59e0b',
    actions: ['BEGIN', 'MENU', 'PLAY'],
  },
  {
    key: 'routing',
    title: 'Roteamento',
    accent: '#0ea5e9',
    actions: ['LOCATE', 'CASE', 'IF', 'LOOP'],
  },
  {
    key: 'logic',
    title: 'Logica',
    accent: '#8b5cf6',
    actions: ['SNIPPET', 'ASSIGN', 'ANNOTATION'],
  },
  {
    key: 'integration',
    title: 'Integracoes',
    accent: '#06b6d4',
    actions: ['RUNSUB', 'REST_API', 'WORKFLOWDATA'],
  },
  {
    key: 'output',
    title: 'Saidas',
    accent: '#64748b',
    actions: ['RUNSCRIPT', 'RETURN'],
  },
];
const ACTION_PALETTE_META = {
  BEGIN: { icon: Play, description: 'Inicio do script e variaveis de entrada.' },
  MENU: { icon: Menu, description: 'Coleta DTMF, audio e timeout.' },
  PLAY: { icon: Volume2, description: 'Executa audio ou prompt.' },
  LOCATE: { icon: LocateFixed, description: 'Valida resposta dentro da mascara.' },
  CASE: { icon: Split, description: 'Roteia por opcao ou valor.' },
  IF: { icon: GitBranch, description: 'Regra com saidas True e False.' },
  LOOP: { icon: Repeat2, description: 'Controle de repeticao, SIL ou REJ.' },
  SNIPPET: { icon: Code2, description: 'Logica customizada NICE.' },
  ASSIGN: { icon: PencilLine, description: 'Atribuicao simples de variavel.' },
  ANNOTATION: { icon: MessageSquare, description: 'Nota visual no fluxo.' },
  RUNSUB: { icon: Workflow, description: 'Chama subscript/API e recebe retorno.' },
  REST_API: { icon: Globe2, description: 'Chamada HTTP com request/response.' },
  WORKFLOWDATA: { icon: KeyRound, description: 'Busca chaves e configuracoes.' },
  RUNSCRIPT: { icon: CornerDownRight, description: 'Envia para proximo fluxo/script.' },
  RETURN: { icon: LogOut, description: 'Finaliza retorno do script.' },
};
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
  const [isRestApiWizardOpen, setRestApiWizardOpen] = useState(false);
  const [pendingTemplateInsert, setPendingTemplateInsert] = useState(null);
  const [templateInsertMode, setTemplateInsertMode] = useState('replace');
  const [manualActionType, setManualActionType] = useState('SNIPPET');
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
          <button className="ghost-button" type="button" onClick={() => setDocumentationOpen(true)} disabled={!script.actions.length}>
            <FileText size={16} />
            Documentar fluxo
          </button>
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
          focusActionRequest={focusActionRequest}
          onSelectAction={setSelectedActionId}
          onClearSelection={() => setSelectedActionId(null)}
          onMoveAction={updateActionPosition}
          onConnectActions={handleConnectActions}
          onDropAction={addManualAction}
          onDeleteConnection={deleteConnection}
          onDeleteAction={removeActionAndConnections}
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

function ConnectionModal({ connection, sourceAction, targetAction, onCancel, onApply }) {
  const connectionOptions = useMemo(() => getAvailableConnectionOptions(sourceAction), [sourceAction]);
  const [selectedKey, setSelectedKey] = useState(connectionOptions[0]?.key ?? '');
  const selectedOption = connectionOptions.find((option) => option.key === selectedKey) ?? connectionOptions[0] ?? null;
  const [caseValue, setCaseValue] = useState(selectedOption?.label ?? '');
  const [caseIndex, setCaseIndex] = useState(selectedOption?.index ?? 0);
  const [responseVariable, setResponseVariable] = useState(selectedOption?.responseVariable ?? sourceAction?.parameters?.[7] ?? 'MRES');

  function selectOption(key) {
    const option = connectionOptions.find((item) => item.key === key);
    setSelectedKey(key);
    if (option) {
      setCaseValue(option.label);
      setCaseIndex(option.index);
      setResponseVariable(option.responseVariable ?? sourceAction?.parameters?.[7] ?? 'MRES');
    }
  }

  function applySelectedConnection() {
    if (!selectedOption) return;
    onApply({
      type: selectedOption.type,
      label: selectedOption.editable ? caseValue : selectedOption.label,
      index: selectedOption.editable ? caseIndex : selectedOption.index,
      responseVariable: selectedOption.responseVariableEditable ? responseVariable : undefined,
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
                  {selectedOption.responseVariableEditable ? (
                    <Field label="Variavel de resposta" value={responseVariable} onChange={setResponseVariable} />
                  ) : null}
                  <Field label="Valor da saida" value={caseValue} onChange={setCaseValue} />
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
          <button className="secondary-button" type="button" onClick={applySelectedConnection} disabled={!selectedOption || (selectedOption.editable && !String(caseValue).trim())}>Aplicar conexao</button>
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
  const [openGroups, setOpenGroups] = useState(() => ({ entry: true }));

  function toggleGroup(groupKey) {
    setOpenGroups((current) => ({
      ...current,
      [groupKey]: !current[groupKey],
    }));
  }

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
        {ACTION_PALETTE_GROUPS.map((group) => (
          <div className="nice-action-palette-group" key={group.key}>
            <button
              className="nice-action-palette-title"
              type="button"
              style={{ '--accent': group.accent }}
              aria-expanded={Boolean(openGroups[group.key])}
              onClick={() => toggleGroup(group.key)}
            >
              <span>{group.title}</span>
              <small>{group.actions.length}</small>
            </button>
            {openGroups[group.key] && (
              <div className="nice-action-palette-items">
                {group.actions.map((type) => {
                  const meta = ACTION_PALETTE_META[type] ?? {};
                  const Icon = meta.icon ?? Braces;
                  return (
                    <button
                      className="nice-palette-item"
                      draggable
                      type="button"
                      key={type}
                      data-group={group.key}
                      style={{ '--accent': group.accent }}
                      onClick={() => onAddAction(type)}
                      onDragStart={(event) => handleDragStart(event, type)}
                      title={`Arraste para o canvas ou clique para adicionar ${type}`}
                    >
                      <span className="nice-palette-icon" aria-hidden="true">
                        <Icon size={16} />
                      </span>
                      <span className="nice-palette-copy">
                        <strong>{NICE_ACTION_LABELS[type] ?? type}</strong>
                        <small>{meta.description ?? type}</small>
                      </span>
                      <span className="nice-palette-code">{type}</span>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        ))}
      </div>
    </section>
  );
}

function NiceDocumentationModal({ script, scriptName, markdown, flow, onClose, onFocusAction }) {
  const [activeTab, setActiveTab] = useState('markdown');
  const [viewMode, setViewMode] = useState('summary');
  const [status, setStatus] = useState('');
  const flowCanvasRef = useRef(null);
  const d3FlowRef = useRef(null);
  const mermaidFlowRef = useRef(null);
  const visualFlow = useMemo(() => normalizeDocumentationGraph(flow, { mode: viewMode }), [flow, viewMode]);

  async function copyMarkdown() {
    try {
      await navigator.clipboard.writeText(markdown);
      setStatus('Markdown copiado para o clipboard.');
    } catch {
      setStatus('Nao consegui acessar o clipboard. Selecione o texto no preview para copiar.');
    }
  }

  function downloadMarkdown() {
    const blob = new Blob([markdown], { type: 'text/markdown;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${sanitizeFileName(scriptName || 'script-nice')}-documentacao.md`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
    setStatus('Arquivo .md gerado.');
  }

  async function exportVisualPng() {
    if (activeTab === 'd3') {
      await exportD3Png();
      return;
    }

    if (activeTab === 'mermaid') {
      await exportMermaidPng();
      return;
    }

    if (!visualFlow?.nodes?.length) {
      setStatus('Nao ha fluxo visual para exportar.');
      return;
    }

    const exportNode = createDocumentationExportElement(visualFlow);
    document.body.appendChild(exportNode);

    try {
      await waitForExportLayout();
      const dataUrl = await toPng(exportNode, {
        backgroundColor: '#f8fafc',
        cacheBust: true,
        pixelRatio: 1.25,
      });
      const link = document.createElement('a');
      link.href = dataUrl;
      link.download = `${sanitizeFileName(scriptName || 'script-nice')}-fluxo-documental.png`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      setStatus('Imagem PNG do fluxo completo gerada.');
    } catch {
      setStatus('Nao consegui gerar o PNG do fluxo visual.');
    } finally {
      exportNode.remove();
    }
  }

  async function exportD3Png() {
    if (!d3FlowRef.current) {
      setStatus('Abra a aba Fluxograma D3 para exportar a imagem.');
      return;
    }

    const zoomLayer = d3FlowRef.current.querySelector('.nice-d3-zoom-layer');
    const previousTransform = zoomLayer?.getAttribute('transform') ?? null;

    try {
      zoomLayer?.removeAttribute('transform');
      await waitForExportLayout();
      const dataUrl = await toPng(d3FlowRef.current, {
        backgroundColor: '#f8fafc',
        cacheBust: true,
        pixelRatio: 1.25,
      });
      const link = document.createElement('a');
      link.href = dataUrl;
      link.download = `${sanitizeFileName(scriptName || 'script-nice')}-fluxograma-d3.png`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      setStatus('Imagem PNG do fluxograma D3 gerada.');
    } catch {
      setStatus('Nao consegui gerar o PNG do fluxograma D3.');
    } finally {
      if (zoomLayer && previousTransform) {
        zoomLayer.setAttribute('transform', previousTransform);
      }
    }
  }

  async function exportMermaidPng() {
    if (!mermaidFlowRef.current) {
      setStatus('Abra a aba Mermaid para exportar a imagem.');
      return;
    }

    try {
      await waitForExportLayout();
      const dataUrl = await toPng(mermaidFlowRef.current, {
        backgroundColor: '#f8fafc',
        cacheBust: true,
        pixelRatio: 1.25,
      });
      const link = document.createElement('a');
      link.href = dataUrl;
      link.download = `${sanitizeFileName(scriptName || 'script-nice')}-fluxograma-mermaid.png`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      setStatus('Imagem PNG do fluxograma Mermaid gerada.');
    } catch {
      setStatus('Nao consegui gerar o PNG do fluxograma Mermaid.');
    }
  }

  return (
    <div className="nice-wizard-backdrop" role="presentation">
      <section className="nice-documentation-modal" role="dialog" aria-modal="true" aria-label="Documentacao do fluxo NICE">
        <header className="nice-wizard-header">
          <div>
            <h2>Documentacao do fluxo</h2>
            <p>{scriptName}</p>
          </div>
          <button className="ghost-button" type="button" onClick={onClose}>Fechar</button>
        </header>
        <div className="nice-documentation-toolbar">
          <button className="secondary-button" type="button" onClick={copyMarkdown}>
            <Copy size={15} />
            Copiar Markdown
          </button>
          <button className="ghost-button" type="button" onClick={downloadMarkdown}>
            <Download size={15} />
            Baixar .md
          </button>
          <button className="ghost-button" type="button" onClick={exportVisualPng}>
            <Download size={15} />
            Exportar PNG
          </button>
          {status && <span>{status}</span>}
        </div>
        <div className="nice-documentation-view-mode" role="group" aria-label="Nivel de detalhe da documentacao grafica">
          <span>Visualizacao</span>
          <button
            className={viewMode === 'summary' ? 'is-active' : ''}
            type="button"
            onClick={() => setViewMode('summary')}
          >
            Resumido
          </button>
          <button
            className={viewMode === 'detail' ? 'is-active' : ''}
            type="button"
            onClick={() => setViewMode('detail')}
          >
            Detalhado
          </button>
        </div>
        <div className="nice-documentation-tabs" role="tablist" aria-label="Visualizacoes da documentacao">
          {[
            ['markdown', 'Markdown'],
            ['flow', 'Fluxo visual'],
            ['d3', 'Fluxograma D3'],
            ['mermaid', 'Mermaid'],
            ['paths', 'Caminhos'],
          ].map(([tab, label]) => (
            <button
              className={activeTab === tab ? 'is-active' : ''}
              type="button"
              role="tab"
              aria-selected={activeTab === tab}
              key={tab}
              onClick={() => setActiveTab(tab)}
            >
              {label}
            </button>
          ))}
        </div>
        {activeTab === 'markdown' && (
          <div className="nice-documentation-preview" aria-label="Preview Markdown">
            {markdown.split('\n').map((line, index) => (
              <div className={documentationLineClass(line)} key={`${index}-${line.slice(0, 16)}`}>
                {renderDocumentationLine(line, onFocusAction)}
              </div>
            ))}
          </div>
        )}
        {activeTab === 'flow' && (
          <NiceDocumentationFlowCanvas
            flow={visualFlow}
            canvasRef={flowCanvasRef}
            onFocusAction={onFocusAction}
          />
        )}
        {activeTab === 'd3' && (
          <NiceDocumentationD3Flowchart
            flow={visualFlow}
            exportRef={d3FlowRef}
            onFocusAction={onFocusAction}
          />
        )}
        {activeTab === 'mermaid' && (
          <NiceDocumentationMermaidFlowchart
            script={script}
            flow={visualFlow}
            mode={viewMode}
            exportRef={mermaidFlowRef}
            onFocusAction={onFocusAction}
          />
        )}
        {activeTab === 'paths' && (
          <div className="nice-documentation-paths" aria-label="Caminhos documentados">
            {(flow?.paths ?? []).length === 0 ? (
              <div className="nice-documentation-empty">
                <strong>Nenhum caminho interpretado ainda.</strong>
                <span>Menus, IFs, RUNSUBs e REST_API aparecem aqui quando existem no canvas.</span>
              </div>
            ) : (
              flow.paths.map((path, index) => (
                <article className="nice-documentation-path-card" key={`${path.title}-${index}`}>
                  <h3>{path.title}</h3>
                  <ol>
                    {path.items.map((item, itemIndex) => (
                      <li key={`${item}-${itemIndex}`}>{renderDocumentationLine(item, onFocusAction)}</li>
                    ))}
                  </ol>
                </article>
              ))
            )}
          </div>
        )}
      </section>
    </div>
  );
}

function renderDocumentationLine(line, onFocusAction) {
  const parts = [];
  const pattern = /#(\d+)/g;
  let lastIndex = 0;
  let match;

  while ((match = pattern.exec(line)) !== null) {
    if (match.index > lastIndex) parts.push(line.slice(lastIndex, match.index));
    const actionId = Number(match[1]);
    parts.push(
      <button
        className="nice-doc-action-link"
        type="button"
        key={`${actionId}-${match.index}`}
        onClick={() => onFocusAction?.(actionId)}
        title={`Focar ActionID ${actionId}`}
      >
        #{actionId}
      </button>,
    );
    lastIndex = match.index + match[0].length;
  }

  if (lastIndex < line.length) parts.push(line.slice(lastIndex));
  return parts.length ? parts : '\u00a0';
}

function documentationLineClass(line) {
  if (line.startsWith('# ')) return 'nice-doc-line is-h1';
  if (line.startsWith('## ')) return 'nice-doc-line is-h2';
  if (line.startsWith('### ')) return 'nice-doc-line is-h3';
  if (line.startsWith('|')) return 'nice-doc-line is-table';
  if (line.startsWith('```')) return 'nice-doc-line is-code-fence';
  return 'nice-doc-line';
}

function ValidationPanel({ validation, actions = [], onFocusAction }) {
  function renderItem(message, kind, index) {
    const action = findValidationAction(actions, message);
    const className = `nice-alert is-${kind}`;
    const key = `${kind}-${index}`;

    if (!action || !onFocusAction) {
      return <div className={className} key={key}>{message}</div>;
    }

    return (
      <button
        className={`${className} nice-validation-button`}
        type="button"
        key={key}
        onClick={() => onFocusAction(message)}
        title={`Selecionar node #${action.actionId}`}
      >
        <span>{message}</span>
        <small>Focar #{action.actionId}</small>
      </button>
    );
  }

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
          {validation.errors.map((message, index) => renderItem(message, 'error', index))}
          {validation.warnings.map((message, index) => renderItem(message, 'warning', index))}
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
  const menuOptions = getMenuMaskOptions(actions, action);
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
      {action.action === 'REST_API' && <RestApiActionEditor action={action} onParameterChange={onParameterChange} />}
      {action.action === 'WORKFLOWDATA' && <WorkflowDataActionEditor action={action} onParameterChange={onParameterChange} />}
      {action.action === 'RETURN' && <ReturnActionEditor action={action} onParameterChange={onParameterChange} />}
      {!['MENU', 'RUNSUB', 'PLAY', 'IF', 'LOOP', 'REST_API', 'WORKFLOWDATA', 'RETURN'].includes(action.action) && (
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

function RestApiActionEditor({ action, onParameterChange }) {
  return (
    <div className="nice-editor-block">
      <strong>REST_API</strong>
      <Field label="Operacao" value={action.parameters?.[0] ?? ''} onChange={(value) => onParameterChange(action.actionId, 0, value)} />
      <Field label="URL" value={action.parameters?.[1] ?? ''} onChange={(value) => onParameterChange(action.actionId, 1, value)} />
      <div className="nice-form-grid">
        <Field label="Header JSON" value={action.parameters?.[2] ?? ''} onChange={(value) => onParameterChange(action.actionId, 2, value)} />
        <Field label="Body JSON" value={action.parameters?.[3] ?? ''} onChange={(value) => onParameterChange(action.actionId, 3, value)} />
        <Field label="Metodo" value={action.parameters?.[4] ?? ''} onChange={(value) => onParameterChange(action.actionId, 4, value)} />
        <Field label="Timeout" value={action.parameters?.[5] ?? ''} onChange={(value) => onParameterChange(action.actionId, 5, value)} />
        <Field label="Resultset" value={action.parameters?.[6] ?? ''} onChange={(value) => onParameterChange(action.actionId, 6, value)} />
        <Field label="Error list" value={action.parameters?.[7] ?? ''} onChange={(value) => onParameterChange(action.actionId, 7, value)} />
      </div>
      <Field label="Response headers" value={action.parameters?.[8] ?? ''} onChange={(value) => onParameterChange(action.actionId, 8, value)} />
    </div>
  );
}

function WorkflowDataActionEditor({ action, onParameterChange }) {
  return (
    <div className="nice-editor-block">
      <strong>WORKFLOWDATA</strong>
      <Field label="Chave" value={action.parameters?.[0] ?? ''} onChange={(value) => onParameterChange(action.actionId, 0, value)} />
    </div>
  );
}

function ReturnActionEditor({ action, onParameterChange }) {
  return (
    <div className="nice-editor-block">
      <strong>RETURN</strong>
      <Field label="Valor retorno" value={action.parameters?.[0] ?? ''} onChange={(value) => onParameterChange(action.actionId, 0, value)} />
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

function sanitizeFileName(value) {
  return String(value || 'script-nice')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9._-]+/gi, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80) || 'script-nice';
}

function createDocumentationExportElement(flow) {
  const nodeWidth = 260;
  const nodeHeight = 142;
  const padding = 48;
  const nodes = flow?.nodes ?? [];
  const edges = flow?.edges ?? [];
  const minX = Math.min(...nodes.map((node) => node.position.x), 0);
  const minY = Math.min(...nodes.map((node) => node.position.y), 0);
  const maxX = Math.max(...nodes.map((node) => node.position.x + nodeWidth), nodeWidth);
  const maxY = Math.max(...nodes.map((node) => node.position.y + nodeHeight), nodeHeight);
  const width = Math.ceil(maxX - minX + padding * 2);
  const height = Math.ceil(maxY - minY + padding * 2);
  const offsetX = padding - minX;
  const offsetY = padding - minY;
  const nodeById = new Map(nodes.map((node) => [node.id, node]));

  const root = document.createElement('div');
  root.className = 'nice-documentation-export-canvas';
  root.style.width = `${width}px`;
  root.style.height = `${height}px`;
  root.style.position = 'fixed';
  root.style.left = '0';
  root.style.top = '0';
  root.style.zIndex = '-1';
  root.style.pointerEvents = 'none';
  root.style.background = '#f8fafc';

  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('width', String(width));
  svg.setAttribute('height', String(height));
  svg.setAttribute('viewBox', `0 0 ${width} ${height}`);
  svg.classList.add('nice-documentation-export-edges');

  const defs = document.createElementNS('http://www.w3.org/2000/svg', 'defs');
  ['default', 'success', 'warning', 'error'].forEach((kind) => {
    const marker = document.createElementNS('http://www.w3.org/2000/svg', 'marker');
    marker.setAttribute('id', `doc-export-arrow-${kind}`);
    marker.setAttribute('viewBox', '0 0 10 10');
    marker.setAttribute('refX', '9');
    marker.setAttribute('refY', '5');
    marker.setAttribute('markerWidth', '6');
    marker.setAttribute('markerHeight', '6');
    marker.setAttribute('orient', 'auto-start-reverse');
    const arrow = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    arrow.setAttribute('d', 'M 0 0 L 10 5 L 0 10 z');
    arrow.setAttribute('fill', documentationEdgeColor(kind));
    marker.appendChild(arrow);
    defs.appendChild(marker);
  });
  svg.appendChild(defs);

  edges.forEach((edge) => {
    const source = nodeById.get(edge.source);
    const target = nodeById.get(edge.target);
    if (!source || !target) return;
    const route = documentationExportEdgeRoute(edge, source, target, edges, offsetX, offsetY, nodeWidth, nodeHeight);
    const kind = documentationEdgeKind(edge);
    const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    const shadow = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    shadow.setAttribute('d', route.path);
    shadow.setAttribute('fill', 'none');
    shadow.setAttribute('stroke', '#f8fafc');
    shadow.setAttribute('stroke-width', '7');
    shadow.setAttribute('stroke-linecap', 'round');
    shadow.setAttribute('stroke-linejoin', 'round');
    svg.appendChild(shadow);

    path.setAttribute('d', route.path);
    path.setAttribute('fill', 'none');
    path.setAttribute('stroke', documentationEdgeColor(kind));
    path.setAttribute('stroke-width', '2');
    path.setAttribute('stroke-linecap', 'round');
    path.setAttribute('stroke-linejoin', 'round');
    path.setAttribute('marker-end', `url(#doc-export-arrow-${kind})`);
    svg.appendChild(path);

    if (edge.label) {
      const text = document.createElementNS('http://www.w3.org/2000/svg', 'text');
      text.setAttribute('x', String(route.labelX));
      text.setAttribute('y', String(route.labelY));
      text.setAttribute('text-anchor', 'middle');
      text.setAttribute('class', 'nice-documentation-export-edge-label');
      text.textContent = String(edge.label);
      svg.appendChild(text);
    }
  });

  root.appendChild(svg);

  nodes.forEach((node) => {
    const element = document.createElement('article');
    element.className = `nice-doc-flow-node nice-documentation-export-node is-${node.data?.docType ?? 'output'}`;
    element.style.left = `${node.position.x + offsetX}px`;
    element.style.top = `${node.position.y + offsetY}px`;
    element.style.width = `${nodeWidth}px`;

    const badge = document.createElement('div');
    badge.className = 'nice-doc-flow-node-badge';
    badge.textContent = documentationDocTypeLabel(node.data?.docType);
    element.appendChild(badge);

    const title = document.createElement('h3');
    title.textContent = node.data?.title ?? 'Fluxo';
    element.appendChild(title);

    if (node.data?.subtitle) {
      const subtitle = document.createElement('p');
      subtitle.textContent = node.data.subtitle;
      element.appendChild(subtitle);
    }

    if (node.data?.details?.length) {
      const dl = document.createElement('dl');
      node.data.details.slice(0, 4).forEach((item) => {
        const row = document.createElement('div');
        const dt = document.createElement('dt');
        const dd = document.createElement('dd');
        dt.textContent = item.label;
        dd.textContent = item.value;
        row.append(dt, dd);
        dl.appendChild(row);
      });
      element.appendChild(dl);
    }

    if (node.data?.actionIds?.length) {
      const action = document.createElement('span');
      action.className = 'nice-doc-flow-node-action';
      action.textContent = `#${node.data.actionIds.join(', #')}`;
      element.appendChild(action);
    }

    root.appendChild(element);
  });

  return root;
}

function documentationExportEdgeRoute(edge, source, target, edges, offsetX, offsetY, nodeWidth, nodeHeight) {
  const outgoing = edges.filter((item) => item.source === edge.source);
  const incoming = edges.filter((item) => item.target === edge.target);
  const sourceOffset = centeredEdgeOffset(outgoing, edge, 24);
  const targetOffset = centeredEdgeOffset(incoming, edge, 20);
  const sourceX = source.position.x + offsetX;
  const sourceY = source.position.y + offsetY;
  const targetX = target.position.x + offsetX;
  const targetY = target.position.y + offsetY;
  const isBackEdge = targetY <= sourceY;

  if (isBackEdge) {
    const sx = sourceX + nodeWidth;
    const sy = sourceY + nodeHeight / 2;
    const tx = targetX + nodeWidth;
    const ty = targetY + nodeHeight / 2;
    const sideX = Math.max(sourceX + nodeWidth, targetX + nodeWidth) + 64 + Math.abs(sourceOffset);
    return {
      path: `M ${sx} ${sy} L ${sideX} ${sy} L ${sideX} ${ty} L ${tx} ${ty}`,
      labelX: sideX + 4,
      labelY: (sy + ty) / 2 - 8,
    };
  }

  const sx = sourceX + nodeWidth / 2 + sourceOffset;
  const sy = sourceY + nodeHeight;
  const tx = targetX + nodeWidth / 2 + targetOffset;
  const ty = targetY;
  const midY = sy + Math.max(56, (ty - sy) / 2);
  const direction = Math.sign(tx - sx || 1);
  const bend = Math.min(18, Math.max(8, Math.abs(tx - sx) / 12));

  return {
    path: [
      `M ${sx} ${sy}`,
      `L ${sx} ${midY - bend}`,
      `Q ${sx} ${midY} ${sx + direction * bend} ${midY}`,
      `L ${tx - direction * bend} ${midY}`,
      `Q ${tx} ${midY} ${tx} ${midY + bend}`,
      `L ${tx} ${ty}`,
    ].join(' '),
    labelX: (sx + tx) / 2,
    labelY: midY - 10,
  };
}

function centeredEdgeOffset(group, edge, gap) {
  const index = group.indexOf(edge);
  if (index < 0) return 0;
  return (index - (group.length - 1) / 2) * gap;
}

function waitForExportLayout() {
  return new Promise((resolve) => {
    requestAnimationFrame(() => {
      requestAnimationFrame(resolve);
    });
  });
}

function documentationEdgeKind(edge) {
  const className = String(edge?.className ?? '');
  if (className.includes('success')) return 'success';
  if (className.includes('warning')) return 'warning';
  if (className.includes('error')) return 'error';
  return 'default';
}

function documentationEdgeColor(kind) {
  return {
    success: '#16a34a',
    warning: '#d97706',
    error: '#dc2626',
    default: '#64748b',
  }[kind] ?? '#64748b';
}

function documentationDocTypeLabel(type) {
  return {
    start: 'Inicio',
    menu: 'Menu',
    optionHub: 'Opcoes',
    option: 'DTMF',
    rule: 'Regra',
    api: 'API',
    hub: 'Hub',
    output: 'Saida',
    reject: 'Erro / REJ',
    silence: 'Silencio',
    onrelease: 'OnRelease',
  }[type] ?? 'Fluxo';
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
  if (actionType === 'REST_API') {
    return makeNiceAction({
      ...base,
      caption: 'consulta_servico',
      parameters: ['MakeRestRequest', '{url}', '{headerjson}', '{bodyjson}', 'POST', '4000', 'resultSet', 'errorArgList', 'responseHeaders'],
      defaultNextAction: makeBranch(-1),
    });
  }
  if (actionType === 'WORKFLOWDATA') {
    return makeNiceAction({
      ...base,
      caption: 'CHAVE APIs',
      parameters: ['API_Desliga'],
      defaultNextAction: makeBranch(-1),
    });
  }
  if (actionType === 'RETURN') {
    return makeNiceAction({ ...base, caption: 'Default', parameters: ['0'] });
  }
  if (actionType === 'ANNOTATION') {
    return makeNiceAction({ ...base, caption: 'Annotation', parameters: ['', '191', '116'] });
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

function findValidationAction(actions = [], message = '') {
  const text = String(message ?? '');
  const captionPrefix = text.split(':')[0]?.trim();
  if (!captionPrefix) return null;

  const exactCaption = actions.find((action) => String(action.caption ?? '').trim() === captionPrefix);
  if (exactCaption) return exactCaption;

  const idMatch = text.match(/ActionID\s+(\d+)|node\s+#?(\d+)|#(\d+)/i);
  const referencedId = Number(idMatch?.[1] ?? idMatch?.[2] ?? idMatch?.[3]);
  if (Number.isFinite(referencedId) && referencedId > 0) {
    const sourceAction = actions.find((action) => text.startsWith(`${action.caption}:`));
    if (sourceAction) return sourceAction;
    return actions.find((action) => Number(action.actionId) === referencedId) ?? null;
  }

  const lowerPrefix = captionPrefix.toLowerCase();
  return actions.find((action) => String(action.caption ?? '').trim().toLowerCase() === lowerPrefix) ?? null;
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
    const nextCase = nextCaseValue(getDirectMenuCaseBranches(sourceAction));
    return [
      makeDefaultOption(sourceAction, 'DefaultNextAction', 'Caminho quando o cliente digita uma opcao.'),
      makeBranchOption(sourceAction, 'Timeout', 2, 'Branch Timeout', 'Caminho quando nao ha digitacao dentro do timeout.'),
      {
        key: `menu-case-${nextCase}`,
        type: 'case',
        label: nextCase,
        index: nextCaseIndex(getDirectMenuCaseBranches(sourceAction)),
        selectLabel: 'Nova saida customizada',
        description: 'Cria uma saida do MENU pelo valor digitado na variavel de resposta.',
        editable: true,
        responseVariableEditable: true,
        responseVariable: sourceAction.parameters?.[7] || 'MRES',
      },
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

  if (['RUNSCRIPT', 'RETURN', 'ANNOTATION'].includes(sourceAction.action)) {
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
    const changes = applyNodeSimulationOutput(current, variables, nodeOutput, warnings);
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
    if (isTimeout) {
      const branch = (action.branches ?? []).find((item) => /timeout/i.test(item.text));
      const label = branch?.text || 'Timeout';
      return branch ? edgeChoice(branch, label) : { reason: `${action.caption}: saida de Timeout nao configurada.` };
    }

    const directCases = getDirectMenuCaseBranches(action);
    if (directCases.length) {
      const responseVariable = action.parameters?.[7] || 'MRES';
      const responseValue = variables[responseVariable] ?? variables.MRES ?? variables.mres ?? '';
      const branch = findDirectMenuCaseBranch(action, responseValue);
      if (branch) return edgeChoice(branch, branch.text || 'Case');
      const warning = responseValue ? `${action.caption}: ${responseVariable} "${responseValue}" nao existe nos CaseBranches.` : '';
      return action.defaultNextAction
        ? edgeChoice(action.defaultNextAction, 'Default', warning)
        : { reason: `${action.caption}: MENU sem CaseBranch ${responseValue || '(vazio)'} e sem default.`, warning };
    }

    const branch = action.defaultNextAction;
    const label = 'Default';
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

function applyNodeSimulationOutput(action, variables, nodeOutput = {}, warnings = []) {
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
    return applyAssignments(
      variables,
      extractSimulationAssignmentsForCode(action.parameters?.[0] ?? '', variables, warnings, action),
    );
  }

  if (action.action === 'ASSIGN') {
    return applyAssignments(variables, extractAssignAction(action));
  }

  return [];
}

function applyAssignments(variables, assignments) {
  const changes = [];
  assignments.forEach((assignment) => {
    const value = normalizeSimulationAssignmentValue(assignment.name, resolveSimulationValue(assignment.value, variables));
    variables[assignment.name] = value;
    changes.push({ ...assignment, value });

    if (isScriptpointVariable(assignment.name) && value !== '') {
      const nextPath = appendSimulationScriptpoint(variables.scriptpoint_path, value);
      variables.scriptpoint_path = nextPath;
      changes.push({ name: 'scriptpoint_path', value: nextPath });
    }
  });
  return changes;
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

function getMenuMaskOptions(actions, menu = null) {
  const mask = findMenuMask(actions);
  if (mask.length > 0) return mask;
  const directMenuOptions = getDirectMenuCaseKeys(menu);
  if (directMenuOptions.length > 0) return [...new Set(directMenuOptions)];
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

function extractSimulationAssignmentsForCode(code, variables, warnings, action) {
  const cleanCode = stripNiceLineComments(code);
  const workingVariables = { ...variables };
  return collectSimulationAssignmentsFromBlock(cleanCode, workingVariables, warnings, action?.caption || 'Snippet');
}

function collectSimulationAssignmentsFromBlock(code, variables, warnings, caption) {
  const assignments = [];
  let cursor = 0;
  const controlPattern = /\b(SWITCH|SELECT|IF)\b/gi;

  while (cursor < code.length) {
    controlPattern.lastIndex = cursor;
    const match = controlPattern.exec(code);
    if (!match) {
      const finalAssignments = extractPlainSimulationAssignments(code.slice(cursor));
      assignments.push(...finalAssignments);
      previewSimulationAssignments(variables, finalAssignments);
      break;
    }

    const plainAssignments = extractPlainSimulationAssignments(code.slice(cursor, match.index));
    assignments.push(...plainAssignments);
    previewSimulationAssignments(variables, plainAssignments);
    const keyword = match[1].toUpperCase();

    if (keyword === 'IF') {
      const parsedIf = parseNiceIfBlock(code, match.index);
      if (!parsedIf) {
        assignments.push(...extractPlainSimulationAssignments(code.slice(match.index, controlPattern.lastIndex)));
        cursor = controlPattern.lastIndex;
        continue;
      }

      const conditionResult = evaluateSimulationExpression(parsedIf.condition, variables);
      if (conditionResult.value === null) {
        pushSimulationWarning(
          warnings,
          `${caption}: condicao "${shortenSimulationText(parsedIf.condition, 80)}" nao pode ser avaliada; simulacao seguiu pelo True.`,
        );
      }
      const selectedBlock = conditionResult.value === false ? parsedIf.falseBlock : parsedIf.trueBlock;
      assignments.push(...collectSimulationAssignmentsFromBlock(selectedBlock, variables, warnings, caption));
      cursor = parsedIf.end;
      continue;
    }

    const parsedSelection = parseNiceSelectionBlock(code, match.index, keyword);
    if (!parsedSelection) {
      assignments.push(...extractPlainSimulationAssignments(code.slice(match.index, controlPattern.lastIndex)));
      cursor = controlPattern.lastIndex;
      continue;
    }

    const selectedBlock = keyword === 'SWITCH'
      ? pickSwitchCaseBlock(parsedSelection, variables, warnings, caption)
      : pickSelectCaseBlock(parsedSelection, variables);
    assignments.push(...collectSimulationAssignmentsFromBlock(selectedBlock, variables, warnings, caption));
    cursor = parsedSelection.end;
  }

  return assignments;
}

function previewSimulationAssignments(variables, assignments) {
  assignments.forEach((assignment) => {
    variables[assignment.name] = normalizeSimulationAssignmentValue(assignment.name, resolveSimulationValue(assignment.value, variables));
  });
}

function extractPlainSimulationAssignments(code) {
  const assignments = [];
  const pattern = /^\s*(?:ASSIGN\s+)?((?:global:)?[A-Za-z_][\w:.\[\]$]*)\s*=\s*(.+?)\s*$/gim;
  for (const match of code.matchAll(pattern)) {
    const name = match[1].trim();
    if (/^(IF|CASE|DEFAULT|ELSE|SWITCH|SELECT|FOR)$/i.test(name)) continue;
    assignments.push({
      name,
      value: cleanSimulationValue(match[2]),
    });
  }
  return assignments;
}

function parseNiceSelectionBlock(code, startIndex, keyword) {
  const openIndex = findNextCharOutsideQuotes(code, '{', startIndex);
  if (openIndex < 0) return null;
  const closeIndex = findMatchingBraceIndex(code, openIndex);
  if (closeIndex < 0) return null;
  const header = code.slice(startIndex + keyword.length, openIndex).trim();
  return {
    keyword,
    variable: header,
    cases: parseNiceCaseBlocks(code.slice(openIndex + 1, closeIndex)),
    end: closeIndex + 1,
  };
}

function parseNiceCaseBlocks(body) {
  const cases = [];
  const casePattern = /\b(CASE|DEFAULT)\b/gi;
  let match;

  while ((match = casePattern.exec(body))) {
    const keyword = match[1].toUpperCase();
    const openIndex = findNextCharOutsideQuotes(body, '{', casePattern.lastIndex);
    if (openIndex < 0) continue;
    const closeIndex = findMatchingBraceIndex(body, openIndex);
    if (closeIndex < 0) continue;
    const expression = body.slice(casePattern.lastIndex, openIndex).trim();
    cases.push({
      keyword,
      expression,
      value: keyword === 'CASE' ? cleanSimulationValue(expression) : 'DEFAULT',
      block: body.slice(openIndex + 1, closeIndex),
    });
    casePattern.lastIndex = closeIndex + 1;
  }

  return cases;
}

function pickSwitchCaseBlock(selection, variables, warnings, caption) {
  const variableName = cleanSimulationValue(selection.variable);
  const switchValue = getSimulationVariableValue(variables, variableName);
  const normalizedValue = String(switchValue ?? '').trim();
  const selectedCase = selection.cases.find((item) => (
    item.keyword === 'CASE' && String(item.value).trim().toLowerCase() === normalizedValue.toLowerCase()
  ));
  if (selectedCase) return selectedCase.block;

  const defaultCase = selection.cases.find((item) => item.keyword === 'DEFAULT');
  if (defaultCase) return defaultCase.block;

  pushSimulationWarning(
    warnings,
    `${caption}: SWITCH ${variableName || '(sem variavel)'} nao encontrou CASE para "${normalizedValue || 'vazio'}".`,
  );
  return '';
}

function pickSelectCaseBlock(selection, variables) {
  for (const item of selection.cases) {
    if (item.keyword === 'DEFAULT') continue;
    const result = evaluateSimulationExpression(item.expression, variables);
    if (result.value === true) return item.block;
  }
  return selection.cases.find((item) => item.keyword === 'DEFAULT')?.block ?? '';
}

function parseNiceIfBlock(code, startIndex) {
  const openIndex = findNextCharOutsideQuotes(code, '{', startIndex);
  if (openIndex < 0) return null;
  const closeIndex = findMatchingBraceIndex(code, openIndex);
  if (closeIndex < 0) return null;

  const condition = code.slice(startIndex + 2, openIndex).trim();
  let end = closeIndex + 1;
  let falseBlock = '';
  const afterTrue = skipWhitespace(code, end);

  if (/^ELSE\b/i.test(code.slice(afterTrue))) {
    const elseContentStart = skipWhitespace(code, afterTrue + 4);
    if (/^IF\b/i.test(code.slice(elseContentStart))) {
      const parsedElseIf = parseNiceIfBlock(code, elseContentStart);
      if (parsedElseIf) {
        falseBlock = code.slice(elseContentStart, parsedElseIf.end);
        end = parsedElseIf.end;
      }
    } else {
      const elseOpenIndex = findNextCharOutsideQuotes(code, '{', elseContentStart);
      if (elseOpenIndex >= 0) {
        const elseCloseIndex = findMatchingBraceIndex(code, elseOpenIndex);
        if (elseCloseIndex >= 0) {
          falseBlock = code.slice(elseOpenIndex + 1, elseCloseIndex);
          end = elseCloseIndex + 1;
        }
      }
    }
  }

  return {
    condition,
    trueBlock: code.slice(openIndex + 1, closeIndex),
    falseBlock,
    end,
  };
}

function evaluateSimulationExpression(expression, variables) {
  const text = trimOuterParentheses(String(expression ?? '').trim());
  if (!text) return { value: null };

  const orParts = splitSimulationExpression(text, /\|\||\|/);
  if (orParts.length > 1) {
    let hasUnknown = false;
    for (const part of orParts) {
      const result = evaluateSimulationExpression(part, variables);
      if (result.value === true) return { value: true };
      if (result.value === null) hasUnknown = true;
    }
    return { value: hasUnknown ? null : false };
  }

  const andParts = splitSimulationExpression(text, /&&|&/);
  if (andParts.length > 1) {
    let hasUnknown = false;
    for (const part of andParts) {
      const result = evaluateSimulationExpression(part, variables);
      if (result.value === false) return { value: false };
      if (result.value === null) hasUnknown = true;
    }
    return { value: hasUnknown ? null : true };
  }

  const containsMatch = text.match(/^(.+?)\.contains\((.+)\)$/i);
  if (containsMatch) {
    const source = getSimulationVariableValue(variables, containsMatch[1].trim());
    const needle = resolveSimulationExpressionValue(containsMatch[2].trim(), variables);
    if (source === undefined || needle === undefined) return { value: null };
    return { value: String(source).includes(String(needle)) };
  }

  const comparison = text.match(/^(.+?)\s*(==|=|!=|<>)\s*(.+)$/);
  if (comparison) {
    const leftUsesUpper = /\.upper\(\)$/i.test(comparison[1]);
    const rightUsesUpper = /\.upper\(\)$/i.test(comparison[3]);
    const left = getSimulationVariableValue(variables, comparison[1].replace(/\.upper\(\)$/i, '').trim());
    const right = resolveSimulationComparisonValue(comparison[3].replace(/\.upper\(\)$/i, '').trim(), variables);
    if (left === undefined || right === undefined) return { value: null };
    const normalizeUpper = leftUsesUpper || rightUsesUpper;
    const leftText = normalizeUpper ? String(left).toUpperCase() : String(left);
    const rightText = normalizeUpper ? String(right).toUpperCase() : String(right);
    const isEqual = leftText === rightText;
    return { value: comparison[2] === '!=' || comparison[2] === '<>' ? !isEqual : isEqual };
  }

  const booleanValue = getSimulationVariableValue(variables, text);
  if (booleanValue === undefined) return { value: null };
  return { value: coerceSimulationBoolean(booleanValue) };
}

function splitSimulationExpression(expression, delimiterPattern) {
  const parts = [];
  let quote = '';
  let depth = 0;
  let start = 0;

  for (let index = 0; index < expression.length; index += 1) {
    const char = expression[index];
    if (quote) {
      if (char === quote) quote = '';
      continue;
    }
    if (char === '"' || char === "'") {
      quote = char;
      continue;
    }
    if (char === '(') depth += 1;
    if (char === ')') depth = Math.max(0, depth - 1);
    if (depth === 0) {
      const rest = expression.slice(index);
      const match = rest.match(delimiterPattern);
      if (match && match.index === 0) {
        parts.push(expression.slice(start, index).trim());
        index += match[0].length - 1;
        start = index + 1;
      }
    }
  }

  parts.push(expression.slice(start).trim());
  return parts.filter(Boolean);
}

function resolveSimulationExpressionValue(value, variables) {
  const text = cleanSimulationValue(value);
  if (/^true$/i.test(text)) return 'true';
  if (/^false$/i.test(text)) return 'false';
  if (/^-?\d+(?:\.\d+)?$/.test(text)) return text;
  if (text.includes('{')) return resolveSimulationValue(text, variables);
  const variableValue = getSimulationVariableValue(variables, text);
  return variableValue === undefined ? text : variableValue;
}

function resolveSimulationComparisonValue(value, variables) {
  const rawText = String(value ?? '').trim();
  const text = cleanSimulationValue(rawText);
  const isQuoted = /^["'].*["']$/.test(rawText);
  if (isQuoted || /^true$/i.test(text) || /^false$/i.test(text) || /^-?\d+(?:\.\d+)?$/.test(text)) return text;
  if (text.includes('{')) return resolveSimulationValue(text, variables);
  return getSimulationVariableValue(variables, text);
}

function coerceSimulationBoolean(value) {
  const text = String(value ?? '').trim().toLowerCase();
  if (['true', 'sim', '1', 'ligado', 'ok', 'yes'].includes(text)) return true;
  if (['false', 'nao', '0', 'desligado', 'nok', 'no', ''].includes(text)) return false;
  return null;
}

function resolveSimulationValue(value, variables) {
  return String(value ?? '').replace(/\{([^}]+)\}/g, (_, variableName) => {
    const variableValue = getSimulationVariableValue(variables, variableName.trim());
    return variableValue ?? '';
  });
}

function getSimulationVariableValue(variables, variableName) {
  const cleanName = cleanSimulationValue(variableName).replace(/^\{|\}$/g, '');
  if (!cleanName) return undefined;
  if (Object.prototype.hasOwnProperty.call(variables, cleanName)) return variables[cleanName];
  const foundKey = Object.keys(variables).find((key) => key.toLowerCase() === cleanName.toLowerCase());
  return foundKey ? variables[foundKey] : undefined;
}

function normalizeSimulationAssignmentValue(name, value) {
  if (isMapaDnaVariable(name)) return normalizeScriptpointMapValue(value);
  return cleanSimulationValue(value);
}

function normalizeScriptpointMapValue(value) {
  return String(value ?? '')
    .split('|')
    .map((item) => item.trim())
    .filter(Boolean)
    .join('|');
}

function appendSimulationScriptpoint(currentPath, scriptpoint) {
  return [...normalizeScriptpointMapValue(currentPath).split('|').filter(Boolean), String(scriptpoint).trim()]
    .filter(Boolean)
    .join('|');
}

function isScriptpointVariable(name) {
  return String(name ?? '').replace(/^global:/i, '').toLowerCase() === 'scriptpoint';
}

function isMapaDnaVariable(name) {
  return ['mapa_dna', 'mapadna'].includes(String(name ?? '').replace(/^global:/i, '').toLowerCase());
}

function stripNiceLineComments(code) {
  return String(code ?? '')
    .split(/\r?\n/)
    .map(stripNiceLineComment)
    .join('\n');
}

function stripNiceLineComment(line) {
  let quote = '';
  for (let index = 0; index < line.length - 1; index += 1) {
    const char = line[index];
    if (quote) {
      if (char === quote) quote = '';
      continue;
    }
    if (char === '"' || char === "'") {
      quote = char;
      continue;
    }
    if (char === '/' && line[index + 1] === '/') return line.slice(0, index);
  }
  return line;
}

function findNextCharOutsideQuotes(text, target, startIndex = 0) {
  let quote = '';
  for (let index = startIndex; index < text.length; index += 1) {
    const char = text[index];
    if (quote) {
      if (char === quote) quote = '';
      continue;
    }
    if (char === '"' || char === "'") {
      quote = char;
      continue;
    }
    if (char === target) return index;
  }
  return -1;
}

function findMatchingBraceIndex(text, openIndex) {
  let quote = '';
  let depth = 0;
  for (let index = openIndex; index < text.length; index += 1) {
    const char = text[index];
    if (quote) {
      if (char === quote) quote = '';
      continue;
    }
    if (char === '"' || char === "'") {
      quote = char;
      continue;
    }
    if (char === '{') depth += 1;
    if (char === '}') {
      depth -= 1;
      if (depth === 0) return index;
    }
  }
  return -1;
}

function skipWhitespace(text, startIndex) {
  let index = startIndex;
  while (index < text.length && /\s/.test(text[index])) index += 1;
  return index;
}

function trimOuterParentheses(value) {
  let text = value.trim();
  while (text.startsWith('(') && text.endsWith(')')) {
    const closeIndex = findMatchingParenthesisIndex(text, 0);
    if (closeIndex !== text.length - 1) break;
    text = text.slice(1, -1).trim();
  }
  return text;
}

function findMatchingParenthesisIndex(text, openIndex) {
  let quote = '';
  let depth = 0;
  for (let index = openIndex; index < text.length; index += 1) {
    const char = text[index];
    if (quote) {
      if (char === quote) quote = '';
      continue;
    }
    if (char === '"' || char === "'") {
      quote = char;
      continue;
    }
    if (char === '(') depth += 1;
    if (char === ')') {
      depth -= 1;
      if (depth === 0) return index;
    }
  }
  return -1;
}

function shortenSimulationText(value, maxLength) {
  const text = String(value ?? '').replace(/\s+/g, ' ').trim();
  return text.length > maxLength ? `${text.slice(0, maxLength - 3)}...` : text;
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
    .replace(/^["']|["']$/g, '');
}

function normalizeBranchText(text) {
  const normalized = String(text || '').toLowerCase();
  if (normalized === 'else') return 'false';
  return normalized;
}

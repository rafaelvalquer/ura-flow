import { useEffect, useMemo, useRef, useState } from 'react';
import { AlertTriangle, CheckCircle2, ClipboardCopy, Copy, FileCode2, FileInput, LayoutGrid, Menu, Milestone, Plus, Save, Trash2 } from 'lucide-react';
import NiceScriptCanvas from './NiceScriptCanvas.jsx';
import { cloneNiceScript } from '../services/niceScriptModel.js';
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

export default function NiceScriptWorkspace() {
  const [script, setScript] = useState(() => readStoredScript() ?? makeMenuTemplate());
  const [selectedActionId, setSelectedActionId] = useState(script.actions[0]?.actionId ?? null);
  const [clonedTemplates, setClonedTemplates] = useState(readClonedTemplates);
  const [copyText, setCopyText] = useState('');
  const [copyStatus, setCopyStatus] = useState('');
  const [importError, setImportError] = useState('');
  const [isMenuWizardOpen, setMenuWizardOpen] = useState(false);
  const [isApiWizardOpen, setApiWizardOpen] = useState(false);
  const fileInputRef = useRef(null);
  const validation = useMemo(() => validateNiceScript(script), [script]);
  const selectedAction = script.actions.find((action) => Number(action.actionId) === Number(selectedActionId));

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

  function handleCreateMenuFromWizard(nextScript) {
    setMenuWizardOpen(false);
    loadScript(nextScript);
  }

  function handleCreateApiFromWizard(nextScript) {
    setApiWizardOpen(false);
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

  async function copyToNice() {
    const output = exportNiceClipboard(script);
    setCopyText(output);

    try {
      await navigator.clipboard.writeText(output);
      setCopyStatus('Texto copiado para colar no NICE Studio.');
    } catch {
      setCopyStatus('Nao consegui acessar o clipboard; use o texto gerado abaixo.');
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
          <button className="ghost-button" type="button" onClick={() => setMenuWizardOpen(true)}>
            <Menu size={16} />
            Novo menu
          </button>
          <button className="ghost-button" type="button" onClick={() => loadScript(makeEntryTemplate())}>
            <FileCode2 size={16} />
            Novo entry
          </button>
          <button className="ghost-button" type="button" onClick={() => setApiWizardOpen(true)}>
            <Milestone size={16} />
            Nova API
          </button>
          <button className="ghost-button" type="button" onClick={handleOrganizeScript} disabled={!script.actions.length}>
            <LayoutGrid size={16} />
            Organizar
          </button>
          <button className="secondary-button" type="button" onClick={copyToNice} disabled={!validation.isValid}>
            <ClipboardCopy size={16} />
            Copiar para NICE
          </button>
        </div>
      </header>

      <div className="nice-workspace-grid">
        <aside className="nice-left-panel">
          <section className="panel-section nice-panel">
            <div className="section-header">
              <h2>Templates</h2>
            </div>
            <button className="nice-template-button" type="button" onClick={() => setMenuWizardOpen(true)}>
              <Menu size={17} />
              <span>
                <strong>Menu padrao NICE</strong>
                <small>Wizard com SET_PARAMS, SIL e REJ</small>
              </span>
            </button>
            <button className="nice-template-button" type="button" onClick={() => loadScript(makeEntryTemplate())}>
              <FileCode2 size={17} />
              <span>
                <strong>Entry padrao PCI</strong>
                <small>BEGIN, env/path, RUNSCRIPT</small>
              </span>
            </button>
            <button className="nice-template-button" type="button" onClick={() => setApiWizardOpen(true)}>
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
                    <button type="button" onClick={() => loadScript(clone)}>
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
          onSelectAction={setSelectedActionId}
          onClearSelection={() => setSelectedActionId(null)}
          onMoveAction={updateActionPosition}
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
          />
          <section className="panel-section nice-panel">
            <div className="section-header">
              <h2>Saida NICE</h2>
              <button className="icon-button" type="button" onClick={copyToNice} disabled={!validation.isValid} title="Copiar para NICE">
                <Copy size={15} />
              </button>
            </div>
            {copyStatus && <div className="nice-alert is-success">{copyStatus}</div>}
            {copyText && <textarea className="nice-output-preview" readOnly value={copyText} />}
          </section>
        </aside>
      </div>
      {isMenuWizardOpen && (
        <NiceMenuWizard
          initialConfig={script.templateType === 'menu' ? script.metadata?.menu : DEFAULT_MENU_CONFIG}
          onCancel={() => setMenuWizardOpen(false)}
          onCreate={handleCreateMenuFromWizard}
        />
      )}
      {isApiWizardOpen && (
        <NiceApiWizard
          initialConfig={script.templateType === 'api' ? script.metadata?.api : DEFAULT_API_CONFIG}
          onCancel={() => setApiWizardOpen(false)}
          onCreate={handleCreateApiFromWizard}
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

function MenuConfigPanel({ menu, onChange, onOptionChange, onAddOption, onRemoveOption }) {
  return (
    <section className="panel-section nice-panel">
      <div className="section-header">
        <h2>Config menu</h2>
      </div>
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

function ActionEditor({ action, onChange, onParameterChange, onBranchChange, onDefaultChange }) {
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

      <div className="nice-editor-block">
        <strong>Parametros</strong>
        {action.action === 'SNIPPET' ? (
          <>
            <label className="nice-field">
              <span>Snippet code</span>
              <textarea value={action.parameters?.[0] ?? ''} onChange={(event) => onParameterChange(action.actionId, 0, event.target.value)} />
            </label>
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

      <BranchEditor title="Branches" items={action.branches} type="branch" actionId={action.actionId} onChange={onBranchChange} />
      <BranchEditor title="Cases" items={action.cases} type="case" actionId={action.actionId} onChange={onBranchChange} />
    </section>
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

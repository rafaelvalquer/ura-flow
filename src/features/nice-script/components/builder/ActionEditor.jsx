import { NICE_ACTION_LABELS } from '../../../../services/niceScriptModel.js';
import { Trash2 } from 'lucide-react';
import { Field, SelectField, TextareaField } from '../forms/NiceFormFields.jsx';

export default function ActionEditor({ action, onChange, onParameterChange, onBranchChange, onDefaultChange, onRemove, onOpenSnippetStudio }) {
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


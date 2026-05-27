import { NICE_ACTION_LABELS } from '../../../../services/niceScriptModel.js';
import { Field, SelectField } from '../forms/NiceFormFields.jsx';
import { extractAssignAction, extractSnippetAssignments, getMenuMaskOptions } from '../../services/niceSimulation.js';

export function NiceSimulatorPanel({ script, simulation, onReset }) {
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

export function SimulationNodeInspector({
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

export function SimulationVariablesPanel({ variables, warnings }) {
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

export function SimulationTimeline({ simulation }) {
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


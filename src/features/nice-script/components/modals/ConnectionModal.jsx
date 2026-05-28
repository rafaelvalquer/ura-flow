import { useMemo, useState } from 'react';
import { Field, SelectField } from '../forms/NiceFormFields.jsx';
import { getAvailableConnectionOptions } from '../../services/niceConnectionOptions.js';

export default function ConnectionModal({ connection, sourceAction, targetAction, onCancel, onApply }) {
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

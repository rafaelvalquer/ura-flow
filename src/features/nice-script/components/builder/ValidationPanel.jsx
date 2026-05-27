import { AlertTriangle, CheckCircle2 } from 'lucide-react';

export default function ValidationPanel({ validation, actions = [], onFocusAction }) {
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

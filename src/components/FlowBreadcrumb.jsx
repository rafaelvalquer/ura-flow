export default function FlowBreadcrumb({ items = [] }) {
  return (
    <div className="flow-overlay flow-breadcrumb">
      {items.length === 0 ? (
        <span className="breadcrumb-empty">Nenhum item selecionado</span>
      ) : (
        items.map((item, index) => (
          <button
            className={`breadcrumb-part ${item.target ? 'is-clickable' : ''}`}
            disabled={!item.target}
            key={`${item.label}-${index}`}
            onClick={() => item.onClick?.(item)}
            title={item.target ? `Focar ${item.label}` : item.label}
            type="button"
          >
            {index > 0 && <b>&gt;</b>}
            <span>{item.label}</span>
          </button>
        ))
      )}
    </div>
  );
}

export function buildBreadcrumbText(selection) {
  const data = selection?.data ?? {};
  const transitions = data.transitions ?? (data.transition ? [data.transition] : []);
  const transition = transitions[0];
  if (!transition) return [selection?.label || data.label].filter(Boolean).join(' > ');

  const parts = [transition.from, ...(transition.conditions ?? []), transition.to].filter(Boolean);
  if (transition.hasBiMarking || data.nodeType === 'biMarking') {
    parts.push('Marcacao URA');
  }

  return [...new Set(parts)].join(' > ');
}

export default function FlowBreadcrumb({ selection }) {
  const parts = buildBreadcrumbParts(selection);

  return (
    <div className="flow-overlay flow-breadcrumb">
      {parts.length === 0 ? (
        <span className="breadcrumb-empty">Nenhum item selecionado</span>
      ) : (
        parts.map((part, index) => (
          <span className="breadcrumb-part" key={`${part}-${index}`}>
            {index > 0 && <b>&gt;</b>}
            {part}
          </span>
        ))
      )}
    </div>
  );
}

export function buildBreadcrumbText(selection) {
  return buildBreadcrumbParts(selection).join(' > ');
}

function buildBreadcrumbParts(selection) {
  if (!selection) return [];

  const data = selection.data ?? {};
  const transitions = data.transitions ?? (data.transition ? [data.transition] : []);
  const transition = transitions[0];

  if (transition) {
    const parts = [
      transition.from,
      ...(transition.conditions ?? []),
      transition.to,
    ].filter(Boolean);

    if (transition.hasBiMarking || data.nodeType === 'biMarking') {
      parts.push('Marcação URA');
    }

    return [...new Set(parts)];
  }

  return [selection.label || data.label].filter(Boolean);
}

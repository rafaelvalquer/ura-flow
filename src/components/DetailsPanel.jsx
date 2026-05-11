import { PanelRightClose, PanelRightOpen } from 'lucide-react';

export default function DetailsPanel({
  selection,
  isCollapsed = false,
  onToggleCollapsed,
  onOpenOccurrence,
}) {
  const data = selection?.data ?? {};
  const transitions = data.transitions ?? (data.transition ? [data.transition] : []);
  const firstTransition = transitions[0];
  const changeColors = data.changeColors?.length
    ? data.changeColors
    : [...new Set(transitions.map((transition) => transition.changeColor).filter(Boolean))];

  if (isCollapsed) {
    return (
      <aside className="details-panel details-panel-collapsed">
        <button
          type="button"
          className="details-collapse-button"
          onClick={onToggleCollapsed}
          title="Expandir detalhes"
          aria-label="Expandir painel de detalhes"
        >
          <PanelRightOpen size={18} />
          <span>Detalhes</span>
        </button>
      </aside>
    );
  }

  return (
    <aside className="details-panel">
      <div className="section-header">
        <h2>Detalhes</h2>
        <div className="details-header-actions">
          <span>{selection?.kind ?? 'vazio'}</span>
          <button
            type="button"
            className="icon-button"
            onClick={onToggleCollapsed}
            title="Recolher detalhes"
            aria-label="Recolher painel de detalhes"
          >
            <PanelRightClose size={16} />
          </button>
        </div>
      </div>

      {!selection && <p className="empty-state">Selecione um no ou transicao para inspecionar a regra.</p>}

      {selection && (
        <div className="detail-stack">
          <Detail label="Tipo" value={data.nodeType || data.type || selection.kind} />
          <Detail label="Label" value={selection.label || data.label} />
          <Detail label="Origem" value={firstTransition?.from} />
          <Detail label="Destino" value={firstTransition?.to} />
          <Detail label="Prompt" value={data.prompt || firstTransition?.prompt} badge />
          <Detail label="Observacao" value={firstTransition?.observation} />
          <Detail label="Codigo B.I." value={data.biCode || firstTransition?.biCode} />
          <Detail label="Descricao B.I." value={data.biDescription || firstTransition?.biDescription} />
          <Detail label="Marcacao de B.I." value={data.bi || firstTransition?.bi} />
          <Detail label="Aba" value={firstTransition?.sheetName} />
          <Detail label="Linha" value={firstTransition?.rowNumber} />
          {changeColors.length > 0 && (
            <>
              <Detail label="Alteracao marcada" value="Sim" />
              <Detail label="Cor coluna B" value={changeColors.join(', ')} color={changeColors[0]} />
            </>
          )}

          {firstTransition?.conditions?.length > 0 && (
            <div className="detail-block">
              <span className="detail-label">Condicoes</span>
              <ol className="condition-list">
                {firstTransition.conditions.map((condition, index) => (
                  <li key={`${condition}-${index}`}>{condition}</li>
                ))}
              </ol>
            </div>
          )}

          {transitions.length > 1 && (
            <GroupedOccurrences transitions={transitions} onOpenOccurrence={onOpenOccurrence} />
          )}
        </div>
      )}
    </aside>
  );
}

function GroupedOccurrences({ transitions, onOpenOccurrence }) {
  return (
    <div className="detail-block occurrence-block">
      <span className="detail-label">Ocorrencias agrupadas</span>
      <strong>{transitions.length} caminhos para este destino</strong>
      <div className="occurrence-list">
        {transitions.map((transition) => (
          <article className="occurrence-item" key={transition.id}>
            <div className="occurrence-title">
              <span>Linha {transition.rowNumber}</span>
              {transition.changeColor && (
                <span className="color-swatch" style={{ backgroundColor: transition.changeColor }} />
              )}
            </div>
            <p>{transition.conditions?.join(' > ') || 'Sem condicoes'}</p>
            <dl>
              <OccurrenceDetail label="Destino" value={transition.to} />
              <OccurrenceDetail label="Prompt" value={transition.prompt || 'Sem prompt'} />
              <OccurrenceDetail label="B.I." value={transition.biCode || transition.biDescription || transition.bi} />
              <OccurrenceDetail label="Obs." value={transition.observation} />
            </dl>
            <button
              type="button"
              className="occurrence-action"
              onClick={() => onOpenOccurrence?.(transition)}
            >
              Abrir no fluxo
            </button>
          </article>
        ))}
      </div>
    </div>
  );
}

function OccurrenceDetail({ label, value }) {
  if (!value) return null;
  return (
    <>
      <dt>{label}</dt>
      <dd>{value}</dd>
    </>
  );
}

function Detail({ label, value, badge = false, color = '' }) {
  if (value === undefined || value === null || value === '') return null;
  return (
    <div className="detail-block">
      <span className="detail-label">{label}</span>
      <span className={badge ? 'prompt-badge' : 'detail-value'}>
        {color && <span className="color-swatch" style={{ backgroundColor: color }} />}
        {value}
      </span>
    </div>
  );
}

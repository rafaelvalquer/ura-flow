import { GitCompareArrows, Search, UploadCloud } from 'lucide-react';
import { useMemo, useRef } from 'react';
import { getComparisonFieldLabel } from '../services/compareSpecs.js';
import { normalizeKey } from '../utils/normalizeText.js';

const FILTERS = [
  { id: 'all', label: 'Todas' },
  { id: 'states', label: 'Estados' },
  { id: 'added', label: 'Adicionadas' },
  { id: 'removed', label: 'Removidas' },
  { id: 'changed-destination', label: 'Destino' },
  { id: 'changed-prompt', label: 'Prompt' },
  { id: 'changed-bi', label: 'B.I.' },
  { id: 'changed-conditions', label: 'Condicoes' },
  { id: 'changed-observation', label: 'Obs.' },
];

export default function ComparisonPanel({
  previousData,
  nextData,
  comparison,
  search,
  filter,
  isLoading,
  onSearchChange,
  onFilterChange,
  onUploadPrevious,
  onUploadNext,
  onSelectChange,
}) {
  const previousInputRef = useRef(null);
  const nextInputRef = useRef(null);

  const changes = useMemo(
    () => filterChanges(comparison, search, filter),
    [comparison, search, filter],
  );

  return (
    <section className="panel-section comparison-panel">
      <div className="section-header">
        <h2>Comparacao</h2>
        <span>{comparison?.summary.totalChanges ?? 0}</span>
      </div>

      <div className="comparison-upload-grid">
        <ComparisonUploadButton
          title="Spec anterior"
          fileName={previousData?.fileName}
          inputRef={previousInputRef}
          disabled={isLoading}
          onFileSelected={onUploadPrevious}
        />
        <ComparisonUploadButton
          title="Spec nova"
          fileName={nextData?.fileName}
          inputRef={nextInputRef}
          disabled={isLoading}
          onFileSelected={onUploadNext}
        />
      </div>

      {!comparison && (
        <div className="comparison-empty">
          <GitCompareArrows size={18} />
          <span>Envie as duas specs para comparar estados, destinos, prompts e B.I.</span>
        </div>
      )}

      {comparison && (
        <>
          <div className="stats-grid comparison-summary">
            <Stat label="Estados +" value={comparison.summary.addedStates} />
            <Stat label="Estados -" value={comparison.summary.removedStates} />
            <Stat label="Trans. +" value={comparison.summary.addedTransitions} />
            <Stat label="Trans. -" value={comparison.summary.removedTransitions} />
            <Stat label="Alteradas" value={comparison.summary.changedTransitions} />
            <Stat label="B.I." value={comparison.summary.changedBi} />
          </div>

          <div className="search-field comparison-search">
            <Search size={16} />
            <input
              className="search-input"
              value={search}
              onChange={(event) => onSearchChange(event.target.value)}
              placeholder="Buscar estado, destino, prompt ou B.I."
            />
          </div>

          <div className="filter-grid comparison-filters">
            {FILTERS.map((item) => (
              <button
                key={item.id}
                type="button"
                className={`filter-chip ${filter === item.id ? 'active' : ''}`}
                onClick={() => onFilterChange(item.id)}
              >
                {item.label}
              </button>
            ))}
          </div>

          <div className="comparison-change-list">
            {changes.length === 0 && (
              <div className="empty-warning-state">Nenhuma diferenca encontrada para este filtro.</div>
            )}
            {changes.map((change) => (
              <button
                key={change.id}
                type="button"
                className={`comparison-change-item ${change.type}`}
                onClick={() => onSelectChange(change.original)}
              >
                <span className="change-type-pill">{formatChangeType(change.original)}</span>
                <strong>{change.stateName}</strong>
                <small>{makeChangeSubtitle(change.original)}</small>
              </button>
            ))}
          </div>
        </>
      )}
    </section>
  );
}

function ComparisonUploadButton({ title, fileName, inputRef, disabled, onFileSelected }) {
  return (
    <div className="comparison-upload-card">
      <input
        ref={inputRef}
        className="sr-only"
        type="file"
        accept=".xlsx"
        disabled={disabled}
        onChange={(event) => {
          const file = event.target.files?.[0];
          if (file) onFileSelected(file);
          event.target.value = '';
        }}
      />
      <span>{title}</span>
      <strong title={fileName}>{fileName || 'Nenhum arquivo'}</strong>
      <button
        type="button"
        className="secondary-button full-width-button"
        disabled={disabled}
        onClick={() => inputRef.current?.click()}
      >
        <UploadCloud size={15} />
        Selecionar
      </button>
    </div>
  );
}

function Stat({ label, value }) {
  return (
    <div className="stat-card">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function filterChanges(comparison, search, filter) {
  if (!comparison) return [];

  const stateItems = comparison.stateChanges.map((change, index) => ({
    id: `state-${index}-${change.stateName}`,
    type: change.type,
    stateName: change.stateName,
    original: { ...change, kind: 'state' },
    searchKey: normalizeKey(`${change.type} ${change.stateName}`),
  }));

  const transitionItems = comparison.transitionChanges.map((change, index) => ({
    id: `transition-${index}-${change.stateName}-${change.transitionKey}`,
    type: change.type,
    stateName: change.stateName,
    original: { ...change, kind: 'transition' },
    searchKey: normalizeKey([
      change.type,
      change.stateName,
      change.before?.to,
      change.after?.to,
      change.before?.prompt,
      change.after?.prompt,
      change.before?.bi,
      change.after?.bi,
      change.before?.biCode,
      change.after?.biCode,
      change.before?.biDescription,
      change.after?.biDescription,
      change.before?.conditions?.join(' '),
      change.after?.conditions?.join(' '),
      change.beforeRowNumber,
      change.afterRowNumber,
    ].filter(Boolean).join(' ')),
  }));

  const query = normalizeKey(search);

  return [...stateItems, ...transitionItems].filter((item) => {
    if (query && !item.searchKey.includes(query)) return false;
    if (filter === 'all') return true;
    if (filter === 'states') return item.original.kind === 'state';
    if (filter === 'added') return item.type === 'added';
    if (filter === 'removed') return item.type === 'removed';
    return item.type === filter || item.original.changedFields?.includes(filter.replace('changed-', ''));
  });
}

function formatChangeType(change) {
  if (change.kind === 'state') {
    if (change.type === 'added') return 'Estado adicionado';
    if (change.type === 'removed') return 'Estado removido';
    return 'Estado alterado';
  }
  if (change.type === 'added') return 'Transicao adicionada';
  if (change.type === 'removed') return 'Transicao removida';
  return change.changedFields.map(getComparisonFieldLabel).join(', ');
}

function makeChangeSubtitle(change) {
  if (change.kind === 'state') {
    return `${change.transitionChangeCount} mudancas relacionadas`;
  }

  const before = change.before;
  const after = change.after;
  const row = after?.rowNumber ? `linha ${after.rowNumber}` : before?.rowNumber ? `linha antiga ${before.rowNumber}` : 'sem linha';
  const destination = after?.to || before?.to || 'Destino vazio';
  return `${row} - ${destination}`;
}

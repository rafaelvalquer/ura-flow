import { AlertTriangle, FileCode2, Search, UploadCloud, X } from 'lucide-react';
import { useMemo, useRef, useState } from 'react';
import { getSpecNiceChangeLabel } from '../services/specNiceComparator.js';

const FILTERS = [
  { id: 'all', label: 'Todas' },
  { id: 'success', label: 'Validados' },
  { id: 'critical', label: 'Criticas' },
  { id: 'warning', label: 'Alertas' },
  { id: 'missing-option', label: 'Opcoes faltando' },
  { id: 'missing-audio', label: 'Audio faltando' },
  { id: 'scriptpoint-mismatch', label: 'Scriptpoint' },
  { id: 'audio-mismatch', label: 'Audio' },
  { id: 'next-step-mismatch', label: 'NEXT_STEP' },
  { id: 'missing-rule', label: 'Regras' },
];

export default function SpecNiceComparisonModal({
  stateName,
  result,
  fileName,
  error,
  isLoading = false,
  onClose,
  onFileSelected,
  onFocusSpec,
}) {
  const inputRef = useRef(null);
  const [view, setView] = useState('changes');
  const [filter, setFilter] = useState('all');
  const [search, setSearch] = useState('');
  const [expandedNice, setExpandedNice] = useState('');

  const items = useMemo(() => {
    const query = normalizeSearch(search);
    const sourceItems = view === 'matches'
      ? (result?.matches ?? [])
      : view === 'all'
        ? [...(result?.changes ?? []), ...(result?.matches ?? [])]
        : (result?.changes ?? []);

    return sourceItems.filter((change) => {
      if (filter !== 'all' && change.type !== filter && change.severity !== filter) return false;
      if (!query) return true;
      return normalizeSearch([
        change.label,
        change.expected?.label,
        change.expected?.audio,
        change.expected?.audioText,
        change.expected?.scriptpoint,
        change.expected?.nextStep,
        change.actual?.label,
        change.actual?.audio,
        change.actual?.audioText,
        change.actual?.scriptpoint,
        change.actual?.nextStep,
        change.actual?.source,
      ].filter(Boolean).join(' ')).includes(query);
    });
  }, [result, view, filter, search]);

  return (
    <div className="nice-modal-backdrop">
      <section className="spec-nice-comparison-modal" role="dialog" aria-modal="true" aria-label="Comparador Spec x Script NICE">
        <header className="modal-header">
          <div>
            <h2>Comparador Spec x Script NICE</h2>
            <p>{stateName ? `Estado selecionado: ${stateName}` : 'Selecione um estado para comparar.'}</p>
          </div>
          <button type="button" className="icon-button" onClick={onClose} title="Fechar">
            <X size={18} />
          </button>
        </header>

        <div className="spec-nice-toolbar">
          <input
            ref={inputRef}
            className="sr-only"
            type="file"
            accept=".xml"
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) onFileSelected?.(file);
              event.target.value = '';
            }}
          />
          <button
            type="button"
            className="secondary-button"
            disabled={isLoading || !stateName}
            onClick={() => inputRef.current?.click()}
          >
            <UploadCloud size={15} />
            Importar XML NICE
          </button>
          <span title={fileName}>{fileName || 'Nenhum XML importado'}</span>
        </div>

        {error && (
          <div className="spec-nice-error">
            <AlertTriangle size={16} />
            {error}
          </div>
        )}

        {result && (
          <div className="spec-nice-body">
            <div className="stats-grid spec-nice-summary">
              <Stat label="Divergencias" value={result.summary.total} />
              <Stat label="Validados" value={result.summary.matches} />
              <Stat label="Criticas" value={result.summary.critical} />
              <Stat label="Alertas" value={result.summary.warning} />
            </div>

            {!result.hasDedicatedFields && (
              <div className="spec-nice-warning">
                A spec nao possui colunas dedicadas de Audio, Scriptpoint ou NEXT_STEP. A comparacao ficou limitada a opcoes e regras.
              </div>
            )}

            <div className="search-field">
              <Search size={16} />
              <input
                className="search-input"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Buscar por opcao, audio, NEXT_STEP ou regra"
              />
            </div>

            <div className="segmented-control spec-nice-view-toggle">
              <button type="button" className={view === 'changes' ? 'active' : ''} onClick={() => setView('changes')}>
                Divergencias
              </button>
              <button type="button" className={view === 'matches' ? 'active' : ''} onClick={() => setView('matches')}>
                Validados
              </button>
              <button type="button" className={view === 'all' ? 'active' : ''} onClick={() => setView('all')}>
                Todos
              </button>
            </div>

            <div className="filter-grid spec-nice-filters">
              {FILTERS.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  className={`filter-chip ${filter === item.id ? 'active' : ''}`}
                  onClick={() => setFilter(item.id)}
                >
                  {item.label}
                </button>
              ))}
            </div>

            <div className="spec-nice-change-list">
              {items.length === 0 && (
                <div className="empty-warning-state">Nenhum item encontrado para este filtro.</div>
              )}
              {items.map((change, index) => (
                <article className={`spec-nice-change-card is-${change.severity}`} key={`${change.id}-${index}`}>
                  <div className="spec-nice-change-title">
                    <span>{getSpecNiceChangeLabel(change.type)}</span>
                    <strong>{change.expected?.label || change.actual?.label || change.actual?.label || 'Item sem chave'}</strong>
                  </div>
                  <div className="spec-nice-diff-grid">
                    <DiffColumn title="Spec esperado" item={change.expected} fallback={change.expected?.label || '-'} />
                    <DiffColumn title="NICE encontrado" item={change.actual} fallback={change.actual?.label || '-'} />
                  </div>
                  <div className="spec-nice-card-footer">
                    {change.rowNumber && <span>Linha spec {change.rowNumber}</span>}
                    {change.actionId && <span>ActionID NICE {change.actionId}</span>}
                    {change.transitionId && (
                      <button type="button" className="ghost-button compact-button" onClick={() => onFocusSpec?.(change)}>
                        Focar na spec
                      </button>
                    )}
                    {change.actual?.niceSnippet && (
                      <button
                        type="button"
                        className="ghost-button compact-button"
                        onClick={() => setExpandedNice((current) => (current === change.id ? '' : change.id))}
                      >
                        Ver trecho NICE
                      </button>
                    )}
                  </div>
                  {expandedNice === change.id && change.actual?.niceSnippet && (
                    <pre className="spec-nice-snippet-preview">{change.actual.niceSnippet}</pre>
                  )}
                </article>
              ))}
            </div>
          </div>
        )}

        {!result && !error && (
          <div className="spec-nice-empty">
            <FileCode2 size={22} />
            <strong>Importe o XML NICE do estado selecionado.</strong>
            <span>O comparador vai confrontar opcoes, regras, audio, scriptpoint e NEXT_STEP.</span>
          </div>
        )}
      </section>
    </div>
  );
}

function DiffColumn({ title, item, fallback }) {
  return (
    <div className="spec-nice-diff-column">
      <span>{title}</span>
      <p>{fallback}</p>
      <dl>
        <DiffDetail label="Audio" value={item?.audio} />
        <DiffDetail label="Texto" value={item?.audioText} />
        <DiffDetail label="Scriptpoint" value={item?.scriptpoint} />
        <DiffDetail label="NEXT_STEP" value={item?.nextStep} />
        <DiffDetail label="TransferCode" value={item?.transferCode} />
        <DiffDetail label="Origem" value={item?.source} />
      </dl>
    </div>
  );
}

function DiffDetail({ label, value }) {
  if (!value) return null;
  return (
    <>
      <dt>{label}</dt>
      <dd>{value}</dd>
    </>
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

function normalizeSearch(value) {
  return String(value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
}

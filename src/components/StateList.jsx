import { AlertTriangle, CheckCircle2, Headphones, PhoneOff } from 'lucide-react';
import { classifyDestination } from '../utils/classifyDestination.js';

const FILTERS = [
  ['all', 'Todos'],
  ['transfer', 'Com transferência'],
  ['terminal', 'Com Tchau'],
  ['error', 'Com erro'],
  ['unknown', 'Destino não encontrado'],
];

export default function StateList({
  states,
  sheetNames,
  selectedState,
  onSelectState,
  search,
  onSearchChange,
  filter,
  onFilterChange,
}) {
  const filteredStates = states
    .filter((state) => state.sheetName.toLowerCase().includes(search.toLowerCase()))
    .filter((state) => matchesFilter(state, sheetNames, filter));

  return (
    <section className="panel-section state-list-section">
      <div className="section-header">
        <h2>Estados</h2>
        <span>{filteredStates.length}</span>
      </div>
      <input
        className="search-input"
        placeholder="Buscar estado"
        value={search}
        onChange={(event) => onSearchChange(event.target.value)}
      />
      <div className="filter-grid">
        {FILTERS.map(([value, label]) => (
          <button
            key={value}
            className={`filter-chip ${filter === value ? 'active' : ''}`}
            type="button"
            onClick={() => onFilterChange(value)}
          >
            {label}
          </button>
        ))}
      </div>
      <div className="state-list">
        {filteredStates.map((state) => {
          const summary = summarizeState(state, sheetNames);
          return (
            <button
              key={state.sheetName}
              className={`state-list-item ${selectedState === state.sheetName ? 'selected' : ''}`}
              type="button"
              onClick={() => onSelectState(state.sheetName)}
            >
              <span className="state-name">{state.sheetName}</span>
              <span className="state-meta">
                <CheckCircle2 size={13} /> {state.transitions.length}
                <PhoneOff size={13} /> {summary.terminal}
                <Headphones size={13} /> {summary.transfer}
                {summary.unknown > 0 && <AlertTriangle size={13} />}
              </span>
            </button>
          );
        })}
      </div>
    </section>
  );
}

function matchesFilter(state, sheetNames, filter) {
  if (filter === 'all') return true;
  const types = state.transitions.map((transition) => classifyDestination(transition.to, sheetNames, state.sheetName));
  if (filter === 'error' || filter === 'unknown') return types.includes('unknown');
  return types.includes(filter);
}

function summarizeState(state, sheetNames) {
  return state.transitions.reduce(
    (summary, transition) => {
      const type = classifyDestination(transition.to, sheetNames, state.sheetName);
      if (type === 'terminal') summary.terminal += 1;
      if (type === 'transfer') summary.transfer += 1;
      if (type === 'unknown') summary.unknown += 1;
      return summary;
    },
    { terminal: 0, transfer: 0, unknown: 0 },
  );
}

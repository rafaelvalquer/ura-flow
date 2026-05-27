import { AlertTriangle, CheckCircle2, Headphones, PhoneOff } from 'lucide-react';
import AccordionSection from './AccordionSection.jsx';
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
  isOpen = true,
  onToggle,
}) {
  const filteredStates = states
    .filter((state) => state.sheetName.toLowerCase().includes(search.toLowerCase()));

  return (
    <AccordionSection
      title="Estados"
      badge={filteredStates.length}
      className="state-list-section"
      isOpen={isOpen}
      onToggle={onToggle}
    >
      <div className="state-list-summary">
        <span>{filteredStates.length} de {states.length} estados</span>
      </div>
      <input
        className="search-input"
        placeholder="Buscar estado"
        value={search}
        onChange={(event) => onSearchChange(event.target.value)}
      />
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
              <span className="state-name" title={state.sheetName}>{state.sheetName}</span>
              <span className="state-meta">
                <span className="state-meta-badge" title="Transicoes">
                  <CheckCircle2 size={13} /> {state.transitions.length}
                </span>
                <span className="state-meta-badge" title="Tchau">
                  <PhoneOff size={13} /> {summary.terminal}
                </span>
                <span className="state-meta-badge" title="Transferencias">
                  <Headphones size={13} /> {summary.transfer}
                </span>
                {summary.unknown > 0 && (
                  <span className="state-meta-badge is-warning" title="Destino nao encontrado">
                    <AlertTriangle size={13} /> {summary.unknown}
                  </span>
                )}
              </span>
            </button>
          );
        })}
      </div>
    </AccordionSection>
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

import { AlertTriangle, BadgeCheck, GitBranch, Headphones, MapPin, Search } from 'lucide-react';
import { normalizeKey } from '../utils/normalizeText.js';

const TYPE_LABELS = {
  state: 'Estados',
  destination: 'Destinos',
  condition: 'Condicoes',
  prompt: 'Prompts',
  bi: 'B.I.',
  warning: 'Alertas',
};

const TYPE_ICONS = {
  state: GitBranch,
  destination: MapPin,
  condition: GitBranch,
  prompt: Headphones,
  bi: BadgeCheck,
  warning: AlertTriangle,
};

export default function GlobalSearchPanel({ items = [], search, onSearchChange, onSelect }) {
  const query = normalizeKey(search);
  const filteredItems = query
    ? items.filter((item) => item.searchKey.includes(query))
    : [];
  const groupedItems = groupByType(filteredItems);

  return (
    <section className="panel-section global-search-panel">
      <div className="section-header">
        <h2>Busca global</h2>
        <span>{query ? filteredItems.length : items.length}</span>
      </div>

      <div className="search-field">
        <Search size={14} />
        <input
          className="search-input"
          placeholder="Buscar estado, destino, prompt, condicao, B.I. ou linha"
          value={search}
          onChange={(event) => onSearchChange(event.target.value)}
        />
      </div>

      <div className="global-results">
        {!query && (
          <div className="empty-warning-state">Digite para localizar qualquer ponto da spec.</div>
        )}
        {query && filteredItems.length === 0 && (
          <div className="empty-warning-state">Nenhum resultado encontrado.</div>
        )}
        {Object.entries(groupedItems).map(([type, results]) => (
          <div className="global-result-group" key={type}>
            <strong>{TYPE_LABELS[type] ?? type}</strong>
            {results.slice(0, 6).map((item) => {
              const Icon = TYPE_ICONS[item.type] ?? Search;
              return (
                <button
                  type="button"
                  className={`global-result-item result-${item.type}`}
                  key={item.id}
                  onClick={() => onSelect?.(item)}
                  title={item.meta}
                >
                  <Icon size={15} />
                  <span>
                    <b>{item.title}</b>
                    <small>{item.subtitle}</small>
                    <em>{item.meta}</em>
                  </span>
                </button>
              );
            })}
            {results.length > 6 && (
              <div className="warning-more">+ {results.length - 6} resultados nesta categoria</div>
            )}
          </div>
        ))}
      </div>
    </section>
  );
}

function groupByType(items) {
  return items.reduce((groups, item) => {
    const current = groups[item.type] ?? [];
    current.push(item);
    groups[item.type] = current;
    return groups;
  }, {});
}

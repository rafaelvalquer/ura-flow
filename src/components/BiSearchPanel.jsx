import { BadgeCheck, Search } from 'lucide-react';
import { normalizeKey } from '../utils/normalizeText.js';

export default function BiSearchPanel({ items = [], search, onSearchChange, onSelect }) {
  const query = normalizeKey(search);
  const filteredItems = query
    ? items.filter((item) => item.searchKey.includes(query))
    : items;
  const visibleItems = filteredItems.slice(0, 12);

  return (
    <section className="panel-section bi-search-panel">
      <div className="section-header">
        <h2>Marcação de B.I.</h2>
        <span>{filteredItems.length}</span>
      </div>

      <div className="search-field">
        <Search size={14} />
        <input
          className="search-input"
          placeholder="Buscar código ou descrição"
          value={search}
          onChange={(event) => onSearchChange(event.target.value)}
        />
      </div>

      <div className="bi-results">
        {items.length === 0 && (
          <div className="empty-warning-state">Nenhuma marcação de B.I. encontrada.</div>
        )}
        {items.length > 0 && visibleItems.length === 0 && (
          <div className="empty-warning-state">Nenhuma marcação para essa busca.</div>
        )}
        {visibleItems.map((item) => (
          <button
            type="button"
            className="bi-result-item"
            key={`${item.transitionId}-${item.rowNumber}`}
            onClick={() => onSelect?.(item)}
            title={`Abrir ${item.sheetName}, linha ${item.rowNumber}`}
          >
            <BadgeCheck size={15} />
            <span>
              <strong>{item.biCode || 'Sem código'}</strong>
              <small>{item.biDescription || item.bi}</small>
              <em>{item.sheetName} · linha {item.rowNumber}</em>
            </span>
          </button>
        ))}
        {filteredItems.length > visibleItems.length && (
          <div className="warning-more">+ {filteredItems.length - visibleItems.length} marcações adicionais</div>
        )}
      </div>
    </section>
  );
}

import { useState } from 'react';
import { Braces } from 'lucide-react';
import { NICE_ACTION_LABELS } from '../../../../services/niceScriptModel.js';
import {
  ACTION_PALETTE_GROUPS,
  ACTION_PALETTE_META,
} from '../../constants/niceScriptConstants.js';

export default function ActionPalette({ onAddAction }) {
  const [openGroups, setOpenGroups] = useState(() => ({}));

  function toggleGroup(groupKey) {
    setOpenGroups((current) => ({
      ...current,
      [groupKey]: !current[groupKey],
    }));
  }

  function handleDragStart(event, type) {
    event.dataTransfer.setData('application/nice-action', type);
    event.dataTransfer.effectAllowed = 'copy';
  }

  return (
    <section className="panel-section nice-panel">
      <div className="section-header">
        <h2>Paleta de actions</h2>
      </div>
      <div className="nice-action-palette">
        {ACTION_PALETTE_GROUPS.map((group) => (
          <div className="nice-action-palette-group" key={group.key}>
            <button
              className="nice-action-palette-title"
              type="button"
              style={{ '--accent': group.accent }}
              aria-expanded={Boolean(openGroups[group.key])}
              onClick={() => toggleGroup(group.key)}
            >
              <span>{group.title}</span>
              <small>{group.actions.length}</small>
            </button>
            {openGroups[group.key] && (
              <div className="nice-action-palette-items">
                {group.actions.map((type) => {
                  const meta = ACTION_PALETTE_META[type] ?? {};
                  const Icon = meta.icon ?? Braces;
                  return (
                    <button
                      className="nice-palette-item"
                      key={type}
                      draggable
                      type="button"
                      data-group={group.key}
                      style={{ '--accent': group.accent }}
                      onClick={() => onAddAction(type)}
                      onDragStart={(event) => handleDragStart(event, type)}
                      title={`Arraste para o canvas ou clique para adicionar ${type}`}
                    >
                      <span className="nice-palette-icon" aria-hidden="true">
                        <Icon size={16} />
                      </span>
                      <span className="nice-palette-copy">
                        <strong>{NICE_ACTION_LABELS[type] ?? type}</strong>
                        <small>{meta.description ?? type}</small>
                      </span>
                      <span className="nice-palette-code">{type}</span>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        ))}
      </div>
    </section>
  );
}

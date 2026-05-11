import { useState } from 'react';

const LEGEND_ITEMS = [
  ['legend-state', 'Estado URA'],
  ['legend-condition', 'Condição'],
  ['legend-terminal', 'Tchau / terminal'],
  ['legend-transfer', 'Transferência'],
  ['legend-unknown', 'Destino não encontrado'],
  ['legend-bi', 'Marcação URA'],
  ['legend-change', 'Alteração coluna B'],
  ['legend-incoming', 'Edge de entrada'],
  ['legend-outgoing', 'Edge de saída'],
  ['legend-alert', 'Alerta diagnóstico'],
];

export default function FlowLegend() {
  const [isCollapsed, setCollapsed] = useState(false);

  return (
    <div className={`flow-overlay flow-legend ${isCollapsed ? 'is-collapsed' : ''}`}>
      <button type="button" className="overlay-toggle" onClick={() => setCollapsed((value) => !value)}>
        {isCollapsed ? 'Legenda' : 'Ocultar legenda'}
      </button>
      {!isCollapsed && (
        <div className="legend-grid">
          {LEGEND_ITEMS.map(([className, label]) => (
            <span className="legend-item" key={className}>
              <i className={className} />
              {label}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

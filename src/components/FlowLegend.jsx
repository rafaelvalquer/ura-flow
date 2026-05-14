import { useState } from 'react';

const LEGEND_ITEMS = [
  ['legend-state', 'Estado URA'],
  ['legend-condition', 'Condicao'],
  ['legend-terminal', 'Tchau / terminal'],
  ['legend-transfer', 'Transferencia'],
  ['legend-unknown', 'Destino nao encontrado'],
  ['legend-bi', 'Marcacao URA'],
  ['legend-change', 'Alteracao coluna B'],
  ['legend-comparison', 'Mudanca entre specs'],
  ['legend-incoming', 'Edge de entrada'],
  ['legend-outgoing', 'Edge de saida'],
  ['legend-alert', 'Alerta diagnostico'],
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

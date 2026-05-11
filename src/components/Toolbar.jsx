import { FileDown, LayoutGrid, Palette, RotateCcw } from 'lucide-react';

export default function Toolbar({
  fileName,
  selectedState,
  viewMode,
  showChangeColors,
  onToggleChangeColors,
  onOrganize,
  onExport,
  onClear,
  canExport,
  canOrganize,
  canHighlightChanges,
}) {
  return (
    <header className="app-toolbar">
      <div>
        <h1>URA Flow Builder</h1>
        <p>{fileName ? `Arquivo: ${fileName}` : 'Importe uma spec Excel para começar'}</p>
      </div>
      <div className="toolbar-context">
        {selectedState && (
          <span className="selected-pill">
            {selectedState} · {viewMode === 'detailedView' ? 'Visão detalhada' : 'Visão por estado'}
          </span>
        )}
        <button
          className={`ghost-button ${showChangeColors ? 'active-highlight' : ''}`}
          type="button"
          onClick={onToggleChangeColors}
          disabled={!canHighlightChanges}
          title="Cor importada da coluna B da spec"
        >
          <Palette size={16} />
          {showChangeColors ? 'Ocultar alterações' : 'Destacar alterações'}
        </button>
        <button className="ghost-button" type="button" onClick={onOrganize} disabled={!canOrganize}>
          <LayoutGrid size={16} />
          Organizar
        </button>
        <button className="secondary-button" type="button" onClick={onExport} disabled={!canExport}>
          <FileDown size={16} />
          Exportar PDF
        </button>
        <button className="ghost-button" type="button" onClick={onClear}>
          <RotateCcw size={16} />
          Limpar
        </button>
      </div>
    </header>
  );
}

import { BadgeCheck, GitBranch, ImageDown, LayoutGrid, Maximize2, Minimize2, Palette, RotateCcw } from 'lucide-react';

export default function Toolbar({
  fileName,
  selectedState,
  viewMode,
  showChangeColors,
  showBiMarkings,
  showBreadcrumb,
  isFocusMode,
  onToggleChangeColors,
  onToggleBiMarkings,
  onToggleBreadcrumb,
  onToggleFocusMode,
  onOrganize,
  onExportImage,
  onClear,
  canExport,
  canOrganize,
  canHighlightChanges,
}) {
  return (
    <header className="app-toolbar">
      <div>
        <h1>URA Flow Builder</h1>
        <p>{fileName ? `Arquivo: ${fileName}` : 'Importe uma spec Excel para comecar'}</p>
      </div>
      <div className="toolbar-context">
        {selectedState && (
          <span className="selected-pill">
            {selectedState} - {viewMode === 'detailedView' ? 'Visao detalhada' : 'Visao por estado'}
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
          {showChangeColors ? 'Ocultar alteracoes' : 'Destacar alteracoes'}
        </button>
        <button
          className={`ghost-button ${showBiMarkings ? 'active-highlight' : ''}`}
          type="button"
          onClick={onToggleBiMarkings}
          disabled={!canExport}
          title="Mostrar ou ocultar nodes de Marcacao URA no fluxo"
        >
          <BadgeCheck size={16} />
          {showBiMarkings ? 'Ocultar B.I.' : 'Mostrar B.I.'}
        </button>
        <button className={`ghost-button ${showBreadcrumb ? 'active-highlight' : ''}`} type="button" onClick={onToggleBreadcrumb}>
          <GitBranch size={16} />
          {showBreadcrumb ? 'Ocultar caminho' : 'Mostrar caminho'}
        </button>
        <button className={`ghost-button ${isFocusMode ? 'active-highlight' : ''}`} type="button" onClick={onToggleFocusMode}>
          {isFocusMode ? <Minimize2 size={16} /> : <Maximize2 size={16} />}
          {isFocusMode ? 'Sair do foco' : 'Modo foco'}
        </button>
        <button className="ghost-button" type="button" onClick={onOrganize} disabled={!canOrganize}>
          <LayoutGrid size={16} />
          Organizar
        </button>
        <button className="secondary-button" type="button" onClick={onExportImage} disabled={!canExport}>
          <ImageDown size={16} />
          Exportar PNG
        </button>
        <button className="ghost-button" type="button" onClick={onClear}>
          <RotateCcw size={16} />
          Limpar
        </button>
      </div>
    </header>
  );
}

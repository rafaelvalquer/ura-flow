import { FileSpreadsheet, GitBranch, SearchCheck } from 'lucide-react';

export default function CanvasEmptyState() {
  return (
    <div className="canvas-empty canvas-empty-rich">
      <div className="empty-flow-preview">
        <span>Estado</span>
        <i />
        <span>Condição</span>
        <i />
        <span>Destino</span>
      </div>
      <strong>Nenhum fluxo carregado</strong>
      <div className="empty-steps">
        <span><FileSpreadsheet size={15} /> Envie uma spec .xlsx</span>
        <span><GitBranch size={15} /> Selecione um estado</span>
        <span><SearchCheck size={15} /> Analise fluxo, diagnóstico e B.I.</span>
      </div>
    </div>
  );
}

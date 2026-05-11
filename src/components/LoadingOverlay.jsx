import { FileSpreadsheet } from 'lucide-react';

export default function LoadingOverlay({ fileName, progress }) {
  const percent = Math.max(0, Math.min(100, Math.round(progress?.percent ?? 0)));
  const stage = progress?.stage || 'Preparando leitura';
  const currentSheet = progress?.currentSheet ?? 0;
  const totalSheets = progress?.totalSheets ?? 0;
  const sheetName = progress?.sheetName ?? '';
  const sheetProgress = totalSheets > 0 ? `Aba ${currentSheet} de ${totalSheets}` : '';

  return (
    <div className="loading-overlay" role="status" aria-live="polite" aria-busy="true">
      <div className="loading-card">
        <div className="loading-spinner" />
        <div className="loading-icon">
          <FileSpreadsheet size={22} />
        </div>
        <h2>Lendo arquivo Excel</h2>
        <p>{stage}</p>
        <div className="loading-progress" aria-label={`Progresso ${percent}%`}>
          <div className="loading-progress-bar" style={{ width: `${percent}%` }} />
        </div>
        <div className="loading-progress-meta">
          <strong>{percent}%</strong>
          {sheetProgress && <span>{sheetProgress}</span>}
        </div>
        {sheetName && <em>{sheetName}</em>}
        {fileName && <span>{fileName}</span>}
      </div>
    </div>
  );
}

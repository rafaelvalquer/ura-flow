import { AlertTriangle, Gauge, Lightbulb, Route } from 'lucide-react';
import AccordionSection from './AccordionSection.jsx';

export default function UxReportPanel({
  analysis,
  isOpen = true,
  onToggle,
  onWarningClick,
}) {
  if (!analysis) return null;

  const { summary, sections } = analysis;

  return (
    <AccordionSection
      title="Analisador de Experiencia"
      badge={summary.score}
      className="ux-report-panel"
      isOpen={isOpen}
      onToggle={onToggle}
      icon={<Gauge size={16} />}
      collapsedContent={<p className="diagnostics-context compact">Score geral: {summary.score}/100.</p>}
    >
      <div className={`ux-score-card ${statusClass(summary.status)}`}>
        <span>Score geral</span>
        <strong>{summary.score}/100</strong>
        <em>{summary.status}</em>
      </div>

      <div className="stats-grid ux-summary-grid">
        <Stat label="Caminhos" value={summary.totalPaths} />
        <Stat label="Prof. media" value={summary.averageDepth} />
        <Stat label="Maior caminho" value={summary.longestPath} />
        <Stat label="Criticos" value={summary.criticalCount} />
      </div>

      <ReportSection title="Problemas criticos" icon={<AlertTriangle size={14} />} items={sections.critical} kind="error" />
      <ReportSection title="Caminhos longos" icon={<Route size={14} />} items={sections.longPaths} />
      <ReportSection title="Menus complexos" items={sections.complexMenus} />
      <ReportSection title="Audios longos" items={sections.longAudios} />
      <ReportSection title="Loops" items={sections.loops} kind="error" />
      <ReportSection title="Caminhos sem saida" items={sections.deadEnds} kind="error" />
      <ReportSection title="Sugestoes" icon={<Lightbulb size={14} />} items={sections.suggestions} kind="suggestion" />

      <div className="warnings-list ux-warning-list">
        {analysis.warnings.slice(0, 12).map((warning, index) => (
          <button
            type="button"
            key={`${warning.type}-${warning.sheetName}-${index}`}
            className={`warning-item ${warning.severity}`}
            onClick={() => onWarningClick?.(warning)}
          >
            <AlertTriangle size={14} />
            <span>
              <strong>{warning.sheetName}</strong>
              {warning.message}
            </span>
          </button>
        ))}
      </div>
    </AccordionSection>
  );
}

function Stat({ label, value }) {
  return (
    <div className="stat-card">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function ReportSection({ title, items = [], icon = null, kind = 'warning' }) {
  const visibleItems = items.slice(0, 6);
  return (
    <section className={`ux-report-section ${kind}`}>
      <h3>
        {icon}
        {title}
        <span>{items.length}</span>
      </h3>
      {visibleItems.length === 0 ? (
        <p>Nenhum item encontrado.</p>
      ) : (
        <ul>
          {visibleItems.map((item, index) => <li key={`${title}-${index}`}>{item}</li>)}
        </ul>
      )}
      {items.length > visibleItems.length && <small>+ {items.length - visibleItems.length} itens adicionais</small>}
    </section>
  );
}

function statusClass(status = '') {
  if (status === 'Bom') return 'good';
  if (status === 'Critico') return 'critical';
  return 'attention';
}

import { AlertTriangle, CheckCircle2, CircleAlert, Info, ShieldCheck } from 'lucide-react';

const ICONS = {
  error: CircleAlert,
  warning: AlertTriangle,
  info: Info,
};

export default function SpecDiagnosticsPanel({ validation, project, selectedStateId, onOpenIssue }) {
  const selectedIssues = validation.issues.filter((issue) => !selectedStateId || issue.stateId === selectedStateId);

  return (
    <aside className="spec-editor-diagnostics">
      <section className="spec-editor-validation-summary">
        <div className={`spec-editor-validation-icon ${validation.isValid ? 'is-valid' : 'has-errors'}`}>
          {validation.isValid ? <ShieldCheck size={22} /> : <AlertTriangle size={22} />}
        </div>
        <div>
          <span>Validação automática</span>
          <strong>{validation.isValid ? 'Estrutura sem erros bloqueantes' : `${validation.counts.error} erro(s) encontrado(s)`}</strong>
        </div>
      </section>

      <div className="spec-editor-diagnostic-counts">
        <span className="is-error">{validation.counts.error} erros</span>
        <span className="is-warning">{validation.counts.warning} alertas</span>
        <span>{validation.counts.info} informações</span>
      </div>

      <div className="spec-editor-diagnostic-list">
        {selectedIssues.map((issue) => {
          const Icon = ICONS[issue.severity] ?? Info;
          const state = project.states.find((item) => item.id === issue.stateId);
          return (
            <button
              type="button"
              className={`spec-editor-diagnostic-item severity-${issue.severity}`}
              key={issue.id}
              onClick={() => onOpenIssue(issue)}
            >
              <Icon size={15} />
              <span>
                <strong>{issue.message}</strong>
                <small>{state?.name || 'Projeto'} · {issue.code}</small>
              </span>
            </button>
          );
        })}

        {!selectedIssues.length && (
          <div className="spec-editor-diagnostic-empty">
            <CheckCircle2 size={24} />
            <strong>Nenhum apontamento neste contexto.</strong>
          </div>
        )}
      </div>
    </aside>
  );
}

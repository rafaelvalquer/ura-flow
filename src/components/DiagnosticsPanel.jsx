import { Activity, AlertTriangle } from 'lucide-react';
import AccordionSection from './AccordionSection.jsx';
import { classifyDestination } from '../utils/classifyDestination.js';
import { normalizeKey } from '../utils/normalizeText.js';

export default function DiagnosticsPanel({
  diagnostics,
  states = [],
  sheetNames = [],
  selectedState = '',
  scope = 'state',
  onScopeChange,
  onWarningClick,
  isOpen = true,
  onToggle,
}) {
  if (!diagnostics) return null;

  const selected = states.find((state) => state.sheetName === selectedState);
  const isStateScope = scope === 'state' && selected;
  const warnings = isStateScope
    ? diagnostics.warnings.filter((warning) => warning.sheetName === selectedState)
    : diagnostics.warnings;
  const stats = isStateScope
    ? buildStateStats(selected, sheetNames, warnings)
    : buildDocumentStats(diagnostics);
  const contextText = isStateScope
    ? `Mostrando alertas de ${selectedState}`
    : 'Mostrando alertas do documento inteiro';

  return (
    <AccordionSection
      title="Diagnostico"
      badge={warnings.length}
      className="diagnostics-panel"
      isOpen={isOpen}
      onToggle={onToggle}
      icon={<Activity size={16} />}
      collapsedContent={<p className="diagnostics-context compact">{contextText}.</p>}
    >
      <div className="segmented-control diagnostics-scope">
        <button
          type="button"
          className={scope === 'state' ? 'active' : ''}
          onClick={() => onScopeChange?.('state')}
          disabled={!selectedState}
        >
          Estado atual
        </button>
        <button
          type="button"
          className={scope === 'document' ? 'active' : ''}
          onClick={() => onScopeChange?.('document')}
        >
          Documento inteiro
        </button>
      </div>

      <p className="diagnostics-context">{contextText}. Clique em um alerta para abrir o ponto no fluxo.</p>

      <div className="stats-grid">
        {stats.map(([label, value]) => (
          <div className="stat-card" key={label}>
            <span>{label}</span>
            <strong>{value}</strong>
          </div>
        ))}
      </div>

      <div className="warnings-list">
        {warnings.length === 0 && (
          <div className="empty-warning-state">Nenhum alerta para este escopo.</div>
        )}
        {warnings.slice(0, 18).map((warning, index) => (
          <button
            type="button"
            className={`warning-item ${warning.severity}`}
            key={`${warning.type}-${warning.sheetName}-${warning.rowNumber ?? index}`}
            onClick={() => onWarningClick?.(warning)}
            title={warning.rowNumber ? `Abrir ${warning.sheetName}, linha ${warning.rowNumber}` : `Abrir ${warning.sheetName}`}
          >
            <AlertTriangle size={14} />
            <span>
              <strong>{formatWarningMeta(warning)}</strong>
              {warning.message}
            </span>
          </button>
        ))}
        {warnings.length > 18 && (
          <div className="warning-more">+ {warnings.length - 18} alertas adicionais</div>
        )}
      </div>
    </AccordionSection>
  );
}

function buildDocumentStats(diagnostics) {
  return [
    ['Abas', diagnostics.totalSheets],
    ['Estados processados', diagnostics.processedStates],
    ['Transicoes', diagnostics.totalTransitions],
    ['Nao encontrados', diagnostics.unknownDestinations],
    ['Prompts vazios', diagnostics.emptyPrompts],
    ['Tchau', diagnostics.terminalTransitions],
    ['Transferencias', diagnostics.transfers],
  ];
}

function buildStateStats(state, sheetNames, warnings) {
  const transitions = state?.transitions ?? [];
  return [
    ['Transicoes', transitions.length],
    ['Alertas', warnings.length],
    [
      'Nao encontrados',
      transitions.filter((transition) => classifyDestination(transition.to, sheetNames, state.sheetName) === 'unknown').length,
    ],
    ['Prompts vazios', transitions.filter((transition) => !transition.prompt).length],
    ['Tchau', transitions.filter((transition) => normalizeKey(transition.to) === 'tchau').length],
    ['Transferencias', transitions.filter((transition) => normalizeKey(transition.to).includes('transfer')).length],
  ];
}

function formatWarningMeta(warning) {
  const parts = [];
  if (warning.sheetName) parts.push(warning.sheetName);
  if (warning.rowNumber) parts.push(`linha ${warning.rowNumber}`);
  return parts.length ? `${parts.join(' - ')}: ` : '';
}

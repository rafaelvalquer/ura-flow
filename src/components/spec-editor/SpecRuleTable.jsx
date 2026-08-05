import {
  ArrowDown,
  ArrowUp,
  ChevronDown,
  ChevronRight,
  Copy,
  CornerDownRight,
  IndentDecrease,
  IndentIncrease,
  Link2,
  Plus,
  Trash2,
} from 'lucide-react';
import { flattenVisibleRules, normalizeKey } from '../../services/specEditorProject.js';

const BRANCH_OPTIONS = [
  ['IF', 'IF'],
  ['ELSE_IF', 'ELSE IF'],
  ['ELSE', 'ELSE'],
  ['CASE', 'CASO'],
  ['ACTION', 'AÇÃO'],
  ['DIRECTIVE', 'DIRETIVA'],
];

export default function SpecRuleTable({
  state,
  stateNames,
  expandedRuleIds,
  onToggleExpanded,
  onExpandRule,
  onUpdateRule,
  onAddChild,
  onDuplicate,
  onDelete,
  onMove,
  onIndent,
  onOutdent,
  onNavigateToState,
}) {
  const rows = flattenVisibleRules(state?.rules ?? [], expandedRuleIds);
  const destinationListId = `spec-editor-destinations-${state?.id}`;
  const promptListId = `spec-editor-prompts-${state?.id}`;
  const promptNames = [...new Set((state?.audioCatalog ?? []).map((audio) => audio.fileName).filter(Boolean))];
  const stateNameByKey = new Map(stateNames.map((name) => [normalizeKey(name), name]));

  return (
    <div className="spec-editor-rule-table-shell">
      <datalist id={destinationListId}>
        {stateNames.map((name) => <option key={name} value={name} />)}
      </datalist>
      <datalist id={promptListId}>
        {promptNames.map((name) => <option key={name} value={name} />)}
      </datalist>

      <table className="spec-editor-rule-table">
        <colgroup>
          <col className="spec-editor-col-result" />
          <col className="spec-editor-col-destination" />
          <col className="spec-editor-col-prompt" />
          <col className="spec-editor-col-observation" />
          <col className="spec-editor-col-bi" />
          <col className="spec-editor-col-actions" />
        </colgroup>
        <thead>
          <tr>
            <th>Resultado</th>
            <th>Vai para o estado...</th>
            <th>E ouve o prompt...</th>
            <th>Observação</th>
            <th>Marcação de B.I.</th>
            <th aria-label="Ações" />
          </tr>
        </thead>
        <tbody>
          {rows.map(({ rule, depth, hasChildren, siblingIndex, siblingCount, parentId }) => {
            const resolvedDestination = stateNameByKey.get(normalizeKey(rule.destination));
            return (
              <tr
                key={rule.id}
                className={`${rule.metadata?.modified ? 'is-modified' : ''} ${rule.metadata?.confidence === 'medium' ? 'needs-review' : ''}`}
              >
                <td className="spec-editor-result-cell">
                  <div className="spec-editor-rule-result" style={{ '--rule-depth': depth }}>
                    <span className="spec-editor-tree-guide" aria-hidden="true" />
                    {hasChildren ? (
                      <button
                        type="button"
                        className="spec-editor-tree-toggle"
                        title={expandedRuleIds.has(rule.id) ? 'Recolher regras filhas' : 'Expandir regras filhas'}
                        onClick={() => onToggleExpanded(rule.id)}
                      >
                        {expandedRuleIds.has(rule.id) ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                      </button>
                    ) : (
                      <span className="spec-editor-tree-toggle-placeholder"><CornerDownRight size={13} /></span>
                    )}
                    <select
                      className={`spec-editor-branch-select branch-${String(rule.branchType || '').toLowerCase()}`}
                      value={rule.branchType}
                      aria-label="Tipo da regra"
                      onChange={(event) => onUpdateRule(rule.id, { branchType: event.target.value })}
                    >
                      {BRANCH_OPTIONS.map(([value, label]) => (
                        <option key={value} value={value}>{label}</option>
                      ))}
                    </select>
                    <textarea
                      rows={1}
                      value={rule.result}
                      placeholder="Descreva a condição ou o resultado"
                      onChange={(event) => onUpdateRule(rule.id, { result: event.target.value })}
                    />
                  </div>
                </td>
                <td>
                  <div className="spec-editor-linked-input">
                    <input
                      list={destinationListId}
                      value={rule.destination}
                      placeholder="Estado, Tchau ou transferência"
                      onChange={(event) => onUpdateRule(rule.id, { destination: event.target.value })}
                    />
                    {resolvedDestination && (
                      <button
                        type="button"
                        title={`Abrir o estado ${resolvedDestination}`}
                        onClick={() => onNavigateToState(resolvedDestination)}
                      >
                        <Link2 size={15} />
                      </button>
                    )}
                  </div>
                </td>
                <td>
                  <input
                    list={promptListId}
                    value={rule.prompt}
                    placeholder="Nome do prompt"
                    onChange={(event) => onUpdateRule(rule.id, { prompt: event.target.value })}
                  />
                </td>
                <td>
                  <textarea
                    rows={1}
                    value={rule.observation}
                    placeholder="Observação técnica"
                    onChange={(event) => onUpdateRule(rule.id, { observation: event.target.value })}
                  />
                </td>
                <td>
                  <textarea
                    rows={1}
                    value={rule.bi}
                    placeholder="Código - descrição"
                    onChange={(event) => onUpdateRule(rule.id, { bi: event.target.value })}
                  />
                </td>
                <td className="spec-editor-row-actions">
                  <button type="button" title="Adicionar regra filha" onClick={() => { onAddChild(rule.id); onExpandRule(rule.id); }}>
                    <Plus size={14} />
                  </button>
                  <button type="button" title="Duplicar regra e filhos" onClick={() => onDuplicate(rule.id)}>
                    <Copy size={14} />
                  </button>
                  <button type="button" title="Mover para cima" disabled={siblingIndex === 0} onClick={() => onMove(rule.id, 'up')}>
                    <ArrowUp size={14} />
                  </button>
                  <button type="button" title="Mover para baixo" disabled={siblingIndex === siblingCount - 1} onClick={() => onMove(rule.id, 'down')}>
                    <ArrowDown size={14} />
                  </button>
                  <button type="button" title="Aumentar recuo" disabled={siblingIndex === 0} onClick={() => onIndent(rule.id)}>
                    <IndentIncrease size={14} />
                  </button>
                  <button type="button" title="Diminuir recuo" disabled={!parentId} onClick={() => onOutdent(rule.id)}>
                    <IndentDecrease size={14} />
                  </button>
                  <button type="button" className="is-danger" title="Excluir regra e filhos" onClick={() => onDelete(rule.id)}>
                    <Trash2 size={14} />
                  </button>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>

      {!rows.length && (
        <div className="spec-editor-empty-table">
          <strong>Este estado não possui regras.</strong>
          <span>Adicione uma condição ou ação para começar a documentação.</span>
        </div>
      )}
    </div>
  );
}

import { Handle, Position } from '@xyflow/react';
import {
  Braces,
  GitBranch,
  ListTree,
  LocateFixed,
  Menu,
  Milestone,
  Play,
  Repeat,
  Route,
  Variable,
} from 'lucide-react';
import { NICE_ACTION_LABELS } from '../../services/niceScriptModel.js';
import { getDirectMenuCaseBranches } from '../../services/niceMenuRouting.js';

const icons = {
  BEGIN: Play,
  SNIPPET: Braces,
  MENU: Menu,
  LOCATE: LocateFixed,
  CASE: ListTree,
  LOOP: Repeat,
  RUNSCRIPT: Route,
  RUNSUB: Milestone,
  IF: GitBranch,
  ASSIGN: Variable,
  PLAY: Play,
};

export default function NiceActionNode({ data, selected }) {
  const Icon = icons[data.action] ?? Braces;
  const directMenuCases = getDirectMenuCaseBranches(data);
  const visibleCases = data.action === 'MENU' ? directMenuCases : (data.cases ?? []);
  const branchCount = (data.branches?.length ?? 0) + (visibleCases.length ?? 0) + (data.defaultNextAction ? 1 : 0);
  const isCaseAction = data.action === 'CASE';
  const isDirectMenuAction = data.action === 'MENU' && directMenuCases.length > 0;
  const isIfAction = data.action === 'IF';
  const isLoopAction = data.action === 'LOOP';
  const caseOutputs = isCaseAction ? makeCaseOutputs(data) : [];
  const menuCaseOutputs = isDirectMenuAction ? makeCaseOutputs({ ...data, cases: directMenuCases, defaultNextAction: null }) : [];
  const ifOutputs = isIfAction ? makeIfOutputs(data) : [];
  const loopOutputs = isLoopAction ? makeLoopOutputs(data) : [];
  const decisionSummary = makeDecisionSummary(data);
  const actionSummary = makeActionSummary(data);

  return (
    <div className={`nice-action-node nice-action-${data.action?.toLowerCase()} ${selected ? 'is-selected' : ''} ${data.isSimulated ? 'is-simulated' : ''}`}>
      <Handle type="target" position={Position.Left} />
      <div className="nice-action-node-title">
        <Icon size={16} />
        <span>{data.caption || data.action}</span>
      </div>
      <div className="nice-action-node-meta">
        <b>#{data.actionId}</b>
        <span>{NICE_ACTION_LABELS[data.action] ?? data.action}</span>
      </div>
      <div className="nice-action-node-footer">
        <span>{data.parameters?.length ?? 0} params</span>
        <span>{branchCount} saidas</span>
      </div>
      {actionSummary ? (
        <div className="nice-action-node-summary" title={actionSummary}>
          {actionSummary}
        </div>
      ) : null}
      {decisionSummary ? (
        <div className={`nice-decision-summary is-${decisionSummary.kind}`} title={decisionSummary.title}>
          {decisionSummary.label ? <span>{decisionSummary.label}</span> : null}
          <strong>{decisionSummary.value}</strong>
        </div>
      ) : null}
      {isCaseAction ? (
        <div className="nice-case-output-list">
          {caseOutputs.map((output) => (
            <div className="nice-case-output-row" key={output.id}>
              <span>{output.label}</span>
              <Handle
                className="nice-case-output-handle"
                id={output.id}
                type="source"
                position={Position.Right}
              />
            </div>
          ))}
        </div>
      ) : isDirectMenuAction ? (
        <>
          <Handle type="source" position={Position.Right} />
          <div className="nice-case-output-list">
            {menuCaseOutputs.map((output) => (
              <div className="nice-case-output-row" key={output.id}>
                <span>{output.label}</span>
                <Handle
                  className="nice-case-output-handle"
                  id={output.id}
                  type="source"
                  position={Position.Right}
                />
              </div>
            ))}
          </div>
        </>
      ) : isIfAction ? (
        <div className="nice-if-output-list">
          {ifOutputs.map((output) => (
            <div className={`nice-if-output-row is-${output.kind}`} key={output.id}>
              <span>{output.label}</span>
              <Handle
                className="nice-if-output-handle"
                id={output.id}
                type="source"
                position={Position.Right}
              />
            </div>
          ))}
        </div>
      ) : isLoopAction ? (
        <div className="nice-loop-output-list">
          {loopOutputs.map((output) => (
            <div className={`nice-loop-output-row is-${output.kind}`} key={output.id}>
              <span>{output.label}</span>
              <Handle
                className="nice-loop-output-handle"
                id={output.id}
                type="source"
                position={Position.Right}
              />
            </div>
          ))}
        </div>
      ) : (
        <Handle type="source" position={Position.Right} />
      )}
    </div>
  );
}

function makeActionSummary(data) {
  const parameters = data.parameters ?? [];

  if (data.action === 'PLAY') {
    return cleanDecisionValue(parameters[0]) || '';
  }

  if (data.action === 'RUNSCRIPT') {
    return cleanDecisionValue(parameters[0]) || '';
  }

  if (data.action === 'REST_API') {
    const method = cleanDecisionValue(parameters[4]);
    const url = cleanDecisionValue(parameters[1]);
    return [method, url].filter(Boolean).join(' ');
  }

  if (data.action === 'WORKFLOWDATA' || data.action === 'RETURN') {
    return cleanDecisionValue(parameters[0]) || '';
  }

  return '';
}

function makeDecisionSummary(data) {
  if (data.action !== 'CASE' && data.action !== 'IF') {
    return null;
  }

  const rawValue = cleanDecisionValue(data.parameters?.[0]);
  const fallback = data.action === 'CASE' ? 'variavel nao informada' : 'condicao nao informada';
  const value = rawValue || fallback;

  return {
    kind: data.action.toLowerCase(),
    label: data.action === 'CASE' ? 'Avalia' : '',
    title: `${data.action === 'CASE' ? 'Avalia' : 'Condicao'}: ${value}`,
    value,
  };
}

function cleanDecisionValue(value) {
  return String(value ?? '')
    .replace(/\r?\n+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/^\{([^{}]+)\}$/, '$1')
    .trim();
}

function makeCaseOutputs(data) {
  const outputs = (data.cases ?? []).map((branch, index) => ({
    id: makeCaseHandleId(branch, index),
    label: branch.text ? `Case ${branch.text}` : `Case ${index + 1}`,
  }));

  if (data.defaultNextAction) {
    outputs.push({
      id: makeDefaultHandleId(),
      label: 'Default',
    });
  }

  return outputs.length ? outputs : [{ id: makeDefaultHandleId(), label: 'Default' }];
}

function makeCaseHandleId(branch, index = 0) {
  return `case-${safeHandlePart(branch?.index ?? index)}-${safeHandlePart(branch?.text || `case-${index + 1}`)}`;
}

function makeDefaultHandleId() {
  return 'case-default';
}

function makeIfOutputs(data) {
  const outputs = [];
  const branches = data.branches ?? [];
  const trueBranch = branches.find((branch) => /true/i.test(branch.text ?? '') || Number(branch.index) === 0);
  const falseBranch = branches.find((branch) => /false/i.test(branch.text ?? '') || Number(branch.index) === 1);

  outputs.push({
    id: makeIfHandleId(trueBranch ?? { index: 0, text: 'True' }),
    label: trueBranch?.text || 'True',
    kind: 'true',
  });
  outputs.push({
    id: makeIfHandleId(falseBranch ?? { index: 1, text: 'False' }),
    label: falseBranch?.text || 'False',
    kind: 'false',
  });

  return outputs;
}

function makeIfHandleId(branch) {
  const label = /false/i.test(branch?.text ?? '') || Number(branch?.index) === 1 ? 'false' : 'true';
  return `if-${label}`;
}

function makeLoopOutputs(data) {
  const outputs = [];
  const branches = data.branches ?? [];
  const finishedBranch = branches.find((branch) => /finished/i.test(branch.text ?? '') || Number(branch.index) === 0);
  const repeatBranch = branches.find((branch) => /repeat/i.test(branch.text ?? '') || Number(branch.index) === 1);

  outputs.push({
    id: makeLoopHandleId(finishedBranch ?? { index: 0, text: 'Finished' }),
    label: finishedBranch?.text || 'Finished',
    kind: 'finished',
  });
  outputs.push({
    id: makeLoopHandleId(repeatBranch ?? { index: 1, text: 'Repeat' }),
    label: repeatBranch?.text || 'Repeat',
    kind: 'repeat',
  });

  return outputs;
}

function makeLoopHandleId(branch) {
  const label = /repeat/i.test(branch?.text ?? '') || Number(branch?.index) === 1 ? 'repeat' : 'finished';
  return `loop-${label}`;
}

function safeHandlePart(value) {
  return String(value ?? 'item')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9_-]+/g, '_')
    .replace(/^_+|_+$/g, '') || 'item';
}

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
  const branchCount = (data.branches?.length ?? 0) + (data.cases?.length ?? 0) + (data.defaultNextAction ? 1 : 0);

  return (
    <div className={`nice-action-node nice-action-${data.action?.toLowerCase()} ${selected ? 'is-selected' : ''}`}>
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
      <Handle type="source" position={Position.Right} />
    </div>
  );
}

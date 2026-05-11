import { Handle, Position } from '@xyflow/react';
import { GitBranch } from 'lucide-react';
import { nodeClass, nodeStyle } from './nodeStyle';

export default function ConditionNode({ data }) {
  return (
    <div className={nodeClass('custom-node condition-node', data)} style={nodeStyle(data)}>
      <Handle type="target" position={Position.Left} />
      <div className="node-title">
        <GitBranch size={15} />
        <span>{data.label}</span>
      </div>
      <Handle type="source" position={Position.Right} />
    </div>
  );
}

import { Handle, Position } from '@xyflow/react';
import { RadioTower } from 'lucide-react';
import { nodeClass, nodeStyle } from './nodeStyle';
import NodeBadges from './NodeBadges';

export default function StateNode({ data }) {
  return (
    <div className={nodeClass('custom-node state-node', data)} style={nodeStyle(data)}>
      <Handle type="target" position={Position.Left} />
      <div className="node-title">
        <RadioTower size={16} />
        <span>{data.label}</span>
      </div>
      <div className="node-subtitle">Estado URA</div>
      <NodeBadges data={data} />
      <Handle type="source" position={Position.Right} />
    </div>
  );
}

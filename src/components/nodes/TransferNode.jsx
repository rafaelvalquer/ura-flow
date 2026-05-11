import { Handle, Position } from '@xyflow/react';
import { Headphones } from 'lucide-react';
import { nodeClass, nodeStyle } from './nodeStyle';
import NodeBadges from './NodeBadges';

export default function TransferNode({ data }) {
  return (
    <div className={nodeClass('custom-node transfer-node', data)} style={nodeStyle(data)}>
      <Handle type="target" position={Position.Left} />
      <div className="node-title">
        <Headphones size={16} />
        <span>{data.label}</span>
      </div>
      <div className="node-subtitle">Transferência</div>
      <NodeBadges data={data} />
      <Handle type="source" position={Position.Right} />
    </div>
  );
}

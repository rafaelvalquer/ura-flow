import { Handle, Position } from '@xyflow/react';
import { AlertTriangle } from 'lucide-react';
import { nodeClass, nodeStyle } from './nodeStyle';
import NodeBadges from './NodeBadges';

export default function UnknownNode({ data }) {
  return (
    <div className={nodeClass('custom-node unknown-node', data)} style={nodeStyle(data)}>
      <Handle type="target" position={Position.Left} />
      <div className="node-title">
        <AlertTriangle size={16} />
        <span>{data.label}</span>
      </div>
      <div className="node-subtitle">Destino não encontrado</div>
      <NodeBadges data={data} />
    </div>
  );
}

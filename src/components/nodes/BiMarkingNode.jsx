import { Handle, Position } from '@xyflow/react';
import { BadgeCheck } from 'lucide-react';
import { nodeClass, nodeStyle } from './nodeStyle';

export default function BiMarkingNode({ data }) {
  return (
    <div className={nodeClass('custom-node bi-marking-node', data)} style={nodeStyle(data)}>
      <Handle type="target" position={Position.Left} />
      <div className="node-title">
        <BadgeCheck size={16} />
        <span>Marcação URA</span>
      </div>
      {data.biCode && <div className="bi-code">{data.biCode}</div>}
      <div className="node-subtitle">{data.biDescription || data.bi || 'Marcação de B.I.'}</div>
      <Handle type="source" position={Position.Right} />
    </div>
  );
}

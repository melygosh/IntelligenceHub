import { Handle, Position, type Node, type NodeProps } from '@xyflow/react';
import { colourFor } from './graph-palette';

export type EntityNodeData = {
  label: string;
  kind: 'entity';
  mentionCount: number | null;
  dominantCategoryId: string | null;
};

// xyflow v12's NodeProps generic is over the Node type, not the data type;
// wrap with Node<EntityNodeData, 'entity'> so the component gets typed data.
export type EntityNode = Node<EntityNodeData, 'entity'>;

function clamp(n: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, n));
}

/**
 * Custom react-flow entity node. Diameter encodes mention count
 * (clamp(16, 16 + count × 1.2, 48) for the box; SVG circle inside);
 * fill colour encodes dominant category (graph-palette.ts). Label inside
 * the circle when it fits, beside it otherwise — but for MVP we keep
 * label always on the right of the circle so dagre laneing stays simple.
 */
export function EntityGraphNode({ data }: NodeProps<EntityNode>) {
  const count = data.mentionCount ?? 0;
  const diameter = clamp(16 + count * 1.2, 16, 48);
  const fill = colourFor(data.dominantCategoryId);
  return (
    <div
      className="flex items-center gap-2"
      style={{
        background: 'transparent',
        fontFamily: "'IBM Plex Mono', ui-monospace, monospace",
        fontSize: 11,
        color: 'var(--color-ink)',
      }}
      title={`${data.label} · ${count} mentions`}
    >
      <Handle type="target" position={Position.Left} style={{ opacity: 0 }} />
      <svg width={diameter} height={diameter} style={{ display: 'block' }}>
        <circle cx={diameter / 2} cy={diameter / 2} r={diameter / 2 - 0.5} fill={fill} />
      </svg>
      <span
        style={{
          whiteSpace: 'nowrap',
          background: 'var(--color-paper)',
          border: '1px solid var(--color-border)',
          padding: '1px 5px',
        }}
      >
        {data.label}
        {count > 0 ? (
          <span style={{ color: 'var(--color-muted)', marginLeft: 4 }}>· {count}</span>
        ) : null}
      </span>
      <Handle type="source" position={Position.Right} style={{ opacity: 0 }} />
    </div>
  );
}

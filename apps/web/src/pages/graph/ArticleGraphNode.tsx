import { Handle, Position, type Node, type NodeProps } from '@xyflow/react';
import { IMP_STYLE } from '../../components/articles/importance';

export type ArticleNodeData = {
  label: string;
  kind: 'article';
  importance: 'high' | 'normal' | 'junk' | null;
};

// xyflow v12's NodeProps generic is over the Node type, not the data type;
// wrap with Node<ArticleNodeData, 'article'> so the component gets typed data.
export type ArticleNode = Node<ArticleNodeData, 'article'>;

/**
 * Custom react-flow article node. Visual encoding of FR-7 importance via
 * the shared IMP_STYLE palette: a left border in the importance dot colour
 * plus the foreground colour on the title text. Falls back to 'normal' when
 * importance is null (unanalysed row — shouldn't appear with status='ready'
 * filter, defensive default).
 */
export function ArticleGraphNode({ data }: NodeProps<ArticleNode>) {
  const imp = data.importance ?? 'normal';
  const s = IMP_STYLE[imp];
  return (
    <div
      className="border border-border px-2.5 py-1.5 text-[11px] leading-snug"
      style={{
        background: 'var(--color-paper2)',
        borderLeft: `3px solid ${s.dot}`,
        color: s.fg,
        maxWidth: 240,
        fontFamily: "'IBM Plex Mono', ui-monospace, monospace",
      }}
      title={data.label}
    >
      <Handle type="target" position={Position.Left} style={{ opacity: 0 }} />
      {data.label}
      <Handle type="source" position={Position.Right} style={{ opacity: 0 }} />
    </div>
  );
}

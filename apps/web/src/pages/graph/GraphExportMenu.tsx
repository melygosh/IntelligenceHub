import { useRef, useState } from 'react';
import { toPng, toSvg } from 'html-to-image';
import type { GraphResponse } from '@intelligencehub/shared';
import {
  buildExportJson,
  downloadBlob,
  downloadDataUrl,
  exportFilename,
  type ExportFilterContext,
  type ExportFormat,
} from './exportGraph';

type Props = {
  // Returns the live canvas wrapper at click time. A function (not the ref
  // itself) keeps the menu agnostic to how the parent stores the element.
  getCanvasRoot: () => HTMLElement | null;
  // null when the graph hasn't loaded yet — disables JSON export.
  graph: GraphResponse | null;
  filters: ExportFilterContext;
};

const FORMATS: ExportFormat[] = ['png', 'svg', 'json'];
const PAPER = '#FAF7F0';

// Skip react-flow's minimap and the zoom/pan controls in the snapshot — they
// are interactive affordances, not part of the exported view.
const SKIP_CLASSES = ['react-flow__minimap', 'react-flow__controls'];
function shouldInclude(node: HTMLElement): boolean {
  if (!node.classList) return true;
  return !SKIP_CLASSES.some((c) => node.classList.contains(c));
}

export function GraphExportMenu({ getCanvasRoot, graph, filters }: Props) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const detailsRef = useRef<HTMLDetailsElement>(null);

  async function doExport(format: ExportFormat): Promise<void> {
    if (busy) return;
    setBusy(true);
    setOpen(false);
    detailsRef.current?.removeAttribute('open');
    try {
      if (format === 'json') {
        if (!graph) return;
        const data = buildExportJson(graph, filters);
        downloadBlob(
          exportFilename('json'),
          new Blob([JSON.stringify(data, null, 2)], {
            type: 'application/json',
          }),
        );
        return;
      }
      const root = getCanvasRoot();
      if (!root) return;
      const exporter = format === 'png' ? toPng : toSvg;
      const dataUrl = await exporter(root, {
        pixelRatio: 2,
        backgroundColor: PAPER,
        cacheBust: true,
        filter: shouldInclude,
      });
      downloadDataUrl(exportFilename(format), dataUrl);
    } finally {
      setBusy(false);
    }
  }

  // <details> + <summary> gives us a free outside-click-closes-the-menu
  // behaviour and keyboard support without a hook + portal stack.
  return (
    <details
      ref={detailsRef}
      open={open}
      onToggle={(e) => setOpen((e.currentTarget as HTMLDetailsElement).open)}
      className="relative"
    >
      <summary
        className={
          'inline-flex cursor-pointer items-center gap-1.5 border border-border bg-paper px-2.5 py-1 font-mono text-[13.5px] text-ink hover:bg-paper2 [&::-webkit-details-marker]:hidden ' +
          (busy ? 'pointer-events-none opacity-60' : '')
        }
        aria-label="Export graph"
      >
        {busy ? 'Exporting…' : 'Export'}
        <span aria-hidden className="text-[10px] leading-none">
          ▾
        </span>
      </summary>
      <div className="absolute right-0 top-full z-20 mt-1 flex min-w-[120px] flex-col border border-border bg-paper shadow-sm">
        {FORMATS.map((f) => {
          const disabled = busy || (f === 'json' && !graph);
          return (
            <button
              key={f}
              type="button"
              disabled={disabled}
              onClick={() => void doExport(f)}
              className={
                'px-2.5 py-1.5 text-left font-mono text-[13px] text-ink hover:bg-paper2 disabled:cursor-not-allowed disabled:opacity-50'
              }
            >
              {f.toUpperCase()}
            </button>
          );
        })}
      </div>
    </details>
  );
}

import type { GraphResponse, GraphPeriod } from '@intelligencehub/shared';

export type ExportFormat = 'png' | 'svg' | 'json';

export type ExportFilterContext = {
  period: GraphPeriod;
  from?: string;
  to?: string;
  nodeKind: string;
  categoryIds: string[];
  anchorEntityId?: string;
};

export type ExportJson = {
  meta: {
    exportedAt: number;
    filters: ExportFilterContext;
  };
  graph: GraphResponse;
};

export function buildExportJson(
  graph: GraphResponse,
  filters: ExportFilterContext,
): ExportJson {
  return {
    meta: {
      exportedAt: Math.floor(Date.now() / 1000),
      filters,
    },
    graph,
  };
}

// Produces `intelligence-hub-graph-202605291547.png`. Local time on purpose —
// the user picks the file off their own disk, no need to argue about UTC.
export function exportFilename(format: ExportFormat): string {
  const d = new Date();
  const pad = (n: number): string => String(n).padStart(2, '0');
  const stamp =
    `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}` +
    `${pad(d.getHours())}${pad(d.getMinutes())}`;
  return `intelligence-hub-graph-${stamp}.${format}`;
}

export function downloadBlob(filename: string, blob: Blob): void {
  const url = URL.createObjectURL(blob);
  triggerDownload(filename, url);
  // Revoke on next tick so the anchor click has time to start the download.
  setTimeout(() => URL.revokeObjectURL(url), 1_000);
}

export function downloadDataUrl(filename: string, dataUrl: string): void {
  triggerDownload(filename, dataUrl);
}

function triggerDownload(filename: string, href: string): void {
  const a = document.createElement('a');
  a.href = href;
  a.download = filename;
  a.rel = 'noopener';
  document.body.appendChild(a);
  a.click();
  a.remove();
}

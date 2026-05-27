// Procedural knowledge-graph constellation behind the auth pages — ported from
// the design mockup. Deterministic (fixed seed) so the layout is stable across
// loads. Decorative only; pointer-events disabled and aria-hidden.

function mulberry32(seed: number) {
  return function () {
    let t = (seed += 0x6d2b79f5) | 0;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

type GraphNode = {
  id: number;
  x: number;
  y: number;
  c: number;
  size: number;
  kind: 'rect' | 'circ' | 'round' | 'dia';
};
type GraphEdge = { s: number; t: number; curve: number };

function generateBackdrop(seed = 7): { nodes: GraphNode[]; edges: GraphEdge[] } {
  const rng = mulberry32(seed);
  const gauss = () => {
    let u = 0;
    let v = 0;
    while (u === 0) u = rng();
    while (v === 0) v = rng();
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
  };
  const W = 1600;
  const H = 900;
  const K = 7;
  const clusters = Array.from({ length: K }, () => ({
    x: 200 + rng() * (W - 400),
    y: 150 + rng() * (H - 300),
  }));
  // A few relaxation passes so clusters spread out rather than overlap.
  for (let it = 0; it < 80; it++) {
    for (let i = 0; i < K; i++) {
      let fx = 0;
      let fy = 0;
      for (let j = 0; j < K; j++) {
        if (i === j) continue;
        const dx = clusters[i].x - clusters[j].x;
        const dy = clusters[i].y - clusters[j].y;
        const d = Math.sqrt(dx * dx + dy * dy) + 0.01;
        const t = 280;
        if (d < t) {
          const f = ((t - d) / d) * 0.5;
          fx += dx * f;
          fy += dy * f;
        }
      }
      clusters[i].x = Math.max(140, Math.min(W - 140, clusters[i].x + fx * 0.06));
      clusters[i].y = Math.max(110, Math.min(H - 110, clusters[i].y + fy * 0.06));
    }
  }
  const nodes: GraphNode[] = [];
  let id = 0;
  const per = Math.ceil(70 / K);
  for (let c = 0; c < K; c++) {
    for (let i = 0; i < per; i++) {
      const x = clusters[c].x + gauss() * 55;
      const y = clusters[c].y + gauss() * 45;
      const r = rng();
      const size = r < 0.05 ? 6 : r < 0.18 ? 4.5 : r < 0.5 ? 3 : 2;
      const kind = (['rect', 'circ', 'round', 'dia'] as const)[Math.floor(rng() * 4)];
      nodes.push({ id: id++, x, y, c, size, kind });
    }
  }
  const edges: GraphEdge[] = [];
  const seen = new Set<string>();
  for (const n of nodes) {
    const same = nodes
      .filter((m) => m.c === n.c && m.id !== n.id)
      .map((m) => ({ m, d: (m.x - n.x) ** 2 + (m.y - n.y) ** 2 }))
      .sort((a, b) => a.d - b.d)
      .slice(0, 3);
    const k = 1 + Math.floor(rng() * 2);
    for (let i = 0; i < Math.min(k, same.length); i++) {
      if (rng() < 0.6) {
        const key = [Math.min(n.id, same[i].m.id), Math.max(n.id, same[i].m.id)].join('-');
        if (!seen.has(key)) {
          seen.add(key);
          edges.push({ s: n.id, t: same[i].m.id, curve: (rng() - 0.5) * 40 });
        }
      }
    }
  }
  return { nodes, edges };
}

const BACKDROP = generateBackdrop(7);

export function AuthBackdrop() {
  return (
    <svg
      viewBox="0 0 1600 900"
      preserveAspectRatio="xMidYMid slice"
      className="pointer-events-none absolute inset-0 h-full w-full"
      aria-hidden="true"
    >
      {BACKDROP.edges.map((e, i) => {
        const a = BACKDROP.nodes[e.s];
        const b = BACKDROP.nodes[e.t];
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const len = Math.sqrt(dx * dx + dy * dy) || 1;
        const mx = (a.x + b.x) / 2;
        const my = (a.y + b.y) / 2;
        const px = (-dy / len) * e.curve;
        const py = (dx / len) * e.curve;
        return (
          <path
            key={i}
            d={`M ${a.x} ${a.y} Q ${mx + px} ${my + py} ${b.x} ${b.y}`}
            stroke="#1c1a16"
            strokeWidth="0.5"
            fill="none"
            opacity="0.13"
          />
        );
      })}
      {BACKDROP.nodes.map((n) => {
        const r = n.size;
        if (n.kind === 'circ') {
          return <circle key={n.id} cx={n.x} cy={n.y} r={r} fill="#6b6557" opacity="0.55" />;
        }
        if (n.kind === 'round') {
          return (
            <rect key={n.id} x={n.x - r} y={n.y - r} width={r * 2} height={r * 2} rx={r * 0.5} fill="#6b6557" opacity="0.55" />
          );
        }
        if (n.kind === 'dia') {
          return (
            <rect
              key={n.id}
              x={n.x - r * 0.85}
              y={n.y - r * 0.85}
              width={r * 1.7}
              height={r * 1.7}
              fill="#6b6557"
              opacity="0.55"
              transform={`rotate(45 ${n.x} ${n.y})`}
            />
          );
        }
        return <rect key={n.id} x={n.x - r} y={n.y - r} width={r * 2} height={r * 2} fill="#6b6557" opacity="0.55" />;
      })}
    </svg>
  );
}

/**
 * The home hero's history path on the logo's 30-degree grid, redrawn on each
 * visit. scripts/history-art.py writes the fixed drawing and its walk into
 * the SVG's data-art; this shuffles that walk, so the commits still climb
 * from the same start to the same verified one, and returns the new points.
 */
export type ArtSpec = {
  step: number;
  ox: number;
  oy: number;
  seq: string;
  /** The commit a branch leaves, its length in steps and where its avatar sits. */
  lanes: [at: number, len: number, avatar: number | null][];
  nodes: number[];
};
export type Point = [number, number];
export type ArtPaths = {
  main: string;
  nodes: Point[];
  lanes: { d: string; avatar: Point | null }[];
};

const C = Math.cos(Math.PI / 6);
const MOVES: Record<string, Point> = {
  R: [1, 0],
  U: [0, -1],
  D: [1, 1],
  L: [-1, -1],
  N: [0, 1],
};

export function seeded(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function walk(seq: string, from: Point = [0, 0]): Point[] {
  const pts = [from];
  let [i, j] = from;
  for (const m of seq) {
    const [di, dj] = MOVES[m]!;
    i += di;
    j += dj;
    pts.push([i, j]);
  }
  return pts;
}

const at = (spec: ArtSpec, [i, j]: Point): Point => [
  spec.ox + i * spec.step * C,
  spec.oy + j * spec.step - (i * spec.step) / 2,
];

/** A branch takes the other way round between the commits it leaves and rejoins. */
const laneSeq = (seq: string, from: number, len: number) =>
  [...seq.slice(from, from + len)].reverse().join("");

function shuffled(seq: string, rand: () => number): string {
  const m = [...seq];
  for (let k = m.length - 1; k > 0; k--) {
    const r = Math.floor(rand() * (k + 1));
    const swap = m[k]!;
    m[k] = m[r]!;
    m[r] = swap;
  }
  return m.join("");
}

/**
 * The same moves in another order, so the path ends where it did. It stays
 * inside the art's box and between the start and the seal, never crosses
 * itself, and leaves every branch a different way round to take. The fixed
 * walk is the answer when no order fits.
 */
export function randomSeq(
  spec: ArtSpec,
  width: number,
  rand: () => number,
): string {
  const fixed = walk(spec.seq).map((p) => at(spec, p));
  const ys = fixed.map(([, y]) => y);
  const top = Math.min(...ys);
  const bottom = Math.max(...ys);
  const inside = ([x, y]: Point) =>
    x >= 0 && x <= width && y >= top && y <= bottom;
  const key = ([i, j]: Point) => `${i},${j}`;

  for (let attempt = 0; attempt < 2000; attempt++) {
    const seq = shuffled(spec.seq, rand);
    const main = walk(seq);
    if (new Set(main.map(key)).size !== main.length) continue;
    if (!main.every((p) => inside(at(spec, p)))) continue;
    const used = new Set(main.map(key));
    const lanesFit = spec.lanes.every(([from, len]) => {
      const back = laneSeq(seq, from, len);
      if (back === seq.slice(from, from + len)) return false;
      const lane = walk(back, main[from]!).slice(1, -1);
      return lane.every((p) => inside(at(spec, p)) && !used.has(key(p)));
    });
    if (lanesFit) return seq;
  }
  return spec.seq;
}

const path = (pts: Point[]) =>
  "M" + pts.map(([x, y]) => `${x.toFixed(1)} ${y.toFixed(1)}`).join(" L");

export function historyPaths(
  spec: ArtSpec,
  width: number,
  rand: () => number,
): ArtPaths {
  const seq = randomSeq(spec, width, rand);
  const main = walk(seq);
  return {
    main: path(main.map((p) => at(spec, p))),
    nodes: spec.nodes.map((k) => at(spec, main[k]!)),
    lanes: spec.lanes.map(([from, len, avatar]) => {
      const lane = walk(laneSeq(seq, from, len), main[from]!).map((p) =>
        at(spec, p),
      );
      return {
        d: path(lane),
        avatar: avatar === null ? null : (lane[avatar] ?? null),
      };
    }),
  };
}

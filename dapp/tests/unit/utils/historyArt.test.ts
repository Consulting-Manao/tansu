import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import path from "path";
import {
  historyPaths,
  randomSeq,
  seeded,
  walk,
  type ArtSpec,
} from "../../../src/utils/historyArt";

const art = (name: string, width: number) => {
  const svg = readFileSync(
    path.resolve(__dirname, `../../../src/assets/art/${name}.svg`),
    "utf8",
  );
  const spec = JSON.parse(/data-art='([^']*)'/.exec(svg)![1]!) as ArtSpec;
  const line = /class="art-line" d="([^"]*)"/.exec(svg)![1]!;
  return { spec, width, line };
};
const points = (d: string) =>
  d
    .slice(1)
    .split(" L")
    .map((p) => p.split(" ").map(Number) as [number, number]);
const arts = { desk: art("hero-desk", 1440), phone: art("hero-phone", 390) };
const sorted = (seq: string) => [...seq].sort().join("");
const end = (seq: string) => walk(seq).at(-1);

describe("seeded", () => {
  it("gives the same numbers for the same seed and others for another", () => {
    const a = seeded(7);
    const b = seeded(7);
    const first = [a(), a(), a()];
    expect(first).toEqual([b(), b(), b()]);
    expect(first).not.toEqual([seeded(8)(), seeded(8)(), seeded(8)()]);
    expect(first.every((n) => n >= 0 && n < 1)).toBe(true);
  });
});

describe.each(Object.entries(arts))(
  "randomSeq (%s art)",
  (_, { spec, width, line }) => {
    const seeds = Array.from({ length: 100 }, (_, k) => k + 1);

    it("keeps the 30 degree moves and the end commit of the fixed walk", () => {
      for (const seed of seeds) {
        const seq = randomSeq(spec, width, seeded(seed));
        expect(sorted(seq)).toBe(sorted(spec.seq));
        expect(end(seq)).toEqual(end(spec.seq));
      }
    });

    it("never crosses itself", () => {
      for (const seed of seeds) {
        const pts = walk(randomSeq(spec, width, seeded(seed)));
        expect(new Set(pts.map(String)).size).toBe(pts.length);
      }
    });

    it("draws a different path for different seeds", () => {
      const seqs = new Set(
        seeds.map((seed) => randomSeq(spec, width, seeded(seed))),
      );
      expect(seqs.size).toBeGreaterThan(50);
    });

    it("draws the same path for the same seed", () => {
      expect(randomSeq(spec, width, seeded(5))).toBe(
        randomSeq(spec, width, seeded(5)),
      );
    });

    it("keeps the path between the start and the seal, inside the box", () => {
      const { oy, ox, step } = spec;
      for (const seed of seeds) {
        const pts = points(historyPaths(spec, width, seeded(seed)).main);
        const ys = pts.map(([, y]) => y);
        const xs = pts.map(([x]) => x);
        const startY = oy;
        const sealY =
          oy + (end(spec.seq)![1] * step - (end(spec.seq)![0] * step) / 2);
        expect(Math.min(...ys)).toBeGreaterThanOrEqual(sealY - 0.1);
        expect(Math.max(...ys)).toBeLessThanOrEqual(startY + 0.1);
        expect(Math.min(...xs)).toBeGreaterThanOrEqual(0);
        expect(Math.max(...xs)).toBeLessThanOrEqual(width);
        expect(xs[0]).toBeCloseTo(ox, 1);
      }
    });

    it("rejoins each branch to the history where the fixed one does", () => {
      for (const seed of seeds) {
        const { main, lanes } = historyPaths(spec, width, seeded(seed));
        const mainPts = main.slice(1).split(" L");
        expect(lanes).toHaveLength(spec.lanes.length);
        lanes.forEach(({ d, avatar }, n) => {
          const [from, len, at] = spec.lanes[n]!;
          const pts = d.slice(1).split(" L");
          expect(pts[0]).toBe(mainPts[from]);
          expect(pts.at(-1)).toBe(mainPts[from + len]);
          expect(pts).toHaveLength(len + 1);
          expect(avatar === null).toBe(at === null);
        });
      }
    });

    it("keeps each branch inside the box and off the history between its ends", () => {
      const ys = points(line).map(([, y]) => y);
      const [top, bottom] = [Math.min(...ys), Math.max(...ys)];
      for (const seed of seeds) {
        const { main, lanes } = historyPaths(spec, width, seeded(seed));
        const onMain = new Set(main.slice(1).split(" L"));
        lanes.forEach(({ d }) => {
          const inner = d.slice(1).split(" L").slice(1, -1);
          inner.forEach((p) => expect(onMain.has(p)).toBe(false));
          points(d).forEach(([x, y]) => {
            expect(x).toBeGreaterThanOrEqual(0);
            expect(x).toBeLessThanOrEqual(width);
            expect(y).toBeGreaterThanOrEqual(top - 0.1);
            expect(y).toBeLessThanOrEqual(bottom + 0.1);
          });
        });
      }
    });

    it("puts every commit mark on the new path", () => {
      const { main, nodes } = historyPaths(spec, width, seeded(3));
      const pts = main.slice(1).split(" L");
      nodes.forEach(([x, y], n) => {
        expect(`${x.toFixed(1)} ${y.toFixed(1)}`).toBe(pts[spec.nodes[n]!]);
      });
    });
  },
);

describe("randomSeq fallback", () => {
  it("returns the fixed walk when no other order fits the box", () => {
    const { spec } = arts.desk;
    expect(randomSeq(spec, 1, seeded(1))).toBe(spec.seq);
  });

  it.each(Object.entries(arts))(
    "draws the fixed walk exactly as history-art.py does (%s art)",
    (_, { spec, line }) => {
      expect(historyPaths(spec, 1, seeded(1)).main).toBe(line);
    },
  );
});

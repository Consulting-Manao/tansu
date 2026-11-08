"""A project's history on the logo's 30-degree grid: the home hero's art
(desktop and phone) and the quiet ground of the page bands.

    python3 scripts/history-art.py        (or: bun run art)

Writes src/assets/art/{hero-desk,hero-phone,band}.svg. The drawing is
fixed: the same seeds give the same files. Colours and motion come from
src/styles/history-art.css, by class.
"""

import math
import random
from pathlib import Path

C = math.cos(math.pi / 6)
MOVES = {"R": (1, 0), "U": (0, -1), "D": (1, 1), "L": (-1, -1), "N": (0, 1)}
OUT = Path(__file__).resolve().parent.parent / "src" / "assets" / "art"


def walk(start, seq):
    i, j = start
    out = [(i, j)]
    for m in seq:
        di, dj = MOVES[m]
        i += di
        j += dj
        out.append((i, j))
    return out


class Art:
    """One composition: a grid of dots, faint lanes, a history, a seal."""

    def __init__(self, name, width, height, step, ox, oy, uid):
        self.name, self.W, self.H, self.s = name, width, height, step
        self.ox, self.oy, self.uid = ox, oy, uid
        self.fx0 = 0.1  # how faint the lanes start, on the left
        self.grad = ((width * 0.2, height * 0.9), (width * 0.85, height * 0.15))
        self.layers = {"ghosts": [], "lanes": [], "main": [], "nodes": [], "seal": []}

    def P(self, ij):
        return (
            self.ox + ij[0] * self.s * C,
            self.oy + ij[1] * self.s - ij[0] * self.s / 2,
        )

    def d(self, pts):
        return "M" + " L".join(f"{x:.1f} {y:.1f}" for x, y in (self.P(p) for p in pts))

    def t(self, k):
        return f"{k / self.total:.3f}"

    def main(self, start, seq):
        """The featured history: a path that draws itself once."""
        self.mp = walk(start, seq)
        self.total = len(self.mp) - 1
        dd, u = self.d(self.mp), self.uid
        self.grad = (self.P(self.mp[0]), self.P(self.mp[-1]))
        self.layers["main"] += [
            f'<path class="art-glow" d="{dd}" stroke="url(#{u}line)" filter="url(#{u}glow)" pathLength="1"></path>',
            f'<path class="art-line" d="{dd}" stroke="url(#{u}line)" pathLength="1"></path>',
        ]

    def lane(self, at, seq, avatar_at=None):
        """A branch from commit `at`, merged where it meets the history."""
        pts = walk(self.mp[at], seq)
        end = self.mp.index(pts[-1]) if pts[-1] in self.mp else at + len(seq)
        self.layers["lanes"].append(
            f'<path class="art-branch" style="--t0: {self.t(at)}; --t1: {self.t(end)}" d="{self.d(pts)}" pathLength="1"></path>'
        )
        if avatar_at is not None:
            x, y = self.P(pts[avatar_at])
            self.layers["nodes"].append(
                f'<g transform="translate({x:.1f} {y:.1f})"><g class="art-pop art-avatar" style="--t: {self.t(at + (end - at) * avatar_at / len(pts))}"><circle r="13"></circle></g></g>'
            )

    def ghost(self, start, seq, nodes_every):
        pts = walk(start, seq)
        self.layers["ghosts"].append(
            f'<path class="art-ghost" d="{self.d(pts)}"></path>'
        )
        for k in range(nodes_every, len(pts) - 1, nodes_every):
            x, y = self.P(pts[k])
            if -10 < x < self.W + 10 and -10 < y < self.H + 10:
                self.layers["ghosts"].append(
                    f'<circle class="art-ghost-node" cx="{x:.1f}" cy="{y:.1f}" r="3.5"></circle>'
                )

    def nodes(self, ks, big=()):
        for k in ks:
            x, y = self.P(self.mp[k])
            merge = " art-node--merge" if k in big else ""
            self.layers["nodes"].append(
                f'<circle class="art-pop art-node{merge}" style="--t: {self.t(k)}" cx="{x:.1f}" cy="{y:.1f}" r="{8 if k in big else 6.5}"></circle>'
            )

    def seal(self, r):
        """The latest commit, attested: a round gold check."""
        x, y = self.P(self.mp[-1])
        self.layers["seal"].append(
            f'<g transform="translate({x:.1f} {y:.1f})"><g class="art-seal"><circle class="art-halo art-halo--2" r="{r * 2.4:.0f}"></circle><circle class="art-halo" r="{r * 1.6:.0f}"></circle>'
            f'<g class="art-seal__badge"><circle class="art-seal__shape" r="{r:.1f}"></circle><g transform="translate({-r:.1f} {-r:.1f}) scale({r * 2 / 24:.3f})"><path class="art-seal__tick" d="m7.5 12.2 3 3 6-6.4"></path></g></g></g></g>'
        )

    def svg(self, cls, align, history=True):
        (ax, ay), (bx, by) = self.grad
        u, W, H = self.uid, self.W, self.H
        defs = [
            f'<radialGradient id="{u}fade" gradientUnits="userSpaceOnUse" cx="{bx:.0f}" cy="{by:.0f}" r="{max(W, H) * 0.95:.0f}"><stop offset="0" stop-color="#fff"></stop><stop offset=".5" stop-color="#fff" stop-opacity=".6"></stop><stop offset="1" stop-color="#fff" stop-opacity="0"></stop></radialGradient>',
            f'<mask id="{u}mask"><rect width="{W}" height="{H}" fill="url(#{u}fade)"></rect></mask>',
            f'<linearGradient id="{u}fx" gradientUnits="userSpaceOnUse" x1="0" y1="0" x2="{W}" y2="0"><stop offset="0" stop-color="#fff" stop-opacity="{self.fx0}"></stop><stop offset=".5" stop-color="#fff" stop-opacity=".45"></stop><stop offset="1" stop-color="#fff"></stop></linearGradient>',
            f'<mask id="{u}gmask"><rect width="{W}" height="{H}" fill="url(#{u}fx)"></rect></mask>',
            self.dots(),
        ]
        if history:
            defs[:0] = [
                f'<linearGradient id="{u}line" gradientUnits="userSpaceOnUse" x1="{ax:.0f}" y1="{ay:.0f}" x2="{bx:.0f}" y2="{by:.0f}"><stop offset="0" class="art-stop-a"></stop><stop offset=".55" class="art-stop-b"></stop><stop offset=".8" class="art-stop-b"></stop><stop offset=".9" class="art-stop-c"></stop><stop offset="1" class="art-stop-c"></stop></linearGradient>'
            ]
            defs.insert(
                3,
                f'<filter id="{u}glow" x="-10%" y="-10%" width="120%" height="120%"><feGaussianBlur stdDeviation="8"></feGaussianBlur></filter>',
            )
        layers = self.layers
        return "\n".join(
            [
                f'<svg class="{cls}" viewBox="0 0 {W} {H}" preserveAspectRatio="{align}" aria-hidden="true">',
                "<defs>",
                *defs,
                "</defs>",
                f'<rect class="art-grid" width="{W}" height="{H}" fill="url(#{u}dots)" mask="url(#{u}mask)"></rect>',
                f'<g class="art-ghosts" mask="url(#{u}gmask)">'
                + "".join(layers["ghosts"])
                + "</g>",
                *layers["lanes"],
                *layers["main"],
                *layers["nodes"],
                *layers["seal"],
                "</svg>",
                "",
            ]
        )

    def dots(self):
        w, h = 2 * self.s * C, self.s
        x, y = self.ox % w, self.oy % h
        dots = "".join(
            f'<circle class="art-dot" cx="{cx:.1f}" cy="{cy:.1f}" r="1.6"></circle>'
            for cx, cy in ((0, 0), (w, 0), (0, h), (w, h), (w / 2, h / 2))
        )
        return f'<pattern id="{self.uid}dots" patternUnits="userSpaceOnUse" x="{x:.1f}" y="{y:.1f}" width="{w:.2f}" height="{h:.2f}">{dots}</pattern>'


def place(step, seq, end_xy):
    """The grid's origin that puts the end of `seq` at `end_xy`."""
    i, j = walk((0, 0), seq)[-1]
    return end_xy[0] - i * step * C, end_xy[1] - (j * step - i * step / 2)


def ghosts(art, n, seed, top, bottom):
    """The faint lanes of other projects, across the whole width."""
    rnd = random.Random(seed)
    i0 = int((-art.ox) / (art.s * C)) - 2
    turn = {"R": (1, 0), "D": (1, 1), "U": (0, -1), "N": (0, 1)}
    for k in range(n):
        y0 = top + (bottom - top) * (k + rnd.random() * 0.6) / n
        j = round((y0 - art.oy + i0 * art.s / 2) / art.s)
        i, seq = i0, ""
        for _ in range(int(art.W / (art.s * C)) + 6):
            m = rnd.choices("RDUN", [0.44, 0.44, 0.06, 0.06])[0]
            di, dj = turn[m]
            y = art.oy + (j + dj) * art.s - (i + di) * art.s / 2
            if y < top:
                m = "D" if m in "RU" else m
            if y > bottom:
                m = "R" if m in "DN" else m
            di, dj = turn[m]
            i += di
            j += dj
            seq += m
        start = (i0, j - sum({"R": 0, "D": 1, "U": -1, "N": 1}[c] for c in seq))
        art.ghost(start, seq, nodes_every=rnd.choice((3, 4, 5)))


def hero_desk():
    """Wide: the history climbs on the right to its seal, behind the text."""
    seq = "RRUURRUURRRDRUURRUR"
    a = Art("desk", 1440, 640, 44, *place(44, seq, (1290, 176)), "hd")
    ghosts(a, 5, 7, top=130, bottom=600)
    a.main((0, 0), seq)
    a.lane(3, "DRUU", avatar_at=3)
    a.lane(6, "DRRUUU", avatar_at=3)
    a.lane(13, "UURR")
    a.nodes([2, 4, 8, 10, 13, 15, 17])
    a.nodes([6, 11], big=(6, 11))
    a.seal(30)
    return a.svg("hero-art__graph hero-art__graph--desk", "xMaxYMid slice")


def hero_phone():
    """Tall: between the text and the actions, the seal at the top."""
    seq = "RRRUULLUURRRUULLLUURRRUULLUURRDRR"
    p = Art("phone", 390, 760, 36, *place(36, seq, (296, 70)), "hp")
    p.fx0 = 0.7
    ghosts(p, 4, 11, top=20, bottom=700)
    p.main((0, 0), seq)
    p.lane(20, "UURR", avatar_at=2)
    p.nodes([3, 6, 9, 12, 15, 18, 20, 27, 30])
    p.nodes([24], big=(24,))
    p.seal(26)
    return p.svg("hero-art__graph hero-art__graph--phone", "xMidYMin slice")


def band():
    """The page bands' ground: the grid and the lanes, no history."""
    W, H = 1440, 560
    a = Art("bg", W, H, 44, 70, 560, "bg")
    a.fx0 = 0.08
    ghosts(a, 4, 23, top=60, bottom=H - 30)
    a.grad = (
        (W * 0.2, H * 0.9),
        (W * 0.85, H * 0.15),
    )  # the fade centres on the top right
    return a.svg("page-band__art", "xMaxYMid slice", history=False)


if __name__ == "__main__":
    OUT.mkdir(parents=True, exist_ok=True)
    for name, svg in (
        ("hero-desk", hero_desk()),
        ("hero-phone", hero_phone()),
        ("band", band()),
    ):
        (OUT / f"{name}.svg").write_text(svg)
        print(OUT / f"{name}.svg")

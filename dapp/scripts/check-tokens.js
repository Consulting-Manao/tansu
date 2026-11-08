/**
 * Only the design system's colours and sizes: fails on a Tailwind palette
 * class (bg-zinc-100, text-white), an arbitrary colour (bg-[#fff]), an old
 * token name (text-primary), one of Tailwind's own text sizes (text-sm:
 * use text-ui, text-small, text-body…) or an arbitrary pixel value
 * (gap-[18px]: use the spacing scale, gap-4). global.css resets the palette
 * and the text sizes, so such a class would draw nothing. PDF pieces print
 * fixed colours and are left out.
 */
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

const utilities =
  "bg|text|border|border-[trblxy]|ring|ring-offset|fill|stroke|from|via|to|divide|outline|decoration|shadow|accent|caret|placeholder";
const palette =
  "slate|gray|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose";
const forbidden = new RegExp(
  `(?<![\\w-])(?:[a-z-]+:)*(?:${utilities})-(?:(?:${palette})-\\d+|white|black|primary|secondary|tertiary|\\[(?:#|rgb|hsl)[^\\]]*\\])(?:/\\d+)?(?![\\w-])`,
  "g",
);

const sizes =
  /(?<![\w-])(?:[a-z-]+:)*(?:text-(?:xs|sm|base|lg|xl|[2-9]xl)|-?[a-z][a-z-]*-\[[\d.]+px[^\]]*\])(?![\w-])/g;

const files = (dir) =>
  readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory())
      return path.endsWith("components/pdf") ? [] : files(path);
    return /\.(tsx?|astro)$/.test(entry.name) ? [path] : [];
  });

const found = files("src").flatMap((file) =>
  readFileSync(file, "utf8")
    .split("\n")
    .flatMap((line, index) =>
      [...line.matchAll(forbidden), ...line.matchAll(sizes)].map(
        (match) => `${file}:${index + 1}: ${match[0]}`,
      ),
    ),
);
if (found.length) {
  console.error(
    `Colours or sizes outside the design system's tokens (styles/global.css):\n${found.join("\n")}`,
  );
  process.exit(1);
}

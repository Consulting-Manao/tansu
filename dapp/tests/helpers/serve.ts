/**
 * Serves the production build to Playwright the way Netlify does: directory
 * indexes, and the query string left to the page. `astro preview` cannot: the
 * Netlify adapter does not support it.
 *
 * Like the CDN in front of Netlify, an /_astro/ file is immutable: the first
 * answer for a URL is kept. With ?dpl= that is the deploy asked for. Without
 * it, a rebuild leaves the plain URL on the deploy that first served it.
 */
import { createReadStream } from "node:fs";
import { readFile, stat } from "node:fs/promises";
import { createServer } from "node:http";
import { extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";

const dist = fileURLToPath(new URL("../../dist/", import.meta.url));
const types: Record<string, string> = {
  ".css": "text/css",
  ".html": "text/html",
  ".jpg": "image/jpeg",
  ".js": "text/javascript",
  ".json": "application/json",
  ".md": "text/markdown",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".wasm": "application/wasm",
  ".webmanifest": "application/manifest+json",
};

const edge = new Map<string, Buffer>();

async function isFile(path: string): Promise<boolean> {
  return (await stat(path).catch(() => null))?.isFile() ?? false;
}

createServer(async (request, response) => {
  const path = normalize(
    decodeURIComponent(new URL(request.url ?? "/", "http://e2e").pathname),
  );
  for (const candidate of [path, join(path, "index.html")]) {
    const file = join(dist, candidate);
    if (file.startsWith(dist) && (await isFile(file))) {
      response.setHeader(
        "content-type",
        types[extname(file)] ?? "application/octet-stream",
      );
      if (path.startsWith("/_astro/")) {
        const key = request.url ?? path;
        if (!edge.has(key)) edge.set(key, await readFile(file));
        response.end(edge.get(key));
        return;
      }
      createReadStream(file).pipe(response);
      return;
    }
  }
  response.writeHead(404).end("Not found");
}).listen(Number(process.env.E2E_PORT));

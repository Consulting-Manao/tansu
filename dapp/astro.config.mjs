import { readdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "astro/config";
import react from "@astrojs/react";
import netlify from "@astrojs/netlify";
import { generateSW } from "workbox-build";

/** The build: the commit being built, or the build time. */
const BUILD = process.env.COMMIT_REF ?? String(Date.now());

/**
 * Writes dist/sw.js once the pages exist. It precaches the app, so a tab keeps
 * one consistent version, and waits for the user's Reload
 * (src/components/layout/UpdatePrompt.astro) before taking over.
 *
 * On Netlify, the adapter stamps the deploy's ID into every import (?dpl=)
 * without renaming the files, so one name holds a different file per deploy.
 * The CDN keeps an /_astro/ file for a year under its plain URL, whichever
 * deploy first served it. The worker therefore precaches each file under the
 * URL the pages ask for, ?dpl= included: a plain URL could bring a file of an
 * older deploy, which imports its own copy of React and breaks every island.
 */
function serviceWorker() {
  return {
    name: "tansu:service-worker",
    hooks: {
      "astro:build:done": async ({ dir, logger }) => {
        const root = fileURLToPath(dir);
        // What a tab compares its own build with (src/utils/version.ts).
        await writeFile(
          `${root}version.json`,
          JSON.stringify({ build: BUILD }),
        );
        await stampPreloads(root);
        const stamp = await deployStamp(root);
        const { count, size, warnings } = await generateSW({
          globDirectory: root,
          swDest: `${root}sw.js`,
          globPatterns: [
            "**/*.html",
            "_astro/*.{js,css}",
            "*.{svg,png,jpg,json}",
            "{icons,images}/**",
            // Self-hosted, so the installed app keeps its type offline.
            "fonts/*.woff2",
          ],
          // version.json must come from the network, never from the worker.
          globIgnores: ["social-card.png", "version.json"],
          // The XDR decoder of a proposal's raw transaction is 3.5 MB of
          // WebAssembly that few pages need: kept once used, not installed.
          runtimeCaching: [
            {
              urlPattern: /\/_astro\/[^/]+\.wasm$/,
              handler: "CacheFirst",
              options: {
                cacheName: "tansu-wasm",
                expiration: { maxEntries: 4 },
              },
            },
          ],
          maximumFileSizeToCacheInBytes: 8 * 2 ** 20,
          // Pages read their query string in the browser, and Netlify adds
          // ?dpl= to assets.
          ignoreURLParametersMatching: [/.*/],
          cleanupOutdatedCaches: true,
          inlineWorkboxRuntime: true,
          manifestTransforms: [
            async (entries) => ({
              manifest: entries.map((entry) => ({
                ...entry,
                url: stamp(entry.url),
              })),
              warnings: [],
            }),
          ],
        });
        for (const warning of warnings) logger.warn(warning);
        logger.info(
          `sw.js precaches ${count} files (${(size / 2 ** 20).toFixed(1)} MiB)`,
        );
      },
    },
  };
}

/**
 * The adapter stamps a chunk's imports, not the list of files a lazy chunk
 * preloads (`__vite__mapDeps`, which ignores `build.modulePreload` here).
 * Unstamped, they are fetched twice, the first time under a plain URL that
 * can hold another deploy's file.
 */
async function stampPreloads(root) {
  const id = process.env.DEPLOY_ID;
  if (!id) return;
  const query = `?dpl=${encodeURIComponent(id)}`;
  const dir = join(root, "_astro");
  for (const file of await readdir(dir)) {
    if (!file.endsWith(".js")) continue;
    const path = join(dir, file);
    const source = await readFile(path, "utf8");
    const stamped = source.replace(/m\.f=\[[^\]]*\]/g, (list) =>
      list.replace(/"(_astro\/[^"?]+\.js)"/g, `"$1${query}"`),
    );
    if (stamped !== source) await writeFile(path, stamped);
  }
}

/**
 * Gives a precached file the ?dpl= query the pages load it with. Files the
 * build refers to without it, like the XDR decoder's WebAssembly, keep their
 * plain URL. Outside Netlify there is no deploy ID and nothing is stamped.
 */
async function deployStamp(root) {
  const id = process.env.DEPLOY_ID;
  if (!id) return (url) => url;
  const query = `?dpl=${encodeURIComponent(id)}`;
  const files = await readdir(root, { recursive: true });
  const sources = await Promise.all(
    files
      .filter((file) => /\.(html|js|css)$/.test(file))
      .map((file) => readFile(join(root, file), "utf8")),
  );
  const built = sources.join("\n");
  return (url) =>
    url.startsWith("_astro/") && built.includes(url.slice(6) + query)
      ? url + query
      : url;
}

// https://astro.build/config
export default defineConfig({
  integrations: [react(), serviceWorker()],
  adapter: netlify(),
  vite: {
    define: {
      // A new build must not restore queries cached in an older data shape.
      "import.meta.env.PUBLIC_BUILD": JSON.stringify(BUILD),
    },
    optimizeDeps: {
      include: ["ipfs-car"],
    },
    resolve: {
      alias: {
        // Nido's wallet module only needs `isContractId`; see the file.
        "@nidohq/passkey-sdk": fileURLToPath(
          new URL("./src/components/nido-passkey-sdk.ts", import.meta.url),
        ),
      },
    },
  },
});

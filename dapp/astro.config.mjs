import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "astro/config";
import react from "@astrojs/react";
import netlify from "@astrojs/netlify";
import { generateSW } from "workbox-build";

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
        const stamp = await deployStamp(root);
        const { count, size, warnings } = await generateSW({
          globDirectory: root,
          swDest: `${root}sw.js`,
          globPatterns: [
            "**/*.html",
            // The XDR decoder of the proposal page is WebAssembly.
            "_astro/*.{js,css,wasm}",
            "*.{svg,png,jpg,json}",
            "{icons,images}/**",
          ],
          globIgnores: ["social-card.png"],
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
      "import.meta.env.PUBLIC_BUILD": JSON.stringify(
        process.env.COMMIT_REF ?? String(Date.now()),
      ),
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

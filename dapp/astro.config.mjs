import { fileURLToPath } from "node:url";
import { defineConfig } from "astro/config";
import react from "@astrojs/react";
import netlify from "@astrojs/netlify";
import { generateSW } from "workbox-build";

/**
 * Writes dist/sw.js once the pages exist. It precaches the app, so a tab keeps
 * one consistent version, and waits for the user's Reload
 * (src/components/layout/UpdatePrompt.astro) before taking over.
 */
function serviceWorker() {
  return {
    name: "tansu:service-worker",
    hooks: {
      "astro:build:done": async ({ dir, logger }) => {
        const root = fileURLToPath(dir);
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
          dontCacheBustURLsMatching: /^_astro\//,
          // Pages read their query string in the browser, and Netlify adds
          // ?dpl= to assets.
          ignoreURLParametersMatching: [/.*/],
          cleanupOutdatedCaches: true,
          inlineWorkboxRuntime: true,
        });
        for (const warning of warnings) logger.warn(warning);
        logger.info(
          `sw.js precaches ${count} files (${(size / 2 ** 20).toFixed(1)} MiB)`,
        );
      },
    },
  };
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

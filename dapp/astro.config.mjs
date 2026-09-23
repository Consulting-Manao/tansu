import { fileURLToPath } from "node:url";
import { defineConfig } from "astro/config";
import react from "@astrojs/react";
import netlify from "@astrojs/netlify";

// https://astro.build/config
export default defineConfig({
  integrations: [react()],
  adapter: netlify(),
  vite: {
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

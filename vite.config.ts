import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
let outputDirectory = "dist";
export default defineConfig({
  plugins: [
    react(),
    {
      name: "simroom-precache",
      configResolved(config) { outputDirectory = config.build.outDir; },
      closeBundle() {
        const assets = readdirSync(`${outputDirectory}/assets`)
          .filter((n) => /\.(js|css)$/.test(n))
          .map((n) => "/assets/" + n);
        const version = createHash("sha256")
          .update(JSON.stringify(assets) + readFileSync("public/sw.js", "utf8"))
          .digest("hex")
          .slice(0, 12);
        writeFileSync(
          `${outputDirectory}/sw.js`,
          readFileSync("public/sw.js", "utf8")
            .replace("[]/*BUILD_ASSETS*/", JSON.stringify(assets))
            .replace("simroom-shell-v1", "simroom-shell-" + version),
        );
      },
    },
  ],
  server: { host: "0.0.0.0" },
});

import { defineConfig, loadEnv } from "vite";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { appendFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createLogger } from "vite";
import { selectWritableLogDirectory } from "./scripts/writable-log-directory.mjs";

const packageJson = JSON.parse(readFileSync(new URL("./package.json", import.meta.url), "utf8"));
const installedApiEnvPath = "C:\\ProgramData\\PDV\\app\\.env";
const readEnvValue = (content, name) => {
  const line = String(content).split(/\r?\n/u).find((entry) => entry.trimStart().startsWith(`${name}=`));
  return line ? line.slice(line.indexOf("=") + 1).trim().replace(/^"(.*)"$/u, "$1") : "";
};
const readInstalledApiToken = () => {
  try {
    return readEnvValue(readFileSync(installedApiEnvPath, "utf8"), "PDV_API_TOKEN");
  } catch {
    return "";
  }
};
const runGit = (...args) => {
  try {
    return execFileSync("git", args, { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();
  } catch {
    return "nogit";
  }
};
const sourceFingerprint = createHash("sha256")
  .update(`${runGit("rev-parse", "HEAD")}\n${runGit("diff", "HEAD", "--binary")}`)
  .digest("hex")
  .slice(0, 12);
const buildId = sourceFingerprint;
const viteLogDirectory = selectWritableLogDirectory([
  process.env.PDV_LOG_DIR,
  process.env.LOCALAPPDATA ? join(process.env.LOCALAPPDATA, "PDV", "logs") : "",
  "C:\\ProgramData\\PDV\\logs",
  join(tmpdir(), "PDV", "logs")
]);
const viteLogPath = viteLogDirectory ? join(viteLogDirectory, "pdv-vite.log") : "";
const viteLogger = createLogger("info", { prefix: "[vite]" });
for (const level of ["info", "warn", "error"]) {
  const original = viteLogger[level];
  viteLogger[level] = (message, options) => {
    original(message, options);
    if (viteLogPath) {
      try {
        appendFileSync(
          viteLogPath,
          `[${new Date().toISOString()}] [${level.toUpperCase()}] ${String(message || "").replace(/[\r\n\t]+/gu, " ").slice(0, 5000)}\n`,
          "utf8"
        );
      } catch {
        // Keep Vite startup and build output functional if a log becomes unwritable.
      }
    }
  };
}

export default defineConfig(({ command, mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  const developmentApiToken = command === "serve"
    ? String(readInstalledApiToken() || env.VITE_PDV_API_TOKEN || env.PDV_API_TOKEN || "").trim()
    : "";

  return {
    customLogger: viteLogger,
    define: {
      "import.meta.env.VITE_PDV_VERSION": JSON.stringify(packageJson.version),
      "import.meta.env.VITE_PDV_BUILD_ID": JSON.stringify(buildId),
      "import.meta.env.VITE_PDV_BUILD_SOURCE": JSON.stringify("source-fingerprint"),
      ...(developmentApiToken
        ? { "import.meta.env.VITE_PDV_API_TOKEN": JSON.stringify(developmentApiToken) }
        : {})
    },
    build: {
      rollupOptions: {
        output: {
          manualChunks(id) {
            const normalizedId = id.replaceAll("\\", "/");
            if (normalizedId.includes("/node_modules/")) return "vendor";
            if (normalizedId.includes("/src/catalog/")) return "catalog";
            if (normalizedId.includes("/src/stock/")) return "stock";
            if (normalizedId.includes("/src/tools/")) return "tools";
            if (normalizedId.includes("/src/settings/")) return "settings";
            if (normalizedId.includes("/src/operator/")) return "operator";
            if (normalizedId.includes("/src/sales/")) return "sales";
            if (normalizedId.includes("/src/backoffice/")) return "backoffice";
            if (normalizedId.includes("/src/shared/")) return "shared";
            if (normalizedId.includes("/src/ui/")) return "ui";
            return undefined;
          }
        }
      }
    },
    server: {
      watch: {
        ignored: ["**/src-tauri/target/**"]
      }
    }
  };
});

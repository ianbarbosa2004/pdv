import { defineConfig, loadEnv } from "vite";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";

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

export default defineConfig(({ command, mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  const developmentApiToken = command === "serve"
    ? String(readInstalledApiToken() || env.VITE_PDV_API_TOKEN || env.PDV_API_TOKEN || "").trim()
    : "";

  return {
    define: {
      "import.meta.env.VITE_PDV_VERSION": JSON.stringify(packageJson.version),
      "import.meta.env.VITE_PDV_BUILD_ID": JSON.stringify(buildId),
      "import.meta.env.VITE_PDV_BUILD_SOURCE": JSON.stringify("source-fingerprint"),
      ...(developmentApiToken
        ? { "import.meta.env.VITE_PDV_API_TOKEN": JSON.stringify(developmentApiToken) }
        : {})
    },
    server: {
      watch: {
        ignored: ["**/src-tauri/target/**"]
      }
    }
  };
});

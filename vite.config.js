import { defineConfig } from "vite";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";

const packageJson = JSON.parse(readFileSync(new URL("./package.json", import.meta.url), "utf8"));
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
const buildId = `${packageJson.version}-${sourceFingerprint}`;

export default defineConfig({
  define: {
    "import.meta.env.VITE_PDV_BUILD_ID": JSON.stringify(buildId),
    "import.meta.env.VITE_PDV_BUILD_SOURCE": JSON.stringify("source-fingerprint")
  },
  server: {
    watch: {
      ignored: ["**/src-tauri/target/**"]
    }
  }
});

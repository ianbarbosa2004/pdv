import { copyFile, mkdir, readdir, rm, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { spawn } from "node:child_process";

const root = resolve(import.meta.dirname, "..");
const releaseDir = join(root, "dist", "releases");
const packageJson = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));
const packageVersion = String(packageJson.version);

const parseArgs = (args) => Object.fromEntries(args
  .filter((argument) => argument.startsWith("--"))
  .map((argument) => {
    const [key, ...value] = argument.slice(2).split("=");
    return [key, value.join("=") || true];
  }));

const args = parseArgs(process.argv.slice(2));
const apiUrl = String(
  args["api-url"] || process.env.PDV_API_URL || process.env.VITE_PDV_API_URL || "http://192.168.1.200:3000"
).replace(/\/+$/, "");
const refreshIcons = args["refresh-icons"] === true;

const run = (command, commandArgs, environment = {}) => new Promise((resolvePromise, reject) => {
  const isWindowsCommand = process.platform === "win32" && command.toLowerCase().endsWith(".cmd");
  const executable = isWindowsCommand ? (process.env.ComSpec || "cmd.exe") : command;
  const quoteWindowsArgument = (value) => {
    const text = String(value);
    return /[\s"]/u.test(text) ? `"${text.replaceAll('"', '\\"')}"` : text;
  };
  const executableArgs = isWindowsCommand
    ? ["/d", "/c", [command, ...commandArgs].map(quoteWindowsArgument).join(" ")]
    : commandArgs;
  const child = spawn(executable, executableArgs, {
    cwd: root,
    env: { ...process.env, ...environment },
    stdio: "inherit",
    shell: false
  });
  child.on("error", reject);
  child.on("exit", (code) => {
    if (code === 0) resolvePromise();
    else reject(new Error(`${command} terminou com código ${code}.`));
  });
});

const safeName = (value) => String(value || "empresa")
  .normalize("NFKD")
  .replace(/[\u0300-\u036f]/g, "")
  .replace(/[^a-zA-Z0-9]+/g, "-")
  .replace(/^-+|-+$/g, "")
  .toLowerCase() || "empresa";

const projectName = "PDV Zanzibar";
const releaseName = safeName(projectName);
const bundleFilePattern = new RegExp(
  `^PDV Zanzibar_${packageVersion.replaceAll(".", "\\.")}_.+\\.(msi|exe)$`,
  "i"
);
const releaseFilePattern = new RegExp(
  `^${releaseName}(?:-\\d+\\.\\d+\\.\\d+)?(?:-PDV(?: Zanzibar)?_.*|-metadata)?\\.(?:msi|exe|json)$`,
  "i"
);
const releaseMetadata = {
  projectName,
  apiUrl,
  iconSource: "src-tauri/icons",
  generatedAt: new Date().toISOString()
};

const npmCommand = process.platform === "win32" ? "npm.cmd" : "npm";
if (refreshIcons) {
  await run(npmCommand, [
    "exec",
    "--",
    "tauri",
    "icon",
    join(root, "src-tauri", "icons", "icon.png"),
    "--output",
    join(root, "src-tauri", "icons")
  ]);
}
await run(npmCommand, ["run", "tauri", "--", "build"], {
  VITE_PDV_API_URL: apiUrl,
  VITE_PDV_BUILD_SOURCE: "fixed-icon-release"
});

await mkdir(releaseDir, { recursive: true });
for (const file of await readdir(releaseDir)) {
  if (releaseFilePattern.test(file)) {
    await rm(join(releaseDir, file), { force: true });
  }
}
const bundleDirectories = [
  join(root, "src-tauri", "target", "release", "bundle", "msi"),
  join(root, "src-tauri", "target", "release", "bundle", "nsis")
];
const copied = [];
const copiedExtensions = new Set();
for (const directory of bundleDirectories) {
  if (!existsSync(directory)) continue;
  const files = (await readdir(directory))
    .filter((file) => bundleFilePattern.test(file))
    .sort();
  for (const file of files) {
    const source = join(directory, file);
    const extension = file.slice(file.lastIndexOf(".")).toLowerCase();
    if (copiedExtensions.has(extension)) {
      throw new Error(`Mais de um instalador ${extension} da versão ${packageVersion} foi encontrado.`);
    }
    const target = join(releaseDir, `${releaseName}${extension}`);
    await copyFile(source, target);
    copied.push(target);
    copiedExtensions.add(extension);
  }
}
if (!copied.length) throw new Error("O build terminou, mas nenhum instalador MSI/EXE foi encontrado.");
await writeFile(
  join(releaseDir, `${releaseName}-metadata.json`),
  `${JSON.stringify(releaseMetadata, null, 2)}\n`,
  "utf8"
);
console.log(`Instaladores gerados em ${releaseDir}:`);
copied.forEach((file) => console.log(`- ${file}`));

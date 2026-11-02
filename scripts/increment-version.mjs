import { execFile } from "node:child_process";
import { readFile, writeFile } from "node:fs/promises";
import { promisify } from "node:util";
import { join, resolve } from "node:path";
import { bumpVersion, classifyVersionLevel } from "./versioning.mjs";

const root = resolve(import.meta.dirname, "..");
const execFileAsync = promisify(execFile);
const packagePath = join(root, "package.json");
const lockPath = join(root, "package-lock.json");
const tauriConfigPath = join(root, "src-tauri", "tauri.conf.json");
const cargoManifestPath = join(root, "src-tauri", "Cargo.toml");
const cargoLockPath = join(root, "src-tauri", "Cargo.lock");
const versioningOnlyPattern = /^(?:scripts\/(?:versioning|increment-version)\.mjs|src-tauri\/(?:Cargo\.toml|Cargo\.lock|tauri\.conf\.json)|package(?:-lock)?\.json)$/i;

const readJson = async (path) => JSON.parse(await readFile(path, "utf8"));
const writeJson = (path, value) => writeFile(path, `${JSON.stringify(value, null, 2)}\n`, "utf8");
const syncCargoVersion = async (version) => {
  const manifest = await readFile(cargoManifestPath, "utf8");
  const manifestVersionPattern = /(\[package\][\s\S]*?version\s*=\s*")[^"]+(")/;
  if (!manifestVersionPattern.test(manifest)) {
    throw new Error("Não foi possível localizar a versão do pacote Rust em Cargo.toml.");
  }
  const updatedManifest = manifest.replace(manifestVersionPattern, `$1${version}$2`);
  await writeFile(cargoManifestPath, updatedManifest, "utf8");

  const lock = await readFile(cargoLockPath, "utf8");
  const lockVersionPattern = /(\[\[package\]\][\s\S]*?name = "pdv"[\s\S]*?version = ")[^"]+(")/;
  if (!lockVersionPattern.test(lock)) {
    throw new Error("Não foi possível localizar o pacote pdv em Cargo.lock.");
  }
  const updatedLock = lock.replace(lockVersionPattern, `$1${version}$2`);
  await writeFile(cargoLockPath, updatedLock, "utf8");
};

const readGitChanges = async () => {
  try {
    const [{ stdout: diff }, { stdout: tracked }, { stdout: status }, { stdout: untracked }] = await Promise.all([
      execFileAsync("git", ["diff", "--no-ext-diff", "--unified=0", "HEAD", "--"], { cwd: root }),
      execFileAsync("git", ["diff", "--name-only", "HEAD", "--"], { cwd: root }),
      execFileAsync("git", ["diff", "--name-status", "HEAD", "--"], { cwd: root }),
      execFileAsync("git", ["ls-files", "--others", "--exclude-standard"], { cwd: root })
    ]);
    const addedPaths = status.split(/\r?\n/)
      .filter((line) => line.startsWith("A\t"))
      .map((line) => line.slice(2));
    return {
      diff,
      paths: [...new Set(`${tracked}\n${untracked}`.split(/\r?\n/).filter(Boolean))],
      addedPaths: [...addedPaths, ...untracked.split(/\r?\n/).filter(Boolean)]
    };
  } catch (error) {
    throw new Error(`Não foi possível identificar as alterações para o versionamento automático: ${error.message}`);
  }
};

if (process.env.PDV_SKIP_VERSION_BUMP === "1") {
  const packageJson = await readJson(packagePath);
  await syncCargoVersion(packageJson.version);
  console.log(`Incremento de versão ignorado; versão atual: ${packageJson.version}`);
  process.exit(0);
}

const packageJson = await readJson(packagePath);
const requestedLevel = process.argv[2] || "patch";
let level = requestedLevel;
if (requestedLevel === "auto") {
  const changes = await readGitChanges();
  const hasVersioningChanges = changes.paths.some((path) => versioningOnlyPattern.test(path.replaceAll("\\", "/")));
  if (hasVersioningChanges) {
    console.log(`Versionamento automático já aplicado para as alterações pendentes; versão mantida em ${packageJson.version}.`);
    process.exit(0);
  }
  level = classifyVersionLevel(changes);
  if (!level) {
    console.log(`Nenhuma alteração funcional detectada; versão mantida em ${packageJson.version}.`);
    process.exit(0);
  }
  console.log(`Versionamento automático: ${level}.`);
}
const nextVersion = bumpVersion(packageJson.version, level);
packageJson.version = nextVersion;
await writeJson(packagePath, packageJson);

const packageLock = await readJson(lockPath);
packageLock.version = nextVersion;
if (packageLock.packages?.[""]) {
  packageLock.packages[""].version = nextVersion;
}
await writeJson(lockPath, packageLock);

const tauriConfig = await readJson(tauriConfigPath);
tauriConfig.version = nextVersion;
await writeJson(tauriConfigPath, tauriConfig);
await syncCargoVersion(nextVersion);

console.log(`Versão incrementada para ${nextVersion}.`);

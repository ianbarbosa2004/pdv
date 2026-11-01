import { readFile, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { bumpVersion } from "./versioning.mjs";

const root = resolve(import.meta.dirname, "..");
const packagePath = join(root, "package.json");
const lockPath = join(root, "package-lock.json");
const tauriConfigPath = join(root, "src-tauri", "tauri.conf.json");
const cargoManifestPath = join(root, "src-tauri", "Cargo.toml");
const cargoLockPath = join(root, "src-tauri", "Cargo.lock");

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

if (process.env.PDV_SKIP_VERSION_BUMP === "1") {
  const packageJson = await readJson(packagePath);
  await syncCargoVersion(packageJson.version);
  console.log(`Incremento de versão ignorado; versão atual: ${packageJson.version}`);
  process.exit(0);
}

const packageJson = await readJson(packagePath);
const level = process.argv[2] || "patch";
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

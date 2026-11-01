export const bumpVersion = (version, level = "patch") => {
  const match = /^(\d+)\.(\d+)\.(\d+)$/.exec(String(version));
  if (!match) {
    throw new Error(`Versão inválida para incremento automático: ${version}`);
  }
  const [major, minor, patch] = match.slice(1).map(Number);
  if (!["major", "minor", "patch"].includes(level)) {
    throw new Error(`Nível de versão inválido: ${level}. Use major, minor ou patch.`);
  }
  if (level === "major") return `${major + 1}.0.0`;
  if (level === "minor") return `${major}.${minor + 1}.0`;
  return `${major}.${minor}.${patch + 1}`;
};

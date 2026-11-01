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

const documentationOnlyPattern = /^(?:README(?:\.[^/]+)?|docs\/|\.github\/|.*\.mdx?$)/i;
const sourcePattern = /^(?:src\/|src-tauri\/|scripts\/|package(?:-lock)?\.json|schema\.sql)/i;
const featurePattern = /^(?:src\/|src-tauri\/|scripts\/|package(?:-lock)?\.json|schema\.sql)/i;
const versioningOnlyPattern = /^(?:scripts\/(?:versioning|increment-version)\.mjs|src-tauri\/(?:Cargo\.toml|Cargo\.lock|tauri\.conf\.json))$/i;
const breakingPattern = /^\+\s*(?:(?:\/\/|#)\s*)?(?:BREAKING[ -]CHANGE:|BREAKING_CHANGE:)\s*\S/im;

const getSemanticDiff = (diff) => {
  const sections = String(diff).split(/^diff --git /m);
  if (sections.length === 1) return String(diff);
  return sections
    .filter((section) => {
      const pathMatch = /^a\/(.+?) b\/(.+?)\r?\n/.exec(section);
      return pathMatch && !versioningOnlyPattern.test(pathMatch[2]);
    })
    .map((section) => `diff --git ${section}`)
    .join("");
};

export const classifyVersionLevel = ({ paths = [], addedPaths = [], diff = "" } = {}) => {
  const changedPaths = paths.map((path) => String(path).replaceAll("\\", "/"));
  const added = addedPaths.map((path) => String(path).replaceAll("\\", "/"));
  const semanticDiff = getSemanticDiff(diff);
  const meaningfulPaths = changedPaths.filter((path) =>
    !versioningOnlyPattern.test(path)
  );
  if (!meaningfulPaths.length || meaningfulPaths.every((path) => documentationOnlyPattern.test(path))) {
    return null;
  }
  if (breakingPattern.test(semanticDiff)) return "major";
  if (added.some((path) => sourcePattern.test(path) && !documentationOnlyPattern.test(path))) {
    return "minor";
  }
  if (meaningfulPaths.some((path) => featurePattern.test(path) && !documentationOnlyPattern.test(path))) {
    if (/(?:^|\n)\+\s*export\s+(?:const|function|class)\b/.test(semanticDiff) ||
        /(?:^|\n)\+.*(?:\/api\/|CREATE TABLE|ALTER TABLE|dependencies|devDependencies)/i.test(semanticDiff) ||
        /(?:^|\n)\+.*(?:new feature|nova funcionalidade)/i.test(semanticDiff)) {
      return "minor";
    }
  }
  return "patch";
};

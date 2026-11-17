const escapeRegExp = (value) => String(value).replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");

export const selectCurrentInstallerFiles = (files, { projectName, version }) => {
  const bundleFilePattern = new RegExp(
    `^${escapeRegExp(projectName)}_${escapeRegExp(version)}_.+\\.(msi|exe)$`,
    "i"
  );
  const selected = new Map();

  for (const file of files.filter((entry) => bundleFilePattern.test(entry)).sort()) {
    const extension = file.slice(file.lastIndexOf(".")).toLowerCase();
    if (selected.has(extension)) {
      throw new Error(`Mais de um instalador ${extension} da versão ${version} foi encontrado.`);
    }
    selected.set(extension, file);
  }

  for (const extension of [".msi", ".exe"]) {
    if (!selected.has(extension)) {
      throw new Error(`O build não gerou o instalador ${extension} da versão ${version}.`);
    }
  }

  return selected;
};

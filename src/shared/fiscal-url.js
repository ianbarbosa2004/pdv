export const validateFiscalUrl = (value, label, {
  service = true,
  pathSuffix = "",
  allowedHostSuffixes = [".fazenda.mg.gov.br"]
} = {}) => {
  let url;
  try {
    url = new URL(value);
  } catch {
    throw new Error(`Informe uma URL HTTPS válida para ${label}.`);
  }
  const belongsToAllowedDomain = allowedHostSuffixes.some((suffix) =>
    url.hostname === suffix.replace(/^\./, "") || url.hostname.endsWith(suffix)
  );
  if (url.protocol !== "https:" || !belongsToAllowedDomain) {
    throw new Error(`${label} deve usar HTTPS e pertencer ao domínio oficial da SEFAZ.`);
  }
  if (pathSuffix && !url.pathname.endsWith(pathSuffix)) {
    throw new Error(`${label} deve apontar para o serviço oficial esperado.`);
  }
  if (service && !pathSuffix && !url.pathname.endsWith("/NFeConsultaProtocolo4")) {
    throw new Error(`${label} deve apontar para o serviço NFeConsultaProtocolo4.`);
  }
  return url.toString();
};

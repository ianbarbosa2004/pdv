const temporaryMessage = "Serviço de consulta de CNPJ temporariamente indisponível.";

const fetchLookup = async (url) => {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15000);
  try {
    const response = await fetch(url, { signal: controller.signal });
    const payload = await response.json();
    return { response, payload };
  } finally {
    clearTimeout(timeout);
  }
};

const normalizeBrasilPayload = (company) => ({
  razao_social: company.razao_social || "",
  nome_fantasia: company.nome_fantasia || "",
  ddd_telefone_1: company.ddd_telefone_1 || "",
  email: company.email || "",
  cep: company.cep || "",
  logradouro: company.logradouro || "",
  numero: company.numero || "",
  complemento: company.complemento || "",
  bairro: company.bairro || "",
  municipio: company.municipio || "",
  uf: company.uf || ""
});

export const normalizeReceitaWsPayload = (company) => ({
  razao_social: company.nome || "",
  nome_fantasia: company.fantasia || "",
  ddd_telefone_1: company.telefone || "",
  email: company.email || "",
  cep: company.cep || "",
  logradouro: company.logradouro || "",
  numero: company.numero || "",
  complemento: company.complemento || "",
  bairro: company.bairro || "",
  municipio: company.municipio || "",
  uf: company.uf || ""
});

export const lookupCnpj = async (cnpj) => {
  const digits = String(cnpj ?? "").replace(/\D/g, "");
  if (digits.length !== 14) throw new Error("Informe um CNPJ com 14 dígitos para consultar.");

  try {
    const { response, payload } = await fetchLookup(
      `https://brasilapi.com.br/api/cnpj/v1/${digits}`
    );
    if (response.ok && !payload.message) return normalizeBrasilPayload(payload);
    if (response.status === 404) throw new Error("CNPJ não encontrado.");
  } catch (error) {
    if (error instanceof Error && error.message === "CNPJ não encontrado.") throw error;
  }

  try {
    const { response, payload } = await fetchLookup(
      `https://www.receitaws.com.br/v1/cnpj/${digits}`
    );
    if (response.ok && payload.status === "OK") return normalizeReceitaWsPayload(payload);
    if (payload.status === "ERROR" && /não encontr|inválid/i.test(payload.message || "")) {
      throw new Error("CNPJ não encontrado.");
    }
  } catch (error) {
    if (error instanceof Error && error.message === "CNPJ não encontrado.") throw error;
  }

  throw new Error(temporaryMessage);
};

const diningTableStatuses = new Set(["free", "occupied", "closing"]);

export const normalizeDiningTableColor = (value) => {
  const raw = String(value ?? "").trim();
  const hexMatch = raw.match(/^#([0-9a-f]{3}|[0-9a-f]{6})$/iu);
  if (hexMatch) {
    const digits = hexMatch[1].toLowerCase();
    return digits.length === 3
      ? `#${digits.split("").map((digit) => `${digit}${digit}`).join("")}`
      : `#${digits}`;
  }
  const rgbMatch = raw.match(/^rgb\(\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})\s*\)$/iu);
  if (rgbMatch) {
    const channels = rgbMatch.slice(1).map(Number);
    if (channels.every((channel) => Number.isInteger(channel) && channel >= 0 && channel <= 255)) {
      return `#${channels.map((channel) => channel.toString(16).padStart(2, "0")).join("")}`;
    }
  }
  throw new Error("Informe uma cor válida em hexadecimal ou RGB.");
};

export const normalizeDiningTablePayload = (payload = {}) => {
  const visualIdentifier = String(payload.visualIdentifier ?? "").trim();
  const name = String(payload.name ?? "").trim();
  const people = payload.people === "" || payload.people == null
    ? 1
    : Number(payload.people);
  const status = String(payload.status ?? "free").trim();

  if (!visualIdentifier) {
    throw new Error("Informe o identificador visual da mesa.");
  }
  if (!Number.isInteger(people) || people < 1) {
    throw new Error("Informe uma quantidade válida de pessoas.");
  }
  if (!diningTableStatuses.has(status)) {
    throw new Error("Estado da mesa inválido.");
  }

  return {
    visualIdentifier,
    name,
    people,
    status
  };
};

export const sortDiningTables = (tables) =>
  [...tables].sort((left, right) => {
    const positionDifference = Number(left.sortPosition || 0) - Number(right.sortPosition || 0);
    if (positionDifference !== 0) return positionDifference;
    return new Intl.Collator("pt-BR", { numeric: true, sensitivity: "base" })
      .compare(left.visualIdentifier, right.visualIdentifier);
  });

export const normalizeDiningTableCount = (value) => {
  const count = Number(value);
  if (!Number.isInteger(count) || count < 1 || count > 200) {
    throw new Error("Informe um número de mesas entre 1 e 200.");
  }
  return count;
};

export const getDiningTablePeopleLabel = (people) => {
  const count = Number(people);
  return `${count} ${count === 1 ? "pessoa" : "pessoas"}`;
};

export const getDiningTableModalPresentation = (status) => {
  if (status === "occupied") {
    return {
      title: "Editar Mesa",
      statusLabel: "Ocupada",
      actionLabel: "Salvar alterações",
      nextStatus: "occupied"
    };
  }
  if (status === "closing") {
    return {
      title: "Fechamento",
      statusLabel: "Fechamento",
      actionLabel: "Abrir Mesa",
      nextStatus: "occupied"
    };
  }
  return {
    title: "Abrir Mesa",
    statusLabel: "Livre",
    actionLabel: "Abrir Mesa",
    nextStatus: "occupied"
  };
};

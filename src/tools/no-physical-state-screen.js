import { createProductViewsScreen } from "./views-screen.js";

export const isRawMaterialWithoutPhysicalState = (product) =>
  String(product?.descriptionProductType ?? "").trim().toLocaleUpperCase("pt-BR") === "MATÉRIA-PRIMA"
  && !product?.idPhysicalStateProduct;

export const createNoPhysicalStateScreen = (options = {}) => createProductViewsScreen({
  ...options,
  active: "no-physical-state",
  title: "Sem Estado Físico",
  description: "Matérias-primas sem estado físico definido para conversões culinárias.",
  showGroups: false,
  emptyLabel: "Nenhuma matéria-prima sem estado físico encontrada.",
  productFilter: isRawMaterialWithoutPhysicalState
});

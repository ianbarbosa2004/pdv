import { createProductViewsScreen } from "./views-screen.js";
import { isNoCostProduct } from "./views-model.js";

export const createNoCostScreen = (options = {}) => createProductViewsScreen({
  ...options,
  active: "no-cost",
  title: "Sem Custo",
  description: "Produtos com custo igual a zero que precisam de conferência.",
  showGroups: false,
  emptyLabel: "Nenhum produto sem custo encontrado.",
  productFilter: isNoCostProduct
});

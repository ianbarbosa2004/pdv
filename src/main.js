import "./styles.css";
import { createClassScreen } from "./catalog/class-screen.js";
import { createGroupScreen } from "./catalog/group-screen.js";
import { createCatalogScreen } from "./catalog/catalog-screen.js";
import { createSaleScreen } from "./sales/sale-screen.js";
import { createBackofficeScreen } from "./backoffice/backoffice-screen.js";

const app = document.querySelector("#app");

if (!app) {
  throw new Error("Elemento raiz da aplicação não encontrado.");
}

const showSales = () => app.replaceChildren(createSaleScreen({ onBackoffice: showBackoffice }));
const showBackoffice = () =>
  app.replaceChildren(
    createBackofficeScreen({
      onBack: showSales,
      onClasses: showClasses,
      onGroups: showGroups,
      onProducts: showCatalog
    })
  );
const showCatalog = () =>
  app.replaceChildren(
    createCatalogScreen({
      onBack: showSales,
      onClasses: showClasses,
      onGroups: showGroups,
      onProducts: showCatalog
    })
  );
const showClasses = () =>
  app.replaceChildren(
    createClassScreen({
      onBack: showSales,
      onClasses: showClasses,
      onGroups: showGroups,
      onProducts: showCatalog
    })
  );
const showGroups = () =>
  app.replaceChildren(
    createGroupScreen({
      onBack: showSales,
      onClasses: showClasses,
      onGroups: showGroups,
      onProducts: showCatalog
    })
  );

showSales();

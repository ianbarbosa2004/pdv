const DEFAULT_PAGE_SIZE = 25;

const renderPagination = (page, pageCount, total, pageSize) => {
  const start = (page - 1) * pageSize + 1;
  const end = Math.min(page * pageSize, total);
  return `
    <span>${start}-${end} de ${total} registro(s)</span>
    <div>
      <button class="classic-button" type="button" data-auto-page="first" ${page <= 1 ? "disabled" : ""}>Primeira</button>
      <button class="classic-button" type="button" data-auto-page="previous" ${page <= 1 ? "disabled" : ""}>Anterior</button>
      <span>Página ${page} de ${pageCount}</span>
      <button class="classic-button" type="button" data-auto-page="next" ${page >= pageCount ? "disabled" : ""}>Próxima</button>
      <button class="classic-button" type="button" data-auto-page="last" ${page >= pageCount ? "disabled" : ""}>Última</button>
    </div>
    <label class="catalog-page-size">
      <span>Itens por página</span>
      <select data-auto-page-size aria-label="Itens por página">
        ${[25, 50, 100].map((size) => `<option value="${size}" ${pageSize === size ? "selected" : ""}>${size}</option>`).join("")}
      </select>
    </label>`;
};

const bindWrapper = (wrapper) => {
  if (wrapper.dataset.paginationBound) return;
  const existingPagination = wrapper.nextElementSibling?.matches(".catalog-pagination")
    ? wrapper.nextElementSibling
    : null;
  if (existingPagination && !existingPagination.dataset.autoPagination) return;
  wrapper.dataset.paginationBound = "true";
  let page = 1;
  let pageSize = DEFAULT_PAGE_SIZE;

  const update = () => {
    const table = wrapper.querySelector("table");
    const rows = [...(table?.tBodies[0]?.rows || [])];
    const total = rows.length;
    const pagination = wrapper.nextElementSibling?.matches(".catalog-pagination")
      ? wrapper.nextElementSibling
      : null;

    if (total <= DEFAULT_PAGE_SIZE) {
      rows.forEach((row) => {
        row.hidden = false;
      });
      if (pagination?.dataset.autoPagination) pagination.remove();
      return;
    }

    const pageCount = Math.max(1, Math.ceil(total / pageSize));
    page = Math.min(page, pageCount);
    rows.forEach((row, index) => {
      row.hidden = index < (page - 1) * pageSize || index >= page * pageSize;
    });

    const element = pagination || document.createElement("div");
    element.className = "catalog-pagination";
    element.dataset.autoPagination = "true";
    element.innerHTML = renderPagination(page, pageCount, total, pageSize);
    if (!pagination) wrapper.after(element);

    element.querySelector("[data-auto-page='first']").onclick = () => {
      page = 1;
      update();
    };
    element.querySelector("[data-auto-page='previous']").onclick = () => {
      page -= 1;
      update();
    };
    element.querySelector("[data-auto-page='next']").onclick = () => {
      page += 1;
      update();
    };
    element.querySelector("[data-auto-page='last']").onclick = () => {
      page = pageCount;
      update();
    };
    element.querySelector("[data-auto-page-size]").onchange = (event) => {
      pageSize = Number(event.currentTarget.value) || DEFAULT_PAGE_SIZE;
      page = 1;
      update();
    };
  };

  const observer = new MutationObserver(() => {
    page = 1;
    update();
  });
  observer.observe(wrapper, { childList: true, subtree: true });
  update();
};

export const installTablePagination = (root) => {
  const bindTables = () => {
    root.querySelectorAll(".classic-grid-wrapper, .ncm-lookup-table-wrapper").forEach(bindWrapper);
  };
  const observer = new MutationObserver(bindTables);
  observer.observe(root, { childList: true, subtree: true });
  bindTables();
};

const PAGE_SIZES = [25, 50, 100];

export function parseCatalogPagination(searchParams) {
  const requestedPage = Number.parseInt(searchParams.get("page") || "1", 10);
  const requestedPageSize = Number.parseInt(searchParams.get("pageSize") || "25", 10);
  const search = String(searchParams.get("search") || "").trim().slice(0, 100);
  return {
    page: Number.isInteger(requestedPage) && requestedPage > 0 ? requestedPage : 1,
    pageSize: PAGE_SIZES.includes(requestedPageSize) ? requestedPageSize : 25,
    search,
    hasPagination: ["page", "pageSize", "search"].some((key) => searchParams.has(key))
  };
}

export function normalizeCatalogPage(page, total, pageSize) {
  const pageCount = Math.max(1, Math.ceil(Number(total) / pageSize));
  return {
    page: Math.min(page, pageCount),
    pageCount
  };
}

export const TABLE_DESCRIPTIONS = Object.freeze({
  classes: "Categorias fiscais e comerciais usadas para organizar grupos de produtos.",
  technical_logs: "Eventos técnicos da API, frontend, banco, serviços, impressoras e sistema.",
  dining_tables: "Mesas operacionais, estado atual, ocupantes e consumo.",
  groups: "Grupos comerciais vinculados a classes e exibidos no PDV.",
  physical_states: "Estados físicos usados por unidades culinárias e conversões.",
  fiscal_document_queue: "Documentos fiscais aguardando importação ou processamento.",
  fiscal_documents: "Cabeçalhos persistidos de documentos fiscais importados ou manuais.",
  fiscal_document_items: "Itens individuais extraídos dos documentos fiscais.",
  fiscal_entries: "Pré-entradas e entradas fiscais em revisão ou confirmação.",
  fiscal_entry_items: "Itens vinculados às pré-entradas e ao estoque.",
  product_fiscal_references: "Vínculos entre produtos e itens de catálogos fiscais.",
  fiscal_entry_payments: "Pagamentos associados às entradas fiscais.",
  products: "Produtos comerciais, mercadorias, matéria-prima e produtos acabados.",
  margin_group_overrides: "Limites e metas de margem específicos por grupo.",
  margin_product_overrides: "Limites e metas de margem específicos por produto.",
  margin_product_metrics: "Snapshots calculados de custo, preço e margem dos produtos.",
  margin_price_audits: "Histórico de alterações realizadas pelos balizadores de margem.",
  margin_general_settings: "Configuração geral de margem mínima e alvo.",
  margin_product_overrides: "Balizadores específicos por produto para margem mínima e alvo.",
  recipe_definitions: "Receitas, composições e formações produzidas pelo PDV.",
  recipe_components: "Componentes, quantidades, perdas e custos de receitas e formações.",
  product_recipe_links: "Vínculos quantificados entre produtos comerciais e receitas.",
  recipe_reviews: "Revisões e versões históricas das estruturas de receitas.",
  product_types: "Tipos fiscais e operacionais usados pelos produtos.",
  units: "Unidades fiscais e culinárias usadas no estoque e na produção.",
  unit_conversions: "Conversões entre unidades culinárias por estado físico.",
  inventory_movements: "Movimentos de estoque, custo anterior e custo posterior.",
  inventory_counts: "Contagens físicas de estoque abertas, concluídas ou canceladas.",
  inventory_count_items: "Itens e quantidades informados nas contagens físicas.",
  ncm_catalog: "Catálogo persistido de códigos e descrições NCM.",
  cest_catalog: "Catálogo persistido de códigos e descrições CEST.",
  ncm_cest_relations: "Relações vigentes entre códigos NCM e CEST.",
  ncm_cest_updates: "Execuções e resultados das atualizações de catálogos fiscais.",
  payment_methods: "Formas de pagamento disponíveis no PDV.",
  operators: "Operadores autenticados e seus perfis de acesso.",
  operator_sessions: "Sessões autenticadas, expiração e atividade dos operadores.",
  cash_registers: "Caixas físicos configurados na operação.",
  cash_sessions: "Aberturas, fechamentos e valores das sessões de caixa.",
  cash_movements: "Movimentos financeiros vinculados às sessões de caixa.",
  suppliers: "Cadastro de fornecedores da operação.",
  customers: "Consumidores identificados nas vendas.",
  consumers: "Consumidores finais e dados opcionais de identificação.",
  customer_vouchers: "Créditos e vouchers vinculados a consumidores.",
  printer_settings: "Configuração das impressoras e formatos de impressão.",
  general_settings: "Configurações gerais persistidas da aplicação.",
  company_settings: "Dados cadastrais e fiscais da empresa.",
  navigation_menus: "Menus principais configuráveis da interface.",
  navigation_items: "Itens e atalhos configuráveis dentro dos menus.",
  fiscal_operations: "Operações fiscais associadas a vendas e documentos.",
  fiscal_catalog_items: "Catálogos auxiliares fiscais, como CFOP e situações.",
  sales: "Vendas confirmadas, canceladas e seus dados operacionais.",
  sale_fiscal_documents: "Documentos fiscais emitidos ou vinculados às vendas.",
  sale_items: "Itens comercializados em cada venda.",
  sale_payments: "Pagamentos recebidos em cada venda."
});

export const ensureTableDescriptions = async (pool) => {
  const [rows] = await pool.query(
    `SELECT TABLE_NAME
     FROM information_schema.TABLES
     WHERE TABLE_SCHEMA = DATABASE()`
  );
  const existingTables = new Set(rows.map(({ TABLE_NAME }) => TABLE_NAME));
  let updated = 0;
  for (const [tableName, description] of Object.entries(TABLE_DESCRIPTIONS)) {
    const normalizedName = tableName;
    if (!existingTables.has(normalizedName)) continue;
    await pool.query(
      `ALTER TABLE \`${normalizedName}\` COMMENT = ?`,
      [description]
    );
    updated += 1;
  }
  return { updated };
};

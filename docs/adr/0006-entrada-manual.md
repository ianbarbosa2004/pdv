# ADR 0006 — Entrada manual

## Contexto

O estoque precisa registrar entradas que não dependem da importação de um XML,
mantendo o mesmo ciclo de validação, pagamento, estoque e custo das entradas
fiscais importadas.

## Decisão

Entradas manuais reutilizam `fiscal_documents`, `fiscal_entries`,
`fiscal_document_items` e `fiscal_entry_payments`. O documento recebe
`originFiscalDocument = 'manual'`, a origem escolhida é armazenada em
`manualSourceFiscalDocument` e o fornecedor é referenciado por
`idSupplierFiscalDocument`. A confirmação usa a transação de estoque/custo já
existente; somente entradas confirmadas podem ser canceladas.

O formulário mantém dois momentos distintos: **Salvar rascunho** persiste a
entrada em `draft` sem exigir que os pagamentos totalizem os itens; **Gravar
entrada** valida fornecedor, data, itens positivos e total exato dos pagamentos
antes de mudar o estado para `open`. Entradas `open` ficam somente leitura até
**Voltar para Digitação** ou **Revisar impacto**.

**Revisar impacto** consulta os efeitos estimados antes da confirmação. A
confirmação atualiza estoque, custo e propagação de custos de fichas dependentes
na mesma transação; qualquer falha desfaz toda a operação.

## Consequências

A fila de documentos importados exclui entradas manuais, enquanto a rota
`fiscal-entry-design` passa a listar e editar exclusivamente o fluxo manual.
Produtos manuais usam a unidade tributável ativa já cadastrada, sem conversão.

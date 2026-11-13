# Catálogo global de vínculos fiscais

## Contexto

O vínculo entre uma descrição fiscal e um Produto comercial era persistido
somente em `fiscal_entry_items`. Isso permitia concluir a Pré-entrada, mas não
oferecia uma visão reutilizável e auditável dos vínculos já confirmados.

## Decisão

Será mantida uma entidade global de vínculos fiscais, sem restrição por
fornecedor. A mesma combinação de descrição fiscal e unidade fiscal pode
apontar para vários Produtos comerciais; vínculos idênticos para o mesmo
produto são deduplicados.

Somente itens selecionados e concluídos entram no catálogo. A Pré-entrada
sincroniza esses vínculos na mesma transação que grava seus itens. Um vínculo
é removido quando não existe mais nenhuma ocorrência concluída que o utilize.
Dados fiscais de origem, como CFOP, NCM e CEST, permanecem no vínculo.

A tela **Estoque → Produtos Vinculados** é somente leitura. A manutenção dos
vínculos continua acontecendo na revisão da Pré-entrada.

## Consequências

A migração histórica pode reconstruir o catálogo a partir das Pré-entradas
concluídas sem duplicar registros. A consulta pode agrupar vínculos por Produto
comercial e expor os dados fiscais originais. Alterações na Pré-entrada exigem
reinício da API publicada para aplicar a migração idempotente do schema.

Cada vínculo também preserva a unidade de estoque e o fator de conversão
informados pelo operador. A reutilização automática só ocorre quando há um
único vínculo para a descrição e unidade fiscal; correspondências múltiplas
continuam exigindo escolha explícita.

Como etapa de normalização, `fiscal_entry_items.idProductFiscalReference`
passa a apontar para o catálogo global. A leitura prioriza os dados dessa
referência, enquanto os campos históricos de produto, unidade e conversão são
mantidos temporariamente para compatibilidade e recuperação durante a migração.
Eles só devem ser removidos após backup, conferência de referências e validação
das Pré-entradas históricas.

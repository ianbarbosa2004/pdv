---
agent: 'agent'
description: 'Criar cobertura node:test para um comportamento do PDV'
---

Adicione testes com `node:test` para o comportamento solicitado. Escolha
`tests/unit` para regras isoladas e `tests/integration` para API, MariaDB e
contratos HTTP.

Cubra caminho normal, entradas inválidas, limites e erros explícitos. Para
vendas, verifique totais, pagamentos, estoque, rollback e prevenção de
duplicidade. Não altere produção apenas para facilitar testes.

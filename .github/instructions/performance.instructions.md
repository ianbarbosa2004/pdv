---
applyTo: '**/*.js, **/*.mjs, **/*.cjs, **/*.html, **/*.css'
description: 'Desempenho e operação do PDV'
---

# Desempenho

- Evite transferir catálogos ou vendas desnecessários para o terminal.
- Faça filtros e paginação no servidor quando o conjunto crescer.
- Não recalcule estoque ou totais em renders não relacionados.
- Mantenha o carrinho responsivo e limite chamadas repetidas à API.
- Preserve a consistência da venda acima de otimizações prematuras.
- Meça antes de adicionar cache; não use cache que esconda alterações de estoque.
- Impressão deve ocorrer após confirmação e não bloquear a persistência.

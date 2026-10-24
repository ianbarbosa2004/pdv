---
applyTo: '**/*.js, **/*.mjs, **/*.cjs, **/tests/**'
description: 'Padrões de testes com node:test para o PDV'
---

# Testes

- Todos os testes ficam dentro de `tests/`.
- Testes de domínio e cálculo podem ser organizados em `tests/unit`.
- Testes de API, banco e contratos HTTP podem ser organizados em
  `tests/integration`.
- Cubra sucesso, entrada inválida, falha de persistência e limites relevantes.
- Para vendas, valide itens, totais, pagamentos, estoque e rollback transacional.
- Não use dados reais nem credenciais de produção.
- Execute primeiro o teste específico e depois:

```powershell
npm.cmd test
npm.cmd run build
node --check src/server/server.js
git diff --check
```

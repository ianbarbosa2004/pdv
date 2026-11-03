---
applyTo: '**/*.js, **/*.mjs, **/*.cjs, **/tests/**'
description: 'Padrões de testes com node:test para o PDV'
---

# Testes

- Todos os testes ficam dentro de `tests/`; mantenha testes de domínio e
  cálculo em `tests/unit/` e testes de API, banco e contratos HTTP em
  `tests/integration/`.
- Cubra sucesso, entrada inválida, falha de persistência e limites relevantes.
- Ao alterar um formulário com renderização assíncrona, teste que valores
  digitados sobrevivem à nova renderização e que Limpar, Cancelar e sucesso
  de salvamento retornam ao estado esperado.
- Para vendas, valide itens, totais, pagamentos, estoque e rollback transacional.
- Não use dados reais nem credenciais de produção.
- Execute primeiro o teste específico e depois:

```powershell
npm.cmd test
git diff --check
```

Execute `npm.cmd run build` somente quando a alteração envolver o bundle,
Vite/Tauri, versionamento ou uma validação de produção. Use `node --check` nos
arquivos JavaScript modificados.

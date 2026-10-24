---
applyTo: '**/*.js, **/*.mjs, **/*.cjs'
description: 'JavaScript and Node.js conventions for the PDV'
---

# JavaScript e Node.js

- Use módulos ES e recursos compatíveis com Node.js 22.
- Prefira APIs nativas e helpers existentes antes de adicionar dependências.
- Mantenha frontend, API, domínio compartilhado e camada Tauri separados.
- Use funções pequenas, transformações explícitas e `async/await`.
- Valide entradas no servidor, mesmo quando o frontend já valida.
- Use SQL parametrizado por meio da camada de banco.
- Preserve a propagação explícita de erros.
- Use `node:test`; não migre para Jest ou Vitest sem decisão explícita.
- Não inclua artefatos gerados ou dados de runtime em alterações.

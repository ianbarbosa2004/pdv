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
- Em formulários reconstruídos por `root.innerHTML`, preserve o rascunho
  digitado antes de renderizar novamente. Reutilize
  `src/ui/form-draft.js` ou um estado de rascunho equivalente; a técnica deve
  cobrir inputs, selects, textareas, checkboxes e radios, sem capturar modos
  de visualização ou substituir uma limpeza explícita do usuário.
- Para perguntas que interrompem uma ação, use `src/ui/confirmation-modal.js`
  em vez de `window.confirm`, com título, consequência, ação principal nomeada
  e cancelamento explícito. Não use diálogos nativos para confirmações do PDV.
- Não inclua artefatos gerados ou dados de runtime em alterações.

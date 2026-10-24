---
agent: 'agent'
description: 'Refatorar o PDV preservando comportamento e contratos'
---

Refatore cirurgicamente. Identifique comportamento atual, consumidores,
payloads, efeitos no MariaDB, estoque, impressão e testes antes de editar.

Mantenha regras compartilhadas em `src/shared`, integração de interface em
`src`, API em `src/server` e código nativo em `src-tauri`. Preserve transações,
validação e rollback visual. Adicione testes e execute a validação completa.

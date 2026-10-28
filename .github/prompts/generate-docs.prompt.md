---
agent: 'agent'
description: 'Atualizar documentação do PDV com base em mudanças verificadas'
---

Atualize somente a documentação afetada pela mudança solicitada. Para uma
consolidação histórica, atualize também `docs/PROJECT-HISTORY.md`. Compare
código, testes, scripts npm, workflow e documentos operacionais antes de
escrever.

Mantenha `README.md`, `docs/DEPLOYMENT.md`, `docs/AUTOMATIONS.md`,
`docs/AUTOMATION-PROMPTS.md`, `docs/CONTINUITY-PROMPT.md` e
`docs/PROJECT-HISTORY.md` coerentes. Não
documente segredos, dados reais ou artefatos. Valide com `git diff --check`.

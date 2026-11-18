# Entrevista de balizadores de margem de lucro

**Status:** pausada, aguardando a primeira decisão de negócio  
**Domínio:** PDV Zanzibar — bar e cozinha  
**Escopo:** especificação e planejamento, sem implementação

## Objetivo

Definir os balizadores de margem de lucro, suas regras de cálculo, herança,
propagação, permissões, telas, alertas, persistência e validações antes de
criar a ADR `0007-balizadores-margem-lucro.md` e um plano técnico executável.

## Documentação analisada

- `GLOSSARY.md`
- `database/schema.sql`
- `docs/DEVELOPMENT.md`
- `docs/PROJECT-HISTORY.md`
- `docs/adr/0002-receitas-composicoes-e-buffet.md`
- `docs/adr/0005-inventario-custos-e-confirmacao-fiscal.md`
- `docs/adr/0006-entrada-manual.md`

## Premissas propostas pelo usuário

- Margem Bruta sobre o preço de venda como possível métrica oficial.
- Lucro Unitário e CMV como indicadores auxiliares.
- Preço sugerido calculado a partir do custo e da margem alvo.
- Balizadores independentes de margem mínima e margem alvo.
- Herança Geral → Grupo → Produto.
- Aplicação a Mercadorias para Revenda e Produtos Acabados.
- Alertas em Produtos, Formação de Produtos, Entradas e ferramentas de
  auditoria.
- Nenhum bloqueio de venda ou confirmação de entrada por margem abaixo da
  mínima.

As premissas acima ainda não são decisões do domínio.

## Decisões fechadas

Nenhuma. A entrevista foi pausada antes da primeira resposta.

## Fronteira atual da sabatina

### Q1 — Métrica oficial

**Pergunta:** o balizador deve usar Margem Bruta sobre o preço de venda?

```text
Margem = (Preço de venda - Custo) / Preço de venda × 100
```

**Recomendação para o Zanzibar:** confirmar essa métrica. Ela representa
diretamente quanto do preço final permanece após o custo e é mais adequada
para decisões de cardápio e preço em bar e cozinha. Lucro Unitário e CMV (%)
podem permanecer como indicadores auxiliares somente leitura.

A escolha entre Margem Bruta e Markup sobre o custo deve ser fechada antes de
decidir os casos de preço ou custo igual a zero, o arredondamento psicológico e
o cálculo do Preço Sugerido.

## Regras da retomada

- Fazer uma pergunta por turno.
- Apresentar a recomendação para o cenário de bar e cozinha.
- Não gerar código, ADR final, glossário ou plano técnico antes de fechar a
  árvore de decisões e obter confirmação de entendimento compartilhado.
- Atualizar este documento quando uma decisão for respondida.

Para retomar em outra ocasião, envie:

> Continuar a sabatina dos balizadores de margem de lucro do PDV Zanzibar.

Se desejar registrar a primeira decisão imediatamente:

> Continuar a sabatina. Confirmo Margem Bruta sobre o preço de venda.

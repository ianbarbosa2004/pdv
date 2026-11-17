# Inventário, custos e confirmação fiscal

**Status:** accepted

Entradas fiscais serão confirmadas na tela operacional de Pré-entrada e, nessa
ação, atualizarão estoque e custo na mesma transação. Cada Produto comercial
terá uma política de custo padrão, inicialmente **Último custo**, podendo usar
**Custo médio**; somente operadores com permissão de estoque poderão substituir
essa política por item na Pré-entrada. O custo da primeira implementação usará
apenas o valor dos produtos dividido pela quantidade convertida para a unidade
de estoque, sem frete, seguro, despesas ou impostos.

O Inventário será uma operação recorrente em tela própria. Ele ajustará somente
quantidades, registrando a contagem, a diferença, o operador, a data e o
motivo; não alterará custos. Confirmações e desfazimentos permanecerão
auditáveis, e uma Entrada confirmada poderá ser desfeita por supervisor ou
administrador com motivo obrigatório, mesmo que isso produza divergências ou
saldo negativo a serem revisados operacionalmente.

As alterações de custo recalcularão os custos estimados das Receitas e
Composições dependentes, sem criar novas versões. A propagação ocorre na mesma
transação da confirmação fiscal, da edição manual do custo do Produto ou do
salvamento de uma Receita, Composição ou Ficha Técnica. A tela de teste de
entrada fiscal não será a tela operacional definitiva.

## Consequências

O schema precisará separar o estado atual do Produto dos eventos históricos de
estoque, custo, inventário e desfazimento. A interface operacional deverá
mostrar a política aplicada, permitir a revisão de impacto somente para itens
selecionados e vinculados e bloquear a confirmação enquanto houver pendências.

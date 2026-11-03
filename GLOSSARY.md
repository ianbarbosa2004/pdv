# PDV comercial

Este glossário define os termos de operação usados pelo domínio de operadores,
caixa e vendas.

## Operação

**Operador**:
Pessoa autenticada individualmente no PDV para executar operações autorizadas.
_Evitar_: usuário genérico, terminal.

**Sessão do operador**:
Período autenticado e expirável em que um operador pode executar operações no
PDV.
_Evitar_: token do terminal, login permanente.

**Caixa**:
Unidade financeira do PDV que recebe vendas e movimentos manuais.
_Evitar_: sessão do operador.

**Abertura de caixa**:
Registro do saldo inicial que inicia uma sessão financeira de caixa.
_Evitar_: entrada de operador.

**Fechamento de caixa**:
Encerramento de uma sessão financeira com valor contado, diferença e
justificativa quando necessária.
_Evitar_: logout.

**Cancelamento auditado de venda**:
Operação autorizada que marca uma venda como cancelada, registra operador,
horário e motivo, e reverte estoque e efeitos financeiros na mesma transação.
_Evitar_: exclusão física da venda.

# Entrevista de entrada fiscal

Este documento registra as decisões de domínio e o andamento da análise do
processo de entrada de documentos fiscais. Ele é a referência de continuidade
para evitar repetir perguntas já respondidas. O vídeo da entrada por XML será
analisado como evidência do sistema atual; o vídeo da entrada manual será
adicionado posteriormente.

## Status

- Entrevista de domínio: **encerrada**.
- Próxima evidência: vídeo do processo de entrada de XML no sistema atual.
- Evidência futura: vídeo do processo de entrada manual de nota fiscal.
- Implementação inicial do parser XML e da pré-entrada: em andamento.
- Não iniciar uma nova entrevista para repetir decisões já registradas.

## Fluxo observado no vídeo de entrada por XML

O vídeo mostra o seguinte fluxo no sistema atual:

1. A tela **Importar XML de Entrada** permite selecionar um arquivo pelo
   botão **Carregar Dados**. O seletor restringe a escolha a arquivos
   `*.xml` de NF-e.
2. Após a leitura, a nota exibe as abas **Fornecedor**, **Itens da Nota**,
   **Formas de Pagto.** e **Dados Adicionais**, além dos botões **Gravar**,
   **Imprimir** e **Ped. Compra**.
3. A listagem de itens exibe código do fornecedor, código do sistema,
   descrição, quantidade da nota, unidade fiscal, quantidade total convertida,
   unidade de estoque, CFOP, valor, total, frete, seguro, despesas e ICMS.
4. Dois produtos aparecem em verde porque já possuem vínculo cadastrado. O
   terceiro produto, **STELLA ARTOIS PURE GOLD 600ML**, aparece sem código do
   sistema e exige vínculo.
5. O produto sem vínculo é clicado duas vezes para abrir a tela de vínculo.
   Essa tela permite selecionar o Produto comercial, definir a operação fiscal,
   consultar a unidade e descrição da unidade da nota e configurar o conversor.
6. No exemplo, a nota usa `DZ`/Dúzias, o produto selecionado é o código
   `445` (**CERVEJA STELLA ARTOIS PURE GOLD GARRAFA 600ML**) e o conversor
   exibido é `DZ → DZ`, com fator `1`. A quantidade total do item é `2,0000`.
7. Após a seleção, a tela detalha o vínculo com código do fornecedor,
   código do sistema, descrição, cor, tamanho, lote, quantidade e unidade.
8. Na aba **Formas de Pagto.**, a parcela 1 possui vencimento em `05/11/2026`,
   valor de `553,70` e uma lista de formas que inclui **DINHEIRO** e **PIX**.
   Tentar gravar sem uma forma válida exibe **Forma de Pagamento inválida**.
9. Após selecionar **PIX** e gravar, a importação permanece persistida na tela,
   com a ação **Apagar Importação** e o pedido de compra `121` visível.
   Conforme informado pelo usuário, o status dessa entrada é **Em Aberto**.

### Interpretação para continuidade

O status **Em Aberto** representa uma entrada fiscal salva, mas ainda não
concluída para fins de estoque. Portanto, gravar a entrada não deve ser tratado
como confirmação final nem como autorização automática para movimentar estoque.
Enquanto estiver **Em Aberto**, a entrada não movimenta, reserva ou baixa
qualquer quantidade no estoque.
O fluxo observado também confirma que os vínculos existentes devem ser
identificados visualmente e que o vínculo ausente deve permitir a seleção do
produto e da conversão no contexto da própria nota.

### Observações de análise

- O sistema atual diferencia visualmente itens já vinculados e itens pendentes
  antes da gravação.
- A conversão é editada dentro do vínculo do item, não em uma etapa separada
  da entrada.
- A quantidade da nota e a quantidade total convertida são apresentadas
  separadamente.
- A forma de pagamento é obrigatória para gravar a importação.
- A gravação mantém a importação disponível para exclusão por **Apagar
  Importação**, coerente com o estado **Em Aberto** informado.

## Decisões confirmadas

### Documentos e pré-entrada

- NFC-e modelo 65 pode ser recebida por HTML.
- NF-e modelo 55 exige XML real.
- O hCaptcha permanece uma etapa manual quando exigido pelo portal fiscal.
- Dados fiscais ou financeiros ausentes não devem ser inventados.
- O documento fiscal consultado alimenta uma pré-entrada revisável antes de
  qualquer movimentação de estoque.
- A pré-entrada pode aproveitar somente parte dos itens do documento.
- O total da pré-entrada é recalculado com base apenas nos itens selecionados.
- Quantidades e unidades podem ser ajustadas antes da confirmação.
- Conversões podem ser cadastradas, por exemplo, `1 CX = 12 UN`.
- Linhas repetidas do documento de origem permanecem separadas.
- A unidade e a embalagem de origem participam da identificação do vínculo.

### Vínculos e correspondências

- O vínculo deve considerar descrição normalizada, unidade e embalagem de
  origem.
- Um mesmo Produto comercial pode possuir vários vínculos de descrição e
  unidade fiscal, inclusive para fornecedores diferentes.
- Vínculos podem ser reutilizados entre empresas ou lojas quando houver uma
  identidade compartilhada confiável.
- Sem produto local correspondente, o item permanece pendente.
- Quando não há identificador compartilhado confiável e existem múltiplos
  produtos locais possíveis, o sistema não escolhe automaticamente.
- Nesse caso, o operador deve selecionar explicitamente o produto local; a
  situação é registrada como vínculo pendente por correspondência ambígua.

### Fornecedor, auditoria e conclusão

- Se o fornecedor não existir, pode ser criado automaticamente após
  confirmação, usando o CNPJ exato.
- A data da entrada corresponde à data de emissão do documento.
- A chave de acesso duplicada deve ser rejeitada.
- O HTML/XML original e os metadados da consulta devem ser preservados.
- Entradas de estoque concluídas são imutáveis.
- Pré-entradas canceladas permanecem auditáveis.
- Itens omitidos ou parcialmente omitidos são descartados após a confirmação,
  sem movimentar estoque.

## Andamento técnico

### Já implementado

- Fila de documentos fiscais com consulta e validação da chave de acesso.
- Roteamento entre NF-e modelo 55 e NFC-e modelo 65.
- Fluxo assistido para consulta manual no portal fiscal.
- Cópia da chave e do endereço do portal.
- Registro manual dos dados básicos quando o portal exige hCaptcha.
- Validação de origem e abertura opcional do portal oficial.
- Retenção dos dados consultados na fila fiscal.
- Parser inicial de XML autorizado para NF-e/NFC-e, incluindo fornecedor, itens,
  impostos básicos, pagamentos, parcelas e protocolo.
- Painel da fila para upload de HTML da consulta resumida da NFC-e modelo 65,
  com parser do conjunto mínimo de identificação, emitente, emissão, total,
  itens e autorização; o HTML original é preservado na mesma origem documental.
- Persistência transacional do XML importado como pré-entrada **Em Aberto**.
- Consulta da pré-entrada persistida para a futura tela de revisão.
- Tela direta **Estoque → Entrada de NF-e / NFC-e**, separada da fila, com revisão dos
  itens, seleção parcial, vínculo por clique na linha, conversão, pagamentos e
  gravação explícita da pré-entrada em estado **Em Digitação** ou **Em Aberto**.
- A tela também lista as pré-entradas iniciadas em **Em Digitação** ou
  **Em Aberto**, permitindo
  reabrir uma delas e continuar a revisão.
- A tela **Entrada de NF-e / NFC-e** reúne a revisão das pré-entradas XML e
  HTML, identifica cada registro pela coluna **Tipo** e divide abaixo o
  trabalho entre a lista à esquerda e a revisão selecionada à direita; em
  telas estreitas, os painéis ficam empilhados.
- A conversão informa a unidade fiscal, a unidade de estoque e o fator
  explícito. Exemplo: `2 Dz × 12 = 24 Un`; o fator sugerido para dúzia/unidade
  é `12`, mas permanece editável na revisão.
- Linhas vinculadas são destacadas em negrito e verde. A forma de pagamento é
  selecionada em combobox e o valor é recalculado pela soma dos produtos
  marcados.
- Atualização transacional dos vínculos, seleções, conversões e pagamentos da
  pré-entrada.

### Ainda pendente

1. Implementar atualização do fornecedor na pré-entrada.
2. Modelar a transição do estado **Em Aberto** para confirmação ou
   cancelamento.
3. Implementar confirmação atômica da entrada de estoque.
4. Adicionar testes para ambiguidade, duplicidade, cancelamento e confirmação.
5. Analisar posteriormente o vídeo da entrada manual e compatibilizar os dois
   fluxos sem duplicar regras de domínio.

## Regra de continuidade

Os vídeos devem ser usados para descobrir telas, sequência de ações, nomes de
botões, mensagens, campos e exceções do sistema atual. Eles não substituem as
decisões de domínio acima: qualquer comportamento observado que contradiga uma
regra confirmada deve ser tratado como comportamento legado a ser avaliado,
não como autorização para alterar o modelo sem nova decisão explícita.

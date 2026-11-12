# Anotações pessoais

## Mapeamento das principais frentes do negócio

Para que o sistema atenda com excelência a operação diária de um bar e
restaurante, trabalharemos sobre os pilares fundamentais do setor.

### 2. Operação de frente de caixa e atendimento

- **Modalidades de venda:** venda direta no balcão, controle por comandas
  individuais e gestão de mesas.
- **Agilidade na operação:** navegação otimizada por teclado, atalhos de função
  como F1, F5 e F12, suporte a leitores de código de barras e seleção por
  grupos/categorias visuais.
- **Fechamento e sangria:** abertura/fechamento de caixa por operador,
  controle de suprimentos, sangrias e conciliação por forma de pagamento
  (dinheiro, PIX, cartão de crédito/débito).

### 3. Produção e impressão térmica

- **Roteamento de pedidos:** envio de itens lançados diretamente para as
  impressoras de produção, como Bar e Cozinha.
- **Formatos de cupom:** impressão de conferência de mesa, extrato de comanda
  e comprovante não fiscal/NFC-e.

### 4. Fiscal e estoque

- **Emissão NFC-e:** integração fiscal (Modelo 65), gestão de certificados
  digitais A1/A3, enquadramento no Simples Nacional e controle de contingência
  offline.
- **Ficha técnica e baixa de estoque:** venda de produtos compostos, como um
  drink que baixa doses de bebida e insumos ou uma porção que baixa
  matéria-prima por peso/unidade.

- **Numeração NFC-e:** a emissão integrada opcional usa `nfceNextNumberCompany` para reservar número na venda e grava o documento em `sale_fiscal_documents`; o teste isolado continua usando número temporário.

- **Contingência:** `nfceContingencyCompany` continua preparatória; não há emissão offline, envio posterior ou reconciliação.

- **Recomendação:** não habilitar A3 nem contingência como recursos funcionais antes de implementar os fluxos correspondentes

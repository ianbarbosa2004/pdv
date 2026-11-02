# Anotações pessoais

## Mapeamento das principais frentes do negócio

Para que o sistema atenda com excelência a operação diária de um bar e
restaurante, trabalharemos sobre os pilares fundamentais do setor.

### 1. Arquitetura e comunicação de rede local

- **Sincronização PDV-servidor:** padrão de rotas da API em `/api/...`,
  suporte a variáveis de ambiente dinâmicas/em tempo de build e tratamento de
  resiliência de rede.
- **Execução como serviço:** empacotamento do backend Node.js via WinSW com
  dependência direta do MariaDB e leitura automática de arquivos `.env`.

### 2. Operação de frente de caixa e atendimento

- **Modalidades de venda:** venda direta no balcão, controle por comandas
  individuais e gestão de mesas.
- **Agilidade na operação:** navegação otimizada por teclado, atalhos de função
  como F1, F5 e F12, suporte a leitores de código de barras e seleção por
  grupos/categorias visuais.
- **Fechamento e sangria:** abertura/fechamento de caixa por operador,
  controle de suprimentos, sangrias e conciliação por forma de pagamento
  (dinheiro, PIX, cartão de crédito/débito).

### 3. Produção e impressão ESC/POS

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
- **Catálogos fiscais:** manutenção de tabelas NCM, CEST, CFOP e operações
  fiscais padrão de saída/entrada.

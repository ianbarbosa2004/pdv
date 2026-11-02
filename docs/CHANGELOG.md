# Histórico de versões

Este documento registra as mudanças funcionais e técnicas agrupadas por versão.
O número da versão deve ser incrementado antes da compilação quando a alteração
for distribuível. Builds não alteram a versão automaticamente.

## Próxima versão

### Correções de interface

- Transformadas as mensagens de sucesso das telas administrativas em overlays
  modais temporários, centralizados e fora do fluxo de layout, com duração de
  aproximadamente 2,5 segundos.
- Corrigida a rolagem do Construtor de navegação após salvar alterações,
  incluindo a ação **Adicionar divisor abaixo**; a posição anterior da
  viewport é restaurada depois da atualização da árvore.

## 0.8.10 - 2026-11-01

### Correções

- Removida também da navegação persistida a cópia do **Construtor de menu**
  que aparecia duplicada em **Ferramentas**. O acesso oficial permanece em
  **Configurações > Construtor de navegação**.
- Alinhado o escopo dos instaladores MSI e NSIS para atualização por máquina.
- Fixado o identificador de upgrade do MSI para preservar a instalação entre
  versões.
- Criadas e carregadas as tabelas de unidades culinárias, estados físicos e
  conversões de medidas para uso futuro no controle de insumos.
- Adicionadas as Views **Sem Estado Físico** e as telas de **Ficha Técnica**
  para unidades culinárias, estados físicos e conversões.
- O Construtor de navegação permite inserir divisores visuais entre itens de
  qualquer menu, com ordenação configurável.
- Ajustadas as listagens da Ficha Técnica para ocultar códigos e status,
  traduzir categorias e aceitar fatores no padrão decimal brasileiro.
- Incluídas conversões identidade para grama, mililitro e unidade.
- Refinada a tabela de estados físicos: o estado sólido foi separado em
  inteiro, fatiado, picado/cubos e ralado/triturado, com inclusão de
  **Congelado**.
- Incluídas conversões aproximadas para os novos estados físicos, usando os
  fatores de referência `10 g` por colher de sopa e `115 g` por xícara de chá.
- Adicionadas as unidades culinárias `kg`, `l`, colher de café, colher de
  sobremesa e dúzia, com conversões para grama, mililitro ou unidade quando
  o relacionamento é determinístico.
- A View **Sem Estado Físico** passou a permitir definir o estado físico no
  modal de edição.
- Removido o link **Retaguarda** da barra contextual da Ficha Técnica.
- Removido o link **Retaguarda** das demais barras contextuais; o botão do
  cabeçalho da Frente de Caixa permanece disponível, pois não é contextual.
- Corrigido o botão de divisor do Construtor de navegação: ele agora aparece
  em cada item existente e insere o divisor imediatamente abaixo do item,
  sem reabrir a criação livre de itens ou submenus.
- Normalizada a numeração de ordem da navegação por nível e item pai, evitando
  que itens de menu e barras contextuais compartilhem uma sequência global.

## 0.8.9 - 2026-11-01

### Correções

- O Construtor de navegação passou a manter somente a edição da estrutura
  existente: não permite criar menus principais, itens ou submenus.
- A API também recusa novas criações de menus e itens, inclusive para clientes
  antigos que tentem chamar os endpoints diretamente.
- Removido o acesso duplicado ao Construtor de menu na tela de Impressoras.
- Preferências operacionais deixam de ser normalizadas automaticamente para
  maiúsculas e o rótulo de estoque negativo permanece em linguagem natural.

## 0.8.8 - 2026-11-01

### Segurança

- Adicionada autenticação obrigatória por token em todas as rotas da API.
- CORS passou a aceitar somente origens configuradas.
- Segredos CSC e tokens NFC-e deixaram de ser retornados pelos endpoints de
  leitura; valores existentes são preservados quando a tela envia campos vazios.
- Restauração de backup passou a validar banco, tabelas e colunas e criar uma
  cópia de segurança automática antes da substituição.

## 0.8.7 - 2026-11-01

### Novidades

- Adicionado **Frente de Caixa** como primeiro item fixo do menu principal.
- O item permanece ativo, na ordem `0`, abre `showSales` e é protegido contra
  renomeação, reordenação, substituição ou desativação pela API e pelo
  Construtor de navegação.

## 0.8.6 - 2026-11-01

### Correções

- Corrigados no banco os 20 produtos da classe **EMBALAGENS** e grupo
  **DESCARTÁVEIS**:
  - classe/grupo: **USO E CONSUMO / USO E CONSUMO**;
  - tipo de produto: **MATERIAL DE USO E CONSUMO**;
  - prefixo de SKU: `EMB-` para `USO-`.
- Adicionada a rotina transacional
  `scripts/migrations/migrate-embalagens-to-uso-consumo.mjs` para registrar a correção.

## 0.8.5 - 2026-11-01

### Correções

- Corrigida e testada a conversão dos valores booleanos da importação CSV.
  `não`/`nao`, `n`, `false`, `0` e `no` resultam explicitamente em falso,
  incluindo o campo **Controla estoque**.
- Valores booleanos desconhecidos agora são rejeitados com erro de validação,
  em vez de serem tratados silenciosamente como falso.

## 0.8.4 - 2026-11-01

### Correções

- Corrigido o botão **Testar arquivo** para reabrir o seletor quando a leitura
  do arquivo selecionado não produziu linhas válidas.
- A seleção anterior é limpa antes da nova escolha, permitindo selecionar
  novamente o mesmo arquivo.

## 0.8.3 - 2026-11-01

### Correções

- Corrigida a validação de arquivos CSV após a seleção. O botão **Testar
  arquivo** reutiliza as linhas já lidas, evitando uma segunda leitura da
  referência `File` que podia falhar no WebView/Tauri.

## 0.8.2 - 2026-11-01

### Correções

- Corrigidos os rótulos da primeira coluna da lista de valores aceitos do CSV,
  que agora seguem os mesmos nomes em português do cabeçalho do modelo.

## 0.8.1 - 2026-11-01

### Ajustes

- A importação CSV passou a aceitar, nas colunas relacionadas, tanto
  descrições quanto códigos cadastrados nas referências:
  - operação fiscal de venda: descrição ou CFOP;
  - tipo de produto: descrição ou Código SPED;
  - unidade: código ou descrição.
- Arquivos que continuam usando as descrições anteriores permanecem
  compatíveis.

## 0.8.0 - 2026-11-01

### Novidades

- Adicionada à tela **Importar cadastros** uma lista com os valores aceitos
  para cada coluna do CSV, incluindo aliases de campos booleanos, formatos
  numéricos, padrões de códigos e valores padrão.

## 0.7.3 - 2026-11-01

### Ajustes

- Ajustado o layout da View **Sem Custo** para uma única coluna.
- A listagem de **Sem Custo** passou a ocupar 100% da largura disponível.

## 0.7.2 - 2026-11-01

### Correções

- Corrigida a navegação de **Views** no menu **Ferramentas**.
- **Views** passou a ser um item direto, seguindo o padrão de **Produtos**.
- Removido o submenu visual de Views; **Grupos x Produtos** e **Sem Custo**
  são acessados pela barra contextual da tela.

## 0.7.1 - 2026-11-01

### Correções

- Corrigido o clique no item **Views** quando a navegação era renderizada como
  submenu.
- Adicionado teste de regressão para a renderização clicável da entrada.

## 0.7.0 - 2026-11-01

### Novidades

- Criada a área **Ferramentas > Views**.
- Criada a View **Grupos x Produtos**, com árvore `Classe - Grupo`,
  contagem de produtos, pesquisa, ordenação e filtros.
- Criada a View **Sem Custo**, filtrada por produtos com custo igual a zero.
- Extraída a listagem reutilizável para `src/tools/product-list-view.js`.
- Adicionadas ações de status, visibilidade, exclusão e edição na listagem.
- A edição passou a ocorrer em modal local, sem sair da View.

### Documentação e validação

- Atualizada a documentação operacional e o histórico funcional da área Views.
- Adicionados testes para navegação, árvore de grupos e filtro de custo zero.

## 0.6.1 - 2026-11-01

### Ajustes

- Refinada a tela inicial de Views com o nome **Grupos x Produtos**.
- A árvore passou a exibir `Classe - Grupo` ordenado por classe e grupo.
- O painel introdutório foi dividido visualmente.
- A listagem recebeu pesquisa, ordenação, status, visibilidade, exclusão e
  ação de edição.

# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Operadores e administradores de lojas que cadastram produtos, insumos,
unidades culinárias, estados físicos e regras de navegação do PDV.

## Product Purpose

O PDV centraliza cadastros, estoque, vendas e operações fiscais em uma
interface operacional conectada a uma API local e ao MariaDB do servidor da
loja.

## Positioning

As regras de negócio são aplicadas no servidor e refletidas novamente na
interface, preservando consistência entre cadastro, estoque, venda e relatórios.

## Operating Context

O sistema é usado em computadores da loja, com terminais Tauri acessando a API
pela rede local. A operação privilegia formulários claros, listagens filtráveis
e navegação configurável sem expor credenciais do banco aos terminais.

## Capabilities and Constraints

- Produtos, matérias-primas, grupos, unidades e operações fiscais.
- Unidades culinárias, estados físicos e conversões para apoio a fichas técnicas.
- Views reutilizáveis para listas operacionais.
- Construtor de Navegação para itens e divisores visuais configuráveis.
- Regras compartilhadas ficam em `src/shared`; API e banco em `src/server`.
- Alterações compostas devem manter validação no servidor e persistência atômica.

## Brand Commitments

Preservar o padrão visual e de interação já existente no PDV, com linguagem
operacional em português claro.

## Product Principles

- Consistência entre interface, API e banco.
- Filtros e validações explícitos.
- Navegação configurável sem remover itens essenciais.
- Alterações pequenas, idempotentes e compatíveis com dados existentes.

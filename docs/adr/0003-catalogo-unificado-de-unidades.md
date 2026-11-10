# Catálogo unificado de unidades

Adotamos `units` como catálogo canônico de unidades de medida, com as flags
`isTaxableUnit` e `isCulinaryUnit`, porque uma mesma medida pode ser usada no
produto fiscal e na ficha culinária. `unit_conversions` é o catálogo canônico
de conversões e `physical_states` mantém os estados físicos necessários para
qualificar uma conversão. A tela oficial é **Cadastros → Produtos → Unidades**.

Instalações antigas passam por uma etapa aditiva, com mapas temporários de IDs,
seguida por uma migração transacional de corte. Essa migração atualiza as
referências de Receitas para os IDs canônicos, valida órfãos e só então remove
os mapas e as tabelas `culinary_units` e `culinary_unit_conversions`. O schema
inicial não cria mais essas estruturas legadas.

## Consequências

O catálogo deixa de duplicar código e descrição entre os contextos. A tela
separada de Unidades Culinárias deixa de ser uma entrada oficial; Estados
Físicos e Conversões continuam como telas auxiliares da Ficha Técnica. Durante
a transição, a API mantém aliases de endpoint, mas nenhum alias consulta
tabelas legadas. A remoção física das tabelas só ocorre pelo script de corte,
após backup restaurável, validação de vínculos e autorização operacional.

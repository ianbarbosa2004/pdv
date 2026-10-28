# Contribuindo com o PDV

## Antes de alterar

Leia o `README.md`, `docs/DEVELOPMENT.md`,
[`docs/PROJECT-HISTORY.md`](docs/PROJECT-HISTORY.md) e as instruções em
`.github/instructions/`. Preserve o fluxo:

```text
interface -> API -> validação -> transação MariaDB -> nova leitura -> interface
```

Terminais Tauri nunca acessam o MariaDB diretamente. Credenciais, certificados,
CSC, tokens e dados sensíveis permanecem no servidor.

## Organização

- `src/`: frontend Vite e integração da interface.
- `src/shared/`: regras reutilizáveis de domínio.
- `src/server/`: API Node.js e acesso ao MariaDB.
- `src-tauri/`: integração nativa, incluindo impressão local.
- `tests/`: testes com `node:test`.
- `docs/`: documentação operacional e decisões técnicas.

Ao alterar uma área consolidada, consulte o histórico para preservar decisões
já tomadas, especialmente a ausência de cargas padrão, a navegação persistida,
a separação entre Dados da Empresa e NFC-e e a impressão posterior à
confirmação da venda.

Use SQL parametrizado, transações para operações compostas e erros explícitos.
Não transforme falha de banco ou de impressão em sucesso na interface.

## Desenvolvimento

```powershell
npm.cmd install
npm.cmd run dev
npm.cmd run api
```

Sempre que `src/server/` mudar, reinicie a API antes de validar o frontend.
Confirme o processo em execução com:

```powershell
Invoke-RestMethod http://127.0.0.1:3000/api/health
```

## Impressão

A impressora padrão de Cupom é configurada em
**Retaguarda > Configurações > Impressoras**. O editor em
**Ferramentas > Impressão térmica** persiste o modelo no servidor.

- USB usa o driver Windows/GDI e aplica fonte, tamanho, alinhamento e negrito
  por linha.
- Rede usa TCP RAW/ESC-POS, normalmente na porta 9100.
- Impressão ocorre somente depois da confirmação da venda.
- Falha de impressão não deve repetir ou desfazer uma venda confirmada.

## Testes e build

Execute o conjunto mínimo antes de propor uma alteração:

```powershell
npm.cmd test
npm.cmd run build
node --check src/server/server.js
git diff --check
```

Para validar a camada nativa:

```powershell
npm.cmd run tauri -- build --no-bundle
```

Os arquivos `app.js` e `server.js` não existem na raiz; não crie aliases
apenas para satisfazer comandos antigos. Use os caminhos reais do projeto.

## Dados protegidos

Nunca versione ou envie:

- `.env`, credenciais, tokens ou chaves privadas;
- certificados A1, XML assinado, dados reais ou dumps;
- `backups/`, `node_modules/`, `dist/` ou `src-tauri/target/`;
- `.htaccess` ou qualquer arquivo operacional local.

Não execute `git reset --hard`, `git clean`, `DROP`, `TRUNCATE`, deploy ou
migração destrutiva sem autorização explícita e estratégia de recuperação.

## Commits

Use mensagens curtas e descritivas. Antes de commitar, verifique:

```powershell
git status --short
git diff --cached --name-status
git diff --check
```

Confirme que somente os arquivos pretendidos estão staged. Mudanças locais
seguras de documentação devem ser incorporadas; não descarte alterações de
outros trabalhos silenciosamente.

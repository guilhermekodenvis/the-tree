# Como testar o The Tree

Não há testes automatizados. Toda funcionalidade é verificada no app rodando, nos
temas claro e escuro, antes do commit.

## Antes de abrir

1. Peça ao dono para **sair** do The Tree dele e espere a confirmação (trava de
   instância única). O X só esconde; o certo é "Sair do The Tree" no ícone da bandeja.
   Se ainda houver processo `The Tree.exe`/`electron.exe` dele, pergunte antes de
   encerrar.
2. Rode sem as variáveis de ambiente de chave (ANTHROPIC_*, CLAUDE*, OPENAI*, CODEX*,
   GEMINI*, GOOGLE*), para os agentes usarem o login normal da máquina.
3. Abra com depuração: `npm run dev -- --remoteDebuggingPort 9222` em segundo plano.

## Dirigindo o app

- Conecte no Chrome DevTools Protocol em `http://127.0.0.1:9222/json` e use
  `Runtime.evaluate` (com `awaitPromise`) para chamar `window.api.*` e mexer na tela,
  e `Page.captureScreenshot` com `Emulation.setEmulatedMedia` (prefers-color-scheme)
  para ver claro e escuro.
- Crie dados pela API (`projects.add`, `automations.create/save`, `connectors.save`...)
  e depois **recarregue a página**: os hooks só leem a lista ao montar.
- Depois de recarregar, espere uns 2 s antes de clicar; cliques cedo demais pegam a
  tela ainda vazia.
- Passe caminhos com `/` nos `eval`, ou monte `\` com `String.fromCharCode(92)`:
  barras invertidas se perdem no repasse de argumentos do Windows.
- Para verificar modelo e esforço usados de verdade, leia os registros dos agentes:
  `~/.claude/projects/<cwd-escapado>/*.jsonl` (`message.model`) e
  `~/.codex/sessions/AAAA/MM/DD/rollout-*.jsonl` (`turn_context`).
- Para testar e-mail sem conta real, suba um servidor SMTP de mentira em
  `127.0.0.1:2525` (aceita tudo e anota os destinatários) e crie um conector apontando
  para ele com uma senha de teste.

## Armadilhas conhecidas

- `npm run dev` está em modo watch: **editar arquivos de `src/main` reinicia o app**
  (e derruba o teste em andamento, inclusive agendamentos). Às vezes a porta 9222
  fica presa e a nova instância sobe sem depuração: encerre e abra de novo.
- `window.close()` pela página destrói a janela sem passar pelo X. Para testar o X,
  use `Process.CloseMainWindow()` no PowerShell (manda WM_CLOSE) e confira que o
  processo continua vivo e `MainWindowHandle` virou 0. Abrir uma segunda instância
  (`electron.exe .` na raiz) traz a janela de volta.
- A janela de teste costuma ficar coberta (`document.visibilityState === 'hidden'`):
  o Chromium não desenha quadros, então `ResizeObserver` e `requestAnimationFrame` não
  disparam. Não conclua que um efeito visual falhou só por isso.
- O AppData dos seus processos é virtualizado; o registro HKCU não. Rodar o app
  empacotado (`dist/win-unpacked`) liga o "iniciar com o Windows" apontando para a
  pasta de build: **remova a entrada `com.thetree.app`** de
  `HKCU\Software\Microsoft\Windows\CurrentVersion\Run` depois do teste.
- Para testar horário perdido: agende para daqui a 2 min, encerre o app, espere passar
  2 min do horário e abra de novo; a execução deve aparecer como "missed".
- O typecheck às vezes leva minutos; rode em segundo plano se precisar.

## Depois de testar

- Remova projetos, automações, conectores e conversas de teste pela API, apague
  `the-tree:open-projects` do `localStorage`, encerre os processos do app (e o servidor
  SMTP de teste) e apague arquivos de teste.
- Rode `npm run typecheck` **e confira que passou antes** de commitar.
- Um commit por funcionalidade testada. Se a mudança precisa chegar ao app
  instalado, rode `npm run dist` (vários minutos) e oriente instalar por cima.

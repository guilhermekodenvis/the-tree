---
name: the-tree-developer
description: Contexto para desenvolver o The Tree, o app desktop (Electron + React + TypeScript, Windows) que orquestra Claude Code, Codex e Gemini CLI em vários projetos, com skills, automações e conectores. Use sempre que for criar, alterar, depurar, testar ou empacotar qualquer coisa neste repositório, mesmo uma mudança pequena de tela.
---

# Desenvolvendo no The Tree

Você já sabe programar. Aqui está o que é específico deste app: o que ele é, onde
cada coisa mora, as regras de negócio e as decisões que o dono já tomou. Antes de
mudar algo, confira no código: esta skill descreve o estado de 26/11/2026.

Detalhes que não cabem aqui:
- `references/decisoes.md`: decisões e regras de cada funcionalidade, com o porquê.
- `references/testes.md`: como abrir, dirigir e testar o app (há várias armadilhas).

## O que é o The Tree

App pessoal de Windows do Guilherme (usuário único, fala português do Brasil). Ele
cadastra pastas como **projetos** e, em cada projeto, conversa com três agentes em
paralelo: **Claude** (Claude Code via Agent SDK), **ChatGPT** (Codex via
`codex app-server`) e **Gemini** (Gemini CLI via ACP). Por cima disso há **skills**
(instruções reutilizáveis), **automações** (fluxos de passos que rodam sozinhos num
horário), **chats rápidos** (conversas fora de projeto, no menu lateral), **anexos**
no chat, **conectores** (contas dos agentes e e-mail SMTP) e o app fica na **bandeja do Windows** para as
automações dispararem com a janela fechada. É distribuído como instalador NSIS.

Toda a interface, os textos, as mensagens de erro e os comentários do código são em
**português do Brasil**, escritos para um usuário leigo (sem jargão).

## Mapa do código

```
src/shared/      contrato entre processos (os dois lados importam daqui)
  types.ts         TreeApi (tudo que a interface pode chamar), tipos de projeto, conversa, skill
  agents.ts        lista de agentes, modelos e esforços oferecidos, resolveSettings()
  automation.ts    tipos de automação/passo/execução/conector + regras usadas pelos dois lados
                   (nextOccurrence, scopeAt, stepProblems, describeTrigger, limites)
  chat.ts          applyEvent(): como AgentEvent vira ChatItem (usado no main e na tela)
  theme.ts         cores da moldura da janela (espelham tokens.css; o main não lê CSS)
src/main/        processo principal (Node)
  index.ts         janela, bandeja, single-instance, início escondido, avisos do Windows
  ipc.ts           todos os ipcMain.handle; liga canais aos serviços
  tray.ts          ícone da bandeja e "iniciar com o Windows"
  secrets.ts       segredos criptografados (safeStorage/DPAPI)
  agents/          adapter.ts (interface comum), claude.ts, codex.ts, gemini.ts,
                   manager.ts (sessões, bypass, histórico), history.ts (chats/<projeto>.json)
  automations/     engine.ts (fila, execução, aprovação, agendador), js.ts (vm), store.ts,
                   agent-run.ts (conversa temporária de um passo)
  connectors/      store.ts (SMTP com nodemailer)
  accounts/        service.ts (login/status/logout de Claude e Codex pelos CLIs; Gemini = chave)
  attachments/     store.ts (cópia dos anexos, protocolo tree-attachment:// das miniaturas)
  skills/          store.ts (skills.json), prompt.ts (injeta a skill na mensagem)
  projects/        store.ts (projects.json, grupos)
  files/           service.ts (árvore/leitura dentro do projeto), watcher.ts,
                   markdown.ts (leitor .md/.mdx, pode ler fora do projeto)
src/preload/     index.ts: implementa TreeApi em window.api com ipcRenderer.invoke
src/renderer/src/
  App.tsx          seções do menu lateral, abas de projetos abertos, tela vazia
  components/      telas e componentes; automations/ tem o quadro do fluxo
  components/ui/   Button, IconButton, Icon (ícones SVG desenhados à mão), Tabs
  hooks/           estado por domínio (useConversations, useProjects, useSkills,
                   useOpenProjects, useAutomations)
  design/          tokens.css, base.css, layout.css, components.css (design system)
resources/       icon.png (app/instalador), tray.png e tray@2x.png (bandeja)
```

## Como uma funcionalidade nova atravessa o app

Quase toda mudança segue o mesmo caminho:

1. Tipo e método em `src/shared/types.ts` (`TreeApi`), com comentário do que faz.
2. Serviço no main (`src/main/<domínio>/`).
3. Canal em `src/main/ipc.ts` (`'<domínio>:<ação>'`), validando o que vem da tela.
4. Ponte em `src/preload/index.ts`.
5. Hook e componentes no renderer.
6. Estilos em `design/components.css`, só com tokens.

Avisos do main para a tela usam `broadcast(canal, payload)` no ipc e `listen()` no
preload (ex.: `agents:event`, `files:changed`, `automations:changed`,
`automations:open`). A tela nunca acessa Node nem disco diretamente.

## Onde os dados ficam

Tudo em `app.getPath('userData')`, ou seja `%APPDATA%\the-tree` (o nome vem de
`name` no package.json; `productName` fica só dentro de `build`, de propósito, para o
app instalado e o `npm run dev` compartilharem os mesmos dados):

| Arquivo | Conteúdo |
|---|---|
| `projects.json` | `{ projects, groups }` (formato antigo era só a lista; há migração) |
| `chats/<projectId>.json` | conversas do projeto, ordem, histórico, resumeId, bypass, modelo/esforço |
| `skills.json` | skills (só o caminho) e importações de globais por projeto |
| `automations.json` | todas as automações |
| `automation-runs/<automationId>/<runId>.json` | uma execução por arquivo (até 100 por automação) |
| `connectors.json` | conectores SMTP, sem senha |
| `secrets.json` | chave do Gemini e senhas dos conectores, criptografadas |
| `app-state.json` | `startupConfigured`, `trayHintShown` |
| `attachments/<uuid>/<arquivo>` | cópias dos anexos do chat |
| `quick-chats/` | pasta de trabalho dos agentes nos chats rápidos |

Chats rápidos são conversas do "projeto" interno `QUICK_PROJECT_ID` (`'__quick'`), em
`chats/__quick.json`; ele não existe em `projects.json`.

Na tela, `localStorage` guarda só preferências visuais: `the-tree:nav-collapsed`,
`the-tree:groups-collapsed`, `the-tree:open-projects` (abas abertas).

As gravações em JSON usam arquivo temporário + rename. Ao ler, `ENOENT` vira lista
vazia, mas qualquer outro erro sobe (para nunca sobrescrever um arquivo que não
conseguimos ler).

## Agentes

- Todos implementam `AgentAdapter` (`start`, `configure`, `send`, `respond`,
  `interrupt`, `stop`) e falam com a tela só por `AgentEvent`.
- **Claude**: `query()` do Agent SDK, sessão longa com fila de mensagens,
  `permissionMode: 'default'` e `canUseTool` virando pedido de autorização. Usa o
  login de `~/.claude`. Troca de modelo/esforço no meio da sessão com
  `query.setModel` e `query.applyFlagSettings({ effortLevel })`.
- **Codex**: `codex app-server` (JSON-RPC), `approvalPolicy: 'on-request'`,
  sandbox somente leitura. Modelo e esforço vão em cada `turn/start`. Usa `~/.codex`.
- **Gemini**: Gemini CLI em modo ACP, modelo fixo, chave de API do Google AI Studio
  guardada em `secrets.ts` (a conta Google pessoal não funciona mais no CLI).
  **O Gemini nunca foi testado de ponta a ponta**: o dono adiou; trate como pendente.
- Modelos oferecidos (em `shared/agents.ts`): Claude Opus 5.5 / Fable 5.2 /
  Sonnet 5.5 com esforço Baixo/Médio/Alto/Extra; ChatGPT 6.2 Sol / 6.2 Astra com
  Baixo/Médio/Elevado/Muito elevado. Padrões: Opus 5.5 + Alto; 6.2 Sol + Médio.
  Valor salvo fora da lista volta para o padrão (`resolveSettings`).
- Uma conversa só inicia o processo do agente na primeira mensagem; depois de
  reabrir o app ela retoma pelo `resumeId`.
- **Bypass** por conversa: o manager aprova sozinho cada pedido de autorização
  (estado `'auto'`, mostrado em vermelho) e, ao ligar, aprova os pendentes.

## Regras que valem para o app todo

- **Design system**: nenhum arquivo além de `tokens.css` tem cor, fonte, raio ou
  espaçamento escritos à mão; tudo usa `var(--...)`. Visual Windows 11 (Fluent 2),
  claro/escuro por `light-dark()`. Mudou a cor de fundo base? Atualize também
  `shared/theme.ts`.
- Ícones novos são desenhados em `components/ui/Icon.tsx` (viewBox 16, traço 1.2),
  sem biblioteca.
- Textos da tela: português do Brasil, frases curtas, sem termos técnicos. Mensagens
  de erro dizem o que fazer.
- Comentários no código explicam o porquê, em português, como os existentes.
- Formatação do projeto: aspas simples, sem ponto e vírgula, 100 colunas, sem vírgula
  final. Não há `.prettierrc`: se usar prettier, passe
  `--single-quote --no-semi --print-width 100 --trailing-comma none`, senão ele
  reformata o arquivo inteiro.
- Validação: `npm run typecheck` (tsc). Não há testes automatizados; a verificação é
  no app rodando (veja `references/testes.md`).

## Segredos e limites que não mudam

- Chaves e senhas são digitadas pelo próprio usuário na tela, vão direto para
  `secrets.ts` e **nunca** voltam para a interface (a tela só sabe se existem).
  Você não digita chaves nem senhas reais por ele; não repita valores de segredo.
- O leitor de arquivos do projeto só acessa caminhos dentro do projeto; a única
  exceção é o leitor de `.md/.mdx`, que lê qualquer arquivo Markdown (até 2 MB).
- Skills e conectores removidos do app nunca apagam nada do disco.
- Anexos: o main só aceita caminhos dentro de `attachments/` (`isAttachment`); a CSP da
  página libera imagens só de `tree-attachment:`. Limite de 25 MB por arquivo.
- Login/logout de Claude e ChatGPT mexe na conta real do computador: não teste isso
  sem o dono pedir; teste só a leitura do status.

## Fluxo de trabalho com o dono

- Implemente, **teste no app de verdade** e só então faça commit, um por
  funcionalidade testada, com o trailer de coautoria pedido pelo ambiente.
- O app tem trava de instância única. Antes de abrir o app para testar, peça para o
  dono **sair** do The Tree dele (botão direito no ícone da bandeja → "Sair do The
  Tree"; o X só esconde) e espere ele confirmar. Não encerre o app dele sem pedir.
- Seus processos rodam com o AppData virtualizado: os dados que você vê não são os
  dele. Teste com projetos de teste criados por você e limpe tudo no fim.
- Para o dono usar uma mudança no app instalado, gere o instalador de novo
  (`npm run dist`) e diga para instalar por cima; os dados continuam.
- Quando ele pedir só para planejar ou conversar, não altere código; respeite limites
  de tamanho de resposta que ele pedir.

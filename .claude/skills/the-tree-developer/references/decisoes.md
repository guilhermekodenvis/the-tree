# Decisões e regras de negócio do The Tree

Cada seção diz como a funcionalidade funciona hoje e o que o dono decidiu. Se for
mudar uma regra destas, confirme com ele antes.

## Janela, navegação e projetos

- Menu lateral recolhível (lembrado em `localStorage`), com as seções **Projetos**,
  **Skills** e **Conectores**.
- **Projetos abrem em abas, como num navegador.** O "+" abre a tela de escolher
  projeto; o "×" ou o clique do meio fecha. Sem projeto aberto aparece "Nenhum
  projeto aberto" com o botão centralizado "Selecionar projeto". O antigo botão
  "← Projetos" foi removido a pedido.
- Abas abertas, a aba da frente e a seção de cada projeto são lembradas entre
  aberturas. Projeto removido fecha a própria aba.
- Cada `ProjectScreen` aberto **continua montado** escondido (`hidden`) ao trocar de
  aba, para a árvore de arquivos e a conversa ficarem como estavam. Por isso a
  conversa precisa rolar até o fim quando a aba volta (`visible` no ChatView).
- Abas estreitas escondem o ícone e o × (container query) para caber o nome.
- **Grupos de projetos** organizam a tela de projetos; projetos e grupos têm nome
  próprio, editável, que não depende do nome da pasta. Remover um grupo manda os
  projetos para "Sem grupo". Remover um projeto só o tira da lista (a pasta fica) e
  apaga as conversas, as skills locais e as automações dele.
- Seções do projeto: **Arquivos**, **Agentes**, **Skills**, **Automações**.

## Conversas (aba Agentes)

- Um projeto tem várias conversas, cada uma com um agente; renomear, reordenar
  (arrastar) e excluir.
- Seletores de **Modelo** e **Esforço** no cabeçalho, salvos por conversa; valem a
  partir da próxima mensagem, sem reiniciar o agente. O Gemini não tem seletores.
- **Bypass** no cabeçalho: aprova sozinho os pedidos de autorização daquela conversa.
- Links e caminhos `.md/.mdx` nas respostas (link, texto solto ou `código`) abrem um
  **leitor formatado** à direita da conversa: cabeçalho `---` vira lista de campos;
  em MDX somem imports, exports e tags de componentes; links entre arquivos navegam
  no leitor com "voltar"; âncoras rolam até o título. O `urlTransform` do
  react-markdown precisa manter caminhos `C:\...`, senão o link fica vazio.

## Skills

- Uma skill é uma pasta com `SKILL.md` ou um `.md` solto. O app guarda **só o
  caminho** e lê o conteúdo na hora de usar (editar o arquivo vale na próxima
  mensagem).
- **Globais** (menu Skills) valem em qualquer projeto; **locais** pertencem a um
  projeto. Uma global pode ser "trazida" para a aba Skills de um projeto (importação).
- Adicionar uma pasta sem `SKILL.md` mas com subpastas que têm (ex.: `~/.claude/skills`)
  adiciona uma skill por subpasta. Escolher um `SKILL.md` vale pela pasta dele.
- Na conversa, digitar **"/"** abre o menu com as skills do projeto e todas as globais;
  locais de outros projetos nunca aparecem e o main recusa se pedirem.
- A skill vai **junto da mensagem** (texto injetado por `skills/prompt.ts`), não pelo
  mecanismo nativo de cada agente: assim funciona igual nos três. O histórico guarda só
  a mensagem do usuário e os nomes das skills.
- A pasta `.claude/skills` de um projeto **não** é detectada sozinha (pendência
  conhecida; o usuário adiciona pelo botão "Pasta").

## Automações (aba Automações do projeto)

Decididas com o dono numa conversa longa; estas são as escolhas dele:

- **Motor próprio dentro do app** (Node), em vez de n8n, Python ou serviços na nuvem:
  os agentes da automação usam a assinatura do Claude Code/Codex e a pasta do projeto.
- **Visual**: quadro estilo canvas (arrastar o fundo, roda para rolar, Ctrl+roda e
  botões para zoom). **Os elementos não se arrastam**: layout automático de cima para
  baixo, feito com flexbox; "se" abre dois caminhos lado a lado ("Sim"/"Não"), loop é
  uma caixa tracejada em volta do corpo. O "+" entre passos insere; clicar abre o painel
  lateral. Mudanças são salvas sozinhas (500 ms).
- **Gatilho**: manual, uma vez (data+hora), todo dia, toda semana (dias), todo mês
  (dia; 29–31 viram o último dia em meses curtos). Horário do relógio do Windows.
- **Passos**: agente (conversa temporária), variável, se/senão (aninhável), loop
  ("para cada item" ou "repetir N vezes", máximo 10.000), enviar e-mail, aprovação
  humana, resultado final (texto, lista, link ou arquivo).
- **Sem loop "enquanto"** (decisão do dono: risco de rodar para sempre).
- **Condições e valores em JavaScript puro**, com autocompletar (CodeMirror): sugere
  as variáveis visíveis no passo (`scopeAt`) e, depois do ponto, os métodos do tipo da
  variável (lista → `find`, `findIndex`...). Cada variável tem tipo declarado
  (texto, número, sim/não, lista, objeto). Em textos usa-se `{{expressão}}`. O código
  roda em `node:vm` com limite de 2 s.
- Variáveis de sempre: `agora` e `execucao` (`id`, `gatilho`, `automacao`).
- Passo agente com saída tipada: o prompt pede um bloco ```json no fim e o motor lê o
  último bloco; se não vier válido, o passo falha.
- **Agentes de automação rodam sempre com bypass.**
- **Erro: para tudo e avisa.** Execuções que falharam ou aguardam aprovação e ainda
  não foram vistas geram uma **bolinha** na aba Automações, em "Execuções" e na
  lista; abrir a execução a marca como vista.
- **Disparo com outra execução em andamento: entra na fila** (uma por automação; uma
  aprovação pendente também segura a fila).
- **Aprovação humana expira em 2 dias** (vira "Aprovação expirou"). A posição é
  gravada (`resume.position`), então a aprovação sobrevive ao app fechar, inclusive
  dentro de loops e "se".
- **Limite de 20 e-mails por execução** (destinatários somados).
- **Horário perdido** (app fechado/PC desligado ou dormindo): por automação, "rodar
  assim que o app abrir" (padrão) ou "pular". Atraso acima de 2 min conta como perdido.
  O agendador confere a cada 30 s e ao voltar da suspensão; mudar o gatilho ou religar
  "rearma" a partir de agora (`armedAt`), sem disparar por horário já passado.
- Execução guarda uma cópia do fluxo: editar a automação não muda o histórico.
  Execução que estava rodando quando o app fechou vira "falhou".
- Avisos do Windows: falha, aprovação pendente, expiração e conclusão de execuções
  agendadas; clicar abre a execução.

## Conectores

- Menu **Conectores** reúne integrações com serviços de fora. Hoje: e-mail SMTP, com
  o **Gmail** pronto (smtp.gmail.com:587 STARTTLS + **senha de app**, que exige
  verificação em duas etapas). Pode haver vários; o passo de e-mail escolhe qual.
- Senha digitada pelo usuário, guardada em `secrets.ts`, nunca devolvida. "Testar"
  envia um e-mail para o próprio endereço do conector.
- Servidor SMTP em `localhost` pode ser sem TLS (útil para teste); externos exigem TLS.
- A API oficial do Gmail (OAuth) foi descartada por exigir projeto no Google Cloud.

## Bandeja, início e instalador

- Fechar no X **esconde** a janela; o app continua na bandeja para as automações.
  "Sair do The Tree" no menu do ícone encerra de verdade. Na primeira vez que fecha,
  um aviso explica isso.
- O app instalado liga "iniciar com o Windows" na primeira abertura (com `--hidden`,
  começa só na bandeja); dá para desligar no menu do ícone. O modo dev não mexe nisso
  (`app.isPackaged`), e a marca é `startupConfigured` em `app-state.json`.
- Instalador NSIS (`npm run dist` → `dist/The Tree Setup <versão>.exe`): atalhos na
  área de trabalho e no menu Iniciar, pasta escolhível, sem assinatura (o Windows
  mostra o aviso do SmartScreen). Fixar na barra de tarefas não é possível pelo
  instalador; o usuário faz manualmente.
- **`asar: false`** e **`npmRebuild: false`**: os agentes executam binários de dentro
  de `node_modules` (Codex resolve o .exe pelo pacote), o que não funciona dentro de
  asar; e recompilar o `keytar` opcional do Gemini CLI exigiria Python. O instalador
  fica com ~430 MB por carregar os três agentes.
- `appId`/`AppUserModelId`: `com.thetree.app` (necessário para os avisos do Windows).

<p align="center">
  <img src="docs/marca/grifinho.png" alt="Grifinho, o mascote do Grifo Quest" width="180">
</p>

<h1 align="center">Grifo Quest: seus estudos para concurso com cara de jogo</h1>

<p align="center">
  <b>App para Windows que organiza a preparação para concursos públicos: questões no estilo da
  sua banca geradas por IA, caderno de erros, flashcards, edital verticalizado, pomodoro, sala de
  aula em que você ensina e alunos virtuais perguntam, notícias e rastreador de concursos. Tudo no
  seu PC, com IA local (Ollama) e o Claude quando precisa de capricho.</b>
</p>

<p align="center">
  <a href="https://github.com/asguth/grifo-quest/releases/latest"><img alt="Versão" src="https://img.shields.io/github/v/release/asguth/grifo-quest?label=vers%C3%A3o&color=243B53"></a>
  <img alt="Windows 10/11" src="https://img.shields.io/badge/Windows-10%20%7C%2011-2F6B8A">
  <img alt="Tauri 2" src="https://img.shields.io/badge/Tauri-2-596579">
  <img alt="IA local" src="https://img.shields.io/badge/IA-local%20(Ollama)-237A57">
  <a href="LICENSE"><img alt="Licença" src="https://img.shields.io/badge/licen%C3%A7a-todos%20os%20direitos%20reservados-8A3B3B"></a>
  <a href="https://buymeacoffee.com/asguth"><img alt="Buy Me a Coffee" src="https://img.shields.io/badge/Buy%20Me%20a%20Coffee-apoie-FFDD00?logo=buymeacoffee&logoColor=000"></a>
</p>

<p align="center">
  <a href="#instalação">Instalação</a> ·
  <a href="#o-que-ele-faz">O que ele faz</a> ·
  <a href="#ia-local-e-claude">IA</a> ·
  <a href="#o-claude-lê-seu-progresso-mcp">MCP</a> ·
  <a href="#privacidade">Privacidade</a> ·
  <a href="#perguntas-frequentes">FAQ</a> ·
  <a href="#apoie-o-projeto">Apoie</a>
</p>

---

## O que é

Estudar para concurso é repetição: questões, revisão, erro, revisão de novo. O **Grifo Quest**
cuida da parte chata (o que estudar hoje, o que revisar, quanto falta do edital) e transforma o
resto num jogo aconchegante em pixel art, com XP, níveis, missões diárias e o **Grifinho** te
acompanhando.

- **Questões inéditas no estilo da sua banca** (Certo/Errado ou A–E), escritas pelo Grifo e
  guardadas num banco que cresce com você.
- **Sessão do dia montada pelos seus pontos fracos**: taxa de erro recente × peso da matéria ×
  esquecimento × erros vencidos.
- **Tudo no seu computador**: banco SQLite local, IA local grátis. Sem conta, sem nuvem, sem
  telemetria.
- **Atualiza sozinho**: o app procura versões novas ao abrir e a cada 6 horas e avisa quando
  estiver pronto para reiniciar.

## Instalação

1. Baixe **`Grifo Quest_x.y.z_x64-setup.exe`** em
   [Releases](https://github.com/asguth/grifo-quest/releases/latest) e rode. Não precisa de
   administrador: ele instala só para o seu usuário.
2. Na primeira abertura, um assistente pergunta seu nome, área, provas, rotina e matérias (dá
   para importar o edital em PDF).
3. Em **Config → Integrações**, cada peça opcional se instala em um clique: Ollama + modelo,
   Claude Code, voz (whisper.cpp) e a conexão MCP.

> O Windows SmartScreen pode avisar "editor desconhecido" porque o instalador não tem
> certificado pago. Clique em **Mais informações → Executar assim mesmo**.

O app vive na bandeja (perto do relógio). **Ctrl+Alt+Q** abre o lançamento rápido de questões
de qualquer lugar: `30 22 lgpd fgv` = 30 questões, 22 certas, matéria LGPD, banca FGV.

## O que ele faz

| Área | Recursos |
|---|---|
| 🎯 **Estudo** | Sessão do dia, Reforço (pontos fracos), simulado cronometrado, questões por tópico ou matéria inteira, gabarito comentado e "Explicar melhor", tela dividida com o material, pomodoro junto |
| 📕 **Caderno de erros** | A questão errada volta em 1, 3 e 7 dias até você acertar 3 seguidas |
| 🃏 **Flashcards** | Repetição espaçada (SM-2 simplificado), vindos do Grifo, das questões erradas ou escritos por você |
| 📋 **Edital verticalizado** | Teoria, questões e 3 revisões por tópico, com % por matéria e do edital. Matérias importadas do PDF do edital ou pesquisadas pelo cargo |
| 🦅 **Materiais do Grifo** | Resumo, questões, flashcards, pegadinhas e mnemônicos em segundos pelo Ollama, ou apostila A4 completa pelo Claude (com a [Grifo-Skill](https://github.com/asguth/grifo-skill)) |
| 🧑‍🏫 **Sala de aula** | Você explica o tópico para 6 alunos virtuais; um avaliador oculto compara com o material e os alunos perguntam justamente onde você ficou raso. Boletim e reaula em 1/7/30 dias. Dá para falar (segure Espaço) |
| ⏱️ **Foco** | Pomodoro e cronômetro de estudo/trabalho com pausa; o tempo aparece no menu e na bandeja |
| 🏠 **Início** | Painel em grade com arrastar e soltar: sessão do dia, missões, metas da semana, contagem para a prova, acerto por matéria, mapa de calor, recordes |
| 🌎 **Mundo** | Notícias de concursos com capa, resumo e relevância pela IA local; rastreador de concursos (RSS + Claude) com linha do tempo; suas provas com contagem regressiva |
| 🎮 **Jogo** | XP, níveis com festa, missões diárias, sequência com escudo, 5 temas + editor de cores (contraste AA), cena pixel que muda com a hora, sons 8-bit. Respeita "movimento reduzido" |

## IA local e Claude

| Quem | Para quê | Custo |
|---|---|---|
| **Ollama** (no seu PC) | Questões, materiais rápidos, alunos e avaliador da sala, classificação de notícias | Grátis. Padrão `qwen3:14b` (cabe em 12 GB de VRAM) |
| **Claude Code** (sua assinatura) | O que precisa de web ou de capricho: matérias pelo cargo, rastreador de concursos, apostila completa | Usa a sua assinatura do Claude, sem chave de API |

Em **Config → IA** cada tarefa pode ir para *Automático* (Ollama, e o Claude se o Ollama estiver
fora do ar), *Ollama* ou *Claude*. Tarefas de fundo, como aquecer o banco de questões e
classificar notícias, **só usam o Ollama**: o app não gasta sua assinatura sem você pedir.

## O Claude lê seu progresso (MCP)

O instalador traz o servidor `grifo-quest-mcp`, que dá ao Claude acesso **somente leitura** ao
seu banco. Conecte em **Config → Integrações** (Claude Code ou Claude Desktop, um clique cada) e
pergunte *"como foi minha semana de estudos?"* ou *"quais tópicos eu devo revisar?"*.

| Ferramenta | O que devolve |
|---|---|
| `get_stats` | Acerto por matéria, horas de estudo e de trabalho, tendência contra o período anterior |
| `get_weak_topics` | Tópicos mais fracos, com erros vencidos e peso no edital |
| `get_review_queue` | Aulas a refazer |
| `get_class_reports` | Boletins da sala de aula |
| `get_exams` · `get_contests` | Provas marcadas e concursos rastreados |

## Privacidade

- Seus dados ficam em `%APPDATA%\dev.grifoquest.app\grifo.db`, no seu PC.
- O app só acessa a internet para: feeds de notícias que você escolheu, atualizações do app
  (GitHub), downloads que você pede em Integrações e o Claude quando você manda.
- A voz é transcrita no seu PC (whisper.cpp na CPU); o áudio não sai da máquina.

## Perguntas frequentes

**É de graça?** Sim. O instalador é gratuito para uso pessoal.

**Preciso de placa de vídeo?** Para a IA local, uma GPU com 12 GB deixa tudo rápido. Sem ela o
Ollama roda na CPU (mais devagar) ou você manda as tarefas para o Claude.

**Funciona sem o Claude?** Sim. Só a pesquisa na web (matérias pelo cargo, rastreador) e a
apostila completa precisam dele.

**Serve para qualquer banca?** Sim. Cebraspe ganha questões Certo/Errado; as outras, A–E. Sem
banca definida, metade de cada.

**Mac ou Linux?** Por enquanto só Windows.

## Para desenvolvedores

O código está aqui para consulta (veja a [licença](#licença)). Stack: Tauri 2, Rust (sqlx,
specta), React 19, Tailwind 4, shadcn, Motion, Recharts, Vitest.

```sh
pnpm install
pnpm tauri dev                   # compila o MCP (scripts/sidecar.mjs) e abre o app
cargo test --workspace           # rode `node scripts/sidecar.mjs` uma vez antes
cargo clippy --workspace --all-targets
pnpm test                        # Vitest
```

Publicar uma versão: `node scripts/release.mjs 0.2.0 "notas"` (gera o instalador assinado, o
`latest.json` do updater e cria a Release no GitHub).

## Marca

<img src="docs/marca/icone.png" alt="Ícone do Grifo Quest" width="96" align="left">

O **Grifinho** e o nome **Grifo Quest** são marcas do projeto. Não use para sugerir que um
material, app ou curso é oficial do Grifo Quest.
<br clear="left">

## Apoie o projeto

Se o Grifo Quest te ajudou a estudar, dá para apoiar com um café:

<p align="center">
  <a href="https://buymeacoffee.com/asguth"><img alt="Pague um café no Buy Me a Coffee" src="https://img.shields.io/badge/Buy%20Me%20a%20Coffee-pague%20um%20caf%C3%A9-FFDD00?style=for-the-badge&logo=buymeacoffee&logoColor=000"></a>
</p>

Ou deixe uma ⭐ e [abra uma issue](https://github.com/asguth/grifo-quest/issues/new) quando achar
um erro.

## Créditos

- [Grifo-Skill](https://github.com/asguth/grifo-skill) (MIT + CC BY 4.0), embutida em
  `src-tauri/resources/grifo`.
- [whisper.cpp](https://github.com/ggml-org/whisper.cpp) (MIT), baixado sob demanda.
- Dependências de código aberto listadas em `Cargo.lock` e `pnpm-lock.yaml`, cada uma na sua
  licença.

## Licença

© 2026 Alberto Guth (GT Design). **Todos os direitos reservados.** O código está visível para
consulta; usar, copiar, modificar ou redistribuir exige autorização por escrito. O instalador
oficial pode ser usado de graça para fins pessoais. Texto completo em [LICENSE](LICENSE).

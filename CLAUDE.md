# Grifo Quest — notas para o Claude

App desktop (Tauri 2) de monitoramento de estudos para concursos. Windows primeiro. Repo público `asguth/grifo-quest`, licença restritiva (todos os direitos reservados, ver LICENSE).
Commit/push só quando o usuário pedir. Ao fim de cada etapa: build sem warnings, testes, parar para validação.

## Comandos
- Toolchain fora do PATH do bash? `export PATH="$HOME/.cargo/bin:$APPDATA/npm:$PATH"`
- `pnpm tauri dev` — roda o app (janela começa escondida; rodar o exe de novo a mostra via single-instance). Antes compila o MCP via `scripts/sidecar.mjs` (externalBin).
- Checkout novo: `node scripts/sidecar.mjs` uma vez antes de `cargo test`/`clippy` (o tauri-build exige o binário em `src-tauri/binaries/`).
- `pnpm build` — tsc + vite
- `pnpm test` — Vitest (lógica pura do front, `src/**/*.test.ts`; inclui contraste AA dos temas prontos)
- Ícone: `src-tauri/icons/icon-source.png` (Grifinho 1024 px) → `pnpm tauri icon src-tauri/icons/icon-source.png` (apagar as pastas android/ios geradas).
- `cargo test --workspace` — domínio + teste de SQL ponta a ponta (`db::tests::sql_end_to_end`)
- `cargo clippy --workspace --all-targets`
- Bindings TS (`src/lib/bindings.ts`) regenerados ao rodar o app em debug. Não editar à mão. Se o `tauri dev` não recompilar: `CARGO_TARGET_DIR=target/bindgen cargo build -p grifo-quest` e rodar o exe de dentro de `src-tauri/` (exporta e sai pelo single-instance). Nomes de tipo specta precisam ser únicos (ex.: `MaterialKind`, não `Kind`).
- `pnpm tauri build --bundles nsis` → instalador em `target/release/bundle/nsis/`.

## Stack travada
Tauri 2, sqlx (SQLite), specta/tauri-specta, Tailwind v4, shadcn, Vitest, tauri-plugin-updater. Recharts, Motion. Sem Zustand (não precisou).

## Arquitetura
- Workspace Cargo na raiz: `src-tauri` (app) + `mcp-server` (rmcp, stdio, banco só leitura). `target/` na raiz.
- `src-tauri/src/domain/` regras puras com testes: quick_log, xp, level, streak, missions, review, timer, classroom.
- `src-tauri/src/db/` queries sqlx (`query_as` + `FromRow`, sem macros `query!`).
- `src-tauri/src/commands/` um arquivo por feature: subjects, log, timer, diary, world, config, classroom.
- `src-tauri/src/claude.rs` Claude Code CLI headless (prompt via stdin, `stream-json` com progresso, cancelamento derruba a árvore com `taskkill /T`). `ollama.rs` chat/stream/pull/list.
- `src-tauri/src/ai.rs` roteador: `ai::complete(app, cfg, Task, …)`; `Task::Text` usa `material_route`/`task_model`, `Task::Evaluator` usa `evaluator`/`evaluator_model`; auto cai no Claude se o Ollama não responde. `json_object`/`json_array` tiram o JSON de respostas falantes.
- `sys.rs` processos sem console (`hidden_command`), rótulos de janela, `DB_FILE`, cliente HTTP único (`sys::http()`, timeout por chamada), evento de progresso `IntegrationEvent`.
- `settings.rs` tudo da tabela `settings`: `Stored` (JSON tipado por chave: `AppConfig`, `Profile`, `PomodoroConfig`) com `load` que dá erro em JSON ilegível (nunca reseta) e `UiKey` (prefs `ui_*` do front; espelho em `src/lib/prefs.ts`).
- `wire.rs` macro `wire_enum!`: enum cujo texto (banco/JSON/TS) é escrito uma vez, com `as_str`/`parse`/`ALL`. Use para todo enum persistido.
- `domain/text.rs` `fold` (sem acento/caixa), `head`/`tail` por caractere. `domain/xp.rs` toda constante de XP.
- `db/player.rs` `award(pool, async || …)`: todo caminho que grava XP passa por aqui (fecha missões e devolve `level_up`).
- Migração 0009: views `session_minutes`, `errors_due`, `card_state` (regras usadas pelo app e pelo MCP; o MCP tem teste rodando as ferramentas no esquema migrado).
- `commands/updater.rs` atualização automática: confere `latest.json` da Release mais recente ao abrir e a cada 6 h, baixa e emite `UpdateReady`; `install_update` instala e reinicia. Publicar: `node scripts/release.mjs X.Y.Z "notas"` (chave em `~/.tauri/grifo-quest.key`, fora do repo).
- `src-tauri/src/grifo.rs` + `resources/grifo/` skill do Grifo embutida (vai no instalador). Modo rápido: prompt montado com `comandos.md`/`bancas.md`/`fidelidade.md`, devolve Markdown. Modo completo: Claude CLI com cwd `<app_data>/grifo` (skill copiada em `.claude/skills/grifo`) e `--add-dir` na pasta de saída.
- `commands/config.rs` config, perfil, pomodoro e prefs de UI; `commands/window.rs` janelas (principal, boas-vindas). Perfil (`settings.profile`: nome, área, rotina, meta diária, `onboarded`): a meta e as horas definem os alvos das missões (`domain::missions::Goals`).
- `commands/planner.rs` + `domain/edital.rs` matérias automáticas: pelo cargo (Claude + web) ou pelo edital (PDF via `pdf-extract` em `spawn_blocking`, texto fatiado em 9k chars para o Ollama, `merge` junta repetidas). Prévia editável; `apply_plan` só acrescenta o que falta.
- Edital verticalizado: `topics.theory/practice/reviews(0–3)`; `% = (t+q+r)/5`, média por matéria no `list_subjects`.
- `commands/study.rs` + `domain/study.rs` + `db/study.rs` sessão de estudo: `compose` monta as vagas (caderno de erros + tópicos por `weakness`), `next_question` puxa do banco `questions` ou gera lote de 5 (JSON pela IA de tarefas, `validate` + `fingerprint`), pré-gera o próximo tópico em segundo plano (lock por tópico). `record_answer` grava tentativa + `question_logs` (com topic_id) + XP + caderno de erros (1/3/7 dias, sai no 3º acerto) + check de questões do edital (10 respostas). Flashcards: tabela `cards`, SM-2 simplificado (`review`).
- Timer: `Timer` tem `paused_at`; `toggle_pause`; parar grava o foco parcial; ticker emite `TimerTick` (front: `src/lib/timer.ts` `useTimer`).
- Mundo: `domain/news.rs` (strip_html, og_image, contest_key, clean da IA). Refresh RSS guarda texto + capa da entrada; `enrich` em segundo plano busca og:image e classifica (resumo, tags, relevância) **só no Ollama** (sem gastar Claude); relevância ≥ 0,8 notifica (até 3 por rodada). `summarize_news` (botão do leitor) usa a rota de tarefas. Concursos juntam por `dedupe_key`.
- Voz (`commands/voice.rs` + `domain/audio.rs`): microfone com `cpal` numa thread própria (stream não é Send), evento `VoiceLevel` para a onda, WAV 16 kHz → `whisper-cli.exe` (whisper.cpp oficial, baixado em Integrações para `%APPDATA%/…/voice/`, achado pela API de releases do GitHub; modelo `ggml-small-q5_1`). CPU, sem GPU. `whisper-rs` NÃO: as bindings prontas dele são de Linux e exigiriam LLVM. Alunos falam com `speechSynthesis` (vozes pt-BR do Windows), preferência `ui_class_voice`.
- Sala: aulas com `finished = 0` e falas aparecem para continuar (`open_classes`/`class_state`/`discard_class`).
- `commands/material.rs` materiais por tópico (tabela `materials`), um trabalho por tópico (`GrifoJobs`), evento `GrifoEvent`. `commands/integrations.rs` Config → Integrações (status + ações de um clique, evento `IntegrationEvent`).
- Front: primeira abertura em `src/features/onboarding/` (assistente de 7 telas + `SubjectPlanner`, reusado em Matérias → Importar); App mostra o assistente se `profile.onboarded` for falso (Config → Sistema refaz).
- Front: Início (`features/diary`) é uma grade de 3 colunas com @dnd-kit (modo Editar: arrastar, tamanho s/m/l = 1×1/2×1/2×2, esconder, gaveta). Layout em `ui_home_layout` (`layout.ts` migra o formato antigo `wide`). `LevelUpOverlay` + `celebrateLevel(n)` para nível novo.
- Janela `welcome` é criada sob demanda (`config::open_welcome`) e fechada de verdade (não fica na memória): o autostart passa `--autostart`; `welcome_on_boot` (ui pref) desliga; `open_main(slot)` mostra a principal e emite `NavigateTo`.
- Front: tela Estudo em `src/features/study/` com abas (StudyScreen: Hoje · Questões `PracticeTab` · Flashcards `DeckTab` · Erros `ErrorsTab` · Desempenho `PerformanceTab` · Foco). `shared.tsx` = tipos/estado vazio comuns (evita import circular). QuestionRunner = questões com teclado, simulado, pausa do pomodoro, tela dividida com o material e "Problema" (`report_question`, coluna `questions.reported`). CardReview = revisão SRS (até 20 novos por carregamento). `features/focus/FocusScreen.tsx` é a aba Foco.
- Estudo no Rust: `start_session(kind, topic_id, n, subject_id)` (matéria inteira = `topico` sem tópico); `study_home` aquece (pré-gera) os 3 tópicos mais fracos só com o Ollama no ar; `performance` lê `question_logs` (inclui lançamento rápido).
- Edital vazio: `features/onboarding/ImportEdital.tsx` (`ImportEditalButton`) abre o importador de qualquer tela (Início mostra o cartão "Falta só o seu edital"; Estudo e Matérias também usam).
- Arrastar arquivo: `dragDropEnabled: false` na janela main (senão o Tauri engole o drop do HTML5) + `main.tsx` bloqueia o drop fora das áreas de upload.
- Gráficos do Início (Recharts) ficam em `features/diary/charts.tsx` carregado sob demanda.
- Front: Mundo em `features/world/` (NewsBoard = mosaico em colunas CSS + leitor; ContestTracker = linha do tempo via `stageOf`).
- Front: materiais em `src/features/material/` (painel, folha em iframe `sandbox` sem scripts, flashcards); `src/lib/motion.ts` é o tema único de movimento; `src/lib/sound.ts` `sfx()` sons 8-bit sintetizados.
- Front: `src/app/App.tsx` (telas em `lazy`, transições, limite de erro por tela) + `src/app/Sidebar.tsx` (menu lateral, atalhos 1–6, badges, mini-timer), `src/features/<feature>`, `src/lib/theme.ts` (temas em CSS vars, `motion` liga/desliga animações), `src/app/nav.ts` (telas, `Navigate`, badges), `src/lib/` (format, dates, hooks `useTauriEvent`/`useKey`, prefs, bus de eventos internos, rules = números do backend mostrados na UI, update), `src/components/` primitivas (ProgressBar, ProgressRing, Chip, StatTile, FlipCard, toast…), `src/components/Scenery.tsx` (cena pixel por horário), `src/components/PixelSprite.tsx`.
- Visual: pixel é tempero (mascote, XP, títulos); corpo em Geist + shadcn. Tokens derivados em `index.css` (`surface`, `glass`, `shadow-soft/lift`). Plano em `PLANO-V2.md`.

## Decisões
- IDs/contadores `i32` (specta proíbe `i64`). Erros: `AppError` → `{kind, message}`; front usa `errorMessage(e)`.
- Banco `%APPDATA%/dev.grifoquest.app/grifo.db`, WAL. Datas UTC; dia local via `date(x,'localtime')`.
- `settings`: `config` (JSON `AppConfig`, backend), `profile`, `pomodoro` e `ui_*` do front (`settings::UiKey`: theme, home_layout, sound, sidebar_collapsed, welcome_on_boot, class_voice; flags "on"/"off").
- Timer vive no Rust (ticker 1 s); notícias atualizam ao abrir e a cada 3 h.
- Missões geradas no 1º acesso do dia (completadas se matérias surgirem depois); XP creditado uma vez.
- Sala: avaliador oculto devolve temas sem resposta; `next_turn` escolhe aluno/lacuna; eventos `ClassEvent` em streaming.
- Ollama: alunos e avaliador no mesmo `qwen3:14b` (14B + 8B não cabem juntos em 12 GB; troca custa ~1 min).
- Claude CLI (assinatura do usuário): rastreador (WebSearch) e Grifo completo (saída em `%APPDATA%/…/apostilas/<topic_id>/<kind>-<ts>/`; resumo gera `material.md`). Grifo completo gasta muitos tokens: não testar sem pedir.
- Links e apostilas abertos por comandos Rust (`open_link`, `open_material`) via plugin opener.

## Convenções
- Sem `unwrap()` fora de testes; sem `any` no TS. Textos de UI em pt-BR.
- Atalhos deliberados: comentário `ponytail:` + evolução; listar em `DEBITOS.md`. Ideias fora de escopo → `IDEIAS.md`.

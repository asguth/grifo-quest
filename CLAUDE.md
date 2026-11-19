# Grifo Quest — notas para o Claude

App desktop (Tauri 2) de monitoramento de estudos para concursos. Uso pessoal, Windows primeiro, MIT.
Roadmap por fases (1 fundação · 2 pomodoro · 3 painel · 4 MCP · 5 sala de aula). Ao fim de cada fase: build sem warnings, commit `feat(faseN): ...`, parar para validação.

## Comandos
- Toolchain fora do PATH do bash? `export PATH="$HOME/.cargo/bin:$APPDATA/npm:$PATH"`
- `pnpm tauri dev` — roda o app (janela principal começa escondida: clique no ícone da bandeja)
- `pnpm build` — tsc + vite
- `cd src-tauri && cargo test` — testes de domínio (parser, XP)
- `cd src-tauri && cargo clippy` — lint Rust
- Bindings TS (`src/lib/bindings.ts`) são regenerados ao rodar o app em debug. Não editar à mão.

## Stack travada
Tauri 2, sqlx (SQLite), specta/tauri-specta, Tailwind v4, shadcn + 8bitcn. Zustand/Recharts/Motion podem ser questionados (pergunte antes de trocar).

## Arquitetura
- `src-tauri/src/domain/` regras puras com testes (sem DB, sem Tauri).
- `src-tauri/src/db/` queries sqlx (sem macros `query!`; `query_as` + `FromRow`).
- `src-tauri/src/commands/` um arquivo por feature; únicos pontos de entrada do front.
- `src-tauri/migrations/` migrations sqlx, rodadas no startup (`db::open`).
- Front: `src/app` (shell + hotbar), `src/features/<feature>`, `src/components/ui` (shadcn), `src/components/ui/8bit` (camada jogo).
- Duas janelas no mesmo bundle: `main` e `quick` (lançamento rápido); `main.tsx` escolhe pelo label.

## Decisões
- IDs e contadores expostos como `i32`: specta proíbe `i64` no TS.
- Erros: `AppError` (thiserror, serializado `{kind, message}`); front usa `errorMessage(e)`.
- Banco: `%APPDATA%/dev.grifoquest.app/grifo.db`, WAL (MCP da fase 4 lê em paralelo).
- Tabela extra `settings` (chave/valor) para preferências.
- Autostart é ligado na 1ª execução só em build release.
- Fechar a janela esconde; sair só pelo menu da bandeja.
- Parser do lançamento rápido em Rust (`domain/quick_log.rs`); banca reconhecida por lista fixa.
- Fonte `Press Start 2P` empacotada (@fontsource), classe `.retro`; só títulos curtos/números.
- Tema único escuro quente em `src/index.css` (`:root`), `<html class="dark">`.
- Timer (pomodoro/cronômetro) vive no Rust (`TimerState` + `spawn_ticker` 1 s), máquina de estados pura em `domain/timer.rs`. Front faz polling de `timer_status` 1 s.
- Tooltip da bandeja mostra o timer (Windows não tem título de tray).
- Pomodoro: foco concluído grava `time_sessions` (estudo, source=pomodoro) + 10 XP + notificação; cancelar descarta. Cronômetro grava ao parar se ≥ 60 s.
- Config do pomodoro em `settings` (`pomodoro_focus_min`/`pomodoro_break_min`, padrão 25/5).
- Datas no SQLite em UTC `YYYY-MM-DD HH:MM:SS` via `datetime(?, 'unixepoch')` (sem chrono).

## Convenções
- Sem `unwrap()` fora de testes; sem `any` no TS.
- Atalhos deliberados: comentário `ponytail:` + caminho de evolução; listar em `DEBITOS.md` ao fim da fase.
- Ideias fora de escopo → `IDEIAS.md`.
- Textos de UI em pt-BR.

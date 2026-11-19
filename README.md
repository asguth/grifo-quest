# Grifo Quest

Monitor de estudos para concursos públicos, com cara de jogo cozy em vez de dashboard corporativo.
App desktop (Tauri 2 + React), dados locais em SQLite. Windows é o alvo principal.

> Nome provisório. MVP em construção, por fases.

![Diário](docs/screenshot-diario.png) <!-- placeholder -->

## Recursos (fase 1)
- Vive na bandeja do sistema e abre com o Windows (desligável em Config).
- **Ctrl+Alt+Q** abre o lançamento rápido: digite `30 15 lgpd fgv` (total, certas, matéria, banca) e Enter.
- Cadastro de matérias (cor, peso no edital) e tópicos (cole a lista do edital, um por linha).

## Setup
Pré-requisitos: Rust (rustup) + MSVC Build Tools, Node 20+, pnpm, WebView2.

```sh
pnpm install
pnpm tauri dev      # desenvolvimento
pnpm tauri build    # instalador em src-tauri/target/release/bundle
cd src-tauri && cargo test
```

## Integração MCP (Claude Desktop)
Chega na fase 4.

## Licença
MIT — veja [LICENSE](LICENSE).

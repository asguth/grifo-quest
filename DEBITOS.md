# Débitos (`ponytail:`)

## Fase 1
- `src-tauri/src/domain/quick_log.rs` — lista fixa de bancas. Evolução: tabela editável quando surgir banca fora da lista.
- `src-tauri/src/db/subjects.rs` — ids expostos como `i32` (cast de `last_insert_rowid`). Evolução: `string`/BigInt se um dia passar de 2 bi linhas.
- `src-tauri/src/lib.rs` — autostart não é ligado em build debug. Evolução: nenhuma prevista.
- `src/components/ui/8bit/styles/retro.css` — fonte pixel local em vez de Google Fonts (app offline).
- `src/index.css` — só tema escuro. Evolução: tema "pergaminho" claro duplicando o bloco `:root`.
- Zustand e Vitest removidos por não terem uso ainda; voltam quando houver estado compartilhado entre telas (fase 2/3) ou lógica pura no TS.

## Fase 2
- `src-tauri/src/commands/timer.rs` — sem pausa; cancelar pomodoro descarta o foco. Evolução: pausar/gravar parcial se fizer falta.
- `src/features/focus/FocusScreen.tsx` — polling de 1 s do estado do timer. Evolução: evento Tauri emitido pelo ticker se pesar.

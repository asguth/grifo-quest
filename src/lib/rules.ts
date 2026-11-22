/**
 * Regras do backend que aparecem em textos da interface. Mudou lá, muda aqui (uma edição no front).
 * Cada uma aponta para a origem no Rust.
 */

/** Cartões novos liberados por dia. `NEW_CARDS_PER_DAY` em src-tauri/src/db/study.rs. */
export const NEW_CARDS_PER_DAY = 20;

/** Dias até um erro voltar, e acertos seguidos para sair do caderno. `next_error` em src-tauri/src/domain/study.rs. */
const ERROR_INTERVALS = [1, 3, 7] as const;
export const ERROR_EXIT_STREAK = 3;

/** Tamanho padrão do reforço. `SessionKind::Reforco` em `start_session`, src-tauri/src/commands/study.rs. */
export const REFORCO_SIZE = 15;

/** XP de uma aula concluída. `xp::CLASS` em src-tauri/src/domain/xp.rs. */
export const CLASS_XP = 30;

/** Cartões por material de flashcards. Prompt `MaterialKind::Flashcards` em src-tauri/src/grifo.rs. */
export const FLASHCARDS_PER_MATERIAL = 16;

/** Relevância a partir da qual a notícia é "da sua área" (e notifica). `enrich` em src-tauri/src/commands/world.rs. */
export const NEWS_RELEVANT = 0.8;

/** Mensagem de erro de uma geração cancelada pelo usuário (`AppError::Invalid("Cancelado")`). */
export const CANCELLED = "Cancelado";

/** Atalho global do lançamento rápido. Registrado em src-tauri/src/lib.rs. */
export const QUICK_LOG_SHORTCUT = "Ctrl+Alt+Q";

/** "1, 3 e 7 dias". */
export const ERROR_INTERVALS_TEXT = `${ERROR_INTERVALS.slice(0, -1).join(", ")} e ${ERROR_INTERVALS.at(-1)} dias`;

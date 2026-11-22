# Plano — MVP completo do Grifo Quest

O que já existe (fases 1–2): bandeja, autostart, Ctrl+Alt+Q (questões), matérias/tópicos, pomodoro, cronômetro estudo/trabalho.
Este plano termina **tudo** num ciclo só, sem commits. Máquina-alvo: RTX 3060 12 GB, 24 GB RAM.

## Decisões de arquitetura

| Tema | Decisão | Por quê |
|---|---|---|
| Claude dentro do app | **Claude Code CLI em modo headless** (`claude -p ... --output-format json`) | Já está instalado e logado: usa sua assinatura, sem API key nem keyring. Tem WebSearch (rastreador) e a skill do Grifo (apostila). |
| Claude lendo o app | **Servidor MCP** (crate `mcp-server`, `rmcp`, stdio, SQLite só leitura) | Do Claude Desktop/Code você pergunta "como foi minha semana?" com dados reais. |
| IA local (sala de aula) | **Ollama** (precisa instalar). Alunos: `qwen3:8b`; avaliador: `qwen3:14b` (cabe nos 12 GB). Os dois modelos ficam configuráveis. | Custo zero e latência baixa. O avaliador pode trocar para Claude CLI em Config. |
| Notícias | RSS com `reqwest` + `feed-rs`, lista de feeds editável (padrão: PCI Concursos e outros de concursos) | Nada de scraper frágil. |
| Rastreador de concursos | Área de interesse em Config. O botão "Buscar com Claude" roda o CLI com WebSearch e devolve JSON; também filtra os feeds RSS por palavra-chave. | É o "rastreador via Claude" que você pediu, com fallback grátis. |
| Gráficos | Recharts | Já previsto na stack. |
| Tela inicial | **Grade de widgets** liga/desliga + ordem, salva em `settings` | É o que torna a tela inicial customizável. |
| Temas | Paletas prontas (Cozy escuro, Pergaminho claro, Floresta, Noite) + editor de cores (cada token com color picker) + escala de fonte | "Opções de cores e todo tipo de edição" em Config. |

## Banco (migration 0002)
- `exams` (nome, data, banca, cargo, matérias ligadas): contagem regressiva "dias para a prova".
- `contests` (título, órgão, banca, status, vagas, salário, inscrições até, url, fonte, found_at, seguido): rastreador.
- `feeds` (url, nome, ativo) e `news_items` (feed_id, título, link, publicado_em, lido): cache das notícias.
- `settings` ganha chaves JSON: `theme`, `home_layout`, `interest_area`, `ollama`, `claude_cli`.

## Domínio (Rust puro, com testes)
- Nível: curva `100 * level^1.5`, XP → nível e progresso.
- Sequência: dia conta com ≥1 pomodoro ou ≥10 questões; 1 escudo por semana.
- Missões diárias geradas à 00:00 (pior % de acerto × peso no edital), progresso automático ao lançar questões/pomodoro, XP de recompensa.
- Revisão espaçada da sala: 1/7/30 dias; nota < 60 reinicia o intervalo.
- Nota de cobertura a partir do JSON do avaliador.

## Telas (hotbar 1–5)
1. **Diário (início)** — widgets: mascote + XP/nível, sequência/escudos, missões do dia, dias até a prova, % de acerto por matéria, horas estudo × trabalho (semana), mapa de calor anual, questões/dia (30 dias), últimas notícias, concursos da sua área, fila de revisão.
2. **Foco** — já existe.
3. **Sala** — escolhe o tópico, cola/importa o material ou gera com o **Grifo**. Chat em blocos, 6 alunos em semicírculo (avatar pixel, balão), quadro-negro com o que foi coberto, avaliador oculto, boletim no fim. Streaming pelo Ollama.
4. **Matérias** — já existe, ganha o botão "Gerar apostila (Grifo)" por tópico.
5. **Mundo** (novo, substitui um slot ou vira o 6) — Notícias + Rastreador de concursos + Minhas provas.
6. **Config** em abas: Aparência · Página inicial · Pomodoro · Concursos/Notícias · IA (Ollama/Claude) · Sistema (autostart, som).

## Integração com o Grifo
Botão "Gerar apostila" → `claude -p "/grifo resumo <tópico> de <matéria>"` numa pasta `%APPDATA%/…/apostilas/<tópico>/`. Quando termina, o app abre o HTML/PDF e anexa o texto ao tópico como material de referência da Sala.

## MCP (ferramentas)
`get_stats(period)`, `get_weak_topics(limit)`, `get_review_queue()`, `get_class_reports(topic?)`, `get_exams()`, `get_contests()`. O README traz o trecho de `claude_desktop_config.json` e o comando `claude mcp add`.

## Ordem de execução
1. Migration 0002 + domínio (nível, sequência, missões, revisão) com testes.
2. Sistema de tema + Config em abas (Aparência e Página inicial).
3. Diário com widgets e gráficos.
4. Provas + Notícias RSS + Rastreador (Claude CLI).
5. Servidor MCP.
6. Sala de aula (Ollama + avaliador + boletim + revisão).
7. Grifo (gerar apostila).
8. Verificação: `cargo test`, `cargo clippy`, `pnpm build`, abrir o app; README/CLAUDE.md/DEBITOS.md atualizados. **Sem commits.**

## Você precisa fazer
- Instalar o Ollama e baixar os modelos: `winget install Ollama.Ollama`, depois `ollama pull qwen3:8b` e `ollama pull qwen3:14b`. Posso rodar isso para você.
- Graphify: depois do passo 3, se quiser economizar tokens, rode `/graphify .`.

## Fora (vai para IDEIAS.md)
Integração com Notion, kanban, voz (whisper/piper), sincronização na nuvem, cosméticos do mascote.

# Débitos (`ponytail:`)

## Fase 1
- `src-tauri/src/domain/quick_log.rs` — lista fixa de bancas. Evolução: tabela editável quando surgir banca fora da lista.
- `src-tauri/src/db/subjects.rs` — ids expostos como `i32` (cast de `last_insert_rowid`). Evolução: `string`/BigInt se um dia passar de 2 bi linhas.
- `src-tauri/src/lib.rs` — autostart não é ligado em build debug. Evolução: nenhuma prevista.
- `src/components/ui/8bit/styles/retro.css` — fonte pixel local em vez de Google Fonts (app offline).
- Zustand removido por não ter uso; volta quando houver estado compartilhado entre telas. (Vitest voltou na v2/Fase 1.)

## Fase 2
- (resolvidos na v2/Fase 4: pausa do timer, foco parcial gravado ao parar, evento `TimerTick` no lugar do polling)

## MVP completo
- `src-tauri/src/db/diary.rs` — missões geradas no 1º acesso do dia em vez de job às 00:00.
- `mcp-server/src/main.rs` — SQL repetido do app (crate separado, só leitura). Evolução: crate comum se divergir.
- Sala de aula: retomada de aula aberta resolvida na v2/Fase 7.
- Rastreador: dedupe por órgão resolvido na v2/Fase 6 (`dedupe_key`).
- Grifo completo: roda o Claude CLI com Bash liberado (cwd `<app_data>/grifo`, saída em `apostilas/<id>/...`). Cancelamento pela UI resolvido na v2/Fase 3.
- Binário do MCP no instalador resolvido na v2/Fase 8 (`externalBin` + `scripts/sidecar.mjs`).

## v2 — Fase 1
- `src/app/Sidebar.tsx` — badges por polling de 60 s (o mini-timer já usa o evento `TimerTick`).
- `src/app/App.tsx` — "Tentar de novo" do limite de erro não refaz um `lazy()` que falhou ao baixar (o React guarda a promessa rejeitada). Só acontece em dev quando o Vite reotimiza dependências; reiniciar o `tauri dev` resolve.
- `src/components/Scenery.tsx` — cores do céu fixas por período (não seguem o tema); montanhas puxam o fundo do tema.

## Fase 9 — bugs achados no app real
- Resolvidos na Fase 10: primeira questão lenta (aquecimento dos 3 tópicos mais fracos ao abrir o Estudo), interpretação sem texto-base (regra no prompt), notícia repetida entre fontes (`news::title_key`), balão cortado na Sala (balão central), botão das vozes pt-BR do Windows (Integrações), estado de erro no Estudo, cartão manual do MCP removido da Config.
- Corrigidos na Fase 9: atalho Ctrl+Alt+Q ocupado derrubava o app; INTEGER×REAL no ciclo (banco novo quebrava o Estudo); widget preso no carregando; teclas 1–4 dos flashcards trocavam de tela; comando síncrono criando janela travava o app; Matérias estourava a 1040 px; folha do material com rolagem horizontal; "questões hoje" → "faltam hoje".

## Fase 10 — geral (abas do Estudo, edital vazio, arrastar PDF)
- `src-tauri/src/db/study.rs` — limite de 20 cartões novos vale por carregamento do baralho, não por dia corrido (não há coluna de "visto hoje"). Evolução: coluna `introduced_at` se alguém revisar 100 novos num dia.
- `src-tauri/src/commands/study.rs` — aquecimento de questões só roda com o Ollama no ar e rota ≠ Claude (não gasta assinatura sem você pedir); com o Ollama fora, a 1ª questão ainda espera o lote.
- `src-tauri/src/commands/study.rs` — sessão por matéria acha os erros da matéria com uma consulta por erro vencido. Evolução: JOIN se o caderno passar de centenas.
- `src-tauri/src/domain/news.rs` — duplicata de notícia = título igual depois de tirar o " - Fonte" do fim; títulos reescritos por outra fonte continuam duplicados.
- Desempenho: "pontos em risco" = peso × (1 − acerto 30 d); matéria sem dados conta como 50%. Não usa nota de corte (não existe no cadastro).
- Telas novas conferidas no navegador com dados de exemplo (Tauri simulado); no app real ainda falta validar.

## v2 — Fase 8
- `scripts/sidecar.mjs` — `cargo test`/`clippy` num checkout novo falham até o binário do MCP existir em `src-tauri/binaries/` (o tauri-build confere o `externalBin`). Rode `node scripts/sidecar.mjs` uma vez; `tauri dev/build` já rodam sozinhos.
- Desempenho não foi medido com cronômetro: a melhoria concreta foi não criar a janela de boas-vindas na abertura (um WebView2 a menos na memória o dia todo).
- Acessibilidade: contraste AA testado só nos temas prontos (cores personalizadas ficam por conta de quem escolhe) e foco visível global; sem auditoria com leitor de tela.

## v2 — Fase 7
- `src-tauri/src/commands/voice.rs` — whisper roda como processo (`whisper-cli.exe`) a cada fala: carrega o modelo toda vez (~1 s). Evolução: servidor do whisper.cpp (`whisper-server`) aberto enquanto a aula durar, se a espera incomodar.
- Voz baixada de builds "bNNNN" do whisper.cpp (pré-lançamento oficial do mesmo repositório): as versões "v" recentes saíram sem binário para Windows.
- Fala limitada a 120 s por vez; microfone sempre o padrão do Windows (sem seletor).
- Voz dos alunos depende das vozes pt-BR instaladas no Windows; sem elas, o botão fica "Sem voz". Piper fica para depois se a voz do Windows não agradar.

## v2 — Fase 6
- `src-tauri/src/domain/news.rs` — chave de duplicata = 2 primeiras palavras do órgão/título: concursos diferentes do mesmo órgão no mesmo período (ex.: TRT-2 técnico e TRT-2 juiz) viram um só. Evolução: incluir cargo na chave se incomodar.
- `src-tauri/src/commands/world.rs` — og:image procurada uma vez por notícia (40 por rodada), sem cache local da imagem: sem internet, a capa vira a faixa colorida.
- Classificação da IA só roda com o Ollama no ar; sem ele, notícias ficam sem resumo até você pedir no leitor.
- Leitor mostra o texto do RSS (geralmente um trecho), não a página inteira: "Ler a notícia completa" abre o navegador.

## v2 — Fase 5
- `src/features/diary/DiaryScreen.tsx` — grade de 3 colunas fixas (2×2 = 2 colunas × 2 linhas); sem tamanhos livres por arrasto da borda.
- Notícias do Início sem imagem (capa com a cor da fonte); imagens chegam na Fase 6.
- Boas-vindas: em `tauri dev` não aparecem no boot (autostart só é registrado no build de release); teste por Config → Sistema → "Ver agora".
- Conquistas do mascote não existem como sistema: o widget "Recordes" mostra números do ano.

## v2 — Fase 4
- `src-tauri/src/commands/study.rs` — fila da sessão fica em memória: se o app fechar no meio, a sessão some (o que já foi respondido fica gravado). Evolução: tabela de vagas se fizer falta.
- `src-tauri/src/commands/study.rs` — questões geradas pela IA não são conferidas por outra IA; o comentário pode errar. Mitigação: material do tópico vai como referência e o prompt proíbe inventar lei. Evolução: botão "reportar questão" que apaga do banco.
- `src-tauri/src/commands/study.rs` — simulado distribui pelo peso da matéria mas não respeita a ordem/blocos da prova real.
- `src-tauri/src/domain/study.rs` — repetição espaçada (SM-2 simplificado) sem limite de cartões novos por dia.
- Erros de questões importadas por lançamento rápido (sem enunciado) não entram no caderno de erros; só as respondidas no app.

## v2 — Fase 2
- `src-tauri/src/commands/planner.rs` — edital acima de 90k caracteres (depois do "conteúdo programático") é cortado. Evolução: aumentar se aparecer edital com conteúdo maior.
- `src-tauri/src/commands/planner.rs` — PDF escaneado (sem texto) não é lido; o app pede para colar o texto. Evolução: OCR se fizer falta.
- `src-tauri/src/domain/edital.rs` — matérias iguais são juntadas por nome normalizado; sinônimos ("Português" × "Língua Portuguesa") ficam separados (dá para tirar na prévia).
- Checks do edital verticalizado são manuais; marcar sozinho a partir de questões/aulas fica para a Fase 4.

## v2 — Fase 3
- `src-tauri/src/grifo.rs` — modo rápido sem figuras/acervo (só Markdown); quem quer A4 ilustrado usa a apostila completa (Claude).
- `src-tauri/src/commands/material.rs` — um trabalho por tópico; dois tópicos podem gerar em paralelo e brigar pela GPU do Ollama. Evolução: fila global se travar.
- `src-tauri/src/commands/integrations.rs` — login do Claude é feito num terminal aberto pelo app (o app não detecta se você está logado; "Testar" confirma). Instalação do Claude usa o instalador oficial (`irm https://claude.ai/install.ps1 | iex`).
- `src/features/material/FlashcardDeck.tsx` — progresso dos cartões não é salvo (repetição espaçada entra na Fase 4).
- `src/lib/sound.ts` — sons sintetizados (WebAudio), sem volume próprio: só liga/desliga.

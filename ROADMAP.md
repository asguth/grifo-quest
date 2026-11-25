# Roadmap

Planejamento do Grifo Quest num lugar só. O que falta fazer está separado por **dificuldade**
(estimativa de esforço, não de importância). O histórico fica em [Entregue](#entregue), e as
limitações conhecidas em [Débitos técnicos](#débitos-técnicos).

Legenda: 🔵 planejado · ⚪ ideia (sem compromisso) · ✋ depende de você

---

## A fazer

### 🟢 Fácil (horas, sem mudar o banco)

| | Item | Notas |
|---|---|---|
| 🔵 | GIF da Sala de aula no README | Gravar uma aula com o Ollama no ar (`scripts/gif.py`) |

### 🟡 Médio (dias, com migração ou tela nova)

| | Item | Por quê |
|---|---|---|
| 🔵 | **Escolher o cargo/perfil na importação** | Edital com vários cargos (Dataprev: 14 perfis, 52 matérias) traz tudo; deveria trazer só o comum + o do seu cargo |
| 🔵 | **Peso pelo quadro de provas** | O edital diz quantas questões tem cada matéria ("Língua Portuguesa 10", "Recursos Hídricos 20"); hoje todas entram com peso 1 |
| 🔵 | **Datas do edital** | Inscrições, prova, recurso: a contagem regressiva ainda é manual |
| 🔵 | **Regras da prova** | Certo/Errado ou A–E, nota mínima por prova (eliminatória), discursiva (tema e linhas), data de corte da legislação ("alterações até a publicação do edital") |
| 🔵 | **Nota de corte e projeção** | Cadastrar a nota de corte e projetar a nota (acerto por matéria × peso): "faltam X pontos para passar" |
| 🔵 | **Reta final** | Últimos 15 dias: só caderno de erros, flashcards e pontos fracos; sem matéria nova |
| 🔵 | **Motivo do erro** | "Não sabia / confundi / falta de atenção / pegadinha" ao errar, visível no Desempenho (coluna nova + gráfico) |
| 🔵 | Sala de aula sem placa de vídeo | Alunos e avaliador pelo Claude ou Gemini/GPT/Grok quando não há IA local |
| 🔵 | Tempo por questão no simulado | Comparar com o tempo da prova real, por matéria |
| 🔵 | Lançamento rápido com tópico | `30 15 lgpd#direitos fgv` e prévia antes do Enter |
| 🔵 | Lista de bancas editável | Hoje é fixa em `domain/quick_log.rs` |
| 🔵 | Limite de 20 cartões novos por dia | Coluna `introduced_at` (hoje vale por carregamento) |
| 🔵 | Missões geradas à meia-noite | Hoje nascem no 1º acesso do dia |
| 🔵 | Badges do menu por evento | Hoje é polling de 60 s |
| 🔵 | Cache local das capas de notícia | Sem internet, a capa vira a faixa colorida |
| 🔵 | Voz: whisper-server durante a aula | Evita ~1 s carregando o modelo a cada fala; seletor de microfone |
| ⚪ | Trilha chiptune opcional no foco | Sons sintetizados como os efeitos |
| ⚪ | Cosméticos do mascote | Destravados por nível/edital |
| ⚪ | Exportar resumo semanal (Notion), kanban | |

### 🔴 Difícil (semanas, ou depende de terceiros)

| | Item | Por quê |
|---|---|---|
| 🔵 | **Cronograma reverso** | Da data da prova para trás: matéria e tópico de cada dia, com horas e peso; replanejar quando atrasa |
| ⚪ | Questões de provas reais | Importar PDF de prova + gabarito num banco "oficial", separado das geradas pela IA |
| ⚪ | Lei seca | Leitor de artigo com grifo e cartão por dispositivo (prazos, exceções, competências) |
| ⚪ | Discursiva/redação corrigida pela IA | Com o espelho da banca |
| ⚪ | Voz dos alunos com Piper | Mais natural que a do Windows |
| ⚪ | OCR de edital escaneado | PDF sem texto hoje não é lido |
| ⚪ | Issue automática sem conta no GitHub | Precisa de um servidor intermediário (o app não pode carregar token) |
| ⚪ | Sincronização na nuvem / app no celular | |

#### Grifo Quest Cloud (versão paga)

Duas versões do mesmo código: a **base** (como hoje, sem conta) e a **Cloud** (`cargo … --features cloud`). Login é opcional e só serve a quem assina; comunidade e backup na nuvem são só para assinantes. O servidor (Supabase: esquema, RLS, Storage, webhooks) fica no repositório privado `asguth/grifo-cloud`; quem libera é o RLS (`public.subscribed()`), não o app.

| | Item | Situação |
|---|---|---|
| 🟢 | Conta: login por código no e-mail ou senha (Config → Conta, só no build Cloud), sessão no cofre do Windows, plano via `my_plan` | Feito; chave em `src-tauri/cloud.env` (fora do git). Código por e-mail espera o SMTP |
| 🔵 | Esquema da comunidade (perfis, amigos, recados, depoimentos, comunidades, fórum, bloqueios, denúncias) + bucket `backups` | Migração escrita no `grifo-cloud`, falta aplicar |
| ⚪ | Backup do banco para o Storage (ao fechar e a cada X h, últimas N versões, restaurar em outro PC) | Reaproveitar `backup_database`/`restore_backup` |
| 🔵 | Tela Comunidade (perfil com recados/depoimentos/amigos, comunidades com fórum, busca, bloqueio, denúncia) | Feita (`features/community`), falta testar com a migração aplicada |
| ⚪ | Pagamento (Pix + cartão) com webhook gravando `subscriptions` | Gateway a escolher |
| ⚪ | Dois canais de atualização: base e Cloud com `latest.json` separados (a base nunca vira Cloud sozinha) | `updater.rs` escolhe o endpoint pela feature |
| ⚪ | Login com Google (PKCE + retorno em 127.0.0.1) | Depois do código por e-mail |
| ⚪ | SMTP próprio no domínio (Resend/Brevo) para o código por e-mail | Domínio comprado, falta configurar |
| ⚪ | Nível/XP do perfil são informados pelo app (dá para forjar) | Ranking com prêmio exige cálculo no servidor |

---

## Entregue

### 0.2.3 (nov/2026)
- **Tira-dúvidas** (aba do Estudo, "Pergunte ao Grifo"): chat com a IA sobre a matéria ou o tópico, usando o material do tópico; a resposta vem escrevendo (Ollama) e, se você sair da aba, o Grifinho avisa quando responder.
- **Avisos** com o Grifinho flutuante e balão de fala (com botão de ação quando faz sentido).
- **Outras IAs**: DeepSeek, GLM (Z.ai) e "Outra IA" com qualquer API no formato da OpenAI (OpenRouter, Groq, Mistral, LM Studio…); modelo digitável com sugestões.
- **Editar início**: arrastar não deforma nem espalha os cards (nada se mexe até soltar); 6 tamanhos (1×1, 2×1, 3×1, 1×2, 2×2, 3×2) em qualquer widget, escolhidos por miniatura.
- **Começar do zero**: apagar todos os dados em Config → Sistema (digita APAGAR; guarda backup antes) e volta ao assistente.
- Filtros do Mundo redesenhados (segmentado com contadores + etiquetas com cor); versão discreta no canto do menu; exemplos sem nome pessoal.

### 0.2.2 (nov/2026)
- **Importar edital sem IA** quando o edital segue o formato das bancas (títulos em maiúsculas + itens 1, 2, 3…): exato e instantâneo. Testado em 4 editais reais e ao vivo: ANPD (14 matérias/105 tópicos), ANA 2024 Cebraspe (19/153), Dataprev FGV (52/549), TJRJ FGV (9/77).
- Leitura robusta de edital oficial: títulos que quebram de linha, títulos corridos no meio do parágrafo, partes em algarismos romanos (de uma matéria ou de um cargo), subitens quando a matéria tem um item só, cabeçalho/rodapé e número de página fora, acentos decompostos (NFC), começo do conteúdo escolhido pelo que rende itens (edital cita "objetos de avaliação" antes da lista).
- IA (quando o edital não segue o formato): temperatura 0 e nova tentativa em parte ilegível; tópico longo é encurtado, nunca descartado.
- **Carregamento detalhado** na leitura: etapas, relógio, estimativa de quanto falta e matérias aparecendo na hora.
- **Abas de seção** novas (Estudo, Mundo, Config): maiores, com ícone e destaque deslizante.
- Layout em tela larga: colunas `fr` com `minmax(0,…)` em todo o app (a tela Estudo espremia a coluna da direita).

### 0.2.1 (nov/2026)
- **Importar edital**: texto do PDF consertado (números e acentos quebrados, rodapés), corte no próximo anexo, fatias que nunca partem uma matéria ao meio, um tópico por item numerado (antes picotava itens e inventava matérias). Validado no edital da ANPD: 14 matérias e 105 tópicos, iguais ao PDF.
- **Ollama** sobe sem abrir janelas de terminal (os runners herdam um console escondido).
- **Início**: mapa de calor no estilo do GitHub (meses, dias da semana, legenda, largura toda); "gerenciar" e "Marcar a data da prova" abrem direto Minhas provas.
- **Sala de aula**: escolha de tópico com busca e agrupada por matéria.
- **Aparência**: 9 temas (novos: Oceano e Lavanda) e "Salvar como tema" para guardar as cores personalizadas num card.
- **Cena**: lua e sol visíveis em telas estreitas (monitor em pé).
- **Abrir o app**: a janela aparece ao abrir, depois de atualizar e depois de restaurar backup (antes ia para a bandeja e parecia ter fechado); só o login do Windows abre na bandeja.

### 0.2.0 (nov/2026)
- **Interface**: responsividade por container query, cena pixel sem ampliar, Mundo em mosaico por linha com 24 notícias por vez, layout padrão do Início sem buracos (mapa de calor e notícias em largura total), ícones em pixel art no lugar dos emojis, menu sem números, tutorial animado com Pular.
- **Temas e texto**: 7 temas em OKLCH (todos AA), escolha de fonte (Geist, Segoe UI, Verdana, Georgia, Consolas) e volume dos sons.
- **Foco**: anel de blocos pixel com o Grifinho estudando; mini-timer do menu com barra de 10 blocos, pausa e atalho direto para a aba Foco.
- **IA**: detecção da placa de vídeo e modelo que cabe (Qwen 3.5 / Gemma 4), seletor com catálogo + personalizado, Gemini/GPT/Grok por chave de API (Cofre do Windows).
- **Rastreador**: trava contra concurso com prova já realizada (aditivo, convocação, resultado, data passada, ano antigo) virar "edital publicado"; encerrados ficam separados.
- **Dados**: backup do banco em um clique e restauração pela lista de backups (guarda o estado atual antes); edital importado junta matérias sinônimas ("Português" = "Língua Portuguesa").
- **Projeto**: GIFs das telas no README (`scripts/gif.py` grava a janela e monta), ROADMAP único, aviso de limitações no README, formulários de issue, migrações sempre em LF, `cargo test` em checkout novo sem rodar o sidecar antes, teste de SQL que não quebra de madrugada.

### 0.1.0 (nov/2026), primeira release pública
- **Fundação**: Tauri 2 + bandeja, autostart, lançamento rápido (Ctrl+Alt+Q), matérias e tópicos, pomodoro e cronômetro estudo/trabalho com pausa e foco parcial.
- **Design**: menu lateral recolhível com badges e mini-timer, transições, skeletons, cena pixel em parallax que muda com a hora, temas + editor de cores, sons 8-bit, "movimento reduzido".
- **Onboarding**: assistente de 7 telas; matérias pelo cargo (Claude + web) ou pelo edital em PDF, com prévia editável.
- **IA**: roteador Ollama/Claude por tarefa; Grifo nativo (modo rápido em Markdown pelo Ollama, apostila completa pelo Claude) com cancelamento; Integrações em um clique (Ollama, Claude, voz, MCP).
- **Estudo**: sessão do dia por pontos fracos, Reforço, simulado, questões por tópico/matéria, tela dividida com o material, caderno de erros (1/3/7 dias), flashcards SM-2, Desempenho.
- **Início**: grade com arrastar e soltar e tamanhos 1×1/2×1/2×2, widgets de sessão, missões, metas, prova, acerto, mapa de calor, notícias; janela de boas-vindas ao ligar o Windows.
- **Mundo**: notícias com capa, resumo, tags e relevância pela IA local, leitor embutido, lidas/não lidas; rastreador de concursos com linha do tempo e "seguir".
- **Sala de aula**: 6 alunos virtuais, avaliador oculto, boletim, reaula 1/7/30 dias, voz local (whisper.cpp) e vozes pt-BR do Windows, aulas retomadas ao reabrir.
- **Distribuição**: MCP no instalador, ícone e marca, atualização automática assinada pelas Releases do GitHub.

---

## Débitos técnicos

Atalhos deliberados (marcados no código com `ponytail:`) e limitações conhecidas, por área.
Quando um for resolvido, apague a linha.

### Estudo e questões
- `commands/study.rs`: fila da sessão fica em memória; fechar o app no meio perde a fila (o que foi respondido fica gravado).
- `commands/study.rs`: questões da IA não são conferidas por outra IA; o comentário pode errar (mitigação: material como referência, prompt proíbe inventar lei, botão "Problema").
- `commands/study.rs`: simulado respeita o peso das matérias, mas não a ordem/blocos da prova real.
- `commands/study.rs`: aquecimento de questões só com Ollama no ar; sem ele a 1ª questão espera o lote.
- `commands/study.rs`: sessão por matéria busca erros com uma consulta por erro vencido (trocar por JOIN se o caderno passar de centenas).
- `db/study.rs`: limite de 20 cartões novos vale por carregamento, não por dia (falta coluna `introduced_at`).
- Erros vindos do lançamento rápido (sem enunciado) não entram no caderno de erros.
- Desempenho: "pontos em risco" = peso × (1 − acerto 30 d); matéria sem dados conta 50%. Sem nota de corte.

### Edital e matérias
- `commands/planner.rs`: edital acima de 90 mil caracteres é cortado; PDF escaneado (sem texto) não é lido (falta OCR).
- `domain/quick_log.rs`: lista fixa de bancas.

### Mundo
- `domain/news.rs`: duplicata = título igual sem o " - Fonte"; títulos reescritos continuam duplicados.
- `domain/news.rs`: chave de concurso = 2 primeiras palavras do órgão; cargos diferentes do mesmo órgão podem virar um só.
- `commands/world.rs`: og:image sem cache local (sem internet, a capa vira a faixa colorida); classificação só com Ollama no ar.
- Leitor mostra o trecho do RSS, não a página inteira.

### IA, Grifo e voz
- `commands/material.rs`: um trabalho por tópico; dois tópicos em paralelo disputam a GPU (fila global se travar).
- `grifo.rs`: modo rápido sem figuras (só Markdown).
- `commands/integrations.rs`: o app não detecta login do Claude ("Testar" confirma).
- `commands/voice.rs`: whisper roda como processo a cada fala (~1 s carregando o modelo); fala até 120 s; microfone sempre o padrão do Windows.

### App e interface
- `src/app/Sidebar.tsx`: badges por polling de 60 s.
- `src/app/App.tsx`: "Tentar de novo" não refaz um `lazy()` que falhou ao baixar (só em dev).
- `src/components/Scenery.tsx`: cores do céu fixas por período (não seguem o tema).
- `src-tauri/src/gpu.rs`: placa detectada uma vez por execução; a Sala de aula ainda exige Ollama (sem placa dedicada, os alunos não falam).
- Reportar problema exige conta no GitHub (o app não envia nada sozinho para não carregar token num repositório público).
- `src/features/diary/DiaryScreen.tsx`: sem redimensionar widget pela borda (só 1×1/2×1/2×2).
- `db/diary.rs`: missões geradas no 1º acesso do dia, não às 00:00.
- `mcp-server`: SQL repetido do app (crate comum se divergir).
- IDs `i32` (specta proíbe `i64`).
- Acessibilidade: contraste AA testado só nos temas prontos; sem auditoria com leitor de tela.

### Build
- `src-tauri/build.rs`: em debug, sem o binário do MCP, cria um placeholder vazio (os testes rodam; `tauri dev/build` trocam pelo real).

---

## Princípios de design

Valem para toda tela nova.

**Visual**: "RPG aconchegante, acabamento de produto". Pixel é tempero (mascote, XP, títulos, cena); corpo em Geist + shadcn. Nada de gradiente roxo-azul genérico nem grade de cards idênticos.

**Movimento** (`src/lib/motion.ts`, nenhum easing solto na tela): nunca linear; entradas animam 2–3 propriedades; listas em stagger curto e **limitado** (listas longas não esperam item por item); saídas na metade do tempo; o que fica parado respira; um destaque por vez.

**UX**: uma ação primária por tela; estados vazio/carregando/erro/sucesso sempre desenhados; layout decide colunas pela largura da própria área (container queries), não da tela; contraste AA, foco visível, alvo ≥ 32 px.

# Plano v2 — Grifo Quest "de verdade"

Objetivo: sair da cara de protótipo/IA e virar um app que dá gosto abrir quando o Windows liga.
Mesmas regras de sempre: sem commits, cada fase termina com build sem warnings + testes + parada para validação.

---

## 0. O que ficou pendente do plano anterior

Itens prometidos ou anotados que **não** foram feitos (entram nas fases abaixo):

| Pendência | Origem | Vai para |
|---|---|---|
| Botão "Gerar apostila (Grifo)" na tela Matérias (o PLANO prometia, foi parar em IDEIAS) | PLANO / IDEIAS | Fase 3 |
| Notícias sem imagem: `news_items` não guarda `image_url` | schema 0002 | Fase 6 |
| Voz na sala (whisper) | IDEIAS | Fase 7 |
| Edital verticalizado automático a partir do PDF | IDEIAS | Fase 2 |
| Timer sem pausa; cancelar descarta o foco | DEBITOS F2 | Fase 4 |
| Polling de 1 s do timer no front → evento Tauri | DEBITOS F2 | Fase 4 |
| Aula da sala não é retomada após reiniciar | DEBITOS MVP | Fase 7 |
| Rastreador duplica concurso vindo de fontes diferentes | DEBITOS MVP | Fase 6 |
| Grifo sem cancelamento pela UI | DEBITOS MVP | Fase 3 |
| Binário do MCP fora do instalador (`externalBin`) | DEBITOS MVP | Fase 8 |
| Bundle único sem code splitting (vai pesar com split view/voz) | DEBITOS MVP | Fase 1 |
| Lançamento rápido com tópico (`lgpd#direitos`) + pré-visualização | IDEIAS | Fase 4 |
| Vitest removido — volta agora (roteador de IA, layout da grade, parser de questões no TS) | DEBITOS F1 | Fase 1 |

Continuam fora: Notion/kanban, nuvem/celular, cosméticos do mascote (talvez na Fase 5 como recompensa de nível, se sobrar fôlego).

---

## 1. Direção visual (o motivo da "cara de IA")

Diagnóstico: tudo é 8bitcn (borda pixel em todo componente, fonte pixel em todo título), hotbar de botões iguais, cards todos do mesmo tamanho, nenhuma hierarquia, nenhum movimento. Parece template.

Proposta — **"RPG aconchegante, acabamento de produto"**:
- **Pixel é tempero, não prato.** Pixel só no mascote, ícones de conquista, barra de XP, cena de fundo e títulos grandes. Corpo, tabelas e formulários em Geist com componentes shadcn normais (radius suave, sombras em camadas).
- **Cena viva de fundo**: paisagem pixel em parallax (3 camadas) que muda com a hora do dia (manhã/tarde/noite/madrugada) e o tema. Fica atrás do Início e da tela de boas-vindas; desliga em "movimento reduzido".
- **Hierarquia real no Início**: um "hero" (saudação + mascote + XP + sequência + CTA "Começar sessão"), depois widgets de tamanhos diferentes (1×1, 2×1, 2×2).
- **Glass leve** (blur + borda 1px translúcida) só nos painéis sobre a cena, não no app inteiro.
- **Tipografia**: Geist para texto, Geist Mono para números (timer, XP, %), Press Start só em display.
- **Ícones Lucide** consistentes (já instalado), tamanho/traço fixos.
- **Microcopy com personalidade** (o Grifo fala com você: "Bom dia! 3 revisões vencem hoje").

### Animações (Motion, já instalado)
- Transição entre telas (fade + slide 8px), `AnimatePresence` no router.
- Layout animations ao reordenar widgets e listas.
- Ganho de XP: número flutuante "+15 XP" + barra enchendo com mola.
- Subida de nível: tela cheia curta com mascote, partículas (CSS/canvas próprio, sem lib).
- Missão concluída: check desenhado (SVG stroke) + brilho.
- Acerto/erro na questão: pulso verde / tremida vermelha.
- Skeletons com shimmer no lugar de "Carregando...".
- Tudo passa por `useReducedMotion` + opção em Config.

### Regras de movimento (do claude-remotion-skill, MIT) — valem para toda tela nova
Ficam em `src/lib/motion.ts` (tema único: nenhum easing ou spring escrito solto na tela).
1. Nunca linear: spring ou curva com saída suave.
2. Entradas animam 2–3 propriedades juntas (opacidade + y + escala).
3. Listas entram em stagger curto (~50 ms por item).
4. Saídas são mais rápidas que entradas (~metade do tempo).
5. Pausa é ferramenta: movimento rápido, depois imobilidade. Nada de loop chamativo.
6. O que fica parado muito tempo "respira" (seno sutil: mascote, ícone de espera).
7. Um destaque por vez (brilho/sombra colorida só no elemento que importa agora).
8. Parallax em camadas com fatores proporcionais (a cena já usa 4/9/16).
O skill não cobre personagens (squash & stretch, piscar, falar): isso fica com a gente na Fase 5 (mascote) e na Fase 7 (alunos).

### Regras de UX (do uxui-workflow, MIT) — checklist de cada tela
- **Uma ação primária por tela**, e ela é a coisa mais óbvia (botão cheio; o resto é secundário/ghost).
- Conteúdo na ordem de prioridade do usuário, não na ordem do banco.
- Estados sempre desenhados: **vazio** (com mascote + próxima ação), **carregando** (skeleton), **erro** (mensagem + como resolver), **sucesso** (toast).
- Primeira vez × retorno: a primeira vez ensina, o retorno vai direto ao ponto.
- Anti-"cara de IA": nada de gradiente roxo-azul, hero genérico ou grade de cards idênticos; conteúdo real, não placeholder.
- Acessibilidade: contraste AA, foco visível, alvo ≥ 32 px, texto legível.
- Ao fim de cada fase: crítica por severidade (alta/média/baixa) com a correção proposta; só aplico o que você aprovar.

## 1b. Pedidos que entraram depois

### Ideias de hubs de concurso no Notion
A página pública do template "Hub Concurso Público" não mostra o conteúdo (só avaliações), então usei o que esses hubs costumam ter. Se quiser algo específico dele, mande prints ou exporte o template.
| Ideia | Onde entra |
|---|---|
| **Edital verticalizado** com checks por tópico: teoria ✓, questões ✓, revisão 1/2/3 ✓, % do edital concluído | Fase 2 (gerado do PDF) + tela Matérias |
| **Ciclo de estudos**: rotação de matérias por horas/peso, "próxima matéria do ciclo" | Fase 4 |
| **Simulados**: prova cronometrada, nota por matéria, histórico e evolução | Fase 4 |
| **Caderno de erros** | Fase 4 (Reforço) |
| **Metas semanais** (horas, questões, tópicos) | Fase 5 (widget) |
| **Banco de materiais e links** por tópico | Fase 3 (feito: materiais do Grifo por tópico) |

### Reforço: focar no que você mais erra
Modo da sessão de estudo (Fase 4) montado por algoritmo, sem precisar de IA:
- **Peso de cada tópico** = taxa de erro recente (últimos 30 dias, erro recente pesa mais) × peso da matéria no edital × "esquecimento" (dias desde a última vez) × bônus se tem revisão vencida.
- A sessão "Reforço" pega os tópicos de maior peso e as **questões que você errou** (caderno de erros), e reapresenta as erradas em 1/3/7 dias até acertar 2 vezes seguidas.
- A IA local entra só para gerar questões novas dos tópicos fracos e explicar o erro ("Explicar melhor").
- Tela "Pontos fracos": ranking de matérias e tópicos com a tendência (melhorando/piorando) e um botão "Treinar isso agora".

### Flashcards
- **Feito na Fase 3:** geração pelo Grifo e modo de estudo com cartão que vira (Espaço vira, ← errei, → acertei, repetir só os errados).
- **Fase 4:** baralho persistente com repetição espaçada (SM-2 simplificado): cada cartão tem intervalo e facilidade; a fila do dia entra no Início e no Reforço; cartões criados também a partir das questões erradas.

---

## 2. Fases

### Fase 1 — Fundação de design + navegação ✅ (feita)
- **Menu lateral** substitui a hotbar: recolhível (ícones ↔ ícones+rótulo), atalhos 1–7 mantidos, **badges** (notícias não lidas, revisões vencidas, aula aberta) e **mini-timer** no rodapé do menu quando há pomodoro rodando.
- Tokens de design novos em `theme.ts` (sombras, radius, superfícies `surface-1/2/3`, cores semânticas acerto/erro/xp) — os presets atuais ganham esses tokens.
- Componentes base revisados: Card, Button, Input, Tabs, Dialog, Toast (toast global para erros, hoje cada tela mostra o seu).
- Primitivos de animação: `<PageTransition>`, `<XpBurst>`, `<Skeleton>`.
- Cena pixel parallax (`<Scenery>`), sprites em `public/scenery/`.
- Code splitting por tela (`React.lazy`) — fecha o débito do bundle.
- Vitest de volta.

**Entrega**: app navegando com o menu novo, transições e a cena de fundo. Telas ainda com o conteúdo antigo.

### Fase 2 — Onboarding + cadastro automático de matérias ✅ (feita)
Primeira abertura (ou "Refazer configuração" em Config) abre um assistente em 5 passos, com animação entre eles:
1. **Quem é você**: nome/apelido, área (Policial, Fiscal, Tribunais, Bancária, Saúde, Educação, TI, Controle, Outra), escolaridade.
2. **Provas de interesse**: busca com Claude (WebSearch) por concursos abertos/previstos da área → lista com checkbox; ou digitar à mão. Vira `exams`/`contests` seguidos.
3. **Rotina**: horas por dia, dias da semana, meta de questões/dia (padrão 20), duração do pomodoro.
4. **Matérias**: três caminhos, todos terminando numa **pré-visualização editável** antes de salvar:
   - **Pelo cargo** (Claude + WebSearch): "Técnico do TRT, FCC" → matérias, tópicos e peso.
   - **Pelo edital** (PDF ou texto colado): extrai texto do PDF no Rust (`pdf-extract`), Ollama estrutura em JSON matéria → tópicos → peso. Isso é o **edital verticalizado** que estava em IDEIAS.
   - **Manual** (o que existe hoje).
5. **Integrações**: checa Ollama/Claude e oferece instalar em um clique (mesmo componente da Fase 3).

Fim do assistente: o Grifo te dá boas-vindas, gera as missões do dia e já mostra o Início montado.

### Fase 3 — Camada de IA (Ollama primeiro) + Grifo nativo + Integrações em 1 clique ✅ (feita)
**Roteador de IA** (`src-tauri/src/ai.rs`): uma função `ai::run(task, input)` com um `match` por tarefa decidindo o provedor. Config tem, por tarefa, `Auto | Ollama | Claude`.

| Tarefa | Auto vai para | Por quê |
|---|---|---|
| Resumir/classificar notícia, relevância p/ sua área | Ollama | Simples, roda em lote |
| Estruturar edital colado/PDF | Ollama | Extração em JSON |
| Gerar questões do dia (rascunho) | Ollama | Volume alto, custo zero |
| Comentar/explicar resposta errada | Ollama | Curto |
| Interpretar lançamento rápido ambíguo | Ollama | Hoje é regex; IA só como fallback |
| Alunos e avaliador da sala | Ollama | Já é assim |
| Rastreador de concursos (precisa web) | Claude | WebSearch |
| Matérias pelo cargo (precisa web) | Claude | WebSearch |
| Apostila completa HTML/PDF do Grifo | Claude | Pipeline da skill com scripts e figuras |
| Questões "premium" (sob demanda) | Claude | Qualidade de banca |

Se o Ollama estiver fora do ar, "Auto" cai para Claude e avisa num toast.

**Grifo nativo**: a skill (MIT, sua) é copiada para `src-tauri/resources/grifo/` (SKILL.md, `references/`, `assets/grifo.css`, templates, mascote) e vai junto no instalador.
- **Modo Claude**: igual hoje (`/grifo ...` via CLI), mas com a skill do app, cancelamento pela UI (mata o processo) e progresso por eventos (fecha débito).
- **Modo Ollama**: o app monta o prompt com `references/bancas.md` + a especificação do comando (`/resumo`, `/questoes`, `/flashcards`, `/mnemonico`, `/pegadinhas`) e pede **Markdown/JSON**; o app renderiza com `grifo.css` dentro do próprio app. Sem figuras de acervo, mas instantâneo e grátis.
- Botão "Gerar material" por tópico em **Matérias** (pendência antiga), com menu: resumo, questões, flashcards, mnemônico, pegadinhas, apostila completa.

**Config → Integrações** (cards com status verde/amarelo/vermelho e botão único):
- **Ollama**: detecta; se faltar, `winget install Ollama.Ollama`; baixa os modelos com barra de progresso (API `/api/pull` em streaming); botão "testar".
- **Claude CLI**: detecta versão e login; botão "Entrar" abre o terminal com `claude` para logar.
- **MCP**: "Conectar ao Claude Desktop" escreve o trecho em `claude_desktop_config.json` (com backup) e "Conectar ao Claude Code" roda `claude mcp add`.
- **Voz**: baixa o modelo whisper (Fase 7).
- **Iniciar com o Windows** + "mostrar boas-vindas ao ligar".

### Fase 4 — Sessão de estudo (o Pomodoro vira o coração do app) ✅ (feita)
A tela Foco vira **Estudo**, com dois modos:
1. **Sessão de questões** (padrão): "20 questões de hoje" montadas pelas missões (tópicos fracos × peso × revisões vencidas). Pomodoro roda junto; a sessão pausa no intervalo.
   - Uma questão por vez, banca e estilo certos (Cebraspe C/E, FGV/FCC A–E), atalhos de teclado (A–E, C/E, Enter, → próxima).
   - Ao responder: animação de acerto/erro, gabarito comentado, botão "Explicar melhor" (Ollama), "Marcar para revisão".
   - Cada resposta grava sozinha no log de questões → % de acerto, XP, missões e sequência atualizam ao vivo (acabou o lançamento manual para quem estuda pelo app; o atalho Ctrl+Alt+Q continua para questões feitas fora).
   - Erradas entram numa fila de revisão espaçada (reaproveita `domain/review.rs`).
   - Fim da sessão: boletim com tempo, acertos por tópico, XP ganho e "próxima sessão sugerida".
2. **Reforço**: sessão montada pelo algoritmo de pontos fracos (seção 1b) + caderno de erros.
3. **Simulado**: prova cronometrada no formato da banca, nota por matéria e histórico.
4. **Foco livre**: o pomodoro/cronômetro atual, agora com **pausa** e gravação parcial (débito F2).

**Split screen**: botão "Abrir material" divide a tela (painel redimensionável) — apostila do tópico à esquerda (HTML do Grifo via protocolo de asset do Tauri num `<iframe>`, ou Markdown renderizado com `grifo.css`), questões à direita. Sem material? Botão "Gerar resumo rápido (Ollama)" ali mesmo.

**Banco de questões** (migration 0003): `questions` (tópico, banca, enunciado, alternativas JSON, gabarito, comentário, fonte ollama/claude, hash do enunciado para não repetir) e `attempts` (questão, resposta, acertou, tempo gasto, data). Geração antecipada: o app gera o lote de amanhã em segundo plano quando está ocioso, então a sessão abre na hora.

Timer passa a emitir evento Tauri a cada tick (fim do polling, débito F2). Lançamento rápido aceita `tópico#subtópico` com pré-visualização (IDEIAS).

### Fase 5 — Início com arrastar e soltar + boas-vindas do Windows ✅ (feita)
- Grade de widgets com **drag and drop** e **redimensionar** (1×1, 2×1, 2×2) via `@dnd-kit/sortable` (única dependência nova da fase; o `Reorder` do Motion só faz lista 1D). Modo "Editar início" com tremidinha nos cards, botão de remover e uma gaveta de widgets para adicionar.
- Widget **Notícias** de verdade: carrossel com imagem, título, fonte, tempo, marcar como lida; clique abre o leitor.
- Widgets novos: "Sessão de hoje" (CTA + progresso das 20 questões), "Revisões vencidas", "Próxima prova" com contagem animada, "Conquistas recentes".
- **Boas-vindas ao ligar o Windows**: hoje a janela abre escondida. Nova opção (padrão ligada): ao logar, mostra uma janela compacta animada — cena do horário, "Bom dia, Alberto", sequência, missões, prova mais próxima, botões "Começar sessão" e "Depois" (some para a bandeja). Fecha sozinha em 30 s se ignorada.

### Fase 6 — Mundo 2.0 ✅ (feita)
- Migration: `news_items` ganha `image_url`, `summary`, `tags`, `relevance`, `read_at`; `contests` ganha `dedupe_key` (órgão+cargo normalizados) para juntar fontes diferentes (débito).
- **Imagens**: `enclosure`/`media:thumbnail`/`media:content` do RSS; se faltar, busca `og:image` da página em segundo plano (cache no banco, 1 requisição por item). Fallback: capa gerada com a cor do feed + ícone.
- Layout em mosaico (cards de tamanhos diferentes, destaque no topo), filtros por fonte/tag/"da minha área", busca.
- **Lido**: marca ao abrir, check manual com animação, "marcar tudo como lido", filtro "não lidas", contador no menu lateral.
- **Leitor embutido**: abre a notícia num painel lateral (resumo do Ollama + botão "abrir no navegador").
- Ollama em lote: resumo de 2 linhas, tags (edital, inscrições, resultado, prorrogação) e relevância para sua área. Notícias muito relevantes viram notificação do Windows.
- Rastreador: linha do tempo por status (previsto → edital → inscrições → prova), "seguir" cria a prova em `exams` com contagem regressiva.

### Fase 7 — Sala de aula com voz ✅ (feita)
- **Reconhecimento de voz local** com whisper.cpp (`whisper-rs`), modelo `small` pt (~470 MB, baixado em Integrações), rodando na **CPU** para não brigar com o `qwen3:14b` pela VRAM.
  - Push-to-talk (segurar Espaço ou botão do microfone), forma de onda animada, transcrição aparece editável antes de enviar.
  - Captura de áudio no Rust (`cpal`), não no WebView (o `webkitSpeechRecognition` do WebView2 não funciona offline).
- Opcional na mesma fase: **voz dos alunos** com a síntese do próprio Windows (`speechSynthesis` do WebView2 tem vozes pt-BR da Microsoft, custo zero). Piper fica para depois se a voz do Windows não agradar.
- Aulas abertas são retomadas ao reiniciar (débito).
- Visual: alunos animados (idle, levantar a mão, pensando), quadro-negro com giz aparecendo.

### Fase 8 — Débitos restantes + acabamento ✅ (feita)
- MCP no instalador via `externalBin`.
- Ícone/instalador/splash com a marca.
- Passada de acessibilidade (foco visível, contraste dos temas, leitores de tela no menu).
- Revisão de performance (abertura < 1,5 s, memória em repouso).
- README, CLAUDE.md, DEBITOS.md e IDEIAS.md atualizados.

---

## 3. Banco — resumo das migrations
- **0003_estudo**: `questions`, `attempts`, `study_sessions`; `profile` (área, escolaridade, rotina, meta diária) em `settings`.
- **0004_mundo**: colunas novas em `news_items` e `contests`.
- `settings` novos: `ai_routing`, `onboarding_done`, `welcome_on_boot`, `reduced_motion`, `sidebar_collapsed`.

## 4. Dependências novas (e só estas)
| Dep | Para | Alternativa descartada |
|---|---|---|
| `@dnd-kit/core` + `@dnd-kit/sortable` | Grade 2D do Início | Motion `Reorder` (só 1D), HTML5 DnD (sem toque, UX ruim) |
| `react-resizable-panels` | Split screen | CSS `resize` (não dá para salvar proporção decentemente) |
| `marked` (ou `markdown-it`) | Renderizar material do modo Ollama | — |
| `pdf-extract` (Rust) | Edital em PDF | Pedir para colar o texto |
| `whisper-rs` + `cpal` (Rust) | Voz | WebView2 speech (não funciona offline) |

## 5. Decisões que preciso de você
1. **Direção visual**: "RPG aconchegante com acabamento de produto" (acima) — ou prefere mais minimalista (pixel quase sumindo) ou mais jogo (pixel em tudo, mas bem feito)?
2. **Foco → Estudo**: tudo bem a tela Foco virar "Estudo" com a sessão de questões como modo padrão?
3. **Boas-vindas ao ligar o Windows**: janela compacta (proposta) ou o app inteiro abrindo já no Início?
4. **Questões do dia**: Ollama por padrão e Claude só no botão "premium" — ou Claude por padrão (melhor qualidade, gasta assinatura)?

## 6. Ordem e tamanho
| Fase | Tamanho | Depende de |
|---|---|---|
| 1 Fundação de design | M | — |
| 2 Onboarding + matérias automáticas | M | 1, 3 (roteador) |
| 3 IA + Grifo nativo + Integrações | G | 1 |
| 4 Sessão de estudo + split | G | 3 |
| 5 Início DnD + boas-vindas | M | 1, 4 (widget sessão) |
| 6 Mundo 2.0 | M | 3 |
| 7 Sala com voz | M | 3 |
| 8 Débitos + acabamento | P | tudo |

Ordem real de execução: **1 → 3 → 2 → 4 → 5 → 6 → 7 → 8** (o onboarding precisa do roteador de IA e das Integrações prontos).

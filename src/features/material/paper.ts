import { marked } from "marked";

/** Mesa atrás da folha (também o fundo do painel enquanto o iframe carrega). */
export const PAPER_DESK = "#E7EDF2";

/** Paleta editorial do Grifo (grifo.css): navy para estrutura, cor só quando significa algo. */
const PAPER_CSS = `
:root { --navy:#243B53; --azul:#2F6B8A; --azul-c:#E6F0F5; --ambar:#A85D00; --ambar-c:#FDF3E6;
  --verm:#B42318; --verm-c:#FDECEA; --verde:#237A57; --verde-c:#E8F4EE; --tinta:#202A35; --slate:#596579;
  --linha:#CBD2DA; --sup:#F4F6F8; --mt:#FFE45C; }
* { box-sizing: border-box; }
html, body { overflow-x: hidden; } body, p, li, td { overflow-wrap: anywhere; }
table { display: block; overflow-x: auto; }
html { background: ${PAPER_DESK}; }
body { margin: 24px auto; max-width: 820px; background: #fff; color: var(--tinta); padding: 48px 56px 64px;
  font: 15px/1.65 "Segoe UI", system-ui, sans-serif; box-shadow: 0 2px 4px rgb(0 0 0/.06), 0 12px 32px -12px rgb(0 0 0/.25); border-radius: 6px; }
@media (max-width: 760px) { body { margin: 0; padding: 24px 20px; border-radius: 0; } }
h1, h2, h3 { color: var(--navy); line-height: 1.25; font-weight: 750; letter-spacing: -.01em; }
h1 { font-size: 1.9em; margin: 0 0 .6em; padding-bottom: .3em; border-bottom: 3px solid var(--navy); }
h2 { font-size: 1.35em; margin: 1.8em 0 .6em; padding-left: .55em; border-left: 4px solid var(--azul); }
h3 { font-size: 1.08em; margin: 1.4em 0 .4em; }
strong { color: var(--navy); }
p strong, li strong { background: linear-gradient(transparent 58%, var(--mt) 58%); }
a { color: var(--azul); }
ul, ol { padding-left: 1.4em; } li { margin: .2em 0; }
hr { border: 0; border-top: 2px dashed var(--linha); margin: 2.4em 0; }
code { background: var(--sup); padding: .1em .35em; border-radius: 4px; font-size: .92em; }
table { width: 100%; border-collapse: collapse; margin: 1em 0; font-size: .94em; }
th { background: var(--navy); color: #fff; text-align: left; padding: .5em .7em; }
td { border-bottom: 1px solid var(--linha); padding: .5em .7em; vertical-align: top; }
tr:nth-child(even) td { background: var(--sup); }
blockquote { margin: 1.1em 0; padding: .8em 1em .8em 1.1em; border-left: 4px solid var(--slate); background: var(--sup); border-radius: 0 6px 6px 0; }
blockquote p { margin: .2em 0; }
blockquote.importante { border-color: var(--navy); background: var(--azul-c); }
blockquote.dica { border-color: var(--verde); background: var(--verde-c); }
blockquote.dica strong:first-child { color: var(--verde); }
blockquote.pegadinha { border-color: var(--verm); background: var(--verm-c); }
blockquote.pegadinha strong:first-child { color: var(--verm); }
blockquote.excecao { border-color: var(--ambar); background: var(--ambar-c); }
blockquote.excecao strong:first-child { color: var(--ambar); }
blockquote strong:first-child { background: none; letter-spacing: .04em; font-size: .85em; }
footer { margin-top: 3em; font-size: .8em; color: var(--slate); border-top: 1px solid var(--linha); padding-top: .8em; }
@media print { html { background: #fff; } body { box-shadow: none; margin: 0; max-width: none; } }
`;

const CALLOUTS: Record<string, string> = {
  IMPORTANTE: "importante",
  DICA: "dica",
  PEGADINHA: "pegadinha",
  "EXCEÇÃO": "excecao",
  EXCECAO: "excecao",
};

/** Dá classe às citações que começam com rótulo (`> **DICA:** ...`). */
function tagCallouts(html: string): string {
  return html.replace(/<blockquote>\s*<p><strong>([^<:]+):?<\/strong>/g, (all, label: string) => {
    const cls = CALLOUTS[label.trim().replace(/:$/, "").toUpperCase()];
    return cls ? all.replace("<blockquote>", `<blockquote class="${cls}">`) : all;
  });
}

/** Documento completo para o `srcdoc` do iframe (sandbox sem scripts). */
export function paperDocument(markdown: string, title: string): string {
  const body = tagCallouts(marked.parse(markdown, { async: false, gfm: true }));
  const esc = title.replace(/[<>&"]/g, (c) => `&#${c.charCodeAt(0)};`);
  return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>${esc}</title><style>${PAPER_CSS}</style></head>
<body>${body}<footer>Material gerado pelo Grifo (design editorial da Grifo-Skill, CC BY 4.0). Confira prazos e números na fonte oficial.</footer></body></html>`;
}

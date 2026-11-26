import { openLink } from "@/components/ExternalLink";
import { getVersion } from "@tauri-apps/api/app";
import { warn } from "@/lib/utils";

const REPO = "https://github.com/asguth/grifo-quest";

export type ReportKind = "bug" | "ideia";

/**
 * Link para uma issue já preenchida (formulário de `.github/ISSUE_TEMPLATE`, campos pelo `id`).
 * Não manda nada sozinho: abre o GitHub no navegador e a pessoa revisa e envia. Assim o app não
 * carrega token nenhum e nada sai do PC sem a pessoa ver.
 */
export function issueUrl(kind: ReportKind, fields: { title?: string; version: string; system: string; where?: string; error?: string }): string {
  const q = new URLSearchParams({ template: kind === "bug" ? "bug.yml" : "ideia.yml" });
  if (fields.title) q.set("title", fields.title);
  q.set("versao", fields.version);
  if (kind === "bug") {
    q.set("sistema", fields.system);
    if (fields.where) q.set("tela", fields.where);
    // URL longa demais o GitHub recusa: a mensagem vai cortada
    if (fields.error) q.set("erro", fields.error.slice(0, 1500));
  }
  return `${REPO}/issues/new?${q.toString()}`;
}

export function systemName(): string {
  const m = navigator.userAgent.match(/Windows NT [\d.]+/);
  return m ? m[0].replace("Windows NT 10.0", "Windows 10/11") : navigator.platform;
}

/** Abre o formulário de issue no navegador. */
export async function reportIssue(kind: ReportKind, extra: { title?: string; where?: string; error?: string } = {}) {
  let version = "?";
  try {
    version = await getVersion();
  } catch (e) {
    warn("versão do app", e);
  }
  await openLink(issueUrl(kind, { ...extra, version, system: systemName() }));
}

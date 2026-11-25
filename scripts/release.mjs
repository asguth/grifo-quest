// Publica uma versão: `node scripts/release.mjs 0.4.0 ["notas"] [--build-only | --publish-only]`.
//
// Um instalador só para todos (a comunidade é liberada pela conta com assinatura, não por outro setup).
// 1) põe a versão em tauri.conf.json, package.json e nos Cargo.toml;
// 2) gera o instalador NSIS assinado para o updater (chave em ~/.tauri/grifo-quest.key, fora do repo) com
//    a nuvem configurada (src-tauri/cloud.env, fora do repo: sem ele o build oficial não sai);
// 3) monta o latest.json que o app consulta e cria a Release no GitHub com os dois arquivos.
// --build-only para antes do GitHub; --publish-only só publica o que já está em target/release/publish
// (o build roda no terminal real; o gh pode estar logado só em outro ambiente).
// Precisa: commit já enviado (a tag aponta para o HEAD remoto) e nenhum grifo-quest-mcp.exe rodando de
// target/release (o Claude conectado ao MCP trava o build).

import { execFileSync } from "node:child_process";
import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

const REPO = "asguth/grifo-quest";
const KEY = join(homedir(), ".tauri", "grifo-quest.key");

const args = process.argv.slice(2);
const flags = new Set(args.filter((a) => a.startsWith("--")));
const [version, notes = `Grifo Quest ${args[0]}`] = args.filter((a) => !a.startsWith("--"));
const buildOnly = flags.has("--build-only");
const publishOnly = flags.has("--publish-only");

if (!/^\d+\.\d+\.\d+$/.test(version ?? "")) {
  console.error('uso: node scripts/release.mjs X.Y.Z ["notas"] [--build-only | --publish-only]');
  process.exit(1);
}

// pnpm no Windows é um .cmd e precisa do shell; o gh é .exe e vai sem shell (título com espaço).
const run = (cmd, cmdArgs, env = {}, shell = false) => execFileSync(cmd, cmdArgs, { stdio: "inherit", shell, env: { ...process.env, ...env } });

const outDir = join("target", "release", "publish");
// Nome sem espaço: é o que vai na URL da Release.
const asset = `Grifo-Quest_${version}_x64-setup.exe`;

function setJsonVersion(path) {
  const json = JSON.parse(readFileSync(path, "utf8"));
  json.version = version;
  writeFileSync(path, JSON.stringify(json, null, 2) + "\n");
}

function setCargoVersion(path) {
  writeFileSync(path, readFileSync(path, "utf8").replace(/^version = ".*"$/m, `version = "${version}"`));
}

function build() {
  if (!existsSync(KEY)) {
    console.error(`chave de assinatura não encontrada em ${KEY}`);
    process.exit(1);
  }
  if (!existsSync(join("src-tauri", "cloud.env"))) {
    console.error("o build oficial precisa de src-tauri/cloud.env (veja cloud.env.example)");
    process.exit(1);
  }
  setJsonVersion("src-tauri/tauri.conf.json");
  setJsonVersion("package.json");
  setCargoVersion("src-tauri/Cargo.toml");
  setCargoVersion("mcp-server/Cargo.toml");
  run("pnpm", ["tauri", "build", "--bundles", "nsis"], { TAURI_SIGNING_PRIVATE_KEY: readFileSync(KEY, "utf8"), TAURI_SIGNING_PRIVATE_KEY_PASSWORD: "" }, process.platform === "win32");
  const built = join("target", "release", "bundle", "nsis", `Grifo Quest_${version}_x64-setup.exe`);
  copyFileSync(built, join(outDir, asset));
  copyFileSync(`${built}.sig`, join(outDir, `${asset}.sig`));
}

function publish() {
  const latest = {
    version,
    notes,
    pub_date: new Date().toISOString(),
    platforms: {
      "windows-x86_64": {
        signature: readFileSync(join(outDir, `${asset}.sig`), "utf8").trim(),
        url: `https://github.com/${REPO}/releases/download/v${version}/${asset}`,
      },
    },
  };
  const manifest = join(outDir, "latest.json");
  writeFileSync(manifest, JSON.stringify(latest, null, 2) + "\n");
  run("gh", ["release", "create", `v${version}`, join(outDir, asset), manifest, "--repo", REPO, "--title", `Grifo Quest ${version}`, "--notes", notes, "--latest"]);
  console.log(`Release v${version} publicada.`);
}

mkdirSync(outDir, { recursive: true });
if (!publishOnly) build();
if (!buildOnly) publish();

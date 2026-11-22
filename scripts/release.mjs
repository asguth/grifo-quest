// Publica uma versão: `node scripts/release.mjs 0.2.0 ["notas"]`.
// 1) põe a versão em tauri.conf.json, package.json e nos Cargo.toml;
// 2) gera o instalador NSIS assinado para o updater (chave em ~/.tauri/grifo-quest.key, fora do repo);
// 3) monta o latest.json que o app consulta e cria a Release no GitHub com os dois arquivos.
// Precisa: gh autenticado, commit já enviado (a tag aponta para o HEAD remoto).

import { execFileSync } from "node:child_process";
import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

const REPO = "asguth/grifo-quest";
const KEY = join(homedir(), ".tauri", "grifo-quest.key");

const [version, notes = `Grifo Quest ${process.argv[2]}`] = process.argv.slice(2);
if (!/^\d+\.\d+\.\d+$/.test(version ?? "")) {
  console.error("uso: node scripts/release.mjs X.Y.Z [notas]");
  process.exit(1);
}
if (!existsSync(KEY)) {
  console.error(`chave de assinatura não encontrada em ${KEY}`);
  process.exit(1);
}

const run = (cmd, args, env = {}) =>
  execFileSync(cmd, args, { stdio: "inherit", shell: process.platform === "win32", env: { ...process.env, ...env } });

function setJsonVersion(path) {
  const json = JSON.parse(readFileSync(path, "utf8"));
  json.version = version;
  writeFileSync(path, JSON.stringify(json, null, 2) + "\n");
}

function setCargoVersion(path) {
  const toml = readFileSync(path, "utf8").replace(/^version = ".*"$/m, `version = "${version}"`);
  writeFileSync(path, toml);
}

setJsonVersion("src-tauri/tauri.conf.json");
setJsonVersion("package.json");
setCargoVersion("src-tauri/Cargo.toml");
setCargoVersion("mcp-server/Cargo.toml");

run("pnpm", ["tauri", "build", "--bundles", "nsis"], {
  TAURI_SIGNING_PRIVATE_KEY: readFileSync(KEY, "utf8"),
  TAURI_SIGNING_PRIVATE_KEY_PASSWORD: "",
});

const bundle = join("target", "release", "bundle", "nsis");
const built = join(bundle, `Grifo Quest_${version}_x64-setup.exe`);
// Nome sem espaço: é o que vai na URL da Release.
const asset = `Grifo-Quest_${version}_x64-setup.exe`;
const outDir = join("target", "release", "publish");
mkdirSync(outDir, { recursive: true });
copyFileSync(built, join(outDir, asset));

const latest = {
  version,
  notes,
  pub_date: new Date().toISOString(),
  platforms: {
    "windows-x86_64": {
      signature: readFileSync(`${built}.sig`, "utf8").trim(),
      url: `https://github.com/${REPO}/releases/download/v${version}/${asset}`,
    },
  },
};
writeFileSync(join(outDir, "latest.json"), JSON.stringify(latest, null, 2) + "\n");

run("gh", [
  "release", "create", `v${version}`,
  join(outDir, asset), join(outDir, "latest.json"),
  "--repo", REPO, "--title", `Grifo Quest ${version}`, "--notes", JSON.stringify(notes), "--latest",
]);
console.log(`Release v${version} publicada.`);

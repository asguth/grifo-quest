// Compila o servidor MCP e coloca onde o Tauri procura binários extras (externalBin):
// src-tauri/binaries/grifo-quest-mcp-<arquitetura>.exe. Roda antes do `tauri dev` e do `tauri build`.
import { execFileSync } from "node:child_process";
import { copyFileSync, mkdirSync } from "node:fs";
import { isAbsolute, join } from "node:path";

const root = join(import.meta.dirname, "..");
const run = (cmd, args) => execFileSync(cmd, args, { cwd: root, stdio: ["ignore", "pipe", "inherit"] }).toString();

const triple = run("rustc", ["-vV"]).match(/^host: (.+)$/m)?.[1];
if (!triple) throw new Error("não consegui descobrir a arquitetura pelo rustc -vV");
const ext = process.platform === "win32" ? ".exe" : "";

execFileSync("cargo", ["build", "-p", "grifo-quest-mcp", "--release"], { cwd: root, stdio: "inherit" });
mkdirSync(join(root, "src-tauri", "binaries"), { recursive: true });
const dir = process.env.CARGO_TARGET_DIR;
const target = dir ? (isAbsolute(dir) ? dir : join(root, dir)) : join(root, "target");
copyFileSync(join(target, "release", `grifo-quest-mcp${ext}`), join(root, "src-tauri", "binaries", `grifo-quest-mcp-${triple}${ext}`));
console.log(`servidor MCP pronto (${triple})`);

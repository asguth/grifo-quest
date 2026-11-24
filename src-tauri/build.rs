fn main() {
    placeholder_sidecar();
    tauri_build::build()
}

/// O tauri-build exige o binário do MCP (`externalBin`) até para `cargo test`/`clippy`. Num checkout
/// novo ele ainda não existe: em build de debug cria um arquivo vazio no lugar, para os testes rodarem
/// sem `node scripts/sidecar.mjs`. `tauri dev`/`tauri build` rodam o sidecar.mjs antes e sobrescrevem
/// com o binário de verdade; em release o placeholder nunca é criado.
fn placeholder_sidecar() {
    if std::env::var("PROFILE").as_deref() != Ok("debug") {
        return;
    }
    let Ok(target) = std::env::var("TARGET") else { return };
    let ext = if target.contains("windows") { ".exe" } else { "" };
    let path = std::path::Path::new("binaries").join(format!("grifo-quest-mcp-{target}{ext}"));
    if !path.exists() {
        let _ = std::fs::create_dir_all("binaries");
        let _ = std::fs::write(&path, b"");
        println!("cargo:warning=binário do MCP ausente: placeholder vazio em {} (rode `node scripts/sidecar.mjs` para o real)", path.display());
    }
}

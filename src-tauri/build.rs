fn main() {
    placeholder_sidecar();
    cloud_env();
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

/// Endereço e chave do Supabase da versão Cloud: lidos de `src-tauri/cloud.env` (fora do git) ou do
/// ambiente (CI), nunca escritos no código. Sem eles o app compila como a versão base.
fn cloud_env() {
    println!("cargo:rerun-if-changed=cloud.env");
    println!("cargo:rerun-if-env-changed=GRIFO_SUPABASE_URL");
    println!("cargo:rerun-if-env-changed=GRIFO_SUPABASE_KEY");
    let Ok(text) = std::fs::read_to_string("cloud.env") else { return };
    for line in text.lines() {
        let Some((k, v)) = line.split_once('=') else { continue };
        let (k, v) = (k.trim(), v.trim());
        if (k == "GRIFO_SUPABASE_URL" || k == "GRIFO_SUPABASE_KEY") && std::env::var(k).is_err() {
            println!("cargo:rustc-env={k}={v}");
        }
    }
}

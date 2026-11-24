//! Detecta a placa de vídeo uma vez por execução: decide se a IA local (Ollama) é oferecida e qual
//! modelo cabe. Sem placa dedicada o app não fala de IA local e tudo vai para o Claude.

use std::time::Duration;

use serde::{Deserialize, Serialize};
use tokio::sync::OnceCell;

use crate::domain::gpu::{self, Gpu};
use crate::sys::hidden_command;

/// O que a tela precisa saber da placa.
#[derive(Debug, Clone, Serialize, Deserialize, specta::Type)]
pub struct GpuInfo {
    /// Nome da placa com mais memória, se achou alguma.
    pub name: Option<String>,
    /// Memória de vídeo dedicada em MB (0 = não achou).
    pub vram_mb: i32,
    /// Dá para rodar IA local (placa com ≥ 3,5 GB).
    pub local_ai: bool,
    /// Modelo do Ollama que cabe, e o tamanho do download.
    pub model: Option<String>,
    pub model_size: Option<String>,
    /// Catálogo para o seletor de Config → IA, com o que cabe nesta placa.
    pub options: Vec<ModelOption>,
}

#[derive(Debug, Clone, Serialize, Deserialize, specta::Type)]
pub struct ModelOption {
    pub name: String,
    /// Download em Q4 ("8,0 GB").
    pub size: String,
    /// Cabe na VRAM desta placa com folga para o contexto.
    pub fits: bool,
}

impl GpuInfo {
    fn of(g: Option<Gpu>) -> Self {
        let vram_mb = g.as_ref().map_or(0, |g| g.vram_mb);
        let pick = gpu::model_for(vram_mb);
        Self {
            name: g.map(|g| g.name),
            vram_mb,
            local_ai: pick.is_some(),
            model: pick.map(|p| p.0.to_string()),
            model_size: pick.map(|p| p.1.to_string()),
            options: gpu::CATALOG
                .iter()
                .map(|&(name, size, need)| ModelOption { name: name.into(), size: size.into(), fits: vram_mb >= need })
                .collect(),
        }
    }
}

async fn output(cmd: &mut tokio::process::Command) -> Option<String> {
    let out = tokio::time::timeout(Duration::from_secs(10), cmd.output()).await.ok()?.ok()?;
    out.status.success().then(|| String::from_utf8_lossy(&out.stdout).into_owned())
}

/// NVIDIA pelo `nvidia-smi` (vem com o driver); as outras pelo registro do Windows.
async fn detect() -> Option<Gpu> {
    let nvidia = output(hidden_command("nvidia-smi").args(["--query-gpu=name,memory.total", "--format=csv,noheader,nounits"])).await;
    if let Some(g) = nvidia.map(|o| gpu::parse_nvidia_smi(&o)).and_then(gpu::best) {
        return Some(g);
    }
    let script = r"Get-ItemProperty 'HKLM:\SYSTEM\ControlSet001\Control\Class\{4d36e968-e325-11ce-bfc1-08002be10318}\0*' -ErrorAction SilentlyContinue | Select-Object DriverDesc,'HardwareInformation.qwMemorySize' | ConvertTo-Json -Compress";
    let reg = output(hidden_command("powershell").args(["-NoProfile", "-NonInteractive", "-Command", script])).await?;
    gpu::best(gpu::parse_registry(&reg))
}

/// Placa detectada (calculada na 1ª chamada; trocar de placa exige reabrir o app).
pub async fn info() -> GpuInfo {
    static CACHE: OnceCell<GpuInfo> = OnceCell::const_new();
    CACHE.get_or_init(|| async { GpuInfo::of(detect().await) }).await.clone()
}

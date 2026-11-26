//! Voz na sala de aula: grava o microfone (cpal), transcreve no PC com o whisper.cpp oficial
//! (`whisper-cli.exe`, baixado em Configurações → Integrações) e devolve o texto para você revisar.
//! Roda na CPU: a placa de vídeo fica livre para o modelo do Ollama.

use std::path::{Path, PathBuf};
use std::sync::mpsc;
use std::sync::{Arc, Mutex};
use std::time::Duration;

use cpal::traits::{DeviceTrait, HostTrait, StreamTrait};
use futures_util::StreamExt;
use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Manager, State};
use tauri_specta::Event;
use tokio::io::AsyncWriteExt;

use crate::domain::audio;
use crate::error::{AppError, AppResult};
use crate::sys::{self, progress};

/// Fala mais longa que isso é cortada (explicação vai em blocos).
const MAX_SECONDS: u32 = 120;
/// Os binários do Windows saem nas builds "bNNNN" (nem toda versão "v" traz arquivos):
/// pegamos a release mais recente que tem este pacote.
const RELEASES_API: &str = "https://api.github.com/repos/ggml-org/whisper.cpp/releases?per_page=20";
const WHISPER_ASSET: &str = "whisper-bin-x64.zip";
/// Modelo "small" quantizado: bom em português, ~180 MB, rápido na CPU.
const MODEL_URL: &str = "https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-small-q5_1.bin";
const MODEL_FILE: &str = "ggml-small-q5_1.bin";

type Recorded = Result<(Vec<f32>, u32, u16), String>;

struct Recording {
    stop: mpsc::Sender<()>,
    done: std::thread::JoinHandle<Recorded>,
}

#[derive(Default)]
pub struct VoiceState(Mutex<Option<Recording>>);

/// Volume do microfone (~15 por segundo) para a onda animada.
#[derive(Debug, Clone, Serialize, Deserialize, specta::Type, tauri_specta::Event)]
pub struct VoiceLevel(pub f32);

fn dir(app: &AppHandle) -> AppResult<PathBuf> {
    Ok(app.path().app_data_dir()?.join("voice"))
}

/// `whisper-cli.exe` em qualquer subpasta (o zip muda de layout entre versões).
fn find_exe(root: &Path) -> Option<PathBuf> {
    let mut stack = vec![root.to_path_buf()];
    while let Some(d) = stack.pop() {
        for e in std::fs::read_dir(&d).ok()?.flatten() {
            let p = e.path();
            if p.is_dir() {
                stack.push(p);
            } else if p.file_name().is_some_and(|n| n.eq_ignore_ascii_case("whisper-cli.exe")) {
                return Some(p);
            }
        }
    }
    None
}

pub fn installed(app: &AppHandle) -> bool {
    dir(app).is_ok_and(|d| d.join(MODEL_FILE).exists() && find_exe(&d).is_some())
}

/// Thread dona do stream do microfone (o stream do cpal não pode trocar de thread).
fn record(app: AppHandle, stop: mpsc::Receiver<()>) -> Recorded {
    let device = cpal::default_host().default_input_device().ok_or("Nenhum microfone encontrado")?;
    let supported = device.default_input_config().map_err(|e| format!("Microfone indisponível: {e}"))?;
    let (rate, channels, format) = (supported.sample_rate(), supported.channels(), supported.sample_format());
    let buf = Arc::new(Mutex::new(Vec::<f32>::new()));
    let err = |e| eprintln!("microfone: {e}");
    let sink = buf.clone();
    let push = move |data: &mut dyn Iterator<Item = f32>| {
        if let Ok(mut b) = sink.lock() {
            b.extend(data);
        }
    };
    let stream = match format {
        cpal::SampleFormat::F32 => {
            device.build_input_stream(supported.config(), move |d: &[f32], _: &_| push(&mut d.iter().copied()), err, None)
        }
        cpal::SampleFormat::I16 => {
            device.build_input_stream(supported.config(), move |d: &[i16], _: &_| push(&mut d.iter().map(|s| f32::from(*s) / 32768.0)), err, None)
        }
        cpal::SampleFormat::U16 => {
            device.build_input_stream(supported.config(), move |d: &[u16], _: &_| push(&mut d.iter().map(|s| (f32::from(*s) - 32768.0) / 32768.0)), err, None)
        }
        other => return Err(format!("Formato de áudio não suportado: {other:?}")),
    }
    .map_err(|e| format!("Não consegui abrir o microfone: {e}"))?;
    stream.play().map_err(|e| format!("Não consegui gravar: {e}"))?;

    let max = (rate * u32::from(channels) * MAX_SECONDS) as usize;
    let mut seen = 0;
    // Sai quando pedirem para parar (ou a sessão sumir); a cada ~66 ms manda o volume.
    while let Err(mpsc::RecvTimeoutError::Timeout) = stop.recv_timeout(Duration::from_millis(66)) {
        let (level, len) = {
            let b = buf.lock().map_err(|_| "buffer do microfone corrompido")?;
            (audio::rms(&b[seen.min(b.len())..]), b.len())
        };
        seen = len;
        let _ = VoiceLevel((level * 4.0).min(1.0)).emit(&app);
        if len >= max {
            break;
        }
    }
    drop(stream);
    let samples = std::mem::take(&mut *buf.lock().map_err(|_| "buffer do microfone corrompido")?);
    Ok((samples, rate, channels))
}

#[tauri::command]
#[specta::specta]
pub fn voice_start(app: AppHandle, state: State<'_, VoiceState>) -> AppResult<()> {
    if !installed(&app) {
        return Err(AppError::Invalid("Instale a voz em Configurações → Integrações (um clique)".into()));
    }
    let mut cur = state.0.lock().map_err(|_| AppError::Invalid("estado da voz corrompido".into()))?;
    if cur.is_some() {
        return Ok(());
    }
    let (tx, rx) = mpsc::channel();
    let done = std::thread::spawn(move || record(app, rx));
    *cur = Some(Recording { stop: tx, done });
    Ok(())
}

fn take(state: &VoiceState) -> AppResult<Option<Recording>> {
    Ok(state.0.lock().map_err(|_| AppError::Invalid("estado da voz corrompido".into()))?.take())
}

/// Para de gravar e transcreve. Devolve o texto (vazio se não entendeu nada).
#[tauri::command]
#[specta::specta]
pub async fn voice_stop(app: AppHandle, state: State<'_, VoiceState>) -> AppResult<String> {
    let Some(rec) = take(&state)? else { return Ok(String::new()) };
    let _ = rec.stop.send(());
    let (samples, rate, channels) = tauri::async_runtime::spawn_blocking(move || rec.done.join())
        .await
        .map_err(|e| AppError::Invalid(e.to_string()))?
        .map_err(|_| AppError::Invalid("A gravação travou".into()))?
        .map_err(AppError::Invalid)?;
    let mono = audio::resample(&audio::to_mono(&samples, channels), rate, audio::WHISPER_RATE);
    if mono.len() < (audio::WHISPER_RATE / 2) as usize {
        return Ok(String::new()); // menos de meio segundo: clique sem querer
    }

    let d = dir(&app)?;
    let wav = d.join("fala.wav");
    std::fs::write(&wav, audio::wav(&mono, audio::WHISPER_RATE))?;
    let exe = find_exe(&d).ok_or_else(|| AppError::Invalid("whisper-cli.exe sumiu: reinstale a voz".into()))?;
    let threads = std::thread::available_parallelism().map_or(4, |n| n.get().min(8)).to_string();
    let mut cmd = sys::hidden_command(exe);
    cmd.arg("-m").arg(d.join(MODEL_FILE)).arg("-f").arg(&wav).args(["-l", "pt", "-nt", "-np", "-t", &threads]);
    let out = tokio::time::timeout(Duration::from_secs(120), cmd.output())
        .await
        .map_err(|_| AppError::Invalid("A transcrição demorou demais".into()))??;
    if !out.status.success() {
        return Err(AppError::Invalid(format!("whisper falhou: {}", String::from_utf8_lossy(&out.stderr).lines().last().unwrap_or(""))));
    }
    Ok(audio::clean_transcript(&String::from_utf8_lossy(&out.stdout)))
}

/// Baixa um arquivo grande mostrando o progresso (eventos `target`).
pub(crate) async fn download(app: &AppHandle, target: &str, url: &str, to: &Path, label: &str) -> AppResult<()> {
    let res = sys::http()
        .get(url)
        .send()
        .await
        .map_err(|e| AppError::Invalid(format!("Falha ao baixar {label}: {e}")))?;
    if !res.status().is_success() {
        return Err(AppError::Invalid(format!("Falha ao baixar {label}: HTTP {}", res.status())));
    }
    let total = res.content_length();
    let tmp = to.with_extension("part");
    let mut file = tokio::fs::File::create(&tmp).await?;
    let mut got: u64 = 0;
    let mut last_pct = -1i64;
    let mut stream = res.bytes_stream();
    while let Some(chunk) = stream.next().await {
        let chunk = chunk.map_err(|e| AppError::Invalid(format!("Download interrompido: {e}")))?;
        file.write_all(&chunk).await?;
        got += chunk.len() as u64;
        let frac = total.map(|t| got as f64 / t.max(1) as f64);
        let pct = frac.map_or(-1, |f| (f * 100.0) as i64);
        if pct != last_pct {
            last_pct = pct;
            let mb = got / 1_048_576;
            progress(app, target, format!("Baixando {label}: {mb} MB"), frac);
        }
    }
    file.flush().await?;
    drop(file);
    tokio::fs::rename(&tmp, to).await?;
    Ok(())
}

#[derive(Deserialize)]
struct Release {
    assets: Vec<Asset>,
}

#[derive(Deserialize)]
struct Asset {
    name: String,
    browser_download_url: String,
}

/// Link do pacote do Windows na release mais recente que o tem.
async fn whisper_zip_url() -> AppResult<String> {
    let releases: Vec<Release> = sys::http()
        .get(RELEASES_API)
        .send()
        .await
        .map_err(|e| AppError::Invalid(format!("GitHub não respondeu: {e}")))?
        .json()
        .await
        .map_err(|e| AppError::Invalid(format!("Lista de versões do whisper.cpp inválida: {e}")))?;
    releases
        .into_iter()
        .flat_map(|r| r.assets)
        .find(|a| a.name == WHISPER_ASSET)
        .map(|a| a.browser_download_url)
        .ok_or_else(|| AppError::Invalid("Não achei o pacote do whisper.cpp para Windows".into()))
}

/// Um clique: baixa o whisper.cpp oficial (zip) e o modelo em português.
#[tauri::command]
#[specta::specta]
pub async fn install_voice(app: AppHandle) -> AppResult<()> {
    let d = dir(&app)?;
    std::fs::create_dir_all(&d)?;
    if find_exe(&d).is_none() {
        let zip = d.join("whisper.zip");
        download(&app, "voice", &whisper_zip_url().await?, &zip, "whisper.cpp").await?;
        progress(&app, "voice", "Descompactando…", None);
        let mut unzip = sys::hidden_command("powershell");
        unzip.args(["-NoProfile", "-Command", "Expand-Archive", "-Force", "-LiteralPath"]).arg(&zip).arg("-DestinationPath").arg(d.join("bin"));
        let st = unzip.status().await?;
        if let Err(e) = std::fs::remove_file(&zip) {
            eprintln!("voz: não apaguei {}: {e}", zip.display());
        }
        if !st.success() || find_exe(&d).is_none() {
            return Err(AppError::Invalid("O pacote do whisper.cpp veio sem o whisper-cli.exe".into()));
        }
    }
    if !d.join(MODEL_FILE).exists() {
        download(&app, "voice", MODEL_URL, &d.join(MODEL_FILE), "modelo de voz").await?;
    }
    Ok(())
}

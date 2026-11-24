//! Placa de vídeo → modelo local que cabe. Leitura das saídas do sistema (nvidia-smi e registro do
//! Windows) e a tabela de modelos por VRAM. A chamada aos programas fica em `crate::gpu`.

/// Abaixo disso não vale ligar IA local: integrada (memória compartilhada) ou placa muito pequena.
pub const MIN_VRAM_MB: i32 = 3_500;

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Gpu {
    pub name: String,
    pub vram_mb: i32,
}

/// Modelos do Ollama que o app oferece (tamanho do download em Q4, conferido em ollama.com/library
/// em nov/2026). Geração 2026: Qwen 3.5 e Gemma 4, multilíngues (português incluído), 256K de
/// contexto. `vram_mb` = pesos + ~1,5 GB para o contexto das tarefas.
pub const CATALOG: [(&str, &str, i32); 9] = [
    // (modelo, download, VRAM mínima em MB)
    ("qwen3.5:4b", "3,3 GB", 3_500),
    ("gemma4:e4b", "6,6 GB", 7_500),
    ("qwen3.5:9b", "6,6 GB", 7_500),
    ("gemma4:12b", "8,0 GB", 9_500),
    ("gpt-oss:20b", "14 GB", 15_500),
    ("qwen3.5:27b", "17 GB", 18_500),
    ("gemma4:26b", "18 GB", 19_500),
    ("gemma4:31b", "20 GB", 21_500),
    ("qwen3.5:35b", "22 GB", 23_500),
];

/// Sugestão por faixa de VRAM (a melhor que cabe com folga), da maior para a menor.
const TIERS: [(i32, &str); 5] = [
    // 32 GB: denso de 31B, o mais forte que cabe com contexto folgado
    (30_000, "gemma4:31b"),
    // 24 GB: 27B denso
    (22_000, "qwen3.5:27b"),
    // 12–16 GB: Gemma 4 12B (forte em português, 8 GB)
    (11_000, "gemma4:12b"),
    // 8 GB: 9B
    (7_500, "qwen3.5:9b"),
    // 4–6 GB: 4B
    (MIN_VRAM_MB, "qwen3.5:4b"),
];

/// Modelo sugerido para a VRAM e o tamanho do download, ou `None` sem placa que aguente IA local.
pub fn model_for(vram_mb: i32) -> Option<(&'static str, &'static str)> {
    let model = TIERS.iter().find(|(min, _)| vram_mb >= *min)?.1;
    CATALOG.iter().find(|(m, ..)| *m == model).map(|&(m, size, _)| (m, size))
}

/// Integrada (usa a RAM do sistema): algumas reservam 4 GB na BIOS e enganariam a contagem de VRAM.
pub fn is_integrated(name: &str) -> bool {
    let n = name.to_lowercase();
    ["uhd graphics", "iris", "intel(r) hd graphics", "radeon(tm) graphics", "radeon graphics", "vega 8", "basic display", "virtual"]
        .iter()
        .any(|k| n.contains(k))
}

/// A placa dedicada com mais VRAM (notebooks têm a integrada + a dedicada).
pub fn best(gpus: Vec<Gpu>) -> Option<Gpu> {
    gpus.into_iter().filter(|g| !is_integrated(&g.name)).max_by_key(|g| g.vram_mb)
}

/// `nvidia-smi --query-gpu=name,memory.total --format=csv,noheader,nounits` (MiB).
pub fn parse_nvidia_smi(out: &str) -> Vec<Gpu> {
    out.lines()
        .filter_map(|line| {
            let (name, mem) = line.rsplit_once(',')?;
            let vram_mb = mem.trim().parse::<f64>().ok()? as i32;
            Some(Gpu { name: name.trim().to_string(), vram_mb })
        })
        .collect()
}

/// Saída de `Get-ItemProperty ...\Class\{4d36e968-…}\0*` em JSON (objeto ou lista), com
/// `DriverDesc` e `HardwareInformation.qwMemorySize` (bytes, 64 bits: o `AdapterRAM` do WMI
/// para em 4 GB). Placas sem o valor ficam de fora.
pub fn parse_registry(json: &str) -> Vec<Gpu> {
    let Ok(v) = serde_json::from_str::<serde_json::Value>(json) else { return Vec::new() };
    let items = match v {
        serde_json::Value::Array(a) => a,
        other => vec![other],
    };
    items
        .iter()
        .filter_map(|i| {
            let name = i.get("DriverDesc")?.as_str()?.trim().to_string();
            let bytes = i.get("HardwareInformation.qwMemorySize")?.as_u64()?;
            Some(Gpu { name, vram_mb: (bytes / (1024 * 1024)) as i32 })
        })
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn model_fits_each_vram_tier() {
        assert_eq!(model_for(2_048), None);
        assert_eq!(model_for(4_096).map(|m| m.0), Some("qwen3.5:4b"));
        assert_eq!(model_for(6_144).map(|m| m.0), Some("qwen3.5:4b"));
        assert_eq!(model_for(8_192).map(|m| m.0), Some("qwen3.5:9b"));
        assert_eq!(model_for(12_288).map(|m| m.0), Some("gemma4:12b"));
        assert_eq!(model_for(16_384).map(|m| m.0), Some("gemma4:12b"));
        assert_eq!(model_for(24_576).map(|m| m.0), Some("qwen3.5:27b"));
        assert_eq!(model_for(32_768).map(|m| m.0), Some("gemma4:31b"));
    }

    #[test]
    fn every_suggestion_is_in_the_catalog_and_fits() {
        for (min, model) in TIERS {
            let (_, _, need) = CATALOG.iter().find(|(m, ..)| *m == model).expect("sugestão fora do catálogo");
            assert!(*need <= min, "{model} não cabe em {min} MB");
        }
    }

    #[test]
    fn reads_nvidia_smi() {
        let gpus = parse_nvidia_smi("NVIDIA GeForce RTX 3060, 12288\r\n");
        assert_eq!(gpus, vec![Gpu { name: "NVIDIA GeForce RTX 3060".into(), vram_mb: 12_288 }]);
        assert!(parse_nvidia_smi("").is_empty());
    }

    #[test]
    fn reads_registry_object_or_list_and_skips_missing_size() {
        let one = r#"{"DriverDesc":"AMD Radeon RX 6600","HardwareInformation.qwMemorySize":8573157376}"#;
        assert_eq!(parse_registry(one), vec![Gpu { name: "AMD Radeon RX 6600".into(), vram_mb: 8_176 }]);
        let list = r#"[{"DriverDesc":"Intel(R) UHD Graphics","HardwareInformation.qwMemorySize":134217728},{"DriverDesc":"Microsoft Basic Display Adapter"}]"#;
        assert_eq!(parse_registry(list).len(), 1);
        assert!(parse_registry("lixo").is_empty());
    }

    #[test]
    fn picks_the_dedicated_card_on_laptops() {
        let gpus = vec![Gpu { name: "Intel(R) UHD Graphics".into(), vram_mb: 128 }, Gpu { name: "RTX 4060 Laptop".into(), vram_mb: 8_188 }];
        assert_eq!(best(gpus).map(|g| g.vram_mb), Some(8_188));
    }

    #[test]
    fn integrated_graphics_never_count() {
        // APU com 4 GB reservados na BIOS: não é placa de vídeo para IA local
        assert_eq!(best(vec![Gpu { name: "AMD Radeon(TM) Graphics".into(), vram_mb: 4_096 }]), None);
        assert!(!is_integrated("Intel(R) Arc(TM) A770 Graphics"));
        assert!(!is_integrated("AMD Radeon RX 7900 XTX"));
    }
}

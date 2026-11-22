//! Áudio do microfone → WAV 16 kHz mono 16-bit (o formato que o whisper.cpp lê).

/// Taxa que o whisper espera.
pub const WHISPER_RATE: u32 = 16_000;

/// Média dos canais intercalados (estéreo → mono).
pub fn to_mono(samples: &[f32], channels: u16) -> Vec<f32> {
    let ch = usize::from(channels.max(1));
    samples.chunks(ch).map(|f| f.iter().sum::<f32>() / f.len() as f32).collect()
}

/// Reamostragem linear (fala não precisa de filtro sofisticado para o whisper).
pub fn resample(input: &[f32], from: u32, to: u32) -> Vec<f32> {
    if from == to || input.is_empty() {
        return input.to_vec();
    }
    let ratio = f64::from(from) / f64::from(to);
    let out_len = ((input.len() as f64) / ratio).floor() as usize;
    (0..out_len)
        .map(|i| {
            let pos = i as f64 * ratio;
            let j = pos.floor() as usize;
            let frac = (pos - j as f64) as f32;
            let a = input[j.min(input.len() - 1)];
            let b = input[(j + 1).min(input.len() - 1)];
            a + (b - a) * frac
        })
        .collect()
}

/// Volume (RMS) de um trecho, 0–1: alimenta a onda animada.
pub fn rms(chunk: &[f32]) -> f32 {
    if chunk.is_empty() {
        return 0.0;
    }
    (chunk.iter().map(|s| s * s).sum::<f32>() / chunk.len() as f32).sqrt().min(1.0)
}

/// Arquivo WAV PCM 16-bit mono.
pub fn wav(samples: &[f32], rate: u32) -> Vec<u8> {
    let data_len = (samples.len() * 2) as u32;
    let mut out = Vec::with_capacity(44 + samples.len() * 2);
    out.extend_from_slice(b"RIFF");
    out.extend_from_slice(&(36 + data_len).to_le_bytes());
    out.extend_from_slice(b"WAVEfmt ");
    out.extend_from_slice(&16u32.to_le_bytes()); // tamanho do bloco fmt
    out.extend_from_slice(&1u16.to_le_bytes()); // PCM
    out.extend_from_slice(&1u16.to_le_bytes()); // mono
    out.extend_from_slice(&rate.to_le_bytes());
    out.extend_from_slice(&(rate * 2).to_le_bytes()); // bytes por segundo
    out.extend_from_slice(&2u16.to_le_bytes()); // bytes por amostra
    out.extend_from_slice(&16u16.to_le_bytes()); // bits
    out.extend_from_slice(b"data");
    out.extend_from_slice(&data_len.to_le_bytes());
    for s in samples {
        out.extend_from_slice(&((s.clamp(-1.0, 1.0) * f32::from(i16::MAX)) as i16).to_le_bytes());
    }
    out
}

/// Texto do `whisper-cli` sem as marcações de silêncio/ruído.
pub fn clean_transcript(stdout: &str) -> String {
    stdout
        .lines()
        .map(str::trim)
        .filter(|l| !l.is_empty())
        .map(|l| {
            // remove "[BLANK_AUDIO]", "(música)", "[Música]" etc.
            let mut s = l.to_string();
            for (open, close) in [('[', ']'), ('(', ')')] {
                while let (Some(a), Some(b)) = (s.find(open), s.find(close)) {
                    if b < a {
                        break;
                    }
                    s.replace_range(a..=b, "");
                }
            }
            s.split_whitespace().collect::<Vec<_>>().join(" ")
        })
        .filter(|l| !l.is_empty())
        .collect::<Vec<_>>()
        .join(" ")
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn mono_and_resample() {
        assert_eq!(to_mono(&[1.0, 0.0, 0.5, 0.5], 2), vec![0.5, 0.5]);
        let one_sec_48k = vec![0.25; 48_000];
        let r = resample(&one_sec_48k, 48_000, WHISPER_RATE);
        assert_eq!(r.len(), 16_000);
        assert!(r.iter().all(|&s| (s - 0.25).abs() < 1e-6));
        assert_eq!(resample(&[0.0, 1.0], 16_000, 16_000), vec![0.0, 1.0]);
    }

    #[test]
    fn wav_header_is_valid() {
        let w = wav(&[0.0, 1.0, -1.0], WHISPER_RATE);
        assert_eq!(&w[..4], b"RIFF");
        assert_eq!(&w[8..16], b"WAVEfmt ");
        assert_eq!(u32::from_le_bytes([w[24], w[25], w[26], w[27]]), 16_000);
        assert_eq!(w.len(), 44 + 6);
        assert_eq!(i16::from_le_bytes([w[46], w[47]]), i16::MAX);
    }

    #[test]
    fn rms_and_transcript() {
        assert_eq!(rms(&[]), 0.0);
        assert!((rms(&[0.5, -0.5]) - 0.5).abs() < 1e-6);
        assert_eq!(clean_transcript(" [BLANK_AUDIO]\n Os princípios da LGPD (música) são dez.\n\n"), "Os princípios da LGPD são dez.");
    }
}

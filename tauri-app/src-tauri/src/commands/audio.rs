use crate::commands::text_input::{clear_previous_window, remember_foreground_window};
use crate::state::RecordingState;
use base64::engine::general_purpose::STANDARD as BASE64;
use base64::Engine;
use cpal::traits::{DeviceTrait, HostTrait, StreamTrait};
use cpal::{SampleFormat, Stream, StreamConfig};
use hound::{SampleFormat as HoundSampleFormat, WavSpec, WavWriter};
use serde::Serialize;
use std::fs::File;
use std::io::BufWriter;
use std::path::PathBuf;
use std::sync::atomic::{AtomicBool, AtomicU32, Ordering};
use std::sync::mpsc::{self, RecvTimeoutError, Sender};
use std::sync::{Arc, Mutex, OnceLock};
use std::thread::{self, JoinHandle};
use std::time::{Duration, Instant, SystemTime, UNIX_EPOCH};
use tauri::{AppHandle, Emitter, Manager, State};

type SharedWriter = Arc<Mutex<Option<WavWriter<BufWriter<File>>>>>;
type SharedProcessor = Arc<Mutex<LinearResampler>>;

static RECORDER: OnceLock<Mutex<AudioRecorder>> = OnceLock::new();
static RECORDING_ACTIVE: AtomicBool = AtomicBool::new(false);
static AUDIO_LEVEL_BITS: AtomicU32 = AtomicU32::new(0);
const TARGET_SAMPLE_RATE: u32 = 16_000;
const TARGET_CHANNELS: u16 = 1;

#[derive(Debug, Clone, Serialize)]
pub struct RecordingStatus {
    is_recording: bool,
    duration: f32,
    audio_level: f32,
}

struct AudioRecorder {
    worker: Option<JoinHandle<()>>,
    stop_tx: Option<Sender<()>>,
    recording_path: Option<PathBuf>,
    start_time: Option<Instant>,
}

struct LinearResampler {
    input_sample_rate: u32,
    output_sample_rate: u32,
    position: f64,
    buffer: Vec<i16>,
}

impl LinearResampler {
    fn new(input_sample_rate: u32, output_sample_rate: u32) -> Self {
        Self {
            input_sample_rate,
            output_sample_rate,
            position: 0.0,
            buffer: Vec::new(),
        }
    }

    fn process(&mut self, input: &[i16]) -> Vec<i16> {
        if input.is_empty() {
            return Vec::new();
        }

        if self.input_sample_rate == self.output_sample_rate {
            return input.to_vec();
        }

        self.buffer.extend_from_slice(input);
        let step = self.input_sample_rate as f64 / self.output_sample_rate as f64;
        let mut output = Vec::new();

        while self.position + 1.0 < self.buffer.len() as f64 {
            output.push(self.sample_at(self.position));
            self.position += step;
        }

        let consumed = self.position.floor() as usize;
        if consumed > 0 {
            self.buffer.drain(..consumed);
            self.position -= consumed as f64;
        }

        output
    }

    fn flush(&mut self) -> Vec<i16> {
        if self.buffer.is_empty() {
            return Vec::new();
        }

        if self.input_sample_rate == self.output_sample_rate {
            self.position = 0.0;
            return std::mem::take(&mut self.buffer);
        }

        let step = self.input_sample_rate as f64 / self.output_sample_rate as f64;
        let mut output = Vec::new();

        while self.position < self.buffer.len() as f64 {
            output.push(self.sample_at(self.position));
            self.position += step;
        }

        self.buffer.clear();
        self.position = 0.0;
        output
    }

    fn sample_at(&self, position: f64) -> i16 {
        let index = position.floor() as usize;
        if index + 1 >= self.buffer.len() {
            return *self.buffer.last().unwrap_or(&0);
        }

        let fraction = position - index as f64;
        let left = self.buffer[index] as f64;
        let right = self.buffer[index + 1] as f64;
        let interpolated = left + (right - left) * fraction;
        interpolated.round().clamp(i16::MIN as f64, i16::MAX as f64) as i16
    }
}

impl Default for AudioRecorder {
    fn default() -> Self {
        Self {
            worker: None,
            stop_tx: None,
            recording_path: None,
            start_time: None,
        }
    }
}

fn recorder() -> &'static Mutex<AudioRecorder> {
    RECORDER.get_or_init(|| Mutex::new(AudioRecorder::default()))
}

pub fn recording_active() -> bool {
    RECORDING_ACTIVE.load(Ordering::SeqCst)
}

fn emit_level(app: &AppHandle, level: f32) {
    AUDIO_LEVEL_BITS.store(level.to_bits(), Ordering::SeqCst);

    for label in ["main", "overlay"] {
        if let Some(window) = app.get_webview_window(label) {
            let _ = window.emit("audio-level", level);
        }
    }
}

fn emit_chunk(app: &AppHandle, samples: &[i16]) {
    if samples.is_empty() {
        return;
    }

    let mut bytes = Vec::with_capacity(samples.len() * 2);
    for sample in samples {
        bytes.extend_from_slice(&sample.to_le_bytes());
    }

    let payload = BASE64.encode(bytes);
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.emit("audio-chunk", payload);
    }
}

fn select_config(device: &cpal::Device) -> Result<(SampleFormat, StreamConfig), String> {
    let default = device.default_input_config().map_err(|err| err.to_string())?;
    let config = default.config();
    eprintln!(
        "[Audio] Selected input config: channels={} sample_rate={} format={:?}",
        config.channels,
        config.sample_rate.0,
        default.sample_format()
    );
    Ok((default.sample_format(), config))
}

fn level_from_i16(samples: &[i16]) -> f32 {
    if samples.is_empty() {
        return 0.0;
    }

    let rms = (samples
        .iter()
        .map(|sample| (*sample as f64).powi(2))
        .sum::<f64>()
        / samples.len() as f64)
        .sqrt();
    let normalized = (rms / i16::MAX as f64).max(1e-9);
    let db = 20.0 * normalized.log10();
    ((db + 60.0) / 60.0).clamp(0.0, 1.0) as f32
}

fn write_samples(writer: &SharedWriter, samples: &[i16]) {
    if let Ok(mut guard) = writer.lock() {
        if let Some(wav_writer) = guard.as_mut() {
            for sample in samples {
                let _ = wav_writer.write_sample(*sample);
            }
        }
    }
}

fn process_audio_chunk(
    writer: &SharedWriter,
    processor: &SharedProcessor,
    app: &AppHandle,
    mono_samples: &[i16],
) {
    let processed = match processor.lock() {
        Ok(mut processor_guard) => processor_guard.process(mono_samples),
        Err(_) => return,
    };

    if processed.is_empty() {
        return;
    }

    let level = level_from_i16(&processed);
    write_samples(writer, &processed);
    emit_level(app, level);
    emit_chunk(app, &processed);
}

fn mono_i16_from_f32(data: &[f32], channels: usize) -> Vec<i16> {
    if channels <= 1 {
        return data
            .iter()
            .map(|sample| (sample.clamp(-1.0, 1.0) * i16::MAX as f32) as i16)
            .collect();
    }

    data.chunks(channels)
        .map(|frame| {
            let avg = frame.iter().copied().sum::<f32>() / frame.len() as f32;
            (avg.clamp(-1.0, 1.0) * i16::MAX as f32) as i16
        })
        .collect()
}

fn mono_i16_from_i16(data: &[i16], channels: usize) -> Vec<i16> {
    if channels <= 1 {
        return data.to_vec();
    }

    data.chunks(channels)
        .map(|frame| {
            let sum = frame.iter().map(|sample| *sample as i32).sum::<i32>();
            (sum / frame.len() as i32) as i16
        })
        .collect()
}

fn mono_i16_from_u16(data: &[u16], channels: usize) -> Vec<i16> {
    if channels <= 1 {
        return data
            .iter()
            .map(|sample| (*sample as i32 - 32768) as i16)
            .collect();
    }

    data.chunks(channels)
        .map(|frame| {
            let sum = frame.iter().map(|sample| *sample as i32 - 32768).sum::<i32>();
            (sum / frame.len() as i32) as i16
        })
        .collect()
}

fn build_stream(
    device: &cpal::Device,
    sample_format: SampleFormat,
    config: &StreamConfig,
    writer: SharedWriter,
    processor: SharedProcessor,
    app: AppHandle,
) -> Result<Stream, String> {
    let channels = config.channels as usize;
    let error_handler = |error| eprintln!("[Audio] stream error: {error}");

    match sample_format {
        SampleFormat::F32 => {
            let writer = writer.clone();
            let processor = processor.clone();
            let app = app.clone();
            device
                .build_input_stream(
                    config,
                    move |data: &[f32], _| {
                        let mono = mono_i16_from_f32(data, channels);
                        process_audio_chunk(&writer, &processor, &app, &mono);
                    },
                    error_handler,
                    None,
                )
                .map_err(|err| err.to_string())
        }
        SampleFormat::I16 => {
            let writer = writer.clone();
            let processor = processor.clone();
            let app = app.clone();
            device
                .build_input_stream(
                    config,
                    move |data: &[i16], _| {
                        let mono = mono_i16_from_i16(data, channels);
                        process_audio_chunk(&writer, &processor, &app, &mono);
                    },
                    error_handler,
                    None,
                )
                .map_err(|err| err.to_string())
        }
        SampleFormat::U16 => {
            let writer = writer.clone();
            let processor = processor.clone();
            let app = app.clone();
            device
                .build_input_stream(
                    config,
                    move |data: &[u16], _| {
                        let mono = mono_i16_from_u16(data, channels);
                        process_audio_chunk(&writer, &processor, &app, &mono);
                    },
                    error_handler,
                    None,
                )
                .map_err(|err| err.to_string())
        }
        other => Err(format!("unsupported sample format: {other:?}")),
    }
}

fn finish_recording(state: &State<'_, RecordingState>, delete_file: bool) -> Result<Option<String>, String> {
    let (worker, stop_tx, path) = {
        let mut recorder_guard = recorder().lock().map_err(|_| "Recorder mutex poisoned")?;
        let worker = recorder_guard.worker.take();
        let stop_tx = recorder_guard.stop_tx.take();
        let path = recorder_guard.recording_path.take();
        recorder_guard.start_time = None;
        (worker, stop_tx, path)
    };

    if let Some(stop_tx) = stop_tx {
        let _ = stop_tx.send(());
    }
    if let Some(worker) = worker {
        let _ = worker.join();
    }

    *state.is_recording.lock().map_err(|_| "Recording mutex poisoned")? = false;
    *state.current_path.lock().map_err(|_| "Recording mutex poisoned")? = None;
    RECORDING_ACTIVE.store(false, Ordering::SeqCst);
    AUDIO_LEVEL_BITS.store(0, Ordering::SeqCst);

    if delete_file {
        if let Some(path) = path {
            let _ = std::fs::remove_file(path);
        }
        clear_previous_window();
        return Ok(None);
    }

    Ok(path.map(|item| item.to_string_lossy().to_string()))
}

#[tauri::command]
pub fn start_recording(app: AppHandle, state: State<'_, RecordingState>) -> Result<String, String> {
    if RECORDING_ACTIVE.load(Ordering::SeqCst) {
        return Err("Recording already active".to_string());
    }

    let timestamp = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map_err(|err| err.to_string())?
        .as_millis();
    let file_path = std::env::temp_dir().join(format!("voicescribe_recording_{timestamp}.wav"));

    let (ready_tx, ready_rx) = mpsc::channel::<Result<(), String>>();
    let (stop_tx, stop_rx) = mpsc::channel::<()>();
    let thread_file_path = file_path.clone();
    let thread_app = app.clone();

    let worker = thread::spawn(move || {
        let host = cpal::default_host();
        let device = match host.default_input_device() {
            Some(device) => device,
            None => {
                let _ = ready_tx.send(Err("No input device".to_string()));
                return;
            }
        };

        let (sample_format, config) = match select_config(&device) {
            Ok(value) => value,
            Err(err) => {
                let _ = ready_tx.send(Err(err));
                return;
            }
        };

        let writer = match WavWriter::create(
            &thread_file_path,
            WavSpec {
                channels: TARGET_CHANNELS,
                sample_rate: TARGET_SAMPLE_RATE,
                bits_per_sample: 16,
                sample_format: HoundSampleFormat::Int,
            },
        ) {
            Ok(writer) => writer,
            Err(err) => {
                let _ = ready_tx.send(Err(err.to_string()));
                return;
            }
        };

        let shared_writer = Arc::new(Mutex::new(Some(writer)));
        let processor = Arc::new(Mutex::new(LinearResampler::new(
            config.sample_rate.0,
            TARGET_SAMPLE_RATE,
        )));
        let stream = match build_stream(
            &device,
            sample_format,
            &config,
            shared_writer.clone(),
            processor.clone(),
            thread_app.clone(),
        ) {
            Ok(stream) => stream,
            Err(err) => {
                let _ = ready_tx.send(Err(err));
                return;
            }
        };

        if let Err(err) = stream.play() {
            let _ = ready_tx.send(Err(err.to_string()));
            return;
        }

        let _ = ready_tx.send(Ok(()));

        loop {
            match stop_rx.recv_timeout(Duration::from_millis(100)) {
                Ok(_) | Err(RecvTimeoutError::Disconnected) => break,
                Err(RecvTimeoutError::Timeout) => {}
            }
        }

        drop(stream);

        let trailing = match processor.lock() {
            Ok(mut processor_guard) => processor_guard.flush(),
            Err(_) => Vec::new(),
        };
        if !trailing.is_empty() {
            write_samples(&shared_writer, &trailing);
            emit_level(&thread_app, level_from_i16(&trailing));
            emit_chunk(&thread_app, &trailing);
        }

        {
            let mut guard = match shared_writer.lock() {
                Ok(guard) => guard,
                Err(_) => return,
            };
            if let Some(wav_writer) = guard.take() {
                let _ = wav_writer.finalize();
            }
        }
    });

    match ready_rx.recv().map_err(|err| err.to_string())? {
        Ok(()) => {
            remember_foreground_window();

            let mut recorder_guard = recorder().lock().map_err(|_| "Recorder mutex poisoned")?;
            recorder_guard.worker = Some(worker);
            recorder_guard.stop_tx = Some(stop_tx);
            recorder_guard.recording_path = Some(file_path.clone());
            recorder_guard.start_time = Some(Instant::now());

            *state.is_recording.lock().map_err(|_| "Recording mutex poisoned")? = true;
            *state.current_path.lock().map_err(|_| "Recording mutex poisoned")? = Some(file_path.clone());

            RECORDING_ACTIVE.store(true, Ordering::SeqCst);
            AUDIO_LEVEL_BITS.store(0, Ordering::SeqCst);

            Ok(file_path.to_string_lossy().to_string())
        }
        Err(err) => {
            let _ = worker.join();
            Err(err)
        }
    }
}

#[tauri::command]
pub fn stop_recording(state: State<'_, RecordingState>) -> Result<String, String> {
    finish_recording(&state, false)?.ok_or_else(|| "No active recording".to_string())
}

#[tauri::command]
pub fn cancel_recording(state: State<'_, RecordingState>) -> Result<(), String> {
    let _ = finish_recording(&state, true)?;
    Ok(())
}

#[tauri::command]
pub fn delete_audio_file(path: String) -> Result<(), String> {
    let file_path = PathBuf::from(path);
    if file_path.exists() {
        std::fs::remove_file(file_path).map_err(|err| err.to_string())?;
    }
    Ok(())
}

#[tauri::command]
pub fn get_recording_status(state: State<'_, RecordingState>) -> Result<RecordingStatus, String> {
    let is_recording = *state
        .is_recording
        .lock()
        .map_err(|_| "Recording mutex poisoned")?;
    let duration = recorder()
        .lock()
        .map_err(|_| "Recorder mutex poisoned")?
        .start_time
        .map(|started| started.elapsed().as_secs_f32())
        .unwrap_or(0.0);
    let audio_level = f32::from_bits(AUDIO_LEVEL_BITS.load(Ordering::SeqCst));

    Ok(RecordingStatus {
        is_recording,
        duration,
        audio_level,
    })
}

/**
 * Backend API Client
 * HTTP client for communicating with VoiceScribe Python backend
 */

import * as http from 'http';
import * as https from 'https';
import * as fs from 'fs';
import * as path from 'path';
import FormData from 'form-data';

const BACKEND_URL = process.env.VOICESCRIBE_BACKEND_URL || 'http://127.0.0.1:8765';
const DEFAULT_TRANSCRIBE_TIMEOUT_MS = Number(
    process.env.VOICESCRIBE_TRANSCRIBE_TIMEOUT_MS || 3600000,
);

export interface HealthResponse {
    status: string;
    service: string;
    mode: string;
    speaker_model?: string;
    engines: {
        whisper: boolean;
        whispercpp: boolean;
        funasr: boolean;
        parakeet: boolean;
        firered: boolean;
        qwen3asr: boolean;
        firered2: boolean;
        diarization: boolean;
        ai_refine: boolean;
    };
}

export interface EngineInfo {
    name: string;
    models: string[];
    loaded_model: string | null;
    available: boolean;
}

export interface TranscribeResult {
    text: string;
    segments: Array<{
        start: number;
        end: number;
        text: string;
        speaker?: string;
    }>;
    duration: number;
    engine: string;
    model: string;
}

export interface TranscribeOptions {
    engine?: string;
    model?: string;
    language?: string;
    enableDiarization?: boolean;
    hotwords?: string;
    enableAiRefine?: boolean;
    recordingSessionId?: string;
    transcribeRequestId?: string;
    timeoutMs?: number;
}

export interface Speaker {
    speaker_id: string;
    name: string;
}

export interface ModelStatus {
    engine: string;
    model: string;
    available: boolean;
    downloading: boolean;
    size_bytes?: number;
    downloaded_bytes?: number;
    error?: string;
}

/**
 * Make HTTP request to backend
 */
async function request<T>(
    method: string,
    endpoint: string,
    body?: Record<string, unknown> | FormData,
    timeout: number = 60000,
    extraHeaders?: Record<string, string>
): Promise<T> {
    return new Promise((resolve, reject) => {
        const url = new URL(endpoint, BACKEND_URL);
        const isHttps = url.protocol === 'https:';
        const lib = isHttps ? https : http;

        const options: http.RequestOptions = {
            hostname: url.hostname,
            port: url.port || (isHttps ? 443 : 80),
            path: url.pathname + url.search,
            method,
            headers: {} as Record<string, string>,
        };

        if (body instanceof FormData) {
            Object.assign(options.headers as Record<string, string>, body.getHeaders());
        } else if (body) {
            (options.headers as Record<string, string>)['Content-Type'] = 'application/json';
        }
        if (extraHeaders) {
            Object.assign(options.headers as Record<string, string>, extraHeaders);
        }

        const req = lib.request(options, (res) => {
            let data = '';
            res.on('data', (chunk) => (data += chunk));
            res.on('end', () => {
                if (res.statusCode && res.statusCode >= 200 && res.statusCode < 300) {
                    try {
                        resolve(JSON.parse(data) as T);
                    } catch {
                        resolve(data as unknown as T);
                    }
                } else {
                    let message = `HTTP ${res.statusCode}: ${data}`;
                    try {
                        const parsed = JSON.parse(data) as { detail?: unknown };
                        if (typeof parsed.detail === 'string') {
                            message = parsed.detail;
                        } else if (parsed.detail && typeof parsed.detail === 'object') {
                            const detail = parsed.detail as Record<string, unknown>;
                            if (typeof detail.message === 'string') {
                                message = detail.message;
                            }
                        }
                    } catch {
                        // keep raw payload when response is not JSON
                    }
                    reject(new Error(message));
                }
            });
        });

        req.on('error', reject);
        req.setTimeout(timeout, () => {
            req.destroy();
            reject(new Error('Request timeout'));
        });

        if (body instanceof FormData) {
            body.pipe(req);
        } else if (body) {
            req.write(JSON.stringify(body));
            req.end();
        } else {
            req.end();
        }
    });
}

/**
 * Check backend health
 */
export async function checkHealth(): Promise<HealthResponse> {
    return request<HealthResponse>('GET', '/health');
}

/**
 * List available ASR engines
 */
export async function getEngines(): Promise<EngineInfo[]> {
    return request<EngineInfo[]>('GET', '/engines');
}

/**
 * Preload engine and model
 */
export async function loadEngine(engine: string, model: string): Promise<{ status: string }> {
    const formData = new FormData();
    formData.append('engine', engine);
    formData.append('model', model);
    // 10 min timeout: first load may download large model files (up to ~1GB)
    return request<{ status: string }>('POST', '/load', formData, 600000);
}

/**
 * Transcribe audio file
 */
export async function transcribe(
    audioPath: string,
    options: TranscribeOptions = {}
): Promise<TranscribeResult> {
    const formData = new FormData();
    formData.append('audio', fs.createReadStream(audioPath), {
        filename: path.basename(audioPath),
        contentType: 'audio/wav',
    });
    formData.append('engine', options.engine || 'funasr');
    formData.append('model', options.model || 'seaco-paraformer');
    formData.append('language', options.language || 'zh');
    formData.append('enable_diarization', String(options.enableDiarization || false));
    formData.append('hotwords', options.hotwords || '');
    formData.append('enable_ai_refine', String(options.enableAiRefine || false));
    const headers: Record<string, string> = {};
    if (options.recordingSessionId) {
        headers['X-Recording-Session-ID'] = options.recordingSessionId;
    }
    if (options.transcribeRequestId) {
        headers['X-Transcribe-Request-ID'] = options.transcribeRequestId;
    }

    return request<TranscribeResult>(
        'POST',
        '/transcribe',
        formData,
        options.timeoutMs ?? DEFAULT_TRANSCRIBE_TIMEOUT_MS,
        headers,
    );
}

/**
 * List registered speakers
 */
export async function getSpeakers(): Promise<Speaker[]> {
    const result = await request<{ speakers: Speaker[] }>('GET', '/speakers');
    return result.speakers;
}

/**
 * Register a new speaker
 */
export async function registerSpeaker(
    name: string,
    audioPath: string
): Promise<{ status: string; speaker_id: string; name: string }> {
    const formData = new FormData();
    formData.append('name', name);
    formData.append('audio', fs.createReadStream(audioPath), {
        filename: path.basename(audioPath),
        contentType: 'audio/wav',
    });
    return request<{ status: string; speaker_id: string; name: string }>(
        'POST',
        '/speakers/register',
        formData,
        600000
    );
}

/**
 * Delete a speaker
 */
export async function deleteSpeaker(speakerId: string): Promise<{ status: string }> {
    return request<{ status: string }>('DELETE', `/speakers/${speakerId}`);
}

/**
 * Reload speaker recognition model backends.
 */
export async function reloadSpeakerModels(
    enableStreaming: boolean,
    enableDiarization: boolean,
    speakerModel?: string
): Promise<{
    status: string;
    preload: boolean;
    speaker_model?: string;
    speaker_plan?: {
        preload_cluster: boolean;
        preload_mapping: boolean;
        speaker_model: string;
    } | null;
    stream_tracker?: { backend: string | null; available: boolean };
    stream_tracker_error?: string | null;
    diarizer_status?: string;
    diarizer_error?: string | null;
}> {
    const preload = Boolean(enableStreaming || enableDiarization);
    const speakerPart = speakerModel
        ? `&speaker_model=${encodeURIComponent(speakerModel)}`
        : '';
    return request(
        'POST',
        `/speakers/reload-models?preload=${preload ? 'true' : 'false'}&enable_streaming=${enableStreaming ? 'true' : 'false'}&enable_diarization=${enableDiarization ? 'true' : 'false'}${speakerPart}`
    );
}

/**
 * List model status (for FunASR model cache management)
 */
export async function getModels(): Promise<ModelStatus[]> {
    return request<ModelStatus[]>('GET', '/models');
}

/**
 * Download a model
 */
export async function downloadModel(engine: string, model: string): Promise<{ status: string }> {
    const formData = new FormData();
    formData.append('engine', engine);
    formData.append('model', model);
    return request<{ status: string }>('POST', '/models/download', formData);
}

/**
 * Delete a model
 */
export async function deleteModel(engine: string, model: string): Promise<{ status: string }> {
    const formData = new FormData();
    formData.append('engine', engine);
    formData.append('model', model);
    return request<{ status: string }>('POST', '/models/delete', formData);
}

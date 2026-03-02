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

export interface HealthResponse {
    status: string;
    service: string;
    mode: string;
    engines: {
        whisper: boolean;
        funasr: boolean;
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
    timeout: number = 60000
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
                    reject(new Error(`HTTP ${res.statusCode}: ${data}`));
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

    return request<TranscribeResult>('POST', '/transcribe', formData, 300000);
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

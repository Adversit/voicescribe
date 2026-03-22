import * as fs from 'fs';
import * as http from 'http';
import * as https from 'https';
import * as path from 'path';

import * as backend from './backend';
import FormData from 'form-data';

type CliArgs = {
    audioPath: string;
    engine: string;
    model: string;
    language: string;
    enableDiarization: boolean;
    speakerModel: string;
    hotwords: string;
    timeoutMs: number;
};

function parseArgs(argv: string[]): CliArgs {
    const args: Record<string, string> = {};
    for (let index = 0; index < argv.length; index += 1) {
        const token = argv[index];
        if (!token.startsWith('--')) {
            continue;
        }
        const key = token.slice(2);
        const value = argv[index + 1];
        if (!value || value.startsWith('--')) {
            args[key] = 'true';
            continue;
        }
        args[key] = value;
        index += 1;
    }

    return {
        audioPath: args.audio || '',
        engine: args.engine || 'funasr',
        model: args.model || 'seaco-paraformer',
        language: args.language || 'zh',
        enableDiarization: args['enable-diarization'] !== 'false',
        speakerModel: args['speaker-model'] || 'cam++',
        hotwords: args.hotwords || '',
        timeoutMs: Number(args['timeout-ms'] || 7200000),
    };
}

function formatPreviewLines(text: string, maxLines = 20): string[] {
    return text
        .split(/\r?\n/)
        .map((line) => line.trimEnd())
        .filter((line) => line.length > 0)
        .slice(0, maxLines);
}

async function transcribeWithCustomTimeout(
    audioPath: string,
    args: CliArgs,
): Promise<backend.TranscribeResult> {
    const backendUrl = process.env.VOICESCRIBE_BACKEND_URL || 'http://127.0.0.1:8765';
    const url = new URL('/transcribe', backendUrl);
    const isHttps = url.protocol === 'https:';
    const lib = isHttps ? https : http;

    const formData = new FormData();
    formData.append('audio', fs.createReadStream(audioPath), {
        filename: path.basename(audioPath),
        contentType: 'audio/wav',
    });
    formData.append('engine', args.engine);
    formData.append('model', args.model);
    formData.append('language', args.language);
    formData.append('enable_diarization', String(args.enableDiarization));
    formData.append('hotwords', args.hotwords);
    formData.append('enable_ai_refine', 'false');
    formData.append('speaker_model', args.speakerModel);

    return new Promise((resolve, reject) => {
        const req = lib.request(
            {
                hostname: url.hostname,
                port: url.port || (isHttps ? 443 : 80),
                path: url.pathname + url.search,
                method: 'POST',
                headers: formData.getHeaders(),
            },
            (res) => {
                let body = '';
                res.on('data', (chunk) => {
                    body += chunk;
                });
                res.on('end', () => {
                    if (res.statusCode && res.statusCode >= 200 && res.statusCode < 300) {
                        try {
                            resolve(JSON.parse(body) as backend.TranscribeResult);
                        } catch (error) {
                            reject(error);
                        }
                        return;
                    }
                    reject(new Error(`HTTP ${res.statusCode}: ${body}`));
                });
            },
        );

        req.on('error', reject);
        req.setTimeout(args.timeoutMs, () => {
            req.destroy(new Error(`Request timeout after ${args.timeoutMs}ms`));
        });
        formData.pipe(req);
    });
}

async function main(): Promise<void> {
    const args = parseArgs(process.argv.slice(2));
    if (!args.audioPath) {
        throw new Error('Missing required --audio <wav-path>');
    }

    const resolvedAudioPath = path.resolve(args.audioPath);
    if (!fs.existsSync(resolvedAudioPath)) {
        throw new Error(`Audio file not found: ${resolvedAudioPath}`);
    }

    console.log(`[FrontendTest] Audio: ${resolvedAudioPath}`);
    console.log(
        `[FrontendTest] Settings: engine=${args.engine} model=${args.model} language=${args.language} diarization=${args.enableDiarization} speakerModel=${args.speakerModel} timeoutMs=${args.timeoutMs}`,
    );

    const health = await backend.checkHealth();
    console.log(
        `[FrontendTest] Backend health: status=${health.status} mode=${health.mode} speaker_model=${health.speaker_model || 'unknown'}`,
    );

    await backend.reloadSpeakerModels(false, args.enableDiarization, args.speakerModel);
    console.log('[FrontendTest] Speaker models reloaded');

    await backend.loadEngine(args.engine, args.model);
    console.log('[FrontendTest] ASR engine loaded');

    const result = await transcribeWithCustomTimeout(resolvedAudioPath, args);

    const previewLines = formatPreviewLines(result.text);
    console.log(
        `[FrontendTest] Transcribe success: duration=${result.duration} segment_count=${result.segments.length}`,
    );
    console.log('[FrontendTest] Text preview (first 20 lines):');
    for (const line of previewLines) {
        console.log(line);
    }

    const reportPath = path.resolve(
        process.env.VOICESCRIBE_TEST_HISTORY_REPORT ||
        path.join(__dirname, '../../logs/system-tests/frontend-file-test-report.json'),
    );
    fs.mkdirSync(path.dirname(reportPath), { recursive: true });
    fs.writeFileSync(
        reportPath,
        JSON.stringify(
            {
                audioPath: resolvedAudioPath,
                engine: args.engine,
                model: args.model,
                duration: result.duration,
                segmentCount: result.segments.length,
                previewLines,
            },
            null,
            2,
        ),
        'utf8',
    );
    console.log(`[FrontendTest] Report written: ${reportPath}`);
}

main().catch((error) => {
    console.error(`[FrontendTest] FAILED: ${String(error)}`);
    process.exitCode = 1;
});

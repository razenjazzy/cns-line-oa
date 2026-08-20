import { execFile } from 'child_process';
import path from 'path';
import { promisify } from 'util';

const execFileAsync = promisify(execFile);

const isEnabled = (): boolean =>
    /^(1|true|yes|on)$/i.test(process.env.CLAWFRAMEWORK_ENABLED || '');

const isMock = (): boolean =>
    /^(1|true|yes|on)$/i.test(process.env.CLAWFRAMEWORK_MOCK || '');

const getPythonBin = (): string => {
    const raw = process.env.CLAWFRAMEWORK_PYTHON?.trim() || 'python3';
    // Resolve relative paths against the repo root so CWD doesn't matter.
    if (raw === 'python3' || raw.includes(':')) return raw; // name or absolute/URL-ish
    if (!raw.startsWith('/') && !raw.startsWith('.')) return raw;
    return path.resolve(getClawDir(), '..', raw);
};

// Resolve the clawframework dir relative to the package root (dist is at <root>/dist).
const getClawDir = (): string => {
    const root = path.resolve(__dirname, '../../clawframework');
    return root;
};

export type ClawResult = {
    ok: boolean;
    content?: string;
    error?: string;
};

/**
 * Calls clawframework's call_llm (Groq/OpenRouter + optional web search + retries)
 * via the Python bridge. Returns structured JSON; never throws.
 */
export async function clawChat(
    prompt: string,
    provider: string = process.env.CLAWFRAMEWORK_PROVIDER?.trim() || 'groq',
    search: boolean = /^(1|true|yes|on)$/i.test(process.env.CLAWFRAMEWORK_SEARCH || ''),
): Promise<ClawResult> {
    // dev tier: mock mode requires no API key / no Python Runtime.
    if (isMock()) {
        return {
            ok: true,
            content: `[MOCK ${provider.toUpperCase()}] You said: ${prompt.slice(0, 120)}`,
        };
    }

    const clawDir = getClawDir();
    const pythonBin = getPythonBin();

    // dev tier (docker): reach clawframework over HTTP instead of spawning python.
    const httpUrl = process.env.CLAWFRAMEWORK_HTTP_URL?.trim();
    if (httpUrl) {
        try {
            const res = await fetch(httpUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ provider, prompt, search }),
            });
            if (!res.ok) return { ok: false, error: `HTTP ${res.status} from clawframework` };
            return (await res.json()) as ClawResult;
        } catch (error) {
            return { ok: false, error: String((error as Error).message || error) };
        }
    }

    const args = [
        path.join(clawDir, 'bridge.py'),
        '--provider', provider,
        '--prompt', prompt,
    ];
    if (search) args.push('--search');

    try {
        const { stdout } = await execFileAsync(pythonBin, args, {
            cwd: clawDir,
            timeout: 60_000,
            maxBuffer: 1024 * 1024,
        });
        const trimmed = stdout.trim();
        const lastLine = trimmed.split('\n').filter(Boolean).pop() || '';
        const parsed = JSON.parse(lastLine) as ClawResult;
        return parsed;
    } catch (error) {
        return { ok: false, error: String((error as Error).message || error) };
    }
}

export { isEnabled, isMock };

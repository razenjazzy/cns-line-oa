import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { afterEach, describe, expect, it } from 'vitest';

const repoRoot = '/home/runner/work/cns-line-oa/cns-line-oa';
const materializeScript = join(repoRoot, 'scripts/materialize-deploy-env.sh');
const evidenceScript = join(repoRoot, 'scripts/generate-deploy-evidence.sh');

const tempDirs: string[] = [];

const createTempDir = (): string => {
  const dir = mkdtempSync(join(tmpdir(), 'deploy-scripts-'));
  tempDirs.push(dir);
  return dir;
};

afterEach(() => {
  for (const dir of tempDirs.splice(0)) {
    rmSync(dir, { recursive: true, force: true });
  }
});

describe('deploy scripts', () => {
  it('falls back to the example deploy env file and patches PUBLIC_BASE_URL', () => {
    const tempDir = createTempDir();
    const exampleFile = join(tempDir, 'deploy.env.staging.yaml.example');
    const outputFile = join(tempDir, 'deploy.env.staging.yaml');

    writeFileSync(
      exampleFile,
      [
        'NODE_ENV: "production"',
        'ENABLE_WEBHOOK_TEST: "true"',
        'ENABLE_DEMO_CONTROL_PANEL: "true"',
        'ALLOW_DEMO_HEADER_TOKEN_FALLBACK: "false"',
        'MAX_JSON_BODY: "64kb"',
        'READYZ_TIMEOUT_MS: "2500"',
        'PUBLIC_BASE_URL: "https://placeholder.example"',
        '',
      ].join('\n'),
    );

    const result = spawnSync('bash', [materializeScript, 'staging', outputFile, exampleFile], {
      cwd: repoRoot,
      encoding: 'utf8',
      env: {
        ...process.env,
        DEPLOY_ENV_YAML: '',
        PUBLIC_BASE_URL: 'https://staging.example',
      },
    });

    expect(result.status).toBe(0);
    expect(readFileSync(outputFile, 'utf8')).toContain('PUBLIC_BASE_URL: "https://staging.example"');
  });

  it('writes inline deploy env yaml verbatim when provided', () => {
    const tempDir = createTempDir();
    const outputFile = join(tempDir, 'deploy.env.production.yaml');
    const inlineYaml = ['NODE_ENV: "production"', 'PUBLIC_BASE_URL: "https://inline.example"', ''].join('\n');

    const result = spawnSync('bash', [materializeScript, 'production', outputFile], {
      cwd: repoRoot,
      encoding: 'utf8',
      env: {
        ...process.env,
        DEPLOY_ENV_YAML: inlineYaml,
        PUBLIC_BASE_URL: 'https://ignored.example',
      },
    });

    expect(result.status).toBe(0);
    expect(readFileSync(outputFile, 'utf8')).toBe(inlineYaml);
  });

  it('writes a skipped evidence artifact instead of failing when base URL is missing in non-strict mode', () => {
    const tempDir = createTempDir();
    const artifactsDir = join(tempDir, 'artifacts');
    const outputFile = join(artifactsDir, 'staging-evidence.json');
    mkdirSync(artifactsDir, { recursive: true });

    const result = spawnSync('bash', [evidenceScript, '', outputFile, 'staging'], {
      cwd: repoRoot,
      encoding: 'utf8',
      env: {
        ...process.env,
        EVIDENCE_STRICT: 'false',
      },
    });

    expect(result.status).toBe(0);

    const payload = JSON.parse(readFileSync(outputFile, 'utf8'));
    expect(payload).toMatchObject({
      environment: 'staging',
      baseUrl: null,
      overallOk: false,
      skipped: true,
      skippedReason: 'Base URL was not provided.',
      checks: {
        healthz: { checked: false },
        readyz: { checked: false },
        opsWorkflowAudit: { checked: false },
      },
    });
  });
});

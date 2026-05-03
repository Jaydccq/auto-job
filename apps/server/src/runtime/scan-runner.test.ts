import { describe, it, expect } from 'vitest';
// @ts-expect-error — plain JS module without typedefs.
import { getScanCatalog, buildArgv, runnerEnv } from '../../../../web/scan-runner.mjs';

describe('getScanCatalog', () => {
  it('returns 6 known skills with stable ids and runners arrays', async () => {
    const cat = await getScanCatalog();
    const ids = cat.map((e: { id: string }) => e.id).sort();
    expect(ids).toEqual([
      'builtin-scan', 'gmail-scan', 'indeed-scan',
      'linkedin-scan', 'newgrad-scan', 'scan',
    ]);
    for (const e of cat as Array<{ runners: string[]; defaultRunner: string }>) {
      expect(e.runners.length).toBeGreaterThan(0);
      expect(e.runners).toContain(e.defaultRunner);
    }
  });

  it('exposes evaluator runners on builtin-scan and indeed-scan', async () => {
    const cat = await getScanCatalog();
    for (const id of ['builtin-scan', 'indeed-scan']) {
      const entry = (cat as Array<{
        id: string;
        runners: string[];
        defaultRunner: string;
        advancedRunners?: string[];
      }>).find((e) => e.id === id);
      expect(entry).toBeDefined();
      expect(entry!.runners).toEqual(
        expect.arrayContaining(['real-codex', 'real-claude', 'real-openrouter', 'fake']),
      );
      expect(entry!.defaultRunner).toBe('real-codex');
      expect(entry!.advancedRunners).toContain('discovery-only');
    }
  });
});

describe('buildArgv', () => {
  it('translates linkedin-scan with url + score-only into npm argv', () => {
    const argv = buildArgv({
      skillId: 'linkedin-scan',
      runner: 'real-codex',
      inputs: { url: 'https://www.linkedin.com/jobs/search/?...', scoreOnly: true, pages: 3 },
    });
    expect(argv[0]).toBe('npm');
    expect(argv.slice(0, 4)).toEqual(['npm', 'run', 'linkedin-scan', '--']);
    expect(argv).toContain('--url');
    expect(argv).toContain('https://www.linkedin.com/jobs/search/?...');
    expect(argv).toContain('--score-only');
    expect(argv).toContain('--pages');
    expect(argv).toContain('3');
  });

  it('translates scan with --no-evaluate when runner=discovery-only', () => {
    const argv = buildArgv({
      skillId: 'scan',
      runner: 'discovery-only',
      inputs: {},
    });
    expect(argv).toContain('--no-evaluate');
  });

  it('rejects unknown skillId', () => {
    expect(() => buildArgv({ skillId: 'nope', runner: 'fake', inputs: {} }))
      .toThrow(/unknown skill/i);
  });

  it('rejects runner not declared in catalog (primary or advanced)', () => {
    expect(() => buildArgv({ skillId: 'gmail-scan', runner: 'real-claude', inputs: {} }))
      .toThrow(/runner .* not supported/i);
  });

  it('accepts an advanced runner (discovery-only on linkedin-scan)', () => {
    const argv = buildArgv({
      skillId: 'linkedin-scan',
      runner: 'discovery-only',
      inputs: { url: 'https://example.com' },
    });
    expect(argv).toContain('--score-only');
  });

  it('translates builtin-scan with real-codex + evaluateLimit into --evaluate-limit (no --no-evaluate)', () => {
    const argv = buildArgv({
      skillId: 'builtin-scan',
      runner: 'real-codex',
      inputs: { evaluateLimit: 5, limit: 50 },
    });
    expect(argv.slice(0, 4)).toEqual(['npm', 'run', 'builtin-scan', '--']);
    expect(argv).toContain('--evaluate-limit');
    expect(argv).toContain('5');
    expect(argv).toContain('--limit');
    expect(argv).toContain('50');
    expect(argv).not.toContain('--no-evaluate');
    expect(argv).not.toContain('--score-only');
  });

  it('translates indeed-scan with discovery-only into --no-evaluate + --score-only', () => {
    const argv = buildArgv({
      skillId: 'indeed-scan',
      runner: 'discovery-only',
      inputs: { limit: 30 },
    });
    expect(argv).toContain('--no-evaluate');
    expect(argv).toContain('--score-only');
  });

  it('translates indeed-scan with real-openrouter passes url, pages, evaluateLimit', () => {
    const argv = buildArgv({
      skillId: 'indeed-scan',
      runner: 'real-openrouter',
      inputs: {
        url: 'https://www.indeed.com/jobs?q=software+engineer&fromage=7',
        pages: 2,
        evaluateLimit: 3,
      },
    });
    expect(argv).toContain('--url');
    expect(argv).toContain('https://www.indeed.com/jobs?q=software+engineer&fromage=7');
    expect(argv).toContain('--pages');
    expect(argv).toContain('2');
    expect(argv).toContain('--evaluate-limit');
    expect(argv).toContain('3');
    expect(argv).not.toContain('--no-evaluate');
  });
});

describe('runnerEnv', () => {
  it('maps real-codex to AUTO_JOB_BRIDGE_MODE=real and AUTO_JOB_REAL_EXECUTOR=codex', () => {
    expect(runnerEnv('real-codex')).toEqual({
      AUTO_JOB_BRIDGE_MODE: 'real',
      AUTO_JOB_REAL_EXECUTOR: 'codex',
    });
  });

  it('maps fake to AUTO_JOB_BRIDGE_MODE=fake and clears executor', () => {
    expect(runnerEnv('fake')).toEqual({
      AUTO_JOB_BRIDGE_MODE: 'fake',
      AUTO_JOB_REAL_EXECUTOR: '',
    });
  });

  it('maps discovery-only to no env override', () => {
    expect(runnerEnv('discovery-only')).toEqual({});
  });
});

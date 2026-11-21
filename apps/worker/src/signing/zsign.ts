import { spawn } from 'node:child_process';
import { stat } from 'node:fs/promises';

/** zsign exited non-zero, was killed at a limit, or wrote nothing. Never carries key paths. */
export class ZsignError extends Error {
  constructor(
    readonly exitCode: number | null,
    readonly stderrTail: string,
    readonly reason: 'exit' | 'timeout' | 'no_output' | 'spawn',
  ) {
    super(`zsign failed (${reason}${exitCode === null ? '' : `, code ${exitCode}`})`);
    this.name = 'ZsignError';
  }
}

export type ZsignOptions = {
  zsignBin: string;
  input: string;
  output: string;
  keyPath: string;
  certPath: string;
  profilePath: string;
  /** Set only when the profile needs another bundle id (single-app profile). */
  bundleId?: string;
  timeoutMs: number;
  memoryMb: number;
  cpuSec: number;
};

const STDERR_TAIL = 2048;

/**
 * Signs `input` into `output` with PEM key and certificate files: no password ever reaches argv
 * or env. Runs under `prlimit` (address space, CPU time) in its own process group, which is
 * killed with SIGKILL at `timeoutMs`. The argv is never logged.
 */
export async function runZsign(o: ZsignOptions): Promise<void> {
  const args = [
    `--as=${o.memoryMb * 1024 * 1024}`,
    `--cpu=${o.cpuSec}`,
    '--',
    o.zsignBin,
    '-k',
    o.keyPath,
    '-c',
    o.certPath,
    '-m',
    o.profilePath,
    '-o',
    o.output,
    '-z',
    '1',
    ...(o.bundleId ? ['-b', o.bundleId] : []),
    o.input,
  ];
  await new Promise<void>((resolve, reject) => {
    const child = spawn('prlimit', args, {
      stdio: ['ignore', 'ignore', 'pipe'],
      detached: true,
      env: { PATH: process.env.PATH ?? '/usr/bin:/bin' },
    });
    let stderr = '';
    let timedOut = false;
    child.stderr?.on('data', (chunk: Buffer) => {
      stderr = (stderr + chunk.toString('utf8')).slice(-STDERR_TAIL);
    });
    const timer = setTimeout(() => {
      timedOut = true;
      try {
        if (child.pid) process.kill(-child.pid, 'SIGKILL');
      } catch {
        child.kill('SIGKILL');
      }
    }, o.timeoutMs);
    child.on('error', () => {
      clearTimeout(timer);
      reject(new ZsignError(null, '', 'spawn'));
    });
    child.on('close', (code) => {
      clearTimeout(timer);
      if (timedOut) reject(new ZsignError(code, stderr, 'timeout'));
      else if (code !== 0) reject(new ZsignError(code, stderr, 'exit'));
      else resolve();
    });
  });
  const out = await stat(o.output).catch(() => null);
  if (!out || out.size === 0) throw new ZsignError(0, '', 'no_output');
}

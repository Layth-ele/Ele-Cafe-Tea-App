#!/usr/bin/env node
/**
 * scripts/_run-a11y.mjs — self-contained a11y runner
 *
 * Avoids the sandbox shell-detachment problem: starts vite preview as a
 * direct child process from Node, runs the a11y snapshot, then SIGKILLs
 * the child on exit. The whole thing is one process tree owned by this
 * Node invocation.
 */
import { spawn, execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(__dirname, '..');

// 1. Start vite preview as a child.
const preview = spawn('npx', ['vite', 'preview', '--port', '4173', '--host', '127.0.0.1'], {
  cwd:   PROJECT_ROOT,
  stdio: ['ignore', 'pipe', 'pipe'],
});
let previewReady = false;
preview.stdout.on('data', (b) => {
  if (b.toString().includes('Local:')) previewReady = true;
});
preview.stderr.on('data', (b) => process.stderr.write(b));

// 2. Wait for it.
await new Promise(async (resolve, reject) => {
  for (let i = 0; i < 30; i++) {
    if (previewReady) {
      // Confirm with a real HTTP request
      try {
        const r = await fetch('http://127.0.0.1:4173/');
        if (r.ok) return resolve();
      } catch {}
    }
    await new Promise(r => setTimeout(r, 500));
  }
  reject(new Error('Preview never came up'));
});

console.log('[runner] Preview up, running snapshots...');

// 3. Run scripts in order.
process.exitCode = 0;
const runs = process.argv.slice(2).length > 0
  ? process.argv.slice(2)
  : ['local-perf-snapshot.mjs', 'local-a11y-snapshot.mjs'];

for (const s of runs) {
  console.log(`\n[runner] === ${s} ===`);
  try {
    execFileSync('node', [path.join(__dirname, s)], {
      cwd:    PROJECT_ROOT,
      stdio:  'inherit',
      env:    {
        ...process.env,
        CHROME_PATH: process.env.CHROME_PATH
          || '/home/claude/.cache/puppeteer/chrome/linux-131.0.6778.204/chrome-linux64/chrome',
      },
    });
  } catch (err) {
    console.error(`[runner] ${s} failed:`, err.message);
    process.exitCode = 1;
  }
}

// 4. Clean up.
preview.kill('SIGKILL');
console.log('\n[runner] Done.');

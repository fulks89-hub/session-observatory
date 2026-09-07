#!/usr/bin/env node
import { spawn } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const command = args[0] ?? 'start';
const file = ['start', 'demo'].includes(command) ? 'server.ts' : 'cli.ts';
const forwarded = file === 'server.ts' ? (command === 'demo' ? ['--demo'] : []) : args;
const child = spawn(
  process.execPath,
  ['--experimental-strip-types', resolve(root, 'src', file), ...forwarded],
  { stdio: 'inherit', shell: false },
);
child.on('exit', (code) => process.exit(code ?? 1));
child.on('error', () => {
  console.error('Unable to start Session Observatory.');
  process.exit(1);
});

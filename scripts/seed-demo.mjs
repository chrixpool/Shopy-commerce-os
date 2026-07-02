import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');

process.env.PRISMA_CLIENT_ENGINE_TYPE ??= 'binary';
process.env.PRISMA_CLI_QUERY_ENGINE_TYPE ??= 'binary';

const result = spawnSync('pnpm', ['exec', 'ts-node', '--transpile-only', 'prisma/seed.ts'], {
  cwd: root,
  env: process.env,
  shell: true,
  stdio: 'inherit',
});

process.exit(result.status ?? 1);

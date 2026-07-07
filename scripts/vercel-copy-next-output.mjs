import fs from 'node:fs';
import path from 'node:path';

const source = path.join(process.cwd(), 'apps', 'web', '.next');
const target = path.join(process.cwd(), '.next');

if (!fs.existsSync(source)) {
  throw new Error(`Next output not found at ${source}`);
}

fs.rmSync(target, { recursive: true, force: true });
fs.cpSync(source, target, { recursive: true });

console.log('Copied apps/web/.next to root .next for Vercel output publishing.');

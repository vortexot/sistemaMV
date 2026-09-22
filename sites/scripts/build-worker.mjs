import { build } from 'rolldown';
import { mkdir, copyFile, cp } from 'node:fs/promises';
await mkdir('dist/server', { recursive: true });
await build({ input: 'worker/index.ts', platform: 'browser', output: { file: 'dist/server/index.js', format: 'esm', minify: true } });
await mkdir('dist/.openai', { recursive: true });
await copyFile('.openai/hosting.json', 'dist/.openai/hosting.json');
await cp('drizzle', 'dist/.openai/drizzle', { recursive: true });

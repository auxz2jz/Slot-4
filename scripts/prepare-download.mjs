import { copyFileSync, existsSync, statSync } from 'node:fs';
import { resolve } from 'node:path';

const source = resolve('dist/app-source.html');
const target = resolve('dist/Construction3DBuilder.html');
if (!existsSync(source)) throw new Error('Vite did not produce dist/app-source.html');
copyFileSync(source, target);
console.log(`Standalone HTML ready: ${target} (${statSync(target).size} bytes)`);

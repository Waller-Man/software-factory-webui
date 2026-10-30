/** Materialize the same runtime-only directory installation used by the backends. */
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { root } from '../../gateway/scripts/dev.mjs';
import { readTgz } from '../../manage/scripts/archive.mjs';

const webui = resolve(root, 'packages/webui');
const artifacts = join(webui, 'artifacts');
const release = join(artifacts, 'release/software-factory-webui');
await mkdir(artifacts, { recursive: true });
const args = process.platform === 'win32'
  ? ['/d', '/s', '/c', 'npm.cmd pack --ignore-scripts --json --pack-destination artifacts']
  : ['pack', '--ignore-scripts', '--json', '--pack-destination', 'artifacts'];
const result = spawnSync(process.platform === 'win32' ? process.env.ComSpec ?? 'cmd.exe' : 'npm', args, {
  cwd: webui, encoding: 'utf8', windowsHide: true,
  env: { ...process.env, npm_config_cache: join(artifacts, 'npm-cache') },
});
if (result.status !== 0) throw new Error(result.stderr ?? 'npm pack failed');
const metadata = JSON.parse(result.stdout)[0];
const entries = readTgz(await readFile(join(artifacts, metadata.filename)));
const required = ['package.json', 'cordis.patch.yml', 'README.md', 'lib/index.js', 'lib/client.js', 'lib/runtime.js', 'lib/runtime.d.ts', 'icon.svg', 'locale/zh.json', 'locale/en.json'];
if (entries.length !== required.length || required.some(name => !entries.some(entry => entry.name === name))) throw new Error('Unexpected WebUI runtime file list');
for (const entry of entries) {
  if (entry.name === 'package.json') {
    const manifest = JSON.parse(entry.data.toString('utf8'));
    delete manifest.scripts; delete manifest.devDependencies;
    entry.data = Buffer.from(JSON.stringify(manifest, null, 2) + '\n');
  }
  const destination = join(release, entry.name);
  await mkdir(dirname(destination), { recursive: true });
  await writeFile(destination, entry.data);
}
console.log(JSON.stringify({ directory: release, files: entries.length, runtimeOnly: true }));

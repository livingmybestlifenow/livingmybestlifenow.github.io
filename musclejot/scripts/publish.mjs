import { cp, readdir, rm } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const dist = path.join(root, 'dist')

const generated = [
  'index.html',
  'assets',
  'sw.js',
  'manifest.webmanifest',
  'favicon.svg',
  'icon-maskable.svg',
  'icons',
  'install-prompt.js',
  'theme-init.js',
  'robots.txt',
  '_headers',
  'registerSW.js',
  'workbox-window.js',
]

const existing = await readdir(root)
for (const name of existing) {
  if (/^workbox-.*\.js$/.test(name)) await rm(path.join(root, name), { force: true })
}
for (const name of generated) {
  await rm(path.join(root, name), { recursive: true, force: true })
}

for (const name of await readdir(dist)) {
  await cp(path.join(dist, name), path.join(root, name), { recursive: true })
}

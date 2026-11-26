import { mkdir, readFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import sharp from 'sharp'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const icons = path.join(root, 'app/public/icons')
await mkdir(icons, { recursive: true })

const anySvg = await readFile(path.join(root, 'app/public/favicon.svg'))
const maskSvg = await readFile(path.join(root, 'app/public/icon-maskable.svg'))

async function png(svg, size, file) {
  await sharp(svg, { density: 192 }).resize(size, size).png().toFile(path.join(icons, file))
}

await png(anySvg, 192, 'icon-192.png')
await png(anySvg, 512, 'icon-512.png')
await png(anySvg, 180, 'apple-touch-icon.png')
await png(maskSvg, 192, 'icon-maskable-192.png')
await png(maskSvg, 512, 'icon-maskable-512.png')

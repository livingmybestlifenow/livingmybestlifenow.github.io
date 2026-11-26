import { cp, rm } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))
const root = path.resolve(here, '..')
const routebook = path.resolve(root, '../routebook')
const publicDir = path.join(root, 'app/public')

await rm(path.join(publicDir, 'tesseract'), { recursive: true, force: true })
await rm(path.join(publicDir, 'tessdata'), { recursive: true, force: true })
await cp(path.join(routebook, 'tesseract'), path.join(publicDir, 'tesseract'), { recursive: true })
await cp(path.join(routebook, 'tessdata'), path.join(publicDir, 'tessdata'), { recursive: true })

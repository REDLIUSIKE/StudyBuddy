import { createRequire } from 'node:module'
import { copyFile, mkdir, writeFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

const sharp = createRequire(new URL('../../apps/desktop/package.json', import.meta.url))('sharp')
const root = fileURLToPath(new URL('../../', import.meta.url))
const source = 'brand/derived/studybuddy-desktop-sidebar-wordmark-transparent-v4.png'
const sourceMetadata = await sharp(path.join(root, source)).metadata()
const trimmed = await sharp(path.join(root, source))
  .trim({ threshold: 10, lineArt: true, margin: 4 }).png().toBuffer({ resolveWithObject: true })
const variants = []
for (const density of [1, 2, 3, 4]) {
  const destination = `brand/derived/sidebar-wordmark-v4-${density}x.png`
  await sharp(trimmed.data)
    .resize(158 * density, 34 * density, { fit: 'contain', kernel: 'lanczos3', background: '#00000000' })
    .extend({ top: density, bottom: density, left: density, right: density, background: '#00000000' })
    .png().toFile(path.join(root, destination))
  const copies = density <= 3 ? [`apps/web/public/brand/sidebar-v4-${density}x.png`] : []
  if (density === 2) copies.push('apps/desktop/renderer/assets/studybuddy-wordmark-v4-1x.png')
  if (density === 4) copies.push('apps/desktop/renderer/assets/studybuddy-wordmark-v4-2x.png')
  for (const copy of copies) await copyFile(path.join(root, destination), path.join(root, copy))
  variants.push({ path: destination, width: 160 * density, height: 36 * density, copies })
}
await mkdir(path.join(root, 'output/ui-refinements-2026-10-11'), { recursive: true })
const record = { checkedAt: new Date().toISOString(), source, sourceSize: [sourceMetadata.width, sourceMetadata.height],
  trimmedSize: [trimmed.info.width, trimmed.info.height],
  preparation: 'Trim near-transparent padding using sharp threshold 10, lineArt true, margin 4; fit without artwork clipping; Lanczos3 downscale with transparent 1px logical margin', variants }
await writeFile(path.join(root, 'output/ui-refinements-2026-10-11/wordmark-preparation.json'), JSON.stringify(record, null, 2) + '\n')
console.log(JSON.stringify(record))

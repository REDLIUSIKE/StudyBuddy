/** Render installer branding from the existing StudyBuddy product wordmark. */
import sharp from 'sharp'
import { join, resolve } from 'node:path'

const root = resolve(import.meta.dirname, '..')
const source = join(root, 'renderer/assets/studybuddy-wordmark-v4-2x.png')
const assets = join(root, 'installer/assets')
for (const scale of [1, 2]) {
  const logo = await sharp(source).resize({ width: 360 * scale }).png().toBuffer()
  const size = await sharp(logo).metadata()
  for (const dark of [false, true]) {
    const canvas = sharp({ create: { width: 600 * scale, height: 196 * scale, channels: 4,
      background: dark ? '#151517' : '#ffffff' } })
    const layers = []
    if (dark) {
      layers.push({ input: Buffer.from(`<svg width="${600 * scale}" height="${196 * scale}" xmlns="http://www.w3.org/2000/svg"><rect x="${80 * scale}" y="${34 * scale}" width="${440 * scale}" height="${128 * scale}" rx="${24 * scale}" fill="white"/></svg>`), left: 0, top: 0 })
    }
    layers.push({ input: logo, left: 120 * scale, top: Math.round((196 * scale - size.height) / 2) })
    await canvas.composite(layers).png().toFile(join(assets, `brand${dark ? '-dark' : ''}${scale === 2 ? '-2x' : ''}.png`))
  }
}
const sidebar = join(assets, 'uninstaller-sidebar.png')
const sidebarSize = await sharp(sidebar).metadata()
const sidebarLogo = await sharp(source).resize({ width: sidebarSize.width - 24 }).png().toBuffer()
const sidebarLogoSize = await sharp(sidebarLogo).metadata()
const sidebarBytes = await sharp({ create: { width: sidebarSize.width, height: sidebarSize.height,
  channels: 4, background: '#ffffff' } }).composite([{ input: sidebarLogo, left: 12,
  top: Math.round((sidebarSize.height - sidebarLogoSize.height) / 2) }]).png().toBuffer()
await sharp(sidebarBytes).toFile(sidebar)
console.log('StudyBuddy installer brand assets rendered')

// Renders the app icon SVG to the PNG sizes iOS/Android/PWA need.
import { chromium } from 'playwright'
import { mkdirSync } from 'node:fs'
import { resolve } from 'node:path'

const svg = (pad) => `<!doctype html><meta charset="utf-8">
<style>html,body{margin:0;padding:0}</style>
<svg id="icon" width="512" height="512" viewBox="0 0 512 512" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#2a78d6"/>
      <stop offset="1" stop-color="#184f95"/>
    </linearGradient>
  </defs>
  <rect width="512" height="512" fill="url(#bg)"/>
  <g transform="translate(256 268) scale(${1 - pad})">
    <!-- open book -->
    <path d="M0 -96 C -44 -126, -110 -130, -148 -116 L -148 88 C -110 74, -44 78, 0 108 C 44 78, 110 74, 148 88 L 148 -116 C 110 -130, 44 -126, 0 -96 Z"
      fill="#ffffff" opacity="0.97"/>
    <path d="M0 -96 L 0 108" stroke="#2a78d6" stroke-width="16" stroke-linecap="round"/>
    <!-- spark -->
    <path d="M96 -168 l10 26 26 10 -26 10 -10 26 -10 -26 -26 -10 26 -10 Z" fill="#ffd34d"/>
  </g>
</svg>`

const outDir = resolve(import.meta.dirname, '../public/icons')
mkdirSync(outDir, { recursive: true })

// Use the environment's pre-installed Chromium when the pinned Playwright
// version doesn't have a matching browser download.
const executablePath = process.env.CHROMIUM_PATH || '/opt/pw-browsers/chromium'
const browser = await chromium.launch({ executablePath }).catch(() => chromium.launch())
const page = await browser.newPage({ viewport: { width: 512, height: 512 } })

const shots = [
  { file: 'icon-512.png', size: 512, pad: 0 },
  { file: 'icon-192.png', size: 192, pad: 0 },
  { file: 'apple-touch-icon.png', size: 180, pad: 0.02 },
]
for (const { file, size, pad } of shots) {
  await page.setContent(svg(pad))
  const el = page.locator('#icon')
  const buf = await el.screenshot({ omitBackground: true })
  // Resize by re-screenshotting at scaled viewport
  const page2 = await browser.newPage({ viewport: { width: size, height: size }, deviceScaleFactor: 1 })
  await page2.setContent(
    `<style>html,body{margin:0}</style><img src="data:image/png;base64,${buf.toString('base64')}" width="${size}" height="${size}">`,
  )
  await page2.locator('img').screenshot({ path: resolve(outDir, file) })
  await page2.close()
}
await browser.close()
console.log('icons written to public/icons')

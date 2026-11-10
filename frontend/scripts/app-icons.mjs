#!/usr/bin/env node
/* The alternate home-screen icons (Settings → Look & Home → App icon), drawn from
 * src/lib/app-icon-variants.js and the Retake Gym mark (markShapes below).
 *
 * The mark is a few lines, circles, rectangles and one polygon, so the small renderer below draws
 * it (rect, circle, line, polyline, polygon, one radial gradient, 4x4 samples per pixel) and writes
 * the PNGs with node:zlib: no sharp or resvg to install, and the same bytes on every machine,
 * which the test checks. A variant with `art` (Halloween) is a hand-made SVG instead, drawn by the
 * same renderer. Written per variant:
 *   resources/icons/<id>.svg                                  the source (the plain ones only)
 *   public/app-icons/<id>.png                                 112 px preview for the settings row
 *   ios/App/App/Assets.xcassets/AppIcon-<Name>.appiconset/    1024 px, opaque (Apple refuses alpha)
 *   android/app/src/main/res/mipmap-<dpi>/ic_launcher_<id>{,_round,_foreground}.png
 *   android/app/src/main/res/mipmap-anydpi-v26/ic_launcher_<id>{,_round}.xml
 *   android/app/src/main/res/values/app_icons.xml             the adaptive icons' background colours
 * The default variant also writes the primary icon: resources/icon.svg, public/icon-512.png and
 * icon-180.png (PWA), the iOS AppIcon set and Android's ic_launcher{,_round,_foreground,_background}.
 *
 * Usage: node scripts/app-icons.mjs            write everything
 *        node scripts/app-icons.mjs --check    exit 1 when a committed file differs from a fresh draw */
import { deflateSync } from 'node:zlib'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { APP_ICON_VARIANTS } from '../src/lib/app-icon-variants.js'

export const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const RES = 'android/app/src/main/res'

// Launcher icon in px per density (48 dp), and the adaptive layer (108 dp) beside it.
export const DENSITIES = { ldpi: 0.75, mdpi: 1, hdpi: 1.5, xhdpi: 2, xxhdpi: 3, xxxhdpi: 4 }
export const PREVIEW = 112
export const IOS_SIZE = 1024

/* The Retake Gym mark: the Retake pen nib with its circuit traces, the main trace turned into a
 * barbell. Drawn in the 756 grid of the Retake symbol, placed at 85% so it keeps clear of the
 * adaptive-icon mask, and written in the 512 grid with only what the renderer below knows. */
const K = 0.85 * 512 / 756
const P = (x, y) => [+((56.7 + 0.85 * x) * 512 / 756).toFixed(1), +((57.125 + 0.85 * y) * 512 / 756).toFixed(1)]
const W = w => +(w * K).toFixed(1)
const TRACES = [[468.18, 215, 468.18, 404.25], [328.36, 159.23, 328.36, 285], [295.07, 159.23, 328.36, 159.23],
  [295.07, 103.31, 295.07, 159.23], [381.63, 141.92, 381.63, 285], [381.63, 141.92, 437.56, 141.92]]
const NODES = [[468.18, 212.5], [295.07, 103.31], [437.56, 141.92]]
const BAR_Y = 285.74
// Plates and collar, left side: [x0, x1, height]; the right side mirrors them about x 378.
const PLATES = [[214, 246, 156], [184, 210, 112], [250, 259, 44]]
const NIB = [[377.4, 354.8], [289.5, 574.8], [336.3, 673.3], [435.5, 673.3], [474.6, 574.7], [386.7, 354.8]]

/** The mark's elements for a background, a main colour and the nib's (defaults to the main). */
export function markShapes({ bg, fg, nib = fg }, hole = bg) {
  const out = []
  const rect = (x0, y0, x1, y1, fill) => {
    const [a, b] = P(x0, y0), [c, d] = P(x1, y1)
    out.push(`<rect x="${a}" y="${b}" width="${+(c - a).toFixed(1)}" height="${+(d - b).toFixed(1)}" fill="${fill}"/>`)
  }
  for (const [x1, y1, x2, y2] of TRACES) {
    const [a, b] = P(x1, y1), [c, d] = P(x2, y2)
    out.push(`<line x1="${a}" y1="${b}" x2="${c}" y2="${d}" stroke="${fg}" stroke-width="${W(10.66)}"/>`)
  }
  for (const [x, y] of NODES) { const [a, b] = P(x, y); out.push(`<circle cx="${a}" cy="${b}" r="${W(21.31)}" fill="${fg}"/>`) }
  { const [a, b] = P(164, BAR_Y), [c] = P(592, BAR_Y); out.push(`<line x1="${a}" y1="${b}" x2="${c}" y2="${b}" stroke="${fg}" stroke-width="${W(15)}"/>`) }
  for (const [x0, x1, h] of PLATES) {
    rect(x0, BAR_Y - h / 2, x1, BAR_Y + h / 2, fg)
    rect(756 - x1, BAR_Y - h / 2, 756 - x0, BAR_Y + h / 2, fg)
  }
  out.push(`<polygon points="${NIB.map(q => P(...q).join(',')).join(' ')}" fill="${nib}"/>`)
  rect(379.3, 340, 384.7, 522, bg)   // the slit
  { const [a, b] = P(382.04, 546); out.push(`<circle cx="${a}" cy="${b}" r="${W(27.1)}" fill="${hole}"/>`) }
  return out
}

/** A plain variant's whole icon as SVG: its background and the mark in its colours. */
export const markSvg = v => `<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024" viewBox="0 0 512 512">
  <!-- Retake Gym app icon "${v.id}", written by scripts/app-icons.mjs. -->
  <rect width="512" height="512" fill="${v.bg}"/>
${markShapes(v).map(e => '  ' + e).join('\n')}
</svg>
`

/** One icon `size` px square, opaque, or cut to a circle with alpha at the edge (`round`). */
export function draw(v, size, { round = false } = {}) {
  return drawArt(v.art ? readFileSync(join(ROOT, v.art), 'utf8') : markSvg(v), size, { round })
}

/** One flat colour, `size` px square: the default adaptive icon's background layer. */
function solid(hex, size) {
  const c = rgb(hex), out = Buffer.alloc(size * size * 3)
  for (let i = 0; i < size * size; i++) out.set(c, i * 3)
  return png(size, size, out, 3)
}

const rgb = hex => [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16))

// --- the hand-made icons: a renderer for the little SVG they are allowed to use ---
// Painted back to front like SVG: each sample takes the colour of the topmost shape covering it.
// Strokes are capsules (round caps and joins), polygons fill even-odd, and a fill may be the one
// userSpaceOnUse radialGradient with two stops. Coordinates in the 512 viewBox.

const num = (a, k, d = 0) => (a[k] === undefined ? d : Number(a[k]))
const attrs = tag => Object.fromEntries([...tag.matchAll(/([\w:-]+)="([^"]*)"/g)].map(m => [m[1], m[2]]))
const pts = s => s.trim().split(/[\s,]+/).map(Number).reduce((o, n, i) => (i % 2 ? o[o.length - 1].push(n) : o.push([n]), o), [])

/** The SVG as a list of shapes, each { hit(x, y), color(x, y), box }: what drawArt paints. */
export function scene(svg) {
  const grads = {}
  for (const m of svg.matchAll(/<radialGradient\b([^>]*)>([\s\S]*?)<\/radialGradient>/g)) {
    const a = attrs(m[1])
    const stops = [...m[2].matchAll(/<stop\b([^>]*)\/>/g)].map(s => attrs(s[1]))
    grads[a.id] = { cx: num(a, 'cx'), cy: num(a, 'cy'), r: num(a, 'r'), c0: rgb(stops[0]['stop-color']), c1: rgb(stops[stops.length - 1]['stop-color']) }
  }
  const paint = f => {
    const g = /^url\(#(.+)\)$/.exec(f)
    if (!g) { const c = rgb(f); return () => c }
    const { cx, cy, r, c0, c1 } = grads[g[1]]
    return (x, y) => {
      const t = Math.min(1, Math.hypot(x - cx, y - cy) / r)
      return [0, 1, 2].map(i => c0[i] + (c1[i] - c0[i]) * t)
    }
  }
  const body = svg.replace(/<defs>[\s\S]*?<\/defs>/g, '').replace(/<!--[\s\S]*?-->/g, '')
  const stack = [{}]
  const shapes = []
  for (const m of body.matchAll(/<(\/?)(\w+)\b([^>]*?)(\/?)>/g)) {
    const [, close, name, raw, self] = m
    if (name === 'svg') continue
    if (name === 'g') { close ? stack.pop() : stack.push({ ...stack[stack.length - 1], ...attrs(raw) }); continue }
    if (close) continue
    const a = { ...stack[stack.length - 1], ...attrs(raw) }
    if (!self) throw new Error(`app icon art: <${name}> must close itself`)
    if (name === 'rect') {
      const x = num(a, 'x'), y = num(a, 'y'), w = num(a, 'width'), h = num(a, 'height')
      shapes.push({ box: [x, y, x + w, y + h], hit: (px, py) => px >= x && px < x + w && py >= y && py < y + h, color: paint(a.fill) })
    } else if (name === 'circle') {
      const cx = num(a, 'cx'), cy = num(a, 'cy'), r = num(a, 'r')
      shapes.push({ box: [cx - r, cy - r, cx + r, cy + r], hit: (px, py) => (px - cx) ** 2 + (py - cy) ** 2 <= r * r, color: paint(a.fill) })
    } else if (name === 'line' || name === 'polyline') {
      const p = name === 'line' ? [[num(a, 'x1'), num(a, 'y1')], [num(a, 'x2'), num(a, 'y2')]] : pts(a.points)
      const hw = num(a, 'stroke-width', 1) / 2
      const segs = p.slice(1).map((q, i) => [p[i], q])
      const xs = p.map(q => q[0]), ys = p.map(q => q[1])
      shapes.push({
        box: [Math.min(...xs) - hw, Math.min(...ys) - hw, Math.max(...xs) + hw, Math.max(...ys) + hw],
        hit: (px, py) => segs.some(([[x1, y1], [x2, y2]]) => {
          const dx = x2 - x1, dy = y2 - y1
          const t = Math.max(0, Math.min(1, ((px - x1) * dx + (py - y1) * dy) / (dx * dx + dy * dy || 1)))
          return (px - x1 - t * dx) ** 2 + (py - y1 - t * dy) ** 2 <= hw * hw
        }),
        color: paint(a.stroke),
      })
    } else if (name === 'polygon') {
      const p = pts(a.points)
      const xs = p.map(q => q[0]), ys = p.map(q => q[1])
      shapes.push({
        box: [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)],
        hit: (px, py) => {
          let inside = false
          for (let i = 0, j = p.length - 1; i < p.length; j = i++) {
            const [xi, yi] = p[i], [xj, yj] = p[j]
            if ((yi > py) !== (yj > py) && px < (xj - xi) * (py - yi) / (yj - yi) + xi) inside = !inside
          }
          return inside
        },
        color: paint(a.fill),
      })
    } else throw new Error(`app icon art: no <${name}> in the renderer`)
  }
  return shapes.reverse()   // topmost first
}

/** A hand-made icon `size` px square, 4x4 samples per pixel: opaque (iOS, Android square and
 *  adaptive layer), or cut to a circle with alpha at the edge (Android round). */
export function drawArt(svg, size, { round = false } = {}) {
  const shapes = scene(svg)
  const k = 4, scale = 512 / size
  const ch = round ? 4 : 3
  const out = Buffer.alloc(size * size * ch)
  for (let y = 0; y < size; y++) {
    // Only the shapes this pixel row can touch.
    const y0 = y * scale, y1 = (y + 1) * scale
    const row = shapes.filter(s => s.box[1] <= y1 && s.box[3] >= y0)
    for (let x = 0; x < size; x++) {
      const x0 = x * scale, x1 = (x + 1) * scale
      const here = row.filter(s => s.box[0] <= x1 && s.box[2] >= x0)
      const sum = [0, 0, 0]
      let inside = 0
      for (let sy = 0; sy < k; sy++) for (let sx = 0; sx < k; sx++) {
        if (round) {
          const dx = x + (sx + 0.5) / k - size / 2, dy = y + (sy + 0.5) / k - size / 2
          if (dx * dx + dy * dy > (size / 2) * (size / 2)) continue
        }
        inside++
        const px = (x + (sx + 0.5) / k) * scale, py = (y + (sy + 0.5) / k) * scale
        const s = here.find(sh => sh.hit(px, py))
        const c = s ? s.color(px, py) : [0, 0, 0]
        sum[0] += c[0]; sum[1] += c[1]; sum[2] += c[2]
      }
      const o = (y * size + x) * ch
      for (let c = 0; c < 3; c++) out[o + c] = inside ? Math.round(sum[c] / inside) : 0
      if (round) out[o + 3] = Math.round(255 * inside / (k * k))
    }
  }
  return png(size, size, out, ch)
}

// --- PNG, the bare minimum: IHDR, one IDAT, IEND; filter 0 on every row ---
const CRC = new Uint32Array(256).map((_, n) => {
  let c = n
  for (let i = 0; i < 8; i++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
  return c >>> 0
})
const crc32 = buf => { let c = 0xffffffff; for (const b of buf) c = CRC[(c ^ b) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0 }
const chunk = (type, data) => {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length)
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data])
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(body))
  return Buffer.concat([len, body, crc])
}
function png(w, h, pixels, ch) {
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4)
  ihdr[8] = 8; ihdr[9] = ch === 4 ? 6 : 2   // 8 bit, RGBA or RGB
  const raw = Buffer.alloc(h * (w * ch + 1))
  for (let y = 0; y < h; y++) pixels.copy(raw, y * (w * ch + 1) + 1, y * w * ch, (y + 1) * w * ch)
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw, { level: 9 })), chunk('IEND', Buffer.alloc(0))])
}

/** Width, height and whether the PNG has an alpha channel, read from its header. */
export function pngInfo(buf) {
  return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20), alpha: buf[25] === 6 || buf[25] === 4 }
}

// The same layers as the default icon's (mipmap-anydpi-v26/ic_launcher.xml): the whole square icon
// as the foreground, inset to the 72 dp the launcher's mask shows, so every variant sits exactly
// where the original does. The colour behind it only shows where a launcher moves the layers.
const adaptive = id => `<?xml version="1.0" encoding="utf-8"?>
<!-- Written by scripts/app-icons.mjs. -->
<adaptive-icon xmlns:android="http://schemas.android.com/apk/res/android">
    <background android:drawable="@color/ic_launcher_${id}_background" />
    <foreground>
        <inset android:drawable="@mipmap/ic_launcher_${id}_foreground" android:inset="16.7%" />
    </foreground>
</adaptive-icon>
`

const iosContents = `{
  "images" : [
    {
      "filename" : "icon-1024.png",
      "idiom" : "universal",
      "platform" : "ios",
      "size" : "1024x1024"
    }
  ],
  "info" : {
    "author" : "xcode",
    "version" : 1
  }
}
`

/** Every file this script owns, as [path relative to frontend/, () => contents]: drawn on demand. */
export function files() {
  const out = []
  const colors = []
  for (const v of APP_ICON_VARIANTS) {
    out.push([`public/app-icons/${v.id}.png`, () => draw(v, PREVIEW)])
    if (v.id === 'default') {
      // The primary icon everywhere: PWA, iOS AppIcon, Android launcher (adaptive layers in
      // mipmap-anydpi-v26/ic_launcher.xml, both inset like the variants').
      out.push(['resources/icon.svg', () => markSvg(v)])
      out.push(['public/icon-512.png', () => draw(v, 512)])
      out.push(['public/icon-180.png', () => draw(v, 180)])
      out.push(['ios/App/App/Assets.xcassets/AppIcon.appiconset/AppIcon-512@2x.png', () => draw(v, IOS_SIZE)])
      for (const [dpi, f] of Object.entries(DENSITIES)) {
        out.push([`${RES}/mipmap-${dpi}/ic_launcher.png`, () => draw(v, Math.round(48 * f))])
        out.push([`${RES}/mipmap-${dpi}/ic_launcher_round.png`, () => draw(v, Math.round(48 * f), { round: true })])
        out.push([`${RES}/mipmap-${dpi}/ic_launcher_foreground.png`, () => draw(v, Math.round(108 * f))])
        out.push([`${RES}/mipmap-${dpi}/ic_launcher_background.png`, () => solid(v.bg, Math.round(108 * f))])
      }
      continue
    }
    if (!v.art) out.push([`resources/icons/${v.id}.svg`, () => markSvg(v)])
    const set = `ios/App/App/Assets.xcassets/${v.ios}.appiconset`
    out.push([`${set}/Contents.json`, () => iosContents])
    out.push([`${set}/icon-1024.png`, () => draw(v, IOS_SIZE)])
    for (const [dpi, f] of Object.entries(DENSITIES)) {
      out.push([`${RES}/mipmap-${dpi}/ic_launcher_${v.id}.png`, () => draw(v, Math.round(48 * f))])
      out.push([`${RES}/mipmap-${dpi}/ic_launcher_${v.id}_round.png`, () => draw(v, Math.round(48 * f), { round: true })])
      out.push([`${RES}/mipmap-${dpi}/ic_launcher_${v.id}_foreground.png`, () => draw(v, Math.round(108 * f))])
    }
    out.push([`${RES}/mipmap-anydpi-v26/ic_launcher_${v.id}.xml`, () => adaptive(v.id)])
    out.push([`${RES}/mipmap-anydpi-v26/ic_launcher_${v.id}_round.xml`, () => adaptive(v.id)])
    colors.push(`    <color name="ic_launcher_${v.id}_background">${v.bg}</color>`)
  }
  out.push([`${RES}/values/app_icons.xml`, () => `<?xml version="1.0" encoding="utf-8"?>
<!-- Written by scripts/app-icons.mjs: behind each alternate launcher icon. -->
<resources>
${colors.join('\n')}
</resources>
`])
  return out
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const check = process.argv.includes('--check')
  const bad = []
  for (const [rel, make] of files()) {
    const p = join(ROOT, rel)
    const body = make()
    const buf = Buffer.isBuffer(body) ? body : Buffer.from(body)
    if (check) {
      if (!existsSync(p) || !readFileSync(p).equals(buf)) bad.push(rel)
      continue
    }
    mkdirSync(dirname(p), { recursive: true })
    writeFileSync(p, buf)
  }
  if (bad.length) { console.error('app icons out of date (run node scripts/app-icons.mjs):\n  ' + bad.join('\n  ')); process.exit(1) }
  console.log(check ? 'app icons up to date' : 'app icons written')
}

/**
 * Derive a complete design-token palette from a single user-picked background
 * colour. Powers the "Custom" theme: the owner picks one colour on a colour
 * wheel in Settings and everything else — surfaces, ink, borders, the accent,
 * subject colours — is computed so the text and UI stay readable against that
 * background, in either a light or a dark pick.
 *
 * Pure maths only (no DOM, no storage). theme.ts owns persistence and writes
 * the returned vars inline on <html>; the returned keys are exactly CUSTOM_VARS
 * so theme.ts can also clear them when switching away from "custom".
 */

export const DEFAULT_CUSTOM_COLOR = '#eae4ff' // a soft lilac to start from

/** Every CSS custom property this module sets — used to clear inline styles. */
export const CUSTOM_VARS = [
  '--page', '--surface', '--ink', '--ink-2', '--muted', '--hairline', '--border',
  '--accent', '--accent-ink', '--good', '--good-text', '--danger',
  '--warn-bg', '--ok-bg', '--no-bg', '--mark-bg', '--mark-text',
  '--cat-0', '--cat-1', '--cat-2', '--cat-3', '--cat-4', '--cat-5', '--cat-6', '--cat-7',
  '--shadow',
] as const

type RGB = { r: number; g: number; b: number }
type HSL = { h: number; s: number; l: number }

const clamp = (n: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, n))

export function normalizeHex(hex: string): string {
  let h = (hex || '').trim().replace(/^#/, '')
  if (/^[0-9a-fA-F]{3}$/.test(h)) h = h.split('').map((c) => c + c).join('')
  if (!/^[0-9a-fA-F]{6}$/.test(h)) return '#eae4ff'
  return '#' + h.toLowerCase()
}

function hexToRgb(hex: string): RGB {
  const h = normalizeHex(hex).slice(1)
  return {
    r: parseInt(h.slice(0, 2), 16),
    g: parseInt(h.slice(2, 4), 16),
    b: parseInt(h.slice(4, 6), 16),
  }
}

function rgbToHex({ r, g, b }: RGB): string {
  const to = (n: number) => clamp(Math.round(n), 0, 255).toString(16).padStart(2, '0')
  return '#' + to(r) + to(g) + to(b)
}

function rgbToHsl({ r, g, b }: RGB): HSL {
  const rn = r / 255, gn = g / 255, bn = b / 255
  const max = Math.max(rn, gn, bn), min = Math.min(rn, gn, bn)
  const l = (max + min) / 2
  let h = 0, s = 0
  if (max !== min) {
    const d = max - min
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min)
    if (max === rn) h = (gn - bn) / d + (gn < bn ? 6 : 0)
    else if (max === gn) h = (bn - rn) / d + 2
    else h = (rn - gn) / d + 4
    h *= 60
  }
  return { h, s: s * 100, l: l * 100 }
}

function hslToRgb({ h, s, l }: HSL): RGB {
  const sn = clamp(s, 0, 100) / 100, ln = clamp(l, 0, 100) / 100
  const c = (1 - Math.abs(2 * ln - 1)) * sn
  const hp = (((h % 360) + 360) % 360) / 60
  const x = c * (1 - Math.abs((hp % 2) - 1))
  let r = 0, g = 0, b = 0
  if (hp < 1) [r, g, b] = [c, x, 0]
  else if (hp < 2) [r, g, b] = [x, c, 0]
  else if (hp < 3) [r, g, b] = [0, c, x]
  else if (hp < 4) [r, g, b] = [0, x, c]
  else if (hp < 5) [r, g, b] = [x, 0, c]
  else [r, g, b] = [c, 0, x]
  const m = ln - c / 2
  return { r: (r + m) * 255, g: (g + m) * 255, b: (b + m) * 255 }
}

const hslHex = (h: number, s: number, l: number) => rgbToHex(hslToRgb({ h, s, l }))

function relLuminance({ r, g, b }: RGB): number {
  const ch = (v: number) => {
    const x = v / 255
    return x <= 0.03928 ? x / 12.92 : Math.pow((x + 0.055) / 1.055, 2.4)
  }
  return 0.2126 * ch(r) + 0.7152 * ch(g) + 0.0722 * ch(b)
}

function contrast(a: RGB, b: RGB): number {
  const la = relLuminance(a), lb = relLuminance(b)
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05)
}

/**
 * Nudge an HSL colour's lightness toward `prefer` ('dark' or 'light') until it
 * reaches `target` contrast against `bg`, so text stays legible. Bounded so it
 * never runs past pure black/white.
 */
function forContrast(hsl: HSL, bg: RGB, target: number, prefer: 'dark' | 'light'): HSL {
  const step = prefer === 'dark' ? -2 : 2
  let l = hsl.l
  for (let i = 0; i < 60; i++) {
    if (contrast(hslToRgb({ ...hsl, l }), bg) >= target) break
    l = clamp(l + step, 0, 100)
    if (l === 0 || l === 100) break
  }
  return { ...hsl, l }
}

/** Ink colour (black or white text) that best contrasts with `bg`. */
function inkOn(bg: RGB): string {
  const white = { r: 255, g: 255, b: 255 }
  const black = { r: 17, g: 17, b: 17 }
  return contrast(white, bg) >= contrast(black, bg) ? '#ffffff' : '#111111'
}

export function deriveCustomPalette(baseHex: string): Record<string, string> {
  const base = normalizeHex(baseHex)
  const baseRgb = hexToRgb(base)
  const { h, s } = rgbToHsl(baseRgb)
  const dark = relLuminance(baseRgb) < 0.4

  const out: Record<string, string> = {}
  out['--page'] = base

  if (dark) {
    const { l } = rgbToHsl(baseRgb)
    const surfaceHsl = { h, s: Math.min(s, 40), l: clamp(l + 7, 9, 28) }
    const surfaceRgb = hslToRgb(surfaceHsl)
    out['--surface'] = rgbToHex(surfaceRgb)
    const inkHsl = forContrast({ h, s: Math.min(s, 22), l: 96 }, surfaceRgb, 8, 'light')
    out['--ink'] = hslHex(inkHsl.h, inkHsl.s, inkHsl.l)
    out['--ink-2'] = hslHex(h, Math.min(s, 20), 78)
    out['--muted'] = hslHex(h, Math.min(s, 16), 58)
    out['--hairline'] = hslHex(h, Math.min(s, 30), clamp(l + 12, 16, 36))
    out['--border'] = 'rgba(255, 255, 255, 0.1)'

    const accentHsl = forContrast({ h, s: clamp(s + 12, 55, 90), l: 66 }, surfaceRgb, 3.5, 'light')
    const accentRgb = hslToRgb(accentHsl)
    out['--accent'] = rgbToHex(accentRgb)
    out['--accent-ink'] = inkOn(accentRgb)

    out['--good'] = '#3ad07f'
    out['--good-text'] = '#3ad07f'
    out['--danger'] = '#ff6b8a'
    out['--warn-bg'] = hslHex(45, 40, clamp(l + 4, 16, 26))
    out['--ok-bg'] = hslHex(145, 40, clamp(l + 2, 14, 24))
    out['--no-bg'] = hslHex(350, 40, clamp(l + 2, 14, 24))
    out['--mark-bg'] = hslHex(h, 45, clamp(l + 18, 26, 44))
    out['--mark-text'] = '#ffffff'
    for (let i = 0; i < 8; i++) out[`--cat-${i}`] = hslHex(h + i * 45, 60, 68)
    out['--shadow'] = '0 1px 2px rgba(0, 0, 0, 0.4), 0 4px 16px rgba(0, 0, 0, 0.4)'
  } else {
    const { l } = rgbToHsl(baseRgb)
    const surfaceHsl = { h, s: Math.min(s, 45), l: clamp(l + (100 - l) * 0.55, 92, 99) }
    const surfaceRgb = hslToRgb(surfaceHsl)
    out['--surface'] = rgbToHex(surfaceRgb)
    const inkBase = forContrast({ h, s: Math.min(s, 24), l: 14 }, surfaceRgb, 8, 'dark')
    out['--ink'] = hslHex(inkBase.h, Math.min(s, 24), inkBase.l)
    out['--ink-2'] = hslHex(h, Math.min(s, 22), 34)
    out['--muted'] = hslHex(h, Math.min(s, 18), 52)
    out['--hairline'] = hslHex(h, Math.min(s, 30), clamp(l - 10, 74, 92))
    out['--border'] = `rgba(${Math.round(hexToRgb(out['--ink']).r)}, ${Math.round(
      hexToRgb(out['--ink']).g)}, ${Math.round(hexToRgb(out['--ink']).b)}, 0.12)`

    const accentHsl = forContrast({ h, s: clamp(s + 10, 55, 85), l: 46 }, { r: 255, g: 255, b: 255 }, 4, 'dark')
    const accentRgb = hslToRgb(accentHsl)
    out['--accent'] = rgbToHex(accentRgb)
    out['--accent-ink'] = inkOn(accentRgb)

    out['--good'] = '#1a9d5c'
    out['--good-text'] = '#0f7a44'
    out['--danger'] = '#d0342f'
    out['--warn-bg'] = hslHex(43, 70, 92)
    out['--ok-bg'] = hslHex(140, 45, 93)
    out['--no-bg'] = hslHex(352, 65, 94)
    out['--mark-bg'] = hslHex(h, 70, 82)
    out['--mark-text'] = out['--ink']
    for (let i = 0; i < 8; i++) out[`--cat-${i}`] = hslHex(h + i * 45, 62, 46)
    out['--shadow'] = '0 1px 2px rgba(11, 11, 11, 0.05), 0 4px 16px rgba(11, 11, 11, 0.06)'
  }

  return out
}

/**
 * Color theme preference. Like the API key and model, the choice lives only
 * in this browser's localStorage (set in Settings) — it is never part of a
 * data backup, so it stays device-local.
 *
 * Every theme except "auto" maps to a `data-theme` attribute on <html>; the
 * actual palettes are token sets in styles.css. "auto" clears the attribute
 * and lets `prefers-color-scheme` drive light vs dark, matching the OS.
 *
 * "custom" is special: there is no CSS block for it. Its palette is derived
 * from a single owner-picked background colour (see customTheme.ts) and written
 * as inline CSS vars on <html>. The picked colour and the derived palette both
 * live in localStorage so index.html can paint it before first paint.
 */

import { CUSTOM_VARS, DEFAULT_CUSTOM_COLOR, deriveCustomPalette, normalizeHex } from './customTheme'

export type ThemeId =
  | 'auto'
  | 'light'
  | 'dark'
  | 'midnight'
  | 'sunset'
  | 'forest'
  | 'grape'
  | 'ocean'
  | 'blossom'
  | 'mint'
  | 'lavender'
  | 'sky'
  | 'custom'

/** `bg` + `dots` are only indicative colors for the Settings picker cards. */
export const THEMES: { id: ThemeId; label: string; bg: string; dots: string[] }[] = [
  { id: 'auto', label: 'Auto', bg: '#f9f9f7', dots: ['#2a78d6', '#1baf7a', '#e34948'] },
  { id: 'light', label: 'Light', bg: '#f9f9f7', dots: ['#2a78d6', '#1baf7a', '#e34948'] },
  { id: 'dark', label: 'Dark', bg: '#0d0d0d', dots: ['#3987e5', '#199e70', '#e66767'] },
  { id: 'midnight', label: 'Midnight', bg: '#12122b', dots: ['#8b7bf0', '#35c69a', '#ff7a8a'] },
  { id: 'sunset', label: 'Sunset', bg: '#fff5ee', dots: ['#d64d2c', '#1aa877', '#e06aa0'] },
  { id: 'forest', label: 'Forest', bg: '#f2f7f0', dots: ['#2e7d4f', '#cf8c1e', '#d0453b'] },
  { id: 'grape', label: 'Grape', bg: '#1e1330', dots: ['#c07be0', '#4ecb86', '#ff7091'] },
  { id: 'ocean', label: 'Ocean', bg: '#0b1e2a', dots: ['#33b3c9', '#3ccf8f', '#ff7080'] },
  { id: 'blossom', label: 'Blossom', bg: '#fdf1f6', dots: ['#d1568c', '#1aa877', '#7b5bd6'] },
  { id: 'mint', label: 'Mint', bg: '#edf9f1', dots: ['#1a9e73', '#2f7fd6', '#e0682f'] },
  { id: 'lavender', label: 'Lavender', bg: '#f3f0fb', dots: ['#7c6bd6', '#1aa877', '#d76aa0'] },
  { id: 'sky', label: 'Sky', bg: '#edf4fc', dots: ['#2f83d6', '#1aa877', '#e0682f'] },
]

const THEME_STORAGE = 'sh.theme'
const COLOR_STORAGE = 'sh.themeColor'
const PALETTE_STORAGE = 'sh.customPalette'
// "custom" isn't in THEMES (it has a colour-picker card, not a swatch), but is
// still a valid stored value.
const THEME_IDS = new Set<ThemeId>([...THEMES.map((t) => t.id), 'custom'])
export const DEFAULT_THEME: ThemeId = 'auto'

export function getTheme(): ThemeId {
  const v = localStorage.getItem(THEME_STORAGE)
  return v && THEME_IDS.has(v as ThemeId) ? (v as ThemeId) : DEFAULT_THEME
}

export function setTheme(id: ThemeId) {
  localStorage.setItem(THEME_STORAGE, id)
}

/** The background colour behind the "custom" theme (localStorage, device-local). */
export function getThemeColor(): string {
  return localStorage.getItem(COLOR_STORAGE) || DEFAULT_CUSTOM_COLOR
}

/**
 * Store a new custom background colour and cache its derived palette as JSON so
 * the pre-paint inline script in index.html can apply it without re-running the
 * derivation. Call applyTheme('custom') afterwards to make it live.
 */
export function setThemeColor(hex: string) {
  const clean = normalizeHex(hex)
  localStorage.setItem(COLOR_STORAGE, clean)
  localStorage.setItem(PALETTE_STORAGE, JSON.stringify(deriveCustomPalette(clean)))
}

function readCustomPalette(): Record<string, string> {
  try {
    const cached = localStorage.getItem(PALETTE_STORAGE)
    if (cached) return JSON.parse(cached)
  } catch {
    /* fall through to a fresh derivation */
  }
  return deriveCustomPalette(getThemeColor())
}

/**
 * Apply a theme to the document: set (or clear, for "auto") the data-theme
 * attribute, then sync the single <meta name="theme-color"> to the resolved
 * page background so the iOS/Android status bar matches the UI.
 */
export function applyTheme(id: ThemeId) {
  const root = document.documentElement
  // Clear any inline vars left by a previous "custom" selection so they can't
  // leak into a named theme.
  CUSTOM_VARS.forEach((v) => root.style.removeProperty(v))

  if (id === 'auto') root.removeAttribute('data-theme')
  else root.dataset.theme = id

  if (id === 'custom') {
    const palette = readCustomPalette()
    for (const [k, v] of Object.entries(palette)) root.style.setProperty(k, v)
  }

  const page = getComputedStyle(root).getPropertyValue('--page').trim()
  if (page) {
    let meta = document.querySelector<HTMLMetaElement>('meta[name="theme-color"]')
    if (!meta) {
      meta = document.createElement('meta')
      meta.name = 'theme-color'
      document.head.appendChild(meta)
    }
    meta.content = page
  }
}

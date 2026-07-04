/**
 * Color theme preference. Like the API key and model, the choice lives only
 * in this browser's localStorage (set in Settings) — it is never part of a
 * data backup, so it stays device-local.
 *
 * Every theme except "auto" maps to a `data-theme` attribute on <html>; the
 * actual palettes are token sets in styles.css. "auto" clears the attribute
 * and lets `prefers-color-scheme` drive light vs dark, matching the OS.
 */

export type ThemeId =
  | 'auto'
  | 'light'
  | 'dark'
  | 'midnight'
  | 'sunset'
  | 'forest'
  | 'grape'
  | 'ocean'

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
]

const THEME_STORAGE = 'sh.theme'
const THEME_IDS = new Set(THEMES.map((t) => t.id))
export const DEFAULT_THEME: ThemeId = 'auto'

export function getTheme(): ThemeId {
  const v = localStorage.getItem(THEME_STORAGE)
  return v && THEME_IDS.has(v as ThemeId) ? (v as ThemeId) : DEFAULT_THEME
}

export function setTheme(id: ThemeId) {
  localStorage.setItem(THEME_STORAGE, id)
}

/**
 * Apply a theme to the document: set (or clear, for "auto") the data-theme
 * attribute, then sync the single <meta name="theme-color"> to the resolved
 * page background so the iOS/Android status bar matches the UI.
 */
export function applyTheme(id: ThemeId) {
  const root = document.documentElement
  if (id === 'auto') root.removeAttribute('data-theme')
  else root.dataset.theme = id

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

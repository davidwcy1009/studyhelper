import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { registerSW } from 'virtual:pwa-register'
import App from './App'
import { applyTheme, getTheme } from './theme'
import './styles.css'

registerSW({ immediate: true })

// Source of truth for the active theme (the inline script in index.html only
// sets data-theme early to avoid a flash; here we also sync the status-bar
// theme-color meta). When on "auto", follow OS light/dark changes live.
applyTheme(getTheme())
window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
  if (getTheme() === 'auto') applyTheme('auto')
})

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)

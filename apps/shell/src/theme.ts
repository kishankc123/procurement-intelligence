// The colour theme: light (a white, blue and teal identity) by default, dark as an option. The choice is remembered in localStorage; if storage is
// blocked the page simply starts light every time.
export type Theme = 'light' | 'dark'
const KEY = 'pi.theme'

export function readTheme(): Theme {
  try { return localStorage.getItem(KEY) === 'dark' ? 'dark' : 'light' } catch { return 'light' }
}

export function applyTheme(theme: Theme) {
  document.documentElement.dataset.theme = theme
  try { localStorage.setItem(KEY, theme) } catch { /* storage blocked: the choice lasts for this page only */ }
}

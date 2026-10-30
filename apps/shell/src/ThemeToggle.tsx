import { useState } from 'react'
import { applyTheme, readTheme, type Theme } from './theme'
import styles from './App.module.css'

/** Light or dark, in the top bar. A real button with the state in its label, so it does not rely on colour or an icon alone. */
export function ThemeToggle() {
  const [theme, setTheme] = useState<Theme>(() => document.documentElement.dataset.theme === 'dark' ? 'dark' : readTheme())
  const next: Theme = theme === 'light' ? 'dark' : 'light'
  return (
    <button type="button" className={styles.themeToggle} onClick={() => { applyTheme(next); setTheme(next) }} aria-label={`Switch to the ${next} theme`}>
      {theme === 'light' ? 'Dark' : 'Light'} theme
    </button>
  )
}

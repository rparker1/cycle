import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { App } from './app/App'
import './styles/app.css'

// Apply the saved theme before first paint, so a dark-mode user never sees a
// flash of cream.
const saved = (() => {
  try {
    return localStorage.getItem('cycle.theme')
  } catch {
    return null
  }
})()
if (saved === 'light' || saved === 'dark') {
  document.documentElement.setAttribute('data-theme', saved)
}

createRoot(document.getElementById('root') as HTMLElement).render(
  <StrictMode>
    <App />
  </StrictMode>,
)

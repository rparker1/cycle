import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { registerSW } from 'virtual:pwa-register'
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

/*
 * Service worker updates.
 *
 * An installed PWA is not reloaded between uses — it can sit in the app
 * switcher for a week. Left to itself the browser serves the cached build and
 * only picks up a new one on some later launch, so a deploy appears to have
 * done nothing. Two things fix that:
 *
 *   - ask the registration to check for a new worker every time the app comes
 *     back to the foreground, not only on a cold start;
 *   - reload once when a new worker takes control, so the running page is
 *     never a version behind what is installed.
 */
const updateServiceWorker = registerSW({
  immediate: true,
  onRegisteredSW(_url, registration) {
    if (!registration) return
    const checkForUpdate = () => {
      if (document.visibilityState === 'visible') void registration.update()
    }
    document.addEventListener('visibilitychange', checkForUpdate)
    window.addEventListener('focus', checkForUpdate)
  },
})

if ('serviceWorker' in navigator) {
  let reloading = false
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (reloading) return
    reloading = true
    window.location.reload()
  })
}

void updateServiceWorker

createRoot(document.getElementById('root') as HTMLElement).render(
  <StrictMode>
    <App />
  </StrictMode>,
)

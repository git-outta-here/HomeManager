import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import { initSync } from './sync'
import './styles.css'

initSync()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)

if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  navigator.serviceWorker.register(`${import.meta.env.BASE_URL}sw.js`).catch(() => {})
}

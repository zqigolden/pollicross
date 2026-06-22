import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'
import { captureKeyFromHash } from './utils/pollinationsApi'

// Capture any sk_ key returned in the URL fragment from the Pollinations
// consent screen before the app renders.
captureKeyFromHash()

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
)

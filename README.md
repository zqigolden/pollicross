# 🎮 PolliCross: AI Nonogram Generator

An interactive, web-based **Picross (Nonogram) puzzle game** that generates custom grid levels on-the-fly using AI-generated images from Pollinations.ai. Once you solve the pixel grid puzzle, the high-resolution AI source image is revealed as your reward.

Built for the **Pollinations App Showcase** submission.

---

## 🚀 Live Demo & Repository
*   **Demo URL**: `https://zqigolden.github.io/amazing-shannon/`
*   **GitHub Repository**: `https://github.com/zqigolden/amazing-shannon`

---

## 🎨 Features
*   **AI Puzzle Generation**: Input any text prompt (e.g. "Dinosaur", "Spaceship", "Coffee Mug") and choose a style preset (Pixel Art, Neon Silhouette, Flat Vector, Chibi Outline) to generate a unique level.
*   **Interactive Game Board**: Grid supports left-click painting (to fill cells) and right-click crossing (X marks), along with drag-to-draw mouse gestures and mobile-friendly toggle buttons.
*   **Complexity-Aware Binarization**: Downscales the high-resolution AI image to `N x N` using HTML5 Canvas, then sweeps multiple thresholds and transforms and selects the candidate that maximises puzzle complexity (row/column run transitions) — producing detailed, recognisable silhouettes instead of large solid blocks.
*   **Procedural 8-bit Audio**: Synthesizes chiptune background music and sound effects (clicks, crosses, and a victory fanfare) dynamically using the browser's Web Audio API (zero static asset loading).
*   **Difficulty Tiers**: Supports three board difficulties:
    *   **Easy**: 5 × 5 grid.
    *   **Medium**: 10 × 10 grid.
    *   **Hard**: 15 × 15 grid.

---

## 🔌 Pollinations.ai Integration (Hybrid)

The app supports two ways to generate:

*   **Guest (no login)**: requests go to the legacy `image.pollinations.ai` host anonymously — free, no account needed, but rate-limited (~1 image/15s) and may include a watermark.
*   **Connected (BYOP)**: after logging in with a Pollinations account via **Bring Your Own Pollen (BYOP)**, generation runs through the `gen.pollinations.ai` gateway on the player's own balance — faster and watermark-free.

### Authentication flow
1.  The app sends the user to `https://enter.pollinations.ai/authorize` with its public **App Key** (`client_id=pk_wALQm7skU45vslV8`) and `redirect_uri`.
2.  The user signs in with their Pollinations account and approves access.
3.  Pollinations redirects back with a scoped user key in the URL fragment (`#api_key=sk_...`). Fragments never reach servers or logs.
4.  The app stores that `sk_` key and sends it as an `Authorization: Bearer` header on generation requests.

### Image Generation Endpoint
`GET https://image.pollinations.ai/prompt/{prompt}?model=flux&width=512&height=512&seed={randomSeed}&nologo=true&key=sk_...`
The user's authorized `sk_` key is passed as `?key=` (the endpoint also accepts an `Authorization: Bearer` header). The response is fetched as a blob and converted to a same-origin object URL, which keeps the binarization canvas untainted.

*   **App Key**: The publishable `pk_` key only identifies the app on the consent screen and for traffic attribution — it cannot generate beyond a small per-IP limit, so usage is billed to the authenticated user.
*   **Image Model**: Uses the `flux` model for sharp outlines and high-contrast styling, which facilitates optimal grid conversion.

> **Deploy note:** Register the app's redirect URIs (`https://zqigolden.github.io/amazing-shannon/` and `http://localhost:5173` for local dev) on the App Key at [enter.pollinations.ai](https://enter.pollinations.ai), or the login redirect will be rejected.

---

## 🛠️ Local Development

### Prerequisites
*   Node.js (v18 or higher)
*   npm

### Setup
1.  Clone the repository:
    ```bash
    git clone https://github.com/zqigolden/amazing-shannon.git
    cd amazing-shannon
    ```
2.  Install dependencies:
    ```bash
    npm install
    ```
3.  Start the local development server:
    ```bash
    npm run dev
    ```
    Open `http://localhost:5173` in your browser.

---

## 📦 Deployment to GitHub Pages

The project is pre-configured for one-click deployment using `gh-pages`:

1.  Build and deploy the application:
    ```bash
    npm run deploy
    ```
2.  The application will be built and pushed to the `gh-pages` branch, serving dynamically from `https://zqigolden.github.io/amazing-shannon/`.

*(Note: Remember to replace `zqigolden` in `vite.config.js` and this `README.md` if deploying under a different repository base).*

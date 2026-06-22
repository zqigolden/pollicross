# 🎮 PolliCross — AI Nonogram Generator

[![Built with Pollinations](https://img.shields.io/badge/Built%20with-Pollinations-8a2be2?style=for-the-badge)](https://pollinations.ai)
[![Play now](https://img.shields.io/badge/▶_Play-Live_Demo-00f0ff?style=for-the-badge)](https://zqigolden.github.io/pollicross/)

**PolliCross** turns any idea into a playable [Picross / Nonogram](https://en.wikipedia.org/wiki/Nonogram) puzzle. Type a prompt, pick an art style, and an AI image is generated, distilled into a grid puzzle for you to solve. Crack the grid and the original artwork is revealed as your reward.

🔗 **Play it now: [zqigolden.github.io/pollicross](https://zqigolden.github.io/pollicross/)**

---

## 🕹️ How to play

1. **Describe a puzzle** — type anything (`Dinosaur`, `Spaceship`, `Coffee Mug`) or roll the dice for a random prompt.
2. **Pick an art style** — Pixel Art, Neon Silhouette, Flat Vector, or Cute Outline.
3. **Choose a difficulty** — Easy (5×5), Medium (10×10), or Hard (15×15).
4. **Solve the nonogram** — use the row and column number clues to figure out which cells are filled:
   - **Left-click** a cell to fill it.
   - **Right-click** to mark a cell with an ✕ (a cell you're sure is empty).
   - **Click and drag** to paint a straight line of cells.
   - On touch devices, switch between the **Paint** and **Cross** tools with the buttons above the board.
5. **Win** — when the grid matches the hidden picture, the AI artwork fades in and expands to reveal the full image. 🎉

No account is required to start playing.

---

## ✨ Features

- **AI-generated levels** — every puzzle is built on the fly from a [Pollinations](https://pollinations.ai) `flux` image, so the game never runs out of content.
- **Faithful puzzles** — the image is auto-cropped to its subject and binarized with Otsu's method, so the solved grid actually looks like the picture (no tiny subjects lost in empty borders, no giant solid blocks).
- **Satisfying reveal** — solving the grid fades the real artwork in over your solution, then zooms out to show the complete generated image.
- **Procedural 8-bit audio** — chiptune background music and sound effects are synthesized live with the Web Audio API (no audio files to download).
- **Play as guest or sign in** — try it instantly without an account, or connect a Pollinations account for faster, watermark-free generation on your own balance (see below).
- **Mobile-friendly** — works with mouse drag or touch toggles.

---

## 🔌 Pollinations integration

PolliCross uses the [Pollinations](https://pollinations.ai) API for image generation in two modes:

| Mode | How it works | Trade-offs |
| --- | --- | --- |
| **Guest** (default) | Anonymous requests to `image.pollinations.ai`, identified by a `referrer`. | Free, no sign-in — but rate-limited and may include a watermark. |
| **Connected** (BYOP) | Sign in with a Pollinations account; generation runs through `gen.pollinations.ai` on your own balance. | Faster, watermark-free, no shared rate limit. |

**Bring Your Own Pollen (BYOP)** is Pollinations' user-authorization flow. The app sends you to `enter.pollinations.ai/authorize` with its public App Key (`pk_…`); after you approve, Pollinations returns a short-lived, budget-capped user key (`sk_…`) in the URL fragment, which the app uses as a `Bearer` token. Your key stays in your browser, and you can revoke access anytime from your Pollinations dashboard.

---

## 🧩 How it works (for developers)

The interesting part is turning a full-color AI image into a solvable, recognizable nonogram:

1. **Generate** — `flux` produces a 512×512 image, fetched as a blob so the canvas reading it stays same-origin (untainted).
2. **Locate the subject** — the image is analyzed at low resolution; Otsu's threshold plus a border sample separate the subject from the background and find its bounding box.
3. **Auto-crop** — the image is cropped to that bounding box (with a small margin and a capped aspect ratio to avoid harsh distortion) and rescaled to fill the grid, so the subject isn't a tiny speck.
4. **Binarize** — the cropped region is thresholded with Otsu, then a small sweep around the Otsu value picks the threshold that **minimizes trivial rows/columns** (lines that are entirely empty or entirely filled), keeping puzzles interesting while staying faithful to the image.
5. **Reveal** — on solve, the real image fades in over the grid using the *same crop*, then the success screen animates from that crop out to the full picture.

Core source files:

```
src/
├── App.jsx                  # screen flow & state (config → loading → play → success)
├── components/
│   ├── ConfigPanel.jsx      # prompt, style preset, difficulty
│   └── GameGrid.jsx         # interactive board, clues, reveal overlay
├── logic/
│   └── picrossLogic.js      # clue generation, win check, prompt presets
└── utils/
    ├── pollinationsApi.js   # BYOP auth + guest/connected image generation
    ├── imageProcessor.js    # Otsu binarization, auto-crop, threshold sweep
    └── soundManager.js      # Web Audio chiptune music & SFX
```

**Tech stack:** React 19 · Vite · lucide-react · HTML5 Canvas · Web Audio API · Pollinations API.

---

## 🛠️ Local development

**Prerequisites:** Node.js 18+ and npm.

```bash
# clone
git clone https://github.com/zqigolden/pollicross.git
cd pollicross

# install
npm install

# run dev server (http://localhost:5173)
npm run dev

# production build
npm run build

# preview the production build
npm run preview
```

> If you want the **sign-in** flow to work locally or on your own deployment, register your redirect URIs (e.g. `http://localhost:5173/` and your production URL) on the App Key at [enter.pollinations.ai](https://enter.pollinations.ai), and set your own `pk_` key in `src/utils/pollinationsApi.js`. Guest mode works without any of this.

---

## 📦 Deployment (GitHub Pages)

The project is configured for GitHub Pages via the `gh-pages` package. The Vite `base` is set to `/pollicross/` in `vite.config.js` — change it to match your repository name if you fork.

```bash
npm run deploy   # builds and publishes dist/ to the gh-pages branch
```

Then enable Pages (serving from the `gh-pages` branch) in your repository settings.

---

## 🤝 Contributing

Issues and pull requests are welcome — bug reports, new art-style presets, better binarization heuristics, accessibility improvements, and UI polish are all appreciated. Please keep changes lint-clean (`npm run lint`).

---

## 🙏 Credits & license

Image generation is powered by [**Pollinations.AI**](https://pollinations.ai), an open generative-AI platform.

Released under the [MIT License](https://opensource.org/licenses/MIT) — free to use, modify, and share.

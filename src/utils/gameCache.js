/**
 * Persists an in-progress game to localStorage so it survives a reload / reopen.
 *
 * The (large) generated image is stored under its own key and written once per
 * puzzle, while the small board metadata (grids, prompt, crop, hints, timer) is
 * rewritten cheaply as the player plays.
 */

const META_KEY = 'pollicross_game_v1';
const IMG_KEY = 'pollicross_game_img_v1';

export function saveMeta(meta) {
  try {
    localStorage.setItem(META_KEY, JSON.stringify(meta));
  } catch {
    // storage full / unavailable — ignore
  }
}

export function saveImage(dataUrl) {
  try {
    localStorage.setItem(IMG_KEY, dataUrl);
  } catch {
    // ignore
  }
}

/**
 * @returns {{ meta: object, image: string } | null} the saved game, or null if
 * there is no valid in-progress game.
 */
export function loadGame() {
  try {
    const raw = localStorage.getItem(META_KEY);
    if (!raw) return null;
    const meta = JSON.parse(raw);
    if (!meta || !Array.isArray(meta.playerGrid) || !Array.isArray(meta.answerGrid) || meta.playerGrid.length === 0) {
      return null;
    }
    const image = localStorage.getItem(IMG_KEY) || '';
    return { meta, image };
  } catch {
    return null;
  }
}

export function clearGame() {
  try {
    localStorage.removeItem(META_KEY);
    localStorage.removeItem(IMG_KEY);
  } catch {
    // ignore
  }
}

/**
 * Image processing utilities to convert generated images into Picross grids.
 *
 * Pipeline:
 *  1. Analyse the full image to find the subject (Otsu threshold + a border
 *     sample to tell subject from background).
 *  2. Auto-crop to the subject's bounding box (small margin, capped aspect
 *     ratio) and rescale so the subject fills the grid — no tiny subject lost
 *     in empty borders.
 *  3. Binarize the cropped region into the N x N grid.
 *
 * The same crop is applied to the revealed image so the picture lines up with
 * the solved grid.
 */

const ANALYSIS = 100;     // resolution for subject detection
const MARGIN = 0.06;      // crop padding, fraction of analysis size
const MAX_ASPECT = 1.7;   // cap stretch so the subject isn't badly distorted
const INVERT_ABOVE = 0.62; // if full-frame fill exceeds this, flip subject side

/**
 * Loads an image from a URL and resolves with the HTMLImageElement.
 * @param {string} url - Image source URL (http(s) or blob: object URL)
 * @returns {Promise<HTMLImageElement>}
 */
export function loadImage(url) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Failed to load generated AI image. Please retry.'));
    img.src = url;
  });
}

/** Otsu threshold (0-255) maximising between-class variance. */
function otsuThreshold(values) {
  const hist = new Array(256).fill(0);
  for (const v of values) hist[Math.max(0, Math.min(255, Math.round(v)))]++;
  const total = values.length;
  let sumAll = 0;
  for (let i = 0; i < 256; i++) sumAll += i * hist[i];
  let sumB = 0;
  let wB = 0;
  let maxVar = -1;
  let threshold = 127;
  for (let t = 0; t < 256; t++) {
    wB += hist[t];
    if (wB === 0) continue;
    const wF = total - wB;
    if (wF === 0) break;
    sumB += t * hist[t];
    const mB = sumB / wB;
    const mF = (sumAll - sumB) / wF;
    const between = wB * wF * (mB - mF) * (mB - mF);
    if (between > maxVar) {
      maxVar = between;
      threshold = t;
    }
  }
  return threshold;
}

/** Draws (a region of) the image into an w x h canvas and returns grayscale + alpha grids. */
function sample(img, w, h, src) {
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;
  if (src) {
    ctx.drawImage(img, src.sx, src.sy, src.sw, src.sh, 0, 0, w, h);
  } else {
    ctx.drawImage(img, 0, 0, w, h);
  }
  const { data } = ctx.getImageData(0, 0, w, h);
  const gray = [];
  const alpha = [];
  const valid = [];
  for (let r = 0; r < h; r++) {
    const gRow = [];
    const aRow = [];
    for (let c = 0; c < w; c++) {
      const idx = (r * w + c) * 4;
      const g = 0.299 * data[idx] + 0.587 * data[idx + 1] + 0.114 * data[idx + 2];
      const a = data[idx + 3];
      gRow.push(g);
      aRow.push(a);
      if (a >= 50) valid.push(g);
    }
    gray.push(gRow);
    alpha.push(aRow);
  }
  return { gray, alpha, valid };
}

/** Border-based background brightness (transparent pixels ignored). */
function backgroundBrightness(gray, alpha, fallback) {
  const h = gray.length;
  const w = gray[0].length;
  let sum = 0;
  let count = 0;
  for (let r = 0; r < h; r++) {
    for (let c = 0; c < w; c++) {
      if ((r === 0 || r === h - 1 || c === 0 || c === w - 1) && alpha[r][c] >= 50) {
        sum += gray[r][c];
        count++;
      }
    }
  }
  return count > 0 ? sum / count : fallback;
}

/** Builds a 0/1 mask: subject = darker (or lighter) than threshold. */
function mask(gray, alpha, threshold, subjectIsDark) {
  const h = gray.length;
  const w = gray[0].length;
  const m = [];
  let filled = 0;
  for (let r = 0; r < h; r++) {
    const row = [];
    for (let c = 0; c < w; c++) {
      const transparent = alpha[r][c] < 50;
      const fg = !transparent && (subjectIsDark ? gray[r][c] < threshold : gray[r][c] >= threshold);
      if (fg) filled++;
      row.push(fg ? 1 : 0);
    }
    m.push(row);
  }
  return { m, fillRatio: filled / (w * h) };
}

/** Counts rows + columns that are entirely empty (all 0) or entirely filled (all 1). */
function countTrivialLines(grid) {
  const n = grid.length;
  let trivial = 0;
  for (let i = 0; i < n; i++) {
    let rowSum = 0;
    let colSum = 0;
    for (let j = 0; j < n; j++) {
      rowSum += grid[i][j];
      colSum += grid[j][i];
    }
    if (rowSum === 0 || rowSum === n) trivial++;
    if (colSum === 0 || colSum === n) trivial++;
  }
  return trivial;
}

/**
 * Downscales + auto-crops + binarizes an image into an N x N grid.
 *
 * @param {HTMLImageElement} img
 * @param {number} size - grid size (5, 10, 15)
 * @returns {{ grid: number[][], crop: {x:number,y:number,w:number,h:number} }}
 *          crop is normalised [0,1] coordinates into the source image.
 */
export function binarizeImage(img, size) {
  const fullCrop = { x: 0, y: 0, w: 1, h: 1 };
  const emptyGrid = () => Array.from({ length: size }, () => Array(size).fill(0));

  // --- Pass A: analyse full frame to locate the subject ---
  const a = sample(img, ANALYSIS, ANALYSIS, null);
  if (!a || a.valid.length === 0) return { grid: emptyGrid(), crop: fullCrop };

  const thA = otsuThreshold(a.valid);
  const bgA = backgroundBrightness(a.gray, a.alpha, a.valid.reduce((s, v) => s + v, 0) / a.valid.length);
  let subjectIsDark = bgA > thA; // subject is the side away from background
  let { m } = mask(a.gray, a.alpha, thA, subjectIsDark);

  // If the "subject" covers most of the frame, background detection probably
  // flipped — invert so we track the actual subject silhouette.
  let fillA = m.flat().reduce((s, v) => s + v, 0) / (ANALYSIS * ANALYSIS);
  if (fillA > INVERT_ABOVE) {
    subjectIsDark = !subjectIsDark;
    ({ m } = mask(a.gray, a.alpha, thA, subjectIsDark));
    fillA = m.flat().reduce((s, v) => s + v, 0) / (ANALYSIS * ANALYSIS);
  }

  // Bounding box of the subject.
  let minR = ANALYSIS, minC = ANALYSIS, maxR = -1, maxC = -1;
  for (let r = 0; r < ANALYSIS; r++) {
    for (let c = 0; c < ANALYSIS; c++) {
      if (m[r][c]) {
        if (r < minR) minR = r;
        if (r > maxR) maxR = r;
        if (c < minC) minC = c;
        if (c > maxC) maxC = c;
      }
    }
  }

  let crop = fullCrop;
  if (maxR >= 0 && fillA < 0.95) {
    const pad = Math.round(MARGIN * ANALYSIS);
    let x0 = Math.max(0, minC - pad);
    let y0 = Math.max(0, minR - pad);
    let x1 = Math.min(ANALYSIS - 1, maxC + pad);
    let y1 = Math.min(ANALYSIS - 1, maxR + pad);
    let cw = x1 - x0 + 1;
    let ch = y1 - y0 + 1;

    // Cap the aspect ratio by widening the shorter side (centered, clamped).
    if (cw / ch > MAX_ASPECT) {
      const target = Math.min(ANALYSIS, Math.round(cw / MAX_ASPECT));
      const extra = target - ch;
      y0 = Math.max(0, y0 - Math.floor(extra / 2));
      y1 = Math.min(ANALYSIS - 1, y0 + target - 1);
      y0 = Math.max(0, y1 - target + 1);
    } else if (ch / cw > MAX_ASPECT) {
      const target = Math.min(ANALYSIS, Math.round(ch / MAX_ASPECT));
      const extra = target - cw;
      x0 = Math.max(0, x0 - Math.floor(extra / 2));
      x1 = Math.min(ANALYSIS - 1, x0 + target - 1);
      x0 = Math.max(0, x1 - target + 1);
    }
    cw = x1 - x0 + 1;
    ch = y1 - y0 + 1;
    crop = { x: x0 / ANALYSIS, y: y0 / ANALYSIS, w: cw / ANALYSIS, h: ch / ANALYSIS };
  }

  // --- Pass B: binarize the cropped region into the final grid ---
  const srcW = img.naturalWidth || img.width || ANALYSIS;
  const srcH = img.naturalHeight || img.height || ANALYSIS;
  const src = {
    sx: crop.x * srcW,
    sy: crop.y * srcH,
    sw: crop.w * srcW,
    sh: crop.h * srcH,
  };
  const b = sample(img, size, size, crop === fullCrop ? null : src);
  if (!b || b.valid.length === 0) return { grid: emptyGrid(), crop };

  const thB = otsuThreshold(b.valid);

  // The plain Otsu result can still leave many trivial lines (rows/columns that
  // are entirely empty or entirely filled), which makes a dull puzzle. Sweep
  // thresholds around Otsu and pick the one with the fewest trivial lines,
  // staying close to Otsu (and a balanced fill) to keep the image faithful.
  const candidates = new Set([thB]);
  for (let t = thB - 48; t <= thB + 48; t += 8) candidates.add(Math.round(t));

  let best = null;
  for (const t of candidates) {
    if (t < 1 || t > 254) continue;
    const { m, fillRatio: fr } = mask(b.gray, b.alpha, t, subjectIsDark);
    if (fr < 0.1 || fr > 0.9) continue; // skip near-degenerate boards
    const trivial = countTrivialLines(m);
    // Trivial-line count dominates; then prefer a balanced fill and a threshold
    // near Otsu (small deviation).
    const score = trivial * 100 + Math.abs(fr - 0.45) * 25 + Math.abs(t - thB) * 0.05;
    if (!best || score < best.score) best = { m, fr, score };
  }

  const fallback = mask(b.gray, b.alpha, thB, subjectIsDark);
  const grid = best ? best.m : fallback.m;
  const fillRatio = best ? best.fr : fallback.fillRatio;

  // Guard against degenerate all-empty / all-filled boards.
  if (fillRatio === 0) {
    grid[Math.floor(size / 2)][Math.floor(size / 2)] = 1;
  } else if (fillRatio === 1) {
    grid[0][0] = 0;
    grid[0][size - 1] = 0;
    grid[size - 1][0] = 0;
    grid[size - 1][size - 1] = 0;
  }

  return { grid, crop };
}

/**
 * Inline style that displays the given normalised crop region of an image,
 * stretched to fill its (clipping, position:relative) container.
 * @param {{x:number,y:number,w:number,h:number}} crop
 */
export function cropStyle(crop) {
  if (!crop) return {};
  return {
    position: 'absolute',
    width: `${100 / crop.w}%`,
    height: `${100 / crop.h}%`,
    left: `${(-crop.x * 100) / crop.w}%`,
    top: `${(-crop.y * 100) / crop.h}%`,
    maxWidth: 'none',
  };
}

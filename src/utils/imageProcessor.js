/**
 * Image processing utilities to convert generated images into Picross grids.
 *
 * Goal: the solved grid should clearly resemble the revealed image. We draw the
 * full image into an N x N square (no scale/rotation jitter, so the grid aligns
 * 1:1 with the reveal overlay) and binarize with Otsu's method — the standard
 * threshold that best separates subject from background the way the eye does.
 */

/**
 * Loads an image from a URL and resolves with the HTMLImageElement.
 * @param {string} url - Image source URL (http(s) or blob: object URL)
 * @returns {Promise<HTMLImageElement>}
 */
export function loadImage(url) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous'; // harmless for blob: URLs, needed for remote URLs
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Failed to load generated AI image. Please retry.'));
    img.src = url;
  });
}

/**
 * Otsu's method: finds the grayscale threshold that maximises between-class
 * variance (best separation of foreground vs background).
 * @param {number[]} values - grayscale samples in [0, 255]
 * @returns {number} threshold in [0, 255]
 */
function otsuThreshold(values) {
  const hist = new Array(256).fill(0);
  for (const v of values) {
    hist[Math.max(0, Math.min(255, Math.round(v)))]++;
  }
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

/**
 * Downscales an image to N x N and binarizes it into 0/1 cells that resemble
 * the source image.
 *
 * @param {HTMLImageElement} img
 * @param {number} size - Target grid size (5, 10, or 15)
 * @returns {{ grid: number[][], scale: number, rotation: number }}
 */
export function binarizeImage(img, size) {
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');

  // Fill the whole square with the image. Source images are square (512x512),
  // so this matches the `object-fit: cover` framing used when the image is
  // revealed — the grid lines up with the picture exactly.
  if (ctx) {
    ctx.drawImage(img, 0, 0, size, size);
  }
  const empty = () => ({ grid: Array.from({ length: size }, () => Array(size).fill(0)), scale: 1, rotation: 0 });
  if (!ctx) return empty();

  const { data } = ctx.getImageData(0, 0, size, size);

  const grayGrid = [];
  const alphaGrid = [];
  const validGrays = [];
  for (let r = 0; r < size; r++) {
    const gRow = [];
    const aRow = [];
    for (let c = 0; c < size; c++) {
      const idx = (r * size + c) * 4;
      const gray = 0.299 * data[idx] + 0.587 * data[idx + 1] + 0.114 * data[idx + 2];
      const alpha = data[idx + 3];
      gRow.push(gray);
      aRow.push(alpha);
      if (alpha >= 50) validGrays.push(gray);
    }
    grayGrid.push(gRow);
    alphaGrid.push(aRow);
  }

  if (validGrays.length === 0) return empty();

  const threshold = otsuThreshold(validGrays);

  // Decide which side of the threshold is the subject: sample the border, which
  // is almost always background. The subject is the opposite (non-background) side.
  let borderSum = 0;
  let borderCount = 0;
  for (let r = 0; r < size; r++) {
    for (let c = 0; c < size; c++) {
      if ((r === 0 || r === size - 1 || c === 0 || c === size - 1) && alphaGrid[r][c] >= 50) {
        borderSum += grayGrid[r][c];
        borderCount++;
      }
    }
  }
  const avg = validGrays.reduce((a, b) => a + b, 0) / validGrays.length;
  const backgroundBrightness = borderCount > 0 ? borderSum / borderCount : avg;
  const isLightBackground = backgroundBrightness > threshold;

  const buildGrid = (subjectIsDark) => {
    const grid = [];
    let filled = 0;
    for (let r = 0; r < size; r++) {
      const row = [];
      for (let c = 0; c < size; c++) {
        const transparent = alphaGrid[r][c] < 50;
        const fg = !transparent && (subjectIsDark ? grayGrid[r][c] < threshold : grayGrid[r][c] >= threshold);
        if (fg) filled++;
        row.push(fg ? 1 : 0);
      }
      grid.push(row);
    }
    return { grid, fillRatio: filled / (size * size) };
  };

  // Subject is the non-background side.
  let { grid, fillRatio } = buildGrid(isLightBackground);

  // Safety net: the subject is normally the minority of cells. If more than ~62%
  // is filled, background detection likely flipped — invert so we paint the
  // subject silhouette rather than a giant block.
  if (fillRatio > 0.62) {
    ({ grid, fillRatio } = buildGrid(!isLightBackground));
  }

  // Guard against degenerate all-empty / all-filled boards.
  if (fillRatio === 0) {
    grid[Math.floor(size / 2)][Math.floor(size / 2)] = 1;
  } else if (fillRatio === 1) {
    grid[0][0] = 0;
    grid[0][size - 1] = 0;
    grid[size - 1][0] = 0;
    grid[size - 1][size - 1] = 0;
  }

  return { grid, scale: 1, rotation: 0 };
}

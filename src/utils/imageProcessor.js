/**
 * Image processing utilities to convert generated images into Picross grids.
 *
 * Selection strategy: rather than aiming for a 50:50 fill ratio (which tends to
 * threshold right through the middle of the subject and produce large, boring
 * solid black blocks), we sweep several thresholds + transforms and pick the
 * candidate that maximises PUZZLE COMPLEXITY — i.e. the number of run/segment
 * transitions across rows and columns. A recognisable, detailed silhouette has
 * many transitions; a solid blob has very few.
 */

const SCALES = [0.85, 1.0, 1.15];
const ROTATIONS = [-0.12, 0, 0.12]; // radians (~ -7° .. +7°)

// Thresholds are taken at these percentiles of the image's brightness
// distribution, letting the fill ratio vary instead of being pinned to ~50%.
const THRESHOLD_PERCENTILES = [0.30, 0.40, 0.50, 0.60, 0.70];

// Acceptable fill range. Capped well below 100% so the board never fills with
// big black regions, and above a floor so the puzzle isn't near-empty.
const MIN_FILL = 0.18;
const MAX_FILL = 0.58;
const IDEAL_FILL = 0.34; // gentle preference; complexity is the main objective.

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

/** Counts horizontal + vertical transitions between adjacent cells. */
function countTransitions(grid) {
  const size = grid.length;
  let transitions = 0;
  for (let r = 0; r < size; r++) {
    for (let c = 0; c < size; c++) {
      if (c + 1 < size && grid[r][c] !== grid[r][c + 1]) transitions++;
      if (r + 1 < size && grid[r][c] !== grid[r + 1][c]) transitions++;
    }
  }
  return transitions;
}

/** Normalised complexity score in [0, 1]. Solid blocks ~0, fine detail higher. */
function complexityScore(grid) {
  const size = grid.length;
  const maxTransitions = 2 * size * (size - 1);
  if (maxTransitions === 0) return 0;
  return countTransitions(grid) / maxTransitions;
}

/**
 * Renders the image at a given transform, then returns the per-cell grayscale
 * and alpha grids plus background-brightness info.
 */
function sampleGrid(img, size, scale, rotation) {
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;

  ctx.translate(size / 2, size / 2);
  ctx.rotate(rotation);
  ctx.scale(scale, scale);
  ctx.drawImage(img, -size / 2, -size / 2, size, size);

  const { data } = ctx.getImageData(0, 0, size, size);

  const grayscaleGrid = [];
  const alphaGrid = [];
  const validGrays = [];

  for (let r = 0; r < size; r++) {
    const rowGray = [];
    const rowAlpha = [];
    for (let c = 0; c < size; c++) {
      const idx = (r * size + c) * 4;
      const gray = 0.299 * data[idx] + 0.587 * data[idx + 1] + 0.114 * data[idx + 2];
      const alpha = data[idx + 3];
      rowGray.push(gray);
      rowAlpha.push(alpha);
      if (alpha >= 50) validGrays.push(gray);
    }
    grayscaleGrid.push(rowGray);
    alphaGrid.push(rowAlpha);
  }

  if (validGrays.length === 0) return null;

  // Estimate background brightness from the border (ignoring transparent pixels).
  let borderSum = 0;
  let borderCount = 0;
  for (let r = 0; r < size; r++) {
    for (let c = 0; c < size; c++) {
      if ((r === 0 || r === size - 1 || c === 0 || c === size - 1) && alphaGrid[r][c] >= 50) {
        borderSum += grayscaleGrid[r][c];
        borderCount++;
      }
    }
  }
  const avg = validGrays.reduce((a, b) => a + b, 0) / validGrays.length;
  const backgroundBrightness = borderCount > 0 ? borderSum / borderCount : avg;

  return {
    grayscaleGrid,
    alphaGrid,
    isLightBackground: backgroundBrightness > 127.5,
    sortedGrays: [...validGrays].sort((a, b) => a - b),
  };
}

/** Binarizes a sampled grid at a given brightness threshold. */
function binarizeAt(sample, size, threshold) {
  const { grayscaleGrid, alphaGrid, isLightBackground } = sample;
  const grid = [];
  let filled = 0;
  for (let r = 0; r < size; r++) {
    const row = [];
    for (let c = 0; c < size; c++) {
      const transparent = alphaGrid[r][c] < 50;
      // Foreground is whichever side of the threshold is NOT the background.
      const isForeground = !transparent && (
        isLightBackground ? grayscaleGrid[r][c] < threshold : grayscaleGrid[r][c] >= threshold
      );
      if (isForeground) filled++;
      row.push(isForeground ? 1 : 0);
    }
    grid.push(row);
  }
  return { grid, fillRatio: filled / (size * size) };
}

/**
 * Downscales and binarizes an image into an N x N grid of 0s and 1s, choosing
 * the transform + threshold that yields the most interesting (complex) puzzle.
 *
 * @param {HTMLImageElement} img
 * @param {number} size - Target grid size (5, 10, or 15)
 * @returns {{ grid: number[][], scale: number, rotation: number }}
 */
export function binarizeImage(img, size) {
  let best = null;          // qualifying candidate with highest score
  let fallback = null;      // closest-to-ideal fill if nothing qualifies

  for (const scale of SCALES) {
    for (const rotation of ROTATIONS) {
      const sample = sampleGrid(img, size, scale, rotation);
      if (!sample) continue;

      const { sortedGrays } = sample;
      for (const p of THRESHOLD_PERCENTILES) {
        const threshold = sortedGrays[Math.min(sortedGrays.length - 1, Math.floor(p * sortedGrays.length))];
        const { grid, fillRatio } = binarizeAt(sample, size, threshold);
        const complexity = complexityScore(grid);

        // Track an overall fallback by closeness to the ideal fill.
        const fillDistance = Math.abs(fillRatio - IDEAL_FILL);
        if (!fallback || fillDistance < fallback.fillDistance) {
          fallback = { grid, scale, rotation, fillDistance };
        }

        if (fillRatio < MIN_FILL || fillRatio > MAX_FILL) continue;

        // Primary objective: maximise complexity. Then a gentle nudge toward a
        // pleasant fill level and toward the untransformed image.
        const fillPenalty = 0.12 * Math.abs(fillRatio - IDEAL_FILL);
        const transformPenalty = 0.02 * (Math.abs(scale - 1.0) + Math.abs(rotation));
        const score = complexity - fillPenalty - transformPenalty;

        if (!best || score > best.score) {
          best = { grid, scale, rotation, score };
        }
      }
    }
  }

  const chosen = best || fallback;
  const grid = chosen
    ? chosen.grid
    : Array.from({ length: size }, () => Array(size).fill(0));
  const scale = chosen ? chosen.scale : 1.0;
  const rotation = chosen ? chosen.rotation : 0.0;

  // Safety: never hand back a fully empty or fully filled board.
  let filled = 0;
  for (let r = 0; r < size; r++) {
    for (let c = 0; c < size; c++) if (grid[r][c] === 1) filled++;
  }
  if (filled === 0) {
    grid[Math.floor(size / 2)][Math.floor(size / 2)] = 1;
  } else if (filled === size * size) {
    grid[0][0] = 0;
    grid[0][size - 1] = 0;
    grid[size - 1][0] = 0;
    grid[size - 1][size - 1] = 0;
  }

  return { grid, scale, rotation };
}

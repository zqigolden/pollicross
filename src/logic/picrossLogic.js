/**
 * Utility functions for Picross/Nonogram game logic
 */

/**
 * Generates clue numbers for a grid (rows or columns)
 * @param {Array<Array<number>>} grid - N x N binary matrix (1 = filled, 0 = empty)
 * @param {boolean} isColumns - True to calculate columns, false for rows
 * @returns {Array<Array<number>>} Array of clue runs for each row/column
 */
export function generateClues(grid, isColumns = false) {
  const size = grid.length;
  const clues = [];

  for (let i = 0; i < size; i++) {
    const lineClues = [];
    let currentRun = 0;

    for (let j = 0; j < size; j++) {
      const cellValue = isColumns ? grid[j][i] : grid[i][j];
      if (cellValue === 1) {
        currentRun++;
      } else {
        if (currentRun > 0) {
          lineClues.push(currentRun);
          currentRun = 0;
        }
      }
    }

    if (currentRun > 0) {
      lineClues.push(currentRun);
    }

    // Default to empty array if no clues (or [0] for visual clue placeholder)
    clues.push(lineClues.length > 0 ? lineClues : [0]);
  }

  return clues;
}

/**
 * Checks if the player's current grid matches the win condition.
 * A cell in playerGrid: 1 = filled, 0 = empty, -1 = marked cross (X).
 * The answerGrid has only 1 (filled) and 0 (empty).
 * Win condition: all filled cells match the target grid exactly (crosses are ignored).
 */
export function checkWin(playerGrid, answerGrid) {
  const size = answerGrid.length;
  for (let r = 0; r < size; r++) {
    for (let c = 0; c < size; c++) {
      const playerFilled = playerGrid[r][c] === 1;
      const answerFilled = answerGrid[r][c] === 1;
      if (playerFilled !== answerFilled) {
        return false;
      }
    }
  }
  return true;
}

/**
 * Preset art styles to append to user prompts for optimal binarization
 */
export const ART_PRESETS = {
  retroPixel: {
    name: "Pixel Art",
    promptSuffix: ", retro 8-bit pixel art style, simple solid sprite, flat dark backdrop, pixelated illustration",
  },
  minimalistSil: {
    name: "Neon Silhouette",
    promptSuffix: ", stark high-contrast vector silhouette, glowing neon icon style, clean solid background, sharp edges",
  },
  flatIcon: {
    name: "Flat Vector",
    promptSuffix: ", flat minimal icon, bold solid shapes, flat 2d graphic, high contrast, clean white background, basic vector graphic",
  },
  cuteChibi: {
    name: "Cute Outline",
    promptSuffix: ", bold clean line art, cute chibi kawaii style cartoon sprite, thick black outlines, simple coloring, plain backdrop",
  }
};

/**
 * Predefined list of simple, high-contrast objects for quick play
 */
export const DEFAULT_PROMPTS = [
  "Space Shuttle",
  "Sailboat",
  "Coffee Mug",
  "Anchor",
  "Black Cat",
  "Guitar",
  "Dinosaur Skull",
  "Sword",
  "Crown",
  "Cactus",
  "Umbrella",
  "Light Bulb",
  "Key",
  "Heart Icon",
  "Retro Game Controller"
];

/**
 * Gets a random prompt from the default list
 */
export function getRandomPrompt() {
  const randomIndex = Math.floor(Math.random() * DEFAULT_PROMPTS.length);
  return DEFAULT_PROMPTS[randomIndex];
}

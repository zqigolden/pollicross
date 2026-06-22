import React, { useState, useEffect, useRef } from 'react';
import { Paintbrush, X, HelpCircle, Lightbulb } from 'lucide-react';
import { generateClues } from '../logic/picrossLogic';
import { cropStyle } from '../utils/imageProcessor';

// Bresenham's Line Algorithm to interpolate grid cells
function getCellsOnLine(r0, c0, r1, c1) {
  const cells = [];
  const dr = Math.abs(r1 - r0);
  const dc = Math.abs(c1 - c0);
  const sr = r0 < r1 ? 1 : -1;
  const sc = c0 < c1 ? 1 : -1;
  let err = dr - dc;

  let r = r0;
  let c = c0;

  while (true) {
    cells.push({ r, c });
    if (r === r1 && c === c1) break;
    const e2 = 2 * err;
    if (e2 > -dc) {
      err -= dc;
      r += sr;
    }
    if (e2 < dr) {
      err += dr;
      c += sc;
    }
  }
  return cells;
}

export default function GameGrid({ size, playerGrid, answerGrid, onCellChange, onCheckWin, onHint, hintCount, hinted, isSolved, crop, aiImageUrl }) {
  const isHinted = (r, c) => hinted && hinted.has(`${r}-${c}`);
  const [activeTool, setActiveTool] = useState('paint'); // 'paint' or 'cross'
  const [isDrawing, setIsDrawing] = useState(false);
  const [drawType, setDrawType] = useState(null); // The state we are writing (0, 1, or -1)
  const dragStartCell = useRef(null); // { r, c } where mouse down occurred
  const dragLockAxis = useRef(null); // 'h' (horizontal) or 'v' (vertical) lock for current drag
  
  // Calculate clues from the target answer grid
  const rowClues = generateClues(answerGrid, false);
  const colClues = generateClues(answerGrid, true);

  // Derived: gray out a clue once the player's filled runs in that line match
  // the clue numbers (i.e. the clue is satisfied), regardless of whether it
  // matches the hidden solution exactly.
  const playerRowClues = generateClues(playerGrid, false);
  const playerColClues = generateClues(playerGrid, true);
  const cluesEqual = (a, b) => a.length === b.length && a.every((n, k) => n === b[k]);
  const solvedRows = rowClues.map((clue, i) => cluesEqual(playerRowClues[i], clue));
  const solvedCols = colClues.map((clue, i) => cluesEqual(playerColClues[i], clue));

  // Drag-to-draw mouse handlers
  const handleCellMouseDown = (r, c, e) => {
    e.preventDefault();
    if (isHinted(r, c)) return; // locked hint cell
    setIsDrawing(true);
    dragStartCell.current = { r, c };
    dragLockAxis.current = null;
    
    let clickTool = activeTool;
    // Right click override
    if (e.button === 2) {
      clickTool = activeTool === 'paint' ? 'cross' : 'paint';
    }

    const currentVal = playerGrid[r][c];
    let nextVal;

    if (clickTool === 'paint') {
      nextVal = currentVal === 1 ? 0 : 1;
    } else {
      nextVal = currentVal === -1 ? 0 : -1;
    }

    setDrawType(nextVal);
    onCellChange(r, c, nextVal);
  };

  const handleCellMouseEnter = (r, c) => {
    if (!isDrawing || drawType === null || !dragStartCell.current) return;
    
    const { r: rStart, c: cStart } = dragStartCell.current;
    
    // Determine the lock axis on the first move away from the start cell
    if (dragLockAxis.current === null) {
      if (r !== rStart || c !== cStart) {
        if (Math.abs(c - cStart) >= Math.abs(r - rStart)) {
          dragLockAxis.current = 'h'; // Lock to horizontal row
        } else {
          dragLockAxis.current = 'v'; // Lock to vertical column
        }
      }
    }
    
    // Calculate target cell to draw based on locked axis
    let targetR = r;
    let targetC = c;
    
    if (dragLockAxis.current === 'h') {
      targetR = rStart; // Clamp to start row
    } else if (dragLockAxis.current === 'v') {
      targetC = cStart; // Clamp to start column
    }
    
    // Interpolate cells from start cell to target cell along the straight line
    const cellsToDraw = getCellsOnLine(rStart, cStart, targetR, targetC);
    
    // Fill all cells on the straight line (skipping locked hint cells)
    cellsToDraw.forEach(({ r: currR, c: currC }) => {
      if (!isHinted(currR, currC)) onCellChange(currR, currC, drawType);
    });
  };

  const handleGlobalMouseUp = () => {
    setIsDrawing(false);
    setDrawType(null);
    dragStartCell.current = null;
    dragLockAxis.current = null;
    onCheckWin(); // Check for win state after finishing a drag action
  };

  useEffect(() => {
    window.addEventListener('mouseup', handleGlobalMouseUp);
    return () => {
      window.removeEventListener('mouseup', handleGlobalMouseUp);
    };
  }, [playerGrid, drawType]);

  // Prevent context menu (right click popup) on the board
  const handleContextMenu = (e) => {
    e.preventDefault();
  };

  // Cell size helper to fit screen
  const cellSize = size === 5 ? '48px' : size === 10 ? '36px' : '26px';
  const clueSize = size === 5 ? '70px' : size === 10 ? '85px' : '95px';

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
      
      {/* Mobile-friendly tool selector */}
      <div style={{ display: 'flex', gap: '1rem', marginBottom: '1.5rem' }}>
        <button
          className={`size-btn ${activeTool === 'paint' ? 'active' : ''}`}
          onClick={() => setActiveTool('paint')}
          style={{ 
            display: 'flex', 
            alignItems: 'center', 
            gap: '0.5rem', 
            padding: '0.6rem 1.5rem',
            borderRadius: '8px'
          }}
        >
          <Paintbrush size={16} />
          Paint
        </button>
        <button
          className={`size-btn ${activeTool === 'cross' ? 'active' : ''}`}
          onClick={() => setActiveTool('cross')}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '0.5rem',
            padding: '0.6rem 1.5rem',
            borderRadius: '8px'
          }}
        >
          <X size={16} />
          Cross (X)
        </button>
        <button
          className="size-btn"
          onClick={onHint}
          disabled={isSolved}
          title="Reveal one correct cell"
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '0.5rem',
            padding: '0.6rem 1.5rem',
            borderRadius: '8px',
          }}
        >
          <Lightbulb size={16} />
          Hint{hintCount > 0 ? ` (${hintCount})` : ''}
        </button>
      </div>

      {/* Board wrapper */}
      <div
        className="picross-board"
        onContextMenu={handleContextMenu}
        style={{
          position: 'relative',
          gridTemplateColumns: `${clueSize} repeat(${size}, ${cellSize})`,
          gridTemplateRows: `${clueSize} repeat(${size}, ${cellSize})`
        }}
      >
        {/* Top-Left Corner (empty) */}
        <div style={{ 
          display: 'flex', 
          alignItems: 'center', 
          justifyContent: 'center',
          borderBottom: '2px solid var(--panel-border)',
          borderRight: '2px solid var(--panel-border)'
        }}>
          <HelpCircle size={20} style={{ color: 'var(--text-dim)', opacity: 0.4 }} />
        </div>

        {/* Column Clues (Top Row) */}
        {colClues.map((clue, c) => (
          <div 
            key={`col-clue-${c}`} 
            className={`clue-label col ${c % 5 === 4 && c !== size - 1 ? 'border-right' : ''}`}
            style={{ 
              borderBottom: '2px solid var(--panel-border)',
              width: cellSize,
              height: clueSize
            }}
          >
            {clue.map((num, i) => (
              <span 
                key={`c-${c}-i-${i}`} 
                className={solvedCols[c] ? 'solved' : ''}
                style={{ color: 'var(--primary-color)' }}
              >
                {num}
              </span>
            ))}
          </div>
        ))}

        {/* Board Rows */}
        {playerGrid.map((row, r) => (
          <React.Fragment key={`row-fragment-${r}`}>
            {/* Row Clue (Left Column) */}
            <div 
              className={`clue-label row ${r % 5 === 4 && r !== size - 1 ? 'border-bottom' : ''}`}
              style={{ 
                borderRight: '2px solid var(--panel-border)',
                height: cellSize,
                width: clueSize
              }}
            >
              {rowClues[r].map((num, i) => (
                <span 
                  key={`r-${r}-i-${i}`} 
                  className={solvedRows[r] ? 'solved' : ''}
                  style={{ color: 'var(--secondary-color)' }}
                >
                  {num}
                </span>
              ))}
            </div>

            {/* Board Cells */}
            {row.map((cellState, c) => {
              const isBorderRight = c % 5 === 4 && c !== size - 1;
              const isBorderBottom = r % 5 === 4 && r !== size - 1;
              const hint = isHinted(r, c);
              const stateClass = hint ? 'hinted' : cellState === 1 ? 'filled' : cellState === -1 ? 'crossed' : '';

              return (
                <div
                  key={`cell-${r}-${c}`}
                  className={`cell ${stateClass} ${isBorderRight ? 'border-right' : ''} ${isBorderBottom ? 'border-bottom' : ''}`}
                  style={{ width: cellSize, height: cellSize }}
                  onMouseDown={(e) => handleCellMouseDown(r, c, e)}
                  onMouseEnter={() => handleCellMouseEnter(r, c)}
                />
              );
            })}
          </React.Fragment>
        ))}

        {/* Solved reveal: fade the real AI image in over the cell area, using
            the same crop as the puzzle so the picture lines up with the grid. */}
        {isSolved && aiImageUrl && (
          <div
            className="reveal-overlay"
            style={{
              position: 'absolute',
              top: `calc(1rem + ${clueSize})`,
              left: `calc(1rem + ${clueSize})`,
              width: `calc(${cellSize} * ${size})`,
              height: `calc(${cellSize} * ${size})`,
              overflow: 'hidden',
              pointerEvents: 'none',
            }}
          >
            <img src={aiImageUrl} alt="Solved puzzle reveal" style={cropStyle(crop)} />
          </div>
        )}
      </div>

      <div className="info-row" style={{ marginTop: '1.2rem', width: '100%', maxWidth: '400px' }}>
        <span className="info-item">💡 Right-click grid cells to cross-out.</span>
        <span className="info-item">🖱️ Click and drag to draw lines.</span>
      </div>
    </div>
  );
}

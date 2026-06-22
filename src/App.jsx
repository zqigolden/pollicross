import { useState, useEffect } from 'react';
import { Volume2, VolumeX, ArrowLeft, ShieldAlert, LogIn, LogOut, Clock } from 'lucide-react';
import ConfigPanel from './components/ConfigPanel';
import GameGrid from './components/GameGrid';
import { login, logout, isLoggedIn, consumeAuthError, generateImageBlob } from './utils/pollinationsApi';
import { loadImage, binarizeImage, cropStyle } from './utils/imageProcessor';
import { checkWin } from './logic/picrossLogic';
import soundManager from './utils/soundManager';

const formatTime = (s) =>
  `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;

export default function App() {
  const [gameState, setGameState] = useState('config'); // 'config' | 'loading' | 'playing' | 'success'
  const [authed, setAuthed] = useState(() => isLoggedIn());
  const [authNotice, setAuthNotice] = useState(() =>
    consumeAuthError() ? 'Authorization was cancelled. Connect your account to start playing.' : null
  );
  const [promptInfo, setPromptInfo] = useState(null);
  const [aiImageUrl, setAiImageUrl] = useState('');
  const [answerGrid, setAnswerGrid] = useState([]);
  const [playerGrid, setPlayerGrid] = useState([]);
  const [puzzleCrop, setPuzzleCrop] = useState(null);
  const [isSolved, setIsSolved] = useState(false);
  const [revealFull, setRevealFull] = useState(false); // success screen: zoomed out to full image?
  const [hintedCells, setHintedCells] = useState(() => new Set()); // "r-c" of locked hint cells
  const [hintCount, setHintCount] = useState(0);
  const [elapsedSec, setElapsedSec] = useState(0);
  const [isMuted, setIsMuted] = useState(() => soundManager.isMuted);
  const [statusMessage, setStatusMessage] = useState('');
  const [error, setError] = useState(null);

  // Tick the play timer once per second while a puzzle is in progress.
  useEffect(() => {
    if (gameState !== 'playing' || isSolved) return undefined;
    const id = setInterval(() => setElapsedSec(s => s + 1), 1000);
    return () => clearInterval(id);
  }, [gameState, isSolved]);

  const handleToggleMute = () => {
    const nextMuted = soundManager.toggleMute();
    setIsMuted(nextMuted);
  };

  const handleLogin = () => {
    setAuthNotice(null);
    login(); // redirects away
  };

  const handleLogout = () => {
    logout();
    setAuthed(false);
    setAuthNotice(null);
  };

  const handleGenerate = async ({ rawPrompt, fullPrompt, size }) => {
    setGameState('loading');
    setError(null);
    setRevealFull(false);
    setPromptInfo({ rawPrompt, fullPrompt, size });
    setStatusMessage('Generating AI image on your Pollinations balance...');

    // Release any previous puzzle image before creating a new one.
    if (aiImageUrl && aiImageUrl.startsWith('blob:')) {
      URL.revokeObjectURL(aiImageUrl);
    }

    try {
      // 1. Generate the image with the user's authorized key (returns a blob URL)
      const imageUrl = await generateImageBlob(fullPrompt);
      setAiImageUrl(imageUrl);

      // 2. Pre-load the image so we can read its pixels
      setStatusMessage('Awaiting AI generation response...');
      const img = await loadImage(imageUrl);

      // 3. Convert image pixels to binary grid
      setStatusMessage('Binarizing image and compiling puzzle rules...');
      const { grid: binaryMatrix, crop } = binarizeImage(img, size);

      setAnswerGrid(binaryMatrix);
      setPuzzleCrop(crop);
      setIsSolved(false);
      setHintedCells(new Set());
      setHintCount(0);
      setElapsedSec(0);
      // Initialize player grid with 0 (empty)
      setPlayerGrid(Array(size).fill(null).map(() => Array(size).fill(0)));

      // 4. Play game
      setGameState('playing');
      if (!soundManager.isMuted) {
        soundManager.startMusic();
      }
    } catch (err) {
      console.error(err);
      if (err.message === 'SESSION_EXPIRED') {
        setAuthed(false);
        setAuthNotice('Your Pollinations session expired — switched to guest mode. Generate again, or reconnect your account.');
      } else {
        setError(err.message || 'An unexpected error occurred. Please try again.');
      }
      setGameState('config');
    }
  };

  const handleCellChange = (r, c, val) => {
    // Hinted cells are locked — they can't be cleared or crossed.
    if (hintedCells.has(`${r}-${c}`)) return;
    setPlayerGrid(prevGrid => {
      // Check if state is actually changing to prevent redundant sound plays
      if (prevGrid[r][c] === val) return prevGrid;

      // Play click sounds based on the tool used
      if (val === 1) soundManager.playClick();
      else if (val === -1) soundManager.playCross();

      return prevGrid.map((row, rowIndex) => 
        row.map((cell, colIndex) => {
          if (rowIndex === r && colIndex === c) {
            return val;
          }
          return cell;
        })
      );
    });
  };

  const triggerWin = () => {
    setIsSolved(true);
    soundManager.playVictory();
    soundManager.stopMusic();

    // Delay transition to success screen to show the in-board reveal first.
    setTimeout(() => {
      setRevealFull(false); // start framed on the solved crop...
      setGameState('success');
      // ...then, once committed, zoom out to the full generated image.
      requestAnimationFrame(() =>
        requestAnimationFrame(() => setRevealFull(true))
      );
    }, 2500);
  };

  const handleCheckWin = () => {
    if (checkWin(playerGrid, answerGrid)) triggerWin();
  };

  const handleHint = () => {
    // Collect cells that should be filled but aren't yet.
    const candidates = [];
    for (let r = 0; r < answerGrid.length; r++) {
      for (let c = 0; c < answerGrid.length; c++) {
        if (answerGrid[r][c] === 1 && playerGrid[r][c] !== 1) candidates.push([r, c]);
      }
    }
    if (candidates.length === 0) return;

    const [r, c] = candidates[Math.floor(Math.random() * candidates.length)];
    const newGrid = playerGrid.map((row, ri) => row.map((v, ci) => (ri === r && ci === c ? 1 : v)));
    setPlayerGrid(newGrid);
    setHintedCells(prev => new Set(prev).add(`${r}-${c}`));
    setHintCount(h => h + 1);
    soundManager.playClick();

    if (checkWin(newGrid, answerGrid)) triggerWin();
  };

  const handleQuitGame = () => {
    soundManager.stopMusic();
    setIsSolved(false);
    setGameState('config');
  };

  // Render sub-screens based on state
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', width: '100%', gap: '2rem' }}>
      <div style={{ display: 'flex', justifyContent: 'center', width: '100%' }}>
        {gameState === 'config' && (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '1.5rem', width: '100%' }}>
            <ConfigPanel onGenerate={handleGenerate} />

            {authed ? (
              <button
                className="icon-btn"
                onClick={handleLogout}
                title="Disconnect Pollinations account"
                style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', width: 'auto', padding: '0.5rem 1rem', fontSize: '0.75rem' }}
              >
                <LogOut size={14} />
                Connected &middot; Disconnect
              </button>
            ) : (
              <div className="glass-panel" style={{ maxWidth: '500px', width: '100%', textAlign: 'center', padding: '1rem' }}>
                <p style={{ fontSize: '0.8rem', margin: '0 0 0.75rem 0', opacity: 0.85 }}>
                  Playing as guest &mdash; free, but rate-limited.
                  Connect your Pollinations account to generate freely on your own balance.
                </p>
                <button
                  className="icon-btn"
                  onClick={handleLogin}
                  style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem', width: 'auto', padding: '0.5rem 1rem', fontSize: '0.75rem' }}
                >
                  <LogIn size={14} />
                  Connect Pollinations Account
                </button>
              </div>
            )}

            {authNotice && (
              <div style={{ color: 'var(--secondary-color)', fontSize: '0.8rem', opacity: 0.9, maxWidth: '500px', textAlign: 'center' }}>
                {authNotice}
              </div>
            )}

            {error && (
              <div className="glass-panel" style={{ 
                borderColor: 'var(--secondary-color)', 
                color: 'var(--secondary-color)',
                maxWidth: '500px', 
                width: '100%', 
                display: 'flex', 
                alignItems: 'center', 
                gap: '1rem',
                padding: '1rem' 
              }}>
                <ShieldAlert size={24} />
                <div>
                  <strong style={{ display: 'block', fontSize: '0.85rem' }}>Failed to generate puzzle</strong>
                  <span style={{ fontSize: '0.75rem', opacity: 0.8 }}>{error}</span>
                </div>
              </div>
            )}
          </div>
        )}

        {gameState === 'loading' && (
          <div className="glass-panel loader-container" style={{ maxWidth: '500px', width: '100%' }}>
            <div className="loader-spinner" />
            <div className="loader-status">CREATING PUZZLE...</div>
            <p style={{ fontSize: '0.85rem' }}>{statusMessage}</p>
          </div>
        )}

        {gameState === 'playing' && (
          <div className="game-container">
            <div className="game-header">
              <div className="game-title-bar">
                <h1>POLLICROSS</h1>
                <div className="game-prompt-display">
                  Subject: {promptInfo.rawPrompt} ({promptInfo.size}x{promptInfo.size})
                </div>
              </div>
              
              <div className="game-controls">
                <div
                  className="timer-chip"
                  title="Elapsed time"
                  style={{
                    display: 'flex', alignItems: 'center', gap: '0.35rem',
                    padding: '0.4rem 0.7rem', borderRadius: '8px',
                    background: 'rgba(28, 28, 56, 0.6)', border: '1px solid var(--panel-border)',
                    color: 'var(--accent-color)', fontVariantNumeric: 'tabular-nums', fontSize: '0.85rem',
                  }}
                >
                  <Clock size={14} />
                  {formatTime(elapsedSec)}
                </div>

                <button
                  className="icon-btn"
                  onClick={handleToggleMute}
                  title={isMuted ? 'Unmute Sound & Music' : 'Mute Sound & Music'}
                >
                  {isMuted ? <VolumeX size={18} /> : <Volume2 size={18} />}
                </button>
                
                <button 
                  className="icon-btn" 
                  onClick={handleQuitGame}
                  title="Return to Menu"
                >
                  <ArrowLeft size={18} />
                </button>
              </div>
            </div>

            <GameGrid
              size={promptInfo.size}
              playerGrid={playerGrid}
              answerGrid={answerGrid}
              onCellChange={handleCellChange}
              onCheckWin={handleCheckWin}
              onHint={handleHint}
              hintCount={hintCount}
              hinted={hintedCells}
              isSolved={isSolved}
              crop={puzzleCrop}
              aiImageUrl={aiImageUrl}
            />
          </div>
        )}

        {gameState === 'success' && (
          <div className="glass-panel success-screen">
            <h1 style={{ color: 'var(--accent-color)', textShadow: '0 0 10px rgba(232, 243, 114, 0.4)' }}>
              LEVEL CLEARED!
            </h1>
            <p style={{ margin: '0.5rem 0 1.5rem 0' }}>
              You solved the Nonogram for: <strong style={{ color: '#fff' }}>{promptInfo.rawPrompt}</strong>
            </p>

            <div className="success-image-frame">
              <img
                src={aiImageUrl}
                alt={promptInfo.rawPrompt}
                className="success-image"
                style={{
                  ...(revealFull
                    ? { position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', maxWidth: 'none', objectFit: 'cover' }
                    : cropStyle(puzzleCrop)),
                  animation: 'none',
                  transition: 'top 0.9s cubic-bezier(0.16, 1, 0.3, 1), left 0.9s cubic-bezier(0.16, 1, 0.3, 1), width 0.9s cubic-bezier(0.16, 1, 0.3, 1), height 0.9s cubic-bezier(0.16, 1, 0.3, 1)',
                }}
              />
              <span className="success-badge">AI Generated</span>
            </div>

            <div style={{ display: 'flex', gap: '1rem', width: '100%' }}>
              <button 
                className="btn-neon btn-neon-magenta" 
                onClick={handleQuitGame}
              >
                Play Again
              </button>
            </div>
          </div>
        )}
      </div>

      <footer className="footer-credits">
        <a href="https://pollinations.ai" target="_blank" rel="noopener noreferrer">
          <img 
            src="https://img.shields.io/badge/Built%20with-Pollinations-8a2be2?style=for-the-badge" 
            alt="Built with Pollinations.ai" 
          />
        </a>
      </footer>
    </div>
  );
}

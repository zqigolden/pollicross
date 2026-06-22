import React, { useState } from 'react';
import { Sparkles, Dice5 } from 'lucide-react';
import { ART_PRESETS, getRandomPrompt } from '../logic/picrossLogic';

export default function ConfigPanel({ onGenerate }) {
  const [prompt, setPrompt] = useState(getRandomPrompt());
  const [selectedStyle, setSelectedStyle] = useState('retroPixel');
  const [gridSize, setGridSize] = useState(10);

  const handleRandomizePrompt = () => {
    setPrompt(getRandomPrompt());
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!prompt.trim()) return;

    const stylePreset = ART_PRESETS[selectedStyle];
    const fullPrompt = `${prompt.trim()}${stylePreset.promptSuffix}`;

    onGenerate({
      rawPrompt: prompt.trim(),
      fullPrompt: fullPrompt,
      size: gridSize,
    });
  };

  return (
    <div className="glass-panel" style={{ maxWidth: '500px', width: '100%' }}>
      <h1>POLLICROSS</h1>
      <p style={{ textAlign: 'center', marginBottom: '2rem' }}>
        Generate custom Nonogram levels from text using generative AI
      </p>

      <form onSubmit={handleSubmit}>
        <div className="input-group">
          <label className="input-label" htmlFor="prompt-input">
            Describe your puzzle
          </label>
          <div style={{ display: 'flex', gap: '0.5rem' }}>
            <input
              id="prompt-input"
              type="text"
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              placeholder="e.g. Astronaut, T-Rex, Coffee Mug..."
              maxLength={60}
              required
            />
            <button
              type="button"
              className="icon-btn"
              onClick={handleRandomizePrompt}
              title="Get random prompt suggestion"
            >
              <Dice5 size={20} />
            </button>
          </div>
        </div>

        <div className="input-group">
          <label className="input-label">Art Style Preset</label>
          <div className="presets-grid">
            {Object.entries(ART_PRESETS).map(([key, style]) => (
              <div
                key={key}
                className={`preset-card ${selectedStyle === key ? 'active' : ''}`}
                onClick={() => setSelectedStyle(key)}
              >
                {style.name}
              </div>
            ))}
          </div>
        </div>

        <div className="input-group">
          <label className="input-label">Grid Size (Difficulty)</label>
          <div className="size-selector">
            {[5, 10, 15].map((size) => (
              <button
                key={size}
                type="button"
                className={`size-btn ${gridSize === size ? 'active' : ''}`}
                onClick={() => setGridSize(size)}
              >
                {size} × {size}
              </button>
            ))}
          </div>
        </div>

        <button type="submit" className="btn-neon">
          <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem' }}>
            <Sparkles size={18} />
            Generate Level
          </span>
        </button>
      </form>
    </div>
  );
}

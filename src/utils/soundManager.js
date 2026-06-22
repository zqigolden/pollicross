/**
 * Procedural Audio Manager using Web Audio API
 * Generates retro 8-bit game sound effects and background music on-the-fly.
 * Zero assets required, fully client-side and lightweight.
 */

class SoundManager {
  constructor() {
    this.ctx = null;
    this.musicInterval = null;
    this.isMuted = true;
    this.musicNode = null;
  }

  init() {
    if (!this.ctx) {
      // Create audio context on first user interaction
      const AudioContext = window.AudioContext || window.webkitAudioContext;
      this.ctx = new AudioContext();
    }
    if (this.ctx.state === 'suspended') {
      this.ctx.resume();
    }
  }

  toggleMute() {
    this.isMuted = !this.isMuted;
    if (this.isMuted) {
      this.stopMusic();
    } else {
      this.init();
      this.startMusic();
    }
    return this.isMuted;
  }

  // Plays a short retro click beep
  playClick() {
    if (this.isMuted) return;
    this.init();
    
    try {
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(300, this.ctx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(150, this.ctx.currentTime + 0.08);
      
      gain.gain.setValueAtTime(0.08, this.ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01, this.ctx.currentTime + 0.08);
      
      osc.connect(gain);
      gain.connect(this.ctx.destination);
      
      osc.start();
      osc.stop(this.ctx.currentTime + 0.08);
    } catch (e) {
      console.warn("Audio error: ", e);
    }
  }

  // Plays a short marker cross X sound
  playCross() {
    if (this.isMuted) return;
    this.init();
    
    try {
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      
      osc.type = 'square';
      osc.frequency.setValueAtTime(100, this.ctx.currentTime);
      osc.frequency.setValueAtTime(180, this.ctx.currentTime + 0.04);
      
      gain.gain.setValueAtTime(0.04, this.ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01, this.ctx.currentTime + 0.08);
      
      osc.connect(gain);
      gain.connect(this.ctx.destination);
      
      osc.start();
      osc.stop(this.ctx.currentTime + 0.08);
    } catch (e) {
      console.warn("Audio error: ", e);
    }
  }

  // Plays a victory theme fanfare
  playVictory() {
    if (this.isMuted) return;
    this.init();
    this.stopMusic();
    
    try {
      const notes = [261.63, 329.63, 392.00, 523.25, 392.00, 523.25]; // C4, E4, G4, C5, G4, C5
      const duration = 0.15;
      
      notes.forEach((freq, index) => {
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        
        osc.type = 'square';
        osc.frequency.setValueAtTime(freq, this.ctx.currentTime + index * duration);
        
        // Hold the final note longer
        const noteDuration = index === notes.length - 1 ? 0.6 : duration;
        
        gain.gain.setValueAtTime(0.08, this.ctx.currentTime + index * duration);
        gain.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + index * duration + noteDuration);
        
        osc.connect(gain);
        gain.connect(this.ctx.destination);
        
        osc.start(this.ctx.currentTime + index * duration);
        osc.stop(this.ctx.currentTime + index * duration + noteDuration);
      });
    } catch (e) {
      console.warn("Audio error: ", e);
    }
  }

  // Starts a procedural 8-bit lofi bassline/melody loop
  startMusic() {
    if (this.isMuted || this.musicInterval) return;
    
    let step = 0;
    // Simple retro progression (A minor, F major, C major, G major pentatonic notes)
    const baseScale = [220.00, 174.61, 261.63, 196.00]; // A3, F3, C4, G3
    const melodyScale = [440.00, 493.88, 523.25, 587.33, 659.25, 783.99, 880.00]; // A4, B4, C5, D5, E5, G5, A5
    
    const playStep = () => {
      try {
        const chordIndex = Math.floor(step / 8) % baseScale.length;
        const currentBase = baseScale[chordIndex];
        
        // 1. Bass note on 1st and 5th step of eighth beat
        if (step % 4 === 0) {
          const bassOsc = this.ctx.createOscillator();
          const bassGain = this.ctx.createGain();
          
          bassOsc.type = 'sawtooth';
          bassOsc.frequency.setValueAtTime(currentBase / 2, this.ctx.currentTime); // sub bass
          
          bassGain.gain.setValueAtTime(0.04, this.ctx.currentTime);
          bassGain.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + 0.3);
          
          bassOsc.connect(bassGain);
          bassGain.connect(this.ctx.destination);
          
          bassOsc.start();
          bassOsc.stop(this.ctx.currentTime + 0.35);
        }

        // 2. Play light random chiptune melody note (with 40% probability) on 16th beats
        if (Math.random() < 0.4 && step % 2 === 0) {
          const melOsc = this.ctx.createOscillator();
          const melGain = this.ctx.createGain();
          
          melOsc.type = 'triangle';
          
          // Pick a random note from the melody scale that sounds harmonic
          const noteIndex = Math.floor(Math.random() * melodyScale.length);
          melOsc.frequency.setValueAtTime(melodyScale[noteIndex], this.ctx.currentTime);
          
          melGain.gain.setValueAtTime(0.02, this.ctx.currentTime);
          melGain.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + 0.25);
          
          melOsc.connect(melGain);
          melGain.connect(this.ctx.destination);
          
          melOsc.start();
          melOsc.stop(this.ctx.currentTime + 0.3);
        }

        step++;
      } catch (e) {
        console.warn("Music loop error: ", e);
      }
    };

    // Run music beat tick every 200ms (150 BPM)
    this.musicInterval = setInterval(playStep, 200);
  }

  stopMusic() {
    if (this.musicInterval) {
      clearInterval(this.musicInterval);
      this.musicInterval = null;
    }
  }
}

export default new SoundManager();

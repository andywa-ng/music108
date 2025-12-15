// Shimmer Chords Explorer - Main Application
class ShimmerChordsApp {
    constructor() {
        this.edo = 19;
        this.root = 0;
        this.chordTones = [0, 4, 7]; // Default triad in EDO steps
        this.audioContext = null;
        this.oscillators = [];
        this.isPlaying = false;
        this.instrumentType = 'piano'; // piano, guitar, strings, organ, flute, brass, synth
        this.sampleBuffers = {}; // Cache for loaded audio samples
        this.useSamples = false; // Toggle between synthesis and samples
        
        // Drag state
        this.dragging = null;
        this.hoveredPoint = null;
        this.dragOffset = { x: 0, y: 0 };
        this.lastClickTime = 0;
        this.lastClickIndex = null;
        
        this.canvas = document.getElementById('circle-canvas');
        this.ctx = this.canvas.getContext('2d');
        this.setupCanvas();
        
        this.initializeAudio();
        this.setupEventListeners();
        this.updateVisualization();
        this.updateChordInfo();
    }
    
    setupCanvas() {
        const dpr = window.devicePixelRatio || 1;
        const size = Math.min(700, window.innerWidth - 80);
        
        // Set display size
        this.canvas.style.width = size + 'px';
        this.canvas.style.height = size + 'px';
        
        // Set actual size in memory (scaled for DPI)
        this.canvas.width = size * dpr;
        this.canvas.height = size * dpr;
        
        // Scale context to account for DPI
        this.ctx.scale(dpr, dpr);
        
        this.centerX = size / 2;
        this.centerY = size / 2;
        this.radius = size / 2 - 50;
    }
    
    initializeAudio() {
        try {
            this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
        } catch (e) {
            console.error('Web Audio API not supported:', e);
            alert('Your browser does not support Web Audio API. Please use a modern browser.');
        }
    }
    
    setupEventListeners() {
        document.getElementById('edo-select').addEventListener('change', (e) => {
            this.edo = parseInt(e.target.value);
            this.updateVisualization();
            this.updateChordInfo();
        });
        
        document.getElementById('root-select').addEventListener('change', (e) => {
            this.root = parseInt(e.target.value);
            this.updateVisualization();
            this.updateChordInfo();
        });
        
        document.getElementById('instrument-select').addEventListener('change', (e) => {
            this.instrumentType = e.target.value;
        });
        
        document.getElementById('play-btn').addEventListener('click', () => {
            this.playChord();
        });
        
        document.getElementById('stop-btn').addEventListener('click', () => {
            this.stopChord();
        });
        
        // Preset chord buttons
        document.querySelectorAll('.preset-chord-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const chordType = e.target.dataset.chord;
                this.applyPresetChord(chordType);
            });
        });
        
        // Canvas interaction
        this.canvas.addEventListener('mousedown', (e) => this.handleMouseDown(e));
        this.canvas.addEventListener('mousemove', (e) => this.handleMouseMove(e));
        this.canvas.addEventListener('mouseup', (e) => this.handleMouseUp(e));
        this.canvas.addEventListener('mouseleave', (e) => this.handleMouseUp(e));
        this.canvas.addEventListener('dblclick', (e) => this.handleDoubleClick(e));
        
        // Touch support
        this.canvas.addEventListener('touchstart', (e) => {
            e.preventDefault();
            const touch = e.touches[0];
            const mouseEvent = new MouseEvent('mousedown', {
                clientX: touch.clientX,
                clientY: touch.clientY
            });
            this.handleMouseDown(mouseEvent);
        });
        
        this.canvas.addEventListener('touchmove', (e) => {
            e.preventDefault();
            const touch = e.touches[0];
            const mouseEvent = new MouseEvent('mousemove', {
                clientX: touch.clientX,
                clientY: touch.clientY
            });
            this.handleMouseMove(mouseEvent);
        });
        
        this.canvas.addEventListener('touchend', (e) => {
            e.preventDefault();
            this.handleMouseUp(e);
        });
        
        // Handle window resize
        window.addEventListener('resize', () => {
            this.setupCanvas();
            this.updateVisualization();
        });
    }
    
    getMousePos(e) {
        const rect = this.canvas.getBoundingClientRect();
        const dpr = window.devicePixelRatio || 1;
        return {
            x: (e.clientX - rect.left) * (this.canvas.width / dpr / rect.width),
            y: (e.clientY - rect.top) * (this.canvas.height / dpr / rect.height)
        };
    }
    
    getPointAtPosition(x, y) {
        const points = this.getChordPoints();
        const hitRadius = 20;
        
        for (let i = 0; i < points.length; i++) {
            const dx = x - points[i].x;
            const dy = y - points[i].y;
            const dist = Math.sqrt(dx * dx + dy * dy);
            if (dist < hitRadius) {
                return i;
            }
        }
        return null;
    }
    
    getNearestStep(x, y) {
        const dx = x - this.centerX;
        const dy = y - this.centerY;
        const dist = Math.sqrt(dx * dx + dy * dy);
        
        // Only snap if close to the circle
        if (Math.abs(dist - this.radius) > 30) {
            return null;
        }
        
        let angle = Math.atan2(dy, dx);
        angle = (angle + Math.PI / 2 + 2 * Math.PI) % (2 * Math.PI);
        const step = Math.round((angle / (2 * Math.PI)) * this.edo) % this.edo;
        return step;
    }
    
    handleMouseDown(e) {
        const pos = this.getMousePos(e);
        const pointIndex = this.getPointAtPosition(pos.x, pos.y);
        
        if (pointIndex !== null) {
            // Check for double-click
            const currentTime = Date.now();
            if (currentTime - this.lastClickTime < 300 && this.lastClickIndex === pointIndex) {
                // Double-click detected - delete the point
                this.removeChordTone(pointIndex);
                this.lastClickTime = 0;
                this.lastClickIndex = null;
                return;
            }
            
            this.dragging = pointIndex;
            this.lastClickTime = currentTime;
            this.lastClickIndex = pointIndex;
            const point = this.getChordPoints()[pointIndex];
            this.dragOffset = {
                x: pos.x - point.x,
                y: pos.y - point.y
            };
            this.canvas.style.cursor = 'grabbing';
        } else {
            // Check if clicking near the circle to add a new tone
            const step = this.getNearestStep(pos.x, pos.y);
            if (step !== null) {
                const relativeStep = (step - this.root + this.edo) % this.edo;
                if (!this.chordTones.includes(relativeStep)) {
                    this.chordTones.push(relativeStep);
                    this.updateVisualization();
                    this.updateChordInfo();
                    if (this.isPlaying) {
                        this.stopChord();
                        this.playChord();
                    }
                }
            }
            this.lastClickTime = 0;
            this.lastClickIndex = null;
        }
    }
    
    handleDoubleClick(e) {
        const pos = this.getMousePos(e);
        const pointIndex = this.getPointAtPosition(pos.x, pos.y);
        
        if (pointIndex !== null) {
            this.removeChordTone(pointIndex);
        }
    }
    
    handleMouseMove(e) {
        const pos = this.getMousePos(e);
        
        if (this.dragging !== null) {
            // Update the chord tone based on drag position
            const step = this.getNearestStep(pos.x, pos.y);
            if (step !== null) {
                const relativeStep = (step - this.root + this.edo) % this.edo;
                this.chordTones[this.dragging] = relativeStep;
                this.updateVisualization();
                this.updateChordInfo();
                if (this.isPlaying) {
                    this.stopChord();
                    this.playChord();
                }
            }
        } else {
            // Check for hover
            const pointIndex = this.getPointAtPosition(pos.x, pos.y);
            if (pointIndex !== null) {
                this.hoveredPoint = pointIndex;
                this.canvas.style.cursor = 'grab';
                this.updateVisualization();
            } else {
                const step = this.getNearestStep(pos.x, pos.y);
                if (step !== null) {
                    this.canvas.style.cursor = 'crosshair';
                    this.hoveredPoint = null;
                    this.updateVisualization();
                } else {
                    this.hoveredPoint = null;
                    this.canvas.style.cursor = 'default';
                    this.updateVisualization();
                }
            }
        }
    }
    
    handleMouseUp(e) {
        if (this.dragging !== null) {
            this.dragging = null;
            this.canvas.style.cursor = 'default';
        }
    }
    
    getChordPoints() {
        return this.chordTones.map(tone => {
            const absoluteStep = (this.root + tone) % this.edo;
            const angle = (2 * Math.PI * absoluteStep) / this.edo - Math.PI / 2;
            return {
                x: this.centerX + this.radius * Math.cos(angle),
                y: this.centerY + this.radius * Math.sin(angle),
                step: absoluteStep,
                toneIndex: this.chordTones.indexOf(tone)
            };
        });
    }
    
    removeChordTone(index) {
        if (this.chordTones.length > 1) {
            this.chordTones.splice(index, 1);
            this.updateVisualization();
            this.updateChordInfo();
            if (this.isPlaying) {
                this.stopChord();
                this.playChord();
            }
        }
    }
    
    // Convert standard interval (in semitones) to EDO steps
    convertIntervalToEDO(semitones) {
        // Convert semitones to EDO steps proportionally
        return Math.round((semitones / 12) * this.edo);
    }
    
    // Apply preset chord based on chord type
    applyPresetChord(chordType) {
        let intervals = [];
        
        switch(chordType) {
            case 'major':
                intervals = [0, 4, 7]; // Root, Major 3rd, Perfect 5th
                break;
            case 'minor':
                intervals = [0, 3, 7]; // Root, Minor 3rd, Perfect 5th
                break;
            case 'diminished':
                intervals = [0, 3, 6]; // Root, Minor 3rd, Diminished 5th
                break;
            case 'augmented':
                intervals = [0, 4, 8]; // Root, Major 3rd, Augmented 5th
                break;
            case 'sus2':
                intervals = [0, 2, 7]; // Root, Major 2nd, Perfect 5th
                break;
            case 'sus4':
                intervals = [0, 5, 7]; // Root, Perfect 4th, Perfect 5th
                break;
            case 'major7':
                intervals = [0, 4, 7, 11]; // Root, Major 3rd, Perfect 5th, Major 7th
                break;
            case 'minor7':
                intervals = [0, 3, 7, 10]; // Root, Minor 3rd, Perfect 5th, Minor 7th
                break;
            case 'dominant7':
                intervals = [0, 4, 7, 10]; // Root, Major 3rd, Perfect 5th, Minor 7th
                break;
            default:
                intervals = [0, 4, 7]; // Default to major
        }
        
        // Convert intervals to EDO steps
        this.chordTones = intervals.map(interval => this.convertIntervalToEDO(interval));
        this.updateVisualization();
        this.updateChordInfo();
    }
    
    // Calculate frequency for a given EDO step
    getFrequency(step) {
        const baseFreq = 261.63; // C4 in Hz
        const normalizedStep = step % this.edo;
        const octaveOffset = Math.floor(step / this.edo);
        return baseFreq * Math.pow(2, (normalizedStep / this.edo) + octaveOffset);
    }
    
    getChordToneFrequency(toneStep) {
        const absoluteStep = this.root + toneStep;
        return this.getFrequency(absoluteStep);
    }
    
    createTone(freq, index) {
        const now = this.audioContext.currentTime;
        const masterGain = 0.3 / this.chordTones.length;
        
        switch(this.instrumentType) {
            case 'piano':
                this.createPianoTone(freq, masterGain, now);
                break;
            case 'guitar':
                this.createGuitarTone(freq, masterGain, now);
                break;
            case 'strings':
                this.createStringsTone(freq, masterGain, now);
                break;
            case 'organ':
                this.createOrganTone(freq, masterGain, now);
                break;
            case 'flute':
                this.createFluteTone(freq, masterGain, now);
                break;
            case 'brass':
                this.createBrassTone(freq, masterGain, now);
                break;
            case 'synth':
                this.createSynthTone(freq, masterGain, now);
                break;
            default:
                this.createPianoTone(freq, masterGain, now);
        }
    }
    
    createPianoTone(freq, masterGain, now) {
        // Piano: Rich harmonics with quick attack and exponential decay
        // Use a combination of waveforms for richer sound
        const harmonics = [
            { freq: 1, gain: 1.0, type: 'sine' },
            { freq: 2, gain: 0.6, type: 'sine' },
            { freq: 3, gain: 0.4, type: 'sine' },
            { freq: 4, gain: 0.2, type: 'sine' },
            { freq: 5, gain: 0.1, type: 'sine' }
        ];
        
        harmonics.forEach((harmonic) => {
            const osc = this.audioContext.createOscillator();
            const gain = this.audioContext.createGain();
            
            osc.type = harmonic.type;
            osc.frequency.value = freq * harmonic.freq;
            
            // Quick attack, exponential decay
            gain.gain.setValueAtTime(0, now);
            gain.gain.linearRampToValueAtTime(masterGain * harmonic.gain, now + 0.005);
            gain.gain.exponentialRampToValueAtTime(0.001, now + 1.8);
            
            osc.connect(gain);
            gain.connect(this.audioContext.destination);
            
            osc.start(now);
            osc.stop(now + 1.8);
            this.oscillators.push({ oscillator: osc, gainNode: gain });
        });
    }
    
    createGuitarTone(freq, masterGain, now) {
        // Guitar: Plucked string - use sawtooth for brighter, more realistic sound
        const harmonics = [
            { freq: 1, gain: 1.0, type: 'sawtooth' },
            { freq: 2, gain: 0.3, type: 'sine' },
            { freq: 3, gain: 0.2, type: 'sine' },
            { freq: 4, gain: 0.1, type: 'sine' }
        ];
        
        harmonics.forEach((harmonic) => {
            const osc = this.audioContext.createOscillator();
            const gain = this.audioContext.createGain();
            
            osc.type = harmonic.type;
            osc.frequency.value = freq * harmonic.freq;
            
            // Very quick pluck attack, longer decay
            gain.gain.setValueAtTime(0, now);
            gain.gain.linearRampToValueAtTime(masterGain * harmonic.gain, now + 0.002);
            gain.gain.exponentialRampToValueAtTime(0.001, now + 2.5);
            
            osc.connect(gain);
            gain.connect(this.audioContext.destination);
            
            osc.start(now);
            osc.stop(now + 2.5);
            this.oscillators.push({ oscillator: osc, gainNode: gain });
        });
    }
    
    createStringsTone(freq, masterGain, now) {
        // Strings: Sawtooth-based for rich, warm string sound with vibrato
        const harmonics = [
            { freq: 1, gain: 1.0, type: 'sawtooth' },
            { freq: 2, gain: 0.5, type: 'sine' },
            { freq: 3, gain: 0.3, type: 'sine' },
            { freq: 4, gain: 0.15, type: 'sine' }
        ];
        
        harmonics.forEach((harmonic, idx) => {
            const osc = this.audioContext.createOscillator();
            const gain = this.audioContext.createGain();
            
            osc.type = harmonic.type;
            const baseFreq = freq * harmonic.freq;
            osc.frequency.value = baseFreq;
            
            // Add vibrato only to fundamental
            if (idx === 0) {
                const lfo = this.audioContext.createOscillator();
                const lfoGain = this.audioContext.createGain();
                
                lfo.type = 'sine';
                lfo.frequency.value = 4.5; // Vibrato rate
                lfoGain.gain.value = 4; // Vibrato depth
                
                lfo.connect(lfoGain);
                lfoGain.connect(osc.frequency);
                
                lfo.start(now);
                lfo.stop(now + 2.5);
            }
            
            // Smooth, slow attack for bowing effect
            gain.gain.setValueAtTime(0, now);
            gain.gain.linearRampToValueAtTime(masterGain * harmonic.gain, now + 0.3);
            gain.gain.linearRampToValueAtTime(masterGain * harmonic.gain * 0.85, now + 0.8);
            gain.gain.linearRampToValueAtTime(0, now + 2.5);
            
            osc.connect(gain);
            gain.connect(this.audioContext.destination);
            
            osc.start(now);
            osc.stop(now + 2.5);
            this.oscillators.push({ oscillator: osc, gainNode: gain });
        });
    }
    
    createOrganTone(freq, masterGain, now) {
        // Organ: Square wave for characteristic organ sound
        const harmonics = [
            { freq: 1, gain: 1.0, type: 'square' },
            { freq: 2, gain: 0.4, type: 'sine' },
            { freq: 3, gain: 0.25, type: 'sine' },
            { freq: 4, gain: 0.15, type: 'sine' },
            { freq: 5, gain: 0.1, type: 'sine' }
        ];
        
        harmonics.forEach((harmonic) => {
            const osc = this.audioContext.createOscillator();
            const gain = this.audioContext.createGain();
            
            osc.type = harmonic.type;
            osc.frequency.value = freq * harmonic.freq;
            
            // Organ: instant on, perfectly sustained, instant off
            gain.gain.setValueAtTime(0, now);
            gain.gain.linearRampToValueAtTime(masterGain * harmonic.gain, now + 0.005);
            gain.gain.setValueAtTime(masterGain * harmonic.gain, now + 0.5);
            gain.gain.linearRampToValueAtTime(0, now + 0.55);
            
            osc.connect(gain);
            gain.connect(this.audioContext.destination);
            
            osc.start(now);
            osc.stop(now + 0.55);
            this.oscillators.push({ oscillator: osc, gainNode: gain });
        });
    }
    
    createFluteTone(freq, masterGain, now) {
        // Flute: Pure sine waves, mostly fundamental, very smooth
        const harmonics = [
            { freq: 1, gain: 1.0, type: 'sine' },
            { freq: 2, gain: 0.25, type: 'sine' },
            { freq: 3, gain: 0.1, type: 'sine' }
        ];
        
        harmonics.forEach((harmonic) => {
            const osc = this.audioContext.createOscillator();
            const gain = this.audioContext.createGain();
            
            osc.type = harmonic.type;
            osc.frequency.value = freq * harmonic.freq;
            
            // Very smooth, breathy attack - characteristic of flute
            gain.gain.setValueAtTime(0, now);
            gain.gain.linearRampToValueAtTime(masterGain * harmonic.gain, now + 0.2);
            gain.gain.linearRampToValueAtTime(masterGain * harmonic.gain * 0.95, now + 0.6);
            gain.gain.linearRampToValueAtTime(0, now + 2.2);
            
            osc.connect(gain);
            gain.connect(this.audioContext.destination);
            
            osc.start(now);
            osc.stop(now + 2.2);
            this.oscillators.push({ oscillator: osc, gainNode: gain });
        });
    }
    
    createBrassTone(freq, masterGain, now) {
        // Brass: Sawtooth-based for bright, brassy sound
        const harmonics = [
            { freq: 1, gain: 1.0, type: 'sawtooth' },
            { freq: 2, gain: 0.6, type: 'sine' },
            { freq: 3, gain: 0.4, type: 'sine' },
            { freq: 4, gain: 0.25, type: 'sine' },
            { freq: 5, gain: 0.15, type: 'sine' }
        ];
        
        harmonics.forEach((harmonic) => {
            const osc = this.audioContext.createOscillator();
            const gain = this.audioContext.createGain();
            
            osc.type = harmonic.type;
            osc.frequency.value = freq * harmonic.freq;
            
            // Bright, punchy attack with quick decay
            gain.gain.setValueAtTime(0, now);
            gain.gain.linearRampToValueAtTime(masterGain * harmonic.gain, now + 0.03);
            gain.gain.linearRampToValueAtTime(masterGain * harmonic.gain * 0.9, now + 0.25);
            gain.gain.linearRampToValueAtTime(0, now + 1.8);
            
            osc.connect(gain);
            gain.connect(this.audioContext.destination);
            
            osc.start(now);
            osc.stop(now + 1.8);
            this.oscillators.push({ oscillator: osc, gainNode: gain });
        });
    }
    
    createSynthTone(freq, masterGain, now) {
        // Synth: Pure sawtooth wave with synth-style envelope
        const oscillator = this.audioContext.createOscillator();
        const gainNode = this.audioContext.createGain();
        
        oscillator.type = 'sawtooth';
        oscillator.frequency.value = freq;
        
        // Synth envelope: quick attack, sustain, release
        gainNode.gain.setValueAtTime(0, now);
        gainNode.gain.linearRampToValueAtTime(masterGain, now + 0.05);
        gainNode.gain.linearRampToValueAtTime(masterGain * 0.8, now + 0.3);
        gainNode.gain.linearRampToValueAtTime(0, now + 1.5);
        
        oscillator.connect(gainNode);
        gainNode.connect(this.audioContext.destination);
        
        oscillator.start(now);
        oscillator.stop(now + 1.5);
        this.oscillators.push({ oscillator, gainNode });
    }
    
    // Note: Sample-based playback would require audio files.
    // To use samples, you would need to:
    // 1. Load audio files (e.g., piano samples for each note)
    // 2. Use AudioBufferSourceNode instead of OscillatorNode
    // 3. Adjust playbackRate to change pitch
    // Example implementation (commented out):
    /*
    async loadSample(url) {
        const response = await fetch(url);
        const arrayBuffer = await response.arrayBuffer();
        return await this.audioContext.decodeAudioData(arrayBuffer);
    }
    
    playSample(buffer, freq, masterGain, now) {
        const source = this.audioContext.createBufferSource();
        const gainNode = this.audioContext.createGain();
        
        source.buffer = buffer;
        source.playbackRate.value = freq / 440; // Adjust pitch
        
        gainNode.gain.value = masterGain;
        
        source.connect(gainNode);
        gainNode.connect(this.audioContext.destination);
        
        source.start(now);
        this.oscillators.push({ oscillator: source, gainNode });
    }
    */
    
    playChord() {
        if (!this.audioContext) {
            this.initializeAudio();
        }
        
        if (this.audioContext.state === 'suspended') {
            this.audioContext.resume();
        }
        
        this.stopChord();
        this.isPlaying = true;
        
        this.chordTones.forEach((tone, index) => {
            const freq = this.getChordToneFrequency(tone);
            this.createTone(freq, index);
        });
    }
    
    stopChord() {
        this.oscillators.forEach(({ oscillator, gainNode }) => {
            const now = this.audioContext.currentTime;
            gainNode.gain.cancelScheduledValues(now);
            gainNode.gain.linearRampToValueAtTime(0, now + 0.1);
            oscillator.stop(now + 0.2);
        });
        this.oscillators = [];
        this.isPlaying = false;
    }
    
    drawCircle() {
        const ctx = this.ctx;
        const centerX = this.centerX;
        const centerY = this.centerY;
        const radius = this.radius;
        
        ctx.clearRect(0, 0, this.canvas.width / (window.devicePixelRatio || 1), 
                      this.canvas.height / (window.devicePixelRatio || 1));
        
        // Draw outer circle
        ctx.strokeStyle = '#e0e0e0';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(centerX, centerY, radius, 0, 2 * Math.PI);
        ctx.stroke();
        
        // Draw EDO step markers
        ctx.strokeStyle = '#ccc';
        ctx.lineWidth = 1;
        ctx.font = '11px sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        
        for (let i = 0; i < this.edo; i++) {
            const angle = (2 * Math.PI * i) / this.edo - Math.PI / 2;
            const x = centerX + radius * Math.cos(angle);
            const y = centerY + radius * Math.sin(angle);
            
            // Draw tick mark
            ctx.beginPath();
            ctx.moveTo(centerX + (radius - 8) * Math.cos(angle), 
                       centerY + (radius - 8) * Math.sin(angle));
            ctx.lineTo(x, y);
            ctx.stroke();
            
            // Draw step number (smaller for dense EDOs)
            if (this.edo <= 31) {
                const labelX = centerX + (radius + 18) * Math.cos(angle);
                const labelY = centerY + (radius + 18) * Math.sin(angle);
                ctx.fillStyle = '#999';
                ctx.fillText(i, labelX, labelY);
            }
        }
        
        // Highlight root note
        const rootAngle = (2 * Math.PI * this.root) / this.edo - Math.PI / 2;
        const rootX = centerX + radius * Math.cos(rootAngle);
        const rootY = centerY + radius * Math.sin(rootAngle);
        
        ctx.fillStyle = '#667eea';
        ctx.beginPath();
        ctx.arc(rootX, rootY, 10, 0, 2 * Math.PI);
        ctx.fill();
        
        ctx.fillStyle = '#667eea';
        ctx.font = 'bold 12px sans-serif';
        const rootLabelX = centerX + (radius + 30) * Math.cos(rootAngle);
        const rootLabelY = centerY + (radius + 30) * Math.sin(rootAngle);
        ctx.fillText('R', rootLabelX, rootLabelY);
    }
    
    drawChordPolygon() {
        if (this.chordTones.length < 2) return;
        
        const ctx = this.ctx;
        const centerX = this.centerX;
        const centerY = this.centerY;
        const radius = this.radius;
        
        const points = this.getChordPoints();
        
        // Sort points by angle
        const sortedPoints = [...points].sort((a, b) => {
            const angleA = Math.atan2(a.y - centerY, a.x - centerX);
            const angleB = Math.atan2(b.y - centerY, b.x - centerX);
            return angleA - angleB;
        });
        
        // Draw filled polygon
        ctx.fillStyle = 'rgba(102, 126, 234, 0.15)';
        ctx.strokeStyle = '#667eea';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(sortedPoints[0].x, sortedPoints[0].y);
        for (let i = 1; i < sortedPoints.length; i++) {
            ctx.lineTo(sortedPoints[i].x, sortedPoints[i].y);
        }
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
        
        // Draw points for each chord tone
        points.forEach((point, index) => {
            const isHovered = this.hoveredPoint === point.toneIndex;
            const isDragging = this.dragging === point.toneIndex;
            const pointRadius = isHovered || isDragging ? 16 : 13;
            
            // Draw point with glow effect when hovered
            if (isHovered || isDragging) {
                ctx.shadowBlur = 8;
                ctx.shadowColor = '#667eea';
            } else {
                ctx.shadowBlur = 0;
            }
            
            // Draw point
            ctx.fillStyle = isDragging ? '#764ba2' : (isHovered ? '#8b7fc7' : '#667eea');
            ctx.beginPath();
            ctx.arc(point.x, point.y, pointRadius, 0, 2 * Math.PI);
            ctx.fill();
            
            // Draw white border
            ctx.strokeStyle = 'white';
            ctx.lineWidth = isHovered || isDragging ? 3 : 2.5;
            ctx.stroke();
            
            // Draw tone label
            ctx.fillStyle = 'white';
            ctx.font = isHovered || isDragging ? 'bold 13px sans-serif' : 'bold 11px sans-serif';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText(this.chordTones[point.toneIndex], point.x, point.y);
            
            ctx.shadowBlur = 0;
        });
    }
    
    updateVisualization() {
        this.drawCircle();
        this.drawChordPolygon();
    }
    
    updateChordInfo() {
        const info = document.getElementById('chord-info');
        const steps = this.chordTones.map(tone => {
            const absoluteStep = (this.root + tone) % this.edo;
            return absoluteStep;
        }).sort((a, b) => a - b);
        
        const toneCount = this.chordTones.length;
        const toneText = toneCount === 1 ? 'tone' : 'tones';
        
        info.innerHTML = `
            <div style="font-size: 1.3em; font-weight: 700; margin-bottom: 10px; color: #667eea; letter-spacing: -0.5px;">
                ${this.edo}-EDO Tuning
            </div>
            <div style="color: #666; font-size: 1em; line-height: 1.6;">
                <div style="margin-bottom: 4px;">
                    <strong>Root:</strong> Step ${this.root}
                </div>
                <div>
                    <strong>Chord:</strong> ${steps.join(', ')} <span style="color: #999; font-size: 0.9em;">(${toneCount} ${toneText})</span>
                </div>
            </div>
        `;
    }
}

document.addEventListener('DOMContentLoaded', () => {
    const app = new ShimmerChordsApp();
});

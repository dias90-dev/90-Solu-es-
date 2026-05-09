import * as Tone from 'tone';

export interface GeneratedTrack {
  instrument: 'melody' | 'bass' | 'drums' | 'viola' | 'violino' | 'marimba' | 'batuque' | 'sacarias' | 'voz';
  notes: {
    time: string; // e.g., "0:0:0"
    note?: string; // e.g., "C4"
    duration?: string; // e.g., "8n"
    drum?: 'kick' | 'snare' | 'hihat' | 'openhat' | 'batuque' | 'sacarias';
    solfeggio?: string; // e.g., "Do", "Re"
    lyric?: string;
  }[];
}

export interface GeneratedSong {
  tempo: number;
  genre: string;
  tracks: GeneratedTrack[];
}

class ToneEngine {
  private melodySynth: Tone.PolySynth | null = null;
  private bassSynth: Tone.PolySynth | null = null;
  private kickSynth: Tone.MembraneSynth | null = null;
  private snareBody: Tone.MembraneSynth | null = null;
  private snareNoise: Tone.NoiseSynth | null = null;
  private hihatSynth: Tone.MetalSynth | null = null;
  private violaSynth: Tone.PolySynth | null = null;
  private violinoSynth: Tone.PolySynth | null = null;
  private marimbaSynth: Tone.PolySynth | null = null;
  private batuqueSynth: Tone.MembraneSynth | null = null;
  private sacariasSynth: Tone.MetalSynth | null = null;
  private vozSynth: Tone.PolySynth | null = null;
  
  private parts: Tone.Part[] = [];
  public isInitialized = false;
  public analyser: Tone.Analyser | null = null;
  
  public reverb: Tone.Reverb | null = null;
  public delay: Tone.PingPongDelay | null = null;
  public distortion: Tone.Distortion | null = null;
  public customSamples: Partial<Record<'kick' | 'snare' | 'hihat' | 'openhat', Tone.Player>> = {};
  
  // Callbacks for UI updates
  public onBeat?: (beat: number) => void;
  private beatEventId: number | null = null;

  async init() {
    if (this.isInitialized) return;
    await Tone.start();
    
    // --- MASTER BUS ---
    const masterCompressor = new Tone.Compressor({
      threshold: -15,
      ratio: 4,
      attack: 0.01,
      release: 0.1
    });
    const masterLimiter = new Tone.Limiter(-1);
    this.analyser = new Tone.Analyser("waveform", 512);
    masterCompressor.chain(masterLimiter, this.analyser, Tone.Destination);

    // --- EFFECTS BUS ---
    this.distortion = new Tone.Distortion({ distortion: 0.8, wet: 0 });
    this.distortion.connect(masterCompressor);

    this.reverb = new Tone.Reverb({ decay: 3, wet: 0.3 });
    await this.reverb.generate(); // Ensure IR is generated
    this.delay = new Tone.PingPongDelay("8n.", 0.2);
    
    this.reverb.connect(this.distortion);
    this.delay.connect(this.reverb);
    this.delay.connect(this.distortion);

    // --- MELODY SYNTH (Lush FM Pad/Pluck) ---
    this.melodySynth = new Tone.PolySynth(Tone.FMSynth, {
      harmonicity: 1.5,
      modulationIndex: 2,
      oscillator: { type: "sawtooth" },
      envelope: { attack: 0.02, decay: 0.3, sustain: 0.4, release: 1.5 },
      modulation: { type: "sine" },
      modulationEnvelope: { attack: 0.02, decay: 0.3, sustain: 0.4, release: 1.5 }
    });
    const melodyFilter = new Tone.Filter(3000, "lowpass");
    const melodyChorus = new Tone.Chorus(4, 2.5, 0.5).start();
    
    this.melodySynth.chain(melodyFilter, melodyChorus, this.distortion);
    this.melodySynth.connect(this.delay);
    this.melodySynth.connect(this.reverb);

    // --- BASS SYNTH (Deep FM / Sub / Log Drum vibe) ---
    this.bassSynth = new Tone.PolySynth(Tone.FMSynth, {
      harmonicity: 0.5,
      modulationIndex: 3,
      oscillator: { type: "sine" },
      envelope: { attack: 0.01, decay: 0.4, sustain: 0.6, release: 1.2 },
      modulation: { type: "triangle" },
      modulationEnvelope: { attack: 0.01, decay: 0.2, sustain: 0.2, release: 0.5 }
    });
    const bassFilter = new Tone.Filter(1000, "lowpass");
    const bassDist = new Tone.Distortion(0.15); // Warmth
    this.bassSynth.chain(bassFilter, bassDist, this.distortion);

    // --- DRUMS ---
    // Kick
    this.kickSynth = new Tone.MembraneSynth({
      pitchDecay: 0.06,
      octaves: 5,
      oscillator: { type: "sine" },
      envelope: { attack: 0.001, decay: 0.4, sustain: 0.01, release: 1.4 }
    });
    const kickEQ = new Tone.EQ3({ low: 4, mid: -2, high: 0 });
    this.kickSynth.chain(kickEQ, this.distortion);

    // Snare (Layered)
    this.snareBody = new Tone.MembraneSynth({
      pitchDecay: 0.01,
      octaves: 2,
      oscillator: { type: "sine" },
      envelope: { attack: 0.001, decay: 0.2, sustain: 0, release: 0.1 }
    });
    this.snareNoise = new Tone.NoiseSynth({
      noise: { type: "white" },
      envelope: { attack: 0.001, decay: 0.2, sustain: 0, release: 0.1 }
    });
    const snareFilter = new Tone.Filter(1000, "highpass");
    this.snareNoise.chain(snareFilter, this.distortion);
    this.snareBody.connect(this.distortion);
    this.snareNoise.connect(this.reverb);

    // Hi-hat
    this.hihatSynth = new Tone.MetalSynth({
      frequency: 250,
      envelope: { attack: 0.001, decay: 0.05, release: 0.01 },
      harmonicity: 5.1,
      modulationIndex: 32,
      resonance: 4000,
      octaves: 1.5
    });
    const hihatFilter = new Tone.Filter(4000, "highpass");
    this.hihatSynth.chain(hihatFilter, this.distortion);
    
    // Viola
    this.violaSynth = new Tone.PolySynth(Tone.FMSynth, {
      harmonicity: 3,
      modulationIndex: 2,
      oscillator: { type: "square" },
      envelope: { attack: 0.1, decay: 0.2, sustain: 0.8, release: 0.5 },
      modulation: { type: "triangle" },
      modulationEnvelope: { attack: 0.2, decay: 0.1, sustain: 1, release: 0.5 }
    });
    this.violaSynth.connect(this.distortion);
    this.violaSynth.connect(this.reverb);

    // Violino
    this.violinoSynth = new Tone.PolySynth(Tone.AMSynth, {
      harmonicity: 2.5,
      oscillator: { type: "sawtooth" },
      envelope: { attack: 0.2, decay: 0.1, sustain: 1, release: 1 },
      modulation: { type: "sine" },
      modulationEnvelope: { attack: 0.5, decay: 0, sustain: 1, release: 0.5 }
    });
    this.violinoSynth.connect(this.distortion);
    this.violinoSynth.connect(this.reverb);

    // Marimba
    this.marimbaSynth = new Tone.PolySynth(Tone.FMSynth, {
      harmonicity: 5,
      modulationIndex: 1,
      oscillator: { type: "sine" },
      envelope: { attack: 0.001, decay: 0.3, sustain: 0, release: 0.3 },
      modulation: { type: "square" },
      modulationEnvelope: { attack: 0.001, decay: 0.1, sustain: 0, release: 0.1 }
    });
    this.marimbaSynth.connect(this.distortion);

    // Batuque
    this.batuqueSynth = new Tone.MembraneSynth({
      pitchDecay: 0.02,
      octaves: 3,
      oscillator: { type: "sine" },
      envelope: { attack: 0.001, decay: 0.6, sustain: 0.01, release: 1 }
    });
    this.batuqueSynth.connect(this.distortion);

    // Sacarias / Reco-reco
    this.sacariasSynth = new Tone.MetalSynth({
      frequency: 200,
      envelope: { attack: 0.001, decay: 0.1, release: 0.01 },
      harmonicity: 3.1,
      modulationIndex: 16,
      resonance: 3000,
      octaves: 1
    });
    this.sacariasSynth.connect(this.distortion);

    // Voz Synth (mock synthetic voice)
    this.vozSynth = new Tone.PolySynth(Tone.Synth, {
      oscillator: { type: "sine" },
      envelope: { attack: 0.1, decay: 0.2, sustain: 0.9, release: 0.5 }
    });
    const chorus = new Tone.Chorus(4, 2.5, 0.5).start();
    this.vozSynth.chain(chorus, this.reverb);

    // Schedule beat events for UI
    this.beatEventId = Tone.Transport.scheduleRepeat((time) => {
      // Get current beat (0-15 for 4 bars of 4 beats)
      const ticks = Tone.Transport.ticks;
      const sixteenths = Math.floor(ticks / Tone.Time("16n").toTicks());
      
      const loopEndTicks = Tone.Time(Tone.Transport.loopEnd).toTicks();
      const loopEndSixteenths = Math.floor(loopEndTicks / Tone.Time("16n").toTicks());
      
      if (this.onBeat && loopEndSixteenths > 0) {
        Tone.Draw.schedule(() => {
          this.onBeat!(sixteenths % loopEndSixteenths);
        }, time);
      }
    }, "16n");

    this.isInitialized = true;
  }

  loadSong(song: GeneratedSong) {
    this.stop();
    this.clearParts();
    
    Tone.Transport.bpm.value = song.tempo;
    
    song.tracks.forEach(track => {
      if (track.instrument === 'melody' && this.melodySynth) {
        const part = new Tone.Part((time, value) => {
          this.melodySynth!.triggerAttackRelease(value.note!, value.duration!, time);
        }, track.notes.map(n => ({ time: n.time, note: n.note, duration: n.duration })));
        part.start(0);
        this.parts.push(part);
      }
      
      if (track.instrument === 'viola' && this.violaSynth) {
        const part = new Tone.Part((time, value) => {
          this.violaSynth!.triggerAttackRelease(value.note!, value.duration!, time);
        }, track.notes.map(n => ({ time: n.time, note: n.note, duration: n.duration })));
        part.start(0);
        this.parts.push(part);
      }

      if (track.instrument === 'violino' && this.violinoSynth) {
        const part = new Tone.Part((time, value) => {
          this.violinoSynth!.triggerAttackRelease(value.note!, value.duration!, time);
        }, track.notes.map(n => ({ time: n.time, note: n.note, duration: n.duration })));
        part.start(0);
        this.parts.push(part);
      }

      if (track.instrument === 'marimba' && this.marimbaSynth) {
        const part = new Tone.Part((time, value) => {
          this.marimbaSynth!.triggerAttackRelease(value.note!, value.duration!, time);
        }, track.notes.map(n => ({ time: n.time, note: n.note, duration: n.duration })));
        part.start(0);
        this.parts.push(part);
      }

      if (track.instrument === 'voz' && this.vozSynth) {
        const part = new Tone.Part((time, value) => {
          this.vozSynth!.triggerAttackRelease(value.note!, value.duration!, time);
        }, track.notes.map(n => ({ time: n.time, note: n.note, duration: n.duration })));
        part.start(0);
        this.parts.push(part);
      }

      if (track.instrument === 'bass' && this.bassSynth) {
        const part = new Tone.Part((time, value) => {
          // Lower the octave for bass notes to ensure they are deep
          let note = value.note!;
          const match = note.match(/([A-G]#?)(\d)/);
          if (match) {
            const pitchClass = match[1];
            let octave = parseInt(match[2]);
            if (octave > 2) octave = octave - 2; // Force bass into sub octaves (1 or 2)
            note = `${pitchClass}${Math.max(1, octave)}`;
          }
          this.bassSynth!.triggerAttackRelease(note, value.duration!, time);
        }, track.notes.map(n => ({ time: n.time, note: n.note, duration: n.duration })));
        part.start(0);
        this.parts.push(part);
      }
      
      if (track.instrument === 'drums') {
        const part = new Tone.Part((time, value) => {
          if (value.drum === 'kick') {
            if (this.customSamples['kick']) this.customSamples['kick'].start(time);
            else if (this.kickSynth) this.kickSynth.triggerAttackRelease('C1', '8n', time);
          }
          if (value.drum === 'snare') {
            if (this.customSamples['snare']) this.customSamples['snare'].start(time);
            else {
              this.snareBody?.triggerAttackRelease('G3', '16n', time);
              this.snareNoise?.triggerAttackRelease('16n', time);
            }
          }
          if (value.drum === 'hihat') {
            if (this.customSamples['hihat']) this.customSamples['hihat'].start(time);
            else if (this.hihatSynth) {
              this.hihatSynth.envelope.decay = 0.05;
              this.hihatSynth.triggerAttackRelease('32n', time);
            }
          }
          if (value.drum === 'openhat') {
            if (this.customSamples['openhat']) this.customSamples['openhat'].start(time);
            else if (this.hihatSynth) {
               this.hihatSynth.envelope.decay = 0.4;
               this.hihatSynth.triggerAttackRelease('8n', time);
            }
          }
          if (value.drum === 'batuque' && this.batuqueSynth) {
            this.batuqueSynth.triggerAttackRelease('E2', '8n', time);
          }
          if (value.drum === 'sacarias' && this.sacariasSynth) {
            this.sacariasSynth.triggerAttackRelease('16n', time, 0.8);
          }
        }, track.notes.map(n => ({ time: n.time, drum: n.drum })));
        part.start(0);
        this.parts.push(part);
      }
    });
    
    let maxBar = 3;
    song.tracks.forEach(track => {
      track.notes.forEach(n => {
        const bar = parseInt(n.time.split(':')[0]);
        if (!isNaN(bar) && bar > maxBar) maxBar = bar;
      });
    });
    
    Tone.Transport.loop = true;
    Tone.Transport.loopStart = 0;
    Tone.Transport.loopEnd = `${maxBar + 1}m`;
  }

  play() {
    if (!this.isInitialized) return;
    Tone.Transport.start();
  }

  pause() {
    Tone.Transport.pause();
  }

  stop() {
    Tone.Transport.stop();
    Tone.Transport.position = 0;
    if (this.onBeat) this.onBeat(0);
  }

  clearParts() {
    this.parts.forEach(part => part.dispose());
    this.parts = [];
  }

  setTempo(tempo: number) {
    Tone.Transport.bpm.value = tempo;
  }

  async loadCustomSample(type: 'kick' | 'snare' | 'hihat' | 'openhat', url: string) {
    if (!this.isInitialized) await this.init();
    if (this.customSamples[type]) {
      this.customSamples[type]?.dispose();
    }
    const player = new Tone.Player(url).connect(this.distortion!);
    await player.load(url);
    this.customSamples[type] = player;
  }
}

export const toneEngine = new ToneEngine();

export async function exportWav(
  song: GeneratedSong,
  effects: { reverb: number; delay: number; dist: number },
  customSampleUrls: Record<string, string>
): Promise<Blob> {
  let maxBar = 3;
  song.tracks.forEach(track => {
    track.notes.forEach(n => {
      const bar = parseInt(n.time.split(':')[0]);
      if (!isNaN(bar) && bar > maxBar) maxBar = bar;
    });
  });

  const beatsPerBar = 4;
  const bars = maxBar + 1;
  const duration = (bars * beatsPerBar * 60) / song.tempo + 3;

  const buffer = await Tone.Offline(async () => {
    const masterCompressor = new Tone.Compressor({
      threshold: -15, ratio: 4, attack: 0.01, release: 0.1
    });
    const masterLimiter = new Tone.Limiter(-1);
    masterCompressor.chain(masterLimiter, Tone.Destination);

    const distortion = new Tone.Distortion({ distortion: 0.8, wet: effects.dist });
    distortion.connect(masterCompressor);

    const reverb = new Tone.Reverb({ decay: 3, wet: effects.reverb });
    await reverb.generate();
    const delay = new Tone.PingPongDelay("8n.", effects.delay);
    
    reverb.connect(distortion);
    delay.connect(reverb);
    delay.connect(distortion);

    const melodySynth = new Tone.PolySynth(Tone.FMSynth, {
      harmonicity: 1.5,
      modulationIndex: 2,
      oscillator: { type: "sawtooth" },
      envelope: { attack: 0.02, decay: 0.3, sustain: 0.4, release: 1.5 },
      modulation: { type: "sine" },
      modulationEnvelope: { attack: 0.02, decay: 0.3, sustain: 0.4, release: 1.5 }
    });
    const melodyFilter = new Tone.Filter(3000, "lowpass");
    const melodyChorus = new Tone.Chorus(4, 2.5, 0.5).start();
    
    melodySynth.chain(melodyFilter, melodyChorus, distortion);
    melodySynth.connect(delay);
    melodySynth.connect(reverb);

    const bassSynth = new Tone.PolySynth(Tone.FMSynth, {
      harmonicity: 0.5,
      modulationIndex: 3,
      oscillator: { type: "sine" },
      envelope: { attack: 0.01, decay: 0.4, sustain: 0.6, release: 1.2 },
      modulation: { type: "triangle" },
      modulationEnvelope: { attack: 0.01, decay: 0.2, sustain: 0.2, release: 0.5 }
    });
    const bassFilter = new Tone.Filter(1000, "lowpass");
    const bassDist = new Tone.Distortion(0.15);
    bassSynth.chain(bassFilter, bassDist, distortion);

    const kickSynth = new Tone.MembraneSynth({
      pitchDecay: 0.06, octaves: 5, oscillator: { type: "sine" },
      envelope: { attack: 0.001, decay: 0.4, sustain: 0.01, release: 1.4 }
    });
    const kickEQ = new Tone.EQ3({ low: 4, mid: -2, high: 0 });
    kickSynth.chain(kickEQ, distortion);

    const snareBody = new Tone.MembraneSynth({
      pitchDecay: 0.01, octaves: 2, oscillator: { type: "sine" },
      envelope: { attack: 0.001, decay: 0.2, sustain: 0, release: 0.1 }
    });
    const snareNoise = new Tone.NoiseSynth({
      noise: { type: "white" },
      envelope: { attack: 0.001, decay: 0.2, sustain: 0, release: 0.1 }
    });
    const snareFilter = new Tone.Filter(1000, "highpass");
    snareNoise.chain(snareFilter, distortion);
    snareBody.connect(distortion);
    snareNoise.connect(reverb);

    const hihatSynth = new Tone.MetalSynth({
      frequency: 250, envelope: { attack: 0.001, decay: 0.05, release: 0.01 },
      harmonicity: 5.1, modulationIndex: 32, resonance: 4000, octaves: 1.5
    });
    const hihatFilter = new Tone.Filter(4000, "highpass");
    hihatSynth.chain(hihatFilter, distortion);

    const violaSynth = new Tone.PolySynth(Tone.FMSynth, {
      harmonicity: 3, modulationIndex: 2, oscillator: { type: "square" },
      envelope: { attack: 0.1, decay: 0.2, sustain: 0.8, release: 0.5 },
      modulation: { type: "triangle" }, modulationEnvelope: { attack: 0.2, decay: 0.1, sustain: 1, release: 0.5 }
    }).connect(distortion).connect(reverb);

    const violinoSynth = new Tone.PolySynth(Tone.AMSynth, {
      harmonicity: 2.5, oscillator: { type: "sawtooth" },
      envelope: { attack: 0.2, decay: 0.1, sustain: 1, release: 1 },
      modulation: { type: "sine" }, modulationEnvelope: { attack: 0.5, decay: 0, sustain: 1, release: 0.5 }
    }).connect(distortion).connect(reverb);

    const marimbaSynth = new Tone.PolySynth(Tone.FMSynth, {
      harmonicity: 5, modulationIndex: 1, oscillator: { type: "sine" },
      envelope: { attack: 0.001, decay: 0.3, sustain: 0, release: 0.3 },
      modulation: { type: "square" }, modulationEnvelope: { attack: 0.001, decay: 0.1, sustain: 0, release: 0.1 }
    }).connect(distortion);

    const batuqueSynth = new Tone.MembraneSynth({
      pitchDecay: 0.02, octaves: 3, oscillator: { type: "sine" },
      envelope: { attack: 0.001, decay: 0.6, sustain: 0.01, release: 1 }
    }).connect(distortion);

    const sacariasSynth = new Tone.MetalSynth({
      frequency: 200, envelope: { attack: 0.001, decay: 0.1, release: 0.01 },
      harmonicity: 3.1, modulationIndex: 16, resonance: 3000, octaves: 1
    }).connect(distortion);

    const vozSynth = new Tone.PolySynth(Tone.Synth, {
      oscillator: { type: "sine" }, envelope: { attack: 0.1, decay: 0.2, sustain: 0.9, release: 0.5 }
    });
    const chorus = new Tone.Chorus(4, 2.5, 0.5).start();
    vozSynth.chain(chorus, reverb);
    
    const customSamples: Partial<Record<string, Tone.Player>> = {};
    for (const [type, url] of Object.entries(customSampleUrls)) {
      const player = new Tone.Player(url).connect(distortion);
      await player.load(url);
      customSamples[type] = player;
    }

    Tone.Transport.bpm.value = song.tempo;

    song.tracks.forEach(track => {
      if (track.instrument === 'melody') {
        const part = new Tone.Part((time, value) => {
          melodySynth.triggerAttackRelease(value.note!, value.duration!, time);
        }, track.notes.map(n => ({ time: n.time, note: n.note, duration: n.duration })));
        part.start(0);
      }

      if (track.instrument === 'viola') {
        const part = new Tone.Part((time, value) => {
          violaSynth.triggerAttackRelease(value.note!, value.duration!, time);
        }, track.notes.map(n => ({ time: n.time, note: n.note, duration: n.duration })));
        part.start(0);
      }

      if (track.instrument === 'violino') {
        const part = new Tone.Part((time, value) => {
          violinoSynth.triggerAttackRelease(value.note!, value.duration!, time);
        }, track.notes.map(n => ({ time: n.time, note: n.note, duration: n.duration })));
        part.start(0);
      }

      if (track.instrument === 'marimba') {
        const part = new Tone.Part((time, value) => {
          marimbaSynth.triggerAttackRelease(value.note!, value.duration!, time);
        }, track.notes.map(n => ({ time: n.time, note: n.note, duration: n.duration })));
        part.start(0);
      }

      if (track.instrument === 'voz') {
        const part = new Tone.Part((time, value) => {
          vozSynth.triggerAttackRelease(value.note!, value.duration!, time);
        }, track.notes.map(n => ({ time: n.time, note: n.note, duration: n.duration })));
        part.start(0);
      }
      
      if (track.instrument === 'bass') {
        const part = new Tone.Part((time, value) => {
          let note = value.note!;
          const match = note.match(/([A-G]#?)(\d)/);
          if (match) {
            const pitchClass = match[1];
            let octave = parseInt(match[2]);
            if (octave > 2) octave = octave - 2;
            note = `${pitchClass}${Math.max(1, octave)}`;
          }
          bassSynth.triggerAttackRelease(note, value.duration!, time);
        }, track.notes.map(n => ({ time: n.time, note: n.note, duration: n.duration })));
        part.start(0);
      }
      
      if (track.instrument === 'drums') {
        const part = new Tone.Part((time, value) => {
          if (value.drum === 'kick') {
            if (customSamples['kick']) customSamples['kick'].start(time);
            else kickSynth.triggerAttackRelease('C1', '8n', time);
          }
          if (value.drum === 'snare') {
            if (customSamples['snare']) customSamples['snare'].start(time);
            else {
              snareBody.triggerAttackRelease('G3', '16n', time);
              snareNoise.triggerAttackRelease('16n', time);
            }
          }
          if (value.drum === 'hihat') {
            if (customSamples['hihat']) customSamples['hihat'].start(time);
            else {
              hihatSynth.envelope.decay = 0.05;
              hihatSynth.triggerAttackRelease('32n', time);
            }
          }
          if (value.drum === 'openhat') {
            if (customSamples['openhat']) customSamples['openhat'].start(time);
            else {
               hihatSynth.envelope.decay = 0.4;
               hihatSynth.triggerAttackRelease('8n', time);
            }
          }
          if (value.drum === 'batuque') {
            batuqueSynth.triggerAttackRelease('E2', '8n', time);
          }
          if (value.drum === 'sacarias') {
            sacariasSynth.triggerAttackRelease('16n', time, 0.8);
          }
        }, track.notes.map(n => ({ time: n.time, drum: n.drum })));
        part.start(0);
      }
    });

    Tone.Transport.start(0);

  }, duration);

  const audioBuffer = buffer.get() as AudioBuffer;
  return encodeWAV(audioBuffer);
}

function encodeWAV(buffer: AudioBuffer): Blob {
  const numChannels = buffer.numberOfChannels;
  const sampleRate = buffer.sampleRate;
  const format = 1;
  const bitDepth = 16;
  
  let interleaved;
  if (numChannels === 2) {
    const chanData0 = buffer.getChannelData(0);
    const chanData1 = buffer.getChannelData(1);
    interleaved = new Float32Array(chanData0.length + chanData1.length);
    let index = 0;
    let inputIndex = 0;
    while (index < interleaved.length) {
      interleaved[index++] = chanData0[inputIndex];
      interleaved[index++] = chanData1[inputIndex];
      inputIndex++;
    }
  } else {
    interleaved = buffer.getChannelData(0);
  }
  
  const bufferData = new ArrayBuffer(44 + interleaved.length * 2);
  const view = new DataView(bufferData);
  
  writeString(view, 0, 'RIFF');
  view.setUint32(4, 36 + interleaved.length * 2, true);
  writeString(view, 8, 'WAVE');
  
  writeString(view, 12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, format, true);
  view.setUint16(22, numChannels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * numChannels * 2, true);
  view.setUint16(32, numChannels * 2, true);
  view.setUint16(34, bitDepth, true);
  
  writeString(view, 36, 'data');
  view.setUint32(40, interleaved.length * 2, true);
  
  let offset = 44;
  for (let i = 0; i < interleaved.length; i++) {
    let s = Math.max(-1, Math.min(1, interleaved[i]));
    view.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7FFF, true);
    offset += 2;
  }
  
  return new Blob([view], { type: 'audio/wav' });
}

function writeString(view: DataView, offset: number, string: string) {
  for (let i = 0; i < string.length; i++) {
    view.setUint8(offset + i, string.charCodeAt(i));
  }
}

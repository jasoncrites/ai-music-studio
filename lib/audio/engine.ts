import * as Tone from 'tone';
import { Track, TrackNodes, AudioEngineConfig, TapeSaturationSettings, FETCompressorSettings, OptoCompressorSettings } from '../types/audio';
import { TapeSaturation, TAPE_PRESETS, FETCompressor, FET_PRESETS, OptoCompressor, OPTO_PRESETS } from './effects';

/**
 * Audio Engine
 * Core Web Audio API wrapper for professional DAW functionality
 * Supports up to 110 simultaneous tracks with effects processing
 */
export class AudioEngine {
  private audioContext: AudioContext;
  private masterGain: GainNode;
  private masterCompressor: DynamicsCompressorNode;
  private analyser: AnalyserNode;
  private masterTape: TapeSaturation | null = null;
  private masterFET: FETCompressor | null = null;
  private masterOpto: OptoCompressor | null = null;

  // Track processing nodes
  private trackNodes: Map<string, TrackNodes> = new Map();

  // Playback state
  private startTime: number = 0;
  private pauseTime: number = 0;
  private isPlaying: boolean = false;

  // Tone.js Transport for scheduling
  private transport: typeof Tone.Transport;

  constructor(config: AudioEngineConfig = {}) {
    // Initialize Web Audio Context
    this.audioContext = new AudioContext({
      sampleRate: config.sampleRate || 48000,
      latencyHint: config.latencyHint || 'playback',
    });

    // Create master chain
    this.masterGain = this.audioContext.createGain();
    this.masterCompressor = this.audioContext.createDynamicsCompressor();
    this.analyser = this.audioContext.createAnalyser();

    // Connect master chain
    this.masterGain.connect(this.masterCompressor);
    this.masterCompressor.connect(this.analyser);
    this.analyser.connect(this.audioContext.destination);

    // Initialize Tone.js transport for precise timing
    Tone.setContext(this.audioContext as any);
    this.transport = Tone.Transport;

    console.log('[AudioEngine] Initialized with sample rate:', this.audioContext.sampleRate);
  }

  /**
   * Get the audio context
   */
  getContext(): AudioContext {
    return this.audioContext;
  }

  /**
   * Create audio processing nodes for a track
   */
  createTrackNodes(trackId: string): TrackNodes {
    const gain = this.audioContext.createGain();
    const pan = this.audioContext.createStereoPanner();
    const eqLow = this.audioContext.createBiquadFilter();
    const eqMid = this.audioContext.createBiquadFilter();
    const eqHigh = this.audioContext.createBiquadFilter();
    const compressor = this.audioContext.createDynamicsCompressor();
    const dryGain = this.audioContext.createGain();
    const wetGain = this.audioContext.createGain();

    // Configure EQ filters
    eqLow.type = 'lowshelf';
    eqLow.frequency.value = 150;

    eqMid.type = 'peaking';
    eqMid.frequency.value = 2500;
    eqMid.Q.value = 1.0;

    eqHigh.type = 'highshelf';
    eqHigh.frequency.value = 8000;

    // Default settings
    gain.gain.value = 1.0;
    pan.pan.value = 0;
    dryGain.gain.value = 1.0;
    wetGain.gain.value = 0;

    // Connect effects chain
    // gain -> pan -> eq -> compressor -> dry/wet split -> master
    gain.connect(pan);
    pan.connect(eqLow);
    eqLow.connect(eqMid);
    eqMid.connect(eqHigh);
    eqHigh.connect(compressor);
    compressor.connect(dryGain);
    dryGain.connect(this.masterGain);

    const nodes: TrackNodes = {
      source: null,
      gain,
      pan,
      eqLow,
      eqMid,
      eqHigh,
      compressor,
      dryGain,
      wetGain,
      convolver: null,
      tapeSaturation: null,
      fetCompressor: null,
      optoCompressor: null,
    };

    this.trackNodes.set(trackId, nodes);
    return nodes;
  }

  /**
   * Enable tape saturation for a track
   */
  enableTapeSaturation(trackId: string, settings?: Partial<TapeSaturationSettings>): void {
    const nodes = this.trackNodes.get(trackId);
    if (!nodes) return;

    // Create tape saturation if not exists
    if (!nodes.tapeSaturation) {
      nodes.tapeSaturation = new TapeSaturation(this.audioContext, {
        drive: settings?.drive ?? 30,
        warmth: settings?.warmth ?? 40,
        saturation: settings?.saturation ?? 35,
        tapeSpeed: settings?.tapeSpeed ?? '15',
        tapeType: settings?.tapeType ?? 'modern',
        wowFlutter: settings?.wowFlutter ?? 5,
        hiss: settings?.hiss ?? 2,
      });

      // Rewire: compressor -> tape -> dryGain
      nodes.compressor.disconnect();
      nodes.compressor.connect(nodes.tapeSaturation.getInput());
      nodes.tapeSaturation.connect(nodes.dryGain);

      console.log('[AudioEngine] Tape saturation enabled for track:', trackId);
    }

    // Apply preset if specified
    if (settings?.preset && settings.preset in TAPE_PRESETS) {
      nodes.tapeSaturation.setPreset(settings.preset);
    }
  }

  /**
   * Disable tape saturation for a track
   */
  disableTapeSaturation(trackId: string): void {
    const nodes = this.trackNodes.get(trackId);
    if (!nodes || !nodes.tapeSaturation) return;

    // Rewire: compressor -> dryGain (bypass tape)
    nodes.compressor.disconnect();
    nodes.tapeSaturation.disconnect();
    nodes.compressor.connect(nodes.dryGain);

    nodes.tapeSaturation.dispose();
    nodes.tapeSaturation = null;

    console.log('[AudioEngine] Tape saturation disabled for track:', trackId);
  }

  /**
   * Set tape saturation parameters
   */
  setTapeSaturation(
    trackId: string,
    param: keyof TapeSaturationSettings,
    value: any
  ): void {
    const nodes = this.trackNodes.get(trackId);
    if (!nodes?.tapeSaturation) return;

    if (param === 'preset' && typeof value === 'string') {
      nodes.tapeSaturation.setPreset(value);
    } else if (param !== 'enabled' && param !== 'preset') {
      nodes.tapeSaturation.setParam(param, value);
    }
  }

  /**
   * Set tape saturation preset
   */
  setTapePreset(trackId: string, presetName: string): void {
    const nodes = this.trackNodes.get(trackId);
    if (!nodes?.tapeSaturation) {
      // Auto-enable with preset
      this.enableTapeSaturation(trackId, { preset: presetName });
      return;
    }
    nodes.tapeSaturation.setPreset(presetName);
  }

  /**
   * Get available tape presets
   */
  getTapePresets(): string[] {
    return Object.keys(TAPE_PRESETS);
  }

  /**
   * Enable master bus tape saturation
   */
  enableMasterTape(presetName: string = 'abbey-road'): void {
    if (this.masterTape) return;

    this.masterTape = new TapeSaturation(this.audioContext);
    this.masterTape.setPreset(presetName as keyof typeof TAPE_PRESETS);

    // Rewire: masterGain -> tape -> masterCompressor
    this.masterGain.disconnect();
    this.masterGain.connect(this.masterTape.getInput());
    this.masterTape.connect(this.masterCompressor);

    console.log('[AudioEngine] Master tape saturation enabled:', presetName);
  }

  /**
   * Disable master bus tape saturation
   */
  disableMasterTape(): void {
    if (!this.masterTape) return;

    // Rewire: masterGain -> masterCompressor (bypass)
    this.masterGain.disconnect();
    this.masterTape.disconnect();
    this.masterGain.connect(this.masterCompressor);

    this.masterTape.dispose();
    this.masterTape = null;

    console.log('[AudioEngine] Master tape saturation disabled');
  }

  /**
   * Set master tape preset
   */
  setMasterTapePreset(presetName: string): void {
    if (!this.masterTape) {
      this.enableMasterTape(presetName);
      return;
    }
    this.masterTape.setPreset(presetName as keyof typeof TAPE_PRESETS);
  }

  /**
   * Set master tape parameter
   */
  setMasterTapeParam(param: string, value: any): void {
    if (!this.masterTape) return;
    this.masterTape.setParam(param as any, value);
  }

  // =====================
  // FET Compressor (1176)
  // =====================

  /**
   * Enable FET compressor for a track
   */
  enableFETCompressor(trackId: string, settings?: Partial<FETCompressorSettings>): void {
    const nodes = this.trackNodes.get(trackId);
    if (!nodes) return;

    if (!nodes.fetCompressor) {
      nodes.fetCompressor = new FETCompressor(this.audioContext, {
        inputGain: settings?.inputGain ?? 0,
        outputGain: settings?.outputGain ?? 0,
        attack: settings?.attack ?? 4,
        release: settings?.release ?? 4,
        ratio: settings?.ratio ?? '4',
        mix: settings?.mix ?? 100,
      });

      // Insert after EQ, before stock compressor
      // eqHigh -> FET -> compressor
      nodes.eqHigh.disconnect();
      nodes.eqHigh.connect(nodes.fetCompressor.getInput());
      nodes.fetCompressor.connect(nodes.compressor);

      console.log('[AudioEngine] FET compressor enabled for track:', trackId);
    }

    if (settings?.preset && settings.preset in FET_PRESETS) {
      nodes.fetCompressor.setPreset(settings.preset);
    }
  }

  /**
   * Disable FET compressor for a track
   */
  disableFETCompressor(trackId: string): void {
    const nodes = this.trackNodes.get(trackId);
    if (!nodes || !nodes.fetCompressor) return;

    // Rewire: eqHigh -> compressor (bypass FET)
    nodes.eqHigh.disconnect();
    nodes.fetCompressor.disconnect();
    nodes.eqHigh.connect(nodes.compressor);

    nodes.fetCompressor.dispose();
    nodes.fetCompressor = null;

    console.log('[AudioEngine] FET compressor disabled for track:', trackId);
  }

  /**
   * Set FET compressor parameter
   */
  setFETCompressor(
    trackId: string,
    param: keyof FETCompressorSettings,
    value: any
  ): void {
    const nodes = this.trackNodes.get(trackId);
    if (!nodes?.fetCompressor) return;

    if (param === 'preset' && typeof value === 'string') {
      nodes.fetCompressor.setPreset(value);
    } else if (param !== 'enabled' && param !== 'preset') {
      nodes.fetCompressor.setParam(param, value);
    }
  }

  /**
   * Set FET compressor preset
   */
  setFETPreset(trackId: string, presetName: string): void {
    const nodes = this.trackNodes.get(trackId);
    if (!nodes?.fetCompressor) {
      this.enableFETCompressor(trackId, { preset: presetName });
      return;
    }
    nodes.fetCompressor.setPreset(presetName);
  }

  /**
   * Get FET gain reduction for metering
   */
  getFETGainReduction(trackId: string): number {
    const nodes = this.trackNodes.get(trackId);
    if (!nodes?.fetCompressor) return 0;
    return nodes.fetCompressor.getGainReduction();
  }

  /**
   * Get available FET presets
   */
  getFETPresets(): string[] {
    return Object.keys(FET_PRESETS);
  }

  /**
   * Enable master bus FET compressor
   */
  enableMasterFET(presetName: string = 'vocal-presence'): void {
    if (this.masterFET) return;

    this.masterFET = new FETCompressor(this.audioContext);
    this.masterFET.setPreset(presetName as keyof typeof FET_PRESETS);

    // Insert before master compressor
    // If master tape exists: masterGain -> tape -> FET -> masterCompressor
    // Otherwise: masterGain -> FET -> masterCompressor
    if (this.masterTape) {
      this.masterTape.disconnect();
      this.masterTape.connect(this.masterFET.getInput());
      this.masterFET.connect(this.masterCompressor);
    } else {
      this.masterGain.disconnect();
      this.masterGain.connect(this.masterFET.getInput());
      this.masterFET.connect(this.masterCompressor);
    }

    console.log('[AudioEngine] Master FET compressor enabled:', presetName);
  }

  /**
   * Disable master bus FET compressor
   */
  disableMasterFET(): void {
    if (!this.masterFET) return;

    // Rewire based on whether tape exists
    if (this.masterTape) {
      this.masterTape.disconnect();
      this.masterFET.disconnect();
      this.masterTape.connect(this.masterCompressor);
    } else {
      this.masterGain.disconnect();
      this.masterFET.disconnect();
      this.masterGain.connect(this.masterCompressor);
    }

    this.masterFET.dispose();
    this.masterFET = null;

    console.log('[AudioEngine] Master FET compressor disabled');
  }

  /**
   * Set master FET preset
   */
  setMasterFETPreset(presetName: string): void {
    if (!this.masterFET) {
      this.enableMasterFET(presetName);
      return;
    }
    this.masterFET.setPreset(presetName as keyof typeof FET_PRESETS);
  }

  /**
   * Set master FET parameter
   */
  setMasterFETParam(param: string, value: any): void {
    if (!this.masterFET) return;
    this.masterFET.setParam(param as any, value);
  }

  /**
   * Get master FET gain reduction
   */
  getMasterFETGainReduction(): number {
    if (!this.masterFET) return 0;
    return this.masterFET.getGainReduction();
  }

  // =====================
  // Opto Compressor (LA-2A)
  // =====================

  /**
   * Enable opto compressor for a track
   */
  enableOptoCompressor(trackId: string, settings?: Partial<OptoCompressorSettings>): void {
    const nodes = this.trackNodes.get(trackId);
    if (!nodes) return;

    if (!nodes.optoCompressor) {
      nodes.optoCompressor = new OptoCompressor(this.audioContext, {
        peakReduction: settings?.peakReduction ?? 40,
        gain: settings?.gain ?? 0,
        mode: settings?.mode ?? 'compress',
        mix: settings?.mix ?? 100,
        emphasis: settings?.emphasis ?? 0,
      });

      // Insert after tape saturation (if exists), or after compressor
      // Chain: compressor -> [tape] -> [opto] -> dryGain
      if (nodes.tapeSaturation) {
        nodes.tapeSaturation.disconnect();
        nodes.tapeSaturation.connect(nodes.optoCompressor.getInput());
        nodes.optoCompressor.connect(nodes.dryGain);
      } else {
        nodes.compressor.disconnect();
        nodes.compressor.connect(nodes.optoCompressor.getInput());
        nodes.optoCompressor.connect(nodes.dryGain);
      }

      console.log('[AudioEngine] Opto compressor enabled for track:', trackId);
    }

    if (settings?.preset && settings.preset in OPTO_PRESETS) {
      nodes.optoCompressor.setPreset(settings.preset);
    }
  }

  /**
   * Disable opto compressor for a track
   */
  disableOptoCompressor(trackId: string): void {
    const nodes = this.trackNodes.get(trackId);
    if (!nodes || !nodes.optoCompressor) return;

    // Rewire based on whether tape saturation exists
    if (nodes.tapeSaturation) {
      nodes.tapeSaturation.disconnect();
      nodes.optoCompressor.disconnect();
      nodes.tapeSaturation.connect(nodes.dryGain);
    } else {
      nodes.compressor.disconnect();
      nodes.optoCompressor.disconnect();
      nodes.compressor.connect(nodes.dryGain);
    }

    nodes.optoCompressor.dispose();
    nodes.optoCompressor = null;

    console.log('[AudioEngine] Opto compressor disabled for track:', trackId);
  }

  /**
   * Set opto compressor parameter
   */
  setOptoCompressor(
    trackId: string,
    param: keyof OptoCompressorSettings,
    value: any
  ): void {
    const nodes = this.trackNodes.get(trackId);
    if (!nodes?.optoCompressor) return;

    if (param === 'preset' && typeof value === 'string') {
      nodes.optoCompressor.setPreset(value);
    } else if (param !== 'enabled' && param !== 'preset') {
      nodes.optoCompressor.setParam(param, value);
    }
  }

  /**
   * Set opto compressor preset
   */
  setOptoPreset(trackId: string, presetName: string): void {
    const nodes = this.trackNodes.get(trackId);
    if (!nodes?.optoCompressor) {
      this.enableOptoCompressor(trackId, { preset: presetName });
      return;
    }
    nodes.optoCompressor.setPreset(presetName);
  }

  /**
   * Get opto gain reduction for metering
   */
  getOptoGainReduction(trackId: string): number {
    const nodes = this.trackNodes.get(trackId);
    if (!nodes?.optoCompressor) return 0;
    return nodes.optoCompressor.getGainReduction();
  }

  /**
   * Get available opto presets
   */
  getOptoPresets(): string[] {
    return Object.keys(OPTO_PRESETS);
  }

  /**
   * Enable master bus opto compressor
   */
  enableMasterOpto(presetName: string = 'mix-glue'): void {
    if (this.masterOpto) return;

    this.masterOpto = new OptoCompressor(this.audioContext);
    this.masterOpto.setPreset(presetName as keyof typeof OPTO_PRESETS);

    // Insert after FET (if exists), before master compressor
    // Chain: masterGain -> [tape] -> [FET] -> [opto] -> masterCompressor
    if (this.masterFET) {
      this.masterFET.disconnect();
      this.masterFET.connect(this.masterOpto.getInput());
      this.masterOpto.connect(this.masterCompressor);
    } else if (this.masterTape) {
      this.masterTape.disconnect();
      this.masterTape.connect(this.masterOpto.getInput());
      this.masterOpto.connect(this.masterCompressor);
    } else {
      this.masterGain.disconnect();
      this.masterGain.connect(this.masterOpto.getInput());
      this.masterOpto.connect(this.masterCompressor);
    }

    console.log('[AudioEngine] Master opto compressor enabled:', presetName);
  }

  /**
   * Disable master bus opto compressor
   */
  disableMasterOpto(): void {
    if (!this.masterOpto) return;

    // Rewire based on what's in the chain
    if (this.masterFET) {
      this.masterFET.disconnect();
      this.masterOpto.disconnect();
      this.masterFET.connect(this.masterCompressor);
    } else if (this.masterTape) {
      this.masterTape.disconnect();
      this.masterOpto.disconnect();
      this.masterTape.connect(this.masterCompressor);
    } else {
      this.masterGain.disconnect();
      this.masterOpto.disconnect();
      this.masterGain.connect(this.masterCompressor);
    }

    this.masterOpto.dispose();
    this.masterOpto = null;

    console.log('[AudioEngine] Master opto compressor disabled');
  }

  /**
   * Set master opto preset
   */
  setMasterOptoPreset(presetName: string): void {
    if (!this.masterOpto) {
      this.enableMasterOpto(presetName);
      return;
    }
    this.masterOpto.setPreset(presetName as keyof typeof OPTO_PRESETS);
  }

  /**
   * Set master opto parameter
   */
  setMasterOptoParam(param: string, value: any): void {
    if (!this.masterOpto) return;
    this.masterOpto.setParam(param as any, value);
  }

  /**
   * Get master opto gain reduction
   */
  getMasterOptoGainReduction(): number {
    if (!this.masterOpto) return 0;
    return this.masterOpto.getGainReduction();
  }

  /**
   * Load audio buffer from URL
   */
  async loadAudioBuffer(url: string): Promise<AudioBuffer> {
    // Check if it's a demo URL
    if (url.startsWith('demo://')) {
      return await this.generateDemoAudio(url);
    }

    const response = await fetch(url);
    const arrayBuffer = await response.arrayBuffer();
    return await this.audioContext.decodeAudioData(arrayBuffer);
  }

  /**
   * Generate demo audio client-side
   */
  private async generateDemoAudio(url: string): Promise<AudioBuffer> {
    // Parse demo URL
    const urlObj = new URL(url);
    const params = new URLSearchParams(urlObj.search);
    const duration = parseFloat(params.get('duration') || '30');
    const prompt = params.get('prompt') || 'demo audio';

    console.log('[AudioEngine] Generating demo audio:', { duration, prompt });

    // Create offline context for rendering
    const sampleRate = this.audioContext.sampleRate;
    const length = sampleRate * duration;
    const offlineContext = new OfflineAudioContext(2, length, sampleRate);

    // Analyze prompt for characteristics
    const hasBass = /bass|low|deep|sub/i.test(prompt);
    const hasDrums = /drum|beat|percussion|rhythm/i.test(prompt);
    const hasSynth = /synth|lead|melody|electronic/i.test(prompt);
    const isFast = /fast|upbeat|energetic|dance/i.test(prompt);

    const tempo = isFast ? 140 : 100;
    const beatInterval = 60 / tempo;

    // Generate beats
    for (let time = 0; time < duration; time += beatInterval) {
      if (hasDrums) {
        this.createDemoKick(offlineContext, time);
        if (Math.floor(time / beatInterval) % 2 === 1) {
          this.createDemoSnare(offlineContext, time);
        }
      }
    }

    // Generate bass
    if (hasBass) {
      const bassNotes = [110, 116.54, 123.47, 130.81];
      for (let time = 0; time < duration; time += beatInterval) {
        const note = bassNotes[Math.floor(time / beatInterval) % bassNotes.length];
        this.createDemoBass(offlineContext, time, note, beatInterval * 0.9);
      }
    }

    // Generate synth melody
    if (hasSynth) {
      const synthNotes = [440, 493.88, 554.37, 587.33, 659.25];
      for (let time = 0; time < duration; time += beatInterval * 2) {
        const note = synthNotes[Math.floor(Math.random() * synthNotes.length)];
        this.createDemoSynth(offlineContext, time, note, beatInterval * 1.5);
      }
    }

    // Render and return
    return await offlineContext.startRendering();
  }

  private createDemoKick(ctx: OfflineAudioContext, time: number) {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.frequency.setValueAtTime(150, time);
    osc.frequency.exponentialRampToValueAtTime(0.01, time + 0.5);
    gain.gain.setValueAtTime(0.8, time);
    gain.gain.exponentialRampToValueAtTime(0.01, time + 0.5);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(time);
    osc.stop(time + 0.5);
  }

  private createDemoSnare(ctx: OfflineAudioContext, time: number) {
    const bufferSize = ctx.sampleRate * 0.2;
    const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < data.length; i++) {
      data[i] = Math.random() * 2 - 1;
    }
    const noise = ctx.createBufferSource();
    noise.buffer = buffer;
    const filter = ctx.createBiquadFilter();
    filter.type = 'highpass';
    filter.frequency.value = 1000;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.6, time);
    gain.gain.exponentialRampToValueAtTime(0.01, time + 0.2);
    noise.connect(filter);
    filter.connect(gain);
    gain.connect(ctx.destination);
    noise.start(time);
    noise.stop(time + 0.2);
  }

  private createDemoBass(ctx: OfflineAudioContext, time: number, freq: number, dur: number) {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sawtooth';
    osc.frequency.value = freq;
    gain.gain.setValueAtTime(0.4, time);
    gain.gain.exponentialRampToValueAtTime(0.01, time + dur);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(time);
    osc.stop(time + dur);
  }

  private createDemoSynth(ctx: OfflineAudioContext, time: number, freq: number, dur: number) {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'square';
    osc.frequency.value = freq;
    gain.gain.setValueAtTime(0, time);
    gain.gain.linearRampToValueAtTime(0.3, time + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.01, time + dur);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(time);
    osc.stop(time + dur);
  }

  /**
   * Create audio buffer source for a track
   */
  createSource(trackId: string, buffer: AudioBuffer, offset: number = 0): AudioBufferSourceNode {
    const nodes = this.trackNodes.get(trackId);
    if (!nodes) {
      throw new Error(`Track nodes not found: ${trackId}`);
    }

    // Disconnect old source if exists
    if (nodes.source) {
      nodes.source.disconnect();
    }

    // Create new source
    const source = this.audioContext.createBufferSource();
    source.buffer = buffer;
    source.connect(nodes.gain);

    nodes.source = source;
    return source;
  }

  /**
   * Start playback for all tracks
   */
  async startPlayback(tracks: Track[], offset: number = 0): Promise<void> {
    // Resume audio context if suspended
    if (this.audioContext.state === 'suspended') {
      await this.audioContext.resume();
    }

    // Start Tone.js transport
    this.transport.start();

    const currentTime = this.audioContext.currentTime;

    for (const track of tracks) {
      if (!track.buffer || track.muted) continue;

      // Create and start source
      const source = this.createSource(track.id, track.buffer, offset);
      source.start(currentTime, offset);
    }

    this.startTime = currentTime - offset;
    this.isPlaying = true;

    console.log('[AudioEngine] Playback started at offset:', offset);
  }

  /**
   * Stop playback for all tracks
   */
  stopPlayback(): void {
    // Stop all sources
    for (const [trackId, nodes] of this.trackNodes) {
      if (nodes.source) {
        try {
          nodes.source.stop();
        } catch (e) {
          // Already stopped
        }
        nodes.source = null;
      }
    }

    // Stop Tone.js transport
    this.transport.stop();
    this.transport.position = 0;

    this.isPlaying = false;
    this.pauseTime = 0;

    console.log('[AudioEngine] Playback stopped');
  }

  /**
   * Pause playback
   */
  pausePlayback(): void {
    this.pauseTime = this.getCurrentTime();
    this.stopPlayback();
    console.log('[AudioEngine] Playback paused at:', this.pauseTime);
  }

  /**
   * Resume playback from pause
   */
  async resumePlayback(tracks: Track[]): Promise<void> {
    await this.startPlayback(tracks, this.pauseTime);
  }

  /**
   * Get current playback time
   */
  getCurrentTime(): number {
    if (!this.isPlaying) {
      return this.pauseTime;
    }
    return this.audioContext.currentTime - this.startTime;
  }

  /**
   * Set track volume
   */
  setTrackVolume(trackId: string, dbValue: number): void {
    const nodes = this.trackNodes.get(trackId);
    if (!nodes) return;

    // Convert dB to linear gain
    const gain = Math.pow(10, dbValue / 20);
    nodes.gain.gain.value = Math.max(0, gain);
  }

  /**
   * Set track pan
   */
  setTrackPan(trackId: string, panValue: number): void {
    const nodes = this.trackNodes.get(trackId);
    if (!nodes) return;

    nodes.pan.pan.value = Math.max(-1, Math.min(1, panValue));
  }

  /**
   * Set track EQ
   */
  setTrackEQ(trackId: string, band: 'low' | 'mid' | 'high', gainDb: number): void {
    const nodes = this.trackNodes.get(trackId);
    if (!nodes) return;

    const gain = Math.max(-12, Math.min(12, gainDb));

    switch (band) {
      case 'low':
        nodes.eqLow.gain.value = gain;
        break;
      case 'mid':
        nodes.eqMid.gain.value = gain;
        break;
      case 'high':
        nodes.eqHigh.gain.value = gain;
        break;
    }
  }

  /**
   * Set master volume
   */
  setMasterVolume(dbValue: number): void {
    const gain = Math.pow(10, dbValue / 20);
    this.masterGain.gain.value = Math.max(0, gain);
  }

  /**
   * Remove track nodes
   */
  removeTrack(trackId: string): void {
    const nodes = this.trackNodes.get(trackId);
    if (!nodes) return;

    // Disconnect all nodes
    if (nodes.source) {
      nodes.source.disconnect();
    }
    if (nodes.tapeSaturation) {
      nodes.tapeSaturation.dispose();
    }
    if (nodes.fetCompressor) {
      nodes.fetCompressor.dispose();
    }
    if (nodes.optoCompressor) {
      nodes.optoCompressor.dispose();
    }
    nodes.gain.disconnect();
    nodes.pan.disconnect();
    nodes.eqLow.disconnect();
    nodes.eqMid.disconnect();
    nodes.eqHigh.disconnect();
    nodes.compressor.disconnect();
    nodes.dryGain.disconnect();
    nodes.wetGain.disconnect();

    this.trackNodes.delete(trackId);
  }

  /**
   * Extract waveform data from audio buffer for visualization
   */
  extractWaveform(buffer: AudioBuffer, points: number = 100): number[] {
    const channelData = buffer.getChannelData(0); // Use first channel
    const sampleSize = Math.floor(channelData.length / points);
    const waveform: number[] = [];

    for (let i = 0; i < points; i++) {
      const start = i * sampleSize;
      const end = start + sampleSize;
      let sum = 0;

      // Calculate RMS (root mean square) for each chunk
      for (let j = start; j < end && j < channelData.length; j++) {
        sum += channelData[j] * channelData[j];
      }

      const rms = Math.sqrt(sum / sampleSize);
      waveform.push(Math.min(100, rms * 100));
    }

    return waveform;
  }

  /**
   * Cleanup and dispose
   */
  dispose(): void {
    this.stopPlayback();

    // Disconnect all tracks
    for (const trackId of this.trackNodes.keys()) {
      this.removeTrack(trackId);
    }

    // Dispose master effects
    if (this.masterTape) {
      this.masterTape.dispose();
      this.masterTape = null;
    }
    if (this.masterFET) {
      this.masterFET.dispose();
      this.masterFET = null;
    }
    if (this.masterOpto) {
      this.masterOpto.dispose();
      this.masterOpto = null;
    }

    // Close audio context
    this.audioContext.close();

    console.log('[AudioEngine] Disposed');
  }
}

/**
 * Tape Saturation Effect
 * Models analog tape machine characteristics:
 * - Soft clipping with harmonic distortion
 * - High-frequency rolloff (head bump)
 * - Low-frequency warmth
 * - Subtle compression behavior
 * - Optional wow/flutter
 *
 * Inspired by: Studer A800, Ampex ATR-102, MCI JH-24
 */

export interface TapeSaturationConfig {
  drive: number;        // 0-100: Input gain/saturation amount
  warmth: number;       // 0-100: Low-frequency enhancement
  saturation: number;   // 0-100: Harmonic distortion intensity
  tapeSpeed: '7.5' | '15' | '30';  // IPS - affects frequency response
  tapeType: 'modern' | 'vintage';  // Tape formulation character
  wowFlutter: number;   // 0-100: Tape speed variation
  hiss: number;         // 0-100: Tape noise level
}

export const TAPE_PRESETS: Record<string, Partial<TapeSaturationConfig>> = {
  'subtle-warmth': {
    drive: 20,
    warmth: 30,
    saturation: 15,
    tapeSpeed: '30',
    tapeType: 'modern',
    wowFlutter: 0,
    hiss: 0,
  },
  'muscle-shoals': {
    drive: 45,
    warmth: 55,
    saturation: 40,
    tapeSpeed: '15',
    tapeType: 'vintage',
    wowFlutter: 8,
    hiss: 5,
  },
  'abbey-road': {
    drive: 35,
    warmth: 45,
    saturation: 30,
    tapeSpeed: '15',
    tapeType: 'modern',
    wowFlutter: 3,
    hiss: 2,
  },
  'lo-fi-tape': {
    drive: 70,
    warmth: 60,
    saturation: 65,
    tapeSpeed: '7.5',
    tapeType: 'vintage',
    wowFlutter: 25,
    hiss: 15,
  },
  'hot-to-tape': {
    drive: 80,
    warmth: 40,
    saturation: 75,
    tapeSpeed: '15',
    tapeType: 'vintage',
    wowFlutter: 5,
    hiss: 3,
  },
};

export class TapeSaturation {
  private ctx: AudioContext;
  private input: GainNode;
  private output: GainNode;

  // Processing nodes
  private inputGain: GainNode;
  private waveshaper: WaveShaperNode;
  private lowShelf: BiquadFilterNode;
  private highShelf: BiquadFilterNode;
  private headBump: BiquadFilterNode;
  private highCut: BiquadFilterNode;
  private compressor: DynamicsCompressorNode;

  // Wow/flutter LFO
  private lfo: OscillatorNode | null = null;
  private lfoGain: GainNode | null = null;
  private delayNode: DelayNode | null = null;

  // Noise generator
  private noiseSource: AudioBufferSourceNode | null = null;
  private noiseGain: GainNode;

  private config: TapeSaturationConfig;

  constructor(ctx: AudioContext, config: Partial<TapeSaturationConfig> = {}) {
    this.ctx = ctx;
    this.config = {
      drive: 30,
      warmth: 40,
      saturation: 35,
      tapeSpeed: '15',
      tapeType: 'modern',
      wowFlutter: 5,
      hiss: 2,
      ...config,
    };

    // Create nodes
    this.input = ctx.createGain();
    this.output = ctx.createGain();
    this.inputGain = ctx.createGain();
    this.waveshaper = ctx.createWaveShaper();
    this.lowShelf = ctx.createBiquadFilter();
    this.highShelf = ctx.createBiquadFilter();
    this.headBump = ctx.createBiquadFilter();
    this.highCut = ctx.createBiquadFilter();
    this.compressor = ctx.createDynamicsCompressor();
    this.noiseGain = ctx.createGain();

    this.setupFilters();
    this.setupWaveshaper();
    this.connectNodes();
    this.applyConfig();
  }

  private setupFilters(): void {
    // Low shelf for warmth (boost around 100Hz)
    this.lowShelf.type = 'lowshelf';
    this.lowShelf.frequency.value = 100;
    this.lowShelf.gain.value = 0;

    // High shelf for tape rolloff
    this.highShelf.type = 'highshelf';
    this.highShelf.frequency.value = 8000;
    this.highShelf.gain.value = 0;

    // Head bump - resonant peak around 60-120Hz
    this.headBump.type = 'peaking';
    this.headBump.frequency.value = 80;
    this.headBump.Q.value = 1.5;
    this.headBump.gain.value = 0;

    // High cut for tape speed rolloff
    this.highCut.type = 'lowpass';
    this.highCut.frequency.value = 20000;
    this.highCut.Q.value = 0.707;

    // Gentle compression (tape naturally compresses)
    this.compressor.threshold.value = -12;
    this.compressor.knee.value = 20;
    this.compressor.ratio.value = 3;
    this.compressor.attack.value = 0.003;
    this.compressor.release.value = 0.15;
  }

  /**
   * Generate tape saturation curve
   * Combines soft clipping with harmonic generation
   */
  private setupWaveshaper(): void {
    const samples = 44100;
    const curve = new Float32Array(samples);

    for (let i = 0; i < samples; i++) {
      const x = (i * 2) / samples - 1;

      // Soft saturation using tanh-based curve
      // This creates even and odd harmonics like real tape
      const k = this.config.saturation / 100 * 4 + 1;

      // Primary saturation curve (soft clip)
      let y = Math.tanh(k * x);

      // Add subtle asymmetry for even harmonics (like real tape bias)
      const asymmetry = 0.1 * (this.config.tapeType === 'vintage' ? 1 : 0.5);
      y += asymmetry * x * x * Math.sign(x);

      // Normalize
      y = y / Math.tanh(k);

      curve[i] = y;
    }

    this.waveshaper.curve = curve;
    this.waveshaper.oversample = '4x'; // Reduce aliasing
  }

  private connectNodes(): void {
    // Signal path:
    // input -> inputGain -> lowShelf -> headBump -> waveshaper ->
    // compressor -> highShelf -> highCut -> output

    this.input.connect(this.inputGain);
    this.inputGain.connect(this.lowShelf);
    this.lowShelf.connect(this.headBump);
    this.headBump.connect(this.waveshaper);
    this.waveshaper.connect(this.compressor);
    this.compressor.connect(this.highShelf);
    this.highShelf.connect(this.highCut);
    this.highCut.connect(this.output);

    // Noise path (parallel)
    this.noiseGain.connect(this.output);
  }

  private applyConfig(): void {
    const { drive, warmth, saturation, tapeSpeed, wowFlutter, hiss } = this.config;

    // Input gain (drive)
    // Map 0-100 to 0.5-4x gain
    this.inputGain.gain.value = 0.5 + (drive / 100) * 3.5;

    // Warmth (low shelf boost)
    this.lowShelf.gain.value = (warmth / 100) * 6; // 0-6dB boost

    // Head bump intensity scales with warmth
    this.headBump.gain.value = (warmth / 100) * 4; // 0-4dB

    // Tape speed affects high frequency rolloff
    const speedRolloff: Record<string, number> = {
      '7.5': 10000,  // Significant rolloff
      '15': 16000,   // Moderate rolloff
      '30': 22000,   // Minimal rolloff
    };
    this.highCut.frequency.value = speedRolloff[tapeSpeed];

    // High shelf rolloff (natural tape characteristic)
    this.highShelf.gain.value = -(saturation / 100) * 4; // 0 to -4dB

    // Regenerate saturation curve
    this.setupWaveshaper();

    // Setup wow/flutter if enabled
    this.setupWowFlutter(wowFlutter);

    // Setup hiss if enabled
    this.setupHiss(hiss);
  }

  private setupWowFlutter(amount: number): void {
    // Clean up existing
    if (this.lfo) {
      this.lfo.stop();
      this.lfo.disconnect();
      this.lfo = null;
    }
    if (this.delayNode) {
      this.delayNode.disconnect();
      this.delayNode = null;
    }

    if (amount <= 0) return;

    // Wow/flutter uses a modulated delay
    this.delayNode = this.ctx.createDelay(0.1);
    this.delayNode.delayTime.value = 0.01; // 10ms base delay

    this.lfo = this.ctx.createOscillator();
    this.lfoGain = this.ctx.createGain();

    // Wow is slow (~0.5Hz), flutter is faster (~5-10Hz)
    // We combine both
    this.lfo.frequency.value = 0.5 + Math.random() * 0.3; // Slight randomness

    // Modulation depth
    const depth = (amount / 100) * 0.002; // Max 2ms variation
    this.lfoGain.gain.value = depth;

    this.lfo.connect(this.lfoGain);
    this.lfoGain.connect(this.delayNode.delayTime);
    this.lfo.start();

    // Insert delay into chain after waveshaper
    this.waveshaper.disconnect();
    this.waveshaper.connect(this.delayNode);
    this.delayNode.connect(this.compressor);
  }

  private setupHiss(amount: number): void {
    // Clean up existing
    if (this.noiseSource) {
      this.noiseSource.stop();
      this.noiseSource.disconnect();
      this.noiseSource = null;
    }

    if (amount <= 0) {
      this.noiseGain.gain.value = 0;
      return;
    }

    // Create noise buffer
    const bufferSize = this.ctx.sampleRate * 2;
    const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
    const data = buffer.getChannelData(0);

    // Pink-ish noise (tape hiss character)
    let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0;
    for (let i = 0; i < bufferSize; i++) {
      const white = Math.random() * 2 - 1;
      b0 = 0.99886 * b0 + white * 0.0555179;
      b1 = 0.99332 * b1 + white * 0.0750759;
      b2 = 0.96900 * b2 + white * 0.1538520;
      b3 = 0.86650 * b3 + white * 0.3104856;
      b4 = 0.55000 * b4 + white * 0.5329522;
      b5 = -0.7616 * b5 - white * 0.0168980;
      data[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + white * 0.5362) * 0.11;
      b6 = white * 0.115926;
    }

    this.noiseSource = this.ctx.createBufferSource();
    this.noiseSource.buffer = buffer;
    this.noiseSource.loop = true;
    this.noiseSource.connect(this.noiseGain);

    // Hiss level (very subtle)
    this.noiseGain.gain.value = (amount / 100) * 0.02; // Max 2% of signal

    this.noiseSource.start();
  }

  /**
   * Apply preset
   */
  setPreset(presetName: keyof typeof TAPE_PRESETS): void {
    const preset = TAPE_PRESETS[presetName];
    if (preset) {
      this.config = { ...this.config, ...preset };
      this.applyConfig();
    }
  }

  /**
   * Update individual parameter
   */
  setParam<K extends keyof TapeSaturationConfig>(
    param: K,
    value: TapeSaturationConfig[K]
  ): void {
    this.config[param] = value;
    this.applyConfig();
  }

  /**
   * Get current config
   */
  getConfig(): TapeSaturationConfig {
    return { ...this.config };
  }

  /**
   * Connect to audio graph
   */
  connect(destination: AudioNode): TapeSaturation {
    this.output.connect(destination);
    return this;
  }

  /**
   * Disconnect from audio graph
   */
  disconnect(): void {
    this.output.disconnect();
  }

  /**
   * Get input node for connecting sources
   */
  getInput(): GainNode {
    return this.input;
  }

  /**
   * Get output node
   */
  getOutput(): GainNode {
    return this.output;
  }

  /**
   * Process offline buffer (for non-realtime rendering)
   */
  async processBuffer(inputBuffer: AudioBuffer): Promise<AudioBuffer> {
    const offlineCtx = new OfflineAudioContext(
      inputBuffer.numberOfChannels,
      inputBuffer.length,
      inputBuffer.sampleRate
    );

    // Create offline version of effect chain
    const offlineSaturation = new TapeSaturation(offlineCtx as unknown as AudioContext, this.config);

    const source = offlineCtx.createBufferSource();
    source.buffer = inputBuffer;
    source.connect(offlineSaturation.getInput());
    offlineSaturation.connect(offlineCtx.destination);

    source.start();

    const renderedBuffer = await offlineCtx.startRendering();
    offlineSaturation.dispose();

    return renderedBuffer;
  }

  /**
   * Clean up resources
   */
  dispose(): void {
    if (this.lfo) {
      this.lfo.stop();
      this.lfo.disconnect();
    }
    if (this.noiseSource) {
      this.noiseSource.stop();
      this.noiseSource.disconnect();
    }

    this.input.disconnect();
    this.inputGain.disconnect();
    this.waveshaper.disconnect();
    this.lowShelf.disconnect();
    this.highShelf.disconnect();
    this.headBump.disconnect();
    this.highCut.disconnect();
    this.compressor.disconnect();
    this.noiseGain.disconnect();

    if (this.delayNode) {
      this.delayNode.disconnect();
    }
  }
}

export default TapeSaturation;

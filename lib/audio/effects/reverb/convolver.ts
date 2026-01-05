/**
 * Convolution Reverb
 *
 * High-quality convolution reverb that can:
 * - Load impulse responses from URLs
 * - Generate synthetic impulse responses for classic spaces
 * - Provide full control over reverb characteristics
 *
 * Built-in synthetic IR generators model:
 * - abbey-road-studio-2: Large orchestral recording room
 * - muscle-shoals-live: Medium live room with character
 * - plate-emt140: Classic EMT 140 plate reverb
 * - spring-vintage: Vintage spring reverb tank
 * - hall-large: Concert hall ambience
 * - room-small: Tight drum room / vocal booth
 */

export interface ConvolverReverbConfig {
  /** Pre-delay in milliseconds (0-200) */
  preDelay: number;
  /** Decay/size multiplier (0.1-3.0) - affects IR length */
  decay: number;
  /** High frequency damping (0-100) - higher = more HF absorption */
  highDamp: number;
  /** Low frequency damping (0-100) - higher = less low-end buildup */
  lowDamp: number;
  /** Dry/wet mix (0-100) */
  mix: number;
  /** Stereo width (0-200) - 100 = natural, 200 = wide, 0 = mono */
  stereoWidth: number;
}

export type SyntheticIRType =
  | 'abbey-road-studio-2'
  | 'muscle-shoals-live'
  | 'plate-emt140'
  | 'spring-vintage'
  | 'hall-large'
  | 'room-small';

/** Parameters for synthetic IR generation */
interface SyntheticIRParams {
  /** Reverb time (T60) in seconds */
  rt60: number;
  /** Room size factor */
  size: number;
  /** Initial reflection density */
  density: number;
  /** High frequency decay multiplier (< 1 = faster HF decay) */
  hfDecay: number;
  /** Low frequency decay multiplier */
  lfDecay: number;
  /** Diffusion amount (0-1) */
  diffusion: number;
  /** Early reflection pattern delay times (ms) */
  earlyPattern: number[];
  /** Early reflection pattern levels */
  earlyLevels: number[];
  /** Modulation rate (Hz) for plates/springs */
  modRate: number;
  /** Modulation depth (0-1) */
  modDepth: number;
  /** Pre-delay (ms) built into IR */
  preDelay: number;
  /** Stereo decorrelation amount */
  stereoSpread: number;
}

/** Preset parameters for synthetic IR types */
const SYNTHETIC_IR_PARAMS: Record<SyntheticIRType, SyntheticIRParams> = {
  'abbey-road-studio-2': {
    rt60: 2.8,
    size: 1.4,
    density: 0.85,
    hfDecay: 0.6,
    lfDecay: 1.1,
    diffusion: 0.75,
    earlyPattern: [12, 21, 35, 48, 67, 89, 112],
    earlyLevels: [0.9, 0.75, 0.6, 0.55, 0.45, 0.35, 0.25],
    modRate: 0.5,
    modDepth: 0.02,
    preDelay: 18,
    stereoSpread: 0.7,
  },
  'muscle-shoals-live': {
    rt60: 1.6,
    size: 0.9,
    density: 0.7,
    hfDecay: 0.55,
    lfDecay: 1.05,
    diffusion: 0.65,
    earlyPattern: [8, 15, 25, 38, 52, 71],
    earlyLevels: [0.85, 0.7, 0.55, 0.45, 0.35, 0.25],
    modRate: 0.3,
    modDepth: 0.01,
    preDelay: 10,
    stereoSpread: 0.55,
  },
  'plate-emt140': {
    rt60: 2.2,
    size: 0.6,
    density: 0.95,
    hfDecay: 0.7,
    lfDecay: 0.85,
    diffusion: 0.92,
    earlyPattern: [3, 7, 11, 16, 22, 29, 37],
    earlyLevels: [0.95, 0.88, 0.8, 0.72, 0.65, 0.58, 0.5],
    modRate: 4.5,
    modDepth: 0.08,
    preDelay: 5,
    stereoSpread: 0.85,
  },
  'spring-vintage': {
    rt60: 1.8,
    size: 0.4,
    density: 0.6,
    hfDecay: 0.5,
    lfDecay: 0.7,
    diffusion: 0.5,
    earlyPattern: [5, 12, 22, 35, 51, 70, 92, 118],
    earlyLevels: [1.0, 0.7, 0.5, 0.4, 0.35, 0.3, 0.25, 0.2],
    modRate: 6.0,
    modDepth: 0.15,
    preDelay: 2,
    stereoSpread: 0.3,
  },
  'hall-large': {
    rt60: 3.5,
    size: 1.8,
    density: 0.8,
    hfDecay: 0.5,
    lfDecay: 1.2,
    diffusion: 0.7,
    earlyPattern: [25, 45, 72, 98, 130, 165, 205],
    earlyLevels: [0.8, 0.65, 0.5, 0.4, 0.3, 0.22, 0.15],
    modRate: 0.2,
    modDepth: 0.01,
    preDelay: 35,
    stereoSpread: 0.9,
  },
  'room-small': {
    rt60: 0.6,
    size: 0.3,
    density: 0.9,
    hfDecay: 0.75,
    lfDecay: 0.9,
    diffusion: 0.8,
    earlyPattern: [3, 6, 10, 15, 21, 28],
    earlyLevels: [0.95, 0.8, 0.65, 0.5, 0.35, 0.2],
    modRate: 0.8,
    modDepth: 0.005,
    preDelay: 2,
    stereoSpread: 0.4,
  },
};

export const CONVOLVER_PRESETS: Record<string, Partial<ConvolverReverbConfig>> = {
  'subtle-ambience': {
    preDelay: 10,
    decay: 0.6,
    highDamp: 40,
    lowDamp: 20,
    mix: 15,
    stereoWidth: 100,
  },
  'vocal-plate': {
    preDelay: 25,
    decay: 1.0,
    highDamp: 35,
    lowDamp: 30,
    mix: 25,
    stereoWidth: 120,
  },
  'drum-room': {
    preDelay: 5,
    decay: 0.5,
    highDamp: 50,
    lowDamp: 15,
    mix: 30,
    stereoWidth: 80,
  },
  'lush-hall': {
    preDelay: 45,
    decay: 1.5,
    highDamp: 25,
    lowDamp: 20,
    mix: 35,
    stereoWidth: 150,
  },
  'spring-surf': {
    preDelay: 0,
    decay: 0.8,
    highDamp: 55,
    lowDamp: 40,
    mix: 40,
    stereoWidth: 60,
  },
  'orchestral': {
    preDelay: 60,
    decay: 2.0,
    highDamp: 20,
    lowDamp: 15,
    mix: 30,
    stereoWidth: 180,
  },
};

export class ConvolverReverb {
  private ctx: AudioContext;
  private input: GainNode;
  private output: GainNode;

  // Core processing
  private convolver: ConvolverNode;
  private preDelayNode: DelayNode;
  private dryGain: GainNode;
  private wetGain: GainNode;

  // Damping filters
  private highDampFilter: BiquadFilterNode;
  private lowDampFilter: BiquadFilterNode;

  // Stereo processing
  private splitter: ChannelSplitterNode;
  private merger: ChannelMergerNode;
  private leftDelay: DelayNode;
  private rightDelay: DelayNode;
  private midGain: GainNode;
  private sideGain: GainNode;

  private config: ConvolverReverbConfig;
  private currentIR: AudioBuffer | null = null;
  private currentIRType: SyntheticIRType | 'custom' | null = null;

  constructor(ctx: AudioContext, config: Partial<ConvolverReverbConfig> = {}) {
    this.ctx = ctx;
    this.config = {
      preDelay: 20,
      decay: 1.0,
      highDamp: 30,
      lowDamp: 20,
      mix: 30,
      stereoWidth: 100,
      ...config,
    };

    // Create nodes
    this.input = ctx.createGain();
    this.output = ctx.createGain();
    this.convolver = ctx.createConvolver();
    this.preDelayNode = ctx.createDelay(0.2); // Max 200ms pre-delay
    this.dryGain = ctx.createGain();
    this.wetGain = ctx.createGain();

    // Damping filters
    this.highDampFilter = ctx.createBiquadFilter();
    this.lowDampFilter = ctx.createBiquadFilter();

    // Stereo width processing
    this.splitter = ctx.createChannelSplitter(2);
    this.merger = ctx.createChannelMerger(2);
    this.leftDelay = ctx.createDelay(0.05);
    this.rightDelay = ctx.createDelay(0.05);
    this.midGain = ctx.createGain();
    this.sideGain = ctx.createGain();

    this.setupFilters();
    this.connectNodes();
    this.applyConfig();
  }

  private setupFilters(): void {
    // High damping - lowpass to absorb high frequencies
    this.highDampFilter.type = 'lowpass';
    this.highDampFilter.frequency.value = 12000;
    this.highDampFilter.Q.value = 0.7;

    // Low damping - highpass to reduce low-end buildup
    this.lowDampFilter.type = 'highpass';
    this.lowDampFilter.frequency.value = 80;
    this.lowDampFilter.Q.value = 0.7;
  }

  private connectNodes(): void {
    // Dry path
    this.input.connect(this.dryGain);
    this.dryGain.connect(this.output);

    // Wet path: input -> preDelay -> convolver -> damping -> stereo width -> wetGain -> output
    this.input.connect(this.preDelayNode);
    this.preDelayNode.connect(this.convolver);
    this.convolver.connect(this.highDampFilter);
    this.highDampFilter.connect(this.lowDampFilter);

    // Stereo width processing (Mid-Side)
    this.lowDampFilter.connect(this.splitter);

    // Left channel processing
    this.splitter.connect(this.leftDelay, 0);
    // Right channel processing
    this.splitter.connect(this.rightDelay, 1);

    // Merge back with width control
    this.leftDelay.connect(this.merger, 0, 0);
    this.rightDelay.connect(this.merger, 0, 1);

    this.merger.connect(this.wetGain);
    this.wetGain.connect(this.output);
  }

  private applyConfig(): void {
    const { preDelay, highDamp, lowDamp, mix, stereoWidth } = this.config;

    // Pre-delay
    this.preDelayNode.delayTime.value = preDelay / 1000;

    // High damping - map 0-100 to 20000-2000 Hz
    const highDampFreq = 20000 - (highDamp / 100) * 18000;
    this.highDampFilter.frequency.value = highDampFreq;

    // Low damping - map 0-100 to 20-500 Hz
    const lowDampFreq = 20 + (lowDamp / 100) * 480;
    this.lowDampFilter.frequency.value = lowDampFreq;

    // Dry/wet mix
    const wetAmount = mix / 100;
    const dryAmount = 1 - wetAmount * 0.5; // Keep some dry even at 100% wet
    this.dryGain.gain.value = dryAmount;
    this.wetGain.gain.value = wetAmount;

    // Stereo width using subtle delay differences
    // 100 = natural, >100 = wider, <100 = narrower
    const widthFactor = stereoWidth / 100;

    if (widthFactor < 1) {
      // Narrower - reduce stereo difference
      this.leftDelay.delayTime.value = 0;
      this.rightDelay.delayTime.value = 0;
    } else if (widthFactor > 1) {
      // Wider - add subtle decorrelation delay
      const maxDelay = 0.015; // 15ms max delay difference
      const delayDiff = (widthFactor - 1) * maxDelay;
      this.leftDelay.delayTime.value = 0;
      this.rightDelay.delayTime.value = delayDiff;
    } else {
      // Natural
      this.leftDelay.delayTime.value = 0;
      this.rightDelay.delayTime.value = 0;
    }
  }

  /**
   * Load impulse response from URL
   */
  async loadIR(url: string): Promise<void> {
    try {
      const response = await fetch(url);
      if (!response.ok) {
        throw new Error(`Failed to fetch IR: ${response.statusText}`);
      }

      const arrayBuffer = await response.arrayBuffer();
      const audioBuffer = await this.ctx.decodeAudioData(arrayBuffer);

      // Apply decay scaling
      this.currentIR = this.scaleIRDecay(audioBuffer, this.config.decay);
      this.convolver.buffer = this.currentIR;
      this.currentIRType = 'custom';
    } catch (error) {
      console.error('Error loading impulse response:', error);
      throw error;
    }
  }

  /**
   * Generate and load a synthetic impulse response
   */
  async loadSyntheticIR(type: SyntheticIRType): Promise<void> {
    const params = SYNTHETIC_IR_PARAMS[type];
    if (!params) {
      throw new Error(`Unknown synthetic IR type: ${type}`);
    }

    const ir = this.generateSyntheticIR(params);
    this.currentIR = this.scaleIRDecay(ir, this.config.decay);
    this.convolver.buffer = this.currentIR;
    this.currentIRType = type;
  }

  /**
   * Generate synthetic impulse response
   */
  private generateSyntheticIR(params: SyntheticIRParams): AudioBuffer {
    const sampleRate = this.ctx.sampleRate;
    const length = Math.ceil(params.rt60 * params.size * sampleRate * 1.5);
    const buffer = this.ctx.createBuffer(2, length, sampleRate);

    const leftChannel = buffer.getChannelData(0);
    const rightChannel = buffer.getChannelData(1);

    // Generate diffuse reverb tail
    for (let i = 0; i < length; i++) {
      const t = i / sampleRate;

      // Base exponential decay
      const decay = Math.exp(-6.91 * t / params.rt60);

      // Frequency-dependent decay
      const hfDecay = Math.exp(-6.91 * t / (params.rt60 * params.hfDecay));
      const lfDecay = Math.exp(-6.91 * t / (params.rt60 * params.lfDecay));

      // Noise with modulation (for plates/springs)
      const modulation = 1 + params.modDepth * Math.sin(2 * Math.PI * params.modRate * t);

      // Diffuse noise
      const noiseL = (Math.random() * 2 - 1) * params.diffusion;
      const noiseR = (Math.random() * 2 - 1) * params.diffusion;

      // Combine decay curves (mix of HF and LF decay)
      const combinedDecay = decay * (0.3 + 0.4 * hfDecay + 0.3 * lfDecay);

      // Apply modulation and decay
      leftChannel[i] = noiseL * combinedDecay * modulation;
      rightChannel[i] = noiseR * combinedDecay * modulation;
    }

    // Add early reflections
    const predelaySamples = Math.floor(params.preDelay / 1000 * sampleRate);

    for (let r = 0; r < params.earlyPattern.length; r++) {
      const delaySamples = predelaySamples + Math.floor(params.earlyPattern[r] / 1000 * sampleRate);
      const level = params.earlyLevels[r];

      if (delaySamples < length) {
        // Stereo decorrelation for early reflections
        const stereoOffset = Math.floor((Math.random() - 0.5) * params.stereoSpread * sampleRate * 0.005);

        const leftIdx = Math.min(length - 1, Math.max(0, delaySamples - stereoOffset));
        const rightIdx = Math.min(length - 1, Math.max(0, delaySamples + stereoOffset));

        // Add reflection impulse
        leftChannel[leftIdx] += level * (0.7 + Math.random() * 0.3);
        rightChannel[rightIdx] += level * (0.7 + Math.random() * 0.3);
      }
    }

    // Apply density-based filtering (smoother for higher density)
    this.applyDensitySmoothing(leftChannel, params.density);
    this.applyDensitySmoothing(rightChannel, params.density);

    // Normalize
    this.normalizeBuffer(buffer);

    return buffer;
  }

  /**
   * Apply density smoothing to the IR
   */
  private applyDensitySmoothing(channel: Float32Array, density: number): void {
    // Higher density = more averaging/smoothing
    const smoothingSamples = Math.floor((1 - density) * 32) + 1;

    if (smoothingSamples <= 1) return;

    const temp = new Float32Array(channel.length);

    for (let i = 0; i < channel.length; i++) {
      let sum = 0;
      let count = 0;
      for (let j = -smoothingSamples; j <= smoothingSamples; j++) {
        const idx = i + j;
        if (idx >= 0 && idx < channel.length) {
          sum += channel[idx];
          count++;
        }
      }
      temp[i] = sum / count;
    }

    // Copy back
    for (let i = 0; i < channel.length; i++) {
      channel[i] = temp[i] * 0.5 + channel[i] * 0.5;
    }
  }

  /**
   * Scale impulse response decay/length
   */
  private scaleIRDecay(buffer: AudioBuffer, decayMultiplier: number): AudioBuffer {
    if (decayMultiplier === 1.0) {
      return buffer;
    }

    const sampleRate = buffer.sampleRate;
    const originalLength = buffer.length;
    const newLength = Math.floor(originalLength * decayMultiplier);

    const newBuffer = this.ctx.createBuffer(
      buffer.numberOfChannels,
      newLength,
      sampleRate
    );

    for (let channel = 0; channel < buffer.numberOfChannels; channel++) {
      const oldData = buffer.getChannelData(channel);
      const newData = newBuffer.getChannelData(channel);

      if (decayMultiplier < 1.0) {
        // Shorter - truncate with fade out
        const fadeLength = Math.floor(newLength * 0.1);
        for (let i = 0; i < newLength; i++) {
          let sample = oldData[i];
          if (i > newLength - fadeLength) {
            const fadePos = (i - (newLength - fadeLength)) / fadeLength;
            sample *= 1 - fadePos;
          }
          newData[i] = sample;
        }
      } else {
        // Longer - stretch with interpolation
        for (let i = 0; i < newLength; i++) {
          const srcPos = (i / newLength) * originalLength;
          const srcIdx = Math.floor(srcPos);
          const frac = srcPos - srcIdx;

          if (srcIdx < originalLength - 1) {
            newData[i] = oldData[srcIdx] * (1 - frac) + oldData[srcIdx + 1] * frac;
          } else if (srcIdx < originalLength) {
            newData[i] = oldData[srcIdx];
          } else {
            newData[i] = 0;
          }

          // Apply extended decay envelope
          const t = i / sampleRate;
          const extendedDecay = Math.exp(-3 * t / (originalLength / sampleRate * decayMultiplier));
          newData[i] *= extendedDecay;
        }
      }
    }

    return newBuffer;
  }

  /**
   * Normalize audio buffer
   */
  private normalizeBuffer(buffer: AudioBuffer): void {
    let maxAbs = 0;

    for (let channel = 0; channel < buffer.numberOfChannels; channel++) {
      const data = buffer.getChannelData(channel);
      for (let i = 0; i < data.length; i++) {
        maxAbs = Math.max(maxAbs, Math.abs(data[i]));
      }
    }

    if (maxAbs > 0) {
      const scale = 0.95 / maxAbs;
      for (let channel = 0; channel < buffer.numberOfChannels; channel++) {
        const data = buffer.getChannelData(channel);
        for (let i = 0; i < data.length; i++) {
          data[i] *= scale;
        }
      }
    }
  }

  /**
   * Apply preset
   */
  setPreset(presetName: keyof typeof CONVOLVER_PRESETS): void {
    const preset = CONVOLVER_PRESETS[presetName];
    if (preset) {
      this.config = { ...this.config, ...preset };
      this.applyConfig();

      // Re-scale IR if decay changed and we have a current IR
      if (preset.decay !== undefined && this.currentIR) {
        if (this.currentIRType && this.currentIRType !== 'custom') {
          this.loadSyntheticIR(this.currentIRType);
        }
      }
    }
  }

  /**
   * Update parameter
   */
  setParam<K extends keyof ConvolverReverbConfig>(
    param: K,
    value: ConvolverReverbConfig[K]
  ): void {
    const oldDecay = this.config.decay;
    this.config[param] = value;
    this.applyConfig();

    // Re-scale IR if decay changed
    if (param === 'decay' && value !== oldDecay && this.currentIR) {
      if (this.currentIRType && this.currentIRType !== 'custom') {
        this.loadSyntheticIR(this.currentIRType);
      }
    }
  }

  /**
   * Get current config
   */
  getConfig(): ConvolverReverbConfig {
    return { ...this.config };
  }

  /**
   * Get current IR type
   */
  getCurrentIRType(): SyntheticIRType | 'custom' | null {
    return this.currentIRType;
  }

  /**
   * Get available synthetic IR types
   */
  getAvailableSyntheticIRs(): SyntheticIRType[] {
    return Object.keys(SYNTHETIC_IR_PARAMS) as SyntheticIRType[];
  }

  /**
   * Connect to audio graph
   */
  connect(destination: AudioNode): ConvolverReverb {
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
   * Get input node
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
   * Process offline buffer
   */
  async processBuffer(inputBuffer: AudioBuffer): Promise<AudioBuffer> {
    // Need extra length for reverb tail
    const tailLength = this.currentIR ? this.currentIR.length : 0;
    const totalLength = inputBuffer.length + tailLength;

    const offlineCtx = new OfflineAudioContext(
      Math.max(inputBuffer.numberOfChannels, 2),
      totalLength,
      inputBuffer.sampleRate
    );

    const offlineReverb = new ConvolverReverb(
      offlineCtx as unknown as AudioContext,
      this.config
    );

    // Copy current IR if available
    if (this.currentIR) {
      offlineReverb.convolver.buffer = this.currentIR;
    }

    const source = offlineCtx.createBufferSource();
    source.buffer = inputBuffer;
    source.connect(offlineReverb.getInput());
    offlineReverb.connect(offlineCtx.destination);

    source.start();

    const renderedBuffer = await offlineCtx.startRendering();
    offlineReverb.dispose();

    return renderedBuffer;
  }

  /**
   * Cleanup
   */
  dispose(): void {
    this.input.disconnect();
    this.preDelayNode.disconnect();
    this.convolver.disconnect();
    this.highDampFilter.disconnect();
    this.lowDampFilter.disconnect();
    this.dryGain.disconnect();
    this.wetGain.disconnect();
    this.splitter.disconnect();
    this.merger.disconnect();
    this.leftDelay.disconnect();
    this.rightDelay.disconnect();
    this.midGain.disconnect();
    this.sideGain.disconnect();
  }
}

export default ConvolverReverb;

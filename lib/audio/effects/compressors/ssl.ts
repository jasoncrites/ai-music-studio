/**
 * SSL G-Series Bus Compressor
 *
 * Models the Solid State Logic G-Series Bus Compressor characteristics:
 * - VCA-based compression (clean, punchy, precise)
 * - Fixed ratios: 2:1, 4:1, 10:1
 * - Stepped attack: 0.1ms, 0.3ms, 1ms, 3ms, 10ms, 30ms
 * - Stepped release: 0.1s, 0.3s, 0.6s, 1.2s, Auto (program-dependent)
 * - Threshold control with precise dB steps
 * - Makeup gain with auto-gain option
 * - Mix/blend for parallel compression
 * - The famous "glue" sound that holds mixes together
 *
 * Famous uses: Mix bus, drum bus, master bus, any source needing cohesion
 */

export interface SSLBusCompressorConfig {
  threshold: number;          // -20 to +20 dB
  ratio: '2' | '4' | '10';    // Fixed ratios
  attack: '0.1' | '0.3' | '1' | '3' | '10' | '30';  // ms
  release: '0.1' | '0.3' | '0.6' | '1.2' | 'auto';  // seconds or auto
  makeupGain: number;         // -20 to +20 dB
  mix: number;                // 0-100 dry/wet for parallel compression
  autoGain: boolean;          // Automatic makeup gain compensation
}

export const SSL_PRESETS: Record<string, Partial<SSLBusCompressorConfig>> = {
  'mix-glue': {
    threshold: -10,
    ratio: '4',
    attack: '10',      // 10ms - lets transients breathe
    release: 'auto',   // Program-dependent for musical response
    makeupGain: 4,
    mix: 100,
    autoGain: false,
  },
  'punchy-drums': {
    threshold: -15,
    ratio: '4',
    attack: '30',      // Slow - maximum transient punch
    release: '0.1',    // Fast - quick recovery for groove
    makeupGain: 6,
    mix: 100,
    autoGain: false,
  },
  'gentle-master': {
    threshold: -8,
    ratio: '2',
    attack: '10',      // Medium - gentle transient shaping
    release: '0.3',    // Medium - smooth, musical release
    makeupGain: 2,
    mix: 100,
    autoGain: true,
  },
  'radio-loud': {
    threshold: -20,
    ratio: '10',
    attack: '0.3',     // Fast - aggressive limiting
    release: '0.1',    // Fast - maximum density
    makeupGain: 10,
    mix: 100,
    autoGain: false,
  },
  'parallel-punch': {
    threshold: -25,
    ratio: '10',
    attack: '3',       // Medium-fast - controlled attack
    release: 'auto',   // Program-dependent
    makeupGain: 8,
    mix: 40,           // Blend heavily compressed with dry
    autoGain: false,
  },
};

// Attack time mapping (stepped values to seconds)
const ATTACK_TIMES: Record<string, number> = {
  '0.1': 0.0001,   // 0.1ms - ultra fast
  '0.3': 0.0003,   // 0.3ms - fast
  '1': 0.001,      // 1ms - medium-fast
  '3': 0.003,      // 3ms - medium
  '10': 0.01,      // 10ms - medium-slow
  '30': 0.03,      // 30ms - slow
};

// Release time mapping (stepped values to seconds)
const RELEASE_TIMES: Record<string, number> = {
  '0.1': 0.1,      // 100ms - fast
  '0.3': 0.3,      // 300ms - medium-fast
  '0.6': 0.6,      // 600ms - medium
  '1.2': 1.2,      // 1.2s - slow
  'auto': -1,      // Program-dependent (handled specially)
};

// Ratio mapping
const RATIO_VALUES: Record<string, number> = {
  '2': 2,
  '4': 4,
  '10': 10,
};

/**
 * Program-Dependent Release Detector
 * Models the SSL's auto-release behavior that adapts to program material
 */
class AutoReleaseDetector {
  private ctx: AudioContext;
  private baseRelease: number = 0.3;        // Base release time
  private minRelease: number = 0.05;        // Minimum release (fast transients)
  private maxRelease: number = 1.5;         // Maximum release (sustained material)
  private currentRelease: number = 0.3;
  private peakHold: number = 0;
  private lastUpdateTime: number = 0;
  private envelopeFollow: number = 0;

  constructor(ctx: AudioContext) {
    this.ctx = ctx;
    this.lastUpdateTime = ctx.currentTime;
  }

  /**
   * Update auto-release based on program material
   * Returns the calculated release time in seconds
   */
  process(inputLevel: number, gainReduction: number): number {
    const currentTime = this.ctx.currentTime;
    const deltaTime = Math.max(0.001, currentTime - this.lastUpdateTime);
    this.lastUpdateTime = currentTime;

    // Track signal envelope
    const absLevel = Math.abs(inputLevel);
    if (absLevel > this.envelopeFollow) {
      // Attack - fast tracking
      this.envelopeFollow += (absLevel - this.envelopeFollow) * 0.9;
    } else {
      // Release - slower tracking
      this.envelopeFollow += (absLevel - this.envelopeFollow) * 0.1;
    }

    // Track peak activity
    if (absLevel > this.peakHold) {
      this.peakHold = absLevel;
    } else {
      this.peakHold *= Math.exp(-deltaTime / 0.5); // Peak decay
    }

    // Calculate crest factor (peak to RMS-like ratio)
    const crestFactor = this.peakHold / Math.max(0.001, this.envelopeFollow);

    // High crest factor (punchy material) = faster release
    // Low crest factor (dense material) = slower release
    const crestInfluence = Math.min(1, Math.max(0, (crestFactor - 1) / 3));

    // More gain reduction = tendency toward faster release for recovery
    const grInfluence = Math.min(1, Math.abs(gainReduction) / 20);

    // Combine factors
    const targetRelease = this.baseRelease -
      (crestInfluence * 0.2) -
      (grInfluence * 0.1);

    // Smooth the release time changes
    const releaseChangeRate = 0.3;
    this.currentRelease += (targetRelease - this.currentRelease) * deltaTime * releaseChangeRate;

    // Clamp to valid range
    this.currentRelease = Math.max(this.minRelease, Math.min(this.maxRelease, this.currentRelease));

    return this.currentRelease;
  }

  /**
   * Get current release time
   */
  getCurrentRelease(): number {
    return this.currentRelease;
  }

  /**
   * Reset state
   */
  reset(): void {
    this.currentRelease = this.baseRelease;
    this.peakHold = 0;
    this.envelopeFollow = 0;
  }
}

export class SSLBusCompressor {
  private ctx: AudioContext;
  private input: GainNode;
  private output: GainNode;

  // Signal chain
  private inputStage: GainNode;
  private outputStage: GainNode;
  private dryGain: GainNode;
  private wetGain: GainNode;

  // Core compression
  private compressor: DynamicsCompressorNode;

  // VCA character (subtle harmonic enhancement)
  private vcaSaturation: WaveShaperNode;

  // Sidechain filter (SSL has subtle HF rolloff in sidechain)
  private sidechainFilter: BiquadFilterNode;

  // Auto-release detector
  private autoReleaseDetector: AutoReleaseDetector;

  // Detector for level sensing
  private detector: AnalyserNode;
  private detectorData: Float32Array<ArrayBuffer>;

  // Processing loop
  private processingActive: boolean = false;
  private rafId: number | null = null;

  // Metering
  private grMeter: AnalyserNode;

  private config: SSLBusCompressorConfig;

  constructor(ctx: AudioContext, config: Partial<SSLBusCompressorConfig> = {}) {
    this.ctx = ctx;
    this.config = {
      threshold: -10,
      ratio: '4',
      attack: '10',
      release: 'auto',
      makeupGain: 0,
      mix: 100,
      autoGain: false,
      ...config,
    };

    // Create nodes
    this.input = ctx.createGain();
    this.output = ctx.createGain();
    this.inputStage = ctx.createGain();
    this.outputStage = ctx.createGain();
    this.dryGain = ctx.createGain();
    this.wetGain = ctx.createGain();
    this.compressor = ctx.createDynamicsCompressor();
    this.vcaSaturation = ctx.createWaveShaper();
    this.sidechainFilter = ctx.createBiquadFilter();
    this.detector = ctx.createAnalyser();
    this.grMeter = ctx.createAnalyser();

    this.detectorData = new Float32Array(256);
    this.autoReleaseDetector = new AutoReleaseDetector(ctx);

    this.setupVCASaturation();
    this.setupSidechainFilter();
    this.connectNodes();
    this.applyConfig();
  }

  /**
   * VCA saturation curve
   * SSL's VCA compression is known for being clean but with subtle character
   * Adds very gentle harmonic content that contributes to the "glue"
   */
  private setupVCASaturation(): void {
    const samples = 44100;
    const curve = new Float32Array(samples);

    for (let i = 0; i < samples; i++) {
      const x = (i * 2) / samples - 1;

      // Very clean VCA-style saturation
      // Much cleaner than FET or tube - the SSL character is precision
      const k = 1.2; // Subtle saturation amount

      // Symmetric soft clipping (VCA is very linear)
      let y = Math.tanh(k * x) / Math.tanh(k);

      // Add extremely subtle even harmonics (VCA amp stages)
      // This contributes to the cohesive "glue" sound
      y += 0.005 * x * x * Math.sign(x);

      curve[i] = y;
    }

    this.vcaSaturation.curve = curve;
    this.vcaSaturation.oversample = '2x';
  }

  /**
   * Sidechain filter
   * SSL has a gentle high-frequency rolloff in the sidechain
   * This prevents excessive pumping from hi-hats and cymbals
   */
  private setupSidechainFilter(): void {
    this.sidechainFilter.type = 'lowpass';
    this.sidechainFilter.frequency.value = 8000; // Gentle HF rolloff
    this.sidechainFilter.Q.value = 0.7; // Smooth slope

    // Detector settings
    this.detector.fftSize = 256;
    this.detector.smoothingTimeConstant = 0.85;

    // GR meter settings
    this.grMeter.fftSize = 256;
    this.grMeter.smoothingTimeConstant = 0.9;
  }

  private connectNodes(): void {
    // Dry path for parallel compression
    this.input.connect(this.dryGain);

    // Wet path:
    // input -> inputStage -> compressor -> vcaSaturation -> grMeter -> outputStage -> wetGain
    this.input.connect(this.inputStage);
    this.inputStage.connect(this.compressor);
    this.compressor.connect(this.vcaSaturation);
    this.vcaSaturation.connect(this.grMeter);
    this.grMeter.connect(this.outputStage);
    this.outputStage.connect(this.wetGain);

    // Detection path (for auto-release)
    this.input.connect(this.sidechainFilter);
    this.sidechainFilter.connect(this.detector);

    // Mix to output
    this.dryGain.connect(this.output);
    this.wetGain.connect(this.output);
  }

  /**
   * Start auto-release processing loop
   */
  private startAutoReleaseProcessing(): void {
    if (this.processingActive) return;
    this.processingActive = true;

    const process = () => {
      if (!this.processingActive) return;

      // Get input level for auto-release calculation
      this.detector.getFloatTimeDomainData(this.detectorData);

      let sum = 0;
      for (let i = 0; i < this.detectorData.length; i++) {
        sum += this.detectorData[i] * this.detectorData[i];
      }
      const rms = Math.sqrt(sum / this.detectorData.length);
      const inputLevelDB = 20 * Math.log10(Math.max(rms, 0.0001));

      // Get current gain reduction
      const gainReduction = this.compressor.reduction;

      // Calculate program-dependent release
      const autoRelease = this.autoReleaseDetector.process(inputLevelDB, gainReduction);

      // Apply the calculated release time smoothly
      this.compressor.release.setTargetAtTime(autoRelease, this.ctx.currentTime, 0.05);

      this.rafId = requestAnimationFrame(process);
    };

    process();
  }

  /**
   * Stop auto-release processing
   */
  private stopAutoReleaseProcessing(): void {
    this.processingActive = false;
    if (this.rafId !== null) {
      cancelAnimationFrame(this.rafId);
      this.rafId = null;
    }
  }

  /**
   * Calculate automatic makeup gain based on threshold and ratio
   */
  private calculateAutoGain(): number {
    const { threshold, ratio } = this.config;
    const ratioValue = RATIO_VALUES[ratio];

    // Estimate average gain reduction based on threshold
    // Assumes average signal is around -18dBFS
    const averageSignal = -18;
    const overThreshold = Math.max(0, averageSignal - threshold);

    if (overThreshold <= 0) return 0;

    // Calculate gain reduction at this level
    const gainReduction = overThreshold * (1 - 1 / ratioValue);

    // Return makeup to compensate (with some headroom)
    return gainReduction * 0.7;
  }

  private applyConfig(): void {
    const { threshold, ratio, attack, release, makeupGain, mix, autoGain } = this.config;

    // Threshold
    this.compressor.threshold.value = threshold;

    // Ratio
    const ratioValue = RATIO_VALUES[ratio];
    this.compressor.ratio.value = ratioValue;

    // Soft knee for that smooth SSL response
    // SSL has a relatively soft knee compared to other VCA comps
    this.compressor.knee.value = ratio === '2' ? 12 : ratio === '4' ? 8 : 4;

    // Attack time
    const attackTime = ATTACK_TIMES[attack];
    this.compressor.attack.value = attackTime;

    // Release time
    if (release === 'auto') {
      // Start auto-release processing
      this.startAutoReleaseProcessing();
    } else {
      // Fixed release time
      this.stopAutoReleaseProcessing();
      const releaseTime = RELEASE_TIMES[release];
      this.compressor.release.value = releaseTime;
    }

    // Makeup gain (auto or manual)
    let finalMakeup = makeupGain;
    if (autoGain) {
      finalMakeup += this.calculateAutoGain();
    }
    this.outputStage.gain.value = Math.pow(10, finalMakeup / 20);

    // Dry/wet mix for parallel compression
    const wetAmount = mix / 100;
    const dryAmount = 1 - wetAmount;
    this.dryGain.gain.value = dryAmount;
    this.wetGain.gain.value = wetAmount;
  }

  /**
   * Apply preset
   */
  setPreset(presetName: keyof typeof SSL_PRESETS): void {
    const preset = SSL_PRESETS[presetName];
    if (preset) {
      this.config = { ...this.config, ...preset };
      this.applyConfig();
    }
  }

  /**
   * Update parameter
   */
  setParam<K extends keyof SSLBusCompressorConfig>(
    param: K,
    value: SSLBusCompressorConfig[K]
  ): void {
    this.config[param] = value;
    this.applyConfig();
  }

  /**
   * Get current config
   */
  getConfig(): SSLBusCompressorConfig {
    return { ...this.config };
  }

  /**
   * Get gain reduction in dB (for metering)
   */
  getGainReduction(): number {
    return this.compressor.reduction;
  }

  /**
   * Get current auto-release time (if in auto mode)
   */
  getAutoReleaseTime(): number | null {
    if (this.config.release === 'auto') {
      return this.autoReleaseDetector.getCurrentRelease();
    }
    return null;
  }

  /**
   * Get meter data for visualization
   */
  getMeterData(): {
    gainReduction: number;
    inputLevel: number;
    outputLevel: number;
    releaseTime: number;
  } {
    const bufferSize = 256;
    const inputData = new Float32Array(bufferSize);
    const outputData = new Float32Array(bufferSize);

    this.detector.getFloatTimeDomainData(inputData);
    this.grMeter.getFloatTimeDomainData(outputData);

    // Calculate RMS levels
    let inputSum = 0;
    let outputSum = 0;
    for (let i = 0; i < bufferSize; i++) {
      inputSum += inputData[i] * inputData[i];
      outputSum += outputData[i] * outputData[i];
    }

    const inputRMS = Math.sqrt(inputSum / bufferSize);
    const outputRMS = Math.sqrt(outputSum / bufferSize);

    // Convert to dB
    const inputLevel = 20 * Math.log10(Math.max(inputRMS, 0.0001));
    const outputLevel = 20 * Math.log10(Math.max(outputRMS, 0.0001));

    // Get current release time
    const releaseTime = this.config.release === 'auto'
      ? this.autoReleaseDetector.getCurrentRelease()
      : RELEASE_TIMES[this.config.release];

    return {
      gainReduction: this.compressor.reduction,
      inputLevel,
      outputLevel,
      releaseTime,
    };
  }

  /**
   * Connect to audio graph
   */
  connect(destination: AudioNode): SSLBusCompressor {
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
    const offlineCtx = new OfflineAudioContext(
      inputBuffer.numberOfChannels,
      inputBuffer.length,
      inputBuffer.sampleRate
    );

    // For offline rendering, use fixed release if auto was selected
    const offlineConfig = { ...this.config };
    if (offlineConfig.release === 'auto') {
      offlineConfig.release = '0.3'; // Default to medium release for offline
    }

    const offlineComp = new SSLBusCompressor(
      offlineCtx as unknown as AudioContext,
      offlineConfig
    );

    const source = offlineCtx.createBufferSource();
    source.buffer = inputBuffer;
    source.connect(offlineComp.getInput());
    offlineComp.connect(offlineCtx.destination);

    source.start();

    const renderedBuffer = await offlineCtx.startRendering();
    offlineComp.dispose();

    return renderedBuffer;
  }

  /**
   * Cleanup
   */
  dispose(): void {
    this.stopAutoReleaseProcessing();

    this.input.disconnect();
    this.inputStage.disconnect();
    this.outputStage.disconnect();
    this.dryGain.disconnect();
    this.wetGain.disconnect();
    this.compressor.disconnect();
    this.vcaSaturation.disconnect();
    this.sidechainFilter.disconnect();
    this.detector.disconnect();
    this.grMeter.disconnect();

    this.autoReleaseDetector.reset();
  }
}

export default SSLBusCompressor;

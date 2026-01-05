/**
 * FET Compressor (1176-style)
 *
 * Models the UREI/Universal Audio 1176 characteristics:
 * - Ultra-fast FET-based attack (20μs - 800μs)
 * - Program-dependent release
 * - Fixed ratios: 4:1, 8:1, 12:1, 20:1
 * - "All buttons in" mode (aggressive parallel compression)
 * - FET harmonic distortion
 * - Input/Output gain staging
 *
 * Famous uses: Vocals, drums, bass, "brick wall" limiting
 */

export interface FETCompressorConfig {
  inputGain: number;      // -20 to +20 dB (drives into compression)
  outputGain: number;     // -20 to +20 dB (makeup gain)
  attack: number;         // 1-7 (1=fastest 20μs, 7=slowest 800μs)
  release: number;        // 1-7 (1=fastest 50ms, 7=slowest 1100ms)
  ratio: '4' | '8' | '12' | '20' | 'all';  // Fixed ratios or "all buttons in"
  mix: number;            // 0-100 dry/wet for parallel compression
}

export const FET_PRESETS: Record<string, Partial<FETCompressorConfig>> = {
  'vocal-presence': {
    inputGain: 0,
    outputGain: 3,
    attack: 3,      // Medium-fast
    release: 5,     // Medium
    ratio: '4',
    mix: 100,
  },
  'snare-crack': {
    inputGain: 6,
    outputGain: 0,
    attack: 1,      // Fastest - lets transient through
    release: 7,     // Slow release
    ratio: '8',
    mix: 100,
  },
  'drum-bus-smash': {
    inputGain: 12,
    outputGain: -3,
    attack: 4,      // Medium
    release: 4,     // Medium
    ratio: 'all',   // All buttons in
    mix: 40,        // Parallel blend
  },
  'bass-control': {
    inputGain: 3,
    outputGain: 2,
    attack: 7,      // Slow - preserve low-end transients
    release: 4,
    ratio: '8',
    mix: 100,
  },
  'vocal-slam': {
    inputGain: 10,
    outputGain: 0,
    attack: 2,
    release: 6,
    ratio: '12',
    mix: 100,
  },
  'limiting': {
    inputGain: 8,
    outputGain: -2,
    attack: 1,
    release: 3,
    ratio: '20',
    mix: 100,
  },
  'all-buttons-crush': {
    inputGain: 15,
    outputGain: -6,
    attack: 3,
    release: 3,
    ratio: 'all',
    mix: 100,
  },
};

// Attack time mapping (position 1-7 to seconds)
const ATTACK_TIMES: Record<number, number> = {
  1: 0.00002,   // 20μs
  2: 0.00008,   // 80μs
  3: 0.0002,    // 200μs
  4: 0.0004,    // 400μs
  5: 0.0005,    // 500μs
  6: 0.0006,    // 600μs
  7: 0.0008,    // 800μs
};

// Release time mapping (position 1-7 to seconds)
const RELEASE_TIMES: Record<number, number> = {
  1: 0.05,      // 50ms
  2: 0.1,       // 100ms
  3: 0.2,       // 200ms
  4: 0.4,       // 400ms
  5: 0.6,       // 600ms
  6: 0.8,       // 800ms
  7: 1.1,       // 1100ms
};

// Ratio mapping
const RATIO_VALUES: Record<string, number> = {
  '4': 4,
  '8': 8,
  '12': 12,
  '20': 20,
  'all': 50,    // "All buttons in" is essentially extreme limiting
};

export class FETCompressor {
  private ctx: AudioContext;
  private input: GainNode;
  private output: GainNode;

  // Signal chain
  private inputStage: GainNode;
  private outputStage: GainNode;
  private dryGain: GainNode;
  private wetGain: GainNode;

  // Compression
  private compressor: DynamicsCompressorNode;
  private detector: AnalyserNode;

  // FET saturation (harmonic distortion)
  private fetSaturation: WaveShaperNode;

  // All-buttons-in parallel path
  private allButtonsCompressor: DynamicsCompressorNode | null = null;
  private allButtonsSaturation: WaveShaperNode | null = null;
  private allButtonsGain: GainNode | null = null;

  // Metering
  private grMeter: AnalyserNode;

  private config: FETCompressorConfig;
  private isAllButtonsMode: boolean = false;

  constructor(ctx: AudioContext, config: Partial<FETCompressorConfig> = {}) {
    this.ctx = ctx;
    this.config = {
      inputGain: 0,
      outputGain: 0,
      attack: 4,
      release: 4,
      ratio: '4',
      mix: 100,
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
    this.detector = ctx.createAnalyser();
    this.fetSaturation = ctx.createWaveShaper();
    this.grMeter = ctx.createAnalyser();

    this.setupFETSaturation();
    this.connectNodes();
    this.applyConfig();
  }

  /**
   * FET transistor saturation curve
   * Creates subtle harmonic distortion characteristic of 1176
   */
  private setupFETSaturation(): void {
    const samples = 44100;
    const curve = new Float32Array(samples);

    for (let i = 0; i < samples; i++) {
      const x = (i * 2) / samples - 1;

      // FET-style soft saturation
      // Asymmetric for even harmonics
      const k = 2.5; // Saturation amount

      if (x >= 0) {
        // Positive half - gentle saturation
        curve[i] = Math.tanh(k * x) / Math.tanh(k);
      } else {
        // Negative half - slightly more aggressive (FET asymmetry)
        curve[i] = Math.tanh(k * 1.1 * x) / Math.tanh(k * 1.1);
      }

      // Add subtle 2nd harmonic
      curve[i] += 0.02 * Math.sin(2 * Math.PI * x);
    }

    this.fetSaturation.curve = curve;
    this.fetSaturation.oversample = '2x';
  }

  /**
   * "All buttons in" mode saturation
   * More aggressive, creates the famous gnarly sound
   */
  private createAllButtonsSaturation(): WaveShaperNode {
    const shaper = this.ctx.createWaveShaper();
    const samples = 44100;
    const curve = new Float32Array(samples);

    for (let i = 0; i < samples; i++) {
      const x = (i * 2) / samples - 1;

      // Aggressive clipping with harmonics
      const k = 8;
      let y = Math.tanh(k * x);

      // Add odd harmonics for that "trash" sound
      y += 0.05 * Math.sin(3 * Math.PI * x);
      y += 0.02 * Math.sin(5 * Math.PI * x);

      // Normalize
      curve[i] = y / 1.07;
    }

    shaper.curve = curve;
    shaper.oversample = '4x';
    return shaper;
  }

  private connectNodes(): void {
    // Main signal path:
    // input -> inputStage -> FET saturation -> compressor -> outputStage -> wetGain

    // Dry path for parallel compression
    this.input.connect(this.dryGain);

    // Wet path
    this.input.connect(this.inputStage);
    this.inputStage.connect(this.fetSaturation);
    this.fetSaturation.connect(this.compressor);
    this.compressor.connect(this.grMeter);
    this.grMeter.connect(this.outputStage);
    this.outputStage.connect(this.wetGain);

    // Mix to output
    this.dryGain.connect(this.output);
    this.wetGain.connect(this.output);
  }

  private setupAllButtonsMode(): void {
    if (this.allButtonsCompressor) return;

    // Create parallel "all buttons" chain
    this.allButtonsCompressor = this.ctx.createDynamicsCompressor();
    this.allButtonsSaturation = this.createAllButtonsSaturation();
    this.allButtonsGain = this.ctx.createGain();

    // Configure for extreme compression
    this.allButtonsCompressor.threshold.value = -30;
    this.allButtonsCompressor.knee.value = 0;
    this.allButtonsCompressor.ratio.value = 20;
    this.allButtonsCompressor.attack.value = 0.0001;
    this.allButtonsCompressor.release.value = 0.05;

    this.allButtonsGain.gain.value = 0.5; // Blend level

    // Connect: inputStage -> saturation -> allButtonsComp -> gain -> wetGain
    this.inputStage.connect(this.allButtonsSaturation);
    this.allButtonsSaturation.connect(this.allButtonsCompressor);
    this.allButtonsCompressor.connect(this.allButtonsGain);
    this.allButtonsGain.connect(this.wetGain);

    this.isAllButtonsMode = true;
  }

  private disableAllButtonsMode(): void {
    if (!this.allButtonsCompressor) return;

    // Disconnect and cleanup
    this.inputStage.disconnect(this.allButtonsSaturation!);
    this.allButtonsSaturation!.disconnect();
    this.allButtonsCompressor.disconnect();
    this.allButtonsGain!.disconnect();

    this.allButtonsCompressor = null;
    this.allButtonsSaturation = null;
    this.allButtonsGain = null;
    this.isAllButtonsMode = false;
  }

  private applyConfig(): void {
    const { inputGain, outputGain, attack, release, ratio, mix } = this.config;

    // Input gain (dB to linear)
    this.inputStage.gain.value = Math.pow(10, inputGain / 20);

    // Output gain (dB to linear)
    this.outputStage.gain.value = Math.pow(10, outputGain / 20);

    // Attack time
    const attackTime = ATTACK_TIMES[Math.min(7, Math.max(1, attack))] || 0.0004;
    this.compressor.attack.value = attackTime;

    // Release time (program-dependent simulation)
    const releaseTime = RELEASE_TIMES[Math.min(7, Math.max(1, release))] || 0.4;
    this.compressor.release.value = releaseTime;

    // Ratio and threshold
    const ratioValue = RATIO_VALUES[ratio] || 4;
    this.compressor.ratio.value = Math.min(20, ratioValue);

    // 1176 has fixed threshold, compression amount controlled by input gain
    this.compressor.threshold.value = -24;
    this.compressor.knee.value = ratio === 'all' ? 0 : 6;

    // Handle "all buttons in" mode
    if (ratio === 'all' && !this.isAllButtonsMode) {
      this.setupAllButtonsMode();
    } else if (ratio !== 'all' && this.isAllButtonsMode) {
      this.disableAllButtonsMode();
    }

    // Dry/wet mix
    const wetAmount = mix / 100;
    const dryAmount = 1 - wetAmount;
    this.dryGain.gain.value = dryAmount;
    this.wetGain.gain.value = wetAmount;
  }

  /**
   * Apply preset
   */
  setPreset(presetName: keyof typeof FET_PRESETS): void {
    const preset = FET_PRESETS[presetName];
    if (preset) {
      this.config = { ...this.config, ...preset };
      this.applyConfig();
    }
  }

  /**
   * Update parameter
   */
  setParam<K extends keyof FETCompressorConfig>(
    param: K,
    value: FETCompressorConfig[K]
  ): void {
    this.config[param] = value;
    this.applyConfig();
  }

  /**
   * Get current config
   */
  getConfig(): FETCompressorConfig {
    return { ...this.config };
  }

  /**
   * Get gain reduction in dB (for metering)
   */
  getGainReduction(): number {
    return this.compressor.reduction;
  }

  /**
   * Get current compression level for visualization
   */
  getMeterData(): { gainReduction: number; inputLevel: number; outputLevel: number } {
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

    return {
      gainReduction: this.compressor.reduction,
      inputLevel,
      outputLevel,
    };
  }

  /**
   * Connect to audio graph
   */
  connect(destination: AudioNode): FETCompressor {
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

    const offlineComp = new FETCompressor(offlineCtx as unknown as AudioContext, this.config);

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
    this.disableAllButtonsMode();

    this.input.disconnect();
    this.inputStage.disconnect();
    this.fetSaturation.disconnect();
    this.compressor.disconnect();
    this.outputStage.disconnect();
    this.dryGain.disconnect();
    this.wetGain.disconnect();
    this.grMeter.disconnect();
    this.detector.disconnect();
  }
}

export default FETCompressor;

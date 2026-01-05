/**
 * Optical Compressor (LA-2A style)
 *
 * Models the Teletronix LA-2A characteristics:
 * - T4 opto cell behavior (photocell + electroluminescent panel)
 * - Program-dependent attack/release
 * - Two-stage release curve
 * - Only Peak Reduction and Gain controls
 * - Compress vs Limit modes
 * - Tube stage warmth
 * - Ultra-smooth, musical compression
 *
 * Famous uses: Vocals, bass, acoustic guitar, mix bus glue
 */

export interface OptoCompressorConfig {
  peakReduction: number;    // 0-100: Amount of compression (threshold + ratio combined)
  gain: number;             // -20 to +20 dB: Makeup gain
  mode: 'compress' | 'limit';  // Compress (~3:1) or Limit (~100:1)
  mix: number;              // 0-100: Dry/wet for parallel compression
  emphasis: number;         // 0-100: High frequency emphasis (sidechain HF boost)
}

export const OPTO_PRESETS: Record<string, Partial<OptoCompressorConfig>> = {
  'silky-vocal': {
    peakReduction: 40,
    gain: 6,
    mode: 'compress',
    mix: 100,
    emphasis: 20,
  },
  'vocal-leveling': {
    peakReduction: 55,
    gain: 8,
    mode: 'compress',
    mix: 100,
    emphasis: 15,
  },
  'bass-smooth': {
    peakReduction: 50,
    gain: 4,
    mode: 'compress',
    mix: 100,
    emphasis: 0,
  },
  'acoustic-guitar': {
    peakReduction: 35,
    gain: 5,
    mode: 'compress',
    mix: 100,
    emphasis: 25,
  },
  'mix-glue': {
    peakReduction: 25,
    gain: 2,
    mode: 'compress',
    mix: 100,
    emphasis: 10,
  },
  'parallel-thickness': {
    peakReduction: 70,
    gain: 0,
    mode: 'compress',
    mix: 35,
    emphasis: 0,
  },
  'limiting': {
    peakReduction: 60,
    gain: 3,
    mode: 'limit',
    mix: 100,
    emphasis: 0,
  },
  'broadcast-vocal': {
    peakReduction: 65,
    gain: 10,
    mode: 'limit',
    mix: 100,
    emphasis: 30,
  },
};

/**
 * T4 Opto Cell Simulation
 * Models the unique attack/release behavior of the electroluminescent panel + photocell
 */
class T4OptoCell {
  private ctx: AudioContext;
  private attackTime: number = 0.01;  // 10ms base attack
  private releaseTime1: number = 0.06; // 60ms initial release
  private releaseTime2: number = 1.0;  // 1-3s second stage release

  // Internal state for program-dependent timing
  private currentGain: number = 1.0;
  private targetGain: number = 1.0;
  private lastUpdateTime: number = 0;

  // The "glow" of the electroluminescent panel
  private glowLevel: number = 0;

  constructor(ctx: AudioContext) {
    this.ctx = ctx;
    this.lastUpdateTime = ctx.currentTime;
  }

  /**
   * Update opto cell based on input level
   * Returns the gain reduction multiplier (0-1)
   */
  process(inputLevel: number, threshold: number, ratio: number): number {
    const currentTime = this.ctx.currentTime;
    const deltaTime = Math.max(0.001, currentTime - this.lastUpdateTime);
    this.lastUpdateTime = currentTime;

    // Calculate how much we're over threshold
    const overThreshold = Math.max(0, inputLevel - threshold);

    // Target gain reduction based on ratio
    if (overThreshold > 0) {
      const reduction = overThreshold * (1 - 1 / ratio);
      this.targetGain = Math.pow(10, -reduction / 20);
    } else {
      this.targetGain = 1.0;
    }

    // Opto cell behavior: the "glow" responds to input
    // Attack: panel lights up relatively quickly
    // Release: photocell responds slowly to dimming (two-stage)
    if (this.targetGain < this.currentGain) {
      // Attack phase - panel lighting up
      const attackCoef = 1 - Math.exp(-deltaTime / this.attackTime);
      this.currentGain += (this.targetGain - this.currentGain) * attackCoef;

      // Update glow level
      this.glowLevel = 1 - this.targetGain;
    } else {
      // Release phase - two-stage behavior
      // First stage: quick initial release
      // Second stage: slow tail

      const releaseProgress = 1 - this.currentGain;
      let releaseTime: number;

      if (releaseProgress > 0.5) {
        // First stage - faster release
        releaseTime = this.releaseTime1;
      } else {
        // Second stage - slower release (the famous LA-2A "tail")
        releaseTime = this.releaseTime1 + (this.releaseTime2 - this.releaseTime1) * (1 - releaseProgress * 2);
      }

      const releaseCoef = 1 - Math.exp(-deltaTime / releaseTime);
      this.currentGain += (this.targetGain - this.currentGain) * releaseCoef;

      // Glow fades
      this.glowLevel *= Math.exp(-deltaTime / this.releaseTime2);
    }

    return this.currentGain;
  }

  /**
   * Get current gain reduction in dB
   */
  getGainReductionDB(): number {
    return 20 * Math.log10(Math.max(0.0001, this.currentGain));
  }

  /**
   * Reset state
   */
  reset(): void {
    this.currentGain = 1.0;
    this.targetGain = 1.0;
    this.glowLevel = 0;
  }
}

export class OptoCompressor {
  private ctx: AudioContext;
  private input: GainNode;
  private output: GainNode;

  // Signal chain
  private inputGain: GainNode;
  private outputGain: GainNode;
  private dryGain: GainNode;
  private wetGain: GainNode;

  // Compression
  private compressor: DynamicsCompressorNode;

  // Emphasis filter (sidechain HF boost)
  private emphasisFilter: BiquadFilterNode;

  // Tube warmth
  private tubeWarmth: WaveShaperNode;

  // Soft knee shaper
  private softKnee: WaveShaperNode;

  // Detector for level sensing
  private detector: AnalyserNode;
  private detectorData: Float32Array<ArrayBuffer>;

  // T4 Opto cell simulation
  private optoCell: T4OptoCell;

  // Gain reduction node (controlled by opto cell)
  private grNode: GainNode;

  // Animation frame for continuous processing
  private processingActive: boolean = false;
  private rafId: number | null = null;

  private config: OptoCompressorConfig;

  // Metering
  private gainReduction: number = 0;

  constructor(ctx: AudioContext, config: Partial<OptoCompressorConfig> = {}) {
    this.ctx = ctx;
    this.config = {
      peakReduction: 40,
      gain: 0,
      mode: 'compress',
      mix: 100,
      emphasis: 0,
      ...config,
    };

    // Create nodes
    this.input = ctx.createGain();
    this.output = ctx.createGain();
    this.inputGain = ctx.createGain();
    this.outputGain = ctx.createGain();
    this.dryGain = ctx.createGain();
    this.wetGain = ctx.createGain();
    this.compressor = ctx.createDynamicsCompressor();
    this.emphasisFilter = ctx.createBiquadFilter();
    this.tubeWarmth = ctx.createWaveShaper();
    this.softKnee = ctx.createWaveShaper();
    this.detector = ctx.createAnalyser();
    this.grNode = ctx.createGain();

    this.detectorData = new Float32Array(256);
    this.optoCell = new T4OptoCell(ctx);

    this.setupFilters();
    this.setupTubeWarmth();
    this.setupSoftKnee();
    this.connectNodes();
    this.applyConfig();
  }

  private setupFilters(): void {
    // Emphasis filter - gentle HF boost for sidechain
    // LA-2A has a "emphasis" switch that affects HF response
    this.emphasisFilter.type = 'highshelf';
    this.emphasisFilter.frequency.value = 3000;
    this.emphasisFilter.gain.value = 0;

    // Detector settings
    this.detector.fftSize = 256;
    this.detector.smoothingTimeConstant = 0.8;

    // Configure dynamics compressor as a soft limiter
    // We'll modulate gain separately for true opto behavior
    this.compressor.threshold.value = -24;
    this.compressor.knee.value = 30;  // Very soft knee
    this.compressor.ratio.value = 3;
    this.compressor.attack.value = 0.01;
    this.compressor.release.value = 0.3;
  }

  /**
   * Tube output stage warmth
   * LA-2A has 12AX7 and 12BH7 tubes that add subtle harmonics
   */
  private setupTubeWarmth(): void {
    const samples = 44100;
    const curve = new Float32Array(samples);

    for (let i = 0; i < samples; i++) {
      const x = (i * 2) / samples - 1;

      // Subtle tube saturation - very gentle
      // LA-2A is known for being transparent
      const k = 1.5;
      let y = Math.tanh(k * x) / Math.tanh(k);

      // Add very subtle even harmonics (tube character)
      y += 0.01 * x * x * Math.sign(x);

      curve[i] = y;
    }

    this.tubeWarmth.curve = curve;
    this.tubeWarmth.oversample = '2x';
  }

  /**
   * Soft knee characteristic of opto compression
   */
  private setupSoftKnee(): void {
    const samples = 44100;
    const curve = new Float32Array(samples);

    for (let i = 0; i < samples; i++) {
      const x = (i * 2) / samples - 1;

      // Very soft saturation for that pillowy compression
      const k = 0.8;
      curve[i] = Math.tanh(k * x) / Math.tanh(k);
    }

    this.softKnee.curve = curve;
    this.softKnee.oversample = '2x';
  }

  private connectNodes(): void {
    // Dry path
    this.input.connect(this.dryGain);

    // Wet path:
    // input -> detector (parallel) -> analyze
    // input -> emphasis -> softKnee -> grNode -> compressor -> tube -> outputGain -> wetGain
    this.input.connect(this.detector);

    this.input.connect(this.inputGain);
    this.inputGain.connect(this.emphasisFilter);
    this.emphasisFilter.connect(this.softKnee);
    this.softKnee.connect(this.grNode);
    this.grNode.connect(this.compressor);
    this.compressor.connect(this.tubeWarmth);
    this.tubeWarmth.connect(this.outputGain);
    this.outputGain.connect(this.wetGain);

    // Mix to output
    this.dryGain.connect(this.output);
    this.wetGain.connect(this.output);
  }

  /**
   * Start the opto cell processing loop
   */
  private startProcessing(): void {
    if (this.processingActive) return;
    this.processingActive = true;

    const process = () => {
      if (!this.processingActive) return;

      // Get input level
      this.detector.getFloatTimeDomainData(this.detectorData);

      let sum = 0;
      for (let i = 0; i < this.detectorData.length; i++) {
        sum += this.detectorData[i] * this.detectorData[i];
      }
      const rms = Math.sqrt(sum / this.detectorData.length);
      const inputLevelDB = 20 * Math.log10(Math.max(rms, 0.0001));

      // Calculate threshold from peak reduction
      const threshold = -60 + (100 - this.config.peakReduction) * 0.6; // -60 to 0 dB range

      // Ratio based on mode
      const ratio = this.config.mode === 'limit' ? 100 : 3;

      // Process through opto cell
      const gainMultiplier = this.optoCell.process(inputLevelDB, threshold, ratio);

      // Apply gain reduction
      this.grNode.gain.setTargetAtTime(gainMultiplier, this.ctx.currentTime, 0.01);

      // Store for metering
      this.gainReduction = this.optoCell.getGainReductionDB();

      this.rafId = requestAnimationFrame(process);
    };

    process();
  }

  /**
   * Stop processing loop
   */
  private stopProcessing(): void {
    this.processingActive = false;
    if (this.rafId !== null) {
      cancelAnimationFrame(this.rafId);
      this.rafId = null;
    }
  }

  private applyConfig(): void {
    const { peakReduction, gain, mode, mix, emphasis } = this.config;

    // Output gain (makeup)
    this.outputGain.gain.value = Math.pow(10, gain / 20);

    // Mode affects compressor ratio
    this.compressor.ratio.value = mode === 'limit' ? 20 : 3;

    // Emphasis (HF boost on sidechain)
    this.emphasisFilter.gain.value = (emphasis / 100) * 6; // 0-6dB boost

    // Dry/wet mix
    const wetAmount = mix / 100;
    const dryAmount = 1 - wetAmount;
    this.dryGain.gain.value = dryAmount;
    this.wetGain.gain.value = wetAmount;

    // Start opto processing if we have peak reduction
    if (peakReduction > 0) {
      this.startProcessing();
    } else {
      this.stopProcessing();
      this.grNode.gain.value = 1.0;
    }
  }

  /**
   * Apply preset
   */
  setPreset(presetName: keyof typeof OPTO_PRESETS): void {
    const preset = OPTO_PRESETS[presetName];
    if (preset) {
      this.config = { ...this.config, ...preset };
      this.applyConfig();
    }
  }

  /**
   * Update parameter
   */
  setParam<K extends keyof OptoCompressorConfig>(
    param: K,
    value: OptoCompressorConfig[K]
  ): void {
    this.config[param] = value;
    this.applyConfig();
  }

  /**
   * Get current config
   */
  getConfig(): OptoCompressorConfig {
    return { ...this.config };
  }

  /**
   * Get gain reduction in dB (for metering)
   */
  getGainReduction(): number {
    return this.gainReduction;
  }

  /**
   * Get VU-style meter data
   */
  getMeterData(): { gainReduction: number; inputLevel: number; outputLevel: number } {
    // Calculate levels from detector
    this.detector.getFloatTimeDomainData(this.detectorData);

    let sum = 0;
    for (let i = 0; i < this.detectorData.length; i++) {
      sum += this.detectorData[i] * this.detectorData[i];
    }
    const inputRMS = Math.sqrt(sum / this.detectorData.length);
    const inputLevel = 20 * Math.log10(Math.max(inputRMS, 0.0001));

    // Estimate output level
    const outputLevel = inputLevel + this.gainReduction + this.config.gain;

    return {
      gainReduction: this.gainReduction,
      inputLevel,
      outputLevel,
    };
  }

  /**
   * Connect to destination
   */
  connect(destination: AudioNode): OptoCompressor {
    this.output.connect(destination);
    return this;
  }

  /**
   * Disconnect
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

    // For offline, we can't use requestAnimationFrame
    // Create a simplified version without the real-time opto processing
    const offlineComp = new OptoCompressor(offlineCtx as unknown as AudioContext, {
      ...this.config,
      // Adjust for offline rendering
    });

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
    this.stopProcessing();

    this.input.disconnect();
    this.inputGain.disconnect();
    this.outputGain.disconnect();
    this.dryGain.disconnect();
    this.wetGain.disconnect();
    this.compressor.disconnect();
    this.emphasisFilter.disconnect();
    this.tubeWarmth.disconnect();
    this.softKnee.disconnect();
    this.detector.disconnect();
    this.grNode.disconnect();

    this.optoCell.reset();
  }
}

export default OptoCompressor;

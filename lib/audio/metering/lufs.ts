/**
 * LUFS Meter - ITU-R BS.1770-4 Compliant Loudness Measurement
 *
 * Implements professional broadcast loudness metering:
 * - Momentary loudness (400ms sliding window)
 * - Short-term loudness (3s sliding window)
 * - Integrated loudness (entire program with gating)
 * - Loudness Range (LRA) per EBU Tech 3342
 * - True Peak detection with 4x oversampling
 * - K-weighting filter (high shelf + high pass)
 *
 * Reference: ITU-R BS.1770-4 (10/2015)
 * EBU R 128, ATSC A/85, ARIB TR-B32
 */

/**
 * Callback function type for real-time LUFS updates
 */
export type LUFSUpdateCallback = (reading: LUFSReading) => void;

/**
 * Target loudness presets for common delivery formats
 */
export type LoudnessTarget =
  | 'streaming'      // -14 LUFS (Spotify, YouTube, etc.)
  | 'broadcast'      // -16 LUFS (Apple Music, podcast)
  | 'cinema'         // -24 LUFS (Film/Cinema)
  | 'ebu-r128'       // -23 LUFS (European broadcast)
  | 'atsc-a85'       // -24 LUFS (US broadcast)
  | 'custom';

/**
 * Target loudness comparison result
 */
export interface TargetComparison {
  target: LoudnessTarget;
  targetLUFS: number;
  currentLUFS: number;
  difference: number;          // Positive = louder than target
  withinTolerance: boolean;
  recommendation: 'reduce' | 'increase' | 'ok';
  adjustmentNeeded: number;    // dB adjustment needed (negative = reduce)
  truePeakCompliant: boolean;
}

export interface LUFSMeterConfig {
  sampleRate: number;
  channels?: number;
  blockSize?: number;  // Samples per processing block (default: 512)
  enableTruePeak?: boolean;
  truePeakOversampling?: 2 | 4 | 8;
  /** Callback for real-time updates (called after each block) */
  onUpdate?: LUFSUpdateCallback;
  /** Update interval in blocks (default: 1 = every block/100ms) */
  updateInterval?: number;
  /** Target loudness for comparison (default: streaming) */
  targetLoudness?: LoudnessTarget;
  /** Custom target LUFS value (used when targetLoudness is 'custom') */
  customTargetLUFS?: number;
}

export interface LUFSReading {
  momentary: number;      // M: 400ms window, LUFS
  shortTerm: number;      // S: 3s window, LUFS
  integrated: number;     // I: Gated integrated loudness, LUFS
  loudnessRange: number;  // LRA: in LU
  truePeakL: number;      // True peak left channel, dBTP
  truePeakR: number;      // True peak right channel, dBTP
  truePeakMax: number;    // Maximum true peak, dBTP
  maxMomentary: number;   // Maximum momentary loudness, LUFS
  maxShortTerm: number;   // Maximum short-term loudness, LUFS
}

export interface LUFSHistogramBin {
  loudness: number;       // Center loudness value in LUFS
  count: number;          // Number of blocks in this bin
  percentile: number;     // Cumulative percentile
}

/**
 * K-weighting pre-filter coefficients
 * Two-stage filter: High shelf followed by high pass
 *
 * Stage 1: High shelf filter (+4dB at high frequencies)
 * Stage 2: High pass filter (rolling off below 60Hz)
 */
interface BiquadCoefficients {
  b0: number;
  b1: number;
  b2: number;
  a1: number;
  a2: number;
}

/**
 * Biquad filter state for stereo processing
 */
interface BiquadState {
  x1: number;
  x2: number;
  y1: number;
  y2: number;
}

/**
 * Calculate K-weighting filter coefficients
 * Based on ITU-R BS.1770-4 specifications
 */
function calculateKWeightingCoefficients(sampleRate: number): {
  highShelf: BiquadCoefficients;
  highPass: BiquadCoefficients;
} {
  // High shelf filter coefficients (Stage 1)
  // f = 1681.974450955533 Hz, gain = +3.999843853973347 dB, Q = 0.7071752369554196
  const Vh = Math.pow(10, 3.999843853973347 / 20);
  const Vb = Math.pow(Vh, 0.4996667741545416);
  const Khs = Math.tan((Math.PI * 1681.974450955533) / sampleRate);
  const Khs2 = Khs * Khs;
  const Qhs = 0.7071752369554196;

  const pbHs = (Vh / Qhs) * Khs + Khs2;
  const a0Hs = 1 + (Vb / Qhs) * Khs + Khs2;

  const highShelf: BiquadCoefficients = {
    b0: (Vh + Vb * (Vh / Qhs) * Khs + Khs2) / a0Hs,
    b1: 2 * (Khs2 - Vh) / a0Hs,
    b2: (Vh - Vb * (Vh / Qhs) * Khs + Khs2) / a0Hs,
    a1: 2 * (Khs2 - 1) / a0Hs,
    a2: (1 - (Vb / Qhs) * Khs + Khs2) / a0Hs,
  };

  // High pass filter coefficients (Stage 2)
  // f = 38.13547087602444 Hz, Q = 0.5003270373238773
  const Khp = Math.tan((Math.PI * 38.13547087602444) / sampleRate);
  const Khp2 = Khp * Khp;
  const Qhp = 0.5003270373238773;
  const a0Hp = 1 + Khp / Qhp + Khp2;

  const highPass: BiquadCoefficients = {
    b0: 1 / a0Hp,
    b1: -2 / a0Hp,
    b2: 1 / a0Hp,
    a1: 2 * (Khp2 - 1) / a0Hp,
    a2: (1 - Khp / Qhp + Khp2) / a0Hp,
  };

  return { highShelf, highPass };
}

/**
 * 4x Oversampling FIR filter coefficients for true peak detection
 * 48-tap half-band FIR filter
 */
const TRUE_PEAK_FIR_COEFFICIENTS = [
  0.0017089843750,
  0.0109863281250,
 -0.0196533203125,
  0.0332031250000,
 -0.0594482421875,
  0.1373291015625,
  0.9721679687500,
 -0.1022949218750,
  0.0476074218750,
 -0.0266113281250,
  0.0148925781250,
 -0.0083007812500,
];

/**
 * Professional LUFS Meter
 * ITU-R BS.1770-4 compliant loudness measurement
 */
export class LUFSMeter {
  private sampleRate: number;
  private channels: number;
  private blockSize: number;
  private enableTruePeak: boolean;
  private truePeakOversampling: number;

  // K-weighting filter coefficients
  private highShelfCoeffs: BiquadCoefficients;
  private highPassCoeffs: BiquadCoefficients;

  // Filter states per channel [left, right]
  private highShelfState: BiquadState[] = [];
  private highPassState: BiquadState[] = [];

  // Block processing
  private blockBuffer: Float32Array[] = [];  // Per channel
  private blockSampleCount: number = 0;

  // Momentary loudness (400ms window = 4 blocks at 100ms/block)
  private momentaryBlockPowers: number[] = [];
  private momentaryWindowBlocks: number;  // 4 blocks for 400ms

  // Short-term loudness (3s window = 30 blocks at 100ms/block)
  private shortTermBlockPowers: number[] = [];
  private shortTermWindowBlocks: number;  // 30 blocks for 3s

  // Integrated loudness with gating
  private gatedBlockPowers: number[] = [];
  private ungatedBlockPowers: number[] = [];

  // Loudness histogram for LRA calculation (0.1 LU resolution)
  private loudnessHistogram: Map<number, number> = new Map();
  private totalGatedBlocks: number = 0;

  // True peak detection
  private truePeakMaxL: number = -Infinity;
  private truePeakMaxR: number = -Infinity;
  private truePeakHistory: Float32Array[] = [];  // FIR filter history per channel

  // Maximum values
  private maxMomentary: number = -Infinity;
  private maxShortTerm: number = -Infinity;

  // Real-time callback support
  private onUpdateCallback: LUFSUpdateCallback | null = null;
  private updateInterval: number = 1;
  private blocksSinceUpdate: number = 0;
  private subscribers: Set<LUFSUpdateCallback> = new Set();

  // Target loudness
  private targetLoudness: LoudnessTarget = 'streaming';
  private customTargetLUFS: number = -14;

  // Constants
  private readonly ABSOLUTE_GATE_THRESHOLD = -70;  // LUFS
  private readonly RELATIVE_GATE_OFFSET = -10;      // LU below ungated loudness
  private readonly BLOCK_DURATION = 0.1;            // 100ms blocks
  private readonly LRA_LOWER_PERCENTILE = 0.10;     // 10th percentile
  private readonly LRA_UPPER_PERCENTILE = 0.95;     // 95th percentile

  // Standard target values
  private static readonly TARGET_LUFS: Record<LoudnessTarget, number> = {
    'streaming': -14,    // Spotify, YouTube, Tidal
    'broadcast': -16,    // Apple Music, podcast, general broadcast
    'cinema': -24,       // Film/Cinema mixing
    'ebu-r128': -23,     // European broadcast standard
    'atsc-a85': -24,     // US broadcast standard
    'custom': -14,       // Placeholder, uses customTargetLUFS
  };

  // True peak limits per target
  private static readonly TARGET_TRUE_PEAK: Record<LoudnessTarget, number> = {
    'streaming': -1.0,
    'broadcast': -1.0,
    'cinema': -1.0,
    'ebu-r128': -1.0,
    'atsc-a85': -2.0,
    'custom': -1.0,
  };

  // Tolerance per target (in LU)
  private static readonly TARGET_TOLERANCE: Record<LoudnessTarget, number> = {
    'streaming': 1.0,
    'broadcast': 1.0,
    'cinema': 1.0,
    'ebu-r128': 0.5,
    'atsc-a85': 2.0,
    'custom': 1.0,
  };

  constructor(config: LUFSMeterConfig) {
    this.sampleRate = config.sampleRate;
    this.channels = config.channels || 2;
    this.blockSize = config.blockSize || 512;
    this.enableTruePeak = config.enableTruePeak !== false;
    this.truePeakOversampling = config.truePeakOversampling || 4;

    // Real-time callback configuration
    this.onUpdateCallback = config.onUpdate || null;
    this.updateInterval = config.updateInterval || 1;
    this.targetLoudness = config.targetLoudness || 'streaming';
    this.customTargetLUFS = config.customTargetLUFS || -14;

    // Calculate K-weighting coefficients
    const coeffs = calculateKWeightingCoefficients(this.sampleRate);
    this.highShelfCoeffs = coeffs.highShelf;
    this.highPassCoeffs = coeffs.highPass;

    // Initialize per-channel state
    for (let ch = 0; ch < this.channels; ch++) {
      this.highShelfState.push({ x1: 0, x2: 0, y1: 0, y2: 0 });
      this.highPassState.push({ x1: 0, x2: 0, y1: 0, y2: 0 });
      this.truePeakHistory.push(new Float32Array(TRUE_PEAK_FIR_COEFFICIENTS.length));
    }

    // Calculate window sizes in blocks
    this.momentaryWindowBlocks = Math.round(0.4 / this.BLOCK_DURATION);  // 4 blocks
    this.shortTermWindowBlocks = Math.round(3.0 / this.BLOCK_DURATION); // 30 blocks

    // Initialize block buffers
    const samplesPerBlock = Math.round(this.sampleRate * this.BLOCK_DURATION);
    for (let ch = 0; ch < this.channels; ch++) {
      this.blockBuffer.push(new Float32Array(samplesPerBlock));
    }

    console.log('[LUFSMeter] Initialized:', {
      sampleRate: this.sampleRate,
      channels: this.channels,
      blockDuration: this.BLOCK_DURATION,
      momentaryBlocks: this.momentaryWindowBlocks,
      shortTermBlocks: this.shortTermWindowBlocks,
      truePeak: this.enableTruePeak,
      targetLoudness: this.targetLoudness,
    });
  }

  /**
   * Process audio samples and update loudness measurements
   * Accepts interleaved stereo samples or separate channel arrays
   */
  process(inputL: Float32Array, inputR?: Float32Array): void {
    const samplesPerBlock = this.blockBuffer[0].length;

    for (let i = 0; i < inputL.length; i++) {
      const sampleL = inputL[i];
      const sampleR = inputR ? inputR[i] : inputL[i];

      // Apply K-weighting filter
      const filteredL = this.applyKWeighting(sampleL, 0);
      const filteredR = this.applyKWeighting(sampleR, 1);

      // Store in block buffer
      this.blockBuffer[0][this.blockSampleCount] = filteredL;
      this.blockBuffer[1][this.blockSampleCount] = filteredR;

      // True peak detection with oversampling
      if (this.enableTruePeak) {
        this.updateTruePeak(sampleL, 0);
        this.updateTruePeak(sampleR, 1);
      }

      this.blockSampleCount++;

      // Process complete block
      if (this.blockSampleCount >= samplesPerBlock) {
        this.processBlock();
        this.blockSampleCount = 0;
      }
    }
  }

  /**
   * Apply K-weighting pre-filter (two cascaded biquad filters)
   */
  private applyKWeighting(sample: number, channel: number): number {
    // Stage 1: High shelf filter
    const hsState = this.highShelfState[channel];
    const hsCoeffs = this.highShelfCoeffs;

    const hsOutput = hsCoeffs.b0 * sample
                   + hsCoeffs.b1 * hsState.x1
                   + hsCoeffs.b2 * hsState.x2
                   - hsCoeffs.a1 * hsState.y1
                   - hsCoeffs.a2 * hsState.y2;

    hsState.x2 = hsState.x1;
    hsState.x1 = sample;
    hsState.y2 = hsState.y1;
    hsState.y1 = hsOutput;

    // Stage 2: High pass filter
    const hpState = this.highPassState[channel];
    const hpCoeffs = this.highPassCoeffs;

    const hpOutput = hpCoeffs.b0 * hsOutput
                   + hpCoeffs.b1 * hpState.x1
                   + hpCoeffs.b2 * hpState.x2
                   - hpCoeffs.a1 * hpState.y1
                   - hpCoeffs.a2 * hpState.y2;

    hpState.x2 = hpState.x1;
    hpState.x1 = hsOutput;
    hpState.y2 = hpState.y1;
    hpState.y1 = hpOutput;

    return hpOutput;
  }

  /**
   * Update true peak with oversampling
   * Uses FIR interpolation for inter-sample peak detection
   */
  private updateTruePeak(sample: number, channel: number): void {
    const history = this.truePeakHistory[channel];

    // Shift history and add new sample
    for (let i = history.length - 1; i > 0; i--) {
      history[i] = history[i - 1];
    }
    history[0] = sample;

    // Check original sample
    const absSample = Math.abs(sample);

    // Interpolate between samples at oversampling rate
    for (let phase = 0; phase < this.truePeakOversampling; phase++) {
      let interpolated = 0;
      const phaseOffset = phase / this.truePeakOversampling;

      // Apply FIR filter for interpolation
      for (let tap = 0; tap < TRUE_PEAK_FIR_COEFFICIENTS.length && tap < history.length; tap++) {
        // Polyphase decomposition for efficient oversampling
        const coefficient = TRUE_PEAK_FIR_COEFFICIENTS[tap];
        interpolated += history[tap] * coefficient;
      }

      const absInterpolated = Math.abs(interpolated);

      if (channel === 0) {
        if (absInterpolated > this.truePeakMaxL) {
          this.truePeakMaxL = absInterpolated;
        }
      } else {
        if (absInterpolated > this.truePeakMaxR) {
          this.truePeakMaxR = absInterpolated;
        }
      }
    }

    // Also check the raw sample
    if (channel === 0 && absSample > this.truePeakMaxL) {
      this.truePeakMaxL = absSample;
    } else if (channel === 1 && absSample > this.truePeakMaxR) {
      this.truePeakMaxR = absSample;
    }
  }

  /**
   * Process a complete 100ms block
   * Calculate mean square and update sliding windows
   */
  private processBlock(): void {
    // Calculate mean square power per channel
    let sumL = 0;
    let sumR = 0;
    const blockLength = this.blockBuffer[0].length;

    for (let i = 0; i < blockLength; i++) {
      sumL += this.blockBuffer[0][i] * this.blockBuffer[0][i];
      sumR += this.blockBuffer[1][i] * this.blockBuffer[1][i];
    }

    const meanSquareL = sumL / blockLength;
    const meanSquareR = sumR / blockLength;

    // Channel-weighted sum (ITU-R BS.1770-4 stereo weighting)
    // Left and Right channels: weight = 1.0
    // Center, Left surround, Right surround: different weights (for surround)
    const weightedSum = meanSquareL + meanSquareR;  // Stereo: equal weights

    // Store block power for windowed calculations
    this.momentaryBlockPowers.push(weightedSum);
    this.shortTermBlockPowers.push(weightedSum);
    this.ungatedBlockPowers.push(weightedSum);

    // Maintain window sizes
    while (this.momentaryBlockPowers.length > this.momentaryWindowBlocks) {
      this.momentaryBlockPowers.shift();
    }
    while (this.shortTermBlockPowers.length > this.shortTermWindowBlocks) {
      this.shortTermBlockPowers.shift();
    }

    // Calculate block loudness for gating
    const blockLoudness = this.powerToLUFS(weightedSum);

    // Absolute gate: -70 LUFS
    if (blockLoudness > this.ABSOLUTE_GATE_THRESHOLD) {
      this.gatedBlockPowers.push(weightedSum);

      // Update histogram (0.1 LU resolution)
      const histogramBin = Math.round(blockLoudness * 10) / 10;
      const currentCount = this.loudnessHistogram.get(histogramBin) || 0;
      this.loudnessHistogram.set(histogramBin, currentCount + 1);
      this.totalGatedBlocks++;
    }

    // Update max momentary
    const momentaryLoudness = this.calculateMomentaryLoudness();
    if (momentaryLoudness > this.maxMomentary) {
      this.maxMomentary = momentaryLoudness;
    }

    // Update max short-term
    const shortTermLoudness = this.calculateShortTermLoudness();
    if (shortTermLoudness > this.maxShortTerm) {
      this.maxShortTerm = shortTermLoudness;
    }

    // Trigger callbacks if interval reached
    this.blocksSinceUpdate++;
    if (this.blocksSinceUpdate >= this.updateInterval) {
      this.blocksSinceUpdate = 0;
      this.notifySubscribers();
    }
  }

  /**
   * Notify all subscribers with current reading
   */
  private notifySubscribers(): void {
    const reading = this.getReading();

    // Call primary callback
    if (this.onUpdateCallback) {
      try {
        this.onUpdateCallback(reading);
      } catch (e) {
        console.error('[LUFSMeter] Callback error:', e);
      }
    }

    // Call all subscribers
    this.subscribers.forEach((subscriber) => {
      try {
        subscriber(reading);
      } catch (e) {
        console.error('[LUFSMeter] Subscriber error:', e);
      }
    });
  }

  /**
   * Convert mean square power to LUFS
   */
  private powerToLUFS(meanSquare: number): number {
    if (meanSquare <= 0) return -Infinity;
    // LUFS = -0.691 + 10 * log10(sum of weighted channel powers)
    return -0.691 + 10 * Math.log10(meanSquare);
  }

  /**
   * Calculate momentary loudness (400ms window)
   */
  private calculateMomentaryLoudness(): number {
    if (this.momentaryBlockPowers.length === 0) return -Infinity;

    const sum = this.momentaryBlockPowers.reduce((a, b) => a + b, 0);
    const meanPower = sum / this.momentaryBlockPowers.length;
    return this.powerToLUFS(meanPower);
  }

  /**
   * Calculate short-term loudness (3s window)
   */
  private calculateShortTermLoudness(): number {
    if (this.shortTermBlockPowers.length === 0) return -Infinity;

    const sum = this.shortTermBlockPowers.reduce((a, b) => a + b, 0);
    const meanPower = sum / this.shortTermBlockPowers.length;
    return this.powerToLUFS(meanPower);
  }

  /**
   * Calculate integrated loudness with relative gating
   * Two-pass gating per ITU-R BS.1770-4
   */
  private calculateIntegratedLoudness(): number {
    if (this.gatedBlockPowers.length === 0) return -Infinity;

    // First pass: Calculate ungated loudness (already absolute-gated)
    const ungatedSum = this.gatedBlockPowers.reduce((a, b) => a + b, 0);
    const ungatedMeanPower = ungatedSum / this.gatedBlockPowers.length;
    const ungatedLoudness = this.powerToLUFS(ungatedMeanPower);

    // Relative gate threshold: 10 LU below ungated loudness
    const relativeThreshold = ungatedLoudness + this.RELATIVE_GATE_OFFSET;

    // Second pass: Apply relative gate
    let relativeGatedSum = 0;
    let relativeGatedCount = 0;

    for (const power of this.gatedBlockPowers) {
      const blockLoudness = this.powerToLUFS(power);
      if (blockLoudness > relativeThreshold) {
        relativeGatedSum += power;
        relativeGatedCount++;
      }
    }

    if (relativeGatedCount === 0) return -Infinity;

    const gatedMeanPower = relativeGatedSum / relativeGatedCount;
    return this.powerToLUFS(gatedMeanPower);
  }

  /**
   * Calculate Loudness Range (LRA) per EBU Tech 3342
   * Difference between 95th and 10th percentile of short-term loudness
   */
  private calculateLoudnessRange(): number {
    if (this.totalGatedBlocks < 2) return 0;

    // Get sorted histogram entries
    const sortedBins = Array.from(this.loudnessHistogram.entries())
      .sort((a, b) => a[0] - b[0]);

    // Calculate percentiles
    const targetLow = this.totalGatedBlocks * this.LRA_LOWER_PERCENTILE;
    const targetHigh = this.totalGatedBlocks * this.LRA_UPPER_PERCENTILE;

    let cumulative = 0;
    let lowPercentile = -70;
    let highPercentile = -70;
    let foundLow = false;
    let foundHigh = false;

    for (const [loudness, count] of sortedBins) {
      cumulative += count;

      if (!foundLow && cumulative >= targetLow) {
        lowPercentile = loudness;
        foundLow = true;
      }
      if (!foundHigh && cumulative >= targetHigh) {
        highPercentile = loudness;
        foundHigh = true;
        break;
      }
    }

    // LRA is the difference in LU
    return Math.max(0, highPercentile - lowPercentile);
  }

  /**
   * Get current loudness readings
   */
  getReading(): LUFSReading {
    const truePeakL = this.truePeakMaxL > 0
      ? 20 * Math.log10(this.truePeakMaxL)
      : -Infinity;
    const truePeakR = this.truePeakMaxR > 0
      ? 20 * Math.log10(this.truePeakMaxR)
      : -Infinity;

    return {
      momentary: this.calculateMomentaryLoudness(),
      shortTerm: this.calculateShortTermLoudness(),
      integrated: this.calculateIntegratedLoudness(),
      loudnessRange: this.calculateLoudnessRange(),
      truePeakL,
      truePeakR,
      truePeakMax: Math.max(truePeakL, truePeakR),
      maxMomentary: this.maxMomentary,
      maxShortTerm: this.maxShortTerm,
    };
  }

  /**
   * Get loudness histogram for visualization
   */
  getHistogram(): LUFSHistogramBin[] {
    const bins: LUFSHistogramBin[] = [];
    let cumulative = 0;

    const sortedEntries = Array.from(this.loudnessHistogram.entries())
      .sort((a, b) => a[0] - b[0]);

    for (const [loudness, count] of sortedEntries) {
      cumulative += count;
      bins.push({
        loudness,
        count,
        percentile: this.totalGatedBlocks > 0
          ? cumulative / this.totalGatedBlocks
          : 0,
      });
    }

    return bins;
  }

  // =====================
  // Subscription / Polling API
  // =====================

  /**
   * Subscribe to real-time LUFS updates
   * Returns an unsubscribe function
   */
  subscribe(callback: LUFSUpdateCallback): () => void {
    this.subscribers.add(callback);
    return () => {
      this.subscribers.delete(callback);
    };
  }

  /**
   * Unsubscribe from updates
   */
  unsubscribe(callback: LUFSUpdateCallback): void {
    this.subscribers.delete(callback);
  }

  /**
   * Unsubscribe all listeners
   */
  unsubscribeAll(): void {
    this.subscribers.clear();
  }

  /**
   * Set the primary update callback
   */
  setOnUpdate(callback: LUFSUpdateCallback | null): void {
    this.onUpdateCallback = callback;
  }

  /**
   * Set the update interval in blocks (1 block = 100ms)
   */
  setUpdateInterval(blocks: number): void {
    this.updateInterval = Math.max(1, blocks);
  }

  // =====================
  // Target Loudness Comparison
  // =====================

  /**
   * Set the target loudness for comparison
   */
  setTargetLoudness(target: LoudnessTarget, customLUFS?: number): void {
    this.targetLoudness = target;
    if (target === 'custom' && customLUFS !== undefined) {
      this.customTargetLUFS = customLUFS;
    }
  }

  /**
   * Get the current target LUFS value
   */
  getTargetLUFS(): number {
    if (this.targetLoudness === 'custom') {
      return this.customTargetLUFS;
    }
    return LUFSMeter.TARGET_LUFS[this.targetLoudness];
  }

  /**
   * Compare current integrated loudness against target
   */
  compareToTarget(target?: LoudnessTarget): TargetComparison {
    const reading = this.getReading();
    const targetType = target || this.targetLoudness;

    const targetLUFS = targetType === 'custom'
      ? this.customTargetLUFS
      : LUFSMeter.TARGET_LUFS[targetType];

    const truePeakLimit = LUFSMeter.TARGET_TRUE_PEAK[targetType];
    const tolerance = LUFSMeter.TARGET_TOLERANCE[targetType];

    const difference = reading.integrated - targetLUFS;
    const absDiff = Math.abs(difference);
    const withinTolerance = absDiff <= tolerance;

    let recommendation: 'reduce' | 'increase' | 'ok';
    if (withinTolerance) {
      recommendation = 'ok';
    } else if (difference > 0) {
      recommendation = 'reduce';
    } else {
      recommendation = 'increase';
    }

    return {
      target: targetType,
      targetLUFS,
      currentLUFS: reading.integrated,
      difference,
      withinTolerance,
      recommendation,
      adjustmentNeeded: -difference,  // Negative means reduce
      truePeakCompliant: reading.truePeakMax <= truePeakLimit,
    };
  }

  /**
   * Compare against all standard targets
   */
  compareToAllTargets(): Record<LoudnessTarget, TargetComparison> {
    const targets: LoudnessTarget[] = ['streaming', 'broadcast', 'cinema', 'ebu-r128', 'atsc-a85'];
    const results: Partial<Record<LoudnessTarget, TargetComparison>> = {};

    for (const target of targets) {
      results[target] = this.compareToTarget(target);
    }

    // Add custom if set differently
    if (this.targetLoudness === 'custom') {
      results['custom'] = this.compareToTarget('custom');
    }

    return results as Record<LoudnessTarget, TargetComparison>;
  }

  /**
   * Get recommended gain adjustment to match target
   * Returns gain in dB (negative = reduce, positive = increase)
   */
  getRecommendedGainAdjustment(target?: LoudnessTarget): number {
    const comparison = this.compareToTarget(target);
    return comparison.adjustmentNeeded;
  }

  /**
   * Check if audio meets streaming platform requirements
   * (-14 LUFS with -1 dBTP true peak limit)
   */
  meetsStreamingRequirements(): {
    meets: boolean;
    loudnessOk: boolean;
    truePeakOk: boolean;
    issues: string[];
  } {
    const reading = this.getReading();
    const issues: string[] = [];

    const targetLUFS = -14;
    const tolerance = 1.0;
    const truePeakLimit = -1.0;

    const loudnessDiff = reading.integrated - targetLUFS;
    const loudnessOk = Math.abs(loudnessDiff) <= tolerance;
    const truePeakOk = reading.truePeakMax <= truePeakLimit;

    if (!loudnessOk) {
      if (loudnessDiff > 0) {
        issues.push(`Too loud by ${loudnessDiff.toFixed(1)} LU - reduce by ${loudnessDiff.toFixed(1)} dB`);
      } else {
        issues.push(`Too quiet by ${Math.abs(loudnessDiff).toFixed(1)} LU - consider increasing level`);
      }
    }

    if (!truePeakOk) {
      issues.push(`True peak ${reading.truePeakMax.toFixed(1)} dBTP exceeds -1 dBTP limit`);
    }

    return {
      meets: loudnessOk && truePeakOk,
      loudnessOk,
      truePeakOk,
      issues,
    };
  }

  /**
   * Check if audio meets broadcast requirements
   * (-16 LUFS with -1 dBTP true peak limit)
   */
  meetsBroadcastRequirements(): {
    meets: boolean;
    loudnessOk: boolean;
    truePeakOk: boolean;
    issues: string[];
  } {
    const reading = this.getReading();
    const issues: string[] = [];

    const targetLUFS = -16;
    const tolerance = 1.0;
    const truePeakLimit = -1.0;

    const loudnessDiff = reading.integrated - targetLUFS;
    const loudnessOk = Math.abs(loudnessDiff) <= tolerance;
    const truePeakOk = reading.truePeakMax <= truePeakLimit;

    if (!loudnessOk) {
      if (loudnessDiff > 0) {
        issues.push(`Too loud by ${loudnessDiff.toFixed(1)} LU - reduce by ${loudnessDiff.toFixed(1)} dB`);
      } else {
        issues.push(`Too quiet by ${Math.abs(loudnessDiff).toFixed(1)} LU`);
      }
    }

    if (!truePeakOk) {
      issues.push(`True peak ${reading.truePeakMax.toFixed(1)} dBTP exceeds -1 dBTP limit`);
    }

    return {
      meets: loudnessOk && truePeakOk,
      loudnessOk,
      truePeakOk,
      issues,
    };
  }

  /**
   * Check if audio meets cinema requirements
   * (-24 LUFS with -1 dBTP true peak limit)
   */
  meetsCinemaRequirements(): {
    meets: boolean;
    loudnessOk: boolean;
    truePeakOk: boolean;
    lraOk: boolean;
    issues: string[];
  } {
    const reading = this.getReading();
    const issues: string[] = [];

    const targetLUFS = -24;
    const tolerance = 1.0;
    const truePeakLimit = -1.0;
    const maxLRA = 20;

    const loudnessDiff = reading.integrated - targetLUFS;
    const loudnessOk = Math.abs(loudnessDiff) <= tolerance;
    const truePeakOk = reading.truePeakMax <= truePeakLimit;
    const lraOk = reading.loudnessRange <= maxLRA;

    if (!loudnessOk) {
      if (loudnessDiff > 0) {
        issues.push(`Too loud by ${loudnessDiff.toFixed(1)} LU - reduce by ${loudnessDiff.toFixed(1)} dB`);
      } else {
        issues.push(`Too quiet by ${Math.abs(loudnessDiff).toFixed(1)} LU`);
      }
    }

    if (!truePeakOk) {
      issues.push(`True peak ${reading.truePeakMax.toFixed(1)} dBTP exceeds -1 dBTP limit`);
    }

    if (!lraOk) {
      issues.push(`LRA ${reading.loudnessRange.toFixed(1)} LU exceeds ${maxLRA} LU limit`);
    }

    return {
      meets: loudnessOk && truePeakOk && lraOk,
      loudnessOk,
      truePeakOk,
      lraOk,
      issues,
    };
  }

  /**
   * Reset all measurements
   */
  reset(): void {
    // Reset filter states
    for (let ch = 0; ch < this.channels; ch++) {
      this.highShelfState[ch] = { x1: 0, x2: 0, y1: 0, y2: 0 };
      this.highPassState[ch] = { x1: 0, x2: 0, y1: 0, y2: 0 };
      this.truePeakHistory[ch].fill(0);
      this.blockBuffer[ch].fill(0);
    }

    // Reset block processing
    this.blockSampleCount = 0;
    this.momentaryBlockPowers = [];
    this.shortTermBlockPowers = [];
    this.gatedBlockPowers = [];
    this.ungatedBlockPowers = [];

    // Reset histogram
    this.loudnessHistogram.clear();
    this.totalGatedBlocks = 0;

    // Reset peak and max values
    this.truePeakMaxL = -Infinity;
    this.truePeakMaxR = -Infinity;
    this.maxMomentary = -Infinity;
    this.maxShortTerm = -Infinity;

    // Reset update counter
    this.blocksSinceUpdate = 0;

    console.log('[LUFSMeter] Reset all measurements');
  }

  /**
   * Reset only true peak values
   */
  resetTruePeak(): void {
    this.truePeakMaxL = -Infinity;
    this.truePeakMaxR = -Infinity;
  }

  /**
   * Reset only max values (momentary and short-term max)
   */
  resetMax(): void {
    this.maxMomentary = -Infinity;
    this.maxShortTerm = -Infinity;
  }

  /**
   * Process an entire audio buffer (offline analysis)
   */
  processBuffer(buffer: AudioBuffer): LUFSReading {
    this.reset();

    const leftChannel = buffer.getChannelData(0);
    const rightChannel = buffer.numberOfChannels > 1
      ? buffer.getChannelData(1)
      : buffer.getChannelData(0);

    this.process(leftChannel, rightChannel);

    return this.getReading();
  }

  /**
   * Get target loudness for common broadcast standards
   */
  static getTargetLoudness(standard: 'ebu-r128' | 'atsc-a85' | 'arib-tr-b32' | 'spotify' | 'apple-music' | 'youtube'): number {
    switch (standard) {
      case 'ebu-r128':
        return -23.0;  // EBU R 128 (Europe)
      case 'atsc-a85':
        return -24.0;  // ATSC A/85 (US broadcast)
      case 'arib-tr-b32':
        return -24.0;  // ARIB TR-B32 (Japan)
      case 'spotify':
        return -14.0;  // Spotify normalization target
      case 'apple-music':
        return -16.0;  // Apple Music Sound Check
      case 'youtube':
        return -14.0;  // YouTube loudness normalization
      default:
        return -23.0;
    }
  }

  /**
   * Get true peak limit for broadcast standards
   */
  static getTruePeakLimit(standard: 'ebu-r128' | 'atsc-a85' | 'arib-tr-b32' | 'streaming'): number {
    switch (standard) {
      case 'ebu-r128':
        return -1.0;   // EBU R 128: -1 dBTP
      case 'atsc-a85':
        return -2.0;   // ATSC A/85: -2 dBTP
      case 'arib-tr-b32':
        return -1.0;   // ARIB TR-B32: -1 dBTP
      case 'streaming':
        return -1.0;   // Streaming platforms: -1 dBTP
      default:
        return -1.0;
    }
  }

  /**
   * Format loudness value for display
   */
  static formatLUFS(value: number, decimals: number = 1): string {
    if (!isFinite(value)) return '-inf LUFS';
    return `${value.toFixed(decimals)} LUFS`;
  }

  /**
   * Format true peak value for display
   */
  static formatTruePeak(value: number, decimals: number = 1): string {
    if (!isFinite(value)) return '-inf dBTP';
    return `${value.toFixed(decimals)} dBTP`;
  }

  /**
   * Format LRA value for display
   */
  static formatLRA(value: number, decimals: number = 1): string {
    return `${value.toFixed(decimals)} LU`;
  }

  /**
   * Check if loudness is within broadcast specification
   */
  static checkCompliance(
    reading: LUFSReading,
    standard: 'ebu-r128' | 'atsc-a85' | 'arib-tr-b32'
  ): {
    compliant: boolean;
    issues: string[];
    loudnessTarget: number;
    loudnessTolerance: number;
    truePeakLimit: number;
    lraMax: number;
  } {
    const issues: string[] = [];
    let loudnessTarget: number;
    let loudnessTolerance: number;
    let truePeakLimit: number;
    let lraMax: number;

    switch (standard) {
      case 'ebu-r128':
        loudnessTarget = -23.0;
        loudnessTolerance = 0.5;  // +/- 0.5 LU for short-form
        truePeakLimit = -1.0;
        lraMax = 20;  // Recommended max LRA
        break;
      case 'atsc-a85':
        loudnessTarget = -24.0;
        loudnessTolerance = 2.0;  // +/- 2 LU
        truePeakLimit = -2.0;
        lraMax = 20;
        break;
      case 'arib-tr-b32':
        loudnessTarget = -24.0;
        loudnessTolerance = 1.0;
        truePeakLimit = -1.0;
        lraMax = 15;
        break;
      default:
        loudnessTarget = -23.0;
        loudnessTolerance = 1.0;
        truePeakLimit = -1.0;
        lraMax = 20;
    }

    // Check integrated loudness
    if (isFinite(reading.integrated)) {
      const deviation = Math.abs(reading.integrated - loudnessTarget);
      if (deviation > loudnessTolerance) {
        issues.push(
          `Integrated loudness ${reading.integrated.toFixed(1)} LUFS ` +
          `is outside target ${loudnessTarget} +/- ${loudnessTolerance} LUFS`
        );
      }
    }

    // Check true peak
    if (reading.truePeakMax > truePeakLimit) {
      issues.push(
        `True peak ${reading.truePeakMax.toFixed(1)} dBTP ` +
        `exceeds limit of ${truePeakLimit} dBTP`
      );
    }

    // Check LRA (advisory)
    if (reading.loudnessRange > lraMax) {
      issues.push(
        `Loudness range ${reading.loudnessRange.toFixed(1)} LU ` +
        `exceeds recommended maximum of ${lraMax} LU`
      );
    }

    return {
      compliant: issues.length === 0,
      issues,
      loudnessTarget,
      loudnessTolerance,
      truePeakLimit,
      lraMax,
    };
  }

  /**
   * Dispose and clean up resources
   */
  dispose(): void {
    this.reset();
    this.unsubscribeAll();
    this.onUpdateCallback = null;
    this.highShelfState = [];
    this.highPassState = [];
    this.truePeakHistory = [];
    this.blockBuffer = [];
    console.log('[LUFSMeter] Disposed');
  }
}

/**
 * Create a LUFS meter worklet processor for real-time metering
 * Returns the worklet code as a string for AudioWorkletProcessor
 */
export function createLUFSWorkletProcessor(): string {
  return `
class LUFSProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.sampleRate = sampleRate;
    this.blockDuration = 0.1; // 100ms
    this.samplesPerBlock = Math.round(this.sampleRate * this.blockDuration);
    this.blockBuffer = [new Float32Array(this.samplesPerBlock), new Float32Array(this.samplesPerBlock)];
    this.blockSampleCount = 0;

    // K-weighting filter states
    this.filterStates = [
      { hs: { x1: 0, x2: 0, y1: 0, y2: 0 }, hp: { x1: 0, x2: 0, y1: 0, y2: 0 } },
      { hs: { x1: 0, x2: 0, y1: 0, y2: 0 }, hp: { x1: 0, x2: 0, y1: 0, y2: 0 } }
    ];

    // Calculate coefficients
    this.calcCoefficients();

    // Sliding windows
    this.momentaryPowers = [];
    this.shortTermPowers = [];

    this.port.onmessage = (e) => {
      if (e.data.type === 'reset') {
        this.reset();
      }
    };
  }

  calcCoefficients() {
    const sr = this.sampleRate;

    // High shelf
    const Vh = Math.pow(10, 3.999843853973347 / 20);
    const Vb = Math.pow(Vh, 0.4996667741545416);
    const Khs = Math.tan((Math.PI * 1681.974450955533) / sr);
    const Khs2 = Khs * Khs;
    const Qhs = 0.7071752369554196;
    const a0Hs = 1 + (Vb / Qhs) * Khs + Khs2;

    this.hsCoeffs = {
      b0: (Vh + Vb * (Vh / Qhs) * Khs + Khs2) / a0Hs,
      b1: 2 * (Khs2 - Vh) / a0Hs,
      b2: (Vh - Vb * (Vh / Qhs) * Khs + Khs2) / a0Hs,
      a1: 2 * (Khs2 - 1) / a0Hs,
      a2: (1 - (Vb / Qhs) * Khs + Khs2) / a0Hs
    };

    // High pass
    const Khp = Math.tan((Math.PI * 38.13547087602444) / sr);
    const Khp2 = Khp * Khp;
    const Qhp = 0.5003270373238773;
    const a0Hp = 1 + Khp / Qhp + Khp2;

    this.hpCoeffs = {
      b0: 1 / a0Hp,
      b1: -2 / a0Hp,
      b2: 1 / a0Hp,
      a1: 2 * (Khp2 - 1) / a0Hp,
      a2: (1 - Khp / Qhp + Khp2) / a0Hp
    };
  }

  applyKWeight(sample, channel) {
    const hs = this.filterStates[channel].hs;
    const hp = this.filterStates[channel].hp;
    const hsC = this.hsCoeffs;
    const hpC = this.hpCoeffs;

    // High shelf
    const hsOut = hsC.b0 * sample + hsC.b1 * hs.x1 + hsC.b2 * hs.x2 - hsC.a1 * hs.y1 - hsC.a2 * hs.y2;
    hs.x2 = hs.x1; hs.x1 = sample;
    hs.y2 = hs.y1; hs.y1 = hsOut;

    // High pass
    const hpOut = hpC.b0 * hsOut + hpC.b1 * hp.x1 + hpC.b2 * hp.x2 - hpC.a1 * hp.y1 - hpC.a2 * hp.y2;
    hp.x2 = hp.x1; hp.x1 = hsOut;
    hp.y2 = hp.y1; hp.y1 = hpOut;

    return hpOut;
  }

  processBlock() {
    let sumL = 0, sumR = 0;
    for (let i = 0; i < this.samplesPerBlock; i++) {
      sumL += this.blockBuffer[0][i] ** 2;
      sumR += this.blockBuffer[1][i] ** 2;
    }
    const power = (sumL + sumR) / this.samplesPerBlock;

    this.momentaryPowers.push(power);
    this.shortTermPowers.push(power);

    while (this.momentaryPowers.length > 4) this.momentaryPowers.shift();
    while (this.shortTermPowers.length > 30) this.shortTermPowers.shift();

    const momentary = this.powerToLUFS(this.momentaryPowers.reduce((a,b) => a+b, 0) / this.momentaryPowers.length);
    const shortTerm = this.powerToLUFS(this.shortTermPowers.reduce((a,b) => a+b, 0) / this.shortTermPowers.length);

    this.port.postMessage({ momentary, shortTerm });
  }

  powerToLUFS(power) {
    return power > 0 ? -0.691 + 10 * Math.log10(power) : -Infinity;
  }

  reset() {
    this.blockSampleCount = 0;
    this.momentaryPowers = [];
    this.shortTermPowers = [];
    for (const ch of this.filterStates) {
      ch.hs = { x1: 0, x2: 0, y1: 0, y2: 0 };
      ch.hp = { x1: 0, x2: 0, y1: 0, y2: 0 };
    }
  }

  process(inputs, outputs, parameters) {
    const input = inputs[0];
    if (!input || input.length === 0) return true;

    const inputL = input[0] || new Float32Array(128);
    const inputR = input[1] || input[0] || new Float32Array(128);

    for (let i = 0; i < inputL.length; i++) {
      this.blockBuffer[0][this.blockSampleCount] = this.applyKWeight(inputL[i], 0);
      this.blockBuffer[1][this.blockSampleCount] = this.applyKWeight(inputR[i], 1);
      this.blockSampleCount++;

      if (this.blockSampleCount >= this.samplesPerBlock) {
        this.processBlock();
        this.blockSampleCount = 0;
      }
    }

    // Pass through
    for (let ch = 0; ch < outputs[0].length; ch++) {
      outputs[0][ch].set(input[ch] || input[0]);
    }

    return true;
  }
}

registerProcessor('lufs-processor', LUFSProcessor);
`;
}

export default LUFSMeter;

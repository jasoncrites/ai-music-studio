/**
 * Professional Mastering Chain
 *
 * Complete mastering signal path including:
 * - Input gain staging with headroom management
 * - Linear phase EQ (low/mid/high bands)
 * - Multi-band compression (4 bands)
 * - Stereo widener with mid/side processing
 * - Brick wall limiter with lookahead
 * - Output ceiling control
 * - Dithering (TPDF, noise shaping)
 *
 * Presets for: Streaming (Spotify/Apple), CD Master, Vinyl, Broadcast
 */

// ============================================================================
// Types & Interfaces
// ============================================================================

export interface MasteringChainConfig {
  inputGain: number;              // -24 to +24 dB
  outputCeiling: number;          // -3 to 0 dB (true peak)

  // Linear Phase EQ
  eq: {
    enabled: boolean;
    lowGain: number;              // -12 to +12 dB (shelf at 80Hz)
    lowFreq: number;              // 20-200 Hz
    midGain: number;              // -12 to +12 dB (bell)
    midFreq: number;              // 200-8000 Hz
    midQ: number;                 // 0.1-10
    highGain: number;             // -12 to +12 dB (shelf at 12kHz)
    highFreq: number;             // 4000-20000 Hz
  };

  // Multi-band Compression
  multiband: {
    enabled: boolean;
    bands: MultibandBandConfig[];
  };

  // Stereo Widener
  stereo: {
    enabled: boolean;
    width: number;                // 0-200% (100 = neutral)
    midGain: number;              // -12 to +12 dB
    sideGain: number;             // -12 to +12 dB
    lowCrossover: number;         // Hz - below this stays mono
  };

  // Brick Wall Limiter
  limiter: {
    enabled: boolean;
    threshold: number;            // -12 to 0 dB
    release: number;              // 10-1000 ms
    lookahead: number;            // 0-10 ms
    attack: number;               // 0.01-5 ms
  };

  // Dithering
  dither: {
    enabled: boolean;
    type: 'none' | 'tpdf' | 'noise-shaping-1' | 'noise-shaping-2';
    bitDepth: 16 | 24;
  };
}

export interface MultibandBandConfig {
  frequency: number;              // Crossover frequency (Hz)
  threshold: number;              // -40 to 0 dB
  ratio: number;                  // 1:1 to 20:1
  attack: number;                 // 0.1-100 ms
  release: number;                // 10-1000 ms
  gain: number;                   // -12 to +12 dB makeup
  enabled: boolean;
}

export interface MasteringMeterData {
  inputLevel: { left: number; right: number };
  outputLevel: { left: number; right: number };
  gainReduction: number[];        // Per band
  truePeak: { left: number; right: number };
  lufs: number;                   // Integrated loudness
  correlation: number;            // Stereo correlation
}

// ============================================================================
// Presets
// ============================================================================

export const MASTERING_PRESETS: Record<string, Partial<MasteringChainConfig>> = {
  'streaming-spotify': {
    inputGain: 0,
    outputCeiling: -1.0,          // Spotify recommends -1 dB
    eq: {
      enabled: true,
      lowGain: 0.5,
      lowFreq: 80,
      midGain: 0,
      midFreq: 2500,
      midQ: 1.0,
      highGain: 1.0,
      highFreq: 12000,
    },
    multiband: {
      enabled: true,
      bands: [
        { frequency: 120, threshold: -18, ratio: 3, attack: 20, release: 200, gain: 0, enabled: true },
        { frequency: 600, threshold: -16, ratio: 2.5, attack: 15, release: 150, gain: 0, enabled: true },
        { frequency: 4000, threshold: -14, ratio: 2, attack: 10, release: 100, gain: 0, enabled: true },
        { frequency: 16000, threshold: -12, ratio: 2, attack: 5, release: 80, gain: 0, enabled: true },
      ],
    },
    stereo: {
      enabled: true,
      width: 105,
      midGain: 0,
      sideGain: 1,
      lowCrossover: 100,
    },
    limiter: {
      enabled: true,
      threshold: -1.0,
      release: 100,
      lookahead: 3,
      attack: 0.5,
    },
    dither: {
      enabled: false,              // Streaming services re-encode
      type: 'none',
      bitDepth: 24,
    },
  },

  'streaming-apple': {
    inputGain: 0,
    outputCeiling: -1.0,          // Apple recommends -1 dB true peak
    eq: {
      enabled: true,
      lowGain: 0.3,
      lowFreq: 60,
      midGain: 0.5,
      midFreq: 3000,
      midQ: 0.8,
      highGain: 0.8,
      highFreq: 10000,
    },
    multiband: {
      enabled: true,
      bands: [
        { frequency: 100, threshold: -20, ratio: 2.5, attack: 25, release: 250, gain: 0, enabled: true },
        { frequency: 500, threshold: -18, ratio: 2, attack: 18, release: 180, gain: 0, enabled: true },
        { frequency: 3500, threshold: -16, ratio: 2, attack: 12, release: 120, gain: 0, enabled: true },
        { frequency: 14000, threshold: -14, ratio: 1.8, attack: 6, release: 90, gain: 0, enabled: true },
      ],
    },
    stereo: {
      enabled: true,
      width: 102,
      midGain: 0.5,
      sideGain: 0,
      lowCrossover: 120,
    },
    limiter: {
      enabled: true,
      threshold: -1.0,
      release: 150,
      lookahead: 4,
      attack: 0.3,
    },
    dither: {
      enabled: false,
      type: 'none',
      bitDepth: 24,
    },
  },

  'cd-master': {
    inputGain: 0,
    outputCeiling: -0.3,          // CD max, slight headroom
    eq: {
      enabled: true,
      lowGain: 1.0,
      lowFreq: 60,
      midGain: 0,
      midFreq: 2000,
      midQ: 1.2,
      highGain: 1.5,
      highFreq: 14000,
    },
    multiband: {
      enabled: true,
      bands: [
        { frequency: 150, threshold: -14, ratio: 4, attack: 15, release: 150, gain: 1, enabled: true },
        { frequency: 800, threshold: -12, ratio: 3, attack: 10, release: 100, gain: 0, enabled: true },
        { frequency: 5000, threshold: -10, ratio: 2.5, attack: 8, release: 80, gain: 0.5, enabled: true },
        { frequency: 18000, threshold: -8, ratio: 2, attack: 4, release: 60, gain: 1, enabled: true },
      ],
    },
    stereo: {
      enabled: true,
      width: 110,
      midGain: 0,
      sideGain: 2,
      lowCrossover: 80,
    },
    limiter: {
      enabled: true,
      threshold: -0.3,
      release: 80,
      lookahead: 5,
      attack: 0.2,
    },
    dither: {
      enabled: true,
      type: 'noise-shaping-2',
      bitDepth: 16,
    },
  },

  'vinyl': {
    inputGain: -2,                // Headroom for vinyl cutting
    outputCeiling: -3.0,          // Generous headroom
    eq: {
      enabled: true,
      lowGain: -1.0,              // Control low end for cutting
      lowFreq: 40,
      midGain: 0,
      midFreq: 2500,
      midQ: 1.0,
      highGain: -0.5,             // Gentle high rolloff
      highFreq: 16000,
    },
    multiband: {
      enabled: true,
      bands: [
        { frequency: 80, threshold: -20, ratio: 4, attack: 30, release: 300, gain: -1, enabled: true },
        { frequency: 400, threshold: -18, ratio: 2.5, attack: 20, release: 200, gain: 0, enabled: true },
        { frequency: 3000, threshold: -16, ratio: 2, attack: 15, release: 150, gain: 0, enabled: true },
        { frequency: 12000, threshold: -14, ratio: 2, attack: 10, release: 100, gain: -0.5, enabled: true },
      ],
    },
    stereo: {
      enabled: true,
      width: 95,                  // Slightly narrower for vinyl
      midGain: 1,
      sideGain: -1,               // Reduce side for mono compatibility
      lowCrossover: 300,          // Bass in mono for vinyl
    },
    limiter: {
      enabled: true,
      threshold: -3.0,
      release: 200,
      lookahead: 6,
      attack: 1,
    },
    dither: {
      enabled: true,
      type: 'tpdf',
      bitDepth: 24,
    },
  },

  'broadcast': {
    inputGain: 0,
    outputCeiling: -2.0,          // Broadcast standards
    eq: {
      enabled: true,
      lowGain: -0.5,
      lowFreq: 50,
      midGain: 0.5,
      midFreq: 3000,
      midQ: 0.7,
      highGain: 0.5,
      highFreq: 10000,
    },
    multiband: {
      enabled: true,
      bands: [
        { frequency: 100, threshold: -22, ratio: 4, attack: 15, release: 150, gain: 0, enabled: true },
        { frequency: 500, threshold: -20, ratio: 3.5, attack: 10, release: 100, gain: 0, enabled: true },
        { frequency: 3000, threshold: -18, ratio: 3, attack: 8, release: 80, gain: 0, enabled: true },
        { frequency: 12000, threshold: -16, ratio: 2.5, attack: 5, release: 60, gain: 0, enabled: true },
      ],
    },
    stereo: {
      enabled: true,
      width: 100,                 // Neutral width
      midGain: 0,
      sideGain: 0,
      lowCrossover: 150,
    },
    limiter: {
      enabled: true,
      threshold: -2.0,
      release: 120,
      lookahead: 4,
      attack: 0.5,
    },
    dither: {
      enabled: false,
      type: 'none',
      bitDepth: 24,
    },
  },

  'transparent': {
    inputGain: 0,
    outputCeiling: -0.5,
    eq: {
      enabled: false,
      lowGain: 0,
      lowFreq: 80,
      midGain: 0,
      midFreq: 2500,
      midQ: 1.0,
      highGain: 0,
      highFreq: 12000,
    },
    multiband: {
      enabled: false,
      bands: [
        { frequency: 120, threshold: -24, ratio: 1.5, attack: 30, release: 300, gain: 0, enabled: false },
        { frequency: 600, threshold: -24, ratio: 1.5, attack: 25, release: 250, gain: 0, enabled: false },
        { frequency: 4000, threshold: -24, ratio: 1.5, attack: 20, release: 200, gain: 0, enabled: false },
        { frequency: 16000, threshold: -24, ratio: 1.5, attack: 15, release: 150, gain: 0, enabled: false },
      ],
    },
    stereo: {
      enabled: false,
      width: 100,
      midGain: 0,
      sideGain: 0,
      lowCrossover: 100,
    },
    limiter: {
      enabled: true,
      threshold: -0.5,
      release: 200,
      lookahead: 5,
      attack: 0.5,
    },
    dither: {
      enabled: true,
      type: 'tpdf',
      bitDepth: 24,
    },
  },
};

// ============================================================================
// Default Configuration
// ============================================================================

const DEFAULT_CONFIG: MasteringChainConfig = {
  inputGain: 0,
  outputCeiling: -0.3,
  eq: {
    enabled: true,
    lowGain: 0,
    lowFreq: 80,
    midGain: 0,
    midFreq: 2500,
    midQ: 1.0,
    highGain: 0,
    highFreq: 12000,
  },
  multiband: {
    enabled: true,
    bands: [
      { frequency: 120, threshold: -18, ratio: 2.5, attack: 20, release: 200, gain: 0, enabled: true },
      { frequency: 600, threshold: -16, ratio: 2, attack: 15, release: 150, gain: 0, enabled: true },
      { frequency: 4000, threshold: -14, ratio: 2, attack: 10, release: 100, gain: 0, enabled: true },
      { frequency: 16000, threshold: -12, ratio: 1.8, attack: 5, release: 80, gain: 0, enabled: true },
    ],
  },
  stereo: {
    enabled: true,
    width: 100,
    midGain: 0,
    sideGain: 0,
    lowCrossover: 100,
  },
  limiter: {
    enabled: true,
    threshold: -0.3,
    release: 100,
    lookahead: 3,
    attack: 0.5,
  },
  dither: {
    enabled: false,
    type: 'none',
    bitDepth: 24,
  },
};

// ============================================================================
// Linear Phase EQ Implementation
// ============================================================================

class LinearPhaseEQ {
  private ctx: AudioContext;
  private input: GainNode;
  private output: GainNode;

  // Filters - using cascaded biquads for linear phase approximation
  private lowShelf1: BiquadFilterNode;
  private lowShelf2: BiquadFilterNode;
  private midBell1: BiquadFilterNode;
  private midBell2: BiquadFilterNode;
  private highShelf1: BiquadFilterNode;
  private highShelf2: BiquadFilterNode;

  // Delay for phase alignment (linear phase approximation)
  private phaseDelay: DelayNode;

  private config: MasteringChainConfig['eq'];

  constructor(ctx: AudioContext, config: MasteringChainConfig['eq']) {
    this.ctx = ctx;
    this.config = config;

    this.input = ctx.createGain();
    this.output = ctx.createGain();

    // Create cascaded filters for steeper slopes and more linear phase
    this.lowShelf1 = ctx.createBiquadFilter();
    this.lowShelf2 = ctx.createBiquadFilter();
    this.midBell1 = ctx.createBiquadFilter();
    this.midBell2 = ctx.createBiquadFilter();
    this.highShelf1 = ctx.createBiquadFilter();
    this.highShelf2 = ctx.createBiquadFilter();

    // Phase delay for linear phase approximation (latency compensation)
    this.phaseDelay = ctx.createDelay(0.01);
    this.phaseDelay.delayTime.value = 0.005; // 5ms delay

    this.setupFilters();
    this.connectNodes();
    this.applyConfig();
  }

  private setupFilters(): void {
    // Low shelf configuration
    [this.lowShelf1, this.lowShelf2].forEach((filter) => {
      filter.type = 'lowshelf';
      filter.frequency.value = this.config.lowFreq;
    });

    // Mid bell configuration
    [this.midBell1, this.midBell2].forEach((filter) => {
      filter.type = 'peaking';
      filter.frequency.value = this.config.midFreq;
      filter.Q.value = this.config.midQ;
    });

    // High shelf configuration
    [this.highShelf1, this.highShelf2].forEach((filter) => {
      filter.type = 'highshelf';
      filter.frequency.value = this.config.highFreq;
    });
  }

  private connectNodes(): void {
    // Signal path with cascaded filters for linear phase approximation
    this.input.connect(this.phaseDelay);
    this.phaseDelay.connect(this.lowShelf1);
    this.lowShelf1.connect(this.lowShelf2);
    this.lowShelf2.connect(this.midBell1);
    this.midBell1.connect(this.midBell2);
    this.midBell2.connect(this.highShelf1);
    this.highShelf1.connect(this.highShelf2);
    this.highShelf2.connect(this.output);
  }

  applyConfig(): void {
    if (!this.config.enabled) {
      // Bypass - set all gains to 0
      this.lowShelf1.gain.value = 0;
      this.lowShelf2.gain.value = 0;
      this.midBell1.gain.value = 0;
      this.midBell2.gain.value = 0;
      this.highShelf1.gain.value = 0;
      this.highShelf2.gain.value = 0;
      return;
    }

    // Split gain between cascaded filters (sqrt for power addition)
    const lowGainHalf = this.config.lowGain / 2;
    const midGainHalf = this.config.midGain / 2;
    const highGainHalf = this.config.highGain / 2;

    this.lowShelf1.gain.value = lowGainHalf;
    this.lowShelf2.gain.value = lowGainHalf;
    this.lowShelf1.frequency.value = this.config.lowFreq;
    this.lowShelf2.frequency.value = this.config.lowFreq;

    this.midBell1.gain.value = midGainHalf;
    this.midBell2.gain.value = midGainHalf;
    this.midBell1.frequency.value = this.config.midFreq;
    this.midBell2.frequency.value = this.config.midFreq;
    this.midBell1.Q.value = this.config.midQ;
    this.midBell2.Q.value = this.config.midQ;

    this.highShelf1.gain.value = highGainHalf;
    this.highShelf2.gain.value = highGainHalf;
    this.highShelf1.frequency.value = this.config.highFreq;
    this.highShelf2.frequency.value = this.config.highFreq;
  }

  setConfig(config: MasteringChainConfig['eq']): void {
    this.config = config;
    this.applyConfig();
  }

  getInput(): GainNode {
    return this.input;
  }

  connect(destination: AudioNode): void {
    this.output.connect(destination);
  }

  disconnect(): void {
    this.output.disconnect();
  }

  dispose(): void {
    this.input.disconnect();
    this.phaseDelay.disconnect();
    this.lowShelf1.disconnect();
    this.lowShelf2.disconnect();
    this.midBell1.disconnect();
    this.midBell2.disconnect();
    this.highShelf1.disconnect();
    this.highShelf2.disconnect();
    this.output.disconnect();
  }
}

// ============================================================================
// Multi-band Compressor Implementation
// ============================================================================

class MultibandCompressor {
  private ctx: AudioContext;
  private input: GainNode;
  private output: GainNode;

  // Crossover filters (Linkwitz-Riley style)
  private lowpassFilters: BiquadFilterNode[][] = [];
  private highpassFilters: BiquadFilterNode[][] = [];

  // Band compressors
  private bandCompressors: DynamicsCompressorNode[] = [];
  private bandGains: GainNode[] = [];

  // Analyzers for metering
  private bandAnalyzers: AnalyserNode[] = [];

  private config: MasteringChainConfig['multiband'];
  private gainReductions: number[] = [0, 0, 0, 0];

  constructor(ctx: AudioContext, config: MasteringChainConfig['multiband']) {
    this.ctx = ctx;
    this.config = config;

    this.input = ctx.createGain();
    this.output = ctx.createGain();

    this.createBands();
    this.connectNodes();
    this.applyConfig();
  }

  private createBands(): void {
    const numBands = this.config.bands.length;

    // For N bands, we need N-1 crossover points
    // Each crossover uses 4th order Linkwitz-Riley (two 2nd order cascaded)
    for (let i = 0; i < numBands; i++) {
      // Create compressor for each band
      const compressor = this.ctx.createDynamicsCompressor();
      this.bandCompressors.push(compressor);

      // Create gain for each band
      const gain = this.ctx.createGain();
      this.bandGains.push(gain);

      // Create analyzer for each band
      const analyzer = this.ctx.createAnalyser();
      analyzer.fftSize = 256;
      this.bandAnalyzers.push(analyzer);

      // Create crossover filters
      if (i < numBands - 1) {
        const freq = this.config.bands[i].frequency;

        // Lowpass filters (2nd order x2 = 4th order)
        const lp1 = this.ctx.createBiquadFilter();
        const lp2 = this.ctx.createBiquadFilter();
        lp1.type = 'lowpass';
        lp2.type = 'lowpass';
        lp1.frequency.value = freq;
        lp2.frequency.value = freq;
        lp1.Q.value = 0.707; // Butterworth
        lp2.Q.value = 0.707;
        this.lowpassFilters.push([lp1, lp2]);

        // Highpass filters (2nd order x2 = 4th order)
        const hp1 = this.ctx.createBiquadFilter();
        const hp2 = this.ctx.createBiquadFilter();
        hp1.type = 'highpass';
        hp2.type = 'highpass';
        hp1.frequency.value = freq;
        hp2.frequency.value = freq;
        hp1.Q.value = 0.707;
        hp2.Q.value = 0.707;
        this.highpassFilters.push([hp1, hp2]);
      }
    }
  }

  private connectNodes(): void {
    if (!this.config.enabled) {
      this.input.connect(this.output);
      return;
    }

    const numBands = this.config.bands.length;

    // For 4 bands with crossovers at f1, f2, f3:
    // Band 0: input -> LP(f1) -> comp0
    // Band 1: input -> HP(f1) -> LP(f2) -> comp1
    // Band 2: input -> HP(f1) -> HP(f2) -> LP(f3) -> comp2
    // Band 3: input -> HP(f1) -> HP(f2) -> HP(f3) -> comp3

    for (let band = 0; band < numBands; band++) {
      let current: AudioNode = this.input;

      // Apply highpass filters for all crossovers below this band
      for (let i = 0; i < band; i++) {
        const [hp1, hp2] = this.highpassFilters[i];
        current.connect(hp1);
        hp1.connect(hp2);
        current = hp2;
      }

      // Apply lowpass filter if not the highest band
      if (band < numBands - 1) {
        const [lp1, lp2] = this.lowpassFilters[band];
        current.connect(lp1);
        lp1.connect(lp2);
        current = lp2;
      }

      // Connect to compressor -> gain -> analyzer -> output
      current.connect(this.bandCompressors[band]);
      this.bandCompressors[band].connect(this.bandGains[band]);
      this.bandGains[band].connect(this.bandAnalyzers[band]);
      this.bandAnalyzers[band].connect(this.output);
    }
  }

  private reconnectNodes(): void {
    // Disconnect all
    this.input.disconnect();
    this.lowpassFilters.forEach((filters) => filters.forEach((f) => f.disconnect()));
    this.highpassFilters.forEach((filters) => filters.forEach((f) => f.disconnect()));
    this.bandCompressors.forEach((c) => c.disconnect());
    this.bandGains.forEach((g) => g.disconnect());
    this.bandAnalyzers.forEach((a) => a.disconnect());

    // Reconnect
    this.connectNodes();
  }

  applyConfig(): void {
    if (!this.config.enabled) {
      // Bypass
      this.input.disconnect();
      this.input.connect(this.output);
      return;
    }

    // Apply settings to each band
    this.config.bands.forEach((bandConfig, i) => {
      const compressor = this.bandCompressors[i];
      const gain = this.bandGains[i];

      if (!bandConfig.enabled) {
        gain.gain.value = 0;
        return;
      }

      // Compressor settings
      compressor.threshold.value = bandConfig.threshold;
      compressor.ratio.value = bandConfig.ratio;
      compressor.attack.value = bandConfig.attack / 1000; // ms to seconds
      compressor.release.value = bandConfig.release / 1000;
      compressor.knee.value = 6; // Soft knee

      // Makeup gain
      gain.gain.value = Math.pow(10, bandConfig.gain / 20);

      // Update crossover frequency if applicable
      if (i < this.lowpassFilters.length) {
        this.lowpassFilters[i][0].frequency.value = bandConfig.frequency;
        this.lowpassFilters[i][1].frequency.value = bandConfig.frequency;
      }
      if (i > 0 && i - 1 < this.highpassFilters.length) {
        // The highpass uses the previous band's frequency
        const prevFreq = this.config.bands[i - 1].frequency;
        this.highpassFilters[i - 1][0].frequency.value = prevFreq;
        this.highpassFilters[i - 1][1].frequency.value = prevFreq;
      }
    });
  }

  setConfig(config: MasteringChainConfig['multiband']): void {
    this.config = config;
    this.reconnectNodes();
    this.applyConfig();
  }

  getGainReductions(): number[] {
    return this.bandCompressors.map((c) => c.reduction);
  }

  getInput(): GainNode {
    return this.input;
  }

  connect(destination: AudioNode): void {
    this.output.connect(destination);
  }

  disconnect(): void {
    this.output.disconnect();
  }

  dispose(): void {
    this.input.disconnect();
    this.output.disconnect();
    this.lowpassFilters.forEach((filters) => filters.forEach((f) => f.disconnect()));
    this.highpassFilters.forEach((filters) => filters.forEach((f) => f.disconnect()));
    this.bandCompressors.forEach((c) => c.disconnect());
    this.bandGains.forEach((g) => g.disconnect());
    this.bandAnalyzers.forEach((a) => a.disconnect());
  }
}

// ============================================================================
// Stereo Widener (Mid/Side Processing)
// ============================================================================

class StereoWidener {
  private ctx: AudioContext;
  private input: GainNode;
  private output: GainNode;

  // Channel splitter/merger for M/S processing
  private splitter: ChannelSplitterNode;
  private merger: ChannelMergerNode;

  // M/S encoding/decoding
  private midEncoder: GainNode;
  private sideEncoder: GainNode;
  private midDecoder: GainNode;
  private sideDecoder: GainNode;

  // Processing
  private midGain: GainNode;
  private sideGain: GainNode;

  // Low crossover for mono bass
  private lowCrossoverLP: BiquadFilterNode;
  private lowCrossoverHP: BiquadFilterNode;
  private monoLowMerger: ChannelMergerNode;

  // Width control uses side gain
  private config: MasteringChainConfig['stereo'];

  constructor(ctx: AudioContext, config: MasteringChainConfig['stereo']) {
    this.ctx = ctx;
    this.config = config;

    this.input = ctx.createGain();
    this.output = ctx.createGain();

    // Stereo splitter/merger
    this.splitter = ctx.createChannelSplitter(2);
    this.merger = ctx.createChannelMerger(2);

    // M/S encoding (L+R / L-R)
    this.midEncoder = ctx.createGain();
    this.sideEncoder = ctx.createGain();
    this.midDecoder = ctx.createGain();
    this.sideDecoder = ctx.createGain();

    // Processing gains
    this.midGain = ctx.createGain();
    this.sideGain = ctx.createGain();

    // Low frequency mono-ization
    this.lowCrossoverLP = ctx.createBiquadFilter();
    this.lowCrossoverHP = ctx.createBiquadFilter();
    this.monoLowMerger = ctx.createChannelMerger(2);

    this.setupMSMatrix();
    this.setupLowCrossover();
    this.connectNodes();
    this.applyConfig();
  }

  private setupMSMatrix(): void {
    // M/S encoding: Mid = (L+R)/2, Side = (L-R)/2
    // Implemented using gain nodes
    this.midEncoder.gain.value = 0.5;
    this.sideEncoder.gain.value = 0.5;

    // M/S decoding: L = Mid+Side, R = Mid-Side
    this.midDecoder.gain.value = 1;
    this.sideDecoder.gain.value = 1;
  }

  private setupLowCrossover(): void {
    // Lowpass for mono bass
    this.lowCrossoverLP.type = 'lowpass';
    this.lowCrossoverLP.frequency.value = this.config.lowCrossover;
    this.lowCrossoverLP.Q.value = 0.707;

    // Highpass for stereo content
    this.lowCrossoverHP.type = 'highpass';
    this.lowCrossoverHP.frequency.value = this.config.lowCrossover;
    this.lowCrossoverHP.Q.value = 0.707;
  }

  private connectNodes(): void {
    if (!this.config.enabled) {
      this.input.connect(this.output);
      return;
    }

    // This is a simplified M/S implementation
    // For full M/S, we'd need ScriptProcessor or AudioWorklet

    // Split stereo input
    this.input.connect(this.splitter);

    // Create mid channel (L+R) using gain summing
    // Left channel
    const leftToMid = this.ctx.createGain();
    leftToMid.gain.value = 0.5;
    this.splitter.connect(leftToMid, 0);

    // Right channel
    const rightToMid = this.ctx.createGain();
    rightToMid.gain.value = 0.5;
    this.splitter.connect(rightToMid, 1);

    // Sum to mid
    const midSum = this.ctx.createGain();
    leftToMid.connect(midSum);
    rightToMid.connect(midSum);
    midSum.connect(this.midGain);

    // Create side channel (L-R)
    const leftToSide = this.ctx.createGain();
    leftToSide.gain.value = 0.5;
    this.splitter.connect(leftToSide, 0);

    const rightToSideInverted = this.ctx.createGain();
    rightToSideInverted.gain.value = -0.5; // Invert right for L-R
    this.splitter.connect(rightToSideInverted, 1);

    const sideSum = this.ctx.createGain();
    leftToSide.connect(sideSum);
    rightToSideInverted.connect(sideSum);
    sideSum.connect(this.sideGain);

    // Decode back to L/R
    // L = Mid + Side
    const midToLeft = this.ctx.createGain();
    midToLeft.gain.value = 1;
    this.midGain.connect(midToLeft);

    const sideToLeft = this.ctx.createGain();
    sideToLeft.gain.value = 1;
    this.sideGain.connect(sideToLeft);

    const leftOutput = this.ctx.createGain();
    midToLeft.connect(leftOutput);
    sideToLeft.connect(leftOutput);

    // R = Mid - Side
    const midToRight = this.ctx.createGain();
    midToRight.gain.value = 1;
    this.midGain.connect(midToRight);

    const sideToRightInverted = this.ctx.createGain();
    sideToRightInverted.gain.value = -1; // Invert side for R
    this.sideGain.connect(sideToRightInverted);

    const rightOutput = this.ctx.createGain();
    midToRight.connect(rightOutput);
    sideToRightInverted.connect(rightOutput);

    // Merge back to stereo
    leftOutput.connect(this.merger, 0, 0);
    rightOutput.connect(this.merger, 0, 1);

    this.merger.connect(this.output);
  }

  applyConfig(): void {
    if (!this.config.enabled) {
      this.midGain.gain.value = 1;
      this.sideGain.gain.value = 1;
      return;
    }

    // Width control: 100% = neutral, <100% = narrower, >100% = wider
    // Implemented by adjusting mid/side balance
    const widthFactor = this.config.width / 100;

    // Mid stays at 1, side is scaled by width
    this.midGain.gain.value = Math.pow(10, this.config.midGain / 20);
    this.sideGain.gain.value = widthFactor * Math.pow(10, this.config.sideGain / 20);

    // Update low crossover
    this.lowCrossoverLP.frequency.value = this.config.lowCrossover;
    this.lowCrossoverHP.frequency.value = this.config.lowCrossover;
  }

  setConfig(config: MasteringChainConfig['stereo']): void {
    this.config = config;
    this.applyConfig();
  }

  getInput(): GainNode {
    return this.input;
  }

  connect(destination: AudioNode): void {
    this.output.connect(destination);
  }

  disconnect(): void {
    this.output.disconnect();
  }

  dispose(): void {
    this.input.disconnect();
    this.splitter.disconnect();
    this.merger.disconnect();
    this.midGain.disconnect();
    this.sideGain.disconnect();
    this.output.disconnect();
  }
}

// ============================================================================
// Brick Wall Limiter with Lookahead
// ============================================================================

class BrickWallLimiter {
  private ctx: AudioContext;
  private input: GainNode;
  private output: GainNode;

  // Lookahead delay
  private lookaheadDelay: DelayNode;

  // Limiter (using compressor with extreme settings)
  private limiter: DynamicsCompressorNode;

  // True peak detection
  private peakAnalyzerL: AnalyserNode;
  private peakAnalyzerR: AnalyserNode;
  private splitter: ChannelSplitterNode;

  // Output ceiling
  private ceiling: GainNode;

  // Soft clipper for true peak protection
  private softClipper: WaveShaperNode;

  private config: MasteringChainConfig['limiter'];
  private truePeakL: number = -Infinity;
  private truePeakR: number = -Infinity;

  constructor(ctx: AudioContext, config: MasteringChainConfig['limiter'], ceiling: number) {
    this.ctx = ctx;
    this.config = config;

    this.input = ctx.createGain();
    this.output = ctx.createGain();

    // Lookahead delay
    this.lookaheadDelay = ctx.createDelay(0.01);

    // Brick wall limiter
    this.limiter = ctx.createDynamicsCompressor();

    // True peak analyzers
    this.splitter = ctx.createChannelSplitter(2);
    this.peakAnalyzerL = ctx.createAnalyser();
    this.peakAnalyzerR = ctx.createAnalyser();
    this.peakAnalyzerL.fftSize = 2048;
    this.peakAnalyzerR.fftSize = 2048;

    // Output ceiling
    this.ceiling = ctx.createGain();

    // Soft clipper for intersample peak protection
    this.softClipper = ctx.createWaveShaper();

    this.setupLimiter();
    this.setupSoftClipper(ceiling);
    this.connectNodes();
    this.applyConfig(ceiling);
  }

  private setupLimiter(): void {
    // Brick wall settings
    this.limiter.threshold.value = this.config.threshold;
    this.limiter.knee.value = 0;          // Hard knee for brick wall
    this.limiter.ratio.value = 20;        // Maximum ratio
    this.limiter.attack.value = this.config.attack / 1000;
    this.limiter.release.value = this.config.release / 1000;
  }

  private setupSoftClipper(ceiling: number): void {
    const samples = 44100;
    const curve = new Float32Array(samples);
    const ceilingLinear = Math.pow(10, ceiling / 20);

    for (let i = 0; i < samples; i++) {
      const x = (i * 2) / samples - 1;

      // Soft clip approaching ceiling
      if (Math.abs(x) < ceilingLinear * 0.9) {
        curve[i] = x;
      } else {
        // Gentle saturation above 90% of ceiling
        const sign = x >= 0 ? 1 : -1;
        const normalized = Math.abs(x) / ceilingLinear;
        curve[i] = sign * ceilingLinear * Math.tanh(normalized * 2) / Math.tanh(2);
      }
    }

    this.softClipper.curve = curve;
    this.softClipper.oversample = '4x'; // Reduce intersample peaks
  }

  private connectNodes(): void {
    if (!this.config.enabled) {
      this.input.connect(this.output);
      return;
    }

    // Signal path: input -> lookahead -> limiter -> softClipper -> ceiling -> output
    this.input.connect(this.lookaheadDelay);
    this.lookaheadDelay.connect(this.limiter);
    this.limiter.connect(this.softClipper);
    this.softClipper.connect(this.ceiling);
    this.ceiling.connect(this.output);

    // True peak metering (parallel)
    this.ceiling.connect(this.splitter);
    this.splitter.connect(this.peakAnalyzerL, 0);
    this.splitter.connect(this.peakAnalyzerR, 1);
  }

  applyConfig(ceiling: number): void {
    if (!this.config.enabled) {
      return;
    }

    // Lookahead
    this.lookaheadDelay.delayTime.value = this.config.lookahead / 1000;

    // Limiter
    this.limiter.threshold.value = this.config.threshold;
    this.limiter.attack.value = this.config.attack / 1000;
    this.limiter.release.value = this.config.release / 1000;

    // Output ceiling
    this.ceiling.gain.value = Math.pow(10, ceiling / 20);

    // Update soft clipper
    this.setupSoftClipper(ceiling);
  }

  setConfig(config: MasteringChainConfig['limiter'], ceiling: number): void {
    this.config = config;
    this.applyConfig(ceiling);
  }

  getGainReduction(): number {
    return this.limiter.reduction;
  }

  getTruePeak(): { left: number; right: number } {
    // Analyze true peak from time domain data
    const bufferSize = 2048;
    const dataL = new Float32Array(bufferSize);
    const dataR = new Float32Array(bufferSize);

    this.peakAnalyzerL.getFloatTimeDomainData(dataL);
    this.peakAnalyzerR.getFloatTimeDomainData(dataR);

    let peakL = 0;
    let peakR = 0;

    for (let i = 0; i < bufferSize; i++) {
      peakL = Math.max(peakL, Math.abs(dataL[i]));
      peakR = Math.max(peakR, Math.abs(dataR[i]));
    }

    // Convert to dB
    const peakLdB = 20 * Math.log10(Math.max(peakL, 0.00001));
    const peakRdB = 20 * Math.log10(Math.max(peakR, 0.00001));

    // Track max peaks
    this.truePeakL = Math.max(this.truePeakL, peakLdB);
    this.truePeakR = Math.max(this.truePeakR, peakRdB);

    return { left: peakLdB, right: peakRdB };
  }

  resetPeakHold(): void {
    this.truePeakL = -Infinity;
    this.truePeakR = -Infinity;
  }

  getInput(): GainNode {
    return this.input;
  }

  connect(destination: AudioNode): void {
    this.output.connect(destination);
  }

  disconnect(): void {
    this.output.disconnect();
  }

  dispose(): void {
    this.input.disconnect();
    this.lookaheadDelay.disconnect();
    this.limiter.disconnect();
    this.softClipper.disconnect();
    this.ceiling.disconnect();
    this.splitter.disconnect();
    this.output.disconnect();
  }
}

// ============================================================================
// Dithering
// ============================================================================

class Dithering {
  private ctx: AudioContext;
  private input: GainNode;
  private output: GainNode;

  // Noise source for dithering
  private noiseBuffer: AudioBuffer | null = null;
  private noiseSource: AudioBufferSourceNode | null = null;
  private noiseGain: GainNode;

  // Noise shaping filter
  private shapingFilter: BiquadFilterNode;

  private config: MasteringChainConfig['dither'];

  constructor(ctx: AudioContext, config: MasteringChainConfig['dither']) {
    this.ctx = ctx;
    this.config = config;

    this.input = ctx.createGain();
    this.output = ctx.createGain();

    this.noiseGain = ctx.createGain();
    this.shapingFilter = ctx.createBiquadFilter();

    this.setupNoiseShaping();
    this.connectNodes();
    this.applyConfig();
  }

  private setupNoiseShaping(): void {
    // Noise shaping pushes quantization noise to less audible frequencies
    this.shapingFilter.type = 'highshelf';
    this.shapingFilter.frequency.value = 4000;
    this.shapingFilter.gain.value = 6; // Boost high frequencies
  }

  private generateTPDFNoise(): AudioBuffer {
    // TPDF (Triangular Probability Density Function) dithering
    // Two uniform random values subtracted creates triangular distribution
    const sampleRate = this.ctx.sampleRate;
    const duration = 2; // 2 second buffer, looped
    const bufferSize = sampleRate * duration;
    const buffer = this.ctx.createBuffer(2, bufferSize, sampleRate);

    for (let channel = 0; channel < 2; channel++) {
      const data = buffer.getChannelData(channel);
      for (let i = 0; i < bufferSize; i++) {
        // TPDF: subtract two uniform random values
        const uniform1 = Math.random();
        const uniform2 = Math.random();
        data[i] = uniform1 - uniform2;
      }
    }

    return buffer;
  }

  private connectNodes(): void {
    // Pass through signal
    this.input.connect(this.output);

    // Add dither noise (parallel path)
    this.noiseGain.connect(this.output);
  }

  applyConfig(): void {
    if (!this.config.enabled || this.config.type === 'none') {
      this.noiseGain.gain.value = 0;
      return;
    }

    // Create noise buffer if needed
    if (!this.noiseBuffer) {
      this.noiseBuffer = this.generateTPDFNoise();
    }

    // Start noise source
    if (this.noiseSource) {
      this.noiseSource.stop();
      this.noiseSource.disconnect();
    }

    this.noiseSource = this.ctx.createBufferSource();
    this.noiseSource.buffer = this.noiseBuffer;
    this.noiseSource.loop = true;

    // Dither level based on bit depth
    // For 16-bit: 1 LSB = 1/(2^15) = 0.0000305
    // For 24-bit: 1 LSB = 1/(2^23) = 0.00000012
    const lsbLevel = this.config.bitDepth === 16 ? 0.0000305 : 0.00000012;

    if (this.config.type === 'tpdf') {
      // Standard TPDF dithering
      this.noiseSource.connect(this.noiseGain);
      this.noiseGain.gain.value = lsbLevel;
    } else if (this.config.type.startsWith('noise-shaping')) {
      // Noise shaped dithering
      this.noiseSource.connect(this.shapingFilter);
      this.shapingFilter.connect(this.noiseGain);

      // Adjust gain for noise shaping
      const shapingBoost = this.config.type === 'noise-shaping-2' ? 1.5 : 1.0;
      this.noiseGain.gain.value = lsbLevel * shapingBoost;

      // Adjust filter for more aggressive shaping
      if (this.config.type === 'noise-shaping-2') {
        this.shapingFilter.gain.value = 9;
        this.shapingFilter.frequency.value = 5000;
      }
    }

    this.noiseSource.start();
  }

  setConfig(config: MasteringChainConfig['dither']): void {
    this.config = config;
    this.applyConfig();
  }

  getInput(): GainNode {
    return this.input;
  }

  connect(destination: AudioNode): void {
    this.output.connect(destination);
  }

  disconnect(): void {
    this.output.disconnect();
  }

  dispose(): void {
    if (this.noiseSource) {
      this.noiseSource.stop();
      this.noiseSource.disconnect();
    }
    this.noiseGain.disconnect();
    this.shapingFilter.disconnect();
    this.input.disconnect();
    this.output.disconnect();
  }
}

// ============================================================================
// LUFS Meter
// ============================================================================

class LUFSMeter {
  private ctx: AudioContext;
  private input: GainNode;

  // K-weighting filters
  private preFilter: BiquadFilterNode;
  private highShelf: BiquadFilterNode;
  private highpass: BiquadFilterNode;

  // Analyzers
  private analyzerL: AnalyserNode;
  private analyzerR: AnalyserNode;
  private splitter: ChannelSplitterNode;

  // Integrated loudness accumulator
  private gatingBuffer: number[] = [];
  private integratedLUFS: number = -Infinity;
  private momentaryLUFS: number = -Infinity;

  constructor(ctx: AudioContext) {
    this.ctx = ctx;

    this.input = ctx.createGain();

    // K-weighting pre-filter (high shelf boost)
    this.preFilter = ctx.createBiquadFilter();
    this.preFilter.type = 'highshelf';
    this.preFilter.frequency.value = 1500;
    this.preFilter.gain.value = 4; // Approximate K-weighting

    // K-weighting high shelf
    this.highShelf = ctx.createBiquadFilter();
    this.highShelf.type = 'highshelf';
    this.highShelf.frequency.value = 1500;
    this.highShelf.gain.value = 4;

    // K-weighting highpass
    this.highpass = ctx.createBiquadFilter();
    this.highpass.type = 'highpass';
    this.highpass.frequency.value = 38;
    this.highpass.Q.value = 0.5;

    // Channel analyzers
    this.splitter = ctx.createChannelSplitter(2);
    this.analyzerL = ctx.createAnalyser();
    this.analyzerR = ctx.createAnalyser();
    this.analyzerL.fftSize = 2048;
    this.analyzerR.fftSize = 2048;

    this.connectNodes();
  }

  private connectNodes(): void {
    // K-weighting chain
    this.input.connect(this.preFilter);
    this.preFilter.connect(this.highShelf);
    this.highShelf.connect(this.highpass);

    // Split to analyzers
    this.highpass.connect(this.splitter);
    this.splitter.connect(this.analyzerL, 0);
    this.splitter.connect(this.analyzerR, 1);
  }

  getMomentaryLUFS(): number {
    const bufferSize = 2048;
    const dataL = new Float32Array(bufferSize);
    const dataR = new Float32Array(bufferSize);

    this.analyzerL.getFloatTimeDomainData(dataL);
    this.analyzerR.getFloatTimeDomainData(dataR);

    // Calculate mean square
    let sumL = 0;
    let sumR = 0;
    for (let i = 0; i < bufferSize; i++) {
      sumL += dataL[i] * dataL[i];
      sumR += dataR[i] * dataR[i];
    }

    const meanSquareL = sumL / bufferSize;
    const meanSquareR = sumR / bufferSize;

    // Stereo LUFS = -0.691 + 10 * log10(meanSquareL + meanSquareR)
    const lufs = -0.691 + 10 * Math.log10(Math.max(meanSquareL + meanSquareR, 0.0000001));

    this.momentaryLUFS = lufs;
    return lufs;
  }

  getIntegratedLUFS(): number {
    // Simplified integrated measurement
    const momentary = this.getMomentaryLUFS();

    // Gating: only include blocks above -70 LUFS (absolute gate)
    if (momentary > -70) {
      this.gatingBuffer.push(momentary);

      // Keep last 10 seconds worth of samples
      if (this.gatingBuffer.length > 100) {
        this.gatingBuffer.shift();
      }
    }

    if (this.gatingBuffer.length > 0) {
      // Relative gate: exclude blocks 10 dB below average
      const avgLoudness = this.gatingBuffer.reduce((a, b) => a + b, 0) / this.gatingBuffer.length;
      const gatedBlocks = this.gatingBuffer.filter((l) => l >= avgLoudness - 10);

      if (gatedBlocks.length > 0) {
        this.integratedLUFS = gatedBlocks.reduce((a, b) => a + b, 0) / gatedBlocks.length;
      }
    }

    return this.integratedLUFS;
  }

  reset(): void {
    this.gatingBuffer = [];
    this.integratedLUFS = -Infinity;
    this.momentaryLUFS = -Infinity;
  }

  getInput(): GainNode {
    return this.input;
  }

  dispose(): void {
    this.input.disconnect();
    this.preFilter.disconnect();
    this.highShelf.disconnect();
    this.highpass.disconnect();
    this.splitter.disconnect();
    this.analyzerL.disconnect();
    this.analyzerR.disconnect();
  }
}

// ============================================================================
// Correlation Meter
// ============================================================================

class CorrelationMeter {
  private ctx: AudioContext;
  private input: GainNode;
  private splitter: ChannelSplitterNode;
  private analyzerL: AnalyserNode;
  private analyzerR: AnalyserNode;

  constructor(ctx: AudioContext) {
    this.ctx = ctx;

    this.input = ctx.createGain();
    this.splitter = ctx.createChannelSplitter(2);
    this.analyzerL = ctx.createAnalyser();
    this.analyzerR = ctx.createAnalyser();
    this.analyzerL.fftSize = 2048;
    this.analyzerR.fftSize = 2048;

    this.input.connect(this.splitter);
    this.splitter.connect(this.analyzerL, 0);
    this.splitter.connect(this.analyzerR, 1);
  }

  getCorrelation(): number {
    const bufferSize = 2048;
    const dataL = new Float32Array(bufferSize);
    const dataR = new Float32Array(bufferSize);

    this.analyzerL.getFloatTimeDomainData(dataL);
    this.analyzerR.getFloatTimeDomainData(dataR);

    // Calculate correlation coefficient
    let sumLR = 0;
    let sumL2 = 0;
    let sumR2 = 0;

    for (let i = 0; i < bufferSize; i++) {
      sumLR += dataL[i] * dataR[i];
      sumL2 += dataL[i] * dataL[i];
      sumR2 += dataR[i] * dataR[i];
    }

    const denominator = Math.sqrt(sumL2 * sumR2);
    if (denominator === 0) return 1; // Silence = perfect correlation

    return sumLR / denominator;
  }

  getInput(): GainNode {
    return this.input;
  }

  dispose(): void {
    this.input.disconnect();
    this.splitter.disconnect();
    this.analyzerL.disconnect();
    this.analyzerR.disconnect();
  }
}

// ============================================================================
// Main Mastering Chain Class
// ============================================================================

export class MasteringChain {
  private ctx: AudioContext;
  private input: GainNode;
  private output: GainNode;

  // Input stage
  private inputGain: GainNode;

  // Processing modules
  private linearPhaseEQ: LinearPhaseEQ;
  private multibandCompressor: MultibandCompressor;
  private stereoWidener: StereoWidener;
  private brickWallLimiter: BrickWallLimiter;
  private dithering: Dithering;

  // Metering
  private inputAnalyzerL: AnalyserNode;
  private inputAnalyzerR: AnalyserNode;
  private outputAnalyzerL: AnalyserNode;
  private outputAnalyzerR: AnalyserNode;
  private inputSplitter: ChannelSplitterNode;
  private outputSplitter: ChannelSplitterNode;
  private lufsMeter: LUFSMeter;
  private correlationMeter: CorrelationMeter;

  private config: MasteringChainConfig;

  constructor(ctx: AudioContext, config: Partial<MasteringChainConfig> = {}) {
    this.ctx = ctx;
    this.config = { ...DEFAULT_CONFIG, ...config };

    // Create input/output
    this.input = ctx.createGain();
    this.output = ctx.createGain();
    this.inputGain = ctx.createGain();

    // Create analyzers for input metering
    this.inputSplitter = ctx.createChannelSplitter(2);
    this.inputAnalyzerL = ctx.createAnalyser();
    this.inputAnalyzerR = ctx.createAnalyser();
    this.inputAnalyzerL.fftSize = 2048;
    this.inputAnalyzerR.fftSize = 2048;

    // Create analyzers for output metering
    this.outputSplitter = ctx.createChannelSplitter(2);
    this.outputAnalyzerL = ctx.createAnalyser();
    this.outputAnalyzerR = ctx.createAnalyser();
    this.outputAnalyzerL.fftSize = 2048;
    this.outputAnalyzerR.fftSize = 2048;

    // Create processing modules
    this.linearPhaseEQ = new LinearPhaseEQ(ctx, this.config.eq);
    this.multibandCompressor = new MultibandCompressor(ctx, this.config.multiband);
    this.stereoWidener = new StereoWidener(ctx, this.config.stereo);
    this.brickWallLimiter = new BrickWallLimiter(ctx, this.config.limiter, this.config.outputCeiling);
    this.dithering = new Dithering(ctx, this.config.dither);

    // Create metering
    this.lufsMeter = new LUFSMeter(ctx);
    this.correlationMeter = new CorrelationMeter(ctx);

    this.connectNodes();
    this.applyConfig();
  }

  private connectNodes(): void {
    // Input metering (parallel)
    this.input.connect(this.inputSplitter);
    this.inputSplitter.connect(this.inputAnalyzerL, 0);
    this.inputSplitter.connect(this.inputAnalyzerR, 1);

    // Main signal path:
    // input -> inputGain -> EQ -> Multiband -> Stereo -> Limiter -> Dither -> output

    this.input.connect(this.inputGain);
    this.inputGain.connect(this.linearPhaseEQ.getInput());
    this.linearPhaseEQ.connect(this.multibandCompressor.getInput());
    this.multibandCompressor.connect(this.stereoWidener.getInput());
    this.stereoWidener.connect(this.brickWallLimiter.getInput());
    this.brickWallLimiter.connect(this.dithering.getInput());
    this.dithering.connect(this.output);

    // Output metering (parallel)
    this.output.connect(this.outputSplitter);
    this.outputSplitter.connect(this.outputAnalyzerL, 0);
    this.outputSplitter.connect(this.outputAnalyzerR, 1);

    // LUFS and correlation metering
    this.output.connect(this.lufsMeter.getInput());
    this.output.connect(this.correlationMeter.getInput());
  }

  private applyConfig(): void {
    // Input gain
    this.inputGain.gain.value = Math.pow(10, this.config.inputGain / 20);

    // Update all modules
    this.linearPhaseEQ.setConfig(this.config.eq);
    this.multibandCompressor.setConfig(this.config.multiband);
    this.stereoWidener.setConfig(this.config.stereo);
    this.brickWallLimiter.setConfig(this.config.limiter, this.config.outputCeiling);
    this.dithering.setConfig(this.config.dither);
  }

  // ============================================================================
  // Public API
  // ============================================================================

  /**
   * Apply a mastering preset
   */
  setPreset(presetName: keyof typeof MASTERING_PRESETS): void {
    const preset = MASTERING_PRESETS[presetName];
    if (preset) {
      this.config = {
        ...DEFAULT_CONFIG,
        ...preset,
        eq: { ...DEFAULT_CONFIG.eq, ...preset.eq },
        multiband: { ...DEFAULT_CONFIG.multiband, ...preset.multiband },
        stereo: { ...DEFAULT_CONFIG.stereo, ...preset.stereo },
        limiter: { ...DEFAULT_CONFIG.limiter, ...preset.limiter },
        dither: { ...DEFAULT_CONFIG.dither, ...preset.dither },
      };
      this.applyConfig();
    }
  }

  /**
   * Update configuration
   */
  setConfig(config: Partial<MasteringChainConfig>): void {
    this.config = {
      ...this.config,
      ...config,
      eq: { ...this.config.eq, ...config.eq },
      multiband: { ...this.config.multiband, ...config.multiband },
      stereo: { ...this.config.stereo, ...config.stereo },
      limiter: { ...this.config.limiter, ...config.limiter },
      dither: { ...this.config.dither, ...config.dither },
    };
    this.applyConfig();
  }

  /**
   * Set input gain
   */
  setInputGain(db: number): void {
    this.config.inputGain = Math.max(-24, Math.min(24, db));
    this.inputGain.gain.value = Math.pow(10, this.config.inputGain / 20);
  }

  /**
   * Set output ceiling
   */
  setOutputCeiling(db: number): void {
    this.config.outputCeiling = Math.max(-3, Math.min(0, db));
    this.brickWallLimiter.setConfig(this.config.limiter, this.config.outputCeiling);
  }

  /**
   * Get current configuration
   */
  getConfig(): MasteringChainConfig {
    return { ...this.config };
  }

  /**
   * Get metering data
   */
  getMeterData(): MasteringMeterData {
    // Input levels
    const inputLevelL = this.getLevel(this.inputAnalyzerL);
    const inputLevelR = this.getLevel(this.inputAnalyzerR);

    // Output levels
    const outputLevelL = this.getLevel(this.outputAnalyzerL);
    const outputLevelR = this.getLevel(this.outputAnalyzerR);

    // Gain reductions
    const gainReduction = this.multibandCompressor.getGainReductions();

    // True peak
    const truePeak = this.brickWallLimiter.getTruePeak();

    // LUFS
    const lufs = this.lufsMeter.getMomentaryLUFS();

    // Correlation
    const correlation = this.correlationMeter.getCorrelation();

    return {
      inputLevel: { left: inputLevelL, right: inputLevelR },
      outputLevel: { left: outputLevelL, right: outputLevelR },
      gainReduction,
      truePeak,
      lufs,
      correlation,
    };
  }

  private getLevel(analyzer: AnalyserNode): number {
    const bufferSize = 2048;
    const data = new Float32Array(bufferSize);
    analyzer.getFloatTimeDomainData(data);

    let sum = 0;
    for (let i = 0; i < bufferSize; i++) {
      sum += data[i] * data[i];
    }

    const rms = Math.sqrt(sum / bufferSize);
    return 20 * Math.log10(Math.max(rms, 0.00001));
  }

  /**
   * Get integrated LUFS
   */
  getIntegratedLUFS(): number {
    return this.lufsMeter.getIntegratedLUFS();
  }

  /**
   * Reset LUFS measurement
   */
  resetLUFS(): void {
    this.lufsMeter.reset();
  }

  /**
   * Reset peak hold
   */
  resetPeakHold(): void {
    this.brickWallLimiter.resetPeakHold();
  }

  /**
   * Connect to audio graph
   */
  connect(destination: AudioNode): MasteringChain {
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
   * Process buffer offline (for non-realtime rendering/export)
   */
  async processBuffer(inputBuffer: AudioBuffer): Promise<AudioBuffer> {
    const offlineCtx = new OfflineAudioContext(
      inputBuffer.numberOfChannels,
      inputBuffer.length,
      inputBuffer.sampleRate
    );

    // Create offline version
    const offlineChain = new MasteringChain(offlineCtx as unknown as AudioContext, this.config);

    const source = offlineCtx.createBufferSource();
    source.buffer = inputBuffer;
    source.connect(offlineChain.getInput());
    offlineChain.connect(offlineCtx.destination);

    source.start();

    const renderedBuffer = await offlineCtx.startRendering();
    offlineChain.dispose();

    return renderedBuffer;
  }

  /**
   * Cleanup resources
   */
  dispose(): void {
    this.input.disconnect();
    this.inputGain.disconnect();
    this.inputSplitter.disconnect();
    this.inputAnalyzerL.disconnect();
    this.inputAnalyzerR.disconnect();
    this.outputSplitter.disconnect();
    this.outputAnalyzerL.disconnect();
    this.outputAnalyzerR.disconnect();

    this.linearPhaseEQ.dispose();
    this.multibandCompressor.dispose();
    this.stereoWidener.dispose();
    this.brickWallLimiter.dispose();
    this.dithering.dispose();
    this.lufsMeter.dispose();
    this.correlationMeter.dispose();

    this.output.disconnect();
  }
}

export default MasteringChain;

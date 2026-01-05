/**
 * Audio type definitions for DAW functionality
 */

export interface AudioRegion {
  id: string;
  startTime: number;     // Start time in seconds
  endTime: number;       // End time in seconds
  offsetInBuffer: number; // Offset in the source AudioBuffer
  isSelected: boolean;
}

export interface EQSettings {
  low: number;    // Low shelf gain in dB (-12 to +12)
  mid: number;    // Peaking gain in dB
  high: number;   // High shelf gain in dB
}

export interface CompressorSettings {
  threshold: number;  // -100 to 0 dB
  ratio: number;      // 1 to 20
  attack: number;     // 0 to 1 second
  release: number;    // 0 to 1 second
  knee: number;       // 0 to 40 dB
}

export interface ReverbSettings {
  amount: number;    // 0 to 1 (dry/wet mix)
  duration: number;  // Decay time in seconds
  enabled: boolean;
}

export interface TapeSaturationSettings {
  enabled: boolean;
  drive: number;        // 0-100: Input gain/saturation amount
  warmth: number;       // 0-100: Low-frequency enhancement
  saturation: number;   // 0-100: Harmonic distortion intensity
  tapeSpeed: '7.5' | '15' | '30';  // IPS
  tapeType: 'modern' | 'vintage';
  wowFlutter: number;   // 0-100: Tape speed variation
  hiss: number;         // 0-100: Tape noise level
  preset?: string;      // Optional preset name
}

export interface FETCompressorSettings {
  enabled: boolean;
  inputGain: number;      // -20 to +20 dB
  outputGain: number;     // -20 to +20 dB
  attack: number;         // 1-7 (1=fastest 20μs, 7=slowest 800μs)
  release: number;        // 1-7 (1=fastest 50ms, 7=slowest 1100ms)
  ratio: '4' | '8' | '12' | '20' | 'all';
  mix: number;            // 0-100 dry/wet
  preset?: string;
}

export interface OptoCompressorSettings {
  enabled: boolean;
  peakReduction: number;    // 0-100: Amount of compression (threshold + ratio combined)
  gain: number;             // -20 to +20 dB: Makeup gain
  mode: 'compress' | 'limit';  // Compress (~3:1) or Limit (~100:1)
  mix: number;              // 0-100: Dry/wet for parallel compression
  emphasis: number;         // 0-100: High frequency emphasis (sidechain HF boost)
  preset?: string;
}

export interface Track {
  id: string;
  name: string;
  buffer: AudioBuffer | null;

  // Audio properties
  volume: number;        // -60 to 0 dB
  pan: number;           // -1 (left) to 1 (right)
  muted: boolean;
  solo: boolean;

  // Regions/Clips
  regions: AudioRegion[];

  // Effects
  eq: EQSettings;
  compression: CompressorSettings;
  reverb: ReverbSettings;
  tape: TapeSaturationSettings;
  fet: FETCompressorSettings;
  opto: OptoCompressorSettings;

  // UI State
  isSelected: boolean;
  isCollapsed: boolean;
  color: string;         // Track color for UI

  // Waveform data for visualization
  waveform?: number[];   // Pre-computed waveform peaks
}

export interface PlaybackState {
  isPlaying: boolean;
  currentTime: number;    // Current playhead position in seconds
  duration: number;       // Total project duration
  loop: boolean;
  loopStart?: number;
  loopEnd?: number;
}

export interface ProjectSettings {
  id: string;
  name: string;
  sampleRate: number;     // 44100, 48000, etc.
  bitDepth: number;       // 16, 24, 32
  tempo: number;          // BPM
  timeSignature: string;  // "4/4", "3/4", etc.
}

export interface AudioState {
  // Playback
  playback: PlaybackState;

  // Tracks (up to 110 for professional production)
  tracks: Track[];
  activeTrackId: string | null;

  // Master channel
  masterVolume: number;
  masterPan: number;

  // Project settings
  project: ProjectSettings;

  // UI State
  zoom: number;           // Timeline zoom level
  viewportStart: number;  // Visible portion of timeline
  viewportEnd: number;
}

// Node types for audio graph
export interface TrackNodes {
  source: AudioBufferSourceNode | null;
  gain: GainNode;
  pan: StereoPannerNode;
  eqLow: BiquadFilterNode;
  eqMid: BiquadFilterNode;
  eqHigh: BiquadFilterNode;
  compressor: DynamicsCompressorNode;
  dryGain: GainNode;
  wetGain: GainNode;
  convolver: ConvolverNode | null;
  tapeSaturation: any | null;  // TapeSaturation instance
  fetCompressor: any | null;   // FETCompressor (1176) instance
  optoCompressor: any | null;  // OptoCompressor (LA-2A) instance
}

export interface AudioEngineConfig {
  sampleRate?: number;
  latencyHint?: AudioContextLatencyCategory;
  maxTracks?: number;
}

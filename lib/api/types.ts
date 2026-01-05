/**
 * API Types for AI Music Studio
 * Defines data models for projects, tracks, presets, and users
 */

/**
 * Project represents a music production project
 */
export interface Project {
  id: string;
  org_id: string;
  name: string;
  description?: string;
  bpm: number;
  key?: string;         // Musical key (e.g., "C major", "A minor")
  timeSignature?: string; // e.g., "4/4", "3/4"
  duration?: number;    // Total duration in seconds
  trackCount?: number;  // Number of tracks
  status: 'draft' | 'active' | 'archived';
  coverUrl?: string;    // Cover image URL
  tags?: string[];
  created_by?: string;  // User ID
  created_at: string;
  updated_at: string;
}

/**
 * Input for creating a new project
 */
export interface CreateProjectInput {
  name: string;
  description?: string;
  bpm?: number;
  key?: string;
  timeSignature?: string;
  coverUrl?: string;
  tags?: string[];
}

/**
 * Input for updating a project
 */
export interface UpdateProjectInput {
  name?: string;
  description?: string;
  bpm?: number;
  key?: string;
  timeSignature?: string;
  duration?: number;
  status?: 'draft' | 'active' | 'archived';
  coverUrl?: string;
  tags?: string[];
}

/**
 * Track represents an audio track within a project
 */
export interface Track {
  id: string;
  project_id: string;
  org_id: string;
  name: string;
  type: 'audio' | 'midi' | 'generated';
  audioUrl?: string;    // URL to audio file
  waveformData?: number[]; // Waveform for visualization
  duration: number;     // Duration in seconds
  startTime: number;    // Start time in timeline (seconds)
  volume: number;       // 0-1
  pan: number;          // -1 to 1
  muted: boolean;
  soloed: boolean;
  color?: string;       // Track color for UI
  effects?: TrackEffect[];
  metadata?: {
    prompt?: string;    // AI generation prompt
    provider?: string;  // Generation provider
    originalFileName?: string;
    sourceType?: 'upload' | 'generated' | 'separated';
  };
  order: number;        // Track order in timeline
  created_at: string;
  updated_at: string;
}

/**
 * Track effect configuration
 */
export interface TrackEffect {
  id: string;
  type: 'eq' | 'compressor' | 'reverb' | 'delay' | 'limiter' | 'gate' | 'chorus' | 'distortion';
  enabled: boolean;
  params: Record<string, number | boolean | string>;
}

/**
 * Input for creating a new track
 */
export interface CreateTrackInput {
  name: string;
  type: 'audio' | 'midi' | 'generated';
  audioUrl?: string;
  waveformData?: number[];
  duration?: number;
  startTime?: number;
  volume?: number;
  pan?: number;
  color?: string;
  effects?: TrackEffect[];
  metadata?: Record<string, unknown>;
  order?: number;
}

/**
 * Input for updating a track
 */
export interface UpdateTrackInput {
  name?: string;
  audioUrl?: string;
  waveformData?: number[];
  duration?: number;
  startTime?: number;
  volume?: number;
  pan?: number;
  muted?: boolean;
  soloed?: boolean;
  color?: string;
  effects?: TrackEffect[];
  metadata?: Record<string, unknown>;
  order?: number;
}

/**
 * Preset for mastering or effects chains
 */
export interface Preset {
  id: string;
  name: string;
  description?: string;
  type: 'mastering' | 'effect' | 'instrument' | 'mix';
  category?: string;    // e.g., "pop", "rock", "electronic"
  isPublic: boolean;
  creator_org_id?: string;
  settings: PresetSettings;
  usage_count?: number;
  rating?: number;
  tags?: string[];
  created_at: string;
  updated_at: string;
}

/**
 * Preset settings (mastering chain)
 */
export interface PresetSettings {
  // EQ settings
  eq?: {
    lowGain: number;      // -12 to 12 dB
    lowFreq: number;      // Hz
    midGain: number;
    midFreq: number;
    midQ: number;
    highGain: number;
    highFreq: number;
  };
  // Compressor settings
  compressor?: {
    threshold: number;    // dB
    ratio: number;        // 1:1 to 20:1
    attack: number;       // ms
    release: number;      // ms
    knee: number;         // dB
    makeupGain: number;   // dB
  };
  // Limiter settings
  limiter?: {
    threshold: number;    // dB
    release: number;      // ms
    ceiling: number;      // dB
  };
  // Stereo enhancer
  stereo?: {
    width: number;        // 0 to 2
    midSideBalance: number;
  };
  // Saturation
  saturation?: {
    drive: number;        // 0 to 100
    mix: number;          // 0 to 100
    type: 'tape' | 'tube' | 'transistor';
  };
  // Additional effects
  reverb?: Record<string, number>;
  delay?: Record<string, number>;
}

/**
 * Input for creating a preset
 */
export interface CreatePresetInput {
  name: string;
  description?: string;
  type: 'mastering' | 'effect' | 'instrument' | 'mix';
  category?: string;
  isPublic?: boolean;
  settings: PresetSettings;
  tags?: string[];
}

/**
 * AI Generation request
 */
export interface GenerateRequest {
  prompt: string;
  duration?: string;    // "30s", "1m", "2m"
  style?: string;       // Genre or style hint
  key?: string;         // Musical key
  tempo?: number;       // BPM
  model?: string;       // Specific model to use
  provider?: 'demo' | 'replicate' | 'aiml-api' | 'elevenlabs'; // Explicit provider
  projectId?: string;   // Associate with project
  addToProject?: boolean; // Add as track to project
}

/**
 * AI Generation response
 */
export interface GenerateResponse {
  id: string;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  audioUrl?: string;
  waveformData?: number[];
  duration?: number;
  prompt: string;
  provider: string;
  costUSD?: number;
  trackId?: string;     // If added to project
  error?: string;
}

/**
 * Mastering request
 */
export interface MasterRequest {
  projectId?: string;
  audioUrl: string;     // Source audio URL
  presetId?: string;    // Use preset settings
  settings?: PresetSettings; // Custom settings (overrides preset)
  format?: 'wav' | 'mp3' | 'flac';
  sampleRate?: 44100 | 48000 | 96000;
  bitDepth?: 16 | 24 | 32;
}

/**
 * Mastering response
 */
export interface MasterResponse {
  id: string;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  masterUrl?: string;
  format: string;
  sampleRate: number;
  bitDepth: number;
  loudness?: {
    integrated: number;  // LUFS
    peak: number;        // dB
    range: number;       // LU
  };
  error?: string;
}

/**
 * User profile
 */
export interface User {
  id: string;
  org_id: string;
  email: string;
  name?: string;
  avatar_url?: string;
  role: 'admin' | 'editor' | 'viewer';
  settings?: {
    theme?: 'light' | 'dark' | 'system';
    defaultBpm?: number;
    defaultKey?: string;
    waveformColor?: string;
  };
  usage?: {
    projectCount: number;
    storageUsedMB: number;
    generationsThisMonth: number;
  };
  created_at: string;
  last_login?: string;
}

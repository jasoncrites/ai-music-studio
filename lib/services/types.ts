// Service layer type definitions

export interface ProviderConfig {
  apiKey?: string;
  baseUrl?: string;
  region?: string;
  maxConcurrent?: number;
  timeout?: number;
}

export interface GenerationRequest {
  prompt: string;
  duration?: string;     // "30s", "1m", "2m", etc.
  style?: string;        // Genre, mood, etc.
  key?: string;          // Musical key (C Min, F Maj, etc.)
  tempo?: number;        // BPM
  metadata?: Record<string, any>;
}

export interface GenerationResult {
  id: string;
  url: string;           // Signed URL to generated audio
  duration: number;      // Duration in seconds
  format: string;        // 'wav', 'mp3', etc.
  waveform?: number[];   // Waveform data for visualization
  metadata?: {
    prompt?: string;
    provider?: string;
    generatedAt?: string;
    costUSD?: number;
    gcsPath?: string;    // Cloud Storage path when stored
    storedAt?: string;   // Timestamp when stored to GCS
  };
}

export interface SeparationRequest {
  audioUrl: string;
  stems: StemType[];     // Which stems to extract
  userId?: string;
}

export interface SeparationResult {
  id: string;
  stems: {
    [key in StemType]?: {
      url: string;
      duration: number;
    };
  };
  costUSD?: number;
}

export type StemType =
  | 'vocals'
  | 'drums'
  | 'bass'
  | 'other'
  | 'piano'
  | 'guitar';

export interface ProviderStatus {
  available: boolean;
  latency?: number;      // Average response time in ms
  queueDepth?: number;   // Number of pending requests
  costPerMinute?: number;
}

export interface CostRecord {
  userId: string;
  provider: string;
  intent: string;
  duration: number;
  cost: number;
  timestamp: Date;
  requestId: string;
}

/**
 * Firestore Collection Schemas for AI Music Studio
 * Defines all document types and collection structure
 */

import { Timestamp, FieldValue } from 'firebase-admin/firestore';

// =============================================================================
// Common Types
// =============================================================================

export type SubscriptionTier = 'free' | 'pro' | 'studio' | 'enterprise';

export type ProjectStatus = 'draft' | 'active' | 'archived' | 'deleted';

export type GenerationStatus = 'pending' | 'processing' | 'completed' | 'failed' | 'cancelled';

export type GenerationType =
  | 'music'           // Full music generation
  | 'stem'            // Stem separation
  | 'mastering'       // AI mastering
  | 'vocal'           // Vocal synthesis
  | 'accompaniment'   // Accompaniment generation
  | 'remix';          // AI remix

// =============================================================================
// Collection: users/{userId}
// Artist profiles and subscription information
// =============================================================================

export interface UserDocument {
  // Identity
  id: string;
  orgId: string;                    // Multi-tenant organization ID
  email: string;
  displayName: string;
  photoUrl?: string;

  // Artist Profile
  artistName?: string;
  bio?: string;
  genres?: string[];
  socialLinks?: {
    spotify?: string;
    soundcloud?: string;
    youtube?: string;
    instagram?: string;
    twitter?: string;
    website?: string;
  };

  // Subscription & Billing
  subscription: {
    tier: SubscriptionTier;
    status: 'active' | 'cancelled' | 'past_due' | 'trialing';
    currentPeriodStart: Timestamp;
    currentPeriodEnd: Timestamp;
    stripeCustomerId?: string;
    stripeSubscriptionId?: string;
  };

  // Usage & Limits
  usage: {
    generationsThisMonth: number;
    storageUsedBytes: number;
    lastResetDate: Timestamp;
  };

  // Preferences
  preferences: {
    defaultTempo?: number;
    defaultKey?: string;
    defaultGenre?: string;
    emailNotifications: boolean;
    marketingEmails: boolean;
    theme: 'light' | 'dark' | 'system';
  };

  // Metadata
  createdAt: Timestamp;
  updatedAt: Timestamp;
  lastLoginAt?: Timestamp;
  isActive: boolean;
}

// Input type for creating users (without auto-generated fields)
export type CreateUserInput = Omit<UserDocument, 'id' | 'createdAt' | 'updatedAt'> & {
  id?: string;
};

// Input type for updating users
export type UpdateUserInput = Partial<Omit<UserDocument, 'id' | 'orgId' | 'createdAt'>>;

// =============================================================================
// Collection: projects/{projectId}
// Song projects with tracks and effects settings
// =============================================================================

export interface TrackDocument {
  id: string;
  name: string;
  order: number;

  // Audio source
  audioUrl?: string;              // Cloud Storage URL
  audioFileName?: string;
  duration: number;               // Duration in seconds

  // Audio properties
  volume: number;                 // -60 to 0 dB
  pan: number;                    // -1 (left) to 1 (right)
  muted: boolean;
  solo: boolean;

  // Regions/Clips (simplified for Firestore storage)
  regions: Array<{
    id: string;
    startTime: number;
    endTime: number;
    offsetInBuffer: number;
  }>;

  // Effects settings
  effects: {
    eq: {
      low: number;
      mid: number;
      high: number;
    };
    compression: {
      threshold: number;
      ratio: number;
      attack: number;
      release: number;
      knee: number;
    };
    reverb: {
      amount: number;
      duration: number;
      enabled: boolean;
    };
    tape: {
      enabled: boolean;
      drive: number;
      warmth: number;
      saturation: number;
      tapeSpeed: '7.5' | '15' | '30';
      tapeType: 'modern' | 'vintage';
      wowFlutter: number;
      hiss: number;
      preset?: string;
    };
    fetCompressor: {
      enabled: boolean;
      inputGain: number;
      outputGain: number;
      attack: number;
      release: number;
      ratio: '4' | '8' | '12' | '20' | 'all';
      mix: number;
      preset?: string;
    };
    optoCompressor: {
      enabled: boolean;
      peakReduction: number;
      gain: number;
      mode: 'compress' | 'limit';
      mix: number;
      emphasis: number;
      preset?: string;
    };
  };

  // UI state
  color: string;
  isCollapsed: boolean;

  // Source generation (if AI-generated)
  generationId?: string;

  // Waveform cache
  waveformData?: number[];
}

export interface ProjectDocument {
  // Identity
  id: string;
  orgId: string;                    // Multi-tenant organization ID
  userId: string;                   // Owner user ID

  // Project info
  name: string;
  description?: string;
  coverImageUrl?: string;
  tags?: string[];
  genre?: string;

  // Audio settings
  settings: {
    sampleRate: number;             // 44100, 48000, etc.
    bitDepth: number;               // 16, 24, 32
    tempo: number;                  // BPM
    timeSignature: string;          // "4/4", "3/4", etc.
    key?: string;                   // Musical key
  };

  // Master channel settings
  master: {
    volume: number;
    pan: number;
    limiterEnabled: boolean;
    limiterThreshold: number;
  };

  // Tracks (embedded for simplicity, or can be subcollection)
  tracks: TrackDocument[];

  // Project state
  status: ProjectStatus;
  version: number;                  // For conflict resolution

  // Collaboration
  collaborators?: Array<{
    userId: string;
    email: string;
    role: 'viewer' | 'editor' | 'admin';
    addedAt: Timestamp;
  }>;
  isPublic: boolean;

  // Export history
  exports?: Array<{
    id: string;
    format: 'wav' | 'mp3' | 'flac' | 'stems';
    url: string;
    createdAt: Timestamp;
    expiresAt?: Timestamp;
  }>;

  // Metadata
  createdAt: Timestamp;
  updatedAt: Timestamp;
  lastOpenedAt?: Timestamp;

  // Statistics
  stats?: {
    totalDuration: number;
    trackCount: number;
    generationCount: number;
    totalCostUSD: number;
  };
}

// Input types
export type CreateProjectInput = Omit<ProjectDocument, 'id' | 'createdAt' | 'updatedAt' | 'version'> & {
  id?: string;
};

export type UpdateProjectInput = Partial<Omit<ProjectDocument, 'id' | 'orgId' | 'userId' | 'createdAt'>>;

// =============================================================================
// Collection: generations/{genId}
// AI generation history and costs
// =============================================================================

export interface GenerationDocument {
  // Identity
  id: string;
  orgId: string;                    // Multi-tenant organization ID
  userId: string;
  projectId?: string;               // Optional - can be generated without project
  trackId?: string;                 // If added to a track

  // Generation type
  type: GenerationType;

  // Input parameters
  input: {
    prompt?: string;
    duration?: number;              // Requested duration in seconds
    style?: string;
    genre?: string;
    tempo?: number;
    key?: string;

    // For stem separation
    sourceAudioUrl?: string;
    stemsRequested?: Array<'vocals' | 'drums' | 'bass' | 'other' | 'piano' | 'guitar'>;

    // Additional parameters
    metadata?: Record<string, unknown>;
  };

  // Output
  output?: {
    audioUrl?: string;
    audioUrls?: Record<string, string>;  // For stems: { vocals: url, drums: url, ... }
    duration?: number;                    // Actual duration in seconds
    format?: string;
    waveformData?: number[];
  };

  // Provider info
  provider: {
    name: string;                   // e.g., 'replicate', 'suno', 'stable-audio'
    modelId: string;                // e.g., 'meta/musicgen-melody'
    version?: string;
  };

  // Status & timing
  status: GenerationStatus;
  queuedAt: Timestamp;
  startedAt?: Timestamp;
  completedAt?: Timestamp;

  // Cost tracking
  cost: {
    estimatedUSD: number;
    actualUSD?: number;
    credits?: number;               // If using internal credit system
  };

  // Error handling
  error?: {
    code: string;
    message: string;
    retryable: boolean;
    attempts: number;
  };

  // Metadata
  createdAt: Timestamp;
  updatedAt: Timestamp;

  // Request correlation
  requestId?: string;               // External request ID from provider
  correlationId?: string;           // Internal correlation ID
}

// Input types
export type CreateGenerationInput = Omit<GenerationDocument, 'id' | 'createdAt' | 'updatedAt' | 'status'> & {
  id?: string;
  status?: GenerationStatus;
};

export type UpdateGenerationInput = Partial<Omit<GenerationDocument, 'id' | 'orgId' | 'userId' | 'createdAt'>>;

// =============================================================================
// Collection: presets/{presetId}
// Shared effect presets
// =============================================================================

export type PresetType =
  | 'eq'
  | 'compression'
  | 'reverb'
  | 'tape'
  | 'fetCompressor'
  | 'optoCompressor'
  | 'channelStrip'      // Combined preset
  | 'master';           // Master chain preset

export interface PresetDocument {
  // Identity
  id: string;
  orgId: string;                    // Multi-tenant organization ID
  userId: string;                   // Creator

  // Preset info
  name: string;
  description?: string;
  type: PresetType;
  category?: string;                // e.g., 'vocals', 'drums', 'mixing', 'mastering'
  tags?: string[];

  // Settings (polymorphic based on type)
  settings: Record<string, unknown>;

  // Sharing
  isPublic: boolean;
  isOfficial: boolean;              // System/official preset

  // Usage stats
  usageCount: number;
  favoriteCount: number;

  // Rating
  rating?: {
    average: number;
    count: number;
  };

  // Metadata
  createdAt: Timestamp;
  updatedAt: Timestamp;

  // Preview audio (optional)
  previewAudioUrl?: string;

  // Versioning
  version: number;
  changelog?: string;
}

// Specific preset settings types
export interface EQPresetSettings {
  low: number;
  mid: number;
  high: number;
  lowFreq?: number;
  midFreq?: number;
  highFreq?: number;
  midQ?: number;
}

export interface CompressionPresetSettings {
  threshold: number;
  ratio: number;
  attack: number;
  release: number;
  knee: number;
  makeupGain?: number;
}

export interface ReverbPresetSettings {
  amount: number;
  duration: number;
  preDelay?: number;
  damping?: number;
  diffusion?: number;
}

export interface TapePresetSettings {
  drive: number;
  warmth: number;
  saturation: number;
  tapeSpeed: '7.5' | '15' | '30';
  tapeType: 'modern' | 'vintage';
  wowFlutter: number;
  hiss: number;
}

export interface FETCompressorPresetSettings {
  inputGain: number;
  outputGain: number;
  attack: number;
  release: number;
  ratio: '4' | '8' | '12' | '20' | 'all';
  mix: number;
}

export interface OptoCompressorPresetSettings {
  peakReduction: number;
  gain: number;
  mode: 'compress' | 'limit';
  mix: number;
  emphasis: number;
}

export interface ChannelStripPresetSettings {
  eq: EQPresetSettings;
  compression: CompressionPresetSettings;
  reverb?: ReverbPresetSettings;
  tape?: TapePresetSettings;
  fetCompressor?: FETCompressorPresetSettings;
  optoCompressor?: OptoCompressorPresetSettings;
}

// Input types
export type CreatePresetInput = Omit<PresetDocument, 'id' | 'createdAt' | 'updatedAt' | 'usageCount' | 'favoriteCount' | 'version'> & {
  id?: string;
};

export type UpdatePresetInput = Partial<Omit<PresetDocument, 'id' | 'orgId' | 'userId' | 'createdAt'>>;

// =============================================================================
// Collection Names
// =============================================================================

export const COLLECTIONS = {
  USERS: 'users',
  PROJECTS: 'projects',
  GENERATIONS: 'generations',
  PRESETS: 'presets',
} as const;

// =============================================================================
// Index Definitions (for reference - apply via Firebase console or CLI)
// =============================================================================

export const INDEXES = {
  // Projects by org and user
  PROJECTS_BY_ORG_USER: {
    collection: COLLECTIONS.PROJECTS,
    fields: ['orgId', 'userId', 'updatedAt'],
  },
  // Projects by org and status
  PROJECTS_BY_ORG_STATUS: {
    collection: COLLECTIONS.PROJECTS,
    fields: ['orgId', 'status', 'updatedAt'],
  },
  // Generations by org and user
  GENERATIONS_BY_ORG_USER: {
    collection: COLLECTIONS.GENERATIONS,
    fields: ['orgId', 'userId', 'createdAt'],
  },
  // Generations by project
  GENERATIONS_BY_PROJECT: {
    collection: COLLECTIONS.GENERATIONS,
    fields: ['orgId', 'projectId', 'createdAt'],
  },
  // Public presets
  PRESETS_PUBLIC: {
    collection: COLLECTIONS.PRESETS,
    fields: ['isPublic', 'type', 'usageCount'],
  },
  // User presets
  PRESETS_BY_USER: {
    collection: COLLECTIONS.PRESETS,
    fields: ['orgId', 'userId', 'type', 'updatedAt'],
  },
} as const;

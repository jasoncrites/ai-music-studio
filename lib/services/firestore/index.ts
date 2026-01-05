/**
 * Firestore Persistence Layer for AI Music Studio
 *
 * This module provides a complete Firestore-based persistence layer
 * with multi-tenant support for the AI Music Studio application.
 *
 * @example
 * ```typescript
 * import {
 *   initializeFirestore,
 *   getUserRepository,
 *   getProjectRepository,
 *   getGenerationRepository,
 *   getPresetRepository,
 * } from '@/lib/services/firestore';
 *
 * // Initialize Firestore (call once at app startup)
 * initializeFirestore();
 *
 * // Use repositories
 * const userRepo = getUserRepository();
 * const user = await userRepo.getById('user123');
 *
 * const projectRepo = getProjectRepository();
 * const projects = await projectRepo.listByUser('org123', 'user123');
 * ```
 */

// =============================================================================
// Client & Configuration
// =============================================================================

export {
  // Initialization
  initializeFirestore,
  getFirestoreClient,
  resetFirestore,

  // Multi-tenant support
  createTenantClient,
  type TenantContext,
  type FirestoreConfig,

  // Firestore types (re-exported)
  Firestore,
  DocumentReference,
  CollectionReference,
  Query,
  QuerySnapshot,
  DocumentSnapshot,
  WriteBatch,
  Transaction,
  FieldValue,
  Timestamp,
} from './client';

// =============================================================================
// Collection Schemas & Types
// =============================================================================

export {
  // Collection names
  COLLECTIONS,
  INDEXES,

  // Common types
  type SubscriptionTier,
  type ProjectStatus,
  type GenerationStatus,
  type GenerationType,
  type PresetType,

  // User types
  type UserDocument,
  type CreateUserInput,
  type UpdateUserInput,

  // Project types
  type ProjectDocument,
  type TrackDocument,
  type CreateProjectInput,
  type UpdateProjectInput,

  // Generation types
  type GenerationDocument,
  type CreateGenerationInput,
  type UpdateGenerationInput,

  // Preset types
  type PresetDocument,
  type CreatePresetInput,
  type UpdatePresetInput,

  // Preset settings types
  type EQPresetSettings,
  type CompressionPresetSettings,
  type ReverbPresetSettings,
  type TapePresetSettings,
  type FETCompressorPresetSettings,
  type OptoCompressorPresetSettings,
  type ChannelStripPresetSettings,
} from './collections';

// =============================================================================
// Repositories
// =============================================================================

export {
  // User Repository
  UserRepository,
  getUserRepository,
  resetUserRepository,

  // Project Repository
  ProjectRepository,
  getProjectRepository,
  resetProjectRepository,

  // Generation Repository
  GenerationRepository,
  getGenerationRepository,
  resetGenerationRepository,
  type GenerationStats,
  type CostSummary,

  // Preset Repository
  PresetRepository,
  getPresetRepository,
  resetPresetRepository,
} from './repositories';

// =============================================================================
// Utility Functions
// =============================================================================

/**
 * Reset all repository singletons (useful for testing)
 */
export function resetAllRepositories(): void {
  const { resetUserRepository } = require('./repositories/userRepo');
  const { resetProjectRepository } = require('./repositories/projectRepo');
  const { resetGenerationRepository } = require('./repositories/generationRepo');
  const { resetPresetRepository } = require('./repositories/presetRepo');

  resetUserRepository();
  resetProjectRepository();
  resetGenerationRepository();
  resetPresetRepository();
}

/**
 * Initialize Firestore and all repositories
 * Convenience function for application startup
 */
export function initializeFirestoreLayer(config?: import('./client').FirestoreConfig): void {
  const { initializeFirestore } = require('./client');
  initializeFirestore(config);
}

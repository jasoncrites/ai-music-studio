/**
 * Repository exports
 * Centralized access to all Firestore repositories
 */

// User Repository
export {
  UserRepository,
  getUserRepository,
  resetUserRepository,
} from './userRepo';

// Project Repository
export {
  ProjectRepository,
  getProjectRepository,
  resetProjectRepository,
} from './projectRepo';

// Generation Repository
export {
  GenerationRepository,
  getGenerationRepository,
  resetGenerationRepository,
  type GenerationStats,
  type CostSummary,
} from './generationRepo';

// Preset Repository
export {
  PresetRepository,
  getPresetRepository,
  resetPresetRepository,
} from './presetRepo';

// Research Repository
export {
  ResearchRepository,
  researchRepo,
  type MarketResearch,
  type CompetitorProfile,
  type FeatureInsight,
  type UserPersona,
} from './researchRepo';

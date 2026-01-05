import { ProviderFactory, ProviderType } from '../providers';
import { GenerationRequest, GenerationResult } from '../types';
import { StorageService } from './storage';

// Extended request to support explicit provider selection
interface GenerationRequestWithProvider extends GenerationRequest {
  provider?: 'demo' | 'replicate' | 'aiml-api' | 'elevenlabs';
}

/**
 * Audio Generation Service
 * Orchestrates AI music generation across multiple providers
 */
export class AudioGenerationService {
  /**
   * Generate music from text prompt
   * Handles provider selection, caching, and storage
   */
  static async execute(params: GenerationRequestWithProvider): Promise<{
    status: 'COMPLETED' | 'FAILED' | 'PENDING';
    data: GenerationResult | null;
    message?: string;
  }> {
    try {
      // 1. Validate request
      if (!params.prompt || params.prompt.trim().length === 0) {
        return {
          status: 'FAILED',
          data: null,
          message: 'Prompt is required',
        };
      }

      // 2. Check cache first (TODO: implement Firestore cache)
      // const cached = await this.checkCache(params);
      // if (cached) {
      //   return { status: 'COMPLETED', data: cached };
      // }

      // 3. Select provider - explicit choice or auto-select with fallback
      let provider;
      let lastError: Error | null = null;

      if (params.provider) {
        // Use explicit provider
        const providerType = params.provider as ProviderType;
        provider = ProviderFactory.getProvider(providerType);
        console.log(`[AudioGeneration] Using explicit provider: ${provider.getName()}`);
      } else {
        // Try quality-based selection first, with fallback to demo
        try {
          provider = await ProviderFactory.selectProvider('quality');
          console.log(`[AudioGeneration] Auto-selected provider: ${provider.getName()}`);
        } catch {
          provider = ProviderFactory.getProvider(ProviderType.DEMO);
          console.log(`[AudioGeneration] Fallback to demo provider`);
        }
      }

      // 4. Generate audio with fallback
      let result: GenerationResult;
      try {
        result = await provider.generate(params);
      } catch (error: any) {
        lastError = error;
        console.warn(`[AudioGeneration] Provider ${provider.getName()} failed:`, error.message);

        // Fallback to demo if not already using it
        if (provider.getName().toLowerCase() !== 'demo') {
          console.log(`[AudioGeneration] Falling back to demo provider`);
          const demoProvider = ProviderFactory.getProvider(ProviderType.DEMO);
          result = await demoProvider.generate(params);
        } else {
          throw error;
        }
      }

      console.log(`[AudioGeneration] Generated audio: ${result.id}`);

      // 5. Download and store in Cloud Storage
      const storedResult = await StorageService.storeGeneration(result, params);

      // 6. Cache result in Firestore (TODO)
      // await this.cacheResult(params, storedResult);

      return {
        status: 'COMPLETED',
        data: storedResult,
      };
    } catch (error: any) {
      console.error('[AudioGeneration] Error:', error);

      return {
        status: 'FAILED',
        data: null,
        message: error.message || 'Audio generation failed',
      };
    }
  }

  /**
   * Separate audio into stems
   */
  static async separate(params: {
    audioUrl: string;
    stems: string[];
    userId?: string;
  }): Promise<{
    status: 'COMPLETED' | 'FAILED';
    data: any;
    message?: string;
  }> {
    try {
      // Use Replicate provider for separation (Demucs model)
      const provider = ProviderFactory.getProvider(ProviderType.REPLICATE);

      const result = await provider.separate({
        audioUrl: params.audioUrl,
        stems: params.stems as any[],
        userId: params.userId,
      });

      // Store separated stems in Cloud Storage
      const stored = await StorageService.storeSeparation(result, params.userId);

      return {
        status: 'COMPLETED',
        data: stored,
      };
    } catch (error: any) {
      console.error('[AudioSeparation] Error:', error);

      return {
        status: 'FAILED',
        data: null,
        message: error.message || 'Audio separation failed',
      };
    }
  }

  /**
   * Get provider status information
   */
  static async getProviderStatus() {
    const providers = await ProviderFactory.getAvailableProviders();

    const statuses = await Promise.all(
      providers.map(async (p) => ({
        name: p.getName(),
        status: await p.getStatus(),
      }))
    );

    return statuses;
  }
}

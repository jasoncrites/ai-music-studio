import { BaseAudioProvider } from './base';
import { ReplicateProvider } from './replicate';
import { AIMLAPIProvider } from './aiml-api';
import { ElevenLabsProvider } from './elevenlabs';
import { DemoProvider } from './demo';
import { ProviderConfig } from '../types';

/**
 * Supported AI music providers
 */
export enum ProviderType {
  DEMO = 'demo',
  REPLICATE = 'replicate',
  AIML_API = 'aiml-api',
  ELEVENLABS = 'elevenlabs',
  VERTEX_AI = 'vertex-ai',
}

/**
 * Provider factory - creates and manages provider instances
 */
export class ProviderFactory {
  private static providers: Map<ProviderType, BaseAudioProvider> = new Map();

  /**
   * Get or create a provider instance
   */
  static getProvider(type: ProviderType, config?: ProviderConfig): BaseAudioProvider {
    // Check if provider already exists
    if (this.providers.has(type)) {
      return this.providers.get(type)!;
    }

    // Create new provider
    let provider: BaseAudioProvider;

    switch (type) {
      case ProviderType.DEMO:
        provider = new DemoProvider(config || {});
        break;

      case ProviderType.REPLICATE:
        provider = new ReplicateProvider(config || {
          apiKey: process.env.REPLICATE_API_TOKEN,
        });
        break;

      case ProviderType.AIML_API:
        provider = new AIMLAPIProvider(config || {
          apiKey: process.env.AIML_API_KEY,
        });
        break;

      case ProviderType.ELEVENLABS:
        provider = new ElevenLabsProvider(config || {
          apiKey: process.env.ELEVENLABS_API_KEY,
        });
        break;

      case ProviderType.VERTEX_AI:
        // TODO: Implement Vertex AI provider
        throw new Error('Vertex AI provider not yet implemented');

      default:
        throw new Error(`Unknown provider type: ${type}`);
    }

    // Cache the provider
    this.providers.set(type, provider);
    return provider;
  }

  /**
   * Get all available providers
   */
  static async getAvailableProviders(): Promise<BaseAudioProvider[]> {
    const providers: BaseAudioProvider[] = [];

    // Try to create each provider type
    for (const type of Object.values(ProviderType)) {
      try {
        const provider = this.getProvider(type as ProviderType);
        const available = await provider.isAvailable();
        if (available) {
          providers.push(provider);
        }
      } catch {
        // Provider not available, skip
      }
    }

    return providers;
  }

  /**
   * Select best provider based on criteria
   * @param criteria Selection criteria (cost, latency, quality)
   */
  static async selectProvider(
    criteria: 'cost' | 'latency' | 'quality' = 'cost'
  ): Promise<BaseAudioProvider> {
    const available = await this.getAvailableProviders();

    if (available.length === 0) {
      throw new Error('No audio providers available');
    }

    if (criteria === 'cost') {
      // Get cost estimates for 60 seconds
      const costs = await Promise.all(
        available.map(async (p) => ({
          provider: p,
          cost: await p.estimateCost(60),
        }))
      );

      // Sort by cost (lowest first)
      costs.sort((a, b) => a.cost - b.cost);
      return costs[0].provider;
    }

    if (criteria === 'latency') {
      // Get status for all providers
      const statuses = await Promise.all(
        available.map(async (p) => ({
          provider: p,
          status: await p.getStatus(),
        }))
      );

      // Sort by latency (lowest first)
      statuses.sort((a, b) => (a.status.latency || 999999) - (b.status.latency || 999999));
      return statuses[0].provider;
    }

    // Default quality order: ElevenLabs > AI/ML API > Replicate > Vertex AI > Demo
    const qualityOrder = [
      ProviderType.ELEVENLABS,
      ProviderType.AIML_API,
      ProviderType.REPLICATE,
      ProviderType.VERTEX_AI,
      ProviderType.DEMO, // Fallback to demo if no API keys
    ];

    for (const type of qualityOrder) {
      const provider = available.find((p) => p.getName().toLowerCase() === type);
      if (provider) return provider;
    }

    // Fallback to first available
    return available[0];
  }

  /**
   * Clear provider cache (useful for testing)
   */
  static clearCache(): void {
    this.providers.clear();
  }
}

// Export all providers
export { BaseAudioProvider } from './base';
export { ReplicateProvider } from './replicate';
export { AIMLAPIProvider } from './aiml-api';
export { ElevenLabsProvider } from './elevenlabs';
export { DemoProvider } from './demo';

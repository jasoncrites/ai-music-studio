import Replicate from 'replicate';
import { BaseAudioProvider } from './base';
import {
  ProviderConfig,
  GenerationRequest,
  GenerationResult,
  SeparationRequest,
  SeparationResult,
  ProviderStatus
} from '../types';

/**
 * Replicate provider for AI music generation and audio separation
 * Uses MusicGen for generation and Demucs for stem separation
 */
export class ReplicateProvider extends BaseAudioProvider {
  private client: Replicate;

  // Model versions
  private readonly MUSICGEN_MODEL = 'meta/musicgen:671ac645ce5e552cc63a54a2bbff63fcf798043055d2dac5fc9e36a837eedcfb';
  private readonly DEMUCS_MODEL = 'cjwbw/demucs:1d37c0b8c38b8c0ca6a8094d7e12c1b8c6a5094a5e12c1b8c6a5094a5e12c1b8';

  constructor(config: ProviderConfig) {
    super('Replicate', config);

    this.client = new Replicate({
      auth: config.apiKey || process.env.REPLICATE_API_TOKEN,
    });
  }

  async generate(request: GenerationRequest): Promise<GenerationResult> {
    const durationSeconds = this.parseDuration(request.duration);

    try {
      // Run MusicGen model
      const output = await this.client.run(this.MUSICGEN_MODEL, {
        input: {
          prompt: request.prompt,
          model_version: 'melody',  // or 'large', 'medium', 'small'
          duration: durationSeconds,
          temperature: 1.0,
          top_k: 250,
          top_p: 0.0,
          classifier_free_guidance: 3.0,
        },
      });

      // Replicate returns audio URL directly
      const audioUrl = Array.isArray(output) ? output[0] : (output as unknown as string);

      if (!audioUrl || typeof audioUrl !== 'string') {
        throw new Error('Invalid response from Replicate');
      }

      // Generate unique ID
      const id = `replicate-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

      // Calculate cost (Replicate charges per second)
      const costUSD = await this.estimateCost(durationSeconds);

      return {
        id,
        url: audioUrl,
        duration: durationSeconds,
        format: 'wav',
        metadata: {
          prompt: request.prompt,
          provider: this.name,
          generatedAt: new Date().toISOString(),
          costUSD,
        },
      };
    } catch (error: any) {
      throw new Error(`Replicate generation failed: ${error.message}`);
    }
  }

  async separate(request: SeparationRequest): Promise<SeparationResult> {
    try {
      // Run Demucs model for stem separation
      const output = await this.client.run(this.DEMUCS_MODEL, {
        input: {
          audio: request.audioUrl,
          // Demucs separates into: vocals, drums, bass, other
        },
      });

      const stems = output as { [key: string]: string };

      // Transform to our format
      const result: SeparationResult = {
        id: `sep-${Date.now()}`,
        stems: {},
      };

      for (const stemType of request.stems) {
        if (stems[stemType]) {
          result.stems[stemType] = {
            url: stems[stemType],
            duration: 0, // Duration info not provided by Demucs
          };
        }
      }

      // Estimate cost (typically $0.05 per separation)
      result.costUSD = 0.05;

      return result;
    } catch (error: any) {
      throw new Error(`Replicate separation failed: ${error.message}`);
    }
  }

  async estimateCost(durationSeconds: number): Promise<number> {
    // Replicate MusicGen costs approximately $0.00035 per second
    return durationSeconds * 0.00035;
  }

  async isAvailable(): Promise<boolean> {
    try {
      // Check if API key is configured
      const apiKey = this.config.apiKey || process.env.REPLICATE_API_TOKEN;
      if (!apiKey || !this.client) {
        console.log('[Replicate] No API key configured');
        return false;
      }

      // Simple availability check - client is ready
      console.log('[Replicate] API key configured - provider available');
      return true;
    } catch {
      return false;
    }
  }

  async getStatus(): Promise<ProviderStatus> {
    const available = await this.isAvailable();

    return {
      available,
      latency: 15000,  // MusicGen typically takes 15-30s
      queueDepth: 0,   // Replicate handles queuing internally
      costPerMinute: 0.021, // $0.00035 * 60
    };
  }
}

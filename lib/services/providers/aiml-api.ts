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
 * AI/ML API Provider
 * High-quality AI music generation via AI/ML API
 * https://aimlapi.com/
 */
export class AIMLAPIProvider extends BaseAudioProvider {
  private readonly baseUrl = 'https://api.aimlapi.com/v1';

  constructor(config: ProviderConfig) {
    super('AI/ML API', config);

    if (!config.apiKey && !process.env.AIML_API_KEY) {
      console.warn('[AIML] No API key configured');
    }
  }

  async generate(request: GenerationRequest): Promise<GenerationResult> {
    const apiKey = this.config.apiKey || process.env.AIML_API_KEY;

    if (!apiKey) {
      throw new Error('AI/ML API key not configured');
    }

    const durationSeconds = this.parseDuration(request.duration);

    try {
      // AI/ML API endpoint for music generation
      const response = await fetch(`${this.baseUrl}/generate/audio/suno-ai/v3`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          prompt: request.prompt,
          make_instrumental: false,
          model: 'chirp-v3-5',
          wait_audio: true,
        }),
      });

      if (!response.ok) {
        const error = await response.text();
        throw new Error(`AI/ML API error: ${response.status} - ${error}`);
      }

      const data = await response.json();

      // AI/ML API returns task with audio URL
      const audioUrl = data.audio_url || data.url;

      if (!audioUrl) {
        throw new Error('No audio URL in AI/ML API response');
      }

      const id = `aiml-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
      const costUSD = await this.estimateCost(durationSeconds);

      return {
        id,
        url: audioUrl,
        duration: durationSeconds,
        format: 'mp3',
        metadata: {
          prompt: request.prompt,
          provider: this.name,
          generatedAt: new Date().toISOString(),
          costUSD,
        },
      };
    } catch (error: any) {
      throw new Error(`AI/ML API generation failed: ${error.message}`);
    }
  }

  async separate(request: SeparationRequest): Promise<SeparationResult> {
    // AI/ML API doesn't currently support separation
    // Fall back to Replicate provider
    throw new Error('Audio separation not supported by AI/ML API');
  }

  async estimateCost(durationSeconds: number): Promise<number> {
    // AI/ML API pricing: approximately $0.15 per generation (30-120s)
    // Estimate: $0.002 per second
    return durationSeconds * 0.002;
  }

  async isAvailable(): Promise<boolean> {
    const apiKey = this.config.apiKey || process.env.AIML_API_KEY;
    return !!apiKey;
  }

  async getStatus(): Promise<ProviderStatus> {
    const available = await this.isAvailable();

    return {
      available,
      latency: 30000, // Typically 30-60s for music generation
      queueDepth: 0,
      costPerMinute: 0.12, // $0.002 * 60
    };
  }
}

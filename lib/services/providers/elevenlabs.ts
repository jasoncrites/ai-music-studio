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
 * ElevenLabs Music Provider
 * High-fidelity AI music generation via ElevenLabs
 * https://elevenlabs.io/
 */
export class ElevenLabsProvider extends BaseAudioProvider {
  private readonly baseUrl = 'https://api.elevenlabs.io/v1';

  constructor(config: ProviderConfig) {
    super('ElevenLabs', config);

    if (!config.apiKey && !process.env.ELEVENLABS_API_KEY) {
      console.warn('[ElevenLabs] No API key configured');
    }
  }

  async generate(request: GenerationRequest): Promise<GenerationResult> {
    const apiKey = this.config.apiKey || process.env.ELEVENLABS_API_KEY;

    if (!apiKey) {
      throw new Error('ElevenLabs API key not configured');
    }

    const durationSeconds = this.parseDuration(request.duration);

    try {
      // ElevenLabs Music Generation API
      // Note: This is a placeholder - actual endpoint may differ
      // ElevenLabs primarily does voice/speech, music API may be different
      const response = await fetch(`${this.baseUrl}/music/generate`, {
        method: 'POST',
        headers: {
          'xi-api-key': apiKey,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          text: request.prompt,
          duration_seconds: durationSeconds,
          style: request.style,
        }),
      });

      if (!response.ok) {
        const error = await response.text();
        throw new Error(`ElevenLabs error: ${response.status} - ${error}`);
      }

      // ElevenLabs typically returns audio directly
      const audioBuffer = await response.arrayBuffer();

      // Convert to data URL or upload to storage
      const blob = new Blob([audioBuffer], { type: 'audio/mpeg' });
      const audioUrl = URL.createObjectURL(blob);

      const id = `elevenlabs-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
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
      throw new Error(`ElevenLabs generation failed: ${error.message}`);
    }
  }

  async separate(request: SeparationRequest): Promise<SeparationResult> {
    // ElevenLabs doesn't support audio separation
    throw new Error('Audio separation not supported by ElevenLabs');
  }

  async estimateCost(durationSeconds: number): Promise<number> {
    // ElevenLabs pricing estimate: ~$0.30 per minute
    // $0.005 per second
    return (durationSeconds / 60) * 0.30;
  }

  async isAvailable(): Promise<boolean> {
    const apiKey = this.config.apiKey || process.env.ELEVENLABS_API_KEY;

    if (!apiKey) {
      return false;
    }

    try {
      // Check API key validity with user info endpoint
      const response = await fetch(`${this.baseUrl}/user`, {
        headers: {
          'xi-api-key': apiKey,
        },
      });

      return response.ok;
    } catch {
      return false;
    }
  }

  async getStatus(): Promise<ProviderStatus> {
    const available = await this.isAvailable();

    return {
      available,
      latency: 20000, // Typically 20-40s
      queueDepth: 0,
      costPerMinute: 0.30,
    };
  }
}

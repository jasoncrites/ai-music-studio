import {
  ProviderConfig,
  GenerationRequest,
  GenerationResult,
  SeparationRequest,
  SeparationResult,
  ProviderStatus
} from '../types';

/**
 * Abstract base class for AI music generation providers.
 * All provider implementations must extend this class.
 */
export abstract class BaseAudioProvider {
  protected config: ProviderConfig;
  protected name: string;

  constructor(name: string, config: ProviderConfig) {
    this.name = name;
    this.config = config;
  }

  /**
   * Generate music from text prompt
   */
  abstract generate(request: GenerationRequest): Promise<GenerationResult>;

  /**
   * Separate audio into stems (vocals, drums, bass, etc.)
   */
  abstract separate(request: SeparationRequest): Promise<SeparationResult>;

  /**
   * Estimate cost for a given duration
   * @param durationSeconds Duration in seconds
   * @returns Estimated cost in USD
   */
  abstract estimateCost(durationSeconds: number): Promise<number>;

  /**
   * Check if provider is currently available
   */
  abstract isAvailable(): Promise<boolean>;

  /**
   * Get provider status (availability, latency, queue depth)
   */
  abstract getStatus(): Promise<ProviderStatus>;

  /**
   * Get provider name
   */
  getName(): string {
    return this.name;
  }

  /**
   * Parse duration string to seconds
   * @param duration Duration string like "30s", "1m", "2m30s"
   * @returns Duration in seconds
   */
  protected parseDuration(duration?: string): number {
    if (!duration) return 30; // Default 30 seconds

    const minutesMatch = duration.match(/(\d+)m/);
    const secondsMatch = duration.match(/(\d+)s/);

    const minutes = minutesMatch ? parseInt(minutesMatch[1]) : 0;
    const seconds = secondsMatch ? parseInt(secondsMatch[1]) : 0;

    return minutes * 60 + seconds;
  }

  /**
   * Format duration in seconds to human-readable string
   */
  protected formatDuration(seconds: number): string {
    if (seconds < 60) return `${seconds}s`;
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return secs > 0 ? `${mins}m${secs}s` : `${mins}m`;
  }
}

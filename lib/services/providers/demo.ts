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
 * Demo Provider
 * Generates synthetic audio for testing without API keys
 * Creates simple tones and beats using Web Audio API
 */
export class DemoProvider extends BaseAudioProvider {
  constructor(config: ProviderConfig = {}) {
    super('Demo', config);
  }

  async generate(request: GenerationRequest): Promise<GenerationResult> {
    const durationSeconds = this.parseDuration(request.duration);

    console.log('[Demo] Generating synthetic audio:', request.prompt);

    // Simulate API delay
    await new Promise((resolve) => setTimeout(resolve, 2000));

    // Return a demo audio URL (will be generated client-side)
    // Store parameters in the URL for client to use
    const params = new URLSearchParams({
      duration: durationSeconds.toString(),
      prompt: request.prompt,
      type: 'demo',
    });

    const audioUrl = `demo://generate?${params.toString()}`;

    const id = `demo-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

    return {
      id,
      url: audioUrl,
      duration: durationSeconds,
      format: 'wav',
      waveform: this.generateDemoWaveform(100),
      metadata: {
        prompt: request.prompt,
        provider: this.name,
        generatedAt: new Date().toISOString(),
        costUSD: 0, // Demo is free!
      },
    };
  }

  async separate(request: SeparationRequest): Promise<SeparationResult> {
    console.log('[Demo] Simulating stem separation');

    // Simulate processing time
    await new Promise((resolve) => setTimeout(resolve, 3000));

    const result: SeparationResult = {
      id: `sep-demo-${Date.now()}`,
      stems: {},
      costUSD: 0,
    };

    // Generate demo stems
    for (const stemType of request.stems) {
      const audioUrl = await this.generateSyntheticAudio(30, `${stemType} stem`);
      result.stems[stemType] = {
        url: audioUrl,
        duration: 30,
      };
    }

    return result;
  }

  /**
   * Generate synthetic audio using Web Audio API
   */
  private async generateSyntheticAudio(
    durationSeconds: number,
    prompt: string
  ): Promise<string> {
    // Create offline audio context
    const sampleRate = 44100;
    const numberOfChannels = 2;
    const length = sampleRate * durationSeconds;

    const offlineContext = new OfflineAudioContext(
      numberOfChannels,
      length,
      sampleRate
    );

    // Analyze prompt for musical characteristics
    const hasBass = /bass|low|deep|sub/i.test(prompt);
    const hasDrums = /drum|beat|percussion|rhythm/i.test(prompt);
    const hasSynth = /synth|lead|melody|electronic/i.test(prompt);
    const isFast = /fast|upbeat|energetic|dance/i.test(prompt);

    const tempo = isFast ? 140 : 100; // BPM
    const beatInterval = 60 / tempo;

    // Create beat pattern
    for (let time = 0; time < durationSeconds; time += beatInterval) {
      if (hasDrums) {
        // Kick drum
        this.createKick(offlineContext, time, 0.8);

        // Snare every other beat
        if (Math.floor(time / beatInterval) % 2 === 1) {
          this.createSnare(offlineContext, time, 0.6);
        }

        // Hi-hat
        for (let i = 0; i < 4; i++) {
          this.createHiHat(
            offlineContext,
            time + (beatInterval / 4) * i,
            0.3
          );
        }
      }
    }

    // Bass line
    if (hasBass) {
      const bassNotes = [110, 116.54, 123.47, 130.81]; // A2, A#2, B2, C3
      for (let time = 0; time < durationSeconds; time += beatInterval) {
        const note = bassNotes[Math.floor(time / beatInterval) % bassNotes.length];
        this.createBass(offlineContext, time, note, beatInterval * 0.9, 0.4);
      }
    }

    // Synth melody
    if (hasSynth) {
      const synthNotes = [440, 493.88, 554.37, 587.33, 659.25]; // A4-E5
      for (let time = 0; time < durationSeconds; time += beatInterval * 2) {
        const note = synthNotes[Math.floor(Math.random() * synthNotes.length)];
        this.createSynth(offlineContext, time, note, beatInterval * 1.5, 0.3);
      }
    }

    // Render audio
    const renderedBuffer = await offlineContext.startRendering();

    // Convert to WAV data URL
    const wavBlob = this.audioBufferToWav(renderedBuffer);
    return URL.createObjectURL(wavBlob);
  }

  /**
   * Create kick drum sound
   */
  private createKick(
    context: OfflineAudioContext,
    time: number,
    volume: number
  ): void {
    const osc = context.createOscillator();
    const gain = context.createGain();

    osc.frequency.setValueAtTime(150, time);
    osc.frequency.exponentialRampToValueAtTime(0.01, time + 0.5);

    gain.gain.setValueAtTime(volume, time);
    gain.gain.exponentialRampToValueAtTime(0.01, time + 0.5);

    osc.connect(gain);
    gain.connect(context.destination);

    osc.start(time);
    osc.stop(time + 0.5);
  }

  /**
   * Create snare sound
   */
  private createSnare(
    context: OfflineAudioContext,
    time: number,
    volume: number
  ): void {
    const noise = context.createBufferSource();
    const noiseBuffer = context.createBuffer(
      1,
      context.sampleRate * 0.2,
      context.sampleRate
    );
    const data = noiseBuffer.getChannelData(0);

    for (let i = 0; i < data.length; i++) {
      data[i] = Math.random() * 2 - 1;
    }

    noise.buffer = noiseBuffer;

    const filter = context.createBiquadFilter();
    filter.type = 'highpass';
    filter.frequency.value = 1000;

    const gain = context.createGain();
    gain.gain.setValueAtTime(volume, time);
    gain.gain.exponentialRampToValueAtTime(0.01, time + 0.2);

    noise.connect(filter);
    filter.connect(gain);
    gain.connect(context.destination);

    noise.start(time);
    noise.stop(time + 0.2);
  }

  /**
   * Create hi-hat sound
   */
  private createHiHat(
    context: OfflineAudioContext,
    time: number,
    volume: number
  ): void {
    const noise = context.createBufferSource();
    const noiseBuffer = context.createBuffer(
      1,
      context.sampleRate * 0.05,
      context.sampleRate
    );
    const data = noiseBuffer.getChannelData(0);

    for (let i = 0; i < data.length; i++) {
      data[i] = Math.random() * 2 - 1;
    }

    noise.buffer = noiseBuffer;

    const filter = context.createBiquadFilter();
    filter.type = 'highpass';
    filter.frequency.value = 7000;

    const gain = context.createGain();
    gain.gain.setValueAtTime(volume, time);
    gain.gain.exponentialRampToValueAtTime(0.01, time + 0.05);

    noise.connect(filter);
    filter.connect(gain);
    gain.connect(context.destination);

    noise.start(time);
    noise.stop(time + 0.05);
  }

  /**
   * Create bass tone
   */
  private createBass(
    context: OfflineAudioContext,
    time: number,
    frequency: number,
    duration: number,
    volume: number
  ): void {
    const osc = context.createOscillator();
    const gain = context.createGain();

    osc.type = 'sawtooth';
    osc.frequency.value = frequency;

    gain.gain.setValueAtTime(volume, time);
    gain.gain.exponentialRampToValueAtTime(0.01, time + duration);

    osc.connect(gain);
    gain.connect(context.destination);

    osc.start(time);
    osc.stop(time + duration);
  }

  /**
   * Create synth tone
   */
  private createSynth(
    context: OfflineAudioContext,
    time: number,
    frequency: number,
    duration: number,
    volume: number
  ): void {
    const osc = context.createOscillator();
    const gain = context.createGain();

    osc.type = 'square';
    osc.frequency.value = frequency;

    gain.gain.setValueAtTime(0, time);
    gain.gain.linearRampToValueAtTime(volume, time + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.01, time + duration);

    osc.connect(gain);
    gain.connect(context.destination);

    osc.start(time);
    osc.stop(time + duration);
  }

  /**
   * Convert AudioBuffer to WAV blob
   */
  private audioBufferToWav(buffer: AudioBuffer): Blob {
    const length = buffer.length * buffer.numberOfChannels * 2;
    const arrayBuffer = new ArrayBuffer(44 + length);
    const view = new DataView(arrayBuffer);

    // WAV header
    const writeString = (offset: number, string: string) => {
      for (let i = 0; i < string.length; i++) {
        view.setUint8(offset + i, string.charCodeAt(i));
      }
    };

    writeString(0, 'RIFF');
    view.setUint32(4, 36 + length, true);
    writeString(8, 'WAVE');
    writeString(12, 'fmt ');
    view.setUint32(16, 16, true);
    view.setUint16(20, 1, true);
    view.setUint16(22, buffer.numberOfChannels, true);
    view.setUint32(24, buffer.sampleRate, true);
    view.setUint32(28, buffer.sampleRate * buffer.numberOfChannels * 2, true);
    view.setUint16(32, buffer.numberOfChannels * 2, true);
    view.setUint16(34, 16, true);
    writeString(36, 'data');
    view.setUint32(40, length, true);

    // Audio data
    let offset = 44;
    for (let i = 0; i < buffer.length; i++) {
      for (let channel = 0; channel < buffer.numberOfChannels; channel++) {
        const sample = Math.max(-1, Math.min(1, buffer.getChannelData(channel)[i]));
        view.setInt16(offset, sample * 0x7fff, true);
        offset += 2;
      }
    }

    return new Blob([arrayBuffer], { type: 'audio/wav' });
  }

  /**
   * Generate demo waveform data
   */
  private generateDemoWaveform(points: number): number[] {
    const waveform: number[] = [];
    for (let i = 0; i < points; i++) {
      const x = (i / points) * Math.PI * 4;
      const value = (Math.sin(x) + Math.sin(x * 2) * 0.5 + Math.sin(x * 4) * 0.25) * 40 + 50;
      waveform.push(Math.max(0, Math.min(100, value)));
    }
    return waveform;
  }

  async estimateCost(durationSeconds: number): Promise<number> {
    return 0; // Demo is free!
  }

  async isAvailable(): Promise<boolean> {
    return true; // Always available
  }

  async getStatus(): Promise<ProviderStatus> {
    return {
      available: true,
      latency: 2000, // 2 seconds
      queueDepth: 0,
      costPerMinute: 0,
    };
  }
}

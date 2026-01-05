import { NextRequest } from 'next/server';
import { TenantCollection, SharedCollection } from '@/lib/firestore/client';
import {
  requireOrgId,
  getUserId,
  parseBody,
  successResponse,
  errorResponse,
  logRequest,
  logError,
  handleOptions,
} from '@/lib/api/middleware';
import { MasterRequest, MasterResponse, Preset, PresetSettings } from '@/lib/api/types';

const CONTEXT = 'api/master';

/**
 * POST /api/master
 * Apply mastering chain to audio
 *
 * Note: This is a simulation endpoint. In production, this would call
 * a dedicated audio processing service (e.g., Cloud Run with ffmpeg/sox)
 */
export async function POST(request: NextRequest) {
  try {
    // Validate org_id
    const authResult = requireOrgId(request);
    if ('json' in authResult) return authResult;
    const { orgId } = authResult;

    logRequest(request, orgId, CONTEXT);

    // Get user ID
    const userId = getUserId(request);

    // Parse request body
    const body = await parseBody<MasterRequest>(request);
    if (!body) {
      return errorResponse('Invalid JSON body', 400, 'INVALID_BODY');
    }

    // Validate required fields
    if (!body.audioUrl) {
      return errorResponse('Audio URL is required', 400, 'MISSING_AUDIO_URL');
    }

    // Validate audio URL format
    if (!isValidAudioUrl(body.audioUrl)) {
      return errorResponse('Invalid audio URL format', 400, 'INVALID_AUDIO_URL');
    }

    // Get settings from preset or custom settings
    let settings: PresetSettings | undefined = body.settings;

    if (body.presetId && !settings) {
      // Load preset from Firestore
      const preset = await loadPreset(orgId, body.presetId);
      if (!preset) {
        return errorResponse('Preset not found', 404, 'PRESET_NOT_FOUND');
      }
      settings = preset.settings;
    }

    if (!settings) {
      // Use default mastering settings
      settings = getDefaultMasteringSettings();
    }

    // Validate settings
    const validationError = validateMasteringSettings(settings);
    if (validationError) {
      return errorResponse(validationError, 400, 'INVALID_SETTINGS');
    }

    // Validate output format
    const format = body.format || 'wav';
    const validFormats = ['wav', 'mp3', 'flac'];
    if (!validFormats.includes(format)) {
      return errorResponse(
        `Invalid format. Must be one of: ${validFormats.join(', ')}`,
        400,
        'INVALID_FORMAT'
      );
    }

    const sampleRate = body.sampleRate || 44100;
    const validSampleRates = [44100, 48000, 96000];
    if (!validSampleRates.includes(sampleRate)) {
      return errorResponse(
        `Invalid sample rate. Must be one of: ${validSampleRates.join(', ')}`,
        400,
        'INVALID_SAMPLE_RATE'
      );
    }

    const bitDepth = body.bitDepth || 24;
    const validBitDepths = [16, 24, 32];
    if (!validBitDepths.includes(bitDepth)) {
      return errorResponse(
        `Invalid bit depth. Must be one of: ${validBitDepths.join(', ')}`,
        400,
        'INVALID_BIT_DEPTH'
      );
    }

    console.log(`[Master] Starting mastering for org: ${orgId}`, {
      audioUrl: body.audioUrl.substring(0, 50),
      presetId: body.presetId,
      format,
      sampleRate,
      bitDepth,
    });

    // Generate mastering job ID
    const jobId = `master-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

    // In production, this would queue a job to a Cloud Run service
    // For now, we simulate the mastering process
    const masterResult = await simulateMastering(body.audioUrl, settings, {
      format,
      sampleRate,
      bitDepth,
    });

    // Build response
    const response: MasterResponse = {
      id: jobId,
      status: 'completed',
      masterUrl: masterResult.url,
      format,
      sampleRate,
      bitDepth,
      loudness: masterResult.loudness,
    };

    // Log mastering job
    await logMasteringJob(orgId, userId, body, response);

    return successResponse(response);
  } catch (error) {
    logError(error as Error, request, CONTEXT);
    return errorResponse(
      'Failed to apply mastering',
      500,
      'INTERNAL_ERROR',
      process.env.NODE_ENV === 'development' ? (error as Error).message : undefined
    );
  }
}

/**
 * OPTIONS /api/master
 * Handle CORS preflight
 */
export async function OPTIONS() {
  return handleOptions();
}

/**
 * Validate audio URL
 */
function isValidAudioUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    // Allow http/https and data URLs
    return ['http:', 'https:', 'data:'].includes(parsed.protocol);
  } catch {
    return false;
  }
}

/**
 * Load preset from tenant or shared collection
 */
async function loadPreset(orgId: string, presetId: string): Promise<Preset | null> {
  // Try tenant-specific presets first
  const tenantCollection = new TenantCollection(orgId, 'presets');
  let preset = await tenantCollection.get<Preset>(presetId);

  if (!preset) {
    // Try shared/public presets
    const sharedCollection = new SharedCollection('shared_presets');
    preset = await sharedCollection.get<Preset>(presetId);
  }

  return preset;
}

/**
 * Get default mastering settings
 */
function getDefaultMasteringSettings(): PresetSettings {
  return {
    eq: {
      lowGain: 0,
      lowFreq: 80,
      midGain: 0,
      midFreq: 1000,
      midQ: 0.7,
      highGain: 0,
      highFreq: 10000,
    },
    compressor: {
      threshold: -18,
      ratio: 4,
      attack: 10,
      release: 100,
      knee: 6,
      makeupGain: 0,
    },
    limiter: {
      threshold: -1,
      release: 50,
      ceiling: -0.3,
    },
    stereo: {
      width: 1,
      midSideBalance: 0,
    },
  };
}

/**
 * Validate mastering settings
 */
function validateMasteringSettings(settings: PresetSettings): string | null {
  // Validate EQ
  if (settings.eq) {
    const { lowGain, midGain, highGain } = settings.eq;
    if (lowGain !== undefined && (lowGain < -12 || lowGain > 12)) {
      return 'EQ gain must be between -12 and 12 dB';
    }
    if (midGain !== undefined && (midGain < -12 || midGain > 12)) {
      return 'EQ gain must be between -12 and 12 dB';
    }
    if (highGain !== undefined && (highGain < -12 || highGain > 12)) {
      return 'EQ gain must be between -12 and 12 dB';
    }
  }

  // Validate compressor
  if (settings.compressor) {
    const { threshold, ratio, attack, release } = settings.compressor;
    if (threshold !== undefined && (threshold < -60 || threshold > 0)) {
      return 'Compressor threshold must be between -60 and 0 dB';
    }
    if (ratio !== undefined && (ratio < 1 || ratio > 20)) {
      return 'Compressor ratio must be between 1:1 and 20:1';
    }
    if (attack !== undefined && (attack < 0.1 || attack > 100)) {
      return 'Compressor attack must be between 0.1 and 100 ms';
    }
    if (release !== undefined && (release < 10 || release > 1000)) {
      return 'Compressor release must be between 10 and 1000 ms';
    }
  }

  // Validate limiter
  if (settings.limiter) {
    const { threshold, ceiling } = settings.limiter;
    if (threshold !== undefined && (threshold < -20 || threshold > 0)) {
      return 'Limiter threshold must be between -20 and 0 dB';
    }
    if (ceiling !== undefined && (ceiling < -3 || ceiling > 0)) {
      return 'Limiter ceiling must be between -3 and 0 dB';
    }
  }

  return null;
}

/**
 * Simulate mastering process (placeholder for actual audio processing)
 */
async function simulateMastering(
  audioUrl: string,
  settings: PresetSettings,
  options: { format: string; sampleRate: number; bitDepth: number }
): Promise<{
  url: string;
  loudness: { integrated: number; peak: number; range: number };
}> {
  // In production, this would:
  // 1. Download the audio file
  // 2. Apply EQ, compression, limiting using a audio processing library
  // 3. Analyze loudness using ITU-R BS.1770-4
  // 4. Export in the requested format
  // 5. Upload to Cloud Storage
  // 6. Return the signed URL

  // For now, return simulated values
  await new Promise((resolve) => setTimeout(resolve, 100)); // Simulate processing time

  return {
    url: audioUrl, // In production, this would be a new URL
    loudness: {
      integrated: -14 + Math.random() * 2 - 1, // LUFS around -14
      peak: -0.3 + Math.random() * 0.2, // Peak around -0.3 dBTP
      range: 6 + Math.random() * 4, // Dynamic range around 6-10 LU
    },
  };
}

/**
 * Log mastering job for analytics
 */
async function logMasteringJob(
  orgId: string,
  userId: string | null,
  request: MasterRequest,
  response: MasterResponse
): Promise<void> {
  try {
    const collection = new TenantCollection(orgId, 'mastering_logs');

    // Build log data, filtering out undefined values
    const logData: Record<string, unknown> = {
      user_id: userId,
      job_id: response.id,
      format: response.format,
      sample_rate: response.sampleRate,
      bit_depth: response.bitDepth,
      has_custom_settings: !!request.settings,
    };

    // Only add optional fields if they're defined
    if (request.presetId !== undefined) logData.preset_id = request.presetId;
    if (response.loudness?.integrated !== undefined) logData.loudness_integrated = response.loudness.integrated;
    if (response.loudness?.peak !== undefined) logData.loudness_peak = response.loudness.peak;

    await collection.create(logData);
  } catch (error) {
    console.error(`[Master] Failed to log mastering job:`, error);
  }
}

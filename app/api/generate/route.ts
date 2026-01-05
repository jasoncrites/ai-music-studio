import { NextRequest } from 'next/server';
import { TenantCollection } from '@/lib/firestore/client';
import { AudioGenerationService } from '@/lib/services/audio/generation';
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
import { GenerateRequest, GenerateResponse, Track, Project } from '@/lib/api/types';

const CONTEXT = 'api/generate';

/**
 * POST /api/generate
 * Generate AI music from text prompt using Replicate
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
    const body = await parseBody<GenerateRequest>(request);
    if (!body) {
      return errorResponse('Invalid JSON body', 400, 'INVALID_BODY');
    }

    // Validate required fields
    if (!body.prompt || body.prompt.trim().length === 0) {
      return errorResponse('Prompt is required', 400, 'MISSING_PROMPT');
    }

    if (body.prompt.length > 1000) {
      return errorResponse('Prompt must be 1000 characters or less', 400, 'PROMPT_TOO_LONG');
    }

    // Validate optional fields
    if (body.tempo !== undefined && (body.tempo < 20 || body.tempo > 300)) {
      return errorResponse('Tempo must be between 20 and 300 BPM', 400, 'INVALID_TEMPO');
    }

    const validDurations = ['15s', '30s', '45s', '1m', '2m', '3m'];
    if (body.duration && !validDurations.includes(body.duration)) {
      return errorResponse(
        `Duration must be one of: ${validDurations.join(', ')}`,
        400,
        'INVALID_DURATION'
      );
    }

    // If adding to project, verify project exists
    let project: Project | null = null;
    if (body.projectId && body.addToProject) {
      const projectsCollection = new TenantCollection(orgId, 'projects');
      project = await projectsCollection.get<Project>(body.projectId);

      if (!project) {
        return errorResponse('Project not found', 404, 'PROJECT_NOT_FOUND');
      }
    }

    console.log(`[Generate] Starting generation for org: ${orgId}`, {
      prompt: body.prompt.substring(0, 100),
      duration: body.duration || '30s',
      style: body.style,
      projectId: body.projectId,
    });

    // Generate audio using the AudioGenerationService
    const result = await AudioGenerationService.execute({
      prompt: buildEnhancedPrompt(body),
      duration: body.duration || '30s',
      style: body.style,
      key: body.key,
      tempo: body.tempo,
      provider: body.provider,
    });

    if (result.status === 'FAILED' || !result.data) {
      console.error(`[Generate] Generation failed:`, result.message);
      return errorResponse(
        result.message || 'Generation failed',
        500,
        'GENERATION_FAILED'
      );
    }

    // Build response
    const response: GenerateResponse = {
      id: result.data.id,
      status: 'completed',
      audioUrl: result.data.url,
      waveformData: result.data.waveform,
      duration: result.data.duration,
      prompt: body.prompt,
      provider: result.data.metadata?.provider || 'replicate',
      costUSD: result.data.metadata?.costUSD,
    };

    // If requested, add as track to project
    if (body.projectId && body.addToProject && project) {
      try {
        const tracksCollection = new TenantCollection(orgId, 'tracks');

        // Get current track count for ordering
        const { total: currentTrackCount } = await tracksCollection.list<Track>({
          limit: 1,
          filters: [{ field: 'project_id', operator: '==', value: body.projectId }],
        });

        // Create track, filtering out undefined values
        const trackData: Record<string, unknown> = {
          project_id: body.projectId,
          org_id: orgId,
          name: `AI Generated - ${body.prompt.substring(0, 30)}`,
          type: 'generated',
          audioUrl: result.data.url,
          duration: result.data.duration,
          startTime: 0,
          volume: 0.8,
          pan: 0,
          muted: false,
          soloed: false,
          color: '#8B5CF6', // Purple for AI-generated
          effects: [],
          order: currentTrackCount,
        };

        // Only add optional fields if they're defined
        if (result.data.waveform !== undefined) trackData.waveformData = result.data.waveform;

        // Build metadata object, filtering out undefined values
        const metadata: Record<string, unknown> = {
          prompt: body.prompt,
          sourceType: 'generated',
        };
        if (result.data.metadata?.provider !== undefined) {
          metadata.provider = result.data.metadata.provider;
        }
        trackData.metadata = metadata;

        const trackResult = await tracksCollection.create(trackData);
        response.trackId = trackResult.id;

        // Update project track count
        const projectsCollection = new TenantCollection(orgId, 'projects');
        await projectsCollection.update<Project>(body.projectId, {
          trackCount: currentTrackCount + 1,
        });

        console.log(`[Generate] Added track ${trackResult.id} to project ${body.projectId}`);
      } catch (trackError) {
        console.error(`[Generate] Failed to add track to project:`, trackError);
        // Don't fail the whole request, just log the error
      }
    }

    // Log generation for cost tracking
    await logGeneration(orgId, userId, body, result.data);

    return successResponse(response);
  } catch (error) {
    logError(error as Error, request, CONTEXT);
    return errorResponse(
      'Failed to generate audio',
      500,
      'INTERNAL_ERROR',
      process.env.NODE_ENV === 'development' ? (error as Error).message : undefined
    );
  }
}

/**
 * OPTIONS /api/generate
 * Handle CORS preflight
 */
export async function OPTIONS() {
  return handleOptions();
}

/**
 * Build enhanced prompt with style, key, and tempo hints
 */
function buildEnhancedPrompt(request: GenerateRequest): string {
  let prompt = request.prompt.trim();

  // Add style hint if provided
  if (request.style && !prompt.toLowerCase().includes(request.style.toLowerCase())) {
    prompt = `${request.style} style: ${prompt}`;
  }

  // Add tempo hint if provided
  if (request.tempo) {
    prompt = `${prompt} at ${request.tempo} BPM`;
  }

  // Add key hint if provided
  if (request.key) {
    prompt = `${prompt} in ${request.key}`;
  }

  return prompt;
}

/**
 * Log generation for cost tracking and analytics
 */
async function logGeneration(
  orgId: string,
  userId: string | null,
  request: GenerateRequest,
  result: { id: string; duration: number; metadata?: { costUSD?: number; provider?: string } }
): Promise<void> {
  try {
    const collection = new TenantCollection(orgId, 'generation_logs');

    // Build log data, filtering out undefined values
    const logData: Record<string, unknown> = {
      user_id: userId,
      prompt: request.prompt,
      duration_seconds: result.duration,
      provider: result.metadata?.provider || 'replicate',
      cost_usd: result.metadata?.costUSD || 0,
      generation_id: result.id,
    };

    // Only add optional fields if they're defined
    if (request.style !== undefined) logData.style = request.style;
    if (request.tempo !== undefined) logData.tempo = request.tempo;
    if (request.key !== undefined) logData.key = request.key;
    if (request.projectId !== undefined) logData.added_to_project = request.projectId;

    await collection.create(logData);
  } catch (error) {
    console.error(`[Generate] Failed to log generation:`, error);
    // Don't fail the request for logging errors
  }
}

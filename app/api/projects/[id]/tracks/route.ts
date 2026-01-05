import { NextRequest } from 'next/server';
import { TenantCollection } from '@/lib/firestore/client';
import {
  requireOrgId,
  getUserId,
  getPagination,
  parseBody,
  successResponse,
  errorResponse,
  logRequest,
  logError,
  handleOptions,
} from '@/lib/api/middleware';
import { Track, CreateTrackInput, Project } from '@/lib/api/types';

const CONTEXT = 'api/projects/[id]/tracks';

interface RouteContext {
  params: Promise<{ id: string }>;
}

/**
 * GET /api/projects/[id]/tracks
 * List all tracks for a project
 */
export async function GET(request: NextRequest, context: RouteContext) {
  try {
    // Validate org_id
    const authResult = requireOrgId(request);
    if ('json' in authResult) return authResult;
    const { orgId } = authResult;

    const { id: projectId } = await context.params;
    logRequest(request, orgId, `${CONTEXT}/${projectId}`);

    if (!projectId) {
      return errorResponse('Project ID is required', 400, 'MISSING_PROJECT_ID');
    }

    // Verify project exists
    const projectsCollection = new TenantCollection(orgId, 'projects');
    const project = await projectsCollection.get<Project>(projectId);

    if (!project) {
      return errorResponse('Project not found', 404, 'PROJECT_NOT_FOUND');
    }

    // Parse pagination
    const { limit, offset, page } = getPagination(request);

    // Get tracks from Firestore
    const tracksCollection = new TenantCollection(orgId, 'tracks');
    const { items, total } = await tracksCollection.list<Track>({
      limit,
      offset,
      orderBy: 'order',
      orderDirection: 'asc',
      filters: [{ field: 'project_id', operator: '==', value: projectId }],
    });

    return successResponse(items, { total, page, limit });
  } catch (error) {
    logError(error as Error, request, CONTEXT);
    return errorResponse(
      'Failed to list tracks',
      500,
      'INTERNAL_ERROR',
      process.env.NODE_ENV === 'development' ? (error as Error).message : undefined
    );
  }
}

/**
 * POST /api/projects/[id]/tracks
 * Create a new track in the project
 */
export async function POST(request: NextRequest, context: RouteContext) {
  try {
    // Validate org_id
    const authResult = requireOrgId(request);
    if ('json' in authResult) return authResult;
    const { orgId } = authResult;

    const { id: projectId } = await context.params;
    logRequest(request, orgId, `${CONTEXT}/${projectId}`);

    if (!projectId) {
      return errorResponse('Project ID is required', 400, 'MISSING_PROJECT_ID');
    }

    // Verify project exists
    const projectsCollection = new TenantCollection(orgId, 'projects');
    const project = await projectsCollection.get<Project>(projectId);

    if (!project) {
      return errorResponse('Project not found', 404, 'PROJECT_NOT_FOUND');
    }

    // Parse request body
    const body = await parseBody<CreateTrackInput>(request);
    if (!body) {
      return errorResponse('Invalid JSON body', 400, 'INVALID_BODY');
    }

    // Validate required fields
    if (!body.name || body.name.trim().length === 0) {
      return errorResponse('Track name is required', 400, 'MISSING_NAME');
    }

    if (!body.type || !['audio', 'midi', 'generated'].includes(body.type)) {
      return errorResponse('Invalid track type. Must be audio, midi, or generated', 400, 'INVALID_TYPE');
    }

    // Get current track count for ordering
    const tracksCollection = new TenantCollection(orgId, 'tracks');
    const { total: currentTrackCount } = await tracksCollection.list<Track>({
      limit: 1,
      filters: [{ field: 'project_id', operator: '==', value: projectId }],
    });

    // Validate volume and pan
    const volume = body.volume !== undefined ? Math.max(0, Math.min(1, body.volume)) : 0.8;
    const pan = body.pan !== undefined ? Math.max(-1, Math.min(1, body.pan)) : 0;

    // Build track data, filtering out undefined values
    const trackData: Record<string, unknown> = {
      project_id: projectId,
      org_id: orgId,
      name: body.name.trim(),
      type: body.type,
      duration: body.duration || 0,
      startTime: body.startTime || 0,
      volume,
      pan,
      muted: false,
      soloed: false,
      color: body.color || getDefaultTrackColor(currentTrackCount),
      effects: body.effects || [],
      order: body.order !== undefined ? body.order : currentTrackCount,
    };

    // Only add optional fields if they're defined
    if (body.audioUrl !== undefined) trackData.audioUrl = body.audioUrl;
    if (body.waveformData !== undefined) trackData.waveformData = body.waveformData;
    if (body.metadata !== undefined) trackData.metadata = body.metadata;

    // Create track in Firestore
    const result = await tracksCollection.create(trackData);

    // Update project track count
    await projectsCollection.update<Project>(projectId, {
      trackCount: currentTrackCount + 1,
    });

    return successResponse({
      id: result.id,
      ...result.data,
    });
  } catch (error) {
    logError(error as Error, request, CONTEXT);
    return errorResponse(
      'Failed to create track',
      500,
      'INTERNAL_ERROR',
      process.env.NODE_ENV === 'development' ? (error as Error).message : undefined
    );
  }
}

/**
 * OPTIONS /api/projects/[id]/tracks
 * Handle CORS preflight
 */
export async function OPTIONS() {
  return handleOptions();
}

/**
 * Get default track color based on track index
 */
function getDefaultTrackColor(index: number): string {
  const colors = [
    '#3B82F6', // Blue
    '#10B981', // Emerald
    '#8B5CF6', // Violet
    '#F59E0B', // Amber
    '#EF4444', // Red
    '#EC4899', // Pink
    '#06B6D4', // Cyan
    '#84CC16', // Lime
    '#F97316', // Orange
    '#6366F1', // Indigo
  ];
  return colors[index % colors.length];
}

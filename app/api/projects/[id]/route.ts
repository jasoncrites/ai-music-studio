import { NextRequest } from 'next/server';
import { TenantCollection } from '@/lib/firestore/client';
import {
  requireOrgId,
  parseBody,
  successResponse,
  errorResponse,
  logRequest,
  logError,
  handleOptions,
} from '@/lib/api/middleware';
import { Project, UpdateProjectInput } from '@/lib/api/types';

const CONTEXT = 'api/projects/[id]';

interface RouteContext {
  params: Promise<{ id: string }>;
}

/**
 * GET /api/projects/[id]
 * Get a single project by ID
 */
export async function GET(request: NextRequest, context: RouteContext) {
  try {
    // Validate org_id
    const authResult = requireOrgId(request);
    if ('json' in authResult) return authResult;
    const { orgId } = authResult;

    const { id } = await context.params;
    logRequest(request, orgId, `${CONTEXT}/${id}`);

    if (!id) {
      return errorResponse('Project ID is required', 400, 'MISSING_ID');
    }

    // Get project from Firestore
    const collection = new TenantCollection(orgId, 'projects');
    const project = await collection.get<Project>(id);

    if (!project) {
      return errorResponse('Project not found', 404, 'NOT_FOUND');
    }

    return successResponse(project);
  } catch (error) {
    logError(error as Error, request, CONTEXT);
    return errorResponse(
      'Failed to get project',
      500,
      'INTERNAL_ERROR',
      process.env.NODE_ENV === 'development' ? (error as Error).message : undefined
    );
  }
}

/**
 * PUT /api/projects/[id]
 * Update a project
 */
export async function PUT(request: NextRequest, context: RouteContext) {
  try {
    // Validate org_id
    const authResult = requireOrgId(request);
    if ('json' in authResult) return authResult;
    const { orgId } = authResult;

    const { id } = await context.params;
    logRequest(request, orgId, `${CONTEXT}/${id}`);

    if (!id) {
      return errorResponse('Project ID is required', 400, 'MISSING_ID');
    }

    // Parse request body
    const body = await parseBody<UpdateProjectInput>(request);
    if (!body || Object.keys(body).length === 0) {
      return errorResponse('Request body is required', 400, 'INVALID_BODY');
    }

    // Validate fields
    if (body.name !== undefined) {
      if (body.name.trim().length === 0) {
        return errorResponse('Project name cannot be empty', 400, 'INVALID_NAME');
      }
      if (body.name.length > 200) {
        return errorResponse('Project name must be 200 characters or less', 400, 'NAME_TOO_LONG');
      }
    }

    if (body.status && !['draft', 'active', 'archived'].includes(body.status)) {
      return errorResponse('Invalid status value', 400, 'INVALID_STATUS');
    }

    if (body.bpm !== undefined && (body.bpm < 20 || body.bpm > 300)) {
      return errorResponse('BPM must be between 20 and 300', 400, 'INVALID_BPM');
    }

    // Build update data
    const updateData: Partial<Project> = {};
    if (body.name !== undefined) updateData.name = body.name.trim();
    if (body.description !== undefined) updateData.description = body.description?.trim();
    if (body.bpm !== undefined) updateData.bpm = body.bpm;
    if (body.key !== undefined) updateData.key = body.key;
    if (body.timeSignature !== undefined) updateData.timeSignature = body.timeSignature;
    if (body.duration !== undefined) updateData.duration = body.duration;
    if (body.status !== undefined) updateData.status = body.status;
    if (body.coverUrl !== undefined) updateData.coverUrl = body.coverUrl;
    if (body.tags !== undefined) updateData.tags = body.tags;

    // Update project in Firestore
    const collection = new TenantCollection(orgId, 'projects');
    const updated = await collection.update<Project>(id, updateData);

    if (!updated) {
      return errorResponse('Project not found', 404, 'NOT_FOUND');
    }

    return successResponse(updated);
  } catch (error) {
    logError(error as Error, request, CONTEXT);
    return errorResponse(
      'Failed to update project',
      500,
      'INTERNAL_ERROR',
      process.env.NODE_ENV === 'development' ? (error as Error).message : undefined
    );
  }
}

/**
 * DELETE /api/projects/[id]
 * Delete a project (and all its tracks)
 */
export async function DELETE(request: NextRequest, context: RouteContext) {
  try {
    // Validate org_id
    const authResult = requireOrgId(request);
    if ('json' in authResult) return authResult;
    const { orgId } = authResult;

    const { id } = await context.params;
    logRequest(request, orgId, `${CONTEXT}/${id}`);

    if (!id) {
      return errorResponse('Project ID is required', 400, 'MISSING_ID');
    }

    // Get project to verify it exists
    const collection = new TenantCollection(orgId, 'projects');
    const project = await collection.get<Project>(id);

    if (!project) {
      return errorResponse('Project not found', 404, 'NOT_FOUND');
    }

    // Delete all tracks in the project first
    const tracksCollection = new TenantCollection(orgId, 'tracks');
    const { items: tracks } = await tracksCollection.list<{ id: string }>({
      filters: [{ field: 'project_id', operator: '==', value: id }],
    });

    for (const track of tracks) {
      await tracksCollection.delete(track.id);
    }

    // Delete the project
    const deleted = await collection.delete(id);

    if (!deleted) {
      return errorResponse('Failed to delete project', 500, 'DELETE_FAILED');
    }

    return successResponse({
      id,
      deleted: true,
      tracksDeleted: tracks.length,
    });
  } catch (error) {
    logError(error as Error, request, CONTEXT);
    return errorResponse(
      'Failed to delete project',
      500,
      'INTERNAL_ERROR',
      process.env.NODE_ENV === 'development' ? (error as Error).message : undefined
    );
  }
}

/**
 * OPTIONS /api/projects/[id]
 * Handle CORS preflight
 */
export async function OPTIONS() {
  return handleOptions();
}

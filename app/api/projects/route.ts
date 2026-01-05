import { NextRequest } from 'next/server';
import { TenantCollection, WhereFilterOp } from '@/lib/firestore/client';
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
import { Project, CreateProjectInput } from '@/lib/api/types';

const CONTEXT = 'api/projects';

/**
 * GET /api/projects
 * List all projects for the organization
 */
export async function GET(request: NextRequest) {
  try {
    // Validate org_id
    const authResult = requireOrgId(request);
    if ('json' in authResult) return authResult;
    const { orgId } = authResult;

    logRequest(request, orgId, CONTEXT);

    // Parse pagination
    const { limit, offset, page } = getPagination(request);

    // Parse filters
    const url = new URL(request.url);
    const status = url.searchParams.get('status');
    const search = url.searchParams.get('search');

    // Build filters
    const filters: Array<{ field: string; operator: WhereFilterOp; value: unknown }> = [];
    if (status && ['draft', 'active', 'archived'].includes(status)) {
      filters.push({ field: 'status', operator: '==', value: status });
    }

    // Get projects from Firestore
    const collection = new TenantCollection(orgId, 'projects');
    const { items, total } = await collection.list<Project>({
      limit,
      offset,
      orderBy: url.searchParams.get('orderBy') || 'updated_at',
      orderDirection: (url.searchParams.get('order') as 'asc' | 'desc') || 'desc',
      filters,
    });

    // Filter by search term (client-side for now)
    let filteredItems = items;
    if (search) {
      const searchLower = search.toLowerCase();
      filteredItems = items.filter(
        (p) =>
          p.name.toLowerCase().includes(searchLower) ||
          p.description?.toLowerCase().includes(searchLower)
      );
    }

    return successResponse(filteredItems, { total, page, limit });
  } catch (error) {
    logError(error as Error, request, CONTEXT);
    return errorResponse(
      'Failed to list projects',
      500,
      'INTERNAL_ERROR',
      process.env.NODE_ENV === 'development' ? (error as Error).message : undefined
    );
  }
}

/**
 * POST /api/projects
 * Create a new project
 */
export async function POST(request: NextRequest) {
  try {
    // Validate org_id
    const authResult = requireOrgId(request);
    if ('json' in authResult) return authResult;
    const { orgId } = authResult;

    logRequest(request, orgId, CONTEXT);

    // Parse request body
    const body = await parseBody<CreateProjectInput>(request);
    if (!body) {
      return errorResponse('Invalid JSON body', 400, 'INVALID_BODY');
    }

    // Validate required fields
    if (!body.name || body.name.trim().length === 0) {
      return errorResponse('Project name is required', 400, 'MISSING_NAME');
    }

    if (body.name.length > 200) {
      return errorResponse('Project name must be 200 characters or less', 400, 'NAME_TOO_LONG');
    }

    // Get user ID
    const userId = getUserId(request);

    // Build project data, filtering out undefined values
    const projectData: Record<string, unknown> = {
      org_id: orgId,
      name: body.name.trim(),
      bpm: body.bpm || 120,
      timeSignature: body.timeSignature || '4/4',
      duration: 0,
      trackCount: 0,
      status: 'draft',
      tags: body.tags || [],
    };

    // Only add optional fields if they're defined
    if (body.description?.trim()) projectData.description = body.description.trim();
    if (body.key !== undefined) projectData.key = body.key;
    if (body.coverUrl !== undefined) projectData.coverUrl = body.coverUrl;
    if (userId !== null) projectData.created_by = userId;

    // Create project in Firestore
    const collection = new TenantCollection(orgId, 'projects');
    const result = await collection.create(projectData);

    return successResponse(
      {
        id: result.id,
        ...result.data,
      },
      undefined
    );
  } catch (error) {
    logError(error as Error, request, CONTEXT);
    return errorResponse(
      'Failed to create project',
      500,
      'INTERNAL_ERROR',
      process.env.NODE_ENV === 'development' ? (error as Error).message : undefined
    );
  }
}

/**
 * OPTIONS /api/projects
 * Handle CORS preflight
 */
export async function OPTIONS() {
  return handleOptions();
}

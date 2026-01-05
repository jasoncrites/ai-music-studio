/**
 * API Middleware for AI Music Studio
 * Multi-tenant validation and common utilities
 */

import { NextRequest, NextResponse } from 'next/server';

/**
 * Error response interface
 */
export interface ApiError {
  success: false;
  error: string;
  code?: string;
  details?: unknown;
}

/**
 * Success response interface
 */
export interface ApiSuccess<T = unknown> {
  success: true;
  data: T;
  meta?: {
    total?: number;
    page?: number;
    limit?: number;
  };
}

export type ApiResponse<T = unknown> = ApiSuccess<T> | ApiError;

/**
 * Extract and validate org_id from request headers
 * Returns null if invalid or missing
 */
export function getOrgId(request: NextRequest): string | null {
  // Check x-org-id header (primary)
  const orgId = request.headers.get('x-org-id');
  if (orgId && isValidOrgId(orgId)) {
    return orgId;
  }

  // Check Authorization header for embedded org_id
  const authHeader = request.headers.get('authorization');
  if (authHeader) {
    const token = authHeader.replace('Bearer ', '');
    // In production, decode JWT and extract org_id
    // For now, check for org_id in query params as fallback
  }

  // Fallback to query parameter (for testing)
  const url = new URL(request.url);
  const queryOrgId = url.searchParams.get('org_id');
  if (queryOrgId && isValidOrgId(queryOrgId)) {
    return queryOrgId;
  }

  return null;
}

/**
 * Validate org_id format
 * Should be alphanumeric with hyphens, 3-50 chars
 */
export function isValidOrgId(orgId: string): boolean {
  const pattern = /^[a-zA-Z0-9][a-zA-Z0-9-_]{2,49}$/;
  return pattern.test(orgId);
}

/**
 * Extract user_id from request (from JWT or header)
 */
export function getUserId(request: NextRequest): string | null {
  // Check x-user-id header
  const userId = request.headers.get('x-user-id');
  if (userId) {
    return userId;
  }

  // In production, extract from JWT in Authorization header
  // For now, return null if not provided
  return null;
}

/**
 * Create standardized error response
 */
export function errorResponse(
  message: string,
  status: number = 400,
  code?: string,
  details?: unknown
): NextResponse<ApiError> {
  return NextResponse.json(
    {
      success: false,
      error: message,
      code,
      details,
    },
    { status }
  );
}

/**
 * Create standardized success response
 */
export function successResponse<T>(
  data: T,
  meta?: { total?: number; page?: number; limit?: number }
): NextResponse<ApiSuccess<T>> {
  return NextResponse.json({
    success: true,
    data,
    meta,
  });
}

/**
 * Require org_id middleware wrapper
 * Returns error response if org_id is missing or invalid
 */
export function requireOrgId(
  request: NextRequest
): { orgId: string } | NextResponse<ApiError> {
  const orgId = getOrgId(request);

  if (!orgId) {
    return errorResponse(
      'Missing or invalid x-org-id header',
      401,
      'MISSING_ORG_ID'
    );
  }

  return { orgId };
}

/**
 * Parse pagination parameters from request
 */
export function getPagination(request: NextRequest): {
  limit: number;
  offset: number;
  page: number;
} {
  const url = new URL(request.url);
  const page = Math.max(1, parseInt(url.searchParams.get('page') || '1', 10));
  const limit = Math.min(100, Math.max(1, parseInt(url.searchParams.get('limit') || '20', 10)));
  const offset = (page - 1) * limit;

  return { limit, offset, page };
}

/**
 * Parse JSON body safely
 */
export async function parseBody<T>(request: NextRequest): Promise<T | null> {
  try {
    return await request.json();
  } catch {
    return null;
  }
}

/**
 * Log API request for monitoring
 */
export function logRequest(
  request: NextRequest,
  orgId: string | null,
  context: string
): void {
  const method = request.method;
  const path = new URL(request.url).pathname;
  const timestamp = new Date().toISOString();

  console.log(
    JSON.stringify({
      level: 'info',
      context,
      method,
      path,
      org_id: orgId,
      timestamp,
    })
  );
}

/**
 * Log API error for monitoring
 */
export function logError(
  error: Error,
  request: NextRequest,
  context: string
): void {
  const method = request.method;
  const path = new URL(request.url).pathname;
  const timestamp = new Date().toISOString();

  console.error(
    JSON.stringify({
      level: 'error',
      context,
      method,
      path,
      error: error.message,
      stack: error.stack,
      timestamp,
    })
  );
}

/**
 * CORS headers for Cloud Run
 */
export function corsHeaders(): Record<string, string> {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization, x-org-id, x-user-id',
    'Access-Control-Max-Age': '86400',
  };
}

/**
 * Handle OPTIONS preflight request
 */
export function handleOptions(): NextResponse {
  return new NextResponse(null, {
    status: 204,
    headers: corsHeaders(),
  });
}

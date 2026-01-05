import { NextRequest } from 'next/server';
import { TenantCollection, getDb } from '@/lib/firestore/client';
import {
  requireOrgId,
  getUserId,
  successResponse,
  errorResponse,
  logRequest,
  logError,
  handleOptions,
} from '@/lib/api/middleware';
import { User } from '@/lib/api/types';

const CONTEXT = 'api/auth/me';

/**
 * GET /api/auth/me
 * Get the current user's profile and settings
 */
export async function GET(request: NextRequest) {
  try {
    // Validate org_id
    const authResult = requireOrgId(request);
    if ('json' in authResult) return authResult;
    const { orgId } = authResult;

    logRequest(request, orgId, CONTEXT);

    // Get user ID from header or JWT
    const userId = getUserId(request);

    if (!userId) {
      // Return minimal org-level response if no user ID
      // This allows anonymous/service-to-service calls
      return successResponse({
        authenticated: true,
        org_id: orgId,
        user: null,
        permissions: getDefaultPermissions('viewer'),
      });
    }

    // Get user from Firestore
    const usersCollection = new TenantCollection(orgId, 'users');
    let user = await usersCollection.get<User>(userId);

    if (!user) {
      // Create default user profile if doesn't exist
      // This handles first-time user setup
      user = await createDefaultUser(orgId, userId, request);
    }

    // Get usage statistics
    const usage = await getUserUsage(orgId, userId);

    // Get org info
    const orgInfo = await getOrgInfo(orgId);

    return successResponse({
      authenticated: true,
      org_id: orgId,
      user: {
        ...user,
        usage,
      },
      org: orgInfo,
      permissions: getDefaultPermissions(user.role),
    });
  } catch (error) {
    logError(error as Error, request, CONTEXT);
    return errorResponse(
      'Failed to get user profile',
      500,
      'INTERNAL_ERROR',
      process.env.NODE_ENV === 'development' ? (error as Error).message : undefined
    );
  }
}

/**
 * OPTIONS /api/auth/me
 * Handle CORS preflight
 */
export async function OPTIONS() {
  return handleOptions();
}

/**
 * Create a default user profile
 */
async function createDefaultUser(
  orgId: string,
  userId: string,
  request: NextRequest
): Promise<User> {
  // Extract email from headers or use placeholder
  const email = request.headers.get('x-user-email') || `${userId}@unknown`;
  const name = request.headers.get('x-user-name') || undefined;

  const userData: Omit<User, 'id' | 'created_at'> = {
    org_id: orgId,
    email,
    name,
    avatar_url: undefined,
    role: 'editor', // Default role for new users
    settings: {
      theme: 'system',
      defaultBpm: 120,
      defaultKey: 'C major',
      waveformColor: '#3B82F6',
    },
    usage: {
      projectCount: 0,
      storageUsedMB: 0,
      generationsThisMonth: 0,
    },
    last_login: new Date().toISOString(),
  };

  const usersCollection = new TenantCollection(orgId, 'users');

  // Use the provided userId as the document ID
  const db = getDb();
  const docRef = db.collection('orgs').doc(orgId).collection('users').doc(userId);

  await docRef.set({
    ...userData,
    created_at: new Date().toISOString(),
  });

  return {
    id: userId,
    ...userData,
    created_at: new Date().toISOString(),
  };
}

/**
 * Get user usage statistics
 */
async function getUserUsage(
  orgId: string,
  userId: string
): Promise<{ projectCount: number; storageUsedMB: number; generationsThisMonth: number }> {
  try {
    const db = getDb();

    // Count projects created by user
    const projectsSnapshot = await db
      .collection('orgs')
      .doc(orgId)
      .collection('projects')
      .where('created_by', '==', userId)
      .count()
      .get();
    const projectCount = projectsSnapshot.data().count;

    // Get generation count for current month
    const startOfMonth = new Date();
    startOfMonth.setDate(1);
    startOfMonth.setHours(0, 0, 0, 0);

    const generationsSnapshot = await db
      .collection('orgs')
      .doc(orgId)
      .collection('generation_logs')
      .where('user_id', '==', userId)
      .where('created_at', '>=', startOfMonth)
      .count()
      .get();
    const generationsThisMonth = generationsSnapshot.data().count;

    // Storage calculation would require summing file sizes
    // For now, return 0 as placeholder
    const storageUsedMB = 0;

    return {
      projectCount,
      storageUsedMB,
      generationsThisMonth,
    };
  } catch (error) {
    console.error('[Auth] Failed to get user usage:', error);
    return {
      projectCount: 0,
      storageUsedMB: 0,
      generationsThisMonth: 0,
    };
  }
}

/**
 * Get organization info
 */
async function getOrgInfo(
  orgId: string
): Promise<{ id: string; name?: string; plan?: string; limits?: Record<string, number> }> {
  try {
    const db = getDb();
    const orgDoc = await db.collection('orgs').doc(orgId).get();

    if (!orgDoc.exists) {
      // Return default org info
      return {
        id: orgId,
        name: orgId,
        plan: 'free',
        limits: getDefaultLimits('free'),
      };
    }

    const orgData = orgDoc.data();
    return {
      id: orgId,
      name: orgData?.name || orgId,
      plan: orgData?.plan || 'free',
      limits: getDefaultLimits(orgData?.plan || 'free'),
    };
  } catch (error) {
    console.error('[Auth] Failed to get org info:', error);
    return {
      id: orgId,
      plan: 'free',
      limits: getDefaultLimits('free'),
    };
  }
}

/**
 * Get default permissions for a role
 */
function getDefaultPermissions(role: User['role']): Record<string, boolean> {
  const permissions: Record<string, boolean> = {
    // Read permissions
    'projects:read': true,
    'tracks:read': true,
    'presets:read': true,

    // Write permissions
    'projects:write': false,
    'tracks:write': false,
    'presets:write': false,

    // Generate permissions
    'generate:audio': false,
    'master:audio': false,

    // Admin permissions
    'users:manage': false,
    'org:settings': false,
    'billing:manage': false,
  };

  switch (role) {
    case 'admin':
      // Admins can do everything
      Object.keys(permissions).forEach((key) => {
        permissions[key] = true;
      });
      break;

    case 'editor':
      // Editors can create and edit, but not manage users
      permissions['projects:write'] = true;
      permissions['tracks:write'] = true;
      permissions['presets:write'] = true;
      permissions['generate:audio'] = true;
      permissions['master:audio'] = true;
      break;

    case 'viewer':
      // Viewers can only read
      break;
  }

  return permissions;
}

/**
 * Get default limits for a plan
 */
function getDefaultLimits(plan: string): Record<string, number> {
  switch (plan) {
    case 'pro':
      return {
        maxProjects: 100,
        maxTracksPerProject: 100,
        maxStorageMB: 50000, // 50 GB
        maxGenerationsPerMonth: 500,
        maxMasteringsPerMonth: 100,
      };

    case 'enterprise':
      return {
        maxProjects: -1, // Unlimited
        maxTracksPerProject: 200,
        maxStorageMB: 500000, // 500 GB
        maxGenerationsPerMonth: -1, // Unlimited
        maxMasteringsPerMonth: -1, // Unlimited
      };

    case 'free':
    default:
      return {
        maxProjects: 5,
        maxTracksPerProject: 20,
        maxStorageMB: 500, // 500 MB
        maxGenerationsPerMonth: 10,
        maxMasteringsPerMonth: 5,
      };
  }
}

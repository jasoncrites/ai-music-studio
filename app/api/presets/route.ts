import { NextRequest } from 'next/server';
import { TenantCollection, SharedCollection, WhereFilterOp } from '@/lib/firestore/client';
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
import { Preset, CreatePresetInput } from '@/lib/api/types';

const CONTEXT = 'api/presets';

/**
 * GET /api/presets
 * List presets (shared/public presets + org-specific presets)
 */
export async function GET(request: NextRequest) {
  try {
    // Validate org_id
    const authResult = requireOrgId(request);
    if ('json' in authResult) return authResult;
    const { orgId } = authResult;

    logRequest(request, orgId, CONTEXT);

    // Parse pagination and filters
    const { limit, page } = getPagination(request);
    const url = new URL(request.url);
    const type = url.searchParams.get('type') as Preset['type'] | null;
    const category = url.searchParams.get('category');
    const includePublic = url.searchParams.get('include_public') !== 'false';
    const onlyMine = url.searchParams.get('only_mine') === 'true';

    // Build filters
    const filters: Array<{ field: string; operator: WhereFilterOp; value: unknown }> = [];
    if (type && ['mastering', 'effect', 'instrument', 'mix'].includes(type)) {
      filters.push({ field: 'type', operator: '==', value: type });
    }
    if (category) {
      filters.push({ field: 'category', operator: '==', value: category });
    }

    // Collect presets from multiple sources
    const allPresets: Preset[] = [];

    // 1. Get org-specific presets
    const tenantCollection = new TenantCollection(orgId, 'presets');
    const { items: orgPresets } = await tenantCollection.list<Preset>({
      limit: 100,
      orderBy: 'created_at',
      orderDirection: 'desc',
      filters,
    });

    // Mark org presets
    for (const preset of orgPresets) {
      allPresets.push({
        ...preset,
        isPublic: false, // Org presets are private by default
      });
    }

    // 2. Get shared/public presets (if requested)
    if (includePublic && !onlyMine) {
      const sharedCollection = new SharedCollection('shared_presets');
      const publicFilters: Array<{ field: string; operator: WhereFilterOp; value: unknown }> = [
        { field: 'isPublic', operator: '==', value: true },
        ...filters,
      ];

      const sharedPresets = await sharedCollection.list<Preset>({
        limit: 50,
        orderBy: 'usage_count',
        orderDirection: 'desc',
        filters: publicFilters,
      });

      // Add shared presets, avoiding duplicates
      for (const preset of sharedPresets) {
        if (!allPresets.find((p) => p.id === preset.id)) {
          allPresets.push(preset);
        }
      }
    }

    // Sort by rating and usage
    allPresets.sort((a, b) => {
      // Org presets first
      if (a.creator_org_id === orgId && b.creator_org_id !== orgId) return -1;
      if (b.creator_org_id === orgId && a.creator_org_id !== orgId) return 1;

      // Then by rating
      if ((b.rating || 0) !== (a.rating || 0)) {
        return (b.rating || 0) - (a.rating || 0);
      }

      // Then by usage
      return (b.usage_count || 0) - (a.usage_count || 0);
    });

    // Apply pagination
    const offset = (page - 1) * limit;
    const paginatedPresets = allPresets.slice(offset, offset + limit);

    return successResponse(paginatedPresets, {
      total: allPresets.length,
      page,
      limit,
    });
  } catch (error) {
    logError(error as Error, request, CONTEXT);
    return errorResponse(
      'Failed to list presets',
      500,
      'INTERNAL_ERROR',
      process.env.NODE_ENV === 'development' ? (error as Error).message : undefined
    );
  }
}

/**
 * POST /api/presets
 * Create a new preset
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
    const body = await parseBody<CreatePresetInput>(request);
    if (!body) {
      return errorResponse('Invalid JSON body', 400, 'INVALID_BODY');
    }

    // Validate required fields
    if (!body.name || body.name.trim().length === 0) {
      return errorResponse('Preset name is required', 400, 'MISSING_NAME');
    }

    if (body.name.length > 100) {
      return errorResponse('Preset name must be 100 characters or less', 400, 'NAME_TOO_LONG');
    }

    const validTypes = ['mastering', 'effect', 'instrument', 'mix'];
    if (!body.type || !validTypes.includes(body.type)) {
      return errorResponse(
        `Invalid preset type. Must be one of: ${validTypes.join(', ')}`,
        400,
        'INVALID_TYPE'
      );
    }

    if (!body.settings || typeof body.settings !== 'object') {
      return errorResponse('Preset settings are required', 400, 'MISSING_SETTINGS');
    }

    // Validate settings based on type
    const settingsError = validatePresetSettings(body.type, body.settings);
    if (settingsError) {
      return errorResponse(settingsError, 400, 'INVALID_SETTINGS');
    }

    // Build preset data
    const presetData: Omit<Preset, 'id' | 'created_at' | 'updated_at'> = {
      name: body.name.trim(),
      description: body.description?.trim(),
      type: body.type,
      category: body.category,
      isPublic: body.isPublic || false,
      creator_org_id: orgId,
      settings: body.settings,
      usage_count: 0,
      rating: undefined,
      tags: body.tags || [],
    };

    // Save to appropriate collection
    let result: { id: string; data: Record<string, unknown> };

    if (body.isPublic) {
      // Save to shared collection for public presets
      const sharedCollection = new SharedCollection('shared_presets');
      result = await sharedCollection.create(presetData as Record<string, unknown>, orgId);
    } else {
      // Save to tenant collection for private presets
      const tenantCollection = new TenantCollection(orgId, 'presets');
      result = await tenantCollection.create(presetData as Record<string, unknown>);
    }

    console.log(`[Presets] Created preset ${result.id} for org: ${orgId}`, {
      name: body.name,
      type: body.type,
      isPublic: body.isPublic,
    });

    return successResponse({
      id: result.id,
      ...presetData,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });
  } catch (error) {
    logError(error as Error, request, CONTEXT);
    return errorResponse(
      'Failed to create preset',
      500,
      'INTERNAL_ERROR',
      process.env.NODE_ENV === 'development' ? (error as Error).message : undefined
    );
  }
}

/**
 * OPTIONS /api/presets
 * Handle CORS preflight
 */
export async function OPTIONS() {
  return handleOptions();
}

/**
 * Validate preset settings based on type
 */
function validatePresetSettings(
  type: Preset['type'],
  settings: Preset['settings']
): string | null {
  switch (type) {
    case 'mastering':
      // Mastering presets should have at least one processing stage
      if (!settings.eq && !settings.compressor && !settings.limiter && !settings.stereo) {
        return 'Mastering preset must include at least one processing stage (eq, compressor, limiter, or stereo)';
      }

      // Validate individual settings if present
      if (settings.compressor) {
        if (settings.compressor.threshold !== undefined && settings.compressor.threshold > 0) {
          return 'Compressor threshold cannot be positive';
        }
        if (settings.compressor.ratio !== undefined && settings.compressor.ratio < 1) {
          return 'Compressor ratio must be at least 1:1';
        }
      }

      if (settings.limiter) {
        if (settings.limiter.threshold !== undefined && settings.limiter.threshold > 0) {
          return 'Limiter threshold cannot be positive';
        }
        if (settings.limiter.ceiling !== undefined && settings.limiter.ceiling > 0) {
          return 'Limiter ceiling cannot be positive';
        }
      }
      break;

    case 'effect':
      // Effect presets need at least reverb, delay, or saturation
      if (!settings.reverb && !settings.delay && !settings.saturation) {
        return 'Effect preset must include reverb, delay, or saturation settings';
      }
      break;

    case 'mix':
      // Mix presets should have EQ at minimum
      if (!settings.eq) {
        return 'Mix preset must include EQ settings';
      }
      break;

    case 'instrument':
      // Instrument presets are flexible
      break;
  }

  return null;
}

/**
 * Get default presets for new organizations
 * Called during org provisioning
 */
export function getDefaultPresets(): Array<Omit<Preset, 'id' | 'created_at' | 'updated_at'>> {
  return [
    {
      name: 'Balanced Master',
      description: 'Clean, balanced mastering for general use',
      type: 'mastering',
      category: 'general',
      isPublic: false,
      settings: {
        eq: {
          lowGain: 0,
          lowFreq: 60,
          midGain: 0.5,
          midFreq: 2500,
          midQ: 0.7,
          highGain: 1,
          highFreq: 12000,
        },
        compressor: {
          threshold: -18,
          ratio: 3,
          attack: 10,
          release: 100,
          knee: 6,
          makeupGain: 2,
        },
        limiter: {
          threshold: -1,
          release: 50,
          ceiling: -0.3,
        },
      },
      usage_count: 0,
      tags: ['balanced', 'general'],
    },
    {
      name: 'Loud & Punchy',
      description: 'Aggressive mastering for maximum loudness',
      type: 'mastering',
      category: 'loud',
      isPublic: false,
      settings: {
        eq: {
          lowGain: 2,
          lowFreq: 80,
          midGain: 1,
          midFreq: 3000,
          midQ: 0.5,
          highGain: 2,
          highFreq: 10000,
        },
        compressor: {
          threshold: -12,
          ratio: 6,
          attack: 5,
          release: 50,
          knee: 3,
          makeupGain: 4,
        },
        limiter: {
          threshold: -0.5,
          release: 30,
          ceiling: -0.1,
        },
        saturation: {
          drive: 20,
          mix: 30,
          type: 'tape',
        },
      },
      usage_count: 0,
      tags: ['loud', 'punchy', 'aggressive'],
    },
    {
      name: 'Warm Vintage',
      description: 'Warm, analog-style mastering with tape saturation',
      type: 'mastering',
      category: 'vintage',
      isPublic: false,
      settings: {
        eq: {
          lowGain: 1,
          lowFreq: 100,
          midGain: -1,
          midFreq: 400,
          midQ: 0.8,
          highGain: -0.5,
          highFreq: 8000,
        },
        compressor: {
          threshold: -20,
          ratio: 2.5,
          attack: 20,
          release: 200,
          knee: 10,
          makeupGain: 3,
        },
        limiter: {
          threshold: -2,
          release: 100,
          ceiling: -0.5,
        },
        saturation: {
          drive: 35,
          mix: 50,
          type: 'tape',
        },
      },
      usage_count: 0,
      tags: ['warm', 'vintage', 'analog', 'tape'],
    },
  ];
}

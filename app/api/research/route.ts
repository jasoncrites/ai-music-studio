import { NextRequest } from 'next/server';
import { ResearchRepository, MarketResearch, CompetitorProfile, FeatureInsight, UserPersona } from '@/lib/services/firestore/repositories/researchRepo';
import {
  requireOrgId,
  parseBody,
  successResponse,
  errorResponse,
  logRequest,
  logError,
  handleOptions,
} from '@/lib/api/middleware';

const CONTEXT = 'api/research';

/**
 * GET /api/research
 * Get research data with optional type filter
 */
export async function GET(request: NextRequest) {
  try {
    const authResult = requireOrgId(request);
    if ('json' in authResult) return authResult;
    const { orgId } = authResult;

    logRequest(request, orgId, CONTEXT);

    const { searchParams } = new URL(request.url);
    const type = searchParams.get('type') as MarketResearch['type'] | null;
    const category = searchParams.get('category');

    const repo = new ResearchRepository(orgId);

    if (category === 'competitors') {
      const competitors = await repo.getCompetitors();
      return successResponse({ competitors, count: competitors.length });
    }

    if (category === 'features') {
      const priority = searchParams.get('priority') as FeatureInsight['priority'] | undefined;
      const features = await repo.getFeaturesByPriority(priority);
      return successResponse({ features, count: features.length });
    }

    if (category === 'personas') {
      const personas = await repo.getPersonas();
      return successResponse({ personas, count: personas.length });
    }

    if (category === 'stats') {
      const stats = await repo.getResearchStats();
      return successResponse({ stats });
    }

    // Default: get research items
    if (type) {
      const research = await repo.getResearchByType(type);
      return successResponse({ research, count: research.length });
    }

    // Return all types summary
    const stats = await repo.getResearchStats();
    return successResponse({ stats });
  } catch (error) {
    logError(error as Error, request, CONTEXT);
    return errorResponse('Failed to fetch research data', 500, 'INTERNAL_ERROR');
  }
}

/**
 * POST /api/research
 * Save research data
 */
export async function POST(request: NextRequest) {
  try {
    const authResult = requireOrgId(request);
    if ('json' in authResult) return authResult;
    const { orgId } = authResult;

    logRequest(request, orgId, CONTEXT);

    const body = await parseBody<{
      category: 'research' | 'competitor' | 'feature' | 'persona' | 'bulk';
      data: unknown;
    }>(request);

    if (!body || !body.category || !body.data) {
      return errorResponse('Missing category or data', 400, 'INVALID_BODY');
    }

    const repo = new ResearchRepository(orgId);

    switch (body.category) {
      case 'research': {
        const research = body.data as Omit<MarketResearch, 'id' | 'created_at' | 'updated_at'>;
        const result = await repo.saveResearch(research);
        return successResponse({ saved: result, message: 'Research saved successfully' });
      }

      case 'competitor': {
        const competitor = body.data as Omit<CompetitorProfile, 'id' | 'last_updated'>;
        const result = await repo.saveCompetitor(competitor);
        return successResponse({ saved: result, message: 'Competitor profile saved' });
      }

      case 'feature': {
        const feature = body.data as Omit<FeatureInsight, 'id' | 'created_at' | 'updated_at'>;
        const result = await repo.saveFeatureInsight(feature);
        return successResponse({ saved: result, message: 'Feature insight saved' });
      }

      case 'persona': {
        const persona = body.data as Omit<UserPersona, 'id' | 'created_at'>;
        const result = await repo.savePersona(persona);
        return successResponse({ saved: result, message: 'User persona saved' });
      }

      case 'bulk': {
        const items = body.data as Array<Omit<MarketResearch, 'id' | 'created_at' | 'updated_at'>>;
        const savedCount = await repo.bulkSaveResearch(items);
        return successResponse({
          saved_count: savedCount,
          total: items.length,
          message: `Saved ${savedCount} of ${items.length} research items`
        });
      }

      default:
        return errorResponse('Invalid category', 400, 'INVALID_CATEGORY');
    }
  } catch (error) {
    logError(error as Error, request, CONTEXT);
    return errorResponse('Failed to save research data', 500, 'INTERNAL_ERROR');
  }
}

/**
 * OPTIONS /api/research
 */
export async function OPTIONS() {
  return handleOptions();
}

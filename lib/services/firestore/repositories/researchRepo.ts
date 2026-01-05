import { TenantCollection } from '@/lib/firestore/client';

export interface MarketResearch {
  id: string;
  title: string;
  category: string;
  findings: string[];
  created_at: string;
}

export interface CompetitorProfile {
  id: string;
  name: string;
  strengths: string[];
  weaknesses: string[];
}

export interface FeatureInsight {
  id: string;
  feature: string;
  priority: number;
  userDemand: string;
}

export interface UserPersona {
  id: string;
  name: string;
  description: string;
  goals: string[];
}

export class ResearchRepository {
  private collection: TenantCollection;

  constructor(orgId: string) {
    this.collection = new TenantCollection(orgId, 'research');
  }

  async getMarketResearch(): Promise<MarketResearch[]> {
    const { items } = await this.collection.list<MarketResearch>({ limit: 100 });
    return items;
  }

  async getCompetitors(): Promise<CompetitorProfile[]> {
    const { items } = await this.collection.list<CompetitorProfile>({
      limit: 50,
      filters: [{ field: 'type', operator: '==', value: 'competitor' }]
    });
    return items;
  }

  async saveResearch(data: Partial<MarketResearch>): Promise<{ id: string }> {
    return this.collection.create(data);
  }
}

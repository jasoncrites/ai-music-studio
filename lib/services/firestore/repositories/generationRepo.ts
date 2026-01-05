/**
 * Generation Repository
 * Track AI generations, costs, and history
 */

import {
  getFirestoreClient,
  Timestamp,
  FieldValue,
  DocumentSnapshot,
  Transaction,
} from '../client';
import {
  GenerationDocument,
  CreateGenerationInput,
  UpdateGenerationInput,
  GenerationStatus,
  GenerationType,
  COLLECTIONS,
} from '../collections';

// =============================================================================
// Types
// =============================================================================

export interface GenerationStats {
  totalCount: number;
  completedCount: number;
  failedCount: number;
  totalCostUSD: number;
  averageDuration: number;
  byType: Record<GenerationType, number>;
  byProvider: Record<string, number>;
}

export interface CostSummary {
  totalUSD: number;
  byType: Record<GenerationType, number>;
  byProvider: Record<string, number>;
  byMonth: Record<string, number>;
}

// =============================================================================
// Repository Class
// =============================================================================

export class GenerationRepository {
  private readonly collectionName = COLLECTIONS.GENERATIONS;

  /**
   * Get Firestore collection reference
   */
  private get collection() {
    return getFirestoreClient().collection(this.collectionName);
  }

  /**
   * Convert Firestore document to GenerationDocument
   */
  private fromFirestore(doc: DocumentSnapshot): GenerationDocument | null {
    if (!doc.exists) {
      return null;
    }
    return {
      id: doc.id,
      ...doc.data(),
    } as GenerationDocument;
  }

  // ===========================================================================
  // Create Operations
  // ===========================================================================

  /**
   * Create a new generation record
   */
  async create(input: CreateGenerationInput): Promise<GenerationDocument> {
    const now = Timestamp.now();
    const docRef = input.id ? this.collection.doc(input.id) : this.collection.doc();

    const generationData: Omit<GenerationDocument, 'id'> = {
      orgId: input.orgId,
      userId: input.userId,
      projectId: input.projectId,
      trackId: input.trackId,
      type: input.type,
      input: input.input,
      output: input.output,
      provider: input.provider,
      status: input.status || 'pending',
      queuedAt: input.queuedAt || now,
      startedAt: input.startedAt,
      completedAt: input.completedAt,
      cost: input.cost,
      error: input.error,
      createdAt: now,
      updatedAt: now,
      requestId: input.requestId,
      correlationId: input.correlationId,
    };

    await docRef.set(generationData);

    return {
      id: docRef.id,
      ...generationData,
    };
  }

  /**
   * Queue a new generation
   */
  async queueGeneration(
    orgId: string,
    userId: string,
    type: GenerationType,
    input: GenerationDocument['input'],
    provider: GenerationDocument['provider'],
    estimatedCost: number,
    options?: {
      projectId?: string;
      trackId?: string;
      correlationId?: string;
    }
  ): Promise<GenerationDocument> {
    return this.create({
      orgId,
      userId,
      type,
      input,
      provider,
      status: 'pending',
      queuedAt: Timestamp.now(),
      cost: {
        estimatedUSD: estimatedCost,
      },
      projectId: options?.projectId,
      trackId: options?.trackId,
      correlationId: options?.correlationId,
    });
  }

  // ===========================================================================
  // Read Operations
  // ===========================================================================

  /**
   * Get generation by ID
   */
  async getById(generationId: string): Promise<GenerationDocument | null> {
    const doc = await this.collection.doc(generationId).get();
    return this.fromFirestore(doc);
  }

  /**
   * Get generation by request ID (external provider ID)
   */
  async getByRequestId(requestId: string): Promise<GenerationDocument | null> {
    const snapshot = await this.collection
      .where('requestId', '==', requestId)
      .limit(1)
      .get();

    if (snapshot.empty) {
      return null;
    }

    return this.fromFirestore(snapshot.docs[0]);
  }

  /**
   * List generations by user
   */
  async listByUser(
    orgId: string,
    userId: string,
    options: {
      limit?: number;
      offset?: number;
      status?: GenerationStatus;
      type?: GenerationType;
      startDate?: Date;
      endDate?: Date;
    } = {}
  ): Promise<{ generations: GenerationDocument[]; total: number }> {
    const { limit = 50, offset = 0, status, type, startDate, endDate } = options;

    let query = this.collection
      .where('orgId', '==', orgId)
      .where('userId', '==', userId);

    if (status) {
      query = query.where('status', '==', status);
    }

    if (type) {
      query = query.where('type', '==', type);
    }

    if (startDate) {
      query = query.where('createdAt', '>=', Timestamp.fromDate(startDate));
    }

    if (endDate) {
      query = query.where('createdAt', '<=', Timestamp.fromDate(endDate));
    }

    query = query.orderBy('createdAt', 'desc');

    const countSnapshot = await query.count().get();
    const total = countSnapshot.data().count;

    const snapshot = await query.offset(offset).limit(limit).get();

    const generations = snapshot.docs
      .map((doc) => this.fromFirestore(doc))
      .filter((gen): gen is GenerationDocument => gen !== null);

    return { generations, total };
  }

  /**
   * List generations by project
   */
  async listByProject(
    projectId: string,
    options: {
      limit?: number;
      status?: GenerationStatus;
    } = {}
  ): Promise<GenerationDocument[]> {
    const { limit = 100, status } = options;

    let query = this.collection.where('projectId', '==', projectId);

    if (status) {
      query = query.where('status', '==', status);
    }

    query = query.orderBy('createdAt', 'desc').limit(limit);

    const snapshot = await query.get();

    return snapshot.docs
      .map((doc) => this.fromFirestore(doc))
      .filter((gen): gen is GenerationDocument => gen !== null);
  }

  /**
   * List pending generations
   */
  async listPending(orgId: string, limit: number = 100): Promise<GenerationDocument[]> {
    const snapshot = await this.collection
      .where('orgId', '==', orgId)
      .where('status', 'in', ['pending', 'processing'])
      .orderBy('queuedAt', 'asc')
      .limit(limit)
      .get();

    return snapshot.docs
      .map((doc) => this.fromFirestore(doc))
      .filter((gen): gen is GenerationDocument => gen !== null);
  }

  /**
   * Get recent generations for a user
   */
  async listRecent(
    orgId: string,
    userId: string,
    limit: number = 10
  ): Promise<GenerationDocument[]> {
    const snapshot = await this.collection
      .where('orgId', '==', orgId)
      .where('userId', '==', userId)
      .orderBy('createdAt', 'desc')
      .limit(limit)
      .get();

    return snapshot.docs
      .map((doc) => this.fromFirestore(doc))
      .filter((gen): gen is GenerationDocument => gen !== null);
  }

  // ===========================================================================
  // Update Operations
  // ===========================================================================

  /**
   * Update generation
   */
  async update(
    generationId: string,
    input: UpdateGenerationInput
  ): Promise<GenerationDocument> {
    const docRef = this.collection.doc(generationId);

    const updateData = {
      ...input,
      updatedAt: Timestamp.now(),
    };

    await docRef.update(updateData);

    const updated = await docRef.get();
    const result = this.fromFirestore(updated);

    if (!result) {
      throw new Error(`Generation ${generationId} not found after update`);
    }

    return result;
  }

  /**
   * Mark generation as processing
   */
  async markProcessing(generationId: string, requestId?: string): Promise<void> {
    const updates: Record<string, unknown> = {
      status: 'processing',
      startedAt: Timestamp.now(),
      updatedAt: Timestamp.now(),
    };

    if (requestId) {
      updates.requestId = requestId;
    }

    await this.collection.doc(generationId).update(updates);
  }

  /**
   * Mark generation as completed
   */
  async markCompleted(
    generationId: string,
    output: GenerationDocument['output'],
    actualCost?: number
  ): Promise<GenerationDocument> {
    const updates: Record<string, unknown> = {
      status: 'completed',
      output,
      completedAt: Timestamp.now(),
      updatedAt: Timestamp.now(),
    };

    if (actualCost !== undefined) {
      updates['cost.actualUSD'] = actualCost;
    }

    await this.collection.doc(generationId).update(updates);

    const doc = await this.collection.doc(generationId).get();
    return this.fromFirestore(doc)!;
  }

  /**
   * Mark generation as failed
   */
  async markFailed(
    generationId: string,
    error: {
      code: string;
      message: string;
      retryable: boolean;
    }
  ): Promise<void> {
    const doc = await this.collection.doc(generationId).get();
    const generation = this.fromFirestore(doc);

    const currentAttempts = generation?.error?.attempts || 0;

    await this.collection.doc(generationId).update({
      status: 'failed',
      error: {
        ...error,
        attempts: currentAttempts + 1,
      },
      completedAt: Timestamp.now(),
      updatedAt: Timestamp.now(),
    });
  }

  /**
   * Cancel generation
   */
  async cancel(generationId: string): Promise<void> {
    await this.collection.doc(generationId).update({
      status: 'cancelled',
      completedAt: Timestamp.now(),
      updatedAt: Timestamp.now(),
    });
  }

  /**
   * Retry failed generation
   */
  async retry(generationId: string): Promise<GenerationDocument> {
    const doc = await this.collection.doc(generationId).get();
    const generation = this.fromFirestore(doc);

    if (!generation) {
      throw new Error(`Generation ${generationId} not found`);
    }

    if (generation.status !== 'failed') {
      throw new Error(`Cannot retry generation with status ${generation.status}`);
    }

    await this.collection.doc(generationId).update({
      status: 'pending',
      queuedAt: Timestamp.now(),
      startedAt: null,
      completedAt: null,
      updatedAt: Timestamp.now(),
    });

    const updated = await this.collection.doc(generationId).get();
    return this.fromFirestore(updated)!;
  }

  // ===========================================================================
  // Statistics & Analytics
  // ===========================================================================

  /**
   * Get generation statistics for a user
   */
  async getUserStats(
    orgId: string,
    userId: string,
    startDate?: Date,
    endDate?: Date
  ): Promise<GenerationStats> {
    let query = this.collection
      .where('orgId', '==', orgId)
      .where('userId', '==', userId);

    if (startDate) {
      query = query.where('createdAt', '>=', Timestamp.fromDate(startDate));
    }

    if (endDate) {
      query = query.where('createdAt', '<=', Timestamp.fromDate(endDate));
    }

    const snapshot = await query.get();

    const stats: GenerationStats = {
      totalCount: 0,
      completedCount: 0,
      failedCount: 0,
      totalCostUSD: 0,
      averageDuration: 0,
      byType: {} as Record<GenerationType, number>,
      byProvider: {},
    };

    let totalDuration = 0;
    let durationCount = 0;

    for (const doc of snapshot.docs) {
      const gen = this.fromFirestore(doc);
      if (!gen) continue;

      stats.totalCount++;

      if (gen.status === 'completed') {
        stats.completedCount++;
      } else if (gen.status === 'failed') {
        stats.failedCount++;
      }

      stats.totalCostUSD += gen.cost.actualUSD || gen.cost.estimatedUSD || 0;

      // By type
      stats.byType[gen.type] = (stats.byType[gen.type] || 0) + 1;

      // By provider
      stats.byProvider[gen.provider.name] =
        (stats.byProvider[gen.provider.name] || 0) + 1;

      // Duration calculation
      if (gen.output?.duration) {
        totalDuration += gen.output.duration;
        durationCount++;
      }
    }

    stats.averageDuration = durationCount > 0 ? totalDuration / durationCount : 0;

    return stats;
  }

  /**
   * Get cost summary for a user
   */
  async getCostSummary(
    orgId: string,
    userId: string,
    months: number = 12
  ): Promise<CostSummary> {
    const startDate = new Date();
    startDate.setMonth(startDate.getMonth() - months);

    const snapshot = await this.collection
      .where('orgId', '==', orgId)
      .where('userId', '==', userId)
      .where('createdAt', '>=', Timestamp.fromDate(startDate))
      .get();

    const summary: CostSummary = {
      totalUSD: 0,
      byType: {} as Record<GenerationType, number>,
      byProvider: {},
      byMonth: {},
    };

    for (const doc of snapshot.docs) {
      const gen = this.fromFirestore(doc);
      if (!gen) continue;

      const cost = gen.cost.actualUSD || gen.cost.estimatedUSD || 0;

      summary.totalUSD += cost;

      // By type
      summary.byType[gen.type] = (summary.byType[gen.type] || 0) + cost;

      // By provider
      summary.byProvider[gen.provider.name] =
        (summary.byProvider[gen.provider.name] || 0) + cost;

      // By month
      const date = gen.createdAt.toDate();
      const monthKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
      summary.byMonth[monthKey] = (summary.byMonth[monthKey] || 0) + cost;
    }

    return summary;
  }

  /**
   * Get organization-wide usage stats
   */
  async getOrgStats(
    orgId: string,
    startDate?: Date,
    endDate?: Date
  ): Promise<GenerationStats & { uniqueUsers: number }> {
    let query = this.collection.where('orgId', '==', orgId);

    if (startDate) {
      query = query.where('createdAt', '>=', Timestamp.fromDate(startDate));
    }

    if (endDate) {
      query = query.where('createdAt', '<=', Timestamp.fromDate(endDate));
    }

    const snapshot = await query.get();

    const uniqueUserIds = new Set<string>();
    const stats: GenerationStats = {
      totalCount: 0,
      completedCount: 0,
      failedCount: 0,
      totalCostUSD: 0,
      averageDuration: 0,
      byType: {} as Record<GenerationType, number>,
      byProvider: {},
    };

    let totalDuration = 0;
    let durationCount = 0;

    for (const doc of snapshot.docs) {
      const gen = this.fromFirestore(doc);
      if (!gen) continue;

      uniqueUserIds.add(gen.userId);
      stats.totalCount++;

      if (gen.status === 'completed') {
        stats.completedCount++;
      } else if (gen.status === 'failed') {
        stats.failedCount++;
      }

      stats.totalCostUSD += gen.cost.actualUSD || gen.cost.estimatedUSD || 0;
      stats.byType[gen.type] = (stats.byType[gen.type] || 0) + 1;
      stats.byProvider[gen.provider.name] =
        (stats.byProvider[gen.provider.name] || 0) + 1;

      if (gen.output?.duration) {
        totalDuration += gen.output.duration;
        durationCount++;
      }
    }

    stats.averageDuration = durationCount > 0 ? totalDuration / durationCount : 0;

    return {
      ...stats,
      uniqueUsers: uniqueUserIds.size,
    };
  }

  // ===========================================================================
  // Delete Operations
  // ===========================================================================

  /**
   * Delete generation record
   */
  async delete(generationId: string): Promise<void> {
    await this.collection.doc(generationId).delete();
  }

  /**
   * Delete all generations for a project
   */
  async deleteByProject(projectId: string): Promise<number> {
    const db = getFirestoreClient();
    const snapshot = await this.collection
      .where('projectId', '==', projectId)
      .get();

    if (snapshot.empty) {
      return 0;
    }

    const batch = db.batch();
    for (const doc of snapshot.docs) {
      batch.delete(doc.ref);
    }

    await batch.commit();
    return snapshot.size;
  }

  /**
   * Delete old generations (for cleanup)
   */
  async deleteOlderThan(orgId: string, days: number): Promise<number> {
    const db = getFirestoreClient();
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - days);

    const snapshot = await this.collection
      .where('orgId', '==', orgId)
      .where('createdAt', '<', Timestamp.fromDate(cutoffDate))
      .limit(500) // Batch limit
      .get();

    if (snapshot.empty) {
      return 0;
    }

    const batch = db.batch();
    for (const doc of snapshot.docs) {
      batch.delete(doc.ref);
    }

    await batch.commit();
    return snapshot.size;
  }
}

// =============================================================================
// Singleton Instance
// =============================================================================

let generationRepositoryInstance: GenerationRepository | null = null;

export function getGenerationRepository(): GenerationRepository {
  if (!generationRepositoryInstance) {
    generationRepositoryInstance = new GenerationRepository();
  }
  return generationRepositoryInstance;
}

// For testing
export function resetGenerationRepository(): void {
  generationRepositoryInstance = null;
}

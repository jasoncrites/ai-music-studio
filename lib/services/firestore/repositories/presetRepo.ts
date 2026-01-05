/**
 * Preset Repository
 * CRUD operations for shared effect presets
 */

import {
  getFirestoreClient,
  Timestamp,
  FieldValue,
  DocumentSnapshot,
} from '../client';
import {
  PresetDocument,
  CreatePresetInput,
  UpdatePresetInput,
  PresetType,
  COLLECTIONS,
} from '../collections';

// =============================================================================
// Repository Class
// =============================================================================

export class PresetRepository {
  private readonly collectionName = COLLECTIONS.PRESETS;

  /**
   * Get Firestore collection reference
   */
  private get collection() {
    return getFirestoreClient().collection(this.collectionName);
  }

  /**
   * Convert Firestore document to PresetDocument
   */
  private fromFirestore(doc: DocumentSnapshot): PresetDocument | null {
    if (!doc.exists) {
      return null;
    }
    return {
      id: doc.id,
      ...doc.data(),
    } as PresetDocument;
  }

  // ===========================================================================
  // Create Operations
  // ===========================================================================

  /**
   * Create a new preset
   */
  async create(input: CreatePresetInput): Promise<PresetDocument> {
    const now = Timestamp.now();
    const docRef = input.id ? this.collection.doc(input.id) : this.collection.doc();

    const presetData: Omit<PresetDocument, 'id'> = {
      orgId: input.orgId,
      userId: input.userId,
      name: input.name,
      description: input.description,
      type: input.type,
      category: input.category,
      tags: input.tags || [],
      settings: input.settings,
      isPublic: input.isPublic ?? false,
      isOfficial: input.isOfficial ?? false,
      usageCount: 0,
      favoriteCount: 0,
      rating: input.rating,
      createdAt: now,
      updatedAt: now,
      previewAudioUrl: input.previewAudioUrl,
      version: 1,
      changelog: input.changelog,
    };

    await docRef.set(presetData);

    return {
      id: docRef.id,
      ...presetData,
    };
  }

  // ===========================================================================
  // Read Operations
  // ===========================================================================

  /**
   * Get preset by ID
   */
  async getById(presetId: string): Promise<PresetDocument | null> {
    const doc = await this.collection.doc(presetId).get();
    return this.fromFirestore(doc);
  }

  /**
   * List presets by user
   */
  async listByUser(
    orgId: string,
    userId: string,
    options: {
      limit?: number;
      offset?: number;
      type?: PresetType;
      category?: string;
    } = {}
  ): Promise<{ presets: PresetDocument[]; total: number }> {
    const { limit = 50, offset = 0, type, category } = options;

    let query = this.collection
      .where('orgId', '==', orgId)
      .where('userId', '==', userId);

    if (type) {
      query = query.where('type', '==', type);
    }

    if (category) {
      query = query.where('category', '==', category);
    }

    query = query.orderBy('updatedAt', 'desc');

    const countSnapshot = await query.count().get();
    const total = countSnapshot.data().count;

    const snapshot = await query.offset(offset).limit(limit).get();

    const presets = snapshot.docs
      .map((doc) => this.fromFirestore(doc))
      .filter((preset): preset is PresetDocument => preset !== null);

    return { presets, total };
  }

  /**
   * List public presets
   */
  async listPublic(
    options: {
      limit?: number;
      offset?: number;
      type?: PresetType;
      category?: string;
      sortBy?: 'usageCount' | 'favoriteCount' | 'rating' | 'createdAt';
    } = {}
  ): Promise<{ presets: PresetDocument[]; total: number }> {
    const { limit = 50, offset = 0, type, category, sortBy = 'usageCount' } = options;

    let query = this.collection.where('isPublic', '==', true);

    if (type) {
      query = query.where('type', '==', type);
    }

    if (category) {
      query = query.where('category', '==', category);
    }

    // Sort by the specified field
    if (sortBy === 'rating') {
      query = query.orderBy('rating.average', 'desc');
    } else {
      query = query.orderBy(sortBy, 'desc');
    }

    const countSnapshot = await query.count().get();
    const total = countSnapshot.data().count;

    const snapshot = await query.offset(offset).limit(limit).get();

    const presets = snapshot.docs
      .map((doc) => this.fromFirestore(doc))
      .filter((preset): preset is PresetDocument => preset !== null);

    return { presets, total };
  }

  /**
   * List official/system presets
   */
  async listOfficial(
    options: {
      type?: PresetType;
      category?: string;
    } = {}
  ): Promise<PresetDocument[]> {
    const { type, category } = options;

    let query = this.collection.where('isOfficial', '==', true);

    if (type) {
      query = query.where('type', '==', type);
    }

    if (category) {
      query = query.where('category', '==', category);
    }

    query = query.orderBy('name', 'asc');

    const snapshot = await query.get();

    return snapshot.docs
      .map((doc) => this.fromFirestore(doc))
      .filter((preset): preset is PresetDocument => preset !== null);
  }

  /**
   * Search presets by name or tags
   */
  async search(
    searchTerm: string,
    options: {
      orgId?: string;
      userId?: string;
      includePublic?: boolean;
      type?: PresetType;
      limit?: number;
    } = {}
  ): Promise<PresetDocument[]> {
    const { orgId, userId, includePublic = true, type, limit = 20 } = options;

    const results: PresetDocument[] = [];

    // Search by name prefix
    const endTerm = searchTerm + '\uf8ff';
    let query = this.collection
      .where('name', '>=', searchTerm)
      .where('name', '<=', endTerm);

    if (type) {
      query = query.where('type', '==', type);
    }

    const snapshot = await query.limit(limit).get();

    for (const doc of snapshot.docs) {
      const preset = this.fromFirestore(doc);
      if (!preset) continue;

      // Filter by access
      if (preset.isPublic && includePublic) {
        results.push(preset);
      } else if (preset.isOfficial) {
        results.push(preset);
      } else if (orgId && preset.orgId === orgId) {
        if (!userId || preset.userId === userId) {
          results.push(preset);
        }
      }
    }

    return results.slice(0, limit);
  }

  /**
   * Get popular presets
   */
  async listPopular(
    type?: PresetType,
    limit: number = 10
  ): Promise<PresetDocument[]> {
    let query = this.collection.where('isPublic', '==', true);

    if (type) {
      query = query.where('type', '==', type);
    }

    query = query.orderBy('usageCount', 'desc').limit(limit);

    const snapshot = await query.get();

    return snapshot.docs
      .map((doc) => this.fromFirestore(doc))
      .filter((preset): preset is PresetDocument => preset !== null);
  }

  /**
   * Get presets by tags
   */
  async listByTag(
    tag: string,
    options: {
      isPublic?: boolean;
      limit?: number;
    } = {}
  ): Promise<PresetDocument[]> {
    const { isPublic = true, limit = 50 } = options;

    let query = this.collection.where('tags', 'array-contains', tag);

    if (isPublic) {
      query = query.where('isPublic', '==', true);
    }

    query = query.orderBy('usageCount', 'desc').limit(limit);

    const snapshot = await query.get();

    return snapshot.docs
      .map((doc) => this.fromFirestore(doc))
      .filter((preset): preset is PresetDocument => preset !== null);
  }

  // ===========================================================================
  // Update Operations
  // ===========================================================================

  /**
   * Update preset
   */
  async update(presetId: string, input: UpdatePresetInput): Promise<PresetDocument> {
    const docRef = this.collection.doc(presetId);

    const updateData = {
      ...input,
      updatedAt: Timestamp.now(),
    };

    // Increment version if settings changed
    if (input.settings) {
      updateData.version = FieldValue.increment(1) as unknown as number;
    }

    await docRef.update(updateData);

    const updated = await docRef.get();
    const result = this.fromFirestore(updated);

    if (!result) {
      throw new Error(`Preset ${presetId} not found after update`);
    }

    return result;
  }

  /**
   * Increment usage count
   */
  async incrementUsage(presetId: string): Promise<void> {
    await this.collection.doc(presetId).update({
      usageCount: FieldValue.increment(1),
    });
  }

  /**
   * Increment favorite count
   */
  async incrementFavorite(presetId: string): Promise<void> {
    await this.collection.doc(presetId).update({
      favoriteCount: FieldValue.increment(1),
    });
  }

  /**
   * Decrement favorite count
   */
  async decrementFavorite(presetId: string): Promise<void> {
    await this.collection.doc(presetId).update({
      favoriteCount: FieldValue.increment(-1),
    });
  }

  /**
   * Update rating
   */
  async updateRating(
    presetId: string,
    newRating: number,
    currentAverage: number,
    currentCount: number
  ): Promise<void> {
    // Calculate new average
    const newCount = currentCount + 1;
    const newAverage = (currentAverage * currentCount + newRating) / newCount;

    await this.collection.doc(presetId).update({
      'rating.average': newAverage,
      'rating.count': newCount,
      updatedAt: Timestamp.now(),
    });
  }

  /**
   * Toggle public visibility
   */
  async setPublic(presetId: string, isPublic: boolean): Promise<void> {
    await this.collection.doc(presetId).update({
      isPublic,
      updatedAt: Timestamp.now(),
    });
  }

  // ===========================================================================
  // Delete Operations
  // ===========================================================================

  /**
   * Delete preset
   */
  async delete(presetId: string): Promise<void> {
    await this.collection.doc(presetId).delete();
  }

  /**
   * Delete all presets by user
   */
  async deleteByUser(orgId: string, userId: string): Promise<number> {
    const db = getFirestoreClient();
    const snapshot = await this.collection
      .where('orgId', '==', orgId)
      .where('userId', '==', userId)
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

  // ===========================================================================
  // Utility Methods
  // ===========================================================================

  /**
   * Duplicate a preset
   */
  async duplicate(
    presetId: string,
    newOrgId: string,
    newUserId: string,
    newName?: string
  ): Promise<PresetDocument> {
    const original = await this.getById(presetId);
    if (!original) {
      throw new Error(`Preset ${presetId} not found`);
    }

    return this.create({
      orgId: newOrgId,
      userId: newUserId,
      name: newName || `${original.name} (Copy)`,
      description: original.description,
      type: original.type,
      category: original.category,
      tags: original.tags,
      settings: original.settings,
      isPublic: false, // Copies are private by default
      isOfficial: false,
      previewAudioUrl: original.previewAudioUrl,
    });
  }

  /**
   * Check if user owns preset
   */
  async isOwner(presetId: string, userId: string): Promise<boolean> {
    const preset = await this.getById(presetId);
    return preset?.userId === userId;
  }

  /**
   * Get preset categories
   */
  async getCategories(type?: PresetType): Promise<string[]> {
    let query = this.collection.where('isPublic', '==', true);

    if (type) {
      query = query.where('type', '==', type);
    }

    const snapshot = await query.select('category').get();

    const categories = new Set<string>();
    for (const doc of snapshot.docs) {
      const data = doc.data();
      if (data.category) {
        categories.add(data.category);
      }
    }

    return Array.from(categories).sort();
  }
}

// =============================================================================
// Singleton Instance
// =============================================================================

let presetRepositoryInstance: PresetRepository | null = null;

export function getPresetRepository(): PresetRepository {
  if (!presetRepositoryInstance) {
    presetRepositoryInstance = new PresetRepository();
  }
  return presetRepositoryInstance;
}

// For testing
export function resetPresetRepository(): void {
  presetRepositoryInstance = null;
}

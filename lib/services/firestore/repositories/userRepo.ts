/**
 * User Repository
 * CRUD operations for user profiles and subscription management
 */

import {
  getFirestoreClient,
  Timestamp,
  FieldValue,
  DocumentSnapshot,
} from '../client';
import {
  UserDocument,
  CreateUserInput,
  UpdateUserInput,
  SubscriptionTier,
  COLLECTIONS,
} from '../collections';

// =============================================================================
// Repository Class
// =============================================================================

export class UserRepository {
  private readonly collectionName = COLLECTIONS.USERS;

  /**
   * Get Firestore collection reference
   */
  private get collection() {
    return getFirestoreClient().collection(this.collectionName);
  }

  /**
   * Convert Firestore document to UserDocument
   */
  private fromFirestore(doc: DocumentSnapshot): UserDocument | null {
    if (!doc.exists) {
      return null;
    }
    return {
      id: doc.id,
      ...doc.data(),
    } as UserDocument;
  }

  // ===========================================================================
  // Create Operations
  // ===========================================================================

  /**
   * Create a new user
   */
  async create(input: CreateUserInput): Promise<UserDocument> {
    const now = Timestamp.now();
    const docRef = input.id ? this.collection.doc(input.id) : this.collection.doc();

    const userData: Omit<UserDocument, 'id'> = {
      orgId: input.orgId,
      email: input.email,
      displayName: input.displayName,
      photoUrl: input.photoUrl,
      artistName: input.artistName,
      bio: input.bio,
      genres: input.genres || [],
      socialLinks: input.socialLinks || {},
      subscription: input.subscription || {
        tier: 'free',
        status: 'active',
        currentPeriodStart: now,
        currentPeriodEnd: Timestamp.fromDate(
          new Date(Date.now() + 30 * 24 * 60 * 60 * 1000) // 30 days
        ),
      },
      usage: input.usage || {
        generationsThisMonth: 0,
        storageUsedBytes: 0,
        lastResetDate: now,
      },
      preferences: input.preferences || {
        emailNotifications: true,
        marketingEmails: false,
        theme: 'system',
      },
      createdAt: now,
      updatedAt: now,
      lastLoginAt: input.lastLoginAt,
      isActive: input.isActive ?? true,
    };

    await docRef.set(userData);

    return {
      id: docRef.id,
      ...userData,
    };
  }

  // ===========================================================================
  // Read Operations
  // ===========================================================================

  /**
   * Get user by ID
   */
  async getById(userId: string): Promise<UserDocument | null> {
    const doc = await this.collection.doc(userId).get();
    return this.fromFirestore(doc);
  }

  /**
   * Get user by email within an organization
   */
  async getByEmail(orgId: string, email: string): Promise<UserDocument | null> {
    const snapshot = await this.collection
      .where('orgId', '==', orgId)
      .where('email', '==', email)
      .limit(1)
      .get();

    if (snapshot.empty) {
      return null;
    }

    return this.fromFirestore(snapshot.docs[0]);
  }

  /**
   * List users by organization
   */
  async listByOrg(
    orgId: string,
    options: {
      limit?: number;
      offset?: number;
      activeOnly?: boolean;
    } = {}
  ): Promise<{ users: UserDocument[]; total: number }> {
    const { limit = 50, offset = 0, activeOnly = true } = options;

    let query = this.collection.where('orgId', '==', orgId);

    if (activeOnly) {
      query = query.where('isActive', '==', true);
    }

    query = query.orderBy('createdAt', 'desc');

    // Get total count (in a real app, maintain a counter document)
    const countSnapshot = await query.count().get();
    const total = countSnapshot.data().count;

    // Get paginated results
    const snapshot = await query.offset(offset).limit(limit).get();

    const users = snapshot.docs
      .map((doc) => this.fromFirestore(doc))
      .filter((user): user is UserDocument => user !== null);

    return { users, total };
  }

  /**
   * List users by subscription tier
   */
  async listByTier(
    orgId: string,
    tier: SubscriptionTier,
    limit: number = 50
  ): Promise<UserDocument[]> {
    const snapshot = await this.collection
      .where('orgId', '==', orgId)
      .where('subscription.tier', '==', tier)
      .where('isActive', '==', true)
      .orderBy('createdAt', 'desc')
      .limit(limit)
      .get();

    return snapshot.docs
      .map((doc) => this.fromFirestore(doc))
      .filter((user): user is UserDocument => user !== null);
  }

  // ===========================================================================
  // Update Operations
  // ===========================================================================

  /**
   * Update user document
   */
  async update(userId: string, input: UpdateUserInput): Promise<UserDocument> {
    const docRef = this.collection.doc(userId);

    const updateData = {
      ...input,
      updatedAt: Timestamp.now(),
    };

    await docRef.update(updateData);

    const updated = await docRef.get();
    const result = this.fromFirestore(updated);

    if (!result) {
      throw new Error(`User ${userId} not found after update`);
    }

    return result;
  }

  /**
   * Update subscription tier
   */
  async updateSubscription(
    userId: string,
    subscription: Partial<UserDocument['subscription']>
  ): Promise<UserDocument> {
    const docRef = this.collection.doc(userId);

    const updateData: Record<string, unknown> = {
      updatedAt: Timestamp.now(),
    };

    // Flatten subscription updates for Firestore dot notation
    for (const [key, value] of Object.entries(subscription)) {
      if (value !== undefined) {
        updateData[`subscription.${key}`] = value;
      }
    }

    await docRef.update(updateData);

    const updated = await docRef.get();
    const result = this.fromFirestore(updated);

    if (!result) {
      throw new Error(`User ${userId} not found after subscription update`);
    }

    return result;
  }

  /**
   * Record login
   */
  async recordLogin(userId: string): Promise<void> {
    await this.collection.doc(userId).update({
      lastLoginAt: Timestamp.now(),
      updatedAt: Timestamp.now(),
    });
  }

  /**
   * Increment generation usage
   */
  async incrementGenerationUsage(userId: string, count: number = 1): Promise<void> {
    await this.collection.doc(userId).update({
      'usage.generationsThisMonth': FieldValue.increment(count),
      updatedAt: Timestamp.now(),
    });
  }

  /**
   * Update storage usage
   */
  async updateStorageUsage(userId: string, bytesChange: number): Promise<void> {
    await this.collection.doc(userId).update({
      'usage.storageUsedBytes': FieldValue.increment(bytesChange),
      updatedAt: Timestamp.now(),
    });
  }

  /**
   * Reset monthly usage counters
   */
  async resetMonthlyUsage(userId: string): Promise<void> {
    await this.collection.doc(userId).update({
      'usage.generationsThisMonth': 0,
      'usage.lastResetDate': Timestamp.now(),
      updatedAt: Timestamp.now(),
    });
  }

  // ===========================================================================
  // Delete Operations
  // ===========================================================================

  /**
   * Soft delete user (mark as inactive)
   */
  async softDelete(userId: string): Promise<void> {
    await this.collection.doc(userId).update({
      isActive: false,
      'subscription.status': 'cancelled',
      updatedAt: Timestamp.now(),
    });
  }

  /**
   * Hard delete user (permanent)
   */
  async hardDelete(userId: string): Promise<void> {
    await this.collection.doc(userId).delete();
  }

  // ===========================================================================
  // Utility Methods
  // ===========================================================================

  /**
   * Check if email exists in organization
   */
  async emailExists(orgId: string, email: string): Promise<boolean> {
    const snapshot = await this.collection
      .where('orgId', '==', orgId)
      .where('email', '==', email)
      .limit(1)
      .get();

    return !snapshot.empty;
  }

  /**
   * Get user's remaining generations for the month
   */
  async getRemainingGenerations(userId: string): Promise<number> {
    const user = await this.getById(userId);
    if (!user) {
      return 0;
    }

    const limits: Record<SubscriptionTier, number> = {
      free: 10,
      pro: 100,
      studio: 500,
      enterprise: -1, // Unlimited
    };

    const limit = limits[user.subscription.tier];
    if (limit === -1) {
      return Infinity;
    }

    return Math.max(0, limit - user.usage.generationsThisMonth);
  }
}

// =============================================================================
// Singleton Instance
// =============================================================================

let userRepositoryInstance: UserRepository | null = null;

export function getUserRepository(): UserRepository {
  if (!userRepositoryInstance) {
    userRepositoryInstance = new UserRepository();
  }
  return userRepositoryInstance;
}

// For testing
export function resetUserRepository(): void {
  userRepositoryInstance = null;
}

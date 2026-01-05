/**
 * Firestore Client for AI Music Studio
 * Multi-tenant aware with org_id isolation
 */

import * as admin from 'firebase-admin';

let app: admin.app.App | undefined;
let db: admin.firestore.Firestore | undefined;

/**
 * Initialize Firebase Admin SDK
 * Uses GOOGLE_APPLICATION_CREDENTIALS or explicit service account
 */
export function initFirestore(): admin.firestore.Firestore {
  if (db) return db;

  if (admin.apps.length === 0) {
    // Initialize with default credentials (Cloud Run uses metadata server)
    if (process.env.GOOGLE_APPLICATION_CREDENTIALS) {
      app = admin.initializeApp({
        credential: admin.credential.cert(process.env.GOOGLE_APPLICATION_CREDENTIALS),
        projectId: process.env.GOOGLE_CLOUD_PROJECT || process.env.GCP_PROJECT,
      });
    } else if (process.env.FIREBASE_SERVICE_ACCOUNT) {
      // Parse service account from environment variable
      const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
      app = admin.initializeApp({
        credential: admin.credential.cert(serviceAccount),
        projectId: serviceAccount.project_id,
      });
    } else {
      // Default initialization for Cloud Run (uses metadata server)
      app = admin.initializeApp({
        projectId: process.env.GOOGLE_CLOUD_PROJECT || process.env.GCP_PROJECT,
      });
    }
  } else {
    app = admin.apps[0] as admin.app.App;
  }

  db = admin.firestore(app);

  // Configure Firestore to ignore undefined properties
  // This prevents errors when saving documents with undefined fields
  db.settings({
    ignoreUndefinedProperties: true,
  });

  return db;
}

/**
 * Get Firestore instance (initializes if needed)
 */
export function getDb(): admin.firestore.Firestore {
  if (!db) {
    return initFirestore();
  }
  return db;
}

// Type alias for filter operators
type WhereFilterOp = '<' | '<=' | '==' | '!=' | '>=' | '>' | 'array-contains' | 'in' | 'not-in' | 'array-contains-any';

/**
 * Multi-tenant collection helpers
 * All collections are prefixed with org_id for tenant isolation
 */
export class TenantCollection {
  private db: admin.firestore.Firestore;
  private orgId: string;
  private collectionName: string;

  constructor(orgId: string, collectionName: string) {
    this.db = getDb();
    this.orgId = orgId;
    this.collectionName = collectionName;
  }

  /**
   * Get the tenant-scoped collection reference
   * Pattern: orgs/{org_id}/{collection}
   */
  get collection() {
    return this.db.collection('orgs').doc(this.orgId).collection(this.collectionName);
  }

  /**
   * Create a new document
   */
  async create<T extends Record<string, unknown>>(data: T): Promise<{ id: string; data: T }> {
    const docRef = this.collection.doc();
    const timestamp = admin.firestore.FieldValue.serverTimestamp();
    const docData = {
      ...data,
      org_id: this.orgId,
      created_at: timestamp,
      updated_at: timestamp,
    };

    await docRef.set(docData);

    return {
      id: docRef.id,
      data: {
        ...data,
        org_id: this.orgId,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      } as T,
    };
  }

  /**
   * Get a document by ID
   */
  async get<T>(id: string): Promise<T | null> {
    const doc = await this.collection.doc(id).get();
    if (!doc.exists) return null;

    return this.transformDoc<T>(doc);
  }

  /**
   * Update a document
   */
  async update<T>(id: string, data: Partial<T>): Promise<T | null> {
    const docRef = this.collection.doc(id);
    const doc = await docRef.get();

    if (!doc.exists) return null;

    const updateData = {
      ...data,
      updated_at: admin.firestore.FieldValue.serverTimestamp(),
    };

    await docRef.update(updateData);

    const updated = await docRef.get();
    return this.transformDoc<T>(updated);
  }

  /**
   * Delete a document
   */
  async delete(id: string): Promise<boolean> {
    const docRef = this.collection.doc(id);
    const doc = await docRef.get();

    if (!doc.exists) return false;

    await docRef.delete();
    return true;
  }

  /**
   * List documents with optional filters
   */
  async list<T>(options?: {
    limit?: number;
    offset?: number;
    orderBy?: string;
    orderDirection?: 'asc' | 'desc';
    filters?: Array<{ field: string; operator: WhereFilterOp; value: unknown }>;
  }): Promise<{ items: T[]; total: number }> {
    let query: admin.firestore.Query = this.collection;

    // Apply filters
    if (options?.filters) {
      for (const filter of options.filters) {
        query = query.where(filter.field, filter.operator, filter.value);
      }
    }

    // Get total count (without pagination)
    const countSnapshot = await query.count().get();
    const total = countSnapshot.data().count;

    // Apply ordering
    if (options?.orderBy) {
      query = query.orderBy(options.orderBy, options.orderDirection || 'desc');
    } else {
      query = query.orderBy('created_at', 'desc');
    }

    // Apply pagination
    if (options?.offset) {
      query = query.offset(options.offset);
    }
    if (options?.limit) {
      query = query.limit(options.limit);
    }

    const snapshot = await query.get();
    const items = snapshot.docs.map((doc: admin.firestore.DocumentSnapshot) => this.transformDoc<T>(doc));

    return { items, total };
  }

  /**
   * Transform Firestore document to plain object
   */
  private transformDoc<T>(doc: admin.firestore.DocumentSnapshot): T {
    const data = doc.data();
    if (!data) return { id: doc.id } as T;

    // Convert Timestamps to ISO strings
    const transformed: Record<string, unknown> = { id: doc.id };
    for (const [key, value] of Object.entries(data)) {
      if (value && typeof value === 'object' && 'toDate' in value && typeof value.toDate === 'function') {
        transformed[key] = (value as admin.firestore.Timestamp).toDate().toISOString();
      } else {
        transformed[key] = value;
      }
    }

    return transformed as T;
  }
}

/**
 * Shared collection for cross-tenant data (e.g., public presets)
 */
export class SharedCollection {
  private db: admin.firestore.Firestore;
  private collectionName: string;

  constructor(collectionName: string) {
    this.db = getDb();
    this.collectionName = collectionName;
  }

  get collection() {
    return this.db.collection(this.collectionName);
  }

  async create<T extends Record<string, unknown>>(data: T, creatorOrgId?: string): Promise<{ id: string; data: T }> {
    const docRef = this.collection.doc();
    const timestamp = admin.firestore.FieldValue.serverTimestamp();
    const docData = {
      ...data,
      creator_org_id: creatorOrgId,
      created_at: timestamp,
      updated_at: timestamp,
    };

    await docRef.set(docData);

    return {
      id: docRef.id,
      data: {
        ...data,
        creator_org_id: creatorOrgId,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      } as T,
    };
  }

  async get<T>(id: string): Promise<T | null> {
    const doc = await this.collection.doc(id).get();
    if (!doc.exists) return null;

    return this.transformDoc<T>(doc);
  }

  async list<T>(options?: {
    limit?: number;
    orderBy?: string;
    orderDirection?: 'asc' | 'desc';
    filters?: Array<{ field: string; operator: WhereFilterOp; value: unknown }>;
  }): Promise<T[]> {
    let query: admin.firestore.Query = this.collection;

    if (options?.filters) {
      for (const filter of options.filters) {
        query = query.where(filter.field, filter.operator, filter.value);
      }
    }

    if (options?.orderBy) {
      query = query.orderBy(options.orderBy, options.orderDirection || 'desc');
    }

    if (options?.limit) {
      query = query.limit(options.limit);
    }

    const snapshot = await query.get();
    return snapshot.docs.map((doc: admin.firestore.DocumentSnapshot) => this.transformDoc<T>(doc));
  }

  private transformDoc<T>(doc: admin.firestore.DocumentSnapshot): T {
    const data = doc.data();
    if (!data) return { id: doc.id } as T;

    const transformed: Record<string, unknown> = { id: doc.id };
    for (const [key, value] of Object.entries(data)) {
      if (value && typeof value === 'object' && 'toDate' in value && typeof value.toDate === 'function') {
        transformed[key] = (value as admin.firestore.Timestamp).toDate().toISOString();
      } else {
        transformed[key] = value;
      }
    }

    return transformed as T;
  }
}

// Re-export Firestore types for convenience
export const FieldValue = admin.firestore.FieldValue;
export const Timestamp = admin.firestore.Timestamp;
export type { WhereFilterOp };

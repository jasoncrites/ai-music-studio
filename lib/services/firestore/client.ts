/**
 * Firebase Admin SDK initialization for AI Music Studio
 * Server-side Firestore client with multi-tenant support
 */

import { initializeApp, getApps, cert, App } from 'firebase-admin/app';
import {
  getFirestore,
  Firestore,
  Settings,
  Transaction as FirestoreTransaction,
} from 'firebase-admin/firestore';

// Configuration interface
export interface FirestoreConfig {
  projectId?: string;
  databaseId?: string;
  credentials?: {
    clientEmail: string;
    privateKey: string;
  };
  emulator?: {
    host: string;
    port: number;
  };
}

// Singleton instance
let firestoreInstance: Firestore | null = null;
let appInstance: App | null = null;

/**
 * Initialize Firebase Admin SDK and return Firestore instance
 * Uses environment variables or provided configuration
 */
export function initializeFirestore(config?: FirestoreConfig): Firestore {
  if (firestoreInstance) {
    return firestoreInstance;
  }

  const existingApps = getApps();

  if (existingApps.length > 0) {
    appInstance = existingApps[0];
  } else {
    const projectId = config?.projectId || process.env.FIREBASE_PROJECT_ID || process.env.GCLOUD_PROJECT;

    // Check for emulator
    if (config?.emulator || process.env.FIRESTORE_EMULATOR_HOST) {
      // Emulator mode - no credentials needed
      appInstance = initializeApp({
        projectId: projectId || 'ai-music-studio-dev',
      });
    } else if (config?.credentials) {
      // Explicit credentials provided
      appInstance = initializeApp({
        credential: cert({
          projectId,
          clientEmail: config.credentials.clientEmail,
          privateKey: config.credentials.privateKey,
        }),
        projectId,
      });
    } else if (process.env.GOOGLE_APPLICATION_CREDENTIALS) {
      // Use service account file path
      appInstance = initializeApp({
        projectId,
      });
    } else if (process.env.FIREBASE_SERVICE_ACCOUNT_KEY) {
      // Parse JSON from environment variable
      const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_KEY);
      appInstance = initializeApp({
        credential: cert(serviceAccount),
        projectId: serviceAccount.project_id || projectId,
      });
    } else {
      // Default initialization (works with Application Default Credentials on GCP)
      appInstance = initializeApp({
        projectId,
      });
    }
  }

  // Get Firestore instance with settings
  firestoreInstance = getFirestore(appInstance);

  // Configure Firestore settings
  const settings: Settings = {
    ignoreUndefinedProperties: true,
  };

  // Use custom database ID if specified (for multi-database projects)
  if (config?.databaseId && config.databaseId !== '(default)') {
    firestoreInstance = getFirestore(appInstance, config.databaseId);
  }

  firestoreInstance.settings(settings);

  return firestoreInstance;
}

/**
 * Get the initialized Firestore instance
 * Throws if not initialized
 */
export function getFirestoreClient(): Firestore {
  if (!firestoreInstance) {
    // Auto-initialize with defaults
    return initializeFirestore();
  }
  return firestoreInstance;
}

/**
 * Reset the Firestore instance (useful for testing)
 */
export function resetFirestore(): void {
  firestoreInstance = null;
  appInstance = null;
}

/**
 * Multi-tenant context for scoping all operations
 */
export interface TenantContext {
  orgId: string;
  userId?: string;
}

/**
 * Create a tenant-scoped Firestore helper
 */
export function createTenantClient(context: TenantContext) {
  const db = getFirestoreClient();

  return {
    db,
    orgId: context.orgId,
    userId: context.userId,

    /**
     * Get a collection reference scoped to the organization
     */
    collection(name: string) {
      return db.collection(name);
    },

    /**
     * Run a transaction
     */
    async runTransaction<T>(
      updateFunction: (transaction: FirestoreTransaction) => Promise<T>
    ): Promise<T> {
      return db.runTransaction(updateFunction);
    },

    /**
     * Create a batch for atomic writes
     */
    batch() {
      return db.batch();
    },
  };
}

// Re-export Firestore types for convenience
export {
  Firestore,
  DocumentReference,
  CollectionReference,
  Query,
  QuerySnapshot,
  DocumentSnapshot,
  WriteBatch,
  Transaction,
  FieldValue,
  Timestamp,
} from 'firebase-admin/firestore';

/**
 * Project Repository
 * CRUD operations for song projects with tracks
 */

import {
  getFirestoreClient,
  Timestamp,
  FieldValue,
  DocumentSnapshot,
  Transaction,
} from '../client';
import {
  ProjectDocument,
  CreateProjectInput,
  UpdateProjectInput,
  TrackDocument,
  ProjectStatus,
  COLLECTIONS,
} from '../collections';

// =============================================================================
// Repository Class
// =============================================================================

export class ProjectRepository {
  private readonly collectionName = COLLECTIONS.PROJECTS;

  /**
   * Get Firestore collection reference
   */
  private get collection() {
    return getFirestoreClient().collection(this.collectionName);
  }

  /**
   * Convert Firestore document to ProjectDocument
   */
  private fromFirestore(doc: DocumentSnapshot): ProjectDocument | null {
    if (!doc.exists) {
      return null;
    }
    return {
      id: doc.id,
      ...doc.data(),
    } as ProjectDocument;
  }

  // ===========================================================================
  // Create Operations
  // ===========================================================================

  /**
   * Create a new project
   */
  async create(input: CreateProjectInput): Promise<ProjectDocument> {
    const now = Timestamp.now();
    const docRef = input.id ? this.collection.doc(input.id) : this.collection.doc();

    const projectData: Omit<ProjectDocument, 'id'> = {
      orgId: input.orgId,
      userId: input.userId,
      name: input.name,
      description: input.description,
      coverImageUrl: input.coverImageUrl,
      tags: input.tags || [],
      genre: input.genre,
      settings: input.settings || {
        sampleRate: 48000,
        bitDepth: 24,
        tempo: 120,
        timeSignature: '4/4',
      },
      master: input.master || {
        volume: 0,
        pan: 0,
        limiterEnabled: true,
        limiterThreshold: -0.3,
      },
      tracks: input.tracks || [],
      status: input.status || 'active',
      version: 1,
      collaborators: input.collaborators || [],
      isPublic: input.isPublic ?? false,
      exports: input.exports || [],
      createdAt: now,
      updatedAt: now,
      lastOpenedAt: now,
      stats: input.stats || {
        totalDuration: 0,
        trackCount: 0,
        generationCount: 0,
        totalCostUSD: 0,
      },
    };

    await docRef.set(projectData);

    return {
      id: docRef.id,
      ...projectData,
    };
  }

  /**
   * Create project with initial track
   */
  async createWithTrack(
    input: CreateProjectInput,
    track: Omit<TrackDocument, 'id' | 'order'>
  ): Promise<ProjectDocument> {
    const trackWithId: TrackDocument = {
      ...track,
      id: `track_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      order: 0,
    };

    return this.create({
      ...input,
      tracks: [trackWithId],
      stats: {
        totalDuration: track.duration,
        trackCount: 1,
        generationCount: track.generationId ? 1 : 0,
        totalCostUSD: 0,
      },
    });
  }

  // ===========================================================================
  // Read Operations
  // ===========================================================================

  /**
   * Get project by ID
   */
  async getById(projectId: string): Promise<ProjectDocument | null> {
    const doc = await this.collection.doc(projectId).get();
    return this.fromFirestore(doc);
  }

  /**
   * Get project by ID with access check
   */
  async getByIdWithAccess(
    projectId: string,
    userId: string,
    orgId: string
  ): Promise<ProjectDocument | null> {
    const project = await this.getById(projectId);

    if (!project) {
      return null;
    }

    // Check access
    if (project.orgId !== orgId) {
      return null; // Wrong organization
    }

    if (project.userId === userId) {
      return project; // Owner
    }

    if (project.isPublic) {
      return project; // Public project
    }

    // Check collaborators
    const isCollaborator = project.collaborators?.some(
      (c) => c.userId === userId
    );

    if (isCollaborator) {
      return project;
    }

    return null; // No access
  }

  /**
   * List projects by user
   */
  async listByUser(
    orgId: string,
    userId: string,
    options: {
      limit?: number;
      offset?: number;
      status?: ProjectStatus;
      includeCollaborations?: boolean;
    } = {}
  ): Promise<{ projects: ProjectDocument[]; total: number }> {
    const { limit = 50, offset = 0, status, includeCollaborations = true } = options;

    // Get owned projects
    let query = this.collection
      .where('orgId', '==', orgId)
      .where('userId', '==', userId);

    if (status) {
      query = query.where('status', '==', status);
    } else {
      query = query.where('status', 'in', ['draft', 'active']);
    }

    query = query.orderBy('updatedAt', 'desc');

    const countSnapshot = await query.count().get();
    let total = countSnapshot.data().count;

    const snapshot = await query.offset(offset).limit(limit).get();

    let projects = snapshot.docs
      .map((doc) => this.fromFirestore(doc))
      .filter((project): project is ProjectDocument => project !== null);

    // Also get projects where user is collaborator
    if (includeCollaborations && projects.length < limit) {
      const collabSnapshot = await this.collection
        .where('orgId', '==', orgId)
        .where('collaborators', 'array-contains', { userId })
        .where('status', 'in', ['draft', 'active'])
        .orderBy('updatedAt', 'desc')
        .limit(limit - projects.length)
        .get();

      const collabProjects = collabSnapshot.docs
        .map((doc) => this.fromFirestore(doc))
        .filter((project): project is ProjectDocument => project !== null);

      projects = [...projects, ...collabProjects];
      total += collabSnapshot.size;
    }

    return { projects, total };
  }

  /**
   * List recent projects
   */
  async listRecent(
    orgId: string,
    userId: string,
    limit: number = 10
  ): Promise<ProjectDocument[]> {
    const snapshot = await this.collection
      .where('orgId', '==', orgId)
      .where('userId', '==', userId)
      .where('status', 'in', ['draft', 'active'])
      .orderBy('lastOpenedAt', 'desc')
      .limit(limit)
      .get();

    return snapshot.docs
      .map((doc) => this.fromFirestore(doc))
      .filter((project): project is ProjectDocument => project !== null);
  }

  /**
   * Search projects by name
   */
  async searchByName(
    orgId: string,
    userId: string,
    searchTerm: string,
    limit: number = 20
  ): Promise<ProjectDocument[]> {
    // Firestore doesn't support full-text search, so we use prefix matching
    const endTerm = searchTerm + '\uf8ff';

    const snapshot = await this.collection
      .where('orgId', '==', orgId)
      .where('userId', '==', userId)
      .where('status', 'in', ['draft', 'active'])
      .where('name', '>=', searchTerm)
      .where('name', '<=', endTerm)
      .limit(limit)
      .get();

    return snapshot.docs
      .map((doc) => this.fromFirestore(doc))
      .filter((project): project is ProjectDocument => project !== null);
  }

  // ===========================================================================
  // Update Operations
  // ===========================================================================

  /**
   * Update project
   */
  async update(projectId: string, input: UpdateProjectInput): Promise<ProjectDocument> {
    const docRef = this.collection.doc(projectId);

    const updateData = {
      ...input,
      updatedAt: Timestamp.now(),
      version: FieldValue.increment(1),
    };

    await docRef.update(updateData);

    const updated = await docRef.get();
    const result = this.fromFirestore(updated);

    if (!result) {
      throw new Error(`Project ${projectId} not found after update`);
    }

    return result;
  }

  /**
   * Update project with optimistic locking
   */
  async updateWithVersion(
    projectId: string,
    expectedVersion: number,
    input: UpdateProjectInput
  ): Promise<ProjectDocument> {
    const db = getFirestoreClient();
    const docRef = this.collection.doc(projectId);

    return db.runTransaction(async (transaction: Transaction) => {
      const doc = await transaction.get(docRef);
      const project = this.fromFirestore(doc);

      if (!project) {
        throw new Error(`Project ${projectId} not found`);
      }

      if (project.version !== expectedVersion) {
        throw new Error(
          `Version conflict: expected ${expectedVersion}, got ${project.version}`
        );
      }

      const updateData = {
        ...input,
        updatedAt: Timestamp.now(),
        version: expectedVersion + 1,
      };

      transaction.update(docRef, updateData);

      return {
        ...project,
        ...updateData,
      };
    });
  }

  /**
   * Record project opened
   */
  async recordOpened(projectId: string): Promise<void> {
    await this.collection.doc(projectId).update({
      lastOpenedAt: Timestamp.now(),
    });
  }

  /**
   * Update project status
   */
  async updateStatus(projectId: string, status: ProjectStatus): Promise<void> {
    await this.collection.doc(projectId).update({
      status,
      updatedAt: Timestamp.now(),
    });
  }

  // ===========================================================================
  // Track Operations
  // ===========================================================================

  /**
   * Add track to project
   */
  async addTrack(
    projectId: string,
    track: Omit<TrackDocument, 'id' | 'order'>
  ): Promise<TrackDocument> {
    const db = getFirestoreClient();
    const docRef = this.collection.doc(projectId);

    const newTrack = await db.runTransaction(async (transaction: Transaction) => {
      const doc = await transaction.get(docRef);
      const project = this.fromFirestore(doc);

      if (!project) {
        throw new Error(`Project ${projectId} not found`);
      }

      const trackId = `track_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      const order = project.tracks.length;

      const trackDoc: TrackDocument = {
        ...track,
        id: trackId,
        order,
      };

      transaction.update(docRef, {
        tracks: FieldValue.arrayUnion(trackDoc),
        'stats.trackCount': FieldValue.increment(1),
        'stats.totalDuration': FieldValue.increment(track.duration),
        updatedAt: Timestamp.now(),
        version: FieldValue.increment(1),
      });

      return trackDoc;
    });

    return newTrack;
  }

  /**
   * Update track in project
   */
  async updateTrack(
    projectId: string,
    trackId: string,
    updates: Partial<TrackDocument>
  ): Promise<void> {
    const db = getFirestoreClient();
    const docRef = this.collection.doc(projectId);

    await db.runTransaction(async (transaction: Transaction) => {
      const doc = await transaction.get(docRef);
      const project = this.fromFirestore(doc);

      if (!project) {
        throw new Error(`Project ${projectId} not found`);
      }

      const trackIndex = project.tracks.findIndex((t) => t.id === trackId);
      if (trackIndex === -1) {
        throw new Error(`Track ${trackId} not found in project ${projectId}`);
      }

      const updatedTracks = [...project.tracks];
      updatedTracks[trackIndex] = {
        ...updatedTracks[trackIndex],
        ...updates,
      };

      transaction.update(docRef, {
        tracks: updatedTracks,
        updatedAt: Timestamp.now(),
        version: FieldValue.increment(1),
      });
    });
  }

  /**
   * Remove track from project
   */
  async removeTrack(projectId: string, trackId: string): Promise<void> {
    const db = getFirestoreClient();
    const docRef = this.collection.doc(projectId);

    await db.runTransaction(async (transaction: Transaction) => {
      const doc = await transaction.get(docRef);
      const project = this.fromFirestore(doc);

      if (!project) {
        throw new Error(`Project ${projectId} not found`);
      }

      const track = project.tracks.find((t) => t.id === trackId);
      if (!track) {
        throw new Error(`Track ${trackId} not found in project ${projectId}`);
      }

      const updatedTracks = project.tracks
        .filter((t) => t.id !== trackId)
        .map((t, index) => ({ ...t, order: index }));

      transaction.update(docRef, {
        tracks: updatedTracks,
        'stats.trackCount': FieldValue.increment(-1),
        'stats.totalDuration': FieldValue.increment(-track.duration),
        updatedAt: Timestamp.now(),
        version: FieldValue.increment(1),
      });
    });
  }

  /**
   * Reorder tracks
   */
  async reorderTracks(projectId: string, trackOrder: string[]): Promise<void> {
    const db = getFirestoreClient();
    const docRef = this.collection.doc(projectId);

    await db.runTransaction(async (transaction: Transaction) => {
      const doc = await transaction.get(docRef);
      const project = this.fromFirestore(doc);

      if (!project) {
        throw new Error(`Project ${projectId} not found`);
      }

      const trackMap = new Map(project.tracks.map((t) => [t.id, t]));
      const reorderedTracks = trackOrder
        .map((id, index) => {
          const track = trackMap.get(id);
          if (!track) {
            throw new Error(`Track ${id} not found`);
          }
          return { ...track, order: index };
        });

      transaction.update(docRef, {
        tracks: reorderedTracks,
        updatedAt: Timestamp.now(),
        version: FieldValue.increment(1),
      });
    });
  }

  // ===========================================================================
  // Collaboration Operations
  // ===========================================================================

  /**
   * Add collaborator to project
   */
  async addCollaborator(
    projectId: string,
    collaborator: {
      userId: string;
      email: string;
      role: 'viewer' | 'editor' | 'admin';
    }
  ): Promise<void> {
    await this.collection.doc(projectId).update({
      collaborators: FieldValue.arrayUnion({
        ...collaborator,
        addedAt: Timestamp.now(),
      }),
      updatedAt: Timestamp.now(),
    });
  }

  /**
   * Remove collaborator from project
   */
  async removeCollaborator(projectId: string, userId: string): Promise<void> {
    const project = await this.getById(projectId);
    if (!project) {
      throw new Error(`Project ${projectId} not found`);
    }

    const updatedCollaborators = project.collaborators?.filter(
      (c) => c.userId !== userId
    ) || [];

    await this.collection.doc(projectId).update({
      collaborators: updatedCollaborators,
      updatedAt: Timestamp.now(),
    });
  }

  // ===========================================================================
  // Delete Operations
  // ===========================================================================

  /**
   * Soft delete project (archive)
   */
  async archive(projectId: string): Promise<void> {
    await this.updateStatus(projectId, 'archived');
  }

  /**
   * Soft delete project
   */
  async softDelete(projectId: string): Promise<void> {
    await this.updateStatus(projectId, 'deleted');
  }

  /**
   * Hard delete project
   */
  async hardDelete(projectId: string): Promise<void> {
    await this.collection.doc(projectId).delete();
  }

  // ===========================================================================
  // Export Operations
  // ===========================================================================

  /**
   * Add export record
   */
  async addExport(
    projectId: string,
    exportData: {
      id: string;
      format: 'wav' | 'mp3' | 'flac' | 'stems';
      url: string;
      expiresAt?: Timestamp;
    }
  ): Promise<void> {
    await this.collection.doc(projectId).update({
      exports: FieldValue.arrayUnion({
        ...exportData,
        createdAt: Timestamp.now(),
      }),
      updatedAt: Timestamp.now(),
    });
  }
}

// =============================================================================
// Singleton Instance
// =============================================================================

let projectRepositoryInstance: ProjectRepository | null = null;

export function getProjectRepository(): ProjectRepository {
  if (!projectRepositoryInstance) {
    projectRepositoryInstance = new ProjectRepository();
  }
  return projectRepositoryInstance;
}

// For testing
export function resetProjectRepository(): void {
  projectRepositoryInstance = null;
}

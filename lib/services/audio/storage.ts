import { Storage } from '@google-cloud/storage';
import { GenerationResult, SeparationResult, GenerationRequest } from '../types';

/**
 * Cloud Storage Service
 * Handles uploading and managing audio files in Google Cloud Storage
 */
export class StorageService {
  private static storage: Storage | null = null;
  private static bucketName = process.env.GCS_BUCKET_NAME || 'ai-music-studio-assets';

  /**
   * Initialize GCS client
   */
  private static getStorage(): Storage {
    if (!this.storage) {
      this.storage = new Storage({
        // Will use GOOGLE_APPLICATION_CREDENTIALS env var automatically
        projectId: process.env.GCP_PROJECT_ID,
      });
    }
    return this.storage;
  }

  /**
   * Store generated audio in Cloud Storage
   * Downloads from provider URL and re-uploads to GCS
   */
  static async storeGeneration(
    result: GenerationResult,
    request: GenerationRequest
  ): Promise<GenerationResult> {
    try {
      // Skip storage for demo URLs (generated client-side)
      if (result.url.startsWith('demo://')) {
        console.log('[Storage] Skipping storage for demo URL (client-side generation)');
        return result;
      }

      // Download audio from provider URL
      const response = await fetch(result.url);
      if (!response.ok) {
        throw new Error(`Failed to download audio: ${response.statusText}`);
      }

      const audioBuffer = await response.arrayBuffer();

      // Generate storage path
      const userId = 'default-user'; // TODO: Get from auth context
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const fileName = `${result.id}.${result.format}`;
      const path = `audio/generations/${userId}/${timestamp}/${fileName}`;

      // Upload to GCS
      const storage = this.getStorage();
      const bucket = storage.bucket(this.bucketName);
      const file = bucket.file(path);

      await file.save(Buffer.from(audioBuffer), {
        contentType: `audio/${result.format}`,
        metadata: {
          prompt: request.prompt,
          provider: result.metadata?.provider || 'unknown',
          generatedAt: result.metadata?.generatedAt || new Date().toISOString(),
          duration: result.duration.toString(),
        },
      });

      console.log(`[Storage] Uploaded to: gs://${this.bucketName}/${path}`);

      // Generate signed URL (valid for 7 days)
      const [signedUrl] = await file.getSignedUrl({
        version: 'v4',
        action: 'read',
        expires: Date.now() + 7 * 24 * 60 * 60 * 1000, // 7 days
      });

      // Return updated result with GCS URL
      return {
        ...result,
        url: signedUrl,
        metadata: {
          ...result.metadata,
          gcsPath: path,
          storedAt: new Date().toISOString(),
        },
      };
    } catch (error: any) {
      console.error('[Storage] Upload failed:', error);
      // Return original result if storage fails (graceful degradation)
      return result;
    }
  }

  /**
   * Store separated audio stems in Cloud Storage
   */
  static async storeSeparation(
    result: SeparationResult,
    userId?: string
  ): Promise<SeparationResult> {
    try {
      const storedStems: SeparationResult['stems'] = {};

      for (const [stemType, stem] of Object.entries(result.stems)) {
        if (!stem) continue;

        // Download stem
        const response = await fetch(stem.url);
        if (!response.ok) {
          console.warn(`[Storage] Failed to download ${stemType} stem`);
          continue;
        }

        const audioBuffer = await response.arrayBuffer();

        // Generate storage path
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        const path = `audio/separated/${userId || 'default'}/${timestamp}/${result.id}/${stemType}.wav`;

        // Upload to GCS
        const storage = this.getStorage();
        const bucket = storage.bucket(this.bucketName);
        const file = bucket.file(path);

        await file.save(Buffer.from(audioBuffer), {
          contentType: 'audio/wav',
          metadata: {
            stemType,
            separationId: result.id,
          },
        });

        // Generate signed URL
        const [signedUrl] = await file.getSignedUrl({
          version: 'v4',
          action: 'read',
          expires: Date.now() + 7 * 24 * 60 * 60 * 1000,
        });

        storedStems[stemType as keyof SeparationResult['stems']] = {
          url: signedUrl,
          duration: stem.duration,
        };
      }

      return {
        ...result,
        stems: storedStems,
      };
    } catch (error: any) {
      console.error('[Storage] Separation storage failed:', error);
      return result;
    }
  }

  /**
   * Upload user audio file
   */
  static async uploadUserFile(
    file: Buffer,
    fileName: string,
    userId: string,
    projectId: string
  ): Promise<string> {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const path = `projects/${projectId}/tracks/${userId}/${timestamp}/${fileName}`;

    const storage = this.getStorage();
    const bucket = storage.bucket(this.bucketName);
    const gcsFile = bucket.file(path);

    await gcsFile.save(file, {
      contentType: 'audio/wav',
      metadata: {
        userId,
        projectId,
        uploadedAt: new Date().toISOString(),
      },
    });

    // Generate signed URL
    const [signedUrl] = await gcsFile.getSignedUrl({
      version: 'v4',
      action: 'read',
      expires: Date.now() + 30 * 24 * 60 * 60 * 1000, // 30 days
    });

    return signedUrl;
  }

  /**
   * Delete file from storage
   */
  static async deleteFile(path: string): Promise<void> {
    const storage = this.getStorage();
    const bucket = storage.bucket(this.bucketName);
    await bucket.file(path).delete();
  }
}

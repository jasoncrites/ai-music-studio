import { AFSClient } from './client';

// Singleton instance for the OS
export const os = new AFSClient();

// Re-export types
export * from './types';
export * from './client';

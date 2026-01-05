'use client';

import { useCallback, useState } from 'react';
import { Upload, File, X } from 'lucide-react';
import { useAudioStore } from '@/lib/store/audioStore';

interface FileUploadProps {
  onUploadComplete?: (url: string, fileName: string) => void;
}

export function FileUpload({ onUploadComplete }: FileUploadProps) {
  const [isDragging, setIsDragging] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const { addTrack, getAudioEngine } = useAudioStore();

  const handleFiles = useCallback(
    async (files: FileList | null) => {
      if (!files || files.length === 0) return;

      setIsUploading(true);
      setUploadProgress(0);

      for (let i = 0; i < files.length; i++) {
        const file = files[i];

        try {
          // Create form data
          const formData = new FormData();
          formData.append('file', file);
          formData.append('projectId', 'current-project');

          // Upload to server
          const response = await fetch('/api/audio/upload', {
            method: 'POST',
            body: formData,
          });

          if (!response.ok) {
            const error = await response.json();
            throw new Error(error.error || 'Upload failed');
          }

          const data = await response.json();
          const audioUrl = data.data.url;

          // Load audio buffer
          const engine = getAudioEngine();
          const buffer = await engine.loadAudioBuffer(audioUrl);

          // Add track to DAW
          const trackName = file.name.replace(/\.(wav|mp3)$/i, '');
          addTrack(trackName, buffer);

          // Callback
          if (onUploadComplete) {
            onUploadComplete(audioUrl, file.name);
          }

          console.log('[FileUpload] Successfully loaded:', file.name);
        } catch (error: any) {
          console.error('[FileUpload] Error uploading:', error);
          alert(`Failed to upload ${file.name}: ${error.message}`);
        }

        setUploadProgress(((i + 1) / files.length) * 100);
      }

      setIsUploading(false);
      setUploadProgress(0);
    },
    [addTrack, getAudioEngine, onUploadComplete]
  );

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setIsDragging(false);
      handleFiles(e.dataTransfer.files);
    },
    [handleFiles]
  );

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  }, []);

  const handleFileInput = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      handleFiles(e.target.files);
    },
    [handleFiles]
  );

  return (
    <div
      onDrop={handleDrop}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      className={`relative rounded-xl border-2 border-dashed transition-all ${
        isDragging
          ? 'border-violet-500 bg-violet-500/10'
          : 'border-white/20 bg-white/5 hover:border-white/40'
      }`}
    >
      <input
        type="file"
        id="file-upload"
        multiple
        accept="audio/wav,audio/mp3,audio/mpeg"
        onChange={handleFileInput}
        className="hidden"
      />

      <label
        htmlFor="file-upload"
        className="flex flex-col items-center justify-center p-8 cursor-pointer"
      >
        {isUploading ? (
          <>
            <div className="w-12 h-12 rounded-full border-4 border-violet-500 border-t-transparent animate-spin mb-4" />
            <p className="text-sm font-medium text-white mb-1">
              Uploading... {Math.round(uploadProgress)}%
            </p>
            <div className="w-full max-w-xs h-2 bg-white/10 rounded-full overflow-hidden">
              <div
                className="h-full bg-gradient-to-r from-violet-500 to-fuchsia-500 transition-all"
                style={{ width: `${uploadProgress}%` }}
              />
            </div>
          </>
        ) : (
          <>
            <Upload className="w-12 h-12 text-gray-400 mb-4" />
            <p className="text-sm font-medium text-white mb-1">
              Drop audio files here or click to browse
            </p>
            <p className="text-xs text-gray-500">
              WAV or MP3 • Max 100MB per file • Up to 110 tracks
            </p>
          </>
        )}
      </label>
    </div>
  );
}

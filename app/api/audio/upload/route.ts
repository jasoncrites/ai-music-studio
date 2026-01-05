import { NextRequest, NextResponse } from 'next/server';
import { StorageService } from '@/lib/services/audio/storage';

/**
 * Audio file upload endpoint
 * Handles WAV/MP3 uploads for professional production
 */

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const file = formData.get('file') as File;
    const projectId = (formData.get('projectId') as string) || 'default-project';
    const userId = (formData.get('userId') as string) || 'default-user';

    if (!file) {
      return NextResponse.json(
        {
          success: false,
          error: 'No file provided',
        },
        { status: 400 }
      );
    }

    // Validate file type
    const allowedTypes = ['audio/wav', 'audio/mpeg', 'audio/mp3', 'audio/x-wav'];
    if (!allowedTypes.includes(file.type) && !file.name.match(/\.(wav|mp3)$/i)) {
      return NextResponse.json(
        {
          success: false,
          error: 'Invalid file type. Only WAV and MP3 files are supported.',
        },
        { status: 400 }
      );
    }

    // Validate file size (max 100MB for professional audio)
    const maxSize = 100 * 1024 * 1024; // 100MB
    if (file.size > maxSize) {
      return NextResponse.json(
        {
          success: false,
          error: 'File too large. Maximum size is 100MB.',
        },
        { status: 400 }
      );
    }

    console.log('[Upload] Processing file:', file.name, 'Size:', file.size);

    // Convert file to buffer
    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    // Upload to Cloud Storage
    let audioUrl: string;
    try {
      audioUrl = await StorageService.uploadUserFile(
        buffer,
        file.name,
        userId,
        projectId
      );
    } catch (storageError: any) {
      console.warn('[Upload] Storage upload failed, falling back to data URL');
      // Fallback: return data URL if storage fails
      const base64 = buffer.toString('base64');
      audioUrl = `data:${file.type};base64,${base64}`;
    }

    // Decode audio to get duration
    // Note: This happens on client side, we just return the URL
    return NextResponse.json({
      success: true,
      data: {
        url: audioUrl,
        fileName: file.name,
        fileSize: file.size,
        fileType: file.type,
      },
    });
  } catch (error: any) {
    console.error('[Upload] Error:', error);

    return NextResponse.json(
      {
        success: false,
        error: error.message || 'Upload failed',
      },
      { status: 500 }
    );
  }
}

// GET endpoint to check upload limits
export async function GET(request: NextRequest) {
  return NextResponse.json({
    success: true,
    limits: {
      maxFileSize: 100 * 1024 * 1024, // 100MB
      allowedTypes: ['audio/wav', 'audio/mp3', 'audio/mpeg'],
      maxTracks: 110,
    },
  });
}

import { NextRequest, NextResponse } from 'next/server';
import { ProviderFactory } from '@/lib/services/providers';
import { AudioGenerationService } from '@/lib/services/audio/generation';

/**
 * Test API endpoint for validating music generation
 * GET /api/test - Test provider availability
 * POST /api/test - Test music generation
 */

export async function GET(request: NextRequest) {
  try {
    console.log('[Test] Checking provider status...');

    // Get provider status
    const status = await AudioGenerationService.getProviderStatus();

    return NextResponse.json({
      success: true,
      message: 'Provider status check complete',
      providers: status,
      timestamp: new Date().toISOString(),
    });
  } catch (error: any) {
    console.error('[Test] Error:', error);
    return NextResponse.json(
      {
        success: false,
        error: error.message,
      },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { prompt, duration = '30s' } = body;

    if (!prompt) {
      return NextResponse.json(
        {
          success: false,
          error: 'Prompt is required',
        },
        { status: 400 }
      );
    }

    console.log('[Test] Generating music:', { prompt, duration });

    // Generate music
    const result = await AudioGenerationService.execute({
      prompt,
      duration,
    });

    return NextResponse.json({
      success: true,
      result,
      timestamp: new Date().toISOString(),
    });
  } catch (error: any) {
    console.error('[Test] Generation error:', error);
    return NextResponse.json(
      {
        success: false,
        error: error.message,
      },
      { status: 500 }
    );
  }
}

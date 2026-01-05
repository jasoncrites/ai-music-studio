import { NextRequest, NextResponse } from 'next/server';
import { AudioGenerationService } from '@/lib/services/audio/generation';

/**
 * Main Cortex Control API
 * Handles all intent-based requests from the AFS SDK
 */
export async function POST(request: NextRequest) {
  const startTime = Date.now();

  try {
    // Parse request body
    const body = await request.json();
    const { action, params } = body;

    console.log(`[Cortex] Action: ${action}`, params);

    // Validate request
    if (!action) {
      return NextResponse.json(
        {
          success: false,
          error: 'Action is required',
        },
        { status: 400 }
      );
    }

    // Handle different actions
    if (action === 'EXECUTE_INTENT') {
      return handleIntentExecution(params, startTime);
    }

    // Unknown action
    return NextResponse.json(
      {
        success: false,
        error: `Unknown action: ${action}`,
      },
      { status: 400 }
    );
  } catch (error: any) {
    console.error('[Cortex] Error:', error);

    return NextResponse.json(
      {
        success: false,
        error: error.message || 'Internal server error',
      },
      { status: 500 }
    );
  }
}

/**
 * Handle intent execution
 */
async function handleIntentExecution(params: any, startTime: number) {
  const { intent, payload } = params;

  if (!intent) {
    return NextResponse.json(
      {
        success: false,
        error: 'Intent name is required',
      },
      { status: 400 }
    );
  }

  console.log(`[Cortex] Executing intent: ${intent}`);

  try {
    let result;

    switch (intent) {
      case 'audio.generation':
        result = await AudioGenerationService.execute(payload);
        break;

      case 'audio.separation':
        result = await AudioGenerationService.separate(payload);
        break;

      case 'video.generation':
        // TODO: Implement video generation
        result = {
          status: 'FAILED',
          data: null,
          message: 'Video generation not yet implemented',
        };
        break;

      default:
        return NextResponse.json(
          {
            success: false,
            error: `Unknown intent: ${intent}`,
          },
          { status: 400 }
        );
    }

    // Calculate metrics
    const latency = Date.now() - startTime;

    // Build response matching AFS SDK expectations
    const response = {
      success: true,
      data: {
        status: result.status,
        data: result.data,
        message: result.message,
        kernel_metrics: {
          latency_ms: latency,
          service_id: 'ai-music-studio',
        },
      },
    };

    console.log(`[Cortex] Intent ${intent} completed in ${latency}ms`);

    return NextResponse.json(response);
  } catch (error: any) {
    console.error(`[Cortex] Intent ${intent} failed:`, error);

    return NextResponse.json({
      success: true, // Return success=true with failed status (SDK expects this)
      data: {
        status: 'FAILED',
        data: null,
        message: error.message || 'Intent execution failed',
        kernel_metrics: {
          latency_ms: Date.now() - startTime,
          service_id: 'ai-music-studio',
        },
      },
    });
  }
}

/**
 * Health check endpoint
 */
export async function GET(request: NextRequest) {
  try {
    // Get provider status
    const providerStatus = await AudioGenerationService.getProviderStatus();

    return NextResponse.json({
      status: 'healthy',
      providers: providerStatus,
      timestamp: new Date().toISOString(),
    });
  } catch (error: any) {
    return NextResponse.json(
      {
        status: 'unhealthy',
        error: error.message,
      },
      { status: 500 }
    );
  }
}

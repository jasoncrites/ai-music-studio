import { NextRequest } from 'next/server';
import { Firestore } from '@google-cloud/firestore';

const db = new Firestore({ projectId: 'truckerbooks-mvp-prod' });

/**
 * POST /api/claude-task - Queue task for Cloud Run execution
 * Saves tokens by offloading heavy work
 */
export async function POST(request: NextRequest) {
  const body = await request.json();
  const taskId = `task-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

  const task = {
    id: taskId,
    type: body.type, // 'build', 'test', 'deploy', 'generate', 'analyze'
    command: body.command,
    args: body.args || {},
    status: 'queued',
    created_at: new Date().toISOString(),
    session_id: body.session_id,
    estimated_tokens_saved: body.estimated_tokens || 1000,
  };

  await db.collection('claude_tasks').doc(taskId).set(task);

  // Trigger Cloud Run worker (fire and forget)
  if (process.env.TASK_WORKER_URL) {
    fetch(process.env.TASK_WORKER_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ task_id: taskId }),
    }).catch(() => {}); // Don't wait
  }

  return Response.json({ success: true, task_id: taskId, status: 'queued' });
}

/**
 * GET /api/claude-task?id=xxx - Check task status
 */
export async function GET(request: NextRequest) {
  const taskId = request.nextUrl.searchParams.get('id');
  const sessionId = request.nextUrl.searchParams.get('session');

  if (sessionId) {
    // Get all tasks for session with stats
    const snapshot = await db.collection('claude_tasks')
      .where('session_id', '==', sessionId)
      .orderBy('created_at', 'desc')
      .limit(50)
      .get();

    const tasks = snapshot.docs.map(d => d.data());
    const stats = {
      total: tasks.length,
      completed: tasks.filter(t => t.status === 'completed').length,
      tokens_saved: tasks.reduce((sum, t) => sum + (t.estimated_tokens_saved || 0), 0),
    };

    return Response.json({ success: true, tasks, stats });
  }

  if (!taskId) {
    return Response.json({ success: false, error: 'Missing id or session param' }, { status: 400 });
  }

  const doc = await db.collection('claude_tasks').doc(taskId).get();
  if (!doc.exists) {
    return Response.json({ success: false, error: 'Task not found' }, { status: 404 });
  }

  return Response.json({ success: true, task: doc.data() });
}

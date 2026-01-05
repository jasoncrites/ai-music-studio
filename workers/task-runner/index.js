const { Firestore } = require('@google-cloud/firestore');
const { execSync } = require('child_process');
const express = require('express');

const db = new Firestore({ projectId: 'truckerbooks-mvp-prod' });
const app = express();
app.use(express.json());

// Process single task
app.post('/run', async (req, res) => {
  const { task_id } = req.body;
  if (!task_id) return res.status(400).json({ error: 'Missing task_id' });

  const ref = db.collection('claude_tasks').doc(task_id);
  const doc = await ref.get();
  if (!doc.exists) return res.status(404).json({ error: 'Task not found' });

  const task = doc.data();
  await ref.update({ status: 'running', started_at: new Date().toISOString() });

  try {
    const output = execSync(task.command, {
      cwd: '/workspace',
      timeout: 300000,
      encoding: 'utf8',
      maxBuffer: 10 * 1024 * 1024
    });
    await ref.update({
      status: 'completed',
      output: output.slice(-5000),
      completed_at: new Date().toISOString()
    });
    res.json({ success: true, task_id });
  } catch (err) {
    await ref.update({
      status: 'failed',
      error: err.message,
      completed_at: new Date().toISOString()
    });
    res.json({ success: false, error: err.message });
  }
});

// Process queue (cron/scheduler calls this)
app.post('/process-queue', async (req, res) => {
  const snapshot = await db.collection('claude_tasks')
    .where('status', '==', 'queued')
    .orderBy('priority', 'desc')
    .limit(5)
    .get();

  const results = [];
  for (const doc of snapshot.docs) {
    const task = doc.data();
    await doc.ref.update({ status: 'running', started_at: new Date().toISOString() });

    try {
      const output = execSync(task.command, {
        cwd: process.env.WORKSPACE || '/workspace',
        timeout: 300000, encoding: 'utf8'
      });
      await doc.ref.update({ status: 'completed', output: output.slice(-5000), completed_at: new Date().toISOString() });
      results.push({ id: task.id, status: 'completed' });
    } catch (err) {
      await doc.ref.update({ status: 'failed', error: err.message, completed_at: new Date().toISOString() });
      results.push({ id: task.id, status: 'failed', error: err.message });
    }
  }
  res.json({ processed: results.length, results });
});

// Health check
app.get('/', (_, res) => res.json({ status: 'ok', service: 'task-runner' }));

const PORT = process.env.PORT || 8080;
app.listen(PORT, () => console.log(`Task runner on ${PORT}`));

import fs from "node:fs";
import path from "node:path";
import { config } from "dotenv";

const externalEnv = path.resolve(process.cwd(), "..", "secrets", ".env.local");
config({ path: fs.existsSync(externalEnv) ? externalEnv : ".env.local" });

import { connectDB } from "../lib/db/connect";
import { TimerSession } from "../lib/db/models/TimerSession";
import { Task } from "../lib/db/models/Task";
import { COUNTDOWN_SECONDS } from "../lib/timers/constants";
import { formatDuration } from "../lib/timers/budget";

async function main() {
  const isApply = process.argv.includes("--apply");
  const isDryRun = !isApply;

  console.log(`=======================================================`);
  console.log(`         SCHEDULECHAT TASK TIME RECOVERY SCRIPT        `);
  console.log(`=======================================================`);
  console.log(`Mode: ${isDryRun ? "DRY RUN (preview only)" : "APPLY (writing to database)"}\n`);

  await connectDB();

  // Find completed sessions for regular tasks (scheduledTaskId == null)
  // sorted by startedAt descending
  const sessions = await TimerSession.find({
    scheduledTaskId: null,
    taskId: { $ne: null },
    status: "completed",
  })
    .sort({ startedAt: -1 })
    .lean();

  const taskIds = Array.from(new Set(sessions.map((s) => String(s.taskId))));
  const tasks = await Task.find({ _id: { $in: taskIds } }).lean();
  const taskMap = new Map(tasks.map((t) => [String(t._id), t]));

  console.log(`Found ${sessions.length} completed regular task sessions across ${tasks.length} tasks.\n`);
  console.log(`Recent sessions (past 5 days):`);

  const now = Date.now();
  const fiveDaysAgo = now - 5 * 24 * 60 * 60 * 1000;

  const updatesToApply: Array<{
    sessionId: string;
    taskTitle: string;
    taskId: string;
    dateStr: string;
    oldContributedSec: number;
    newContributedSec: number;
    reason: string;
  }> = [];

  for (const s of sessions) {
    const startMs = s.startedAt ? new Date(s.startedAt).getTime() : 0;
    if (startMs < fiveDaysAgo) continue;

    const endMs = s.actualEndedAt ? new Date(s.actualEndedAt).getTime() : 0;
    const task = taskMap.get(String(s.taskId));
    const title = task?.title ?? "Unknown Task";
    const dateStr = s.startedAt ? new Date(s.startedAt).toISOString().slice(0, 10) : "unknown";

    const pausedDeduction = s.totalPausedSeconds ?? 0;
    const rawElapsedSeconds = endMs > startMs ? Math.round((endMs - startMs) / 1000) : 0;
    const actualWorkSeconds = Math.max(0, rawElapsedSeconds - COUNTDOWN_SECONDS - pausedDeduction);
    const recordedContributed = s.contributedSeconds ?? 0;
    const plannedSec = s.plannedDurationSeconds ?? 1800;

    console.log(
      `Session ${s._id} | Date: ${dateStr} | Task: "${title}"\n` +
      `  Started: ${s.startedAt ? new Date(s.startedAt).toLocaleTimeString() : "?"} -> Ended: ${s.actualEndedAt ? new Date(s.actualEndedAt).toLocaleTimeString() : "?"}\n` +
      `  Raw Elapsed: ${formatDuration(rawElapsedSeconds)} | Work: ${formatDuration(actualWorkSeconds)}\n` +
      `  Recorded in DB: ${formatDuration(recordedContributed)} (Planned: ${formatDuration(plannedSec)})`
    );

    // Check if this was a 10-hour runaway timer on Oct 6 (day before yesterday from Oct 8 / 2 days ago)
    // where user forgot to stop timer and requested to count as 4 hours (14400s) each
    if (actualWorkSeconds >= 7 * 3600) { // >= 7 hours
      const targetSec = 4 * 3600; // 4 hours
      if (recordedContributed !== targetSec) {
        updatesToApply.push({
          sessionId: String(s._id),
          taskTitle: title,
          taskId: String(s.taskId),
          dateStr,
          oldContributedSec: recordedContributed,
          newContributedSec: targetSec,
          reason: `Forgot to stop timer (10h elapsed) -> capped to 4h (14400s) as requested`,
        });
        console.log(`  => CANDIDATE FOR RECOVERY: Override runaway session to 4h (${formatDuration(targetSec)})\n`);
      } else {
        console.log(`  => Already set to 4h.\n`);
      }
    } else if (actualWorkSeconds > recordedContributed && recordedContributed <= plannedSec + 10) {
      // Session was clamped to planned duration (e.g. 160 mins counted as 30 mins)
      updatesToApply.push({
        sessionId: String(s._id),
        taskTitle: title,
        taskId: String(s.taskId),
        dateStr,
        oldContributedSec: recordedContributed,
        newContributedSec: actualWorkSeconds,
        reason: `Restoring full actual elapsed time (was clamped to ${formatDuration(recordedContributed)})`,
      });
      console.log(`  => CANDIDATE FOR RECOVERY: Restore to full actual work ${formatDuration(actualWorkSeconds)}\n`);
    } else {
      console.log(`  => Normal / unchanged.\n`);
    }
  }

  console.log(`-------------------------------------------------------`);
  console.log(`Summary of Planned Updates (${updatesToApply.length} sessions):`);
  for (const u of updatesToApply) {
    console.log(`- [${u.dateStr}] "${u.taskTitle}": ${formatDuration(u.oldContributedSec)} -> ${formatDuration(u.newContributedSec)} (${u.reason})`);
  }

  if (isApply) {
    console.log(`\nApplying updates to MongoDB...`);
    for (const u of updatesToApply) {
      await TimerSession.updateOne(
        { _id: u.sessionId },
        { $set: { contributedSeconds: u.newContributedSec } }
      );
    }
    console.log(`Updated ${updatesToApply.length} TimerSession records.`);

    // Recalibrate tasks
    console.log(`Recalibrating affected Task.totalTrackedSeconds...`);
    const affectedTaskIds = Array.from(new Set(updatesToApply.map((u) => u.taskId)));
    let tasksUpdated = 0;
    for (const tid of affectedTaskIds) {
      const allTaskSessions = await TimerSession.find({
        taskId: tid,
        status: "completed",
      }).lean();
      const trueTotalSec = allTaskSessions.reduce((sum, sess) => sum + (sess.contributedSeconds ?? 0), 0);
      const prevTask = taskMap.get(tid);
      await Task.updateOne(
        { _id: tid },
        { $set: { totalTrackedSeconds: trueTotalSec } }
      );
      console.log(`- Task "${prevTask?.title}": totalTrackedSeconds ${formatDuration(prevTask?.totalTrackedSeconds ?? 0)} -> ${formatDuration(trueTotalSec)}`);
      tasksUpdated++;
    }
    console.log(`Recalibrated ${tasksUpdated} tasks.`);
    console.log(`\n[RECOVERY APPLIED SUCCESSFULLY]`);
  } else {
    console.log(`\n[DRY RUN COMPLETE]`);
    console.log(`To apply these changes to the database, run:`);
    console.log(`  npx tsx scripts/recover-task-time.ts --apply\n`);
  }

  process.exit(0);
}

main().catch((err) => {
  console.error("Recovery script error:", err);
  process.exit(1);
});

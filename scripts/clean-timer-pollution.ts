import fs from "node:fs";
import path from "node:path";
import { config } from "dotenv";

const externalEnv = path.resolve(process.cwd(), "..", "secrets", ".env.local");
config({ path: fs.existsSync(externalEnv) ? externalEnv : ".env.local" });

import { connectDB } from "../lib/db/connect";
import { TimerSession } from "../lib/db/models/TimerSession";
import { Notification } from "../lib/db/models/Notification";
import { Task } from "../lib/db/models/Task";
import { ScheduledTask } from "../lib/db/models/ScheduledTask";
import mongoose from "mongoose";

async function main() {
  const isApply = process.argv.includes("--apply");
  const isDryRun = !isApply;
  const includeAllGhosts = process.argv.includes("--all-ghosts") || process.argv.includes("--all");
  const fixRunaways = process.argv.includes("--fix-runaways") || process.argv.includes("--all");

  console.log(`=======================================================`);
  console.log(`         SCHEDULECHAT TIMER POLLUTION CLEANER          `);
  console.log(`=======================================================`);
  console.log(`Execution Mode: ${isDryRun ? "DRY RUN (no database modifications)" : "APPLY (writing changes to MongoDB)"}`);
  console.log(`Clean All Ghosts (--all-ghosts): ${includeAllGhosts ? "YES" : "NO (use --all-ghosts to clean all notif-click sessions)"}`);
  console.log(`Fix Runaway Timers (--fix-runaways): ${fixRunaways ? "YES" : "NO (use --fix-runaways to cap zombie timers)"}\n`);

  await connectDB();

  const scheduledSessions = await TimerSession.find({
    scheduledTaskId: { $ne: null },
  }).sort({ startedAt: -1 }).lean();

  const scheduledTaskMap = new Map<string, string>();
  const scheduledTasks = await ScheduledTask.find().lean();
  for (const st of scheduledTasks) {
    scheduledTaskMap.set(String(st._id), st.title);
  }

  // 1. Group by userId + scheduledTaskId + date (YYYY-MM-DD)
  const groups = new Map<string, typeof scheduledSessions>();
  for (const session of scheduledSessions) {
    const dateStr = session.startedAt ? new Date(session.startedAt).toISOString().slice(0, 10) : "unknown";
    const key = `${String(session.userId)}_${String(session.scheduledTaskId)}_${dateStr}`;
    const existing = groups.get(key) || [];
    existing.push(session);
    groups.set(key, existing);
  }

  const directDuplicatesToDelete: mongoose.Types.ObjectId[] = [];
  const sessionRemappings = new Map<string, string>(); // oldId -> newId

  console.log(`--- CATEGORY 1: DIRECT DUPLICATES (Real Timer + Ghost on Same Date) ---`);
  for (const [key, sessions] of groups.entries()) {
    if (sessions.length > 1) {
      const realSessions = sessions.filter((s) => {
        const start = s.startedAt ? new Date(s.startedAt).getTime() : 0;
        const end = s.actualEndedAt ? new Date(s.actualEndedAt).getTime() : 0;
        return Math.abs(end - start) > 5000;
      });
      const ghostSessions = sessions.filter((s) => {
        const start = s.startedAt ? new Date(s.startedAt).getTime() : 0;
        const end = s.actualEndedAt ? new Date(s.actualEndedAt).getTime() : 0;
        return Math.abs(end - start) <= 5000;
      });

      if (realSessions.length > 0 && ghostSessions.length > 0) {
        const primary = realSessions[0]!;
        const taskTitle = scheduledTaskMap.get(String(primary.scheduledTaskId)) ?? "Scheduled Task";
        console.log(`\nDuplicate Routine on ${sessions[0]?.startedAt?.toISOString().slice(0, 10)}: "${taskTitle}"`);
        console.log(`  [KEEP] Real Timer Session: ${primary._id} (${primary.contributedSeconds}s tracked)`);
        for (const ghost of ghostSessions) {
          console.log(`  [DELETE] Ghost Duplicate: ${ghost._id} (${ghost.contributedSeconds}s tracked)`);
          directDuplicatesToDelete.push(ghost._id as any);
          sessionRemappings.set(String(ghost._id), String(primary._id));
        }
      }
    }
  }

  console.log(`\nFound ${directDuplicatesToDelete.length} direct duplicate ghost sessions.`);

  // 2. Identify all standalone ghost sessions created via notification click
  const standaloneGhostsToDelete: mongoose.Types.ObjectId[] = [];
  console.log(`\n--- CATEGORY 2: STANDALONE GHOST SESSIONS (Created via "I did this" with no timer) ---`);
  for (const s of scheduledSessions) {
    if (directDuplicatesToDelete.some((id) => String(id) === String(s._id))) continue;

    const start = s.startedAt ? new Date(s.startedAt).getTime() : 0;
    const end = s.actualEndedAt ? new Date(s.actualEndedAt).getTime() : 0;
    const isGhost = Math.abs(end - start) <= 5000;

    if (isGhost) {
      const taskTitle = scheduledTaskMap.get(String(s.scheduledTaskId)) ?? "Scheduled Task";
      const dateStr = s.startedAt ? new Date(s.startedAt).toISOString().slice(0, 10) : "unknown";
      console.log(`  - ${s._id} | Date: ${dateStr} | Task: "${taskTitle}" | Tracked: ${s.contributedSeconds}s | Status: ${s.status}`);
      if ((s.contributedSeconds ?? 0) > 0) {
        standaloneGhostsToDelete.push(s._id as any);
      }
    }
  }

  console.log(`\nFound ${standaloneGhostsToDelete.length} standalone ghost sessions with tracked time.`);

  // 3. Identify runaway sessions that never auto-stopped
  const runawaySessions: typeof scheduledSessions = [];
  console.log(`\n--- CATEGORY 3: RUNAWAY ZOMBIE SESSIONS (Exceeded 4 Hours) ---`);
  for (const s of scheduledSessions) {
    if ((s.contributedSeconds ?? 0) > 14400) { // > 4 hours
      runawaySessions.push(s);
      const taskTitle = scheduledTaskMap.get(String(s.scheduledTaskId)) ?? "Scheduled Task";
      const dateStr = s.startedAt ? new Date(s.startedAt).toISOString().slice(0, 10) : "unknown";
      console.log(`  - ${s._id} | Date: ${dateStr} | Task: "${taskTitle}" | Runaway Tracked: ${s.contributedSeconds}s (${Math.round((s.contributedSeconds ?? 0) / 3600)} hours)`);
    }
  }
  console.log(`Found ${runawaySessions.length} runaway sessions.`);

  // Determine final list of sessions to delete
  const finalToDelete: mongoose.Types.ObjectId[] = [...directDuplicatesToDelete];
  if (includeAllGhosts) {
    for (const id of standaloneGhostsToDelete) {
      if (!finalToDelete.some((item) => String(item) === String(id))) {
        finalToDelete.push(id);
      }
    }
  }

  console.log(`\n======================= CLEANUP SUMMARY =======================`);
  console.log(`Sessions queued for deletion: ${finalToDelete.length}`);
  console.log(`Runaway sessions to cap: ${fixRunaways ? runawaySessions.length : 0}`);

  if (isApply) {
    if (finalToDelete.length > 0) {
      console.log(`\nExecuting deletion of ${finalToDelete.length} sessions...`);
      const delRes = await TimerSession.deleteMany({ _id: { $in: finalToDelete } });
      console.log(`Deleted ${delRes.deletedCount} sessions.`);

      // Update notifications pointing to deleted sessions
      for (const [oldId, newId] of sessionRemappings.entries()) {
        await Notification.updateMany(
          { timerSessionId: new mongoose.Types.ObjectId(oldId) },
          { $set: { timerSessionId: new mongoose.Types.ObjectId(newId) } }
        );
      }
      if (includeAllGhosts) {
        await Notification.updateMany(
          { timerSessionId: { $in: standaloneGhostsToDelete } },
          { $set: { timerSessionId: null } }
        );
      }
      console.log(`Updated affected notifications.`);
    }

    if (fixRunaways && runawaySessions.length > 0) {
      console.log(`\nCapping ${runawaySessions.length} runaway sessions to their planned duration...`);
      for (const r of runawaySessions) {
        const planned = r.plannedDurationSeconds || 1800;
        await TimerSession.updateOne(
          { _id: r._id },
          {
            $set: {
              contributedSeconds: planned,
              actualEndedAt: new Date(new Date(r.startedAt).getTime() + (10 + planned) * 1000),
            },
          }
        );
        console.log(`  Capped session ${r._id} to ${planned}s.`);
      }
    }

    // Recalibrate tasks
    console.log(`\nRecalibrating Task.totalTrackedSeconds...`);
    const tasks = await Task.find({ status: { $ne: "archived" } });
    let tasksFixed = 0;
    for (const task of tasks) {
      const taskSessions = await TimerSession.find({ taskId: task._id, status: "completed" }).lean();
      const actualTrackedSeconds = taskSessions.reduce((acc, s) => acc + (s.contributedSeconds ?? 0), 0);
      if (task.totalTrackedSeconds !== actualTrackedSeconds) {
        task.totalTrackedSeconds = actualTrackedSeconds;
        await task.save();
        tasksFixed++;
      }
    }
    console.log(`Recalibrated ${tasksFixed} tasks.`);
    console.log(`\n[CLEANUP COMPLETED SUCCESSFULLY]`);
  } else {
    console.log(`\n[DRY RUN COMPLETE]`);
    console.log(`To apply changes, run one of the following commands:`);
    console.log(`  1. Clean direct duplicate sessions only:`);
    console.log(`     npm run script:clean-timers -- --apply`);
    console.log(`  2. Clean ALL test ghost sessions + cap runaway timers:`);
    console.log(`     npm run script:clean-timers -- --all --apply\n`);
  }

  process.exit(0);
}

main().catch((err) => {
  console.error("Cleanup error:", err);
  process.exit(1);
});

import { Task } from "@/lib/db/models/Task";
import { Tab } from "@/lib/db/models/Tab";
import type { AIActionDoc } from "@/lib/db/models/AIAction";

/**
 * Performs the actual Mongoose write for an approved AIAction. Returns the
 * after-snapshot to store on the action record. This is the ONLY place AI
 * proposals turn into real writes — see architecture/01-critical-components.md §B.
 */
export async function executeApprovedAction(
  action: Pick<AIActionDoc, "type" | "proposedPayload">,
  userId: string
): Promise<Record<string, unknown> | null> {
  const payload = action.proposedPayload as Record<string, unknown>;

  switch (action.type) {
    case "create-task": {
      const task = await Task.create({
        userId,
        tabId: payload.tabId,
        title: payload.title,
        estimateMinutes: payload.estimateMinutes ?? 30,
        defaultTimerMinutes: payload.defaultTimerMinutes ?? 30,
        scheduledDate: payload.scheduledDate ?? null,
        source: payload.source ?? "ai-suggested",
        aiAccepted: false,
      });
      return JSON.parse(JSON.stringify(task.toObject()));
    }

    case "update-task": {
      const { taskId, ...fields } = payload;
      const task = await Task.findOneAndUpdate({ _id: taskId, userId }, { $set: fields }, { new: true }).lean();
      return task ? JSON.parse(JSON.stringify(task)) : null;
    }

    case "move-task": {
      const task = await Task.findOneAndUpdate(
        { _id: payload.taskId, userId },
        { $set: { tabId: payload.tabId } },
        { new: true }
      ).lean();
      return task ? JSON.parse(JSON.stringify(task)) : null;
    }

    case "set-schedule": {
      const task = await Task.findOneAndUpdate(
        { _id: payload.taskId, userId },
        { $set: { scheduledDate: payload.scheduledDate } },
        { new: true }
      ).lean();
      return task ? JSON.parse(JSON.stringify(task)) : null;
    }

    case "create-tab": {
      const count = await Tab.countDocuments({ userId });
      const tab = await Tab.create({ userId, name: payload.name, order: count, isSystemDefault: false });
      return JSON.parse(JSON.stringify(tab.toObject()));
    }

    case "archive-task": {
      const task = await Task.findOneAndUpdate(
        { _id: payload.taskId, userId },
        { $set: { status: "archived" } },
        { new: true }
      ).lean();
      return task ? JSON.parse(JSON.stringify(task)) : null;
    }

    case "create-scheduled-task": {
      const { ScheduledTask } = await import("@/lib/db/models/ScheduledTask");
      const { createRecurringGoogleEvent } = await import("@/lib/calendar/googleCalendarService");

      const googleEventId = await createRecurringGoogleEvent(userId, {
        title: String(payload.title),
        description: payload.description ? String(payload.description) : undefined,
        startTime: String(payload.startTime),
        durationMinutes: Number(payload.durationMinutes) || 30,
        timezone: payload.timezone ? String(payload.timezone) : undefined,
        recurrenceRule: String(payload.recurrenceRule),
        reminderMinutes: Number(payload.reminderMinutes) || 10,
      });

      const doc = await ScheduledTask.create({
        userId,
        title: payload.title,
        description: payload.description ?? "",
        startTime: payload.startTime,
        durationMinutes: payload.durationMinutes ?? 30,
        timezone: payload.timezone ?? "Asia/Kolkata",
        recurrenceRule: payload.recurrenceRule,
        recurrenceLabel: payload.recurrenceLabel ?? "",
        reminderMinutes: payload.reminderMinutes ?? 10,
        syncToGoogleCalendar: true,
        googleEventId,
        enabled: true,
      });
      return JSON.parse(JSON.stringify(doc.toObject()));
    }

    case "delete-scheduled-task": {
      const { ScheduledTask } = await import("@/lib/db/models/ScheduledTask");
      const { deleteGoogleEvent } = await import("@/lib/calendar/googleCalendarService");

      const existing = await ScheduledTask.findOne({ _id: payload.scheduledTaskId, userId }).lean();
      if (existing?.googleEventId) {
        await deleteGoogleEvent(userId, existing.googleEventId);
      }
      await ScheduledTask.deleteOne({ _id: payload.scheduledTaskId, userId });
      return { deletedId: payload.scheduledTaskId };
    }

    case "create-tasks-batch": {
      const rawTasks = (payload.tasks as Array<Record<string, unknown>>) ?? [];
      const docs = await Task.insertMany(
        rawTasks.map((t) => ({
          userId,
          tabId: t.tabId,
          title: t.title,
          estimateMinutes: t.estimateMinutes ?? 60,
          defaultTimerMinutes: t.defaultTimerMinutes ?? 30,
          scheduledDate: t.scheduledDate ?? null,
          description: t.description ?? "",
          source: t.source ?? "ai-suggested",
          aiAccepted: false,
        }))
      );
      return { createdTasks: JSON.parse(JSON.stringify(docs)) };
    }

    case "update-sprint-log": {
      const { GoalContext } = await import("@/lib/db/models/GoalContext");
      const existing = await GoalContext.findOne({ userId });
      const before = existing ? JSON.parse(JSON.stringify(existing)) : null;
      const updated = await GoalContext.findOneAndUpdate(
        { userId },
        {
          $set: {
            aiSprintLog: payload.aiSprintLog,
            lastSprintPlanDate: new Date(),
          },
        },
        { upsert: true, new: true }
      );
      return { updated: JSON.parse(JSON.stringify(updated)), beforeLog: before?.aiSprintLog ?? "" };
    }

    default:
      throw new Error(`Unknown action type: ${action.type}`);
  }
}

/**
 * Reverses an executed AIAction. For updates/moves/schedule/archive, restores the
 * full beforeSnapshot over the current doc. For creates, soft-deletes (archives) the
 * created doc/tab instead of hard-deleting, consistent with "AI never hard-deletes".
 */
export async function undoExecutedAction(
  action: Pick<AIActionDoc, "type" | "proposedPayload" | "beforeSnapshot" | "afterSnapshot">,
  userId: string
): Promise<void> {
  const before = action.beforeSnapshot as Record<string, unknown> | null;
  const after = action.afterSnapshot as Record<string, unknown> | null;

  switch (action.type) {
    case "create-task": {
      if (after?._id) {
        await Task.findOneAndUpdate({ _id: after._id, userId }, { $set: { status: "archived" } });
      }
      return;
    }
    case "create-tab": {
      if (after?._id) {
        await Tab.findOneAndUpdate({ _id: after._id, userId }, { $set: { status: "archived" } });
      }
      return;
    }
    case "create-scheduled-task": {
      if (after?._id) {
        const { ScheduledTask } = await import("@/lib/db/models/ScheduledTask");
        const { deleteGoogleEvent } = await import("@/lib/calendar/googleCalendarService");
        if (after.googleEventId) {
          await deleteGoogleEvent(userId, String(after.googleEventId));
        }
        // Soft-delete: disable instead of hard-deleting, per Engineering Rule 3
        // ("No task is ever hard-deleted by the AI")
        await ScheduledTask.findOneAndUpdate(
          { _id: after._id, userId },
          { $set: { enabled: false, googleEventId: null } }
        );
      }
      return;
    }
    case "delete-scheduled-task": {
      if (before?._id) {
        const { ScheduledTask } = await import("@/lib/db/models/ScheduledTask");
        await ScheduledTask.create(before);
      }
      return;
    }
    case "update-task":
    case "move-task":
    case "set-schedule":
    case "archive-task": {
      if (before && before._id) {
        const { _id, __v, ...rest } = before;
        void __v; // discarded — Mongoose's internal version key, not part of the restore payload
        await Task.findOneAndUpdate({ _id, userId }, { $set: rest });
      }
      return;
    }
    case "create-tasks-batch": {
      if (after && typeof after === "object" && Array.isArray((after as { createdTasks?: Array<{ _id: string }> }).createdTasks)) {
        const ids = (after as { createdTasks: Array<{ _id: string }> }).createdTasks.map((t) => t._id);
        await Task.updateMany({ _id: { $in: ids }, userId }, { $set: { status: "archived" } });
      }
      return;
    }
    case "update-sprint-log": {
      if (after && (after as { beforeLog?: string }).beforeLog !== undefined) {
        const { GoalContext } = await import("@/lib/db/models/GoalContext");
        await GoalContext.findOneAndUpdate(
          { userId },
          { $set: { aiSprintLog: (after as { beforeLog: string }).beforeLog } }
        );
      }
      return;
    }
    default:
      throw new Error(`Unknown action type: ${action.type}`);
  }
}

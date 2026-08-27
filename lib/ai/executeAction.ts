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
  const payload = action.proposedPayload as Record<string, any>;

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
  const before = action.beforeSnapshot as Record<string, any> | null;
  const after = action.afterSnapshot as Record<string, any> | null;

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
    case "update-task":
    case "move-task":
    case "set-schedule":
    case "archive-task": {
      if (before && before._id) {
        const { _id, __v, ...rest } = before;
        await Task.findOneAndUpdate({ _id, userId }, { $set: rest });
      }
      return;
    }
    default:
      throw new Error(`Unknown action type: ${action.type}`);
  }
}

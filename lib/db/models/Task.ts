import { Schema, model, models, type InferSchemaType, type Model } from "mongoose";

const TaskSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    tabId: { type: Schema.Types.ObjectId, ref: "Tab", required: true, index: true },
    title: { type: String, required: true, trim: true },
    description: { type: String, default: "" },

    source: { type: String, enum: ["manual", "ai-suggested"], default: "manual" },
    aiAccepted: { type: Boolean, default: true },
    status: { type: String, enum: ["not-started", "in-progress", "done", "archived"], default: "not-started" },

    estimateMinutes: { type: Number, required: true, default: 30 },
    defaultTimerMinutes: { type: Number, required: true, default: 30 },

    progressPercent: { type: Number, min: 0, max: 100, default: 0 },
    totalTrackedSeconds: { type: Number, default: 0 },

    scheduledDate: { type: Date, default: null },
    startDate: { type: Date, default: null },
    endDate: { type: Date, default: null },

    order: { type: Number, default: 0 },
  },
  { timestamps: true }
);

TaskSchema.index({ userId: 1, tabId: 1, order: 1 });
TaskSchema.index({ userId: 1, scheduledDate: 1 });
TaskSchema.index({ userId: 1, startDate: 1, endDate: 1 });

export type TaskDoc = InferSchemaType<typeof TaskSchema> & { _id: Schema.Types.ObjectId };

export const Task: Model<TaskDoc> = (models.Task as Model<TaskDoc>) || model<TaskDoc>("Task", TaskSchema);

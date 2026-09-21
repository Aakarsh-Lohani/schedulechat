import { Schema, model, models, type InferSchemaType, type Model } from "mongoose";

const TimerSessionSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    taskId: { type: Schema.Types.ObjectId, ref: "Task", required: false, index: true, default: null },
    scheduledTaskId: { type: Schema.Types.ObjectId, ref: "ScheduledTask", required: false, index: true, default: null },
    slot: { type: Number, enum: [1, 2], required: true },

    startedAt: { type: Date, required: true },
    plannedDurationSeconds: { type: Number, required: true },
    status: { type: String, enum: ["countdown", "running", "paused", "completed", "cancelled"], default: "countdown" },
    countdownEndsAt: { type: Date, default: null },
    extendedBySeconds: { type: Number, default: 0 },
    actualEndedAt: { type: Date, default: null },
    contributedSeconds: { type: Number, default: 0 },
    pausedAt: { type: Date, default: null },
    totalPausedSeconds: { type: Number, default: 0 },
  },
  { timestamps: true }
);

TimerSessionSchema.index({ userId: 1, slot: 1, status: 1 });
TimerSessionSchema.index({ userId: 1, taskId: 1, status: 1 });
TimerSessionSchema.index({ userId: 1, scheduledTaskId: 1, status: 1 });

export type TimerSessionDoc = InferSchemaType<typeof TimerSessionSchema> & { _id: Schema.Types.ObjectId };

if (models.TimerSession && !models.TimerSession.schema.path("pausedAt")) {
  delete models.TimerSession;
}

export const TimerSession: Model<TimerSessionDoc> =
  (models.TimerSession as Model<TimerSessionDoc>) || model<TimerSessionDoc>("TimerSession", TimerSessionSchema);

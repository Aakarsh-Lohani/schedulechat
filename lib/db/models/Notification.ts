import { Schema, model, models, type InferSchemaType, type Model } from "mongoose";

const NotificationSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    scheduledTaskId: { type: Schema.Types.ObjectId, ref: "ScheduledTask", required: true, index: true },
    title: { type: String, required: true, trim: true },
    description: { type: String, default: "" },
    date: { type: String, required: true, index: true },
    startTime: { type: String, required: true },
    durationMinutes: { type: Number, required: true, default: 30 },
    status: {
      type: String,
      enum: ["pending", "approved", "rejected", "dismissed"],
      default: "pending",
      index: true,
    },
    timerSessionId: { type: Schema.Types.ObjectId, ref: "TimerSession", default: null },
  },
  { timestamps: true }
);

NotificationSchema.index({ userId: 1, date: 1, scheduledTaskId: 1 }, { unique: true });

export type NotificationDoc = InferSchemaType<typeof NotificationSchema> & { _id: Schema.Types.ObjectId };

if (models.Notification && !models.Notification.schema.path("scheduledTaskId")) {
  delete models.Notification;
}

export const Notification: Model<NotificationDoc> =
  (models.Notification as Model<NotificationDoc>) || model<NotificationDoc>("Notification", NotificationSchema);

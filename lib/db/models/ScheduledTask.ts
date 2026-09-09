import { Schema, model, models, type InferSchemaType, type Model } from "mongoose";

const ScheduledTaskSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    tabId: { type: Schema.Types.ObjectId, ref: "Tab", index: true },
    title: { type: String, required: true, trim: true },
    description: { type: String, default: "" },

    // Time of day in 24-hour format: "HH:mm" (e.g. "19:00", "14:30", "08:00")
    startTime: { type: String, required: true },

    // Duration in minutes
    durationMinutes: { type: Number, required: true, default: 30 },

    // Timezone string (e.g. "Asia/Kolkata", "UTC")
    timezone: { type: String, default: "Asia/Kolkata" },

    // RFC 5545 Recurrence Rule (e.g. "FREQ=DAILY", "FREQ=WEEKLY;BYDAY=MO,WE,FR", "FREQ=WEEKLY;BYDAY=SU", "FREQ=WEEKLY;INTERVAL=2;BYDAY=SA")
    recurrenceRule: { type: String, required: true },

    // Human-readable recurrence description (e.g. "Every day at 7:00 PM", "Every alternate Saturday at 8:00 AM")
    recurrenceLabel: { type: String, default: "" },

    // Reminder popup minutes before event (e.g. 10)
    reminderMinutes: { type: Number, default: 10 },

    enabled: { type: Boolean, default: true },
    syncToGoogleCalendar: { type: Boolean, default: true },

    googleCalendarId: { type: String, default: "primary" },
    googleEventId: { type: String, default: null },
  },
  { timestamps: true }
);

ScheduledTaskSchema.index({ userId: 1, enabled: 1 });

export type ScheduledTaskDoc = InferSchemaType<typeof ScheduledTaskSchema> & { _id: Schema.Types.ObjectId };

export const ScheduledTask: Model<ScheduledTaskDoc> =
  (models.ScheduledTask as Model<ScheduledTaskDoc>) ||
  model<ScheduledTaskDoc>("ScheduledTask", ScheduledTaskSchema);

import { Schema, model, models, type InferSchemaType, type Model } from "mongoose";

const AIActionSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    type: {
      type: String,
      enum: ["create-task", "update-task", "move-task", "set-schedule", "create-tab", "archive-task"],
      required: true,
    },
    mode: { type: String, enum: ["suggest", "update"], required: true },
    summary: { type: String, required: true },

    proposedPayload: { type: Schema.Types.Mixed, required: true },
    status: { type: String, enum: ["proposed", "approved", "rejected", "executed", "undone"], default: "proposed" },

    beforeSnapshot: { type: Schema.Types.Mixed, default: null },
    afterSnapshot: { type: Schema.Types.Mixed, default: null },

    chatMessageId: { type: Schema.Types.ObjectId, ref: "ChatMessage", default: null },
    executedAt: { type: Date, default: null },
    undoneAt: { type: Date, default: null },
  },
  { timestamps: true }
);

AIActionSchema.index({ userId: 1, createdAt: -1 });

export type AIActionDoc = InferSchemaType<typeof AIActionSchema> & { _id: Schema.Types.ObjectId };

export const AIAction: Model<AIActionDoc> =
  (models.AIAction as Model<AIActionDoc>) || model<AIActionDoc>("AIAction", AIActionSchema);

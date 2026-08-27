import { Schema, model, models, type InferSchemaType, type Model } from "mongoose";

const ChatMessageSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    role: { type: String, enum: ["user", "assistant", "system-note"], required: true },
    content: { type: String, required: true },
    mode: { type: String, enum: ["suggest", "update"], required: true },
    relatedActionIds: [{ type: Schema.Types.ObjectId, ref: "AIAction" }],
  },
  { timestamps: true }
);

ChatMessageSchema.index({ userId: 1, createdAt: 1 });

export type ChatMessageDoc = InferSchemaType<typeof ChatMessageSchema> & { _id: Schema.Types.ObjectId };

export const ChatMessage: Model<ChatMessageDoc> =
  (models.ChatMessage as Model<ChatMessageDoc>) || model<ChatMessageDoc>("ChatMessage", ChatMessageSchema);

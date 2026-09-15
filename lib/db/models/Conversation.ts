import { Schema, model, models, type InferSchemaType, type Model } from "mongoose";

const ConversationSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    title: { type: String, required: true, default: "New Chat", trim: true },
  },
  { timestamps: true }
);

ConversationSchema.index({ userId: 1, updatedAt: -1 });

export type ConversationDoc = InferSchemaType<typeof ConversationSchema> & { _id: Schema.Types.ObjectId };

export const Conversation: Model<ConversationDoc> =
  (models.Conversation as Model<ConversationDoc>) ||
  model<ConversationDoc>("Conversation", ConversationSchema);

import { Schema, model, models, type InferSchemaType, type Model } from "mongoose";

const TabSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    name: { type: String, required: true, trim: true },
    isSystemDefault: { type: Boolean, default: false },
    order: { type: Number, required: true, default: 0 },
    status: { type: String, enum: ["active", "archived"], default: "active" },
  },
  { timestamps: true }
);

TabSchema.index({ userId: 1, order: 1 });

export type TabDoc = InferSchemaType<typeof TabSchema> & { _id: Schema.Types.ObjectId };

export const Tab: Model<TabDoc> = (models.Tab as Model<TabDoc>) || model<TabDoc>("Tab", TabSchema);

import { Schema, model, models, type InferSchemaType, type Model } from "mongoose";

const UserSchema = new Schema(
  {
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    passwordHash: { type: String, required: true },
    googleCalendar: {
      connected: { type: Boolean, default: false },
      connectedEmail: { type: String, default: null },
      encryptedRefreshToken: { type: String, default: null },
      iv: { type: String, default: null },
      tag: { type: String, default: null },
      connectedAt: { type: Date, default: null },
    },
  },
  { timestamps: true }
);

export type UserDoc = InferSchemaType<typeof UserSchema> & { _id: Schema.Types.ObjectId };

export const User: Model<UserDoc> = (models.User as Model<UserDoc>) || model<UserDoc>("User", UserSchema);

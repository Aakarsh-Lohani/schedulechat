import { config } from "dotenv";
config({ path: ".env.local" });

import bcrypt from "bcryptjs";
import { connectDB } from "../lib/db/connect";
import { User } from "../lib/db/models/User";
import { Tab } from "../lib/db/models/Tab";
import { Task } from "../lib/db/models/Task";

const DEFAULT_TABS = ["Projects", "DSA", "System Design", "Project Progress"];

async function main() {
  const email = process.env.APP_USER_EMAIL;
  const password = process.env.APP_USER_PASSWORD;
  if (!email || !password) {
    throw new Error("Set APP_USER_EMAIL and APP_USER_PASSWORD in .env.local before seeding.");
  }

  await connectDB();

  let user = await User.findOne({ email: email.toLowerCase().trim() });
  if (!user) {
    const passwordHash = await bcrypt.hash(password, 10);
    user = await User.create({ email: email.toLowerCase().trim(), passwordHash });
    console.log(`Created user ${user.email}`);
  } else {
    console.log(`User ${user.email} already exists, skipping creation.`);
  }

  const existingTabs = await Tab.find({ userId: user._id });
  if (existingTabs.length === 0) {
    const tabs = await Tab.insertMany(
      DEFAULT_TABS.map((name, i) => ({
        userId: user!._id,
        name,
        isSystemDefault: true,
        order: i,
        status: "active",
      }))
    );
    console.log(`Created ${tabs.length} default tabs.`);

    const dsaTab = tabs.find((t) => t.name === "DSA")!;
    await Task.create({
      userId: user._id,
      tabId: dsaTab._id,
      title: "Solve 2 array/string problems",
      estimateMinutes: 45,
      defaultTimerMinutes: 30,
      scheduledDate: new Date(new Date().setHours(0, 0, 0, 0)),
      source: "manual",
    });
    console.log("Created one sample task in DSA, scheduled for today.");
  } else {
    console.log("Tabs already exist, skipping tab/task seeding.");
  }

  console.log("Seed complete.");
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

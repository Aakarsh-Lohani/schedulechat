import { Schema, model, models, type InferSchemaType, type Model } from "mongoose";

const GoalContextSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true, unique: true, index: true },
    userGoalsMarkdown: {
      type: String,
      default: `# Long-Term Strategy & Daily Study Limits

## Daily Study Limits
- Weekdays (Mon–Fri): Max 8 hours/day
- Weekends (Sat–Sun): Max 10 hours/day

## Goals Roadmap (120 Days)
### 1. DSA Mastery (Target: ~100 Hours)
- Week 1-4: Arrays, Two Pointers, Sliding Window, Binary Search, HashMaps
- Week 5-8: Linked Lists, Stacks, Queues, Binary Trees & BSTs, Heaps
- Week 9-12: Graphs (BFS/DFS, Dijkstra), Backtracking, Dynamic Programming (1D & 2D)
- Week 13-16: Mixed LeetCode medium/hard, company-tagged questions & timed contests

### 2. System Design (Target: ~50 Hours)
- Low-Level Design (LLD): OOP Principles, SOLID, Design Patterns (Factory, Strategy, Observer, Decorator)
- High-Level Design (HLD): Scalability fundamentals (Load Balancers, Caching, DB Sharding/Replication, Message Queues)
- Case Studies: Rate Limiter, URL Shortener, Notification Service, Chat System, Video Streaming

### 3. Production Project (Target: ~90 Hours)
- Phase 1: Tech stack selection, Architecture diagram, DB schemas & Auth
- Phase 2: Core feature implementation & background worker pipelines
- Phase 3: Realtime capabilities (WebSockets/SSE), performance caching & indexing
- Phase 4: Containerization (Docker), CI/CD, Deployment & Monitoring
`,
    },
    aiSprintLog: {
      type: String,
      default: `# AI Sprint Log & Memory

*No sprint planned yet. Click "Plan Next 7-Day Sprint" in the Copilot to generate your first sprint plan.*
`,
    },
    lastSprintPlanDate: { type: Date, default: null },
  },
  { timestamps: true }
);

export type GoalContextDoc = InferSchemaType<typeof GoalContextSchema> & { _id: Schema.Types.ObjectId };

export const GoalContext: Model<GoalContextDoc> =
  (models.GoalContext as Model<GoalContextDoc>) || model<GoalContextDoc>("GoalContext", GoalContextSchema);

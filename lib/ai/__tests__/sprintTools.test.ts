import { describe, it, expect } from "vitest";
import { TOOLS } from "@/lib/ai/tools";

describe("Sprint Tools & Batch Scheduling", () => {
  it("proposeCreateTasksBatch validates batch tasks correctly", () => {
    const batchTool = TOOLS.proposeCreateTasksBatch!;
    expect(batchTool).toBeDefined();
    expect(batchTool.kind).toBe("propose");

    const validPayload = {
      batchTitle: "Sprint 1: Arrays & System Design",
      tasks: [
        {
          tabName: "DSA",
          title: "Two Sum & 3Sum",
          estimateMinutes: 90,
          scheduledDate: "2026-09-22",
        },
        {
          tabName: "System Design",
          title: "Design Rate Limiter (Token Bucket)",
          estimateMinutes: 60,
          scheduledDate: "2026-09-23",
        },
      ],
      sprintAssumptions: "Allocating 2.5h on weekday evenings.",
    };

    const parsed = batchTool.zodSchema.safeParse(validPayload);
    expect(parsed.success).toBe(true);
  });

  it("proposeCreateTasksBatch rejects invalid dates", () => {
    const batchTool = TOOLS.proposeCreateTasksBatch!;
    const invalidDatePayload = {
      tasks: [
        {
          tabName: "DSA",
          title: "Binary Search",
          scheduledDate: "22-09-2026", // Invalid format: requires YYYY-MM-DD
        },
      ],
    };

    const parsed = batchTool.zodSchema.safeParse(invalidDatePayload);
    expect(parsed.success).toBe(false);
  });

  it("proposeCreateTask supports scheduledDate", () => {
    const tool = TOOLS.proposeCreateTask!;
    expect(tool).toBeDefined();

    const payloadWithDate = {
      tabName: "DSA",
      title: "Invert Binary Tree",
      estimateMinutes: 45,
      scheduledDate: "2026-09-25",
    };

    const parsed = tool.zodSchema.safeParse(payloadWithDate);
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.scheduledDate).toBe("2026-09-25");
    }
  });

  it("getUnfinishedTasks validates daysBack parameter", () => {
    const tool = TOOLS.getUnfinishedTasks!;
    expect(tool).toBeDefined();
    expect(tool.kind).toBe("read");

    const parsed = tool.zodSchema.safeParse({ daysBack: 7 });
    expect(parsed.success).toBe(true);

    const invalid = tool.zodSchema.safeParse({ daysBack: 100 }); // max 30
    expect(invalid.success).toBe(false);
  });

  it("proposeUpdateSprintLog validates notes and assumptions", () => {
    const tool = TOOLS.proposeUpdateSprintLog!;
    expect(tool).toBeDefined();
    expect(tool.kind).toBe("propose");

    const parsed = tool.zodSchema.safeParse({
      sprintNotes: "Completed 7 out of 8 tasks. Graph DFS was challenging.",
      assumptions: "Keeping weekday work under 8 hours.",
    });

    expect(parsed.success).toBe(true);
  });
});

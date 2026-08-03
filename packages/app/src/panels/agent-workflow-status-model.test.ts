import { describe, expect, it } from "vitest";
import { buildAgentWorkflowStatusModel } from "./agent-workflow-status-model";

describe("buildAgentWorkflowStatusModel", () => {
  it("prioritizes a permission request over the running state", () => {
    expect(
      buildAgentWorkflowStatusModel({
        status: "running",
        pendingPermissionTitle: "Run tests",
        attentionReason: "permission",
        hasVisibleGoal: true,
        liveActivityKind: "tool",
        liveToolName: "Bash",
      }),
    ).toMatchObject({
      tone: "warning",
      labelKey: "agentPanel.workflow.permission",
      detail: "Run tests",
    });
  });

  it("describes the current tool without exposing stream content", () => {
    expect(
      buildAgentWorkflowStatusModel({
        status: "running",
        hasVisibleGoal: false,
        liveActivityKind: "tool",
        liveToolName: "apply_patch",
      }),
    ).toMatchObject({
      tone: "active",
      labelKey: "agentPanel.workflow.runningTool",
      toolName: "apply_patch",
    });
  });

  it("keeps lifecycle errors visible and supplies recovery guidance", () => {
    expect(
      buildAgentWorkflowStatusModel({
        status: "error",
        lastError: "Process exited",
        hasVisibleGoal: true,
      }),
    ).toMatchObject({
      tone: "danger",
      detail: "Process exited",
      showRecoveryHint: true,
    });
  });

  it("does not duplicate a generic running label beside a visible Goal", () => {
    expect(
      buildAgentWorkflowStatusModel({
        status: "running",
        hasVisibleGoal: true,
      }),
    ).toBeNull();
  });
});

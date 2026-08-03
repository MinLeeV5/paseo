import { describe, expect, it } from "vitest";
import type { PendingPermission } from "@/types/shared";
import type { StreamItem } from "@/types/stream";
import { countUnreadActivity, createUnreadActivityBaseline } from "./unread-activity";

function message(id: string, timestamp: number): StreamItem {
  return {
    kind: "assistant_message",
    id,
    text: id,
    timestamp: new Date(timestamp),
  };
}

function permission(key: string): PendingPermission {
  return {
    key,
    agentId: "agent-1",
    request: {
      id: key,
      provider: "claude-code",
      name: "Bash",
      kind: "tool",
    },
  };
}

describe("unread activity", () => {
  it("counts stable new timeline items once across tail and live head", () => {
    const existing = message("existing", 900);
    const next = message("next", 1_100);
    const baseline = createUnreadActivityBaseline({
      tail: [existing],
      head: [],
      pendingPermissions: [],
      now: 1_000,
    });

    expect(
      countUnreadActivity({
        baseline,
        tail: [existing, next],
        head: [next],
        pendingPermissions: [],
      }),
    ).toBe(1);
  });

  it("ignores older history prepended after leaving the live edge", () => {
    const baseline = createUnreadActivityBaseline({
      tail: [message("existing", 900)],
      head: [],
      pendingPermissions: [],
      now: 1_000,
    });

    expect(
      countUnreadActivity({
        baseline,
        tail: [message("older", 100), message("existing", 900)],
        head: [],
        pendingPermissions: [],
      }),
    ).toBe(0);
  });

  it("counts a new permission as meaningful live activity", () => {
    const existing = permission("existing");
    const baseline = createUnreadActivityBaseline({
      tail: [],
      head: [],
      pendingPermissions: [existing],
      now: 1_000,
    });

    expect(
      countUnreadActivity({
        baseline,
        tail: [],
        head: [],
        pendingPermissions: [existing, permission("next")],
      }),
    ).toBe(1);
  });
});

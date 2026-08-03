import type { PendingPermission } from "@/types/shared";
import type { StreamItem } from "@/types/stream";

export interface UnreadActivityBaseline {
  itemIds: ReadonlySet<string>;
  permissionKeys: ReadonlySet<string>;
  leftAtMs: number;
}

export function createUnreadActivityBaseline(input: {
  tail: readonly StreamItem[];
  head: readonly StreamItem[];
  pendingPermissions: readonly PendingPermission[];
  now?: number;
}): UnreadActivityBaseline {
  return {
    itemIds: new Set([...input.tail, ...input.head].map((item) => item.id)),
    permissionKeys: new Set(input.pendingPermissions.map((permission) => permission.key)),
    leftAtMs: input.now ?? Date.now(),
  };
}

export function countUnreadActivity(input: {
  baseline: UnreadActivityBaseline | null;
  tail: readonly StreamItem[];
  head: readonly StreamItem[];
  pendingPermissions: readonly PendingPermission[];
}): number {
  if (!input.baseline) {
    return 0;
  }

  const newItemIds = new Set<string>();
  for (const item of [...input.tail, ...input.head]) {
    if (
      !input.baseline.itemIds.has(item.id) &&
      item.timestamp.getTime() >= input.baseline.leftAtMs
    ) {
      newItemIds.add(item.id);
    }
  }

  let permissionCount = 0;
  for (const permission of input.pendingPermissions) {
    if (!input.baseline.permissionKeys.has(permission.key)) {
      permissionCount += 1;
    }
  }

  return newItemIds.size + permissionCount;
}

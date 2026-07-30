import { describe, expect, it } from "vitest";
import {
  ServerInfoStatusPayloadSchema,
  SessionInboundMessageSchema,
  SessionOutboundMessageSchema,
} from "./messages.js";

describe("workspace file search protocol", () => {
  it("parses the correlated request and response pair", () => {
    expect(
      SessionInboundMessageSchema.parse({
        type: "workspace.files.search.request",
        cwd: "/workspace/paseo",
        query: "explorer",
        includeHidden: true,
        requestId: "search-1",
      }),
    ).toEqual({
      type: "workspace.files.search.request",
      cwd: "/workspace/paseo",
      query: "explorer",
      includeHidden: true,
      requestId: "search-1",
    });

    expect(
      SessionOutboundMessageSchema.parse({
        type: "workspace.files.search.response",
        payload: {
          cwd: "/workspace/paseo",
          query: "explorer",
          entries: [
            {
              name: "file-explorer-pane.tsx",
              path: "packages/app/src/components/file-explorer-pane.tsx",
            },
          ],
          error: null,
          requestId: "search-1",
        },
      }),
    ).toEqual({
      type: "workspace.files.search.response",
      payload: {
        cwd: "/workspace/paseo",
        query: "explorer",
        entries: [
          {
            name: "file-explorer-pane.tsx",
            path: "packages/app/src/components/file-explorer-pane.tsx",
          },
        ],
        error: null,
        requestId: "search-1",
      },
    });
  });

  it("keeps the server feature optional for old daemons", () => {
    const oldServer = ServerInfoStatusPayloadSchema.parse({
      status: "server_info",
      serverId: "server-old",
    });
    const currentServer = ServerInfoStatusPayloadSchema.parse({
      status: "server_info",
      serverId: "server-current",
      features: { workspaceFileSearch: true },
    });

    expect(oldServer.features?.workspaceFileSearch).toBeUndefined();
    expect(currentServer.features?.workspaceFileSearch).toBe(true);
  });
});

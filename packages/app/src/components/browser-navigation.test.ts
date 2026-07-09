import { describe, expect, it } from "vitest";
import { getUnsafeNavigationMessage } from "@/components/browser-navigation";

const labels = {
  invalidUrl: "Invalid URL",
  unsupportedProtocol: (protocol: string) => `Unsupported ${protocol}`,
};

describe("getUnsafeNavigationMessage", () => {
  it("allows local file URLs for workspace browser previews", () => {
    expect(getUnsafeNavigationMessage("file:///repo/site/index.html", labels)).toBeNull();
  });

  it("continues blocking unsupported protocols", () => {
    expect(getUnsafeNavigationMessage("javascript:alert(1)", labels)).toBe(
      "Unsupported javascript:",
    );
  });
});

import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  buildDirectConnectionListen,
  createDirectConnectionPasswordStore,
  isDirectConnectionListen,
  listDirectConnectionEndpoints,
  resolveDirectConnectionPort,
  type SafeStorageLike,
} from "./direct-connection";

const tempDirectories = new Set<string>();

afterEach(() => {
  for (const directory of tempDirectories) {
    rmSync(directory, { recursive: true, force: true });
  }
  tempDirectories.clear();
});

describe("direct connection configuration", () => {
  it("keeps an existing TCP port and falls back to the daemon default", () => {
    expect(resolveDirectConnectionPort("unix:///tmp/paseo.sock", "127.0.0.1:7123")).toBe(7123);
    expect(resolveDirectConnectionPort("[::]:7444")).toBe(7444);
    expect(resolveDirectConnectionPort("not-a-listen-address")).toBe(6767);
    expect(buildDirectConnectionListen(7123)).toBe("0.0.0.0:7123");
  });

  it("recognizes IPv4 and IPv6 wildcard listeners", () => {
    expect(isDirectConnectionListen("0.0.0.0:6767")).toBe(true);
    expect(isDirectConnectionListen("[::]:6767")).toBe(true);
    expect(isDirectConnectionListen("127.0.0.1:6767")).toBe(false);
  });

  it("lists reachable IPv4 endpoints with private networks first", () => {
    const endpoints = listDirectConnectionEndpoints(
      {
        lo0: [
          {
            address: "127.0.0.1",
            netmask: "255.0.0.0",
            family: "IPv4",
            mac: "00:00:00:00:00:00",
            internal: true,
            cidr: "127.0.0.1/8",
          },
        ],
        en0: [
          {
            address: "192.168.1.20",
            netmask: "255.255.255.0",
            family: "IPv4",
            mac: "00:00:00:00:00:01",
            internal: false,
            cidr: "192.168.1.20/24",
          },
        ],
        tailscale0: [
          {
            address: "100.70.1.4",
            netmask: "255.192.0.0",
            family: "IPv4",
            mac: "00:00:00:00:00:02",
            internal: false,
            cidr: "100.70.1.4/10",
          },
        ],
      },
      6767,
    );

    expect(endpoints).toEqual([
      { interfaceName: "en0", address: "192.168.1.20", endpoint: "192.168.1.20:6767" },
      {
        interfaceName: "tailscale0",
        address: "100.70.1.4",
        endpoint: "100.70.1.4:6767",
      },
    ]);
  });

  it("encrypts the displayed password before persisting it", () => {
    const userDataPath = mkdtempSync(path.join(os.tmpdir(), "paseo-direct-password-"));
    tempDirectories.add(userDataPath);
    const safeStorage: SafeStorageLike = {
      isEncryptionAvailable: () => true,
      encryptString: (value) => Buffer.from(`encrypted:${value}`, "utf8"),
      decryptString: (value) => value.toString("utf8").replace(/^encrypted:/, ""),
    };
    const store = createDirectConnectionPasswordStore({ userDataPath, safeStorage });

    store.save("correct horse battery staple");

    expect(store.load()).toBe("correct horse battery staple");
    const persisted = readFileSync(
      path.join(userDataPath, "direct-connection-password.enc"),
      "utf8",
    );
    expect(persisted).not.toContain("correct horse battery staple");

    store.clear();
    expect(store.load()).toBeNull();
  });

  it("refuses to save when OS credential encryption is unavailable", () => {
    const userDataPath = mkdtempSync(path.join(os.tmpdir(), "paseo-direct-password-"));
    tempDirectories.add(userDataPath);
    const store = createDirectConnectionPasswordStore({
      userDataPath,
      safeStorage: {
        isEncryptionAvailable: () => false,
        encryptString: () => Buffer.alloc(0),
        decryptString: () => "",
      },
    });

    expect(store.isAvailable()).toBe(false);
    expect(() => store.save("password")).toThrow("Secure credential storage is unavailable.");
  });
});

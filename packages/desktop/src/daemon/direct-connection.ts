import { randomUUID } from "node:crypto";
import { chmodSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import type { NetworkInterfaceInfo } from "node:os";

const DEFAULT_DIRECT_CONNECTION_PORT = 6767;
const PASSWORD_FILENAME = "direct-connection-password.enc";

export interface DirectConnectionEndpoint {
  interfaceName: string;
  address: string;
  endpoint: string;
}

export interface SafeStorageLike {
  isEncryptionAvailable(): boolean;
  encryptString(value: string): Buffer;
  decryptString(value: Buffer): string;
}

export interface DirectConnectionPasswordStore {
  isAvailable(): boolean;
  load(): string | null;
  save(password: string): void;
  clear(): void;
}

export function resolveDirectConnectionPort(
  ...listenValues: Array<string | null | undefined>
): number {
  for (const listen of listenValues) {
    const normalized = listen?.trim() ?? "";
    const match = normalized.match(/(?:^|:)(\d{1,5})$/);
    const port = match ? Number(match[1]) : Number.NaN;
    if (Number.isInteger(port) && port >= 1 && port <= 65535) {
      return port;
    }
  }
  return DEFAULT_DIRECT_CONNECTION_PORT;
}

export function buildDirectConnectionListen(port: number): string {
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error(`Invalid direct connection port: ${port}`);
  }
  return `0.0.0.0:${port}`;
}

export function isDirectConnectionListen(listen: string | null | undefined): boolean {
  const normalized = listen?.trim().toLowerCase() ?? "";
  return (
    normalized.startsWith("0.0.0.0:") ||
    normalized.startsWith("[::]:") ||
    normalized.startsWith(":::")
  );
}

export function listDirectConnectionEndpoints(
  interfaces: NodeJS.Dict<NetworkInterfaceInfo[]>,
  port: number,
): DirectConnectionEndpoint[] {
  const endpoints: DirectConnectionEndpoint[] = [];
  const seen = new Set<string>();

  for (const interfaceName of Object.keys(interfaces).sort()) {
    for (const entry of interfaces[interfaceName] ?? []) {
      const isIpv4 = entry.family === "IPv4";
      if (!isIpv4 || entry.internal || seen.has(entry.address)) {
        continue;
      }
      seen.add(entry.address);
      endpoints.push({
        interfaceName,
        address: entry.address,
        endpoint: `${entry.address}:${port}`,
      });
    }
  }

  return endpoints.sort((left, right) => {
    const interfacePriorityDifference =
      interfacePriority(left.interfaceName) - interfacePriority(right.interfaceName);
    if (interfacePriorityDifference !== 0) return interfacePriorityDifference;
    const priorityDifference = addressPriority(left.address) - addressPriority(right.address);
    if (priorityDifference !== 0) return priorityDifference;
    const interfaceDifference = left.interfaceName.localeCompare(right.interfaceName);
    return interfaceDifference !== 0
      ? interfaceDifference
      : left.address.localeCompare(right.address);
  });
}

export function createDirectConnectionPasswordStore(input: {
  userDataPath: string;
  safeStorage: SafeStorageLike;
}): DirectConnectionPasswordStore {
  const filePath = path.join(input.userDataPath, PASSWORD_FILENAME);

  return {
    isAvailable: () => input.safeStorage.isEncryptionAvailable(),
    load: () => {
      if (!input.safeStorage.isEncryptionAvailable()) return null;
      try {
        const encoded = readFileSync(filePath, "utf8").trim();
        if (!encoded) return null;
        return input.safeStorage.decryptString(Buffer.from(encoded, "base64"));
      } catch {
        return null;
      }
    },
    save: (password) => {
      if (!input.safeStorage.isEncryptionAvailable()) {
        throw new Error("Secure credential storage is unavailable.");
      }
      mkdirSync(input.userDataPath, { recursive: true });
      const encrypted = input.safeStorage.encryptString(password).toString("base64");
      const tempPath = `${filePath}.tmp.${process.pid}.${randomUUID()}`;
      try {
        writeFileSync(tempPath, `${encrypted}\n`, { encoding: "utf8", mode: 0o600 });
        renameSync(tempPath, filePath);
        chmodSync(filePath, 0o600);
      } finally {
        rmSync(tempPath, { force: true });
      }
    },
    clear: () => {
      rmSync(filePath, { force: true });
    },
  };
}

function interfacePriority(interfaceName: string): number {
  const normalized = interfaceName.toLowerCase();
  if (/^(en\d+|eth\d*|enp\w*|wlan\d*|wlp\w*)$/.test(normalized)) return 0;
  if (normalized.includes("wi-fi") || normalized.includes("ethernet")) return 0;
  if (/^(tailscale|utun|tun|tap|wg)/.test(normalized)) return 1;
  if (/^(docker|br-|veth|vmnet|virbr|podman|awdl|llw|bridge)/.test(normalized)) return 3;
  return 2;
}

function addressPriority(address: string): number {
  const octets = address.split(".").map(Number);
  if (octets.length !== 4 || octets.some((octet) => !Number.isInteger(octet))) return 3;
  if (octets[0] === 10 || (octets[0] === 192 && octets[1] === 168)) return 0;
  if (octets[0] === 172 && (octets[1] ?? 0) >= 16 && (octets[1] ?? 0) <= 31) return 0;
  if (octets[0] === 100 && (octets[1] ?? 0) >= 64 && (octets[1] ?? 0) <= 127) return 1;
  return 2;
}

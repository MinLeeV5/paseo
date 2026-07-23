import type {
  AgentSessionChangesSubscribeRequest,
  AgentSessionChangesUnsubscribeRequest,
  SessionOutboundMessage,
} from "@getpaseo/protocol/messages";
import type {
  AgentSessionChangesManager,
  AgentSessionChangesSnapshotPayload,
} from "../../agent-session-changes-manager.js";

interface AgentSessionChangesSessionHost {
  emit(message: SessionOutboundMessage): void;
}

export class AgentSessionChangesSession {
  private readonly host: AgentSessionChangesSessionHost;
  private readonly manager: AgentSessionChangesManager;
  private readonly subscriptions = new Map<string, () => void>();

  constructor(options: {
    host: AgentSessionChangesSessionHost;
    manager: AgentSessionChangesManager;
  }) {
    this.host = options.host;
    this.manager = options.manager;
  }

  async handleSubscribeRequest(msg: AgentSessionChangesSubscribeRequest): Promise<void> {
    this.subscriptions.get(msg.subscriptionId)?.();
    this.subscriptions.delete(msg.subscriptionId);
    const subscription = await this.manager.subscribe(
      {
        agentId: msg.agentId,
        mode: msg.mode,
        ...(Object.prototype.hasOwnProperty.call(msg, "turnId") ? { turnId: msg.turnId } : null),
        ignoreWhitespace: msg.ignoreWhitespace,
      },
      (snapshot) => this.emitUpdate(msg.subscriptionId, snapshot),
    );
    this.subscriptions.set(msg.subscriptionId, subscription.unsubscribe);
    this.host.emit({
      type: "agent.session_changes.subscribe.response",
      payload: {
        subscriptionId: msg.subscriptionId,
        ...subscription.initial,
        requestId: msg.requestId,
      },
    });
  }

  handleUnsubscribeRequest(msg: AgentSessionChangesUnsubscribeRequest): void {
    this.subscriptions.get(msg.subscriptionId)?.();
    this.subscriptions.delete(msg.subscriptionId);
  }

  cleanup(): void {
    for (const unsubscribe of this.subscriptions.values()) {
      unsubscribe();
    }
    this.subscriptions.clear();
  }

  private emitUpdate(subscriptionId: string, snapshot: AgentSessionChangesSnapshotPayload): void {
    this.host.emit({
      type: "agent.session_changes.update",
      payload: { subscriptionId, ...snapshot },
    });
  }
}

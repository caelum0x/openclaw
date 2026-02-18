/**
 * ClawChain event listener.
 *
 * Subscribes to CometBFT WebSocket events and emits notifications
 * for incoming shielded funds and new agent registrations.
 */

export type ChainEventHandler = {
  onNewCommitment?: (commitment: string, leafIndex: number) => void;
  onAgentRegistered?: (address: string, name: string) => void;
  onError?: (error: Error) => void;
};

export class ChainEventListener {
  private ws: WebSocket | null = null;
  private readonly rpcUrl: string;
  private readonly handlers: ChainEventHandler;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private stopped = false;

  constructor(rpcUrl: string, handlers: ChainEventHandler) {
    // Convert http(s) to ws(s) for WebSocket
    this.rpcUrl = rpcUrl
      .replace(/^http:/, "ws:")
      .replace(/^https:/, "wss:");
    this.handlers = handlers;
  }

  start(): void {
    this.stopped = false;
    this.connect();
  }

  stop(): void {
    this.stopped = true;
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    if (this.ws) {
      try {
        this.ws.close();
      } catch {
        // ignore close errors
      }
      this.ws = null;
    }
  }

  private connect(): void {
    if (this.stopped) return;

    try {
      const wsUrl = `${this.rpcUrl}/websocket`;
      this.ws = new WebSocket(wsUrl);

      this.ws.onopen = () => {
        // Subscribe to new shield commitment events
        this.subscribe("tm.event='Tx' AND shield.commitment EXISTS");
        // Subscribe to agent registration events
        this.subscribe("tm.event='Tx' AND agent_register.address EXISTS");
      };

      this.ws.onmessage = (event) => {
        try {
          const data = JSON.parse(String(event.data));
          this.handleEvent(data);
        } catch {
          // malformed message, ignore
        }
      };

      this.ws.onerror = () => {
        this.handlers.onError?.(new Error("WebSocket connection error"));
      };

      this.ws.onclose = () => {
        if (!this.stopped) {
          this.scheduleReconnect();
        }
      };
    } catch (err) {
      this.handlers.onError?.(
        err instanceof Error ? err : new Error(String(err)),
      );
      if (!this.stopped) {
        this.scheduleReconnect();
      }
    }
  }

  private subscribe(query: string): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;
    this.ws.send(
      JSON.stringify({
        jsonrpc: "2.0",
        id: Date.now(),
        method: "subscribe",
        params: { query },
      }),
    );
  }

  private handleEvent(data: unknown): void {
    const result = (data as Record<string, unknown>)?.result as Record<string, unknown> | undefined;
    if (!result?.events) return;

    const events = result.events as Record<string, string[]>;

    // Handle new commitment events
    if (events["shield.commitment"]) {
      const commitments = events["shield.commitment"];
      const leafIndices = events["shield.leaf_index"] ?? [];
      for (let i = 0; i < commitments.length; i++) {
        this.handlers.onNewCommitment?.(
          commitments[i],
          leafIndices[i] ? parseInt(leafIndices[i], 10) : -1,
        );
      }
    }

    // Handle agent registration events
    if (events["agent_register.address"]) {
      const addresses = events["agent_register.address"];
      const names = events["agent_register.name"] ?? [];
      for (let i = 0; i < addresses.length; i++) {
        this.handlers.onAgentRegistered?.(
          addresses[i],
          names[i] ?? "unknown",
        );
      }
    }
  }

  private scheduleReconnect(): void {
    if (this.reconnectTimer || this.stopped) return;
    // Reconnect after 5 seconds
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.connect();
    }, 5000);
  }
}

// ---------------------------------------------------------------------------
// Heartbeat checker (runs on cron)
// ---------------------------------------------------------------------------

export async function checkChainHeartbeat(rpcUrl: string): Promise<{
  alive: boolean;
  height?: number;
  error?: string;
}> {
  try {
    const response = await fetch(`${rpcUrl}/status`);
    if (!response.ok) {
      return { alive: false, error: `HTTP ${response.status}` };
    }
    const data = (await response.json()) as {
      result?: { sync_info?: { latest_block_height?: string } };
    };
    const height = data?.result?.sync_info?.latest_block_height;
    return {
      alive: true,
      height: height ? parseInt(height, 10) : undefined,
    };
  } catch (err) {
    return { alive: false, error: String(err) };
  }
}

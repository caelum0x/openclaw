/**
 * ClawChain extension for OpenClaw.
 *
 * Registers blockchain tools, starts chain event listener, and
 * auto-registers the agent on-chain when the gateway boots.
 */

import type { AnyAgentTool, OpenClawPluginApi } from "../../src/plugins/types.js";
import type { ClawChainClient, ClawChainAgent } from "@clawchain/sdk";
import { createAllTools } from "./src/tools.js";
import { ChainEventListener } from "./src/events.js";
import { initializeAgentIdentity } from "./src/identity.js";

// ---------------------------------------------------------------------------
// Module-level state (shared across the extension lifecycle)
// ---------------------------------------------------------------------------

let chainClient: ClawChainClient | null = null;
let chainAgent: ClawChainAgent | null = null;
let eventListener: ChainEventListener | null = null;

// ---------------------------------------------------------------------------
// Extension entry point
// ---------------------------------------------------------------------------

export default function register(api: OpenClawPluginApi) {
  const deps = {
    getClient: () => chainClient,
    getAgent: () => chainAgent,
  };

  // Register all 9 blockchain tools
  const tools = createAllTools(deps);
  for (const tool of tools) {
    api.registerTool(tool as unknown as AnyAgentTool, { optional: true });
  }
}

// ---------------------------------------------------------------------------
// Called from gateway startup (server-startup.ts) when blockchain is enabled
// ---------------------------------------------------------------------------

export async function initializeBlockchain(config: {
  enabled?: boolean;
  rpcUrl?: string;
  restUrl?: string;
  mnemonic?: string;
  denom?: string;
  prefix?: string;
  gasPrice?: string;
  proofBinaryPath?: string;
  keysDir?: string;
  autoRegister?: boolean;
}): Promise<{
  address?: string;
  registered?: boolean;
}> {
  if (!config.enabled) {
    return {};
  }

  const log = {
    info: (msg: string) => console.log(`[clawchain] ${msg}`),
    warn: (msg: string) => console.warn(`[clawchain] ${msg}`),
    error: (msg: string) => console.error(`[clawchain] ${msg}`),
  };

  // Initialize agent identity (derives wallet, connects to chain, auto-registers)
  const identity = await initializeAgentIdentity(config, log);
  if (!identity) {
    return {};
  }

  chainAgent = identity.agent;
  // The client is accessed through the agent's internal state; expose via the
  // deps getter which tools already use.  For direct client access we extract
  // the ClawChainClient from the SDK's exports.
  chainClient = (chainAgent as unknown as { client: ClawChainClient }).client ?? null;

  // Start chain event listener
  const rpcUrl = config.rpcUrl || "http://localhost:26657";
  eventListener = new ChainEventListener(rpcUrl, {
    onNewCommitment: (commitment, leafIndex) => {
      log.info(`New commitment detected: ${commitment.slice(0, 16)}... (leaf ${leafIndex})`);
    },
    onAgentRegistered: (address, name) => {
      log.info(`New agent registered: ${name} (${address})`);
    },
    onError: (err) => {
      log.warn(`Chain event listener error: ${err.message}`);
    },
  });
  eventListener.start();
  log.info("Chain event listener started");

  return {
    address: identity.address,
    registered: identity.registered,
  };
}

export function shutdownBlockchain(): void {
  if (eventListener) {
    eventListener.stop();
    eventListener = null;
  }
  if (chainAgent) {
    void chainAgent.shutdown();
    chainAgent = null;
    chainClient = null;
  }
}

export function getBlockchainAgent(): ClawChainAgent | null {
  return chainAgent;
}

export function getBlockchainAddress(): string | null {
  return chainAgent?.getAddress() ?? null;
}

export function getBlockchainShieldedBalance(): string {
  return chainAgent?.getShieldedBalance().toString() ?? "0";
}

/**
 * Agent auto-registration on ClawChain.
 *
 * On gateway startup:
 *   1. Read agent mnemonic from config (blockchain.mnemonic)
 *   2. Initialize the ClawChainAgent (derives keypair and bech32 address)
 *   3. Check if already registered on-chain
 *   4. If not, auto-register via MsgRegisterAgent
 *   5. Return the initialized agent
 */

import { ClawChainAgent } from "@clawchain/sdk";
import type { BlockchainConfig } from "../../../src/config/types.blockchain.js";

export type AgentIdentityResult = {
  agent: ClawChainAgent;
  address: string;
  registered: boolean;
  autoRegistered: boolean;
};

export async function initializeAgentIdentity(
  config: BlockchainConfig,
  log: { info: (msg: string) => void; warn: (msg: string) => void; error: (msg: string) => void },
): Promise<AgentIdentityResult | null> {
  if (!config.mnemonic) {
    log.warn("blockchain.mnemonic not configured — skipping agent identity setup");
    return null;
  }

  const agent = new ClawChainAgent({
    name: "openclaw-agent",
    mnemonic: config.mnemonic,
    rpcUrl: config.rpcUrl || "http://localhost:26657",
    prefix: config.prefix || "cosmos",
    proofBinaryPath: config.proofBinaryPath || "clawproof",
  });

  try {
    await agent.initialize();
  } catch (err) {
    log.error(`Failed to initialize blockchain agent: ${String(err)}`);
    return null;
  }

  const address = agent.getAddress();
  log.info(`Blockchain agent address: ${address}`);

  let registered = false;
  let autoRegistered = false;

  try {
    registered = await agent.isRegistered();
  } catch {
    log.warn("Could not check agent registration status (chain may be unreachable)");
  }

  if (registered) {
    log.info("Agent is already registered on-chain");
  } else if (config.autoRegister !== false) {
    try {
      log.info("Auto-registering agent on-chain...");
      const result = await agent.register();
      if (result.code === 0) {
        registered = true;
        autoRegistered = true;
        log.info(`Agent registered on-chain (tx: ${result.transactionHash})`);
      } else {
        log.warn(`Agent registration tx failed with code ${result.code}`);
      }
    } catch (err) {
      log.warn(`Auto-registration failed: ${String(err)} (will retry later)`);
    }
  }

  return { agent, address, registered, autoRegistered };
}

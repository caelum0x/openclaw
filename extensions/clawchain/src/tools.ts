/**
 * ClawChain blockchain tools for OpenClaw agents.
 *
 * Each tool follows OpenClaw's AnyAgentTool pattern:
 *   - Query tools (safe) are auto-approved.
 *   - Transaction tools require user approval.
 */

import type { ClawChainClient, ClawChainAgent } from "@clawchain/sdk";

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

function jsonResult(data: unknown) {
  return { type: "json" as const, data };
}

function errorResult(message: string) {
  return { type: "json" as const, data: { error: message } };
}

function readStringParam(params: unknown, name: string, required = true): string {
  const obj = params as Record<string, unknown> | null;
  const value = obj?.[name];
  if (typeof value === "string" && value.trim().length > 0) {
    return value.trim();
  }
  if (required) {
    throw new Error(`Missing required parameter: ${name}`);
  }
  return "";
}

function readNumberParam(params: unknown, name: string): number | undefined {
  const obj = params as Record<string, unknown> | null;
  const value = obj?.[name];
  if (typeof value === "number") {
    return value;
  }
  if (typeof value === "string" && value.trim().length > 0) {
    const parsed = Number(value.trim());
    if (!Number.isNaN(parsed)) {
      return parsed;
    }
  }
  return undefined;
}

// ---------------------------------------------------------------------------
// Tool definitions
// ---------------------------------------------------------------------------

export type ClawChainToolDeps = {
  getClient: () => ClawChainClient | null;
  getAgent: () => ClawChainAgent | null;
};

export function createClawchainStatusTool(deps: ClawChainToolDeps) {
  return {
    name: "clawchain_status",
    description:
      "Get the current ClawChain blockchain status including block height, sync status, and network info.",
    inputSchema: {
      type: "object" as const,
      properties: {},
    },
    async execute() {
      const client = deps.getClient();
      if (!client) {
        return errorResult("Blockchain client not initialized. Is blockchain.enabled set to true?");
      }
      try {
        const status = await client.getStatus();
        return jsonResult(status);
      } catch (err) {
        return errorResult(`Failed to get chain status: ${String(err)}`);
      }
    },
  };
}

export function createClawchainBalanceTool(deps: ClawChainToolDeps) {
  return {
    name: "clawchain_balance",
    description:
      "Check the transparent (on-chain) balance of a ClawChain address. Returns balance in uclaw.",
    inputSchema: {
      type: "object" as const,
      properties: {
        address: {
          type: "string",
          description: "Bech32 address to check. Defaults to the agent's own address.",
        },
        denom: {
          type: "string",
          description: 'Token denomination. Defaults to "uclaw".',
        },
      },
    },
    async execute(params: unknown) {
      const agent = deps.getAgent();
      if (!agent) {
        return errorResult("Blockchain agent not initialized.");
      }
      try {
        const address = readStringParam(params, "address", false) || agent.getAddress();
        const denom = readStringParam(params, "denom", false) || "uclaw";
        const client = deps.getClient()!;
        const balance = await client.getBalance(address, denom);
        return jsonResult({ address, denom, balance });
      } catch (err) {
        return errorResult(`Failed to get balance: ${String(err)}`);
      }
    },
  };
}

export function createClawchainShieldedBalanceTool(deps: ClawChainToolDeps) {
  return {
    name: "clawchain_shielded_balance",
    description:
      "Check the agent's shielded (private) balance calculated from locally tracked commitments.",
    inputSchema: {
      type: "object" as const,
      properties: {},
    },
    async execute() {
      const agent = deps.getAgent();
      if (!agent) {
        return errorResult("Blockchain agent not initialized.");
      }
      try {
        const balance = agent.getShieldedBalance();
        return jsonResult({
          shieldedBalance: balance.toString(),
          unit: "uclaw",
          commitmentCount: agent.getCommitments().filter((c) => !c.spent).length,
        });
      } catch (err) {
        return errorResult(`Failed to get shielded balance: ${String(err)}`);
      }
    },
  };
}

export function createClawchainShieldTool(deps: ClawChainToolDeps) {
  return {
    name: "clawchain_shield",
    description:
      "Shield (deposit) tokens from transparent balance into the private shielded pool. " +
      "This creates a ZK commitment. Amount is in uclaw (1 CLAW = 1,000,000 uclaw).",
    inputSchema: {
      type: "object" as const,
      properties: {
        amount: {
          type: "number",
          description: "Amount to shield in uclaw.",
        },
        denom: {
          type: "string",
          description: 'Token denomination. Defaults to "uclaw".',
        },
      },
      required: ["amount"],
    },
    async execute(params: unknown) {
      const agent = deps.getAgent();
      if (!agent) {
        return errorResult("Blockchain agent not initialized.");
      }
      try {
        const amount = readNumberParam(params, "amount");
        if (!amount || amount <= 0) {
          return errorResult("Amount must be a positive number.");
        }
        const denom = readStringParam(params, "denom", false) || "uclaw";
        const result = await agent.shieldTokens(amount, denom);
        return jsonResult({
          success: result.code === 0,
          txHash: result.transactionHash,
          amount,
          denom,
          shieldedBalance: agent.getShieldedBalance().toString(),
        });
      } catch (err) {
        return errorResult(`Shield failed: ${String(err)}`);
      }
    },
  };
}

export function createClawchainUnshieldTool(deps: ClawChainToolDeps) {
  return {
    name: "clawchain_unshield",
    description:
      "Unshield (withdraw) tokens from the private shielded pool back to a transparent address. " +
      "Requires a valid unspent commitment with sufficient balance.",
    inputSchema: {
      type: "object" as const,
      properties: {
        amount: {
          type: "number",
          description: "Amount to unshield in uclaw.",
        },
        recipient: {
          type: "string",
          description: "Bech32 address to receive tokens. Defaults to agent's own address.",
        },
      },
      required: ["amount"],
    },
    async execute(params: unknown) {
      const agent = deps.getAgent();
      if (!agent) {
        return errorResult("Blockchain agent not initialized.");
      }
      try {
        const amount = readNumberParam(params, "amount");
        if (!amount || amount <= 0) {
          return errorResult("Amount must be a positive number.");
        }
        const recipient = readStringParam(params, "recipient", false) || undefined;
        const result = await agent.unshieldTokens(amount, recipient);
        return jsonResult({
          success: result.code === 0,
          txHash: result.transactionHash,
          amount,
          recipient: recipient || agent.getAddress(),
        });
      } catch (err) {
        return errorResult(`Unshield failed: ${String(err)}`);
      }
    },
  };
}

export function createClawchainPrivateTransferTool(deps: ClawChainToolDeps) {
  return {
    name: "clawchain_private_transfer",
    description:
      "Perform a private transfer of shielded tokens using a zero-knowledge proof. " +
      "The transfer is fully private - neither amount nor participants are revealed on-chain.",
    inputSchema: {
      type: "object" as const,
      properties: {
        recipientAddress: {
          type: "string",
          description: "Bech32 address of the recipient.",
        },
        amount: {
          type: "number",
          description: "Amount to transfer in uclaw.",
        },
      },
      required: ["recipientAddress", "amount"],
    },
    async execute(params: unknown) {
      // Private transfer between agents requires the recipient agent instance.
      // In a real deployment this would resolve the recipient from the agent registry.
      // For now, return an informative message about the limitation.
      const agent = deps.getAgent();
      if (!agent) {
        return errorResult("Blockchain agent not initialized.");
      }
      try {
        const recipientAddress = readStringParam(params, "recipientAddress");
        const amount = readNumberParam(params, "amount");
        if (!amount || amount <= 0) {
          return errorResult("Amount must be a positive number.");
        }
        return errorResult(
          `Private transfer of ${amount} uclaw to ${recipientAddress} requires ` +
          `the recipient's agent instance for commitment exchange. ` +
          `Use the agent registry to coordinate multi-agent private transfers.`,
        );
      } catch (err) {
        return errorResult(`Private transfer failed: ${String(err)}`);
      }
    },
  };
}

export function createClawchainRegisterTool(deps: ClawChainToolDeps) {
  return {
    name: "clawchain_register",
    description: "Register this AI agent on the ClawChain blockchain agent registry.",
    inputSchema: {
      type: "object" as const,
      properties: {},
    },
    async execute() {
      const agent = deps.getAgent();
      if (!agent) {
        return errorResult("Blockchain agent not initialized.");
      }
      try {
        const alreadyRegistered = await agent.isRegistered();
        if (alreadyRegistered) {
          return jsonResult({
            success: true,
            alreadyRegistered: true,
            address: agent.getAddress(),
            message: "Agent is already registered on-chain.",
          });
        }
        const result = await agent.register();
        return jsonResult({
          success: result.code === 0,
          txHash: result.transactionHash,
          address: agent.getAddress(),
        });
      } catch (err) {
        return errorResult(`Registration failed: ${String(err)}`);
      }
    },
  };
}

export function createClawchainMerkleRootTool(deps: ClawChainToolDeps) {
  return {
    name: "clawchain_merkle_root",
    description: "Get the current Merkle tree root of the shielded commitment pool.",
    inputSchema: {
      type: "object" as const,
      properties: {},
    },
    async execute() {
      const client = deps.getClient();
      if (!client) {
        return errorResult("Blockchain client not initialized.");
      }
      try {
        const root = await client.getMerkleRoot();
        return jsonResult({ merkleRoot: root });
      } catch (err) {
        return errorResult(`Failed to get Merkle root: ${String(err)}`);
      }
    },
  };
}

export function createClawchainAgentInfoTool(deps: ClawChainToolDeps) {
  return {
    name: "clawchain_agent_info",
    description: "Query agent registration info from the on-chain agent registry.",
    inputSchema: {
      type: "object" as const,
      properties: {
        address: {
          type: "string",
          description: "Bech32 address of the agent to query. Defaults to this agent's address.",
        },
      },
    },
    async execute(params: unknown) {
      const client = deps.getClient();
      const agent = deps.getAgent();
      if (!client) {
        return errorResult("Blockchain client not initialized.");
      }
      try {
        const address = readStringParam(params, "address", false) || agent?.getAddress();
        if (!address) {
          return errorResult("No address provided and agent not initialized.");
        }
        const info = await client.getAgent(address);
        return jsonResult(info);
      } catch (err) {
        return errorResult(`Failed to get agent info: ${String(err)}`);
      }
    },
  };
}

// ---------------------------------------------------------------------------
// Export all tool creators
// ---------------------------------------------------------------------------

export function createAllTools(deps: ClawChainToolDeps) {
  return [
    createClawchainStatusTool(deps),
    createClawchainBalanceTool(deps),
    createClawchainShieldedBalanceTool(deps),
    createClawchainShieldTool(deps),
    createClawchainUnshieldTool(deps),
    createClawchainPrivateTransferTool(deps),
    createClawchainRegisterTool(deps),
    createClawchainMerkleRootTool(deps),
    createClawchainAgentInfoTool(deps),
  ];
}

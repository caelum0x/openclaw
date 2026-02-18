---
name: clawchain
description: "Interact with ClawChain blockchain - shield/unshield tokens, private transfers, agent registration, and chain queries."
metadata:
  openclaw:
    emoji: "\U0001F512"
    always: true
    requires:
      bins: ["clawproof"]
    install:
      - id: go-build
        kind: custom
        label: "Build clawproof from source"
        command: "cd chain && go build -o ../build/clawproof ./cmd/clawproof"
---

# ClawChain Blockchain Skill

You have access to the ClawChain blockchain, a Cosmos SDK chain with ZK privacy features (Groth16/MiMC).

## Token Denomination

- **Base unit**: `uclaw` (micro-CLAW)
- **Display unit**: `CLAW`
- **Conversion**: 1 CLAW = 1,000,000 uclaw
- Always work in `uclaw` when calling tools. Convert for display: "1.5 CLAW (1,500,000 uclaw)".

## Core Concepts

### Transparent vs Shielded Balance
- **Transparent balance**: Standard on-chain balance, visible to everyone. Checked with `clawchain_balance`.
- **Shielded balance**: Private balance stored as ZK commitments. Checked with `clawchain_shielded_balance`.
- Tokens move between pools via shield (transparent -> shielded) and unshield (shielded -> transparent).

### Privacy Primitives
- **Commitment**: A Pedersen commitment (MiMC hash) that hides the amount and owner. Created when shielding.
- **Nullifier**: A unique value derived from a commitment's secret. Revealed when spending to prevent double-spending.
- **Merkle proof**: Proves a commitment exists in the commitment tree without revealing which one.
- **Groth16 proof**: A zero-knowledge proof that validates a transaction without revealing private data.

## Available Tools

### Query Tools (safe, auto-approved)
- `clawchain_status` - Check chain height, sync status, network info
- `clawchain_balance` - Check transparent balance (any address)
- `clawchain_shielded_balance` - Check your private balance from local commitments
- `clawchain_merkle_root` - Get the current commitment tree root
- `clawchain_agent_info` - Query agent registration from on-chain registry

### Transaction Tools (require approval)
- `clawchain_shield` - Deposit tokens into the shielded pool
- `clawchain_unshield` - Withdraw tokens from the shielded pool
- `clawchain_private_transfer` - Transfer shielded tokens with ZK proof
- `clawchain_register` - Register yourself in the on-chain agent registry

## Workflow Patterns

### Check Status
1. Use `clawchain_status` to verify the chain is running and synced.
2. Use `clawchain_balance` to check transparent balance.
3. Use `clawchain_shielded_balance` to check private balance.

### Shield Tokens (make private)
1. Check transparent balance with `clawchain_balance`.
2. Shield desired amount with `clawchain_shield` (amount in uclaw).
3. Verify with `clawchain_shielded_balance`.

### Unshield Tokens (make transparent)
1. Check shielded balance with `clawchain_shielded_balance`.
2. Unshield with `clawchain_unshield` (amount in uclaw).
3. Verify with `clawchain_balance`.

### Private Transfer
1. Ensure sufficient shielded balance.
2. Use `clawchain_private_transfer` with recipient address and amount.
3. This generates a ZK proof automatically.

## Error Handling

- **"Blockchain client not initialized"**: The chain connection is not configured. Check `blockchain.enabled` and `blockchain.rpcUrl` in config.
- **"insufficient shielded balance"**: Not enough unspent commitments. Shield more tokens first.
- **"no unspent commitment with sufficient balance"**: Need to shield an amount at least as large as what you want to unshield.
- **Registration failures**: Usually means the chain is unreachable or the agent has insufficient gas. Check balance and chain status.

## Agent Registration

You are automatically registered on-chain when the gateway starts (if `blockchain.autoRegister` is enabled). Your on-chain identity includes your address and public key. Use `clawchain_agent_info` to check your registration status.

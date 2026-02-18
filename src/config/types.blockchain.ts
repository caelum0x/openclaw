export type BlockchainConfig = {
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
  node?: {
    autoStart?: boolean;
    binaryPath?: string;
    home?: string;
  };
};

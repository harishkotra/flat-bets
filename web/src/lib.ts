import { FLATBETS_ABI, WIF_ABI } from "./abi";
import {
  createPublicClient,
  createWalletClient,
  custom,
  defineChain,
  http,
  type Address,
} from "viem";

/// Production points at Robinhood Chain mainnet; a build can be pointed at a
/// local fork with VITE_CHAIN_ID / VITE_RPC for demo and integration runs.
export const CHAIN_ID = Number(import.meta.env.VITE_CHAIN_ID ?? 4663);
const RPC_URL = (import.meta.env.VITE_RPC as string) ?? "https://rpc.mainnet.chain.robinhood.com/";
const EXPLORER = (import.meta.env.VITE_EXPLORER as string) ?? "https://robinhoodchain.blockscout.com";

export const rhChain = defineChain({
  id: CHAIN_ID,
  name: "Robinhood Chain",
  nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
  rpcUrls: { default: { http: [RPC_URL] } },
  blockExplorers: { default: { name: "Blockscout", url: EXPLORER } },
});

export const WIF: Address = "0x5173b8eA6923c2d40267890D45C46a3480954773";
export const FLATBETS = (import.meta.env.VITE_FLATBETS_ADDRESS ?? "") as Address;
export const CONFIGURED = FLATBETS.length === 42;

export const publicClient = createPublicClient({
  chain: rhChain,
  transport: http(rhChain.rpcUrls.default.http[0], { batch: true }),
});

export type Market = {
  id: number;
  creator: Address;
  resolver: Address;
  closeTime: number;
  resolveTime: number;
  kind: number; // 0 manual, 1 feed
  outcome: number; // 0 open, 1 yes, 2 no, 3 void
  lte: boolean;
  feed: Address;
  feedDecimals: number;
  threshold: bigint;
  observedAnswer: bigint;
  observedAt: number;
  yesPool: bigint;
  noPool: bigint;
  burned: bigint;
  bettors: bigint;
  question: string;
  rule: string;
};

export type Position = { yes: bigint; no: bigint; claimed: boolean; claimable: bigint };

export function toMarket(id: number, r: any): Market {
  return {
    id,
    creator: r.creator,
    resolver: r.resolver,
    closeTime: Number(r.closeTime),
    resolveTime: Number(r.resolveTime),
    kind: Number(r.kind),
    outcome: Number(r.outcome),
    lte: Boolean(r.lte),
    feed: r.feed,
    feedDecimals: Number(r.feedDecimals),
    threshold: r.threshold,
    observedAnswer: r.observedAnswer,
    observedAt: Number(r.observedAt),
    yesPool: r.yesPool,
    noPool: r.noPool,
    burned: r.burned,
    bettors: r.bettors,
    question: r.question,
    rule: r.rule,
  };
}

export const fmtWif = (v: bigint, digits = 0): string => {
  const n = Number(v) / 1e18;
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 10_000) return `${(n / 1000).toFixed(1)}k`;
  return n.toLocaleString("en-US", { maximumFractionDigits: digits });
};

export const fmtFull = (v: bigint, digits = 2): string =>
  (Number(v) / 1e18).toLocaleString("en-US", { maximumFractionDigits: digits });

export const fmtPrice = (v: bigint, decimals: number): string => {
  const n = Number(v) / 10 ** decimals;
  return n.toLocaleString("en-US", { maximumFractionDigits: n < 10 ? 4 : 2 });
};

export async function connectWallet(): Promise<Address> {
  const eth = (window as any).ethereum;
  if (!eth) throw new Error("No wallet found. Install MetaMask or a browser wallet.");
  const [addr] = (await eth.request({ method: "eth_requestAccounts" })) as Address[];
  try {
    await eth.request({ method: "wallet_switchEthereumChain", params: [{ chainId: "0x" + CHAIN_ID.toString(16) }] });
  } catch (e: any) {
    if (e?.code === 4902) {
      await eth.request({
        method: "wallet_addEthereumChain",
        params: [
          {
            chainId: "0x" + CHAIN_ID.toString(16),
            chainName: "Robinhood Chain",
            nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
            rpcUrls: [RPC_URL],
            blockExplorerUrls: [EXPLORER],
          },
        ],
      });
    }
  }
  return addr;
}

export function walletClient(account: Address) {
  const eth = (window as any).ethereum;
  return createWalletClient({ account, chain: rhChain, transport: custom(eth) });
}

export { FLATBETS_ABI, WIF_ABI };

export const shortAddr = (a: string) => `${a.slice(0, 6)}…${a.slice(-4)}`;

export const explorerTx = (hash: string) => `${EXPLORER}/tx/${hash}`;
export const explorerAddr = (a: string) => `${EXPLORER}/address/${a}`;

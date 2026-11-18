// src/lib/onchain.ts
//
// Plain on-chain transfers of the watched token to/from the watched addresses.
// Monerium orders only cover SEPA in/out, which show up on-chain as a mint
// (from 0x0) or a burn (to 0x0). A wallet-to-wallet transfer has no order, so
// the Monerium poll never sees it. This module fills that gap and deliberately
// skips mints and burns, which the Monerium poll already posts with the bank
// counterparty's name and memo.

/** keccak256("Transfer(address,address,uint256)") */
export const TRANSFER_TOPIC =
  "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef";
export const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";

export type Log = {
  address: string;
  topics: string[];
  data: string;
  blockNumber: string;
  transactionHash: string;
  logIndex: string;
};

export type Transfer = {
  txHash: string;
  blockNumber: number;
  logIndex: number;
  from: string;
  to: string;
  value: bigint;
  /** "in" when a watched address receives it, "out" when one sends it. */
  direction: "in" | "out";
};

const topicToAddress = (topic: string) => `0x${topic.slice(-40)}`.toLowerCase();
const addressToTopic = (address: string) =>
  `0x${address.toLowerCase().replace(/^0x/, "").padStart(64, "0")}`;

/**
 * Transfers worth posting: the watched token, touching a watched address, not a
 * mint/burn, in a tx not already in the channel. Oldest first; a transfer that
 * matches both queries (watched → watched) appears once.
 */
export function selectTransfersToPost(
  logs: Log[],
  watched: Set<string>,
  posted: Set<string>,
): Transfer[] {
  const seen = new Set<string>();
  const out: Transfer[] = [];
  for (const log of logs) {
    if (log.topics[0]?.toLowerCase() !== TRANSFER_TOPIC || log.topics.length < 3) continue;
    const key = `${log.transactionHash.toLowerCase()}:${log.logIndex}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const from = topicToAddress(log.topics[1]);
    const to = topicToAddress(log.topics[2]);
    if (from === ZERO_ADDRESS || to === ZERO_ADDRESS) continue; // Monerium issue/redeem
    if (!watched.has(from) && !watched.has(to)) continue;
    if (posted.has(log.transactionHash.toLowerCase())) continue;
    out.push({
      txHash: log.transactionHash,
      blockNumber: Number(BigInt(log.blockNumber)),
      logIndex: Number(BigInt(log.logIndex)),
      from,
      to,
      value: BigInt(log.data === "0x" ? 0 : log.data.slice(0, 66)),
      direction: watched.has(from) ? "out" : "in",
    });
  }
  return out.sort((a, b) => a.blockNumber - b.blockNumber || a.logIndex - b.logIndex);
}

/** Token units → "25.41" (rounded to cents, no trailing ".00"), like Monerium's amounts. */
export function formatUnits(value: bigint, decimals: number): string {
  let cents: bigint;
  if (decimals >= 2) {
    const divisor = 10n ** BigInt(decimals - 2);
    cents = (value + divisor / 2n) / divisor; // round half up
  } else {
    cents = value * 10n ** BigInt(2 - decimals);
  }
  const whole = cents / 100n;
  const frac = cents % 100n;
  return frac === 0n ? `${whole}` : `${whole}.${frac.toString().padStart(2, "0").replace(/0$/, "")}`;
}

export const shortAddress = (address: string) => `${address.slice(0, 6)}…${address.slice(-4)}`;

async function rpc<T>(urls: string[], method: string, params: unknown[]): Promise<T> {
  let lastError: unknown;
  for (const url of urls) {
    try {
      const response = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
      });
      const data = await response.json();
      if (data.error) throw new Error(`${method}: ${JSON.stringify(data.error)}`);
      return data.result as T;
    } catch (error) {
      lastError = error;
      console.warn(`onchain: ${url} failed for ${method}:`, (error as Error).message ?? error);
    }
  }
  throw lastError ?? new Error(`onchain: no RPC URL for ${method}`);
}

export async function getBlockNumber(urls: string[]): Promise<number> {
  return Number(BigInt(await rpc<string>(urls, "eth_blockNumber", [])));
}

/** Transfer logs of `token` into or out of any of `addresses` in [fromBlock, toBlock]. */
export async function getTransferLogs(
  urls: string[],
  token: string,
  addresses: string[],
  fromBlock: number,
  toBlock: number,
): Promise<Log[]> {
  const watchedTopics = addresses.map(addressToTopic);
  const range = { address: token, fromBlock: `0x${fromBlock.toString(16)}`, toBlock: `0x${toBlock.toString(16)}` };
  const [incoming, outgoing] = await Promise.all([
    rpc<Log[]>(urls, "eth_getLogs", [{ ...range, topics: [TRANSFER_TOPIC, null, watchedTopics] }]),
    rpc<Log[]>(urls, "eth_getLogs", [{ ...range, topics: [TRANSFER_TOPIC, watchedTopics] }]),
  ]);
  return [...incoming, ...outgoing];
}

export default { getBlockNumber, getTransferLogs };

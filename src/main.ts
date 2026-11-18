import monerium from "./lib/monerium.ts";
import discord from "./lib/discord.ts";
import onchain, { formatUnits, selectTransfersToPost, shortAddress } from "./lib/onchain.ts";
const chains = JSON.parse(Deno.readTextFileSync("./chains.json"));

const INTERVAL = parseInt(Deno.env.get("INTERVAL") || "600000"); // 10 minutes
const DISCORD_CHANNEL_ID = Deno.env.get("DISCORD_CHANNEL_ID");
const PORT = Number(Deno.env.get("PORT") ?? 3000);

// Optional: also post plain on-chain transfers (no Monerium order) of WATCH_TOKEN
// to/from WATCH_ADDRESSES. Disabled when WATCH_ADDRESSES is empty.
// Read on each poll (not at import) so tests can set them.
const watchConfig = () => ({
  addresses: (Deno.env.get("WATCH_ADDRESSES") ?? "")
    .split(",").map((a) => a.trim().toLowerCase()).filter(Boolean),
  chain: Deno.env.get("WATCH_CHAIN") || "gnosis",
  token: Deno.env.get("WATCH_TOKEN") || "0x420CA0f9B9b604cE0fd9C18EF134C705e5Fa3430", // EURe on Gnosis
  decimals: parseInt(Deno.env.get("WATCH_TOKEN_DECIMALS") || "18"),
  currency: Deno.env.get("WATCH_CURRENCY") || "EUR",
  rpcUrl: Deno.env.get("WATCH_RPC_URL"),
  lookbackBlocks: parseInt(Deno.env.get("WATCH_LOOKBACK_BLOCKS") || "17280"), // ~24h of 5s Gnosis blocks
});
const CONFIRMATIONS = 2; // stay a couple of blocks behind the head
const LOG_CHUNK_BLOCKS = 10_000; // public RPCs cap eth_getLogs ranges

const startTimestamp = new Date();
let txsProcessed = 0;

const logtime = () => {
  return new Date().toISOString().replace("T", " ").substring(0, 19);
};

/** Lower-cased tx hashes already in the channel (seeded from its recent messages at startup). */
const postedTxHashes = new Set<string>();
const TX_LINK_RE = /<https?:\/\/[^\s>]*\/tx\/(0x[a-fA-F0-9]+)>/g;

const currencySymbols = {
  USD: "$",
  EUR: "€",
  GBP: "£",
  CAD: "$",
  AUD: "$",
};

function formatAmount(amount: string, currency: string): string {
  return `${
    currencySymbols[currency.toUpperCase() as keyof typeof currencySymbols]
  }${amount}`;
}

function processedNote(processedAt: Date, now: Date): string {
  if (now.getTime() - processedAt.getTime() < 60 * 60 * 1000) return "";
  const when = processedAt.toLocaleString("en-GB", { timeZone: "Europe/Brussels", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
  return ` · processed ${when}`;
}

const fetchOrders = async () => {
  const now = new Date();
  const orders = monerium.selectOrdersToPost(await monerium.getOrders(), postedTxHashes, now);
  console.log(logtime(), `Processing ${orders.length} new orders (${postedTxHashes.size} already posted)`);
  for (const order of orders) {
    const txHash = order.meta.txHashes[0];
    const explorer = chains[order.chain]?.explorer_url;
    if (!explorer) console.warn(logtime(), `Unknown chain "${order.chain}" (not in chains.json), linking to blockscan.com`);
    const link = `${explorer ?? "https://blockscan.com"}/tx/${txHash}`;
    const note = processedNote(new Date(order.meta.processedAt), now);
    let msg = "";
    if (order.kind === "issue") {
      msg = `Received ${formatAmount(order.amount, order.currency)} from ${order.counterpart.details.name} (${order.memo})${note} [[View Transaction](<${link}>)]`;
    } else if (order.kind === "redeem") {
      msg = `Sent ${formatAmount(order.amount, order.currency)} to ${order.counterpart.details.name} (${order.memo})${note} [[View Transaction](<${link}>)]`;
    } else {
      console.warn(logtime(), "Skipping order of unknown kind", order.kind, order.id);
      continue;
    }
    await discord.postToDiscordChannel(msg);
    postedTxHashes.add(txHash.toLowerCase());
    txsProcessed++;
  }
};

/** Next block to scan for on-chain transfers; starts WATCH_LOOKBACK_BLOCKS back. */
let nextBlock: number | undefined;

const fetchTransfers = async () => {
  const cfg = watchConfig();
  if (cfg.addresses.length === 0) return;
  const chain = chains[cfg.chain];
  const rpcUrls: string[] = cfg.rpcUrl ? [cfg.rpcUrl] : [chain?.rpc ?? []].flat();
  if (rpcUrls.length === 0) throw new Error(`No RPC for chain "${cfg.chain}" (set WATCH_RPC_URL)`);
  const explorer = chain?.explorer_url ?? "https://blockscan.com";
  const watched = new Set(cfg.addresses);

  const head = (await onchain.getBlockNumber(rpcUrls)) - CONFIRMATIONS;
  nextBlock ??= Math.max(head - cfg.lookbackBlocks, 0);
  let count = 0;
  while (nextBlock <= head) {
    const toBlock = Math.min(nextBlock + LOG_CHUNK_BLOCKS - 1, head);
    const logs = await onchain.getTransferLogs(rpcUrls, cfg.token, cfg.addresses, nextBlock, toBlock);
    const transfers = selectTransfersToPost(logs, watched, postedTxHashes);
    for (const [i, t] of transfers.entries()) {
      const amount = formatAmount(formatUnits(t.value, cfg.decimals), cfg.currency);
      const link = `${explorer}/tx/${t.txHash}`;
      const msg = t.direction === "in"
        ? `Received ${amount} from ${shortAddress(t.from)} [[View Transaction](<${link}>)]`
        : `Sent ${amount} to ${shortAddress(t.to)} [[View Transaction](<${link}>)]`;
      await discord.postToDiscordChannel(msg);
      txsProcessed++;
      count++;
      // A tx can move several watched transfers (sorted, so they are adjacent):
      // mark it posted after its last one, so a failed post never repeats earlier ones.
      if (transfers[i + 1]?.txHash !== t.txHash) postedTxHashes.add(t.txHash.toLowerCase());
    }
    nextBlock = toBlock + 1;
  }
  console.log(logtime(), `Posted ${count} on-chain transfers (scanned up to block ${head})`);
};

// A failed poll (Monerium or Discord outage, unexpected payload) must never kill the process.
const safeFetchOrders = async () => {
  try {
    await fetchOrders();
  } catch (error) {
    console.error(logtime(), "Error while fetching orders:", error);
  }
};

const safeFetchTransfers = async () => {
  try {
    await fetchTransfers();
  } catch (error) {
    console.error(logtime(), "Error while fetching on-chain transfers:", error);
  }
};

// Monerium first: a mint/burn is never posted by the on-chain path anyway, but
// this keeps a poll's messages in a stable order.
const poll = async () => {
  await safeFetchOrders();
  await safeFetchTransfers();
};

/** Remember every tx already linked in the channel's recent messages. */
export function rememberPostedFromMessages(contents: string[]): number {
  for (const content of contents) {
    for (const m of content.matchAll(TX_LINK_RE)) postedTxHashes.add(m[1].toLowerCase());
  }
  return postedTxHashes.size;
}

async function main() {
  console.log(
    logtime(),
    "Starting monerium bot with interval",
    INTERVAL / 1000 / 60,
    "minutes"
  );

  if (!DISCORD_CHANNEL_ID) {
    throw new Error("DISCORD_CHANNEL_ID is not set");
  }

  const lastMessages = await discord.fetchLatestMessagesFromChannel(DISCORD_CHANNEL_ID, undefined, 100);
  const known = rememberPostedFromMessages((lastMessages ?? []).map((m: { content?: string }) => m?.content ?? ""));
  console.log(logtime(), `Found ${known} tx links in the channel's last 100 messages`);
  const cfg = watchConfig();
  if (cfg.addresses.length > 0) {
    console.log(logtime(), `Watching ${cfg.token} on ${cfg.chain} for ${cfg.addresses.length} address(es)`);
  }
  await poll();
  setInterval(poll, INTERVAL);
}

export const handler = (req: Request) => {
  const url = new URL(req.url);

  if (url.pathname === "/" && req.method === "GET") {
    return new Response(
      `<html>
        <body>
          Server listening on port ${PORT} since ${new Date(
        startTimestamp
      ).toISOString()}<br />
          Connected to Discord Channel Id: ${DISCORD_CHANNEL_ID}<br />
          Number of transactions processed: ${txsProcessed}
        </body>
      </html>`,
      {
        status: 200,
        headers: {
          "Content-Type": "text/html",
        },
      }
    );
  }
  return new Response("Not Found", { status: 404 });
};

if (Deno.env.get("ENV") !== "test") {
  main().catch((error) => {
    console.error(logtime(), "Fatal error during startup:", error);
    Deno.exit(1);
  });

  Deno.serve({ port: PORT }, handler);

  console.log(
    `Server listening on port ${PORT} since ${new Date(
      startTimestamp
    ).toISOString()} for health check`
  );
}

/** Test hook: forget the scan position so the next poll starts from the lookback again. */
export const resetTransferScan = () => { nextBlock = undefined; };

export { fetchOrders, fetchTransfers, postedTxHashes };

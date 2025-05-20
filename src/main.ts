import { getNewOrders } from "./lib/monerium.ts";
import {
  fetchLatestMessagesFromChannel,
  postToDiscordChannel,
} from "./lib/discord.ts";
const chains = JSON.parse(Deno.readTextFileSync("./chains.json"));

const INTERVAL = parseInt(Deno.env.get("INTERVAL") || "600000"); // 10 minutes
const DISCORD_CHANNEL_ID = Deno.env.get("DISCORD_CHANNEL_ID");

const logtime = () => {
  return new Date().toISOString().replace("T", " ").substring(0, 19);
};

let lastTxHash: string | undefined;

const fetchOrders = async () => {
  const orders = await getNewOrders(lastTxHash);
  console.log(logtime(), `Processing ${orders.length} new orders`);
  if (orders.length === 0) {
    return;
  }
  for (const order of orders) {
    const processedAt = new Date(order.meta.processedAt);
    const now = new Date();
    const diff = now.getTime() - processedAt.getTime();
    const diffHours = diff / (1000 * 60 * 60);
    if (diffHours > 24) {
      return;
    }
    const chainExplorer = chains[order.chain].explorer_url;
    let msg = "";
    if (order.kind === "issue") {
      msg = `Received ${order.amount} ${order.currency} from ${order.counterpart.details.name} (${order.memo}) [[View Transaction](<${chainExplorer}/tx/${order.meta.txHashes[0]}>)]`;
    } else if (order.kind === "redeem") {
      msg = `Sent ${order.amount} ${order.currency} to ${order.counterpart.details.name} (${order.memo}) [[View Transaction](<${chainExplorer}/tx/${order.meta.txHashes[0]}>)]`;
    }
    console.log(msg);
    await postToDiscordChannel(msg);
  }
  lastTxHash = orders[0].meta.txHashes[0];
};

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

  const lastMessages = await fetchLatestMessagesFromChannel(DISCORD_CHANNEL_ID);
  if (!lastMessages) {
    throw new Error("No messages found in channel");
  }
  for (const message of lastMessages) {
    const txHash = message?.content.match(
      /<https?:\/\/.*\/tx\/(0x[a-zA-Z0-9]+)>/
    )?.[1];
    if (txHash) {
      lastTxHash = txHash;
      break;
    }
  }
  console.log(logtime(), "Last tx hash", lastTxHash);
  fetchOrders();
  setInterval(() => {
    fetchOrders();
  }, INTERVAL);
}

main();

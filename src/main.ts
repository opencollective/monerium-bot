import { getNewOrders } from "./lib/monerium.ts";
import { postToDiscordChannel } from "./lib/discord.ts";
const chains = JSON.parse(Deno.readTextFileSync("./chains.json"));

const INTERVAL = 1000 * 60 * 10; // 10 minutes

const logtime = () => {
  return new Date().toISOString().split("T")[0];
};

const fetchOrders = async () => {
  const orders = await getNewOrders();
  console.log(logtime(), `Processing ${orders.length} new orders`);
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
};

function main() {
  console.log(
    logtime(),
    "Starting monerium bot with interval",
    INTERVAL / 1000 / 60,
    "minutes"
  );
  setInterval(() => {
    fetchOrders();
  }, INTERVAL);
}

main();

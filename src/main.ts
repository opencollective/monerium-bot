import monerium from "./lib/monerium.ts";
import discord from "./lib/discord.ts";
const chains = JSON.parse(Deno.readTextFileSync("./chains.json"));

const INTERVAL = parseInt(Deno.env.get("INTERVAL") || "600000"); // 10 minutes
const DISCORD_CHANNEL_ID = Deno.env.get("DISCORD_CHANNEL_ID");
const PORT = Number(Deno.env.get("PORT") ?? 3000);

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

// A failed poll (Monerium or Discord outage, unexpected payload) must never kill the process.
const safeFetchOrders = async () => {
  try {
    await fetchOrders();
  } catch (error) {
    console.error(logtime(), "Error while fetching orders:", error);
  }
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
  await safeFetchOrders();
  setInterval(safeFetchOrders, INTERVAL);
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

export { fetchOrders, postedTxHashes };

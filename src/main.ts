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

let lastTxHash: string | undefined;
const postedTxHashes: string[] = [];

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

const fetchOrders = async () => {
  const orders = await monerium.getNewOrders(lastTxHash);
  console.log(
    logtime(),
    `Processing ${orders.length} new orders since ${lastTxHash}`
  );
  if (orders.length === 0) {
    return;
  }
  orders.reverse();
  for (const order of orders) {
    const processedAt = new Date(order.meta.processedAt);
    const now = new Date();
    const diff = now.getTime() - processedAt.getTime();
    const diffHours = diff / (1000 * 60 * 60);
    if (diffHours > 24) {
      return;
    }
    if (postedTxHashes.includes(order.meta.txHashes[0])) {
      console.log(
        logtime(),
        "Skipping duplicate transaction",
        order.meta.txHashes[0]
      );
      continue;
    }
    const chainExplorer = chains[order.chain].explorer_url;
    let msg = "";
    if (order.kind === "issue") {
      msg = `Received ${formatAmount(order.amount, order.currency)} from ${
        order.counterpart.details.name
      } (${order.memo}) [[View Transaction](<${chainExplorer}/tx/${
        order.meta.txHashes[0]
      }>)]`;
    } else if (order.kind === "redeem") {
      msg = `Sent ${formatAmount(order.amount, order.currency)} to ${
        order.counterpart.details.name
      } (${order.memo}) [[View Transaction](<${chainExplorer}/tx/${
        order.meta.txHashes[0]
      }>)]`;
    }
    // console.log(msg);
    await discord.postToDiscordChannel(msg);
    postedTxHashes.push(order.meta.txHashes[0]);
    txsProcessed++;
  }
  console.log(logtime(), "Updating lastTxHash to", orders[0].meta.txHashes[0]);
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

  if (Deno.env.get("LAST_TX_HASH")) {
    lastTxHash = Deno.env.get("LAST_TX_HASH");
  } else {
    const lastMessages = await discord.fetchLatestMessagesFromChannel(
      DISCORD_CHANNEL_ID,
      undefined,
      100
    );
    if (lastMessages) {
      for (const message of lastMessages) {
        const txHash = message?.content.match(
          /<https?:\/\/.*\/tx\/(0x[a-zA-Z0-9]+)>/
        )?.[1];
        if (txHash) {
          postedTxHashes.push(txHash);
          lastTxHash = txHash;
        }
      }
    }
  }
  console.log(logtime(), "Last tx hash from last discord message:", lastTxHash);
  fetchOrders();
  setInterval(() => {
    fetchOrders();
  }, INTERVAL);
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
  main();

  Deno.serve({ port: PORT }, handler);

  console.log(
    `Server listening on port ${PORT} since ${new Date(
      startTimestamp
    ).toISOString()} for health check`
  );
}

export { fetchOrders };

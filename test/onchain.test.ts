import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { assertSpyCalls, stub } from "https://deno.land/std@0.224.0/testing/mock.ts";
import onchain, { formatUnits, type Log, selectTransfersToPost, TRANSFER_TOPIC } from "../src/lib/onchain.ts";
import discord from "../src/lib/discord.ts";
import * as mainModule from "../src/main.ts";

const SAVINGS = "0xb01ccce2d75d517ee520de31eae6afca735aadc1";
const CHECKING = "0xd578e7cd845e1ecd979b04784e77068d5ebd8716";
const SENDER = "0x2cff890f0378a11913b6129b2e97417a2c302680";
const ZERO = "0x0000000000000000000000000000000000000000";
const EURE = "0x420ca0f9b9b604ce0fd9c18ef134c705e5fa3430";

const topic = (a: string) => `0x${a.slice(2).padStart(64, "0")}`;
const word = (n: bigint) => `0x${n.toString(16).padStart(64, "0")}`;
function transferLog(o: { from: string; to: string; value: bigint; tx: string; block?: number; index?: number }): Log {
  return {
    address: EURE,
    topics: [TRANSFER_TOPIC, topic(o.from), topic(o.to)],
    data: word(o.value),
    blockNumber: `0x${(o.block ?? 100).toString(16)}`,
    transactionHash: o.tx,
    logIndex: `0x${(o.index ?? 0).toString(16)}`,
  };
}

// The real tx that was never posted: 25.408233355056574 EURe from an EOA into Savings.
const plainIn = transferLog({ from: SENDER, to: SAVINGS, value: 0x1609c2d9e2a60ecaan, tx: "0x7235e775", block: 49342677, index: 316 });

Deno.test("formatUnits rounds to cents and drops a zero fraction", () => {
  assertEquals(formatUnits(0x1609c2d9e2a60ecaan, 18), "25.41");
  assertEquals(formatUnits(242n * 10n ** 18n, 18), "242");
  assertEquals(formatUnits(104_940_000_000_000_000_000n, 18), "104.94");
  assertEquals(formatUnits(25_400_000_000_000_000_000n, 18), "25.4");
  assertEquals(formatUnits(1_005_000n, 6), "1.01");
});

Deno.test("plain transfers in and out are selected; mints, burns, strangers and posted txs are not", () => {
  const watched = new Set([SAVINGS, CHECKING]);
  const logs = [
    transferLog({ from: SAVINGS, to: SENDER, value: 5n * 10n ** 18n, tx: "0xout", block: 200 }),
    plainIn,
    transferLog({ from: ZERO, to: SAVINGS, value: 242n * 10n ** 18n, tx: "0xmint" }), // Monerium issue
    transferLog({ from: CHECKING, to: ZERO, value: 10n ** 18n, tx: "0xburn" }), // Monerium redeem
    transferLog({ from: SENDER, to: "0x1111111111111111111111111111111111111111", value: 1n, tx: "0xother" }),
    transferLog({ from: SENDER, to: SAVINGS, value: 1n, tx: "0xposted" }),
  ];
  const selected = selectTransfersToPost(logs, watched, new Set(["0xposted"]));
  assertEquals(selected.map((t) => [t.txHash, t.direction]), [["0xout", "out"], ["0x7235e775", "in"]]); // oldest block first
});

Deno.test("a watched → watched transfer is returned once even though both queries match it", () => {
  const internal = transferLog({ from: CHECKING, to: SAVINGS, value: 10n ** 18n, tx: "0xint" });
  const selected = selectTransfersToPost([internal, internal], new Set([SAVINGS, CHECKING]), new Set());
  assertEquals(selected.length, 1);
  assertEquals(selected[0].direction, "out");
});

Deno.test("fetchTransfers posts the plain transfer once and skips what Monerium already posts", async () => {
  Deno.env.set("WATCH_ADDRESSES", `${SAVINGS},${CHECKING}`);
  Deno.env.set("WATCH_RPC_URL", "http://rpc.invalid");
  mainModule.postedTxHashes.clear();
  mainModule.resetTransferScan();
  const mint = transferLog({ from: ZERO, to: SAVINGS, value: 242n * 10n ** 18n, tx: "0xmint", block: 49342600 });
  const blockNumber = stub(onchain, "getBlockNumber", () => Promise.resolve(49342700));
  const getLogs = stub(onchain, "getTransferLogs", () => Promise.resolve([mint, plainIn]));
  const post = stub(discord, "postToDiscordChannel", () => Promise.resolve());
  try {
    await mainModule.fetchTransfers();
    assertSpyCalls(post, 1);
    assertEquals(
      post.calls[0].args[0],
      "Received €25.41 from 0x2cff…2680 [[View Transaction](<https://gnosisscan.io/tx/0x7235e775>)]",
    );
    // first poll scans the 24h lookback (17280 blocks, head - 2 confirmations) in 10k-block chunks
    assertEquals(getLogs.calls.map((c) => [c.args[3], c.args[4]]), [[49325418, 49335417], [49335418, 49342698]]);
    // next poll resumes after the scanned range and does not repost
    await mainModule.fetchTransfers();
    assertSpyCalls(post, 1);
    assertSpyCalls(getLogs, 2); // head unchanged: nothing new to scan
  } finally {
    blockNumber.restore();
    getLogs.restore();
    post.restore();
    Deno.env.delete("WATCH_ADDRESSES");
    Deno.env.delete("WATCH_RPC_URL");
  }
});

Deno.test("fetchTransfers does nothing when WATCH_ADDRESSES is unset", async () => {
  mainModule.resetTransferScan();
  const blockNumber = stub(onchain, "getBlockNumber", () => Promise.resolve(1));
  try {
    await mainModule.fetchTransfers();
    assertSpyCalls(blockNumber, 0);
  } finally {
    blockNumber.restore();
  }
});

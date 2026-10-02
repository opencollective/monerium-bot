import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { assertSpyCalls, stub } from "https://deno.land/std@0.224.0/testing/mock.ts";
import monerium, { type MoneriumOrder, selectOrdersToPost } from "../src/lib/monerium.ts";
import discord from "../src/lib/discord.ts";
import * as mainModule from "../src/main.ts";

const iso = (s: string) => new Date(s).toISOString();
function order(o: { kind: string; amount: string; placed: string; processed: string; tx: string; name?: string }): MoneriumOrder {
  return {
    id: o.tx, profile: "p", address: "0xD578", state: "processed", kind: o.kind, amount: o.amount, currency: "EUR",
    chain: "gnosis", memo: "memo",
    counterpart: { identifier: { standard: "iban", iban: "BE00" }, details: { name: o.name ?? "Landlord" } },
    meta: { placedAt: iso(o.placed), processedAt: iso(o.processed), txHashes: [o.tx] },
  } as unknown as MoneriumOrder;
}

// The real sequence of 2026-10-01, in the order Monerium lists it (newest placed first).
const listed = [
  order({ kind: "issue", amount: "1803.75", placed: "2026-10-01T06:50:21Z", processed: "2026-10-01T06:50:29Z", tx: "0xdc49" }),
  order({ kind: "redeem", amount: "133.1", placed: "2026-10-01T06:43:06Z", processed: "2026-10-01T08:43:02Z", tx: "0xb3b9" }),
  order({ kind: "redeem", amount: "6546.76", placed: "2026-10-01T06:39:34Z", processed: "2026-10-01T08:43:01Z", tx: "0x015D" }),
  order({ kind: "redeem", amount: "100.91", placed: "2026-09-30T12:27:12Z", processed: "2026-09-30T12:27:31Z", tx: "0x5088" }),
];

Deno.test("an order processed late is still posted, even when listed below an already posted one", () => {
  const posted = new Set(["0x5088", "0xdc49"]); // what was in the channel after the 06:51 poll
  const toPost = selectOrdersToPost(listed, posted, new Date("2026-10-01T08:51:00Z"));
  assertEquals(toPost.map((o) => o.meta.txHashes[0]), ["0x015D", "0xb3b9"]); // oldest processing first
});

Deno.test("already posted (case-insensitive), too old, or not processed: not posted", () => {
  const pending = { ...listed[2], state: "pending" } as MoneriumOrder;
  const toPost = selectOrdersToPost([...listed, pending], new Set(["0x015d", "0xb3b9", "0xdc49"]), new Date("2026-10-05T12:00:00Z"));
  assertEquals(toPost.map((o) => o.meta.txHashes[0]), []); // 0x5088 is older than 96h by then
});

Deno.test("fetchOrders posts new orders once, noting when a payment was processed earlier", async () => {
  mainModule.postedTxHashes.clear();
  mainModule.rememberPostedFromMessages(["Sent €100.91 to X [[View Transaction](<https://gnosisscan.io/tx/0x5088>)]"]);
  const now = Date.now();
  const recent = [
    order({ kind: "redeem", amount: "6546.76", placed: new Date(now - 3 * 3600e3).toISOString(), processed: new Date(now - 2 * 3600e3).toISOString(), tx: "0xaaa", name: "Landlord" }),
    order({ kind: "issue", amount: "4", placed: new Date(now - 60e3).toISOString(), processed: new Date(now - 30e3).toISOString(), tx: "0xbbb", name: "Ana" }),
  ];
  const getOrders = stub(monerium, "getOrders", () => Promise.resolve(recent));
  const post = stub(discord, "postToDiscordChannel", () => Promise.resolve());
  try {
    await mainModule.fetchOrders();
    assertSpyCalls(post, 2);
    const first = post.calls[0].args[0] as string;
    assertEquals(first.startsWith("Sent €6546.76 to Landlord (memo) · processed "), true);
    assertEquals(first.endsWith("[[View Transaction](<https://gnosisscan.io/tx/0xaaa>)]"), true);
    assertEquals(post.calls[1].args[0], "Received €4 from Ana (memo) [[View Transaction](<https://gnosisscan.io/tx/0xbbb>)]");
    await mainModule.fetchOrders(); // nothing new the second time
    assertSpyCalls(post, 2);
  } finally {
    getOrders.restore();
    post.restore();
  }
});

import { assertEquals } from "https://deno.land/std/assert/mod.ts";

import {
  assertSpyCalls,
  spy,
  stub,
  returnsNext,
} from "https://deno.land/std@0.224.0/testing/mock.ts";
import monerium from "../src/lib/monerium.ts";
import discord from "../src/lib/discord.ts";

// Mock chains.json
const mockChains = {
  ethereum: { explorer_url: "https://etherscan.io" },
};

import * as mainModule from "../src/main.ts";

Deno.test("fetchOrders posts message for new issue order", async () => {
  // Arrange
  const order = {
    id: "order-id",
    profile: "profile-id",
    address: "0xabc",
    state: "processed",
    kind: "issue",
    amount: "100",
    currency: "EUR",
    chain: "ethereum",
    memo: "Test memo",
    counterpart: {
      identifier: { standard: "iban", iban: "DE1234567890" },
      details: { name: "Alice" },
    },
    meta: {
      placedAt: new Date().toISOString(),
      processedAt: new Date().toISOString(),
      txHashes: ["0x123"],
    },
  };
  const getNewOrdersStub = stub(monerium, "getNewOrders", async () => [order]);
  const postToDiscordChannelStub = stub(
    discord,
    "postToDiscordChannel",
    async () => {}
  );

  // Act
  console.log("Fetching orders");
  await mainModule["fetchOrders"]();

  // // Assert
  assertSpyCalls(postToDiscordChannelStub, 1);
  const msg = postToDiscordChannelStub.calls[0].args[0];
  assertEquals(
    msg,
    `Received €100 from Alice (Test memo) [[View Transaction](<https://etherscan.io/tx/0x123>)]`
  );

  postToDiscordChannelStub.restore();
  getNewOrdersStub.restore();
});

Deno.test("fetchOrders does not post for old orders", async () => {
  // Arrange
  const oldDate = new Date(Date.now() - 25 * 60 * 60 * 1000).toISOString();
  const order = {
    id: "order-id",
    profile: "profile-id",
    address: "0xabc",
    state: "processed",
    kind: "issue",
    amount: "100",
    currency: "EUR",
    chain: "ethereum",
    memo: "Old order",
    counterpart: {
      identifier: { standard: "iban", iban: "DE1234567890" },
      details: { name: "Bob" },
    },
    meta: {
      placedAt: oldDate,
      processedAt: oldDate,
      txHashes: ["0x456"],
    },
  };
  const getNewOrdersStub = stub(monerium, "getNewOrders", async () => [order]);
  const postStub = stub(discord, "postToDiscordChannel", async () => {});

  // Act;
  await mainModule["fetchOrders"]();

  // Assert;
  assertSpyCalls(postStub, 0);

  postStub.restore();
  getNewOrdersStub.restore();
});

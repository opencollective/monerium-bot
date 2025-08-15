// src/lib/discord.ts

// Import discord.js from npm
import {
  Client,
  GatewayIntentBits,
  TextChannel,
  Message,
} from "npm:discord.js";

// Get the bot token and channel ID from environment variables
const DISCORD_BOT_TOKEN = Deno.env.get("DISCORD_BOT_TOKEN");
const DISCORD_CHANNEL_ID = Deno.env.get("DISCORD_CHANNEL_ID");

if (!DISCORD_BOT_TOKEN || !DISCORD_CHANNEL_ID) {
  throw new Error(
    "DISCORD_BOT_TOKEN or DISCORD_CHANNEL_ID is not set in the environment"
  );
}

// Create a new Discord client
const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages],
});

// Connect to Discord
const readyPromise = new Promise<void>((resolve) => {
  client.once("ready", () => {
    console.log(`Discord bot logged in as ${client.user?.tag}`);
    resolve();
  });
});

if (Deno.env.get("ENV") !== "test") {
  client.login(DISCORD_BOT_TOKEN);
}

// Expose a function to post a message to the channel
export const postToDiscordChannel = async (message: string) => {
  await readyPromise; // Ensure the client is ready
  const channel = await client.channels.fetch(DISCORD_CHANNEL_ID!);
  if (!channel || !(channel instanceof TextChannel)) {
    throw new Error("Channel not found or is not a text channel");
  }
  if (Deno.env.get("ENV") === "dryrun") {
    console.log(`\nDRYRUN: Would have posted to Discord:\n${message}\n`);
    return;
  }
  await channel.send(message);
};

// Expose a function to fetch the latest message from a channel
export async function fetchLatestMessagesFromChannel(
  channelId: string,
  sinceMessageId?: string,
  limit: number = 10
): Promise<Message[]> {
  await readyPromise; // Ensure the client is ready
  console.log(">>> fetching messages from channel", channelId);
  const channel = await client.channels.fetch(channelId);
  if (!channel || !(channel instanceof TextChannel)) {
    throw new Error("Channel not found or is not a text channel");
  }
  console.log(
    ">>> fetching messages since message ID",
    sinceMessageId,
    "limit",
    limit
  );
  const messages = await channel.messages.fetch({ limit });
  const messagesArray = Array.from(messages.values()) || [];
  if (sinceMessageId) {
    return messagesArray.filter((message) => message.id >= sinceMessageId);
  }
  return messagesArray;
}
export async function fetchLatestMessageFromChannel(
  channelId: string
): Promise<Message | null> {
  const messages = await fetchLatestMessagesFromChannel(
    channelId,
    undefined,
    1
  );
  return messages[0] || null;
}

export async function removeMessagesFromChannel(
  channelId: string,
  messageIds: string[]
) {
  await readyPromise; // Ensure the client is ready
  const channel = await client.channels.fetch(channelId);
  if (!channel || !(channel instanceof TextChannel)) {
    throw new Error("Channel not found or is not a text channel");
  }
  try {
    await channel.bulkDelete(messageIds);
  } catch (error) {
    if (error.code === 50013) {
      throw new Error(
        "❌ error removing messages: You do not have permission to delete messages in this channel"
      );
    }
    throw error;
  }
}

export default {
  postToDiscordChannel,
  fetchLatestMessagesFromChannel,
  fetchLatestMessageFromChannel,
};

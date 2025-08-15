/**
 * This script is used to remove messages from a Discord channel.
 * Usage: deno run remove-messages --channel-id <channel-id> --since-message-id <message-id>
 */

import {
  fetchLatestMessagesFromChannel,
  removeMessagesFromChannel,
} from "./lib/discord.ts";

const usage = `
Usage: deno run remove-messages --since-message-id <message-id>
`;

async function main() {
  const channelId = Deno.env.get("DISCORD_CHANNEL_ID");
  const sinceMessageId = Deno.args[1];

  if (!channelId) {
    console.log("Channel ID is required");
    console.log(usage);
    return;
  }

  if (!sinceMessageId) {
    console.log("Since message ID is required");
    console.log(usage);
    return;
  }

  const messages = await fetchLatestMessagesFromChannel(
    channelId,
    sinceMessageId,
    100
  );

  const messageIds = messages.map((message) => message.id);

  console.log(
    ">>> messages to remove since message ID",
    sinceMessageId,
    messageIds
  );

  try {
    await removeMessagesFromChannel(channelId, messageIds);
  } catch (error) {
    console.error(error.message);
    Deno.exit(1);
  }

  console.log(">>>", messages.length, "messages removed");
  Deno.exit(0);
}

main();

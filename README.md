# monerium-bot
Fetch transactions from Monerium account, post in Discord

If you have a [Monerium](https://monerium.com) account, this bot will periodically fetch new transactions and post the details in your dedicated discord channel.

## How to install

First, make sure you have [Deno](https://docs.deno.com/runtime/getting_started/installation/) installed.

Then run

```sh
$> cp .env.example .env // then edit this file
$> deno run --env-file=.env main.ts
```

or to avoid the interactive permissions granting:


```sh
deno run \
  --allow-read=./data \
  --allow-write=./data \
  --allow-net=discord.com,api.monerium.app \
  --allow-env \
  --no-prompt \
  src/main.ts
```

or like a cowboy:

```sh
deno run -A --env-file=.env src/main.ts
```
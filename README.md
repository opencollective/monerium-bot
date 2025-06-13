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
$> deno run \
  --allow-read=./chains.json \
  --allow-net=gateway.discord.gg,gateway-us-east1-d.discord.gg,discord.com,api.monerium.app \
  --allow-env \
  --no-prompt \
  src/main.ts
```

(yes, Deno does not support subdomains or wildcards in permissions, it's annoying. [Already reported](https://x.com/xdamman/status/1923010358559625400).)

or like a cowboy:

```sh
$> deno run -A --env-file=.env src/main.ts
```

To debug, just run `deno task dryrun` to avoid posting to Discord. You can pass an optional `LAST_TX_HASH` env variable to simulate starting from a different position.

```sh
$> LAST_TX_HASH=0xa6736cf7dacd7ac90044f68a2b662ee5103daaa07c6289b91afbfa3940a17f48 deno task dryrun
```
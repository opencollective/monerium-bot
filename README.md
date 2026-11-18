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
  --allow-net=gateway.discord.gg,gateway-us-east1-d.discord.gg,discord.com,api.monerium.app,rpc.gnosischain.com,1rpc.io,rpc.gnosis.gateway.fm,gnosis.oat.farm,gnosis-pokt.nodies.app \
  --allow-env \
  --no-prompt \
  src/main.ts
```

(yes, Deno does not support subdomains or wildcards in permissions, it's annoying. [Already reported](https://x.com/xdamman/status/1923010358559625400).)

or like a cowboy:

```sh
$> deno run -A --env-file=.env src/main.ts
```

## Plain on-chain transfers (optional)

Monerium orders only cover SEPA payments, which show up on-chain as a mint (incoming) or a burn (outgoing). A wallet-to-wallet transfer of EURe to or from your account has no Monerium order, so it is not posted by default. Set `WATCH_ADDRESSES` to also post those:

| Variable | Default | |
| --- | --- | --- |
| `WATCH_ADDRESSES` | _(empty: disabled)_ | Comma-separated addresses to watch |
| `WATCH_CHAIN` | `gnosis` | Key in `chains.json`; its `rpc` list is tried in order |
| `WATCH_TOKEN` | `0x420CA0f9B9b604cE0fd9C18EF134C705e5Fa3430` | EURe on Gnosis |
| `WATCH_TOKEN_DECIMALS` | `18` | |
| `WATCH_CURRENCY` | `EUR` | Currency symbol used in messages |
| `WATCH_RPC_URL` | | Overrides the `chains.json` RPCs (add its host to `--allow-net`) |
| `WATCH_LOOKBACK_BLOCKS` | `17280` (~24h on Gnosis) | How far back the first poll after startup scans |

Each poll posts `Received €25.41 from 0x2cff…2680 [[View Transaction](…)]` / `Sent €… to 0x…`. Mints and burns are skipped (the Monerium poll already posts them with the counterparty's name), and so is any tx already linked in the channel.

To debug, just run `deno task dryrun` to avoid posting to Discord. You can pass an optional `LAST_TX_HASH` env variable to simulate starting from a different position.

```sh
$> LAST_TX_HASH=0xa6736cf7dacd7ac90044f68a2b662ee5103daaa07c6289b91afbfa3940a17f48 deno task dryrun
```
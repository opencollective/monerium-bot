# Use the official Deno image
FROM denoland/deno:alpine-2.3.1

ARG DISCORD_BOT_TOKEN
ARG DISCORD_CHANNEL_ID
ARG MONERIUM_CLIENT_ID
ARG MONERIUM_CLIENT_SECRET
ARG DATA_DIRECTORY

ENV DISCORD_BOT_TOKEN=$DISCORD_BOT_TOKEN
ENV DISCORD_CHANNEL_ID=$DISCORD_CHANNEL_ID
ENV MONERIUM_CLIENT_ID=$MONERIUM_CLIENT_ID
ENV MONERIUM_CLIENT_SECRET=$MONERIUM_CLIENT_SECRET
ENV DATA_DIRECTORY=$DATA_DIRECTORY

RUN mkdir -p /app

# Set working directory
WORKDIR /app

# Copy your project files
COPY . .

RUN deno run \
  --allow-read=/app/data \
  --allow-write=/app/data \
  --allow-net=discord.com,api.monerium.app \
  --allow-env \
  --no-prompt \
  src/main.ts
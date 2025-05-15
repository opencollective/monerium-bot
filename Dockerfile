# Use the official Deno image
FROM denoland/deno:alpine-2.3.1

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
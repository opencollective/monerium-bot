# Use the official Deno image
FROM denoland/deno:alpine-2.3.1

# Install curl
RUN apk add --no-cache curl

# Create app directory
RUN mkdir -p /app

# Set working directory
WORKDIR /app

# Copy your project files
COPY . .

CMD ["deno", "run", "--allow-read=/app/chains.json", "--allow-net=0.0.0.0,api.monerium.app,rpc.gnosischain.com,1rpc.io,rpc.gnosis.gateway.fm,gnosis.oat.farm,gnosis-pokt.nodies.app,discord.com,gateway.discord.gg,gateway-us-east1-a.discord.gg,gateway-us-east1-b.discord.gg,gateway-us-east1-c.discord.gg,gateway-us-east1-d.discord.gg,gateway-us-east1-e.discord.gg", "--allow-env", "--no-prompt", "src/main.ts"]
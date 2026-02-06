# Use Node.js LTS version
FROM node:22-slim

# Install build dependencies for native modules (better-sqlite3) and Docker
RUN apt-get update && apt-get install -y \
    python3 \
    make \
    g++ \
    libsqlite3-dev \
    ca-certificates \
    curl \
    gnupg \
    lsb-release \
    socat \
    && rm -rf /var/lib/apt/lists/*

# Install Docker CLI (compatible version for older Docker daemons - API 1.41)
# Download and install Docker CLI 20.10.x which supports API 1.41
# Replace /usr/bin/docker directly since it's in PATH first
RUN rm -f /usr/bin/docker /usr/local/bin/docker /bin/docker && \
    curl -fsSL https://download.docker.com/linux/static/stable/x86_64/docker-20.10.24.tgz | tar -xz -C /tmp && \
    mv /tmp/docker/docker /usr/bin/docker && \
    chmod +x /usr/bin/docker && \
    rm -rf /tmp/docker && \
    docker --version

# Install pnpm globally
RUN npm install -g pnpm

# Set working directory
WORKDIR /app

# Copy package files
COPY package.json pnpm-lock.yaml ./

# Install dependencies with hoisting for native modules
RUN pnpm install --frozen-lockfile --shamefully-hoist

# Rebuild better-sqlite3 native module using node-gyp
RUN npm install -g node-gyp && \
    (cd node_modules/better-sqlite3 2>/dev/null && node-gyp rebuild) || \
    (find .pnpm -name "better-sqlite3" -type d -path "*/node_modules/better-sqlite3" | head -1 | xargs -I {} sh -c 'cd "{}" && node-gyp rebuild')

# Copy TypeScript config
COPY tsconfig.json ./

# Copy source code
COPY src ./src
COPY scripts ./scripts

# Build TypeScript code
RUN pnpm build

# Copy environment variables (from env.example as .env)
COPY env.example .env

# Expose the ports
EXPOSE 3001 3100

# Start EigenDA proxy in background and then start backend
CMD sh -c 'echo "Starting EigenDA proxy..." && docker rm -f eigenda-proxy 2>/dev/null || true && docker run -d --name eigenda-proxy --rm ghcr.io/layr-labs/eigenda-proxy:latest --memstore.enabled --port 3100 && sleep 3 && EIGENDA_IP=$(docker inspect -f "{{range .NetworkSettings.Networks}}{{.IPAddress}}{{end}}" eigenda-proxy 2>/dev/null) && if [ -z "$EIGENDA_IP" ]; then echo "ERROR: Could not get EigenDA IP"; exit 1; fi && echo "EigenDA IP: $EIGENDA_IP" && for i in 1 2 3 4 5; do if curl -s http://$EIGENDA_IP:3100/health > /dev/null 2>&1; then echo "EigenDA is ready!"; break; else echo "Waiting for EigenDA... ($i/5)"; sleep 2; fi; done && export EIGENDA_PROXY_URL=http://$EIGENDA_IP:3100 && echo "EIGENDA_PROXY_URL=$EIGENDA_PROXY_URL" && socat TCP-LISTEN:3100,fork,reuseaddr TCP:$EIGENDA_IP:3100 & SOCAT_PID=$! && echo "Port forwarding started (PID: $SOCAT_PID)" && export $(cat .env | grep -v "^#" | xargs) && pnpm start'

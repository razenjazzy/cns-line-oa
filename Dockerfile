# Stage 1: Build the TypeScript code
FROM node:26-alpine AS builder

WORKDIR /usr/src/app

# Skip Puppeteer download since we don't use it
ENV PUPPETEER_SKIP_DOWNLOAD=true

# Copy package.json and package-lock.json
COPY package*.json ./

# Install all dependencies (including devDependencies for tsc)
RUN npm ci --ignore-scripts

# Copy the source code
COPY tsconfig.json ./
COPY src/ ./src/

# Build the TypeScript code
RUN npm run build

# Stage 2: Create the production image
FROM node:26-alpine

WORKDIR /usr/src/app

# Skip Puppeteer download
ENV PUPPETEER_SKIP_DOWNLOAD=true

# Copy package.json and package-lock.json
COPY package*.json ./

# Install only production dependencies
RUN npm ci --omit=dev --ignore-scripts && npm cache clean --force

# Copy the compiled JS files from the builder stage
COPY --from=builder /usr/src/app/dist ./dist
COPY skills ./skills

# wget is used by the container HEALTHCHECK (not present on stock node:alpine).
RUN apk add --no-cache wget \
  && addgroup -S app && adduser -S -G app app && chown -R app:app /usr/src/app

# Staging vs production is APP_ENV (injected by the host), not this file.
# Unset APP_ENV + NODE_ENV=production fails closed to delivery production.
ENV NODE_ENV=production
ENV PORT=8080

# Expose the Cloud Run port
EXPOSE 8080

USER app

# Container-level liveness check, independent of the platform's own probe.
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget -qO- http://127.0.0.1:8080/healthz || exit 1

# Start without npm so SIGTERM reaches the Node process (Railway / Cloud Run).
CMD [ "node", "dist/index.js" ]

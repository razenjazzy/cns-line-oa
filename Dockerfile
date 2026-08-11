# Stage 1: Build the TypeScript code
FROM node:18-alpine AS builder

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
FROM node:18-alpine

WORKDIR /usr/src/app

# Skip Puppeteer download
ENV PUPPETEER_SKIP_DOWNLOAD=true

# Copy package.json and package-lock.json
COPY package*.json ./

# Install only production dependencies
RUN npm ci --only=production --ignore-scripts

# Copy the compiled JS files from the builder stage
COPY --from=builder /usr/src/app/dist ./dist

# Set standard Node.js environment variables
ENV NODE_ENV=production
ENV PORT=8080

# Expose the Cloud Run port
EXPOSE 8080

# Start the application
CMD [ "npm", "start" ]

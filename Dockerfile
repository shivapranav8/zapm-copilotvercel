FROM node:20-slim

WORKDIR /app

# Install dependencies
COPY package*.json ./
RUN npm ci --omit=dev || npm install

# Copy all source files
COPY . .

# Build the frontend
RUN npm run build

# Expose the port Catalyst provides
ENV PORT=8080
EXPOSE 8080

# Start the Express server in production mode
CMD ["./node_modules/.bin/tsx", "server/index.ts"]

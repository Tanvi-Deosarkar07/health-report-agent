FROM node:22-bookworm-slim

# python3: required at runtime by classifier.py / classify_cli.py (the deterministic
# classification step, invoked via subprocess from the Next.js API route).
# build-essential: fallback for node-gyp if no prebuilt native binary matches this
# platform for better-sqlite3 (used by the disconnected legacy history feature).
RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 \
    build-essential \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY . .
RUN npm run build

ENV NODE_ENV=production
EXPOSE 3000
CMD ["npm", "start"]

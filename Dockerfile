# System Chromium is used instead of Puppeteer's bundled download because
# Chrome for Testing has no official linux-arm64 build (needed for
# Raspberry Pi and other ARM homeserver hosts). Debian's chromium package
# covers both amd64 and arm64, so one Dockerfile works for either.
FROM node:22-bookworm-slim

RUN apt-get update && apt-get install -y --no-install-recommends \
    chromium \
    fonts-liberation \
    curl \
    && rm -rf /var/lib/apt/lists/*

ENV PUPPETEER_SKIP_DOWNLOAD=true \
    PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium \
    PUPPETEER_NO_SANDBOX=true

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY . .

# Set after `npm ci`, not before: npm skips devDependencies when
# NODE_ENV=production is already set at install time, but tsx (a
# devDependency) is what runs the app — there's no build step.
ENV NODE_ENV=production

# /app/data is where session.json should be bind-mounted from the host (see
# docker-compose.yml) — mounting a directory rather than the file directly,
# since the app's atomic session-write (tmp file + rename) needs the tmp
# file and the target to be on the same mounted filesystem.
RUN mkdir -p /app/data && chown -R node:node /app
USER node

EXPOSE 3141

HEALTHCHECK --interval=30s --timeout=5s --retries=3 \
    CMD curl -f http://localhost:3141/health || exit 1

ENTRYPOINT ["npm", "start", "--"]
CMD ["--host", "0.0.0.0"]

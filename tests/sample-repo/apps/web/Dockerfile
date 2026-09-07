FROM oven/bun:1
WORKDIR /app
COPY . .
RUN bun install --frozen-lockfile && bun run build
CMD ["bun", "build/index.js"]

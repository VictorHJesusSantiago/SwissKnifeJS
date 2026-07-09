FROM node:20-alpine AS build
WORKDIR /app
COPY package*.json tsconfig.json ./
COPY packages ./packages
RUN npm ci && npm run build

FROM node:20-alpine
WORKDIR /app
ENV NODE_ENV=production
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/packages ./packages
COPY --from=build /app/dist ./dist
COPY examples ./examples
USER node
CMD ["node", "dist/packages/log-aggregator/src/server.js"]

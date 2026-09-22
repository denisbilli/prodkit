FROM node:20-alpine
WORKDIR /app
COPY . .
RUN npm ci --omit=dev
ENV NODE_ENV=production
EXPOSE 3000
HEALTHCHECK CMD wget -qO- http://localhost:3000/stato || exit 1
CMD ["node", "src/server.js"]

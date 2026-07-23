FROM node:20-alpine

WORKDIR /app

RUN apk add --no-cache tini

COPY package.json ./
RUN npm install --omit=dev && npm cache clean --force

COPY src ./src
COPY extensions ./extensions

RUN mkdir -p /app/data \
  && chown -R node:node /app

ENV NODE_ENV=production \
    PORT=3000 \
    DATA_DIR=/app/data \
    HOST=https://app.example.com \
    SCOPES=read_products,write_products,read_customers,write_customers

USER node
EXPOSE 3000

ENTRYPOINT ["/sbin/tini", "--"]
CMD ["node", "src/index.js"]

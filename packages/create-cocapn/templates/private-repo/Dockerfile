FROM node:20-slim

WORKDIR /app

COPY package*.json ./
RUN npm ci --production

COPY . .

EXPOSE 3100

CMD ["node", "node_modules/.bin/cocapn-bridge"]

FROM node:latest
COPY lib/ lib/
COPY config/ config/
COPY server.js server.js
COPY package.json package.json
RUN npm install
ENV PORT=80
EXPOSE 80
CMD node server.js
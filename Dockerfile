FROM node:latest
COPY server.js server.js
COPY package.json package.json
COPY lib/ lib/
RUN npm install
ENV PORT=80
EXPOSE 80
CMD node server.js
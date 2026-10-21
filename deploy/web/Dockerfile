# docker build -f deploy/web/Dockerfile -t boss-web . (Node only)
FROM node:22-alpine AS build
WORKDIR /web
COPY package*.json ./
RUN npm ci
COPY tsconfig*.json vite.config.ts index.html ./
COPY src ./src
COPY shared ./shared
COPY public ./public
RUN npm run build:web
FROM nginx:alpine
COPY --from=build /web/dist /usr/share/nginx/html
COPY deploy/web/default.conf.template /etc/nginx/templates/default.conf.template
ENV API_UPSTREAM=http://boss-api:8787
EXPOSE 80

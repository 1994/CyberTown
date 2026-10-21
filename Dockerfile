FROM node:22-alpine AS web
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build:web

FROM golang:1.27-alpine AS server
WORKDIR /app
COPY go.mod go.sum ./
RUN go mod download
COPY backend ./backend
COPY gameplay ./gameplay
COPY internal ./internal
COPY cmd ./cmd
COPY identity ./identity
COPY server ./server
RUN CGO_ENABLED=0 go build -trimpath -ldflags='-s -w' -o /boss-server ./cmd/boss-server

FROM alpine:3.23
RUN addgroup -S game && adduser -S -G game game && mkdir /app /data && chown game:game /app /data
WORKDIR /app
COPY --from=server /boss-server /app/boss-server
COPY --from=web /app/dist /app/dist
USER game
ENV HOST=0.0.0.0 PORT=8787 DB_PATH=/data/boss.db STATIC_DIR=/app/dist
EXPOSE 8787
VOLUME ["/data"]
CMD ["/app/boss-server"]

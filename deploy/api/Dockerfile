# docker build -f deploy/api/Dockerfile -t boss-api . (Go only)
FROM golang:1.27-alpine AS build
WORKDIR /core
COPY go.mod go.sum ./
RUN go mod download
COPY backend ./backend
COPY gameplay ./gameplay
COPY internal ./internal
COPY identity ./identity
COPY server ./server
COPY cmd ./cmd
RUN CGO_ENABLED=0 go build -trimpath -ldflags='-s -w' -o /boss-api ./cmd/boss-server
FROM alpine:3.23
RUN addgroup -S game && adduser -S -G game game && mkdir /data && chown game:game /data
WORKDIR /app
COPY --from=build /boss-api /app/boss-api
USER game
ENV APP_ENV=test HOST=0.0.0.0 PORT=8787 DB_PATH=/data/boss-test.db
EXPOSE 8787
VOLUME ["/data"]
CMD ["/app/boss-api"]
# This image is a test API. Intranet production builds its private composition
# executable using server.Run and the company SPI, not AUTH_MODE=demo/mock.

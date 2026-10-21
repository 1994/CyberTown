.DEFAULT_GOAL := up

.PHONY: test-crowd bench-crowd test-deployment check-web check-api deps-web build-web build-api dev-web dev-api test-web test-api package-web package-api help check deps build up lan stop down restart status logs dev test test-auth perf perf-wasm

help:
	@printf '%s\n' \
	  'make up       安装依赖、构建并后台启动（默认支持局域网）' \
	  'make lan      构建并启动局域网联机，显示可分享地址' \
	  'make stop     停止服务，保留数据库（make down 同样有效）' \
	  'make restart  使用已有构建重启服务' \
	  'make status   查看服务状态和访问地址' \
	  'make logs     持续查看服务日志，Ctrl+C 退出查看' \
	  'make dev      启动前后端热更新开发环境' \
	  'make build    安装依赖并构建前后端' \
	  'make test     运行 Go 测试与规则契约校验' \
	  'make test-auth 仅运行身份 SPI / Mock / 会话隔离测试，无需 Node' \
	  'make perf     运行碰撞/寻路 CPU 基准（需要 npm ci）' \
	  'make perf-wasm 编译可选 Rust/WASM 对照实验并跑基准' \
	  'make dev-web / build-web / test-web  仅前端（只需 Node）' \
	  'make dev-api / build-api / test-api  仅后端（只需 Go）' \
	  'make test-crowd  100假玩家HTTP/SSE集中上线与附近订阅测试（仅Go）' \
	  'make bench-crowd  100/300人位置同步CPU基准（仅Go）' \
	  'make test-deployment  隔离验证原有后台启动/停止控制器' \
	  'make package-web / package-api  导出独立前端产物 / 后端源码包' \
	  '配置：.env 或 HOST=0.0.0.0 PORT=9000 make up'

check: check-web check-api

check-web:
	@command -v node >/dev/null || { echo '请先安装 Node.js 22.18+（含 npm）'; exit 1; }
	@command -v npm >/dev/null || { echo '请先安装 npm'; exit 1; }
	@node -e 'const [major, minor] = process.versions.node.split(".").map(Number); if (major < 22 || (major === 22 && minor < 18)) { console.error("需要 Node.js 22.18+"); process.exit(1); }'

check-api:
	@command -v go >/dev/null || { echo '请先安装 Go 1.26+'; exit 1; }

deps-web: check-web
	npm ci

build-web: deps-web
	npm run build:web

build-api: check-api
	CGO_ENABLED=0 go build -trimpath -o bin/boss-server ./cmd/boss-server

dev-web: deps-web
	npm run dev:web

# A separate fake-data DB; does not restart the make up service.
dev-api: check-api
	APP_ENV=test DB_PATH=$${DB_PATH:-data/boss-test.db} go run ./cmd/boss-server --static ''

test-web: deps-web
	npm run test:web

test-api: check-api
	go test ./...

test-crowd: check-api
	go test ./backend -run 'TestCrowd100Burst|TestInterest|TestDense|TestWorldDelta|TestWorldFocus' -count=1 -v

bench-crowd: check-api
	go test ./backend -run '^$$' -bench BenchmarkCrowdedWorldFlush -benchtime=300ms -count=1

test-deployment: check
	npm run test:deployment

package-web: build-web
	mkdir -p .run
	tar -czf .run/boss-web.tar.gz -C dist .

# Transfer this public core into the intranet; company adapters stay outside it.
package-api: check-api
	mkdir -p .run
	tar -czf .run/boss-api-source.tar.gz go.mod go.sum backend cmd identity server contracts examples/intranet examples/identity deploy/api docs/DECOUPLED-DEVELOPMENT.md docs/IDENTITY-SPI.md docs/BACKEND.md docs/REVIEW-PROXIMITY.md

deps: check
	npm ci

build: deps
	npm run build

up: build
	node scripts/server.mjs up

lan: build
	HOST=0.0.0.0 node scripts/server.mjs up

down:
	node scripts/server.mjs down

stop: down

restart:
	node scripts/server.mjs up

status:
	node scripts/server.mjs status

logs:
	node scripts/server.mjs logs

dev: deps
	npm run dev

test: deps
	npm test

test-auth:
	go test ./identity/... ./backend ./cmd/boss-server -run 'Identity|Mock|AuthProvider' -count=1

perf:
	npm run perf:cpu

# Only this optional experiment needs Rust + wasm32-unknown-unknown target.
perf-wasm:
	mkdir -p artifacts/tmp
	rustc --edition=2021 --target wasm32-unknown-unknown -O -C panic=abort -C lto=fat -C strip=symbols --crate-type cdylib experiments/performance/collision.rs -o artifacts/tmp/collision.wasm
	npm run perf:cpu

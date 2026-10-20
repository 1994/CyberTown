.DEFAULT_GOAL := up

.PHONY: help check deps build up stop down restart status logs dev test

help:
	@printf '%s\n' \
	  'make up       安装依赖、构建并后台启动（默认命令）' \
	  'make stop     停止服务，保留数据库（make down 同样有效）' \
	  'make restart  使用已有构建重启服务' \
	  'make status   查看服务状态和访问地址' \
	  'make logs     持续查看服务日志，Ctrl+C 退出查看' \
	  'make dev      启动前后端热更新开发环境' \
	  'make build    安装依赖并构建前后端' \
	  'make test     运行 Go 测试与规则契约校验' \
	  '配置：.env 或 HOST=0.0.0.0 PORT=9000 make up'

check:
	@command -v node >/dev/null || { echo '请先安装 Node.js 22.18+（含 npm）'; exit 1; }
	@command -v npm >/dev/null || { echo '请先安装 npm'; exit 1; }
	@command -v go >/dev/null || { echo '请先安装 Go 1.26+'; exit 1; }
	@node -e 'const [major, minor] = process.versions.node.split(".").map(Number); if (major < 22 || (major === 22 && minor < 18)) { console.error("需要 Node.js 22.18+"); process.exit(1); }'

deps: check
	npm ci

build: deps
	npm run build

up: build
	node scripts/server.mjs up

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

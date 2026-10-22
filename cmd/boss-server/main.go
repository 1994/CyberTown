package main

import (
	"bufio"
	"context"
	"flag"
	"fmt"
	"github.com/1994/boss-works-for-me/server"
	"log"
	"net"
	"net/http"
	"os"
	"os/signal"
	"strings"
	"syscall"
	"time"
)

func env(key, fallback string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return fallback
}
func loadEnv() {
	f, err := os.Open(".env")
	if err != nil {
		return
	}
	defer f.Close()
	s := bufio.NewScanner(f)
	for s.Scan() {
		line := strings.TrimSpace(s.Text())
		if line == "" || strings.HasPrefix(line, "#") {
			continue
		}
		key, value, ok := strings.Cut(line, "=")
		key = strings.TrimSpace(key)
		if ok && os.Getenv(key) == "" {
			_ = os.Setenv(key, strings.Trim(strings.TrimSpace(value), "\"'"))
		}
	}
}
func main() {
	loadEnv()
	db := flag.String("db", env("DB_PATH", "data/boss.db"), "SQLite file")
	host := flag.String("host", env("HOST", "0.0.0.0"), "listen address")
	port := flag.String("port", env("PORT", "8787"), "listen port")
	static := flag.String("static", os.Getenv("STATIC_DIR"), "optional frontend directory; empty = API only")
	reset := flag.Bool("reset", false, "reset only this demo database and exit")
	seedOnly := flag.Bool("seed", false, "initialize demo data if absent and exit")
	authMode := flag.String("auth", env("AUTH_MODE", "demo"), "test identity: demo or mock; intranet uses a private server.Run entry")
	mockFile := flag.String("mock-identities", env("MOCK_IDENTITIES_FILE", ""), "mock token-to-user JSON fixture file")
	flag.Parse()
	provider, err := identityProvider(*authMode, *mockFile)
	if err != nil {
		log.Fatal(err)
	}
	config := server.ConfigFromEnv()
	config.Host, config.Port, config.DatabasePath, config.StaticDir = *host, *port, *db, *static
	if config.Environment == "production" && (*reset || *seedOnly) {
		log.Fatal("production refuses demo reset/seed commands")
	}
	runtime, err := server.New(config, provider)
	if err != nil {
		log.Fatal(err)
	}
	defer runtime.Close()
	game := runtime.Game
	if *reset {
		if err = game.Reset(); err != nil {
			log.Fatal(err)
		}
		fmt.Println("演示数据库已重置：四名测试玩家各600金币")
		return
	}
	if *seedOnly {
		fmt.Println("演示数据已就绪（已有数据保留）")
		return
	}
	app := runtime.App
	defer app.Close()
	server := &http.Server{Addr: net.JoinHostPort(*host, *port), Handler: runtime.Handler, ReadHeaderTimeout: 5 * time.Second, IdleTimeout: 60 * time.Second, MaxHeaderBytes: 16 * 1024}
	listener, err := net.Listen("tcp", server.Addr)
	if err != nil {
		log.Fatal(err)
	}
	defer listener.Close()
	stop := make(chan os.Signal, 1)
	signal.Notify(stop, os.Interrupt, syscall.SIGTERM)
	go func() {
		<-stop
		app.Close()
		ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
		defer cancel()
		_ = server.Shutdown(ctx)
	}()
	fmt.Println("🏢 赛博小镇 · Go 服务已启动")
	printAddresses(*host, fmt.Sprint(listener.Addr().(*net.TCPAddr).Port))
	identityLabel := "demo（体验身份，非真实 SSO）"
	if provider != nil {
		identityLabel = provider.ID()
		if identityLabel == "mock" {
			identityLabel += "（本地测试凭证，非真实 SSO）"
		}
	}
	fmt.Printf("环境: %s\n数据库: %s\n身份提供方: %s\n独立 API: %t\n", config.Environment, *db, identityLabel, *static == "")
	if err = server.Serve(listener); err != nil && err != http.ErrServerClosed {
		log.Fatal(err)
	}
}

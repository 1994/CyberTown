// Local QA protocol fixture; never a real company connection.
package main

import (
	"context"
	"github.com/1994/boss-works-for-me/identity"
	"github.com/1994/boss-works-for-me/server"
	"log"
	"net/url"
	"os"
	"os/signal"
	"strings"
	"sync"
	"syscall"
)

type fixture struct {
	mu    sync.Mutex
	valid bool
}

func (*fixture) ID() string { return "qa-crowd" }
func (p *fixture) BeginLogin(ctx context.Context, callback string) (identity.BrowserLogin, error) {
	p.mu.Lock()
	defer p.mu.Unlock()
	p.valid = true
	u, _ := url.Parse(callback)
	q := u.Query()
	q.Set("code", "qa-viewer")
	q.Set("state", "qa-local-crowd-state")
	u.RawQuery = q.Encode()
	return identity.BrowserLogin{URL: u.String(), State: "qa-local-crowd-state"}, ctx.Err()
}
func (p *fixture) Authenticate(ctx context.Context, c identity.Credentials) (identity.User, error) {
	p.mu.Lock()
	defer p.mu.Unlock()
	if strings.HasPrefix(c.AccessToken, "perf-fake-") {
		return identity.User{Subject: c.AccessToken, Name: c.AccessToken}, ctx.Err()
	}
	if !p.valid || c.Code != "qa-viewer" || c.State != "qa-local-crowd-state" {
		return identity.User{}, identity.ErrUnauthorized
	}
	p.valid = false
	return identity.User{Subject: "viewer", Name: "广场体验员"}, ctx.Err()
}
func main() {
	ctx, cancel := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer cancel()
	cfg := server.ConfigFromEnv()
	if cfg.Environment != "test" || cfg.Host != "127.0.0.1" {
		log.Fatal("QA fixture requires APP_ENV=test HOST=127.0.0.1")
	}
	callback, err := url.Parse(cfg.LoginCallbackURL)
	if err != nil || callback.Hostname() != "127.0.0.1" {
		log.Fatal("QA callback must use 127.0.0.1")
	}
	if err := server.Run(ctx, cfg, &fixture{}); err != nil {
		log.Fatal(err)
	}
}

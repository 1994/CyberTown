// Package server is the composition boundary for private intranet executables.
// It needs Go only: no frontend build, Node, company SDK, or demo credentials.
package server

import (
	"context"
	"fmt"
	"net"
	"net/http"
	"net/url"
	"os"
	"regexp"
	"strings"
	"time"

	"github.com/1994/boss-works-for-me/backend"
	"github.com/1994/boss-works-for-me/identity"
	"github.com/1994/boss-works-for-me/storage"
)

type Config struct {
	// Storage overrides DatabasePath. New takes ownership after validation;
	// on validation failure the caller still owns it. Nil uses local SQLite.
	Storage      storage.Store
	MockDataFile string // explicit test-only scenario; never accepted in production

	Environment      string // test or production; never inferred from a missing provider
	Host             string
	Port             string
	DatabasePath     string
	StaticDir        string   // empty = API only
	AllowedOrigins   []string // exact browser origins, empty = same-origin only
	LoginCallbackURL string   // e.g. https://game.corp/?boss_auth=callback
	AllowReset       bool
}

// ConfigFromEnv intentionally defaults to API-only test mode. The legacy local
// CLI may explicitly opt into serving dist for make up compatibility.
func ConfigFromEnv() Config {
	get := func(key, fallback string) string {
		if v := os.Getenv(key); v != "" {
			return v
		}
		return fallback
	}
	var origins []string
	for _, value := range strings.Split(os.Getenv("CORS_ALLOWED_ORIGINS"), ",") {
		if v := strings.TrimSpace(value); v != "" {
			origins = append(origins, v)
		}
	}
	return Config{Environment: get("APP_ENV", "test"), Host: get("HOST", "0.0.0.0"), Port: get("PORT", "8787"), DatabasePath: get("DB_PATH", "data/boss.db"), MockDataFile: os.Getenv("MOCK_DATA_FILE"), StaticDir: os.Getenv("STATIC_DIR"), AllowedOrigins: origins, LoginCallbackURL: os.Getenv("LOGIN_CALLBACK_URL"), AllowReset: os.Getenv("ALLOW_DEMO_RESET") == "1"}
}

func (c Config) Validate(provider identity.Provider) error {
	if provider != nil && !regexp.MustCompile(`^[a-zA-Z0-9][a-zA-Z0-9._-]{0,63}$`).MatchString(provider.ID()) {
		return fmt.Errorf("identity provider ID is invalid")
	}
	if c.Environment != "test" && c.Environment != "production" {
		return fmt.Errorf("APP_ENV must be test or production")
	}
	if c.DatabasePath == "" && c.Storage == nil {
		return fmt.Errorf("DB_PATH is required")
	}
	if c.Environment == "production" {
		if c.MockDataFile != "" {
			return fmt.Errorf("production refuses MOCK_DATA_FILE")
		}
		if provider == nil || provider.ID() == "demo" || provider.ID() == "mock" {
			return fmt.Errorf("production requires an explicit company identity.Provider; demo/mock are test-only")
		}
		if c.AllowReset {
			return fmt.Errorf("production refuses ALLOW_DEMO_RESET")
		}
	}
	for _, origin := range c.AllowedOrigins {
		u, err := url.Parse(origin)
		if err != nil || (u.Scheme != "https" && u.Scheme != "http") || u.Host == "" || u.User != nil || u.Path != "" || u.RawQuery != "" || u.Fragment != "" || strings.Contains(origin, "*") {
			return fmt.Errorf("CORS_ALLOWED_ORIGINS requires exact http(s) origins without paths or wildcards")
		}
	}
	if _, ok := provider.(identity.BrowserProvider); ok {
		u, err := url.Parse(c.LoginCallbackURL)
		if err != nil || (u.Scheme != "https" && u.Scheme != "http") || u.Host == "" || u.User != nil || u.Fragment != "" || u.Query().Get("boss_auth") != "callback" || len(u.Query()) != 1 {
			return fmt.Errorf("LOGIN_CALLBACK_URL must be a fixed http(s) frontend URL with only ?boss_auth=callback")
		}
	}
	return nil
}

type Runtime struct {
	Config  Config
	Game    *backend.Game
	App     *backend.App
	Handler http.Handler
}

// New validates before touching the database. Private binaries inject their SPI
// here, so updates to the public core never overwrite company integration code.
func New(c Config, provider identity.Provider) (*Runtime, error) {
	if err := c.Validate(provider); err != nil {
		return nil, err
	}
	var g *backend.Game
	var err error
	opts := backend.DatabaseOptions{DemoData: c.Environment == "test"}
	if c.Storage != nil {
		g, err = backend.OpenWithStorage(c.Storage, nil, opts)
	} else {
		g, err = backend.OpenWithOptions(c.DatabasePath, nil, opts)
	}
	if err != nil {
		return nil, err
	}
	if c.MockDataFile != "" {
		f, e := os.Open(c.MockDataFile)
		if e != nil {
			g.Close()
			return nil, e
		}
		scenario, e := backend.DecodeMockScenario(f)
		f.Close()
		if e == nil {
			e = g.ApplyMockScenario(scenario)
		}
		if e != nil {
			g.Close()
			return nil, e
		}
	}
	app := backend.NewApp(g, backend.Options{StaticDir: c.StaticDir, AllowReset: c.AllowReset, IdentityProvider: provider, LoginCallbackURL: c.LoginCallbackURL})
	return &Runtime{Config: c, Game: g, App: app, Handler: cors(app, c.AllowedOrigins)}, nil
}
func (r *Runtime) Close() error { r.App.Close(); return r.Game.Close() }

// Run serves until cancellation. SSE is closed before HTTP shutdown; an overall
// WriteTimeout is deliberately omitted for long-lived event streams.
func Run(ctx context.Context, c Config, provider identity.Provider) error {
	runtime, err := New(c, provider)
	if err != nil {
		return err
	}
	defer runtime.Close()
	listener, err := net.Listen("tcp", net.JoinHostPort(c.Host, c.Port))
	if err != nil {
		return err
	}
	defer listener.Close()
	srv := &http.Server{Handler: runtime.Handler, ReadHeaderTimeout: 5 * time.Second, IdleTimeout: 60 * time.Second, MaxHeaderBytes: 16 * 1024}
	done := make(chan struct{})
	stopped := make(chan struct{})
	go func() {
		defer close(stopped)
		select {
		case <-ctx.Done():
			runtime.App.Close()
			stop, cancel := context.WithTimeout(context.Background(), 5*time.Second)
			defer cancel()
			_ = srv.Shutdown(stop)
		case <-done:
		}
	}()
	fmt.Printf("API listening on %s; environment=%s; static=%t\n", listener.Addr(), c.Environment, c.StaticDir != "")
	err = srv.Serve(listener)
	close(done)
	<-stopped // Drain handlers before closing the database.
	if err == http.ErrServerClosed {
		return nil
	}
	return err
}

package server

import (
	"bufio"
	"context"
	"encoding/json"
	"errors"
	"io"
	"net/http"
	"net/http/httptest"
	"path/filepath"
	"strings"
	"sync"
	"testing"

	"github.com/1994/boss-works-for-me/identity"
)

func config(t *testing.T) Config {
	return Config{Environment: "production", Host: "127.0.0.1", Port: "0", DatabasePath: filepath.Join(t.TempDir(), "game.db")}
}
func provider() identity.Provider {
	return identity.ProviderFunc{ProviderID: "company-fixture", Verify: func(context.Context, identity.Credentials) (identity.User, error) {
		return identity.User{Subject: "employee-1", Name: "内网测试员工"}, nil
	}}
}
func request(t *testing.T, handler http.Handler, method, path, body, origin, token string) *httptest.ResponseRecorder {
	t.Helper()
	r := httptest.NewRequest(method, path, strings.NewReader(body))
	if origin != "" {
		r.Header.Set("Origin", origin)
	}
	if token != "" {
		r.Header.Set("Authorization", "Bearer "+token)
	}
	w := httptest.NewRecorder()
	handler.ServeHTTP(w, r)
	return w
}
func TestProductionRequiresExplicitProviderBeforeCreatingDB(t *testing.T) {
	for _, p := range []identity.Provider{nil, identity.ProviderFunc{ProviderID: "demo"}, identity.ProviderFunc{ProviderID: "mock"}, identity.ProviderFunc{ProviderID: "bad issuer"}} {
		if r, err := New(config(t), p); err == nil {
			r.Close()
			t.Fatal("accepted test identity")
		}
	}
	c := config(t)
	c.AllowReset = true
	if _, err := New(c, provider()); err == nil {
		t.Fatal("accepted reset")
	}
	c = config(t)
	c.Environment = "prod-typo"
	if _, err := New(c, provider()); err == nil {
		t.Fatal("accepted unknown env")
	}
}
func TestProductionProvisioningAndDatabaseIsolation(t *testing.T) {
	c := config(t)
	runtime, err := New(c, provider())
	if err != nil {
		t.Fatal(err)
	}
	if err := runtime.Game.Reset(); err == nil {
		t.Fatal("production Game.Reset allowed")
	}
	var count int
	_ = runtime.Game.DB.QueryRow("SELECT COUNT(*) FROM players").Scan(&count)
	if count != 0 {
		t.Fatal("demo players seeded", count)
	}
	_ = runtime.Game.DB.QueryRow("SELECT COUNT(*) FROM colleagues WHERE self_player_id IS NULL").Scan(&count)
	if count != 7 {
		t.Fatal("missing fictional NPCs", count)
	}
	if w := request(t, runtime.Handler, "GET", "/", "", "", ""); w.Code != 404 {
		t.Fatal("API requires no dist", w.Code)
	}
	w := request(t, runtime.Handler, "POST", "/api/auth/login", `{"accessToken":"fake"}`, "", "")
	if w.Code != 200 {
		t.Fatal(w.Body.String())
	}
	var login struct {
		Token string `json:"token"`
	}
	_ = json.Unmarshal(w.Body.Bytes(), &login)
	w = request(t, runtime.Handler, "GET", "/api/state", "", "", login.Token)
	if w.Code != 200 {
		t.Fatal(w.Body.String())
	}
	var state struct {
		Me struct {
			Coins int `json:"coins"`
		}
		Players []any
	}
	_ = json.Unmarshal(w.Body.Bytes(), &state)
	if state.Me.Coins != 600 || len(state.Players) != 1 {
		t.Fatal("wrong employee state", w.Body.String())
	}
	if w = request(t, runtime.Handler, "POST", "/api/auth/test-login", `{"playerId":"wang"}`, "", ""); w.Code != 404 {
		t.Fatal("test login enabled")
	}
	if w = request(t, runtime.Handler, "POST", "/api/demo/reset", "{}", "", ""); w.Code != 403 {
		t.Fatal("reset enabled")
	}
	runtime.Close()
	runtime, err = New(c, provider())
	if err != nil {
		t.Fatal("production reopen", err)
	}
	runtime.Close()
	c.Environment = "test"
	if r, err := New(c, nil); err == nil {
		r.Close()
		t.Fatal("test accepted production DB")
	}
	c = config(t)
	c.Environment = "test"
	runtime, err = New(c, nil)
	if err != nil {
		t.Fatal(err)
	}
	if _, err := runtime.Game.DB.Exec("DELETE FROM identity_bindings; DELETE FROM meta WHERE key='dataset'"); err != nil {
		t.Fatal(err)
	}
	runtime.Close()
	c.Environment = "production"
	if r, err := New(c, provider()); err == nil {
		r.Close()
		t.Fatal("production accepted demo DB")
	}
}
func TestCORSExactOriginsAndSSE(t *testing.T) {
	c := config(t)
	c.Environment = "test"
	c.AllowedOrigins = []string{"https://frontend.test"}
	runtime, err := New(c, nil)
	if err != nil {
		t.Fatal(err)
	}
	defer runtime.Close()
	for _, origin := range []string{"https://evil.test", "https://frontend.test.evil.test", "null"} {
		w := request(t, runtime.Handler, "GET", "/api/identities", "", origin, "")
		if w.Code != 403 || w.Header().Get("Access-Control-Allow-Origin") != "" {
			t.Fatal("origin escaped allowlist", origin)
		}
	}
	for _, headers := range []string{"authorization, content-type", "x-injected"} {
		r := httptest.NewRequest("OPTIONS", "/api/state", nil)
		r.Header.Set("Origin", c.AllowedOrigins[0])
		r.Header.Set("Access-Control-Request-Method", "POST")
		r.Header.Set("Access-Control-Request-Headers", headers)
		w := httptest.NewRecorder()
		runtime.Handler.ServeHTTP(w, r)
		want := 204
		if headers == "x-injected" {
			want = 403
		}
		if w.Code != want {
			t.Fatal("preflight", w.Code)
		}
	}
	w := request(t, runtime.Handler, "POST", "/api/auth/test-login", `{"playerId":"wang"}`, c.AllowedOrigins[0], "")
	var login struct{ Token string }
	_ = json.Unmarshal(w.Body.Bytes(), &login)
	srv := httptest.NewServer(runtime.Handler)
	defer srv.Close()
	req, _ := http.NewRequest("GET", srv.URL+"/api/events?token="+login.Token, nil)
	req.Header.Set("Origin", c.AllowedOrigins[0])
	res, err := srv.Client().Do(req)
	if err != nil {
		t.Fatal(err)
	}
	if res.StatusCode != 200 || res.Header.Get("Access-Control-Allow-Origin") != c.AllowedOrigins[0] || res.Header.Get("Content-Type") != "text/event-stream; charset=utf-8" {
		t.Fatal("SSE headers", res.Header)
	}
	scanner := bufio.NewScanner(res.Body)
	hello := false
	for scanner.Scan() {
		if strings.HasPrefix(scanner.Text(), "data:") {
			hello = strings.Contains(scanner.Text(), `"hello"`)
			break
		}
	}
	res.Body.Close()
	if !hello {
		t.Fatal("missing streaming hello")
	}
	w = request(t, runtime.Handler, "GET", "/api/state", "", c.AllowedOrigins[0], "")
	if w.Code != 401 || w.Header().Get("Access-Control-Allow-Origin") != c.AllowedOrigins[0] {
		t.Fatal("errors lost CORS")
	}
}
func TestCORSConfigurationRejectsWildcardAndDefaultNeedsNoProxyTrust(t *testing.T) {
	for _, origin := range []string{"*", "https://*.test", "https://ok.test/path", "https://u:p@ok.test", "null"} {
		c := config(t)
		c.AllowedOrigins = []string{origin}
		if err := c.Validate(provider()); err == nil {
			t.Fatal("invalid origin", origin)
		}
	}
	c := config(t)
	r, err := New(c, provider())
	if err != nil {
		t.Fatal(err)
	}
	defer r.Close()
	w := request(t, r.Handler, "GET", "/api/identities", "", "https://frontend.internal", "")
	if w.Code != 200 || w.Header().Get("Access-Control-Allow-Origin") != "" {
		t.Fatal("same-origin gateway must not need forwarded-header trust")
	}
}

// A protocol fixture proves the generic browser bridge; no company SSO is used.
type browserFixture struct {
	mu   sync.Mutex
	used bool
}

func (*browserFixture) ID() string { return "company-browser-fixture" }
func (*browserFixture) BeginLogin(ctx context.Context, callback string) (identity.BrowserLogin, error) {
	return identity.BrowserLogin{URL: "https://sso.test/authorize?state=one-use-fixture", State: "one-use-fixture"}, ctx.Err()
}
func (p *browserFixture) Authenticate(ctx context.Context, c identity.Credentials) (identity.User, error) {
	p.mu.Lock()
	defer p.mu.Unlock()
	if p.used || c.Code != "fixture-code" || c.State != "one-use-fixture" {
		return identity.User{}, identity.ErrUnauthorized
	}
	p.used = true
	return identity.User{Subject: "fixture-browser-user", Name: "浏览器联调"}, ctx.Err()
}
func TestBrowserSPIAndFixedCallback(t *testing.T) {
	c := config(t)
	c.LoginCallbackURL = "https://frontend.test/?boss_auth=callback"
	runtime, err := New(c, &browserFixture{})
	if err != nil {
		t.Fatal(err)
	}
	defer runtime.Close()
	w := request(t, runtime.Handler, "GET", "/api/identities", "", "", "")
	if !strings.Contains(w.Body.String(), `"browserLogin":true`) {
		t.Fatal(w.Body.String())
	}
	w = request(t, runtime.Handler, "POST", "/api/auth/browser", "{}", "", "")
	if w.Code != 200 || !strings.Contains(w.Body.String(), "https://sso.test/") {
		t.Fatal(w.Body.String())
	}
	for _, body := range []string{`{"code":"fixture-code","state":"one-use-fixture","redirectUri":"https://evil.test/"}`, `{"code":"fixture-code","redirectUri":"https://frontend.test/?boss_auth=callback"}`} {
		if w = request(t, runtime.Handler, "POST", "/api/auth/login", body, "", ""); w.Code != 400 {
			t.Fatal("bad callback accepted", w.Body.String())
		}
	}
	body := `{"code":"fixture-code","state":"one-use-fixture","redirectUri":"https://frontend.test/?boss_auth=callback"}`
	if w = request(t, runtime.Handler, "POST", "/api/auth/login", body, "", ""); w.Code != 200 {
		t.Fatal(w.Body.String())
	}
	if w = request(t, runtime.Handler, "POST", "/api/auth/login", body, "", ""); w.Code != 401 {
		t.Fatal("replay accepted")
	}
	c.LoginCallbackURL = "https://evil.test/"
	if err := c.Validate(&browserFixture{}); err == nil {
		t.Fatal("missing callback marker accepted")
	}
}
func TestBrowserProviderFailureDoesNotLeak(t *testing.T) {
	c := config(t)
	c.LoginCallbackURL = "https://frontend.test/?boss_auth=callback"
	runtime, err := New(c, badBrowser{})
	if err != nil {
		t.Fatal(err)
	}
	defer runtime.Close()
	w := request(t, runtime.Handler, "POST", "/api/auth/browser", "{}", "", "")
	b, _ := io.ReadAll(w.Result().Body)
	if w.Code != 503 || strings.Contains(string(b), "secret") {
		t.Fatal("provider failure leaked")
	}
}

type badBrowser struct{}

func (badBrowser) ID() string { return "bad-browser" }
func (badBrowser) BeginLogin(context.Context, string) (identity.BrowserLogin, error) {
	return identity.BrowserLogin{}, errors.New("secret upstream credential")
}
func (badBrowser) Authenticate(context.Context, identity.Credentials) (identity.User, error) {
	return identity.User{}, identity.ErrUnauthorized
}

package playercli

import (
	"bytes"
	"context"
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"sync"
	"sync/atomic"
	"testing"
	"time"

	"github.com/1994/boss-works-for-me/backend"
	"github.com/1994/boss-works-for-me/identity"
	"github.com/1994/boss-works-for-me/identity/mock"
)

type fixture struct {
	game   *backend.Game
	app    *backend.App
	server *httptest.Server
	dir    string
	clock  atomic.Int64
}

func setup(t *testing.T, realClock bool) *fixture {
	t.Helper()
	f := &fixture{dir: t.TempDir()}
	f.clock.Store(time.Now().UnixMilli())
	var clock func() int64
	if !realClock {
		clock = f.clock.Load
	}
	g, err := backend.Open(filepath.Join(f.dir, "game.db"), clock)
	if err != nil {
		t.Fatal(err)
	}
	f.game = g
	f.app = backend.NewApp(g, backend.Options{})
	f.server = httptest.NewServer(f.app)
	t.Cleanup(func() { f.app.Close(); f.server.Close(); g.Close() })
	return f
}
func (f *fixture) run(profile string, args ...string) (int, string, string) {
	var out, err bytes.Buffer
	all := append([]string{"--config-dir", f.dir, "--server", f.server.URL, "--profile", profile}, args...)
	code := Run(context.Background(), all, strings.NewReader(""), &out, &err)
	return code, out.String(), err.String()
}
func (f *fixture) ok(t *testing.T, p string, args ...string) any {
	t.Helper()
	code, out, err := f.run(p, args...)
	if code != 0 || err != "" {
		t.Fatalf("%v code=%d out=%s err=%s", args, code, out, err)
	}
	var v any
	if e := json.Unmarshal([]byte(out), &v); e != nil {
		t.Fatal(e, out)
	}
	return v
}
func (f *fixture) errorCode(t *testing.T, p, expected string, args ...string) {
	t.Helper()
	code, out, err := f.run(p, args...)
	var v object
	_ = json.Unmarshal([]byte(err), &v)
	if code == 0 || out != "" || asObject(v["error"])["code"] != expected {
		t.Fatalf("%v: code=%d out=%s err=%s", args, code, out, err)
	}
}
func TestPlayerLoopSameServerRules(t *testing.T) {
	f := setup(t, false)
	login := asObject(f.ok(t, "alpha", "login", "wang"))
	if login["token"] != nil {
		t.Fatal("login leaked token")
	}
	f.ok(t, "beta", "login", "li")
	st, err := os.Stat(filepath.Join(f.dir, "alpha.json"))
	if err != nil || st.Mode().Perm() != 0600 {
		t.Fatal("session must be private", err)
	}
	market := f.ok(t, "alpha", "market").([]any)
	var npc object
	for _, v := range market {
		c := asObject(v)
		if c["selfPlayerId"] == nil && c["ownerId"] == nil {
			npc = c
			break
		}
	}
	if npc == nil {
		t.Fatal("missing single-player NPCs")
	}
	id := str(npc["id"])
	f.ok(t, "alpha", "sign", id, "300")
	f.errorCode(t, "beta", "PRICE_CHANGED", "sign", id, "300")
	trade := asObject(f.ok(t, "beta", "sign", id, "380"))
	if asObject(trade["trade"])["sellerId"] != "wang" {
		t.Fatal(trade)
	}
	s := asObject(f.ok(t, "alpha", "state"))
	if number(asObject(s["me"])["coins"]) != 642 {
		t.Fatal("wrong seller compensation", s["me"])
	}
	f.ok(t, "alpha", "project", "start")
	f.errorCode(t, "alpha", "TOO_EARLY", "project", "finish")
	view, err := f.game.ProjectView("wang")
	if err != nil || view.ActiveRun == nil {
		t.Fatal(err)
	}
	r := *view.ActiveRun
	// Test agent decides whether to press; CLI itself never selects a strategy.
	// Advancing the injected server clock is confined to this test fixture.
	for elapsed := int64(700); elapsed < r.DurationMS; elapsed += 200 {
		f.clock.Store(r.StartedAt + elapsed)
		v := asObject(f.ok(t, "alpha", "project", "view"))
		front := asObject(v["front"])
		if front != nil && front["kind"] != "trap" {
			f.ok(t, "alpha", "project", "hit")
		}
	}
	f.clock.Store(r.Deadline + 1)
	result := asObject(f.ok(t, "alpha", "project", "finish"))
	score := asObject(result["result"])
	if number(score["hits"]) < 6 || number(score["rejected"]) != 0 {
		t.Fatal("game not actually playable", score)
	}
	if number(result["coins"]) != 642+number(score["total"]) {
		t.Fatal("reward mismatch", result)
	}
	f.errorCode(t, "alpha", "ALREADY_CLAIMED", "project", "finish")
	f.ok(t, "alpha", "promote", "0")
	career := asObject(f.ok(t, "alpha", "career"))
	if number(career["rank"]) != 1 {
		t.Fatal(career)
	}
	shop := f.ok(t, "alpha", "shop").([]any)
	item := asObject(shop[0])
	price := int(number(item["price"]))
	f.ok(t, "alpha", "buy", str(item["id"]), strconv.Itoa(price))
	f.ok(t, "alpha", "equip", str(item["id"]), str(item["kind"]), "player")
	f.ok(t, "alpha", "messages-read")
	f.ok(t, "alpha", "logout")
	f.errorCode(t, "alpha", "NOT_LOGGED_IN", "state")
	// Another profile stays signed in, even when the first one logs out.
	f.ok(t, "beta", "observe")
}

type lockedBuffer struct {
	sync.Mutex
	bytes.Buffer
}

func (b *lockedBuffer) Write(p []byte) (int, error) {
	b.Lock()
	defer b.Unlock()
	return b.Buffer.Write(p)
}
func (b *lockedBuffer) String() string { b.Lock(); defer b.Unlock(); return b.Buffer.String() }
func TestWatchPresenceWalkAndHighfive(t *testing.T) {
	f := setup(t, true)
	f.ok(t, "alpha", "login", "wang")
	f.ok(t, "beta", "login", "li")
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()
	var wg sync.WaitGroup
	outputs := []*lockedBuffer{{}, {}}
	for i, p := range []string{"alpha", "beta"} {
		wg.Add(1)
		go func(i int, p string) {
			defer wg.Done()
			var errs bytes.Buffer
			code := Run(ctx, []string{"--config-dir", f.dir, "--server", f.server.URL, "--profile", p, "watch"}, strings.NewReader(""), outputs[i], &errs)
			if code != 0 {
				t.Errorf("watch %s: %s", p, errs.String())
			}
		}(i, p)
	}
	defer func() { cancel(); wg.Wait() }()
	deadline := time.Now().Add(3 * time.Second)
	for len(f.app.Online()) < 2 && time.Now().Before(deadline) {
		time.Sleep(10 * time.Millisecond)
	}
	if len(f.app.Online()) != 2 {
		t.Fatal("watch did not register presence")
	}
	moved := asObject(f.ok(t, "alpha", "walk", "1", "11"))
	p := asObject(moved["player"])
	if number(p["x"]) != 1 || number(p["z"]) != 11 || p["moving"] != false {
		t.Fatal(moved)
	}
	f.ok(t, "alpha", "emote", "wave")
	reward := asObject(f.ok(t, "alpha", "highfive", "li"))
	if number(reward["reward"]) != 15 {
		t.Fatal(reward)
	}
	f.errorCode(t, "beta", "TOO_SOON", "highfive", "wang")
	f.ok(t, "alpha", "focus", "li")
	deadline = time.Now().Add(2 * time.Second)
	for !strings.Contains(outputs[1].String(), "highfive") && time.Now().Before(deadline) {
		time.Sleep(10 * time.Millisecond)
	}
	if !strings.Contains(outputs[1].String(), "highfive") || !strings.Contains(outputs[1].String(), `"type":"world"`) {
		t.Fatal("missing real SSE state", outputs[1].String())
	}
	cancel()
	wg.Wait()
	deadline = time.Now().Add(time.Second)
	for len(f.app.Online()) > 0 && time.Now().Before(deadline) {
		time.Sleep(10 * time.Millisecond)
	}
	if len(f.app.Online()) != 0 {
		t.Fatal("watch left ghost players online")
	}
}
func TestSessionIsolationAndRedirect(t *testing.T) {
	f := setup(t, false)
	f.ok(t, "a", "login", "wang")
	var seenToken atomic.Bool
	other := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		seenToken.Store(r.Header.Get("Authorization") != "")
		w.Header().Set("Content-Type", "application/json")
		io.WriteString(w, `{"ok":true}`)
	}))
	defer other.Close()
	var out, errs bytes.Buffer
	code := Run(context.Background(), []string{"--config-dir", f.dir, "--profile", "a", "--server", other.URL, "health"}, strings.NewReader(""), &out, &errs)
	if code != 0 || seenToken.Load() {
		t.Fatal("cross-server token leak", errs.String())
	}
	redirect := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) { http.Redirect(w, r, other.URL, 302) }))
	defer redirect.Close()
	out.Reset()
	errs.Reset()
	code = Run(context.Background(), []string{"--config-dir", f.dir, "--server", redirect.URL, "health"}, strings.NewReader(""), &out, &errs)
	if code == 0 || !strings.Contains(errs.String(), "HTTP_302") || seenToken.Load() {
		t.Fatal("redirect followed", errs.String())
	}
	f.errorCode(t, "../escape", "BAD_PROFILE", "health")
}
func TestWatchSSEMultilineAndAuthFailure(t *testing.T) {
	// Focus on reconnection/parser behavior without an entire game world.
	var connections atomic.Int32
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Header.Get("Authorization") != "Bearer test-token" {
			t.Error("missing bearer header")
		}
		if r.URL.Query().Get("token") != "" {
			t.Error("token leaked into URL")
		}
		if connections.Add(1) > 1 {
			w.Header().Set("Content-Type", "application/json")
			w.WriteHeader(401)
			io.WriteString(w, `{"error":{"code":"UNAUTHORIZED","message":"expired"}}`)
			return
		}
		w.Header().Set("Content-Type", "text/event-stream")
		io.WriteString(w, "data: {\"type\":\"hello\",\n"+"data: \"ok\":true}\n\n")
	}))
	defer srv.Close()
	dir := t.TempDir()
	if err := atomicJSON(filepath.Join(dir, "a.json"), session{Server: srv.URL, Token: "test-token", PlayerID: "a"}); err != nil {
		t.Fatal(err)
	}
	ctx, cancel := context.WithTimeout(context.Background(), 4*time.Second)
	defer cancel()
	var out, errs bytes.Buffer
	code := Run(ctx, []string{"--config-dir", dir, "--profile", "a", "watch"}, strings.NewReader(""), &out, &errs)
	if code == 0 || connections.Load() != 2 || !strings.Contains(out.String(), `"type":"hello"`) || !strings.Contains(errs.String(), "UNAUTHORIZED") {
		t.Fatal(code, out.String(), errs.String())
	}
}

func TestSPILoginAndSessionImport(t *testing.T) {
	dir := t.TempDir()
	g, err := backend.OpenWithOptions(filepath.Join(dir, "mock.db"), nil, backend.DatabaseOptions{})
	if err != nil {
		t.Fatal(err)
	}
	defer g.Close()
	provider := mock.New(map[string]identity.User{"test-ticket": {Subject: "agent-employee", Name: "测试员工"}})
	app := backend.NewApp(g, backend.Options{IdentityProvider: provider})
	defer app.Close()
	srv := httptest.NewServer(app)
	defer srv.Close()
	invoke := func(profile string, input string, args ...string) (int, string, string) {
		var out, errs bytes.Buffer
		all := append([]string{"--config-dir", dir, "--server", srv.URL, "--profile", profile}, args...)
		code := Run(context.Background(), all, strings.NewReader(input), &out, &errs)
		return code, out.String(), errs.String()
	}
	code, out, errs := invoke("spi", `{"accessToken":"test-ticket"}`, "login", "--stdin")
	if code != 0 || strings.Contains(out, "token") || errs != "" {
		t.Fatal(code, out, errs)
	}
	var s session
	if err = loadJSON(filepath.Join(dir, "spi.json"), &s); err != nil {
		t.Fatal(err)
	}
	input, _ := json.Marshal(object{"token": s.Token})
	code, out, errs = invoke("imported", string(input), "import-session")
	if code != 0 || strings.Contains(out, s.Token) || errs != "" {
		t.Fatal(code, out, errs)
	}
	code, _, errs = invoke("imported", "", "state")
	if code != 0 {
		t.Fatal(errs)
	}
	code, _, errs = invoke("demo", "", "login", "wang")
	if code == 0 || !strings.Contains(errs, "NOT_FOUND") {
		t.Fatal("mock must not fall back to demo", errs)
	}
}

func TestProjectSingleInputAndResume(t *testing.T) {
	f := setup(t, false)
	f.ok(t, "a", "login", "wang")
	f.ok(t, "a", "project", "start")
	v, err := f.game.ProjectView("wang")
	if err != nil {
		t.Fatal(err)
	}
	r := *v.ActiveRun
	// Pin an ordinary game's random seed in this test only so a trap is guaranteed.
	if _, err = f.game.DB.Exec("UPDATE project_runs SET seed=42 WHERE id=?", r.ID); err != nil {
		t.Fatal(err)
	}
	found := false
	for _, task := range backend.GenerateTasks(42, r.DurationMS) {
		if task.Kind != "trap" {
			continue
		}
		f.clock.Store(r.StartedAt + task.SpawnAt + task.TTL*8/10)
		view := asObject(f.ok(t, "a", "project", "view"))
		front := asObject(view["front"])
		if front == nil || front["kind"] != "trap" {
			continue
		}
		caught := asObject(f.ok(t, "a", "project", "hit"))
		if asObject(caught["caught"])["kind"] != "trap" {
			t.Fatal("hit skipped trap", caught)
		}
		found = true
		break
	}
	if !found {
		t.Fatal("no trap scenario exercised")
	}
	resumed := asObject(f.ok(t, "a", "project", "start"))
	if resumed["runId"] != r.ID || number(resumed["recordedHits"]) != 1 {
		t.Fatal("resume lost actions", resumed)
	}
	f.errorCode(t, "a", "USAGE", "project", "hit", "1")
}

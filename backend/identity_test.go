package backend

import (
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"net/http/httptest"
	"path/filepath"
	"strings"
	"sync"
	"testing"

	"github.com/1994/boss-works-for-me/identity"
	identitymock "github.com/1994/boss-works-for-me/identity/mock"
)

func setupIdentity(t *testing.T, p identity.Provider) *testEnv {
	t.Helper()
	e := setup(t)
	a := NewApp(e.g, Options{IdentityProvider: p, AllowReset: true})
	s := httptest.NewServer(a)
	t.Cleanup(func() { a.Close(); s.Close() })
	return &testEnv{e.g, a, s, e.clock}
}

func identityResult(t *testing.T, e *testEnv, token string) (string, string) {
	t.Helper()
	status, body := e.call(t, "/api/auth/login", "", map[string]string{"accessToken": token, "playerId": "wang"})
	assertCode(t, status, body, 200, "")
	var session, player string
	json.Unmarshal(body["token"], &session)
	json.Unmarshal(body["playerId"], &player)
	if session == "" || player == "" {
		t.Fatal("missing session/player")
	}
	return session, player
}

func TestIdentitySPIProvisioningAndProfile(t *testing.T) {
	avatar := "/avatars/alice.png"
	u := identity.User{Subject: "immutable-123", Name: "小艾", Title: "部门经理", AvatarURL: &avatar}
	p := identity.ProviderFunc{ProviderID: "company-tenant", Verify: func(ctx context.Context, c identity.Credentials) (identity.User, error) {
		if c.AccessToken != "verified-token" || c.PlayerID != "wang" {
			return identity.User{}, identity.ErrUnauthorized
		}
		if _, ok := ctx.Deadline(); !ok {
			t.Error("adapter missing timeout")
		}
		return u, nil
	}}
	e := setupIdentity(t, p)
	token, player := identityResult(t, e, "verified-token")
	if player == "wang" || player == u.Subject {
		t.Fatal("client or upstream ID was treated as game ID")
	}
	status, _ := e.call(t, "/api/state", token, nil)
	if status != 200 {
		t.Fatal("provider session rejected")
	}
	snap := e.snapshot(t, player)
	if snap.Me.Coins != StartCoins || snap.Me.Name != u.Name || snap.Me.AvatarURL != avatar || snap.Career.Rank != 0 || snap.Me.AvatarColleagueID == nil {
		t.Fatalf("bad first identity: %+v", snap.Me)
	}
	cloneID := *snap.Me.AvatarColleagueID
	// Real-world title grants neither higher game rank nor higher clone skills.
	var clone Colleague
	for _, c := range snap.Colleagues {
		if c.ID == cloneID {
			clone = c
		}
	}
	if clone.Skill.Kind != "income" || clone.Skill.Value != 10 {
		t.Fatalf("SSO title altered balance: %+v", clone)
	}
	if err := e.g.BuyItem(player, "glasses", 80); err != nil {
		t.Fatal(err)
	}
	if _, err := e.g.Sign("wang", cloneID, clone.Price); err != nil {
		t.Fatal(err)
	}
	if _, err := e.g.DB.Exec("UPDATE player_careers SET performance=42 WHERE player_id=?", player); err != nil {
		t.Fatal(err)
	}
	u.Name, u.Title, u.AvatarURL = "小艾改名", "快乐体验官", nil
	_, again := identityResult(t, e, "verified-token")
	snap = e.snapshot(t, again)
	if again != player || snap.Me.Coins != StartCoins-80+15 || snap.Career.Performance != 42 || snap.Me.Name != u.Name || snap.Me.AvatarURL != avatar || *snap.Me.AvatarColleagueID != cloneID {
		t.Fatalf("re-login reset identity or state: %+v", snap.Me)
	}
	for _, c := range snap.Colleagues {
		if c.ID == cloneID && (!same(c.OwnerID, "wang") || c.Trades != 1 || c.Name != u.Name || c.Look.AvatarURL != avatar) {
			t.Fatal("profile refresh changed clone ownership/history", c)
		}
	}
	clear := ""
	u.AvatarURL = &clear
	identityResult(t, e, "verified-token")
	if e.snapshot(t, player).Me.AvatarURL != "" {
		t.Fatal("explicit avatar clearing ignored")
	}
	var grants int
	e.g.DB.QueryRow("SELECT COUNT(*) FROM ledger WHERE account=? AND reason='new_player'", "player:"+player).Scan(&grants)
	if grants != 1 {
		t.Fatalf("initial grant count=%d", grants)
	}
	checkAudit(t, e.g)
}

func TestIdentitySPIIsolation(t *testing.T) {
	e := setupIdentity(t, identitymock.New(map[string]identity.User{"good": {Subject: "wang", Name: "外部老王"}}))
	_, player := identityResult(t, e, "good")
	legacy, err := e.g.Login("wang")
	if err != nil {
		t.Fatal(err)
	}
	status, body := e.call(t, "/api/state", legacy, nil)
	assertCode(t, status, body, 401, "BAD_SESSION")
	status, body = e.call(t, "/api/auth/test-login", "", map[string]string{"playerId": "wang"})
	assertCode(t, status, body, 404, "NOT_FOUND")
	status, body = e.call(t, "/api/auth/login", "", map[string]string{"playerId": player})
	assertCode(t, status, body, 401, "IDENTITY_REJECTED")
	status, body = e.call(t, "/api/demo/reset", "", map[string]string{})
	assertCode(t, status, body, 403, "FORBIDDEN")
	status, body = e.call(t, "/api/identities", "", nil)
	assertCode(t, status, body, 200, "")
	if string(body["identities"]) != "[]" {
		t.Fatal("SSO leaked selectable identities")
	}
	other := NewApp(e.g, Options{IdentityProvider: identity.ProviderFunc{ProviderID: "other-tenant", Verify: func(context.Context, identity.Credentials) (identity.User, error) {
		return identity.User{Subject: "wang", Name: "另一个老王"}, nil
	}}})
	s := httptest.NewServer(other)
	defer s.Close()
	defer other.Close()
	otherEnv := &testEnv{e.g, other, s, e.clock}
	otherToken, otherPlayer := identityResult(t, otherEnv, "any")
	if otherPlayer == player {
		t.Fatal("subjects collided across providers")
	}
	status, body = e.call(t, "/api/events", otherToken, nil)
	assertCode(t, status, body, 401, "BAD_SESSION")
	status, body = e.call(t, "/api/state", otherToken, nil)
	assertCode(t, status, body, 401, "BAD_SESSION")
	status, body = e.call(t, "/api/events?token="+otherToken, "", nil)
	assertCode(t, status, body, 401, "BAD_SESSION")
	status, body = otherEnv.call(t, "/api/logout", otherToken, map[string]string{})
	assertCode(t, status, body, 200, "")
	status, body = otherEnv.call(t, "/api/state", otherToken, nil)
	assertCode(t, status, body, 401, "BAD_SESSION")
}

func TestIdentitySPIDemoCompatibility(t *testing.T) {
	e := setup(t)
	status, body := e.call(t, "/api/auth/login", "", map[string]string{"playerId": "wang"})
	assertCode(t, status, body, 200, "")
	var token, player string
	json.Unmarshal(body["token"], &token)
	json.Unmarshal(body["playerId"], &player)
	if player != "wang" {
		t.Fatal("Demo account was replaced")
	}
	status, body = e.call(t, "/api/state", token, nil)
	assertCode(t, status, body, 200, "")
	e.login(t, "wang") // Original endpoint remains compatible.
	if e.snapshot(t, "wang").Me.Coins != StartCoins {
		t.Fatal("Demo re-login reset balance")
	}
	status, body = e.call(t, "/api/auth/login", "", map[string]string{"playerId": "made-up"})
	assertCode(t, status, body, 401, "IDENTITY_REJECTED")
	checkAudit(t, e.g)
}

func TestIdentitySPIFailClosed(t *testing.T) {
	badAvatar := "javascript:alert(1)"
	for _, tc := range []struct {
		name   string
		u      identity.User
		err    error
		status int
		code   string
	}{
		{"rejected", identity.User{}, identity.ErrUnauthorized, 401, "IDENTITY_REJECTED"},
		{"outage", identity.User{}, errors.New("secret-upstream-token"), 503, "IDENTITY_UNAVAILABLE"},
		{"missing subject", identity.User{Name: "员工"}, nil, 503, "IDENTITY_PROFILE_INVALID"},
		{"bad avatar", identity.User{Subject: "123", Name: "员工", AvatarURL: &badAvatar}, nil, 503, "IDENTITY_PROFILE_INVALID"},
		{"control name", identity.User{Subject: "123", Name: "员工\n"}, nil, 503, "IDENTITY_PROFILE_INVALID"},
	} {
		t.Run(tc.name, func(t *testing.T) {
			e := setupIdentity(t, identity.ProviderFunc{ProviderID: "test", Verify: func(context.Context, identity.Credentials) (identity.User, error) { return tc.u, tc.err }})
			status, body := e.call(t, "/api/auth/login", "", map[string]string{"accessToken": "bad"})
			assertCode(t, status, body, tc.status, tc.code)
			if strings.Contains(string(body["error"]), "secret-upstream-token") {
				t.Fatal("upstream credential leaked")
			}
			var sessions, players int
			e.g.DB.QueryRow("SELECT COUNT(*) FROM sessions").Scan(&sessions)
			e.g.DB.QueryRow("SELECT COUNT(*) FROM players").Scan(&players)
			if sessions != 0 || players != 4 {
				t.Fatal("failed login mutated accounts or sessions")
			}
		})
	}
}

func TestIdentitySPICancellation(t *testing.T) {
	started := make(chan struct{})
	e := setupIdentity(t, identity.ProviderFunc{ProviderID: "cancel", Verify: func(ctx context.Context, _ identity.Credentials) (identity.User, error) {
		close(started)
		<-ctx.Done()
		return identity.User{Subject: "123", Name: "员工"}, ctx.Err()
	}})
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()
	r := httptest.NewRequest(http.MethodPost, "/api/auth/login", strings.NewReader(`{"code":"once"}`)).WithContext(ctx)
	w := httptest.NewRecorder()
	done := make(chan struct{})
	go func() { defer close(done); e.app.ServeHTTP(w, r) }()
	<-started
	cancel()
	<-done
	if w.Code != 503 {
		t.Fatalf("canceled status=%d", w.Code)
	}
	var count int
	e.g.DB.QueryRow("SELECT COUNT(*) FROM sessions").Scan(&count)
	if count != 0 {
		t.Fatal("canceled request issued session")
	}
}

func TestIdentitySPIConcurrentDatabases(t *testing.T) {
	path := filepath.Join(t.TempDir(), "shared.db")
	first, err := Open(path, nil)
	if err != nil {
		t.Fatal(err)
	}
	defer first.Close()
	second, err := Open(path, nil)
	if err != nil {
		t.Fatal(err)
	}
	defer second.Close()
	type result struct {
		player string
		err    error
	}
	results := make(chan result, 12)
	var wg sync.WaitGroup
	for i := range 12 {
		g := []*Game{first, second}[i%2]
		wg.Go(func() {
			_, player, err := g.loginIdentity(context.Background(), "company", identity.User{Subject: "one", Name: "员工"})
			results <- result{player, err}
		})
	}
	wg.Wait()
	close(results)
	player := ""
	for r := range results {
		if r.err != nil {
			t.Fatal(r.err)
		}
		if player != "" && r.player != player {
			t.Fatal("duplicate across DB connections")
		}
		player = r.player
	}
	var count int
	if err := first.DB.QueryRow("SELECT COUNT(*) FROM identity_bindings WHERE provider='company'").Scan(&count); err != nil || count != 1 {
		t.Fatal("binding count", count, err)
	}
	checkAudit(t, first)
}

func TestIdentitySPIConcurrentFirstLogin(t *testing.T) {
	e := setupIdentity(t, identitymock.New(map[string]identity.User{"good": {Subject: "same-employee", Name: "员工"}}))
	var wg sync.WaitGroup
	players := make(chan string, 12)
	for range 12 {
		wg.Go(func() {
			_, player := identityResult(t, e, "good")
			players <- player
		})
	}
	wg.Wait()
	close(players)
	first := ""
	for player := range players {
		if first != "" && first != player {
			t.Fatal("concurrent login created duplicate players")
		}
		first = player
	}
	var count, total int
	e.g.DB.QueryRow("SELECT COUNT(*),COALESCE(SUM(delta),0) FROM ledger WHERE account=? AND reason='new_player'", "player:"+first).Scan(&count, &total)
	if count != 1 || total != StartCoins {
		t.Fatalf("concurrent grant count=%d total=%d", count, total)
	}
	checkAudit(t, e.g)
}

func TestIdentitySPIRollback(t *testing.T) {
	e := setupIdentity(t, identitymock.New(map[string]identity.User{"good": {Subject: "new", Name: "员工"}}))
	_, err := e.g.DB.Exec(`CREATE TRIGGER fail_identity_session BEFORE INSERT ON identity_sessions BEGIN SELECT RAISE(ABORT,'injected failure'); END`)
	if err != nil {
		t.Fatal(err)
	}
	status, body := e.call(t, "/api/auth/login", "", map[string]string{"accessToken": "good"})
	assertCode(t, status, body, 500, "INTERNAL")
	for _, table := range []string{"sessions", "identity_sessions"} {
		var n int
		e.g.DB.QueryRow("SELECT COUNT(*) FROM " + table).Scan(&n)
		if n != 0 {
			t.Fatal("partial session persisted")
		}
	}
	var players int
	e.g.DB.QueryRow("SELECT COUNT(*) FROM players").Scan(&players)
	if players != 4 {
		t.Fatal("failed transaction left player")
	}
	checkAudit(t, e.g)
}

func TestIdentitySPIPersistenceAndLegacyMigration(t *testing.T) {
	path := filepath.Join(t.TempDir(), "old.db")
	g, err := Open(path, nil)
	if err != nil {
		t.Fatal(err)
	}
	legacy, err := g.Login("wang")
	if err != nil {
		t.Fatal(err)
	}
	// Simulate a pre-SPI DB, then reopen without touching balances/progression.
	_, err = g.DB.Exec("DROP TABLE identity_sessions; DROP TABLE identity_bindings; UPDATE players SET coins=701 WHERE id='wang'")
	if err != nil {
		t.Fatal(err)
	}
	g.Close()
	g, err = Open(path, nil)
	if err != nil {
		t.Fatal(err)
	}
	defer g.Close()
	if player, err := g.authProvider(legacy, "demo"); err != nil || player != "wang" {
		t.Fatal("legacy Demo session lost", err)
	}
	if _, err := g.authProvider(legacy, "company"); err == nil {
		t.Fatal("legacy token accepted by SSO")
	}
	u := identity.User{Subject: "employee", Name: "员工"}
	_, player, err := g.loginIdentity(context.Background(), "company", u)
	if err != nil {
		t.Fatal(err)
	}
	g.Close()
	g, err = Open(path, nil)
	if err != nil {
		t.Fatal(err)
	}
	defer g.Close()
	_, again, err := g.loginIdentity(context.Background(), "company", u)
	if err != nil || again != player {
		t.Fatal("binding did not survive restart", err)
	}
	var coins int
	g.DB.QueryRow("SELECT coins FROM players WHERE id='wang'").Scan(&coins)
	if coins != 701 {
		t.Fatal("migration reset balance")
	}
}

func TestIdentitySPIReservedProvider(t *testing.T) {
	e := setupIdentity(t, identity.ProviderFunc{ProviderID: "demo"})
	token, err := e.g.Login("wang")
	if err != nil {
		t.Fatal(err)
	}
	status, body := e.call(t, "/api/state", token, nil)
	assertCode(t, status, body, 503, "IDENTITY_UNAVAILABLE")
}

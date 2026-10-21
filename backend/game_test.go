package backend

import (
	"bufio"
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"reflect"
	"strings"
	"sync"
	"sync/atomic"
	"testing"
	"time"
)

type testEnv struct {
	g      *Game
	app    *App
	server *httptest.Server
	clock  *atomic.Int64
}

func setup(t *testing.T) *testEnv {
	t.Helper()
	clock := &atomic.Int64{}
	clock.Store(1800000000000)
	g, err := Open(filepath.Join(t.TempDir(), "test.db"), clock.Load)
	if err != nil {
		t.Fatal(err)
	}
	a := NewApp(g, Options{AllowReset: true})
	s := httptest.NewServer(a)
	e := &testEnv{g, a, s, clock}
	t.Cleanup(func() { a.Close(); s.Close(); g.Close() })
	return e
}
func (e *testEnv) call(t *testing.T, path, token string, body any) (int, map[string]json.RawMessage) {
	t.Helper()
	method := "GET"
	var reader io.Reader
	if body != nil {
		method = "POST"
		b, _ := json.Marshal(body)
		reader = bytes.NewReader(b)
	}
	req, _ := http.NewRequest(method, e.server.URL+path, reader)
	if token != "" {
		req.Header.Set("Authorization", "Bearer "+token)
	}
	req.Header.Set("Content-Type", "application/json")
	r, err := http.DefaultClient.Do(req)
	if err != nil {
		t.Fatal(err)
	}
	defer r.Body.Close()
	var out map[string]json.RawMessage
	if err = json.NewDecoder(r.Body).Decode(&out); err != nil {
		t.Fatal(err)
	}
	return r.StatusCode, out
}
func (e *testEnv) login(t *testing.T, id string) string {
	t.Helper()
	status, out := e.call(t, "/api/auth/test-login", "", map[string]string{"playerId": id})
	if status != 200 {
		t.Fatalf("login %d %s", status, out)
	}
	var token string
	json.Unmarshal(out["token"], &token)
	return token
}
func (e *testEnv) snapshot(t *testing.T, id string) Snapshot {
	t.Helper()
	s, err := e.g.Snapshot(id, e.app.Online())
	if err != nil {
		t.Fatal(err)
	}
	return s
}
func assertCode(t *testing.T, status int, body map[string]json.RawMessage, want int, code string) {
	t.Helper()
	if status != want {
		t.Fatalf("status=%d want=%d body=%s", status, want, body)
	}
	if code != "" {
		var e GameError
		json.Unmarshal(body["error"], &e)
		if e.Code != code {
			t.Fatalf("code=%s want=%s", e.Code, code)
		}
	}
}
func checkAudit(t *testing.T, g *Game) {
	t.Helper()
	a, err := g.Audit()
	if err != nil {
		t.Fatal(err)
	}
	if len(a.Mismatches) != 0 || a.DoubleOwned != 0 || a.Negative != 0 || a.Overfull != 0 {
		t.Fatalf("audit: %+v", a)
	}
}
func TestIdentityAndAuth(t *testing.T) {
	e := setup(t)
	status, ids := e.call(t, "/api/identities", "", nil)
	assertCode(t, status, ids, 200, "")
	if !bytes.Contains(ids["notice"], []byte("非真实 SSO")) {
		t.Fatal("missing demo notice")
	}
	var identities []Identity
	json.Unmarshal(ids["identities"], &identities)
	if len(identities) != 4 {
		t.Fatal(identities)
	}
	for _, id := range identities {
		if id.AvatarColleagueID == nil {
			t.Fatal("missing avatar")
		}
		token := e.login(t, id.ID)
		s, body := e.call(t, "/api/state", token, nil)
		assertCode(t, s, body, 200, "")
		var me Player
		json.Unmarshal(body["me"], &me)
		if me.Coins != 600 || me.ID != id.ID {
			t.Fatal(me)
		}
	}
	status, body := e.call(t, "/api/state", "fake", nil)
	assertCode(t, status, body, 401, "BAD_SESSION")
}
func TestSignPoachDividendsAndLeaderboard(t *testing.T) {
	e := setup(t)
	a := e.login(t, "wang")
	b := e.login(t, "li")
	status, body := e.call(t, "/api/colleagues/c-mei/sign", a, map[string]any{"expectedPrice": 300})
	assertCode(t, status, body, 200, "")
	if e.snapshot(t, "wang").Me.Coins != 300 || e.snapshot(t, "mei").Me.Coins != 615 {
		t.Fatal("initial split")
	}
	status, body = e.call(t, "/api/colleagues/c-mei/sign", b, map[string]any{"expectedPrice": 380})
	assertCode(t, status, body, 200, "")
	var trade Trade
	json.Unmarshal(body["trade"], &trade)
	if trade.OwnerShare != 342 || trade.SelfShare != 19 || trade.SystemShare != 19 {
		t.Fatal(trade)
	}
	aState := e.snapshot(t, "wang")
	if aState.Me.Coins != 642 || aState.Me.TeamSize != 0 || e.snapshot(t, "li").Me.Coins != 220 || e.snapshot(t, "mei").Me.Coins != 634 {
		t.Fatal("incorrect balances")
	}
	if aState.Players[0].ID != "wang" {
		t.Fatal("leaderboard")
	}
	checkAudit(t, e.g)
}
func TestPriceValidation(t *testing.T) {
	e := setup(t)
	token := e.login(t, "wang")
	for _, price := range []any{nil, "300", 0, -1, 300.2, 9007199254740992} {
		s, b := e.call(t, "/api/colleagues/c-zhang/sign", token, map[string]any{"expectedPrice": price})
		assertCode(t, s, b, 400, "BAD_PRICE")
	}
	s, b := e.call(t, "/api/colleagues/c-zhang/sign", token, map[string]any{})
	assertCode(t, s, b, 400, "BAD_PRICE")
	if e.snapshot(t, "wang").Me.Coins != 600 {
		t.Fatal("invalid price changed balance")
	}
}
func TestTeamLimitsAndSelf(t *testing.T) {
	e := setup(t)
	if _, err := e.g.Sign("wang", "c-wang", 300); err == nil {
		t.Fatal("signed own avatar")
	}
	for _, id := range []string{"c-zhang", "c-lily"} {
		if _, err := e.g.Sign("wang", id, 300); err != nil {
			t.Fatal(err)
		}
	}
	if _, err := e.g.Sign("wang", "c-qiang", 300); err == nil {
		t.Fatal("negative balance")
	}
	if _, err := e.g.DB.Exec("UPDATE players SET coins=1000 WHERE id='wang'; INSERT INTO ledger(account,delta,reason,created_at) VALUES('player:wang',1000,'test_grant',0)"); err != nil {
		t.Fatal(err)
	}
	if _, err := e.g.Sign("wang", "c-qiang", 300); err != nil {
		t.Fatal(err)
	}
	if _, err := e.g.Sign("wang", "c-sakura", 300); err == nil {
		t.Fatal("fourth active teammate")
	}
	if got := e.snapshot(t, "wang").TeamSkills; got != (Skills{25, 3, 2}) {
		t.Fatal(got)
	}
	checkAudit(t, e.g)
}
func TestConcurrentQuotedPurchases(t *testing.T) {
	e := setup(t)
	var success atomic.Int64
	var wg sync.WaitGroup
	for i := 0; i < 40; i++ {
		wg.Add(1)
		go func(i int) {
			defer wg.Done()
			_, err := e.g.Sign([]string{"wang", "li", "mei", "liu"}[i%4], "c-zhang", 300)
			if err == nil {
				success.Add(1)
			}
		}(i)
	}
	wg.Wait()
	if success.Load() != 1 {
		t.Fatal("successes", success.Load())
	}
	checkAudit(t, e.g)
}
func TestConcurrentSpending(t *testing.T) {
	e := setup(t)
	var n atomic.Int64
	var wg sync.WaitGroup
	for _, id := range []string{"c-zhang", "c-lily", "c-qiang", "c-sakura"} {
		wg.Add(1)
		go func(id string) {
			defer wg.Done()
			if _, err := e.g.Sign("wang", id, 300); err == nil {
				n.Add(1)
			}
		}(id)
	}
	wg.Wait()
	if n.Load() != 2 || e.snapshot(t, "wang").Me.Coins != 0 {
		t.Fatal("double spend")
	}
	checkAudit(t, e.g)
}
func TestSeparateConnectionsCompete(t *testing.T) {
	clock := func() int64 { return 1800000000000 }
	path := filepath.Join(t.TempDir(), "race.db")
	a, err := Open(path, clock)
	if err != nil {
		t.Fatal(err)
	}
	defer a.Close()
	b, err := Open(path, clock)
	if err != nil {
		t.Fatal(err)
	}
	defer b.Close()
	gate := make(chan struct{})
	errs := make(chan error, 2)
	for i, g := range []*Game{a, b} {
		go func(g *Game, id string) { <-gate; _, err := g.Sign(id, "c-zhang", 300); errs <- err }(g, []string{"wang", "li"}[i])
	}
	close(gate)
	ok := 0
	for i := 0; i < 2; i++ {
		if <-errs == nil {
			ok++
		}
	}
	if ok != 1 {
		t.Fatal("multiple connections committed", ok)
	}
	checkAudit(t, a)
}
func TestTransactionRollback(t *testing.T) {
	e := setup(t)
	_, err := e.g.DB.Exec("CREATE TRIGGER fail_trade BEFORE INSERT ON trades BEGIN SELECT RAISE(ABORT,'injected failure'); END")
	if err != nil {
		t.Fatal(err)
	}
	if _, err = e.g.Sign("wang", "c-mei", 300); err == nil {
		t.Fatal("expected failure")
	}
	if e.snapshot(t, "wang").Me.Coins != 600 || e.snapshot(t, "mei").Me.Coins != 600 || e.snapshot(t, "wang").Me.TeamSize != 0 {
		t.Fatal("partial transaction persisted")
	}
	checkAudit(t, e.g)
}
func TestProjectTimingAndReplay(t *testing.T) {
	e := setup(t)
	token := e.login(t, "wang")
	status, body := e.call(t, "/api/project/start", token, map[string]any{})
	assertCode(t, status, body, 200, "")
	var r Run
	json.Unmarshal(body["run"], &r)
	if r.DurationMS != 15000 {
		t.Fatal(r)
	}
	sameRun, err := e.g.StartProject("wang")
	if err != nil || sameRun.ID != r.ID {
		t.Fatal("seed reroll")
	}
	_, err = e.g.FinishProject("wang", r.ID, []Action{})
	if ge, ok := err.(*GameError); !ok || ge.Code != "TOO_EARLY" {
		t.Fatal(err)
	}
	e.clock.Add(15000)
	actions := []Action{}
	for _, task := range GenerateTasks(r.Seed, r.DurationMS) {
		if task.Kind != "trap" {
			actions = append(actions, Action{task.ID, float64(task.SpawnAt + 250)})
		}
	}
	actions = append(actions, Action{999, 100}, actions[0])
	status, body = e.call(t, "/api/project/finish", token, map[string]any{"runId": r.ID, "actions": actions, "reward": 999999})
	assertCode(t, status, body, 200, "")
	var result ProjectResult
	json.Unmarshal(body["result"], &result)
	if result.Rejected != 2 || result.Total <= 0 || e.snapshot(t, "wang").Me.Coins != 600+result.Total {
		t.Fatal(result)
	}
	status, body = e.call(t, "/api/project/finish", token, map[string]any{"runId": r.ID, "actions": actions})
	assertCode(t, status, body, 409, "ALREADY_CLAIMED")
	checkAudit(t, e.g)
}
func TestExpiredRunPersists(t *testing.T) {
	e := setup(t)
	r, _ := e.g.StartProject("wang")
	e.clock.Add(45001)
	_, err := e.g.FinishProject("wang", r.ID, []Action{})
	if ge, ok := err.(*GameError); !ok || ge.Code != "EXPIRED" {
		t.Fatal(err)
	}
	var status string
	if err = e.g.DB.QueryRow("SELECT status FROM project_runs WHERE id=?", r.ID).Scan(&status); err != nil || status != "expired" {
		t.Fatal(status, err)
	}
	if e.snapshot(t, "wang").Me.Coins != 600 {
		t.Fatal("expired payout")
	}
	if _, err = e.g.StartProject("wang"); err != nil {
		t.Fatal("cannot start after expiry", err)
	}
}
func TestProjectConcurrentClaimsAndSkillSnapshot(t *testing.T) {
	e := setup(t)
	if _, err := e.g.Sign("wang", "c-zhang", 300); err != nil {
		t.Fatal(err)
	}
	r, _ := e.g.StartProject("wang")
	if r.Skills.IncomePct != 25 {
		t.Fatal(r)
	}
	if _, err := e.g.Sign("li", "c-zhang", 380); err != nil {
		t.Fatal(err)
	}
	e.clock.Add(15000)
	actions := []Action{}
	for _, task := range GenerateTasks(r.Seed, r.DurationMS) {
		if task.Kind != "trap" {
			actions = append(actions, Action{task.ID, float64(task.SpawnAt + 300)})
		}
	}
	var n atomic.Int64
	var wg sync.WaitGroup
	for i := 0; i < 10; i++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			out, err := e.g.FinishProject("wang", r.ID, actions)
			if err == nil {
				n.Add(1)
				if out.Result.Total != out.Result.BasePoints*125/100 {
					t.Error("skill snapshot changed")
				}
			}
		}()
	}
	wg.Wait()
	if n.Load() != 1 {
		t.Fatal("reward replay", n.Load())
	}
	checkAudit(t, e.g)
}
func TestPersistence(t *testing.T) {
	path := filepath.Join(t.TempDir(), "persist.db")
	g, err := Open(path, nil)
	if err != nil {
		t.Fatal(err)
	}
	token, _ := g.Login("wang")
	if _, err = g.Sign("wang", "c-mei", 300); err != nil {
		t.Fatal(err)
	}
	g.Close()
	g, err = Open(path, nil)
	if err != nil {
		t.Fatal(err)
	}
	defer g.Close()
	id, err := g.Auth(token)
	if err != nil || id != "wang" {
		t.Fatal(id, err)
	}
	s, err := g.Snapshot("wang", nil)
	if err != nil || s.Me.Coins != 300 || s.Me.TeamSize != 1 || len(s.Messages) < 2 {
		t.Fatal(s, err)
	}
	checkAudit(t, g)
}
func TestSSEAndLogout(t *testing.T) {
	e := setup(t)
	token := e.login(t, "wang")
	req, _ := http.NewRequest("GET", e.server.URL+"/api/events?token="+token, nil)
	res, err := http.DefaultClient.Do(req)
	if err != nil {
		t.Fatal(err)
	}
	defer res.Body.Close()
	scanner := bufio.NewScanner(res.Body)
	got := make(chan Trade, 1)
	done := make(chan struct{})
	go func() {
		defer close(done)
		for scanner.Scan() {
			line := scanner.Text()
			if strings.HasPrefix(line, "data: ") {
				var msg struct {
					Event Trade `json:"event"`
				}
				if json.Unmarshal([]byte(strings.TrimPrefix(line, "data: ")), &msg) == nil && msg.Event.Kind == "trade" {
					got <- msg.Event
				}
			}
		}
	}()
	buyer := e.login(t, "li")
	start := time.Now()
	s, b := e.call(t, "/api/colleagues/c-mei/sign", buyer, map[string]int{"expectedPrice": 300})
	assertCode(t, s, b, 200, "")
	select {
	case ev := <-got:
		if ev.BuyerID != "li" || time.Since(start) > 3*time.Second {
			t.Fatal(ev)
		}
	case <-time.After(3 * time.Second):
		t.Fatal("SSE late")
	}
	s, b = e.call(t, "/api/logout", token, map[string]any{})
	assertCode(t, s, b, 200, "")
	select {
	case <-done:
	case <-time.After(time.Second):
		t.Fatal("logout left SSE open")
	}
	s, b = e.call(t, "/api/state", token, nil)
	assertCode(t, s, b, 401, "BAD_SESSION")
}
func TestStaticBoundary(t *testing.T) {
	e := setup(t)
	dir := t.TempDir()
	root := filepath.Join(dir, "public")
	other := filepath.Join(dir, "public-private")
	os.MkdirAll(root, 0755)
	os.MkdirAll(other, 0755)
	os.WriteFile(filepath.Join(root, "index.html"), []byte("office"), 0644)
	os.WriteFile(filepath.Join(other, "secret.txt"), []byte("MUST_NOT_LEAK"), 0644)
	os.Symlink(filepath.Join(other, "secret.txt"), filepath.Join(root, "leak.txt"))
	e.app.Options.StaticDir = root
	for _, path := range []string{"/..%2fpublic-private%2fsecret.txt", "/leak.txt"} {
		r, err := http.Get(e.server.URL + path)
		if err != nil {
			t.Fatal(err)
		}
		b, _ := io.ReadAll(r.Body)
		r.Body.Close()
		if r.StatusCode != 404 || bytes.Contains(b, []byte("MUST_NOT_LEAK")) {
			t.Fatal(path, r.StatusCode, string(b))
		}
	}
	r, _ := http.Get(e.server.URL + "/")
	r.Body.Close()
	if r.StatusCode != 200 {
		t.Fatal(r.StatusCode)
	}
}
func TestRulesContract(t *testing.T) {
	data, err := os.ReadFile("../contracts/rules-contract.json")
	if err != nil {
		t.Fatal(err)
	}
	var cases []struct {
		Seed       uint32        `json:"seed"`
		DurationMS int64         `json:"durationMs"`
		Skills     Skills        `json:"skills"`
		Tasks      []Task        `json:"tasks"`
		Actions    []Action      `json:"actions"`
		Result     ProjectResult `json:"result"`
	}
	if err = json.Unmarshal(data, &cases); err != nil {
		t.Fatal(err)
	}
	for i, c := range cases {
		t.Run(fmt.Sprint(i), func(t *testing.T) {
			tasks := GenerateTasks(c.Seed, c.DurationMS)
			if !reflect.DeepEqual(tasks, c.Tasks) {
				t.Fatal("frontend/server task mismatch")
			}
			got := ScoreProject(tasks, c.Actions, c.Skills, c.DurationMS, c.DurationMS)
			if got != c.Result {
				t.Fatalf("server %+v frontend %+v", got, c.Result)
			}
		})
	}
}
func TestPriceAndConservation(t *testing.T) {
	p := 300
	for _, want := range []int{380, 480, 600, 750, 940, 1180} {
		p = NextPrice(p)
		if p != want {
			t.Fatal(p, want)
		}
	}
	for p := 300; p < 10000; p += 10 {
		for _, owner := range []bool{false, true} {
			a, b, c := Shares(p, owner)
			if a+b+c != p || b != p*5/100 {
				t.Fatal("money not conserved")
			}
		}
	}
}

func TestAllSkillsAndCrossPlayerRun(t *testing.T) {
	e := setup(t)
	if _, err := e.g.DB.Exec("UPDATE players SET coins=1600 WHERE id='wang'; INSERT INTO ledger(account,delta,reason,created_at) VALUES('player:wang',1000,'test_grant',0)"); err != nil {
		t.Fatal(err)
	}
	for _, id := range []string{"c-zhang", "c-lily", "c-qiang"} {
		if _, err := e.g.Sign("wang", id, 300); err != nil {
			t.Fatal(err)
		}
	}
	r, err := e.g.StartProject("wang")
	if err != nil || r.DurationMS != 18000 || r.Skills != (Skills{25, 3, 2}) {
		t.Fatal(r, err)
	}
	e.clock.Add(18000)
	if _, err = e.g.FinishProject("li", r.ID, []Action{}); err == nil {
		t.Fatal("cross-player claim")
	}
	actions := []Action{}
	good := 0
	for _, task := range GenerateTasks(r.Seed, r.DurationMS) {
		if task.Kind != "trap" {
			good++
			if good != 4 && good != 8 {
				actions = append(actions, Action{task.ID, float64(task.SpawnAt + 250)})
			}
		}
	}
	out, err := e.g.FinishProject("wang", r.ID, actions)
	if err != nil {
		t.Fatal(err)
	}
	if out.Result.ShieldsUsed != 2 || out.Result.Misses != 2 || out.Result.Total != out.Result.BasePoints*125/100 {
		t.Fatal(out)
	}
	checkAudit(t, e.g)
}

func TestBadActionsAndMessages(t *testing.T) {
	e := setup(t)
	token := e.login(t, "wang")
	r, _ := e.g.StartProject("wang")
	e.clock.Add(r.DurationMS)
	for _, bad := range []any{nil, "pretend", map[string]any{}, make([]Action, 201)} {
		s, b := e.call(t, "/api/project/finish", token, map[string]any{"runId": r.ID, "actions": bad})
		assertCode(t, s, b, 400, "BAD_ACTIONS")
	}
	s, b := e.call(t, "/api/project/finish", token, map[string]any{"runId": r.ID, "actions": []any{map[string]any{"taskId": "0", "t": 600}, nil, map[string]any{"taskId": 999, "t": 600}}, "score": 9999999, "reward": 9999999})
	assertCode(t, s, b, 200, "")
	var result ProjectResult
	json.Unmarshal(b["result"], &result)
	if result.Total != 0 || result.Rejected != 3 {
		t.Fatal(result)
	}
	if e.snapshot(t, "wang").Unread != 1 {
		t.Fatal("missing message")
	}
	s, b = e.call(t, "/api/messages/read", token, map[string]any{})
	assertCode(t, s, b, 200, "")
	if e.snapshot(t, "wang").Unread != 0 {
		t.Fatal("read did not persist")
	}
}

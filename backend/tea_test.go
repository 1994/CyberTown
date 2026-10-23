package backend

import (
	"encoding/json"
	"fmt"
	"reflect"
	"sync"
	"testing"
)

func teaPlan(a, b string) TeaPlan {
	return TeaPlan{Assignments: []TeaAssignment{{"self", "support"}, {a, "cashier"}, {b, "maker"}}, Stock: 80, Strategy: "balanced"}
}
func teaTestRun(t *testing.T, g *Game, p TeaPlan) TeaRun {
	t.Helper()
	r, e := g.TeaRun("wang", p, "practice", randomID())
	if e != nil {
		t.Fatal(e)
	}
	return r
}
func TestTeaSimulation(t *testing.T) {
	e := setup(t)
	weak := teaTestRun(t, e.g, teaPlan("system-a", "system-b"))
	strong := teaTestRun(t, e.g, teaPlan("demo-li", "demo-wang"))
	wrong := teaTestRun(t, e.g, teaPlan("demo-wang", "demo-li"))
	for i := 0; i < 10; i++ {
		r := teaTestRun(t, e.g, strong.Plan)
		if !reflect.DeepEqual(r.Result, strong.Result) {
			t.Fatal("non deterministic result")
		}
	}
	t.Logf("weak=%d (%s), strong=%d (%s), reversed=%d (%s)", weak.Result.Completed, weak.Result.Bottleneck, strong.Result.Completed, strong.Result.Bottleneck, wrong.Result.Completed, wrong.Result.Bottleneck)
	if strong.Result.Completed <= weak.Result.Completed || strong.Result.Completed <= wrong.Result.Completed {
		t.Fatal("role and recruitment did not improve results")
	}
	for _, r := range []TeaRun{weak, strong, wrong} {
		if r.Result.Completed+r.Result.Lost != 80 || len(r.Result.Frames) != 241 {
			t.Fatal("customers/frame accounting")
		}
		if r.Result.Profit != r.Result.Revenue-r.Result.TotalCost {
			t.Fatal("profit accounting")
		}
	}
	p := strong.Plan
	p.Stock = 60
	r := teaTestRun(t, e.g, p)
	if r.Result.Completed > 60 || r.Result.LostStock == 0 {
		t.Fatal("stock boundary", r.Result.Completed, r.Result.LostStock)
	}
	if strong.Result.SkillCounts["batch_master"] == 0 || strong.Result.SkillCounts["golden_service"] == 0 {
		t.Fatal("missing skills")
	}
}
func TestTeaEconomyAndRetry(t *testing.T) {
	e := setup(t)
	h, err := e.g.TeaHome("wang")
	if err != nil {
		t.Fatal(err)
	}
	if h.Coins != 2000 {
		t.Fatal(h.Coins)
	}
	if !h.Business.UpgradeReady {
		t.Fatal("fresh shop upgrade unavailable")
	}
	var before int
	e.g.DB.QueryRow("SELECT COUNT(*) FROM ledger").Scan(&before)
	for i := 0; i < 3; i++ {
		teaTestRun(t, e.g, teaPlan("demo-li", "demo-wang"))
	}
	h, _ = e.g.TeaHome("wang")
	var after int
	e.g.DB.QueryRow("SELECT COUNT(*) FROM ledger").Scan(&after)
	if h.Coins != 2000 || h.Shop.Runs != 0 || h.AttemptsRemaining != 3 || before != after {
		t.Fatal("practice changed economy")
	}
	if !h.Business.UpgradeReady {
		t.Fatal("practice hid manual upgrade")
	}
	p := teaPlan("demo-li", "demo-wang")
	r, err := e.g.TeaRun("wang", p, "official", "once")
	if err != nil {
		t.Fatal(err)
	}
	for i := 0; i < 5; i++ {
		again, err := e.g.TeaRun("wang", p, "official", "once")
		if err != nil || !reflect.DeepEqual(again, r) {
			t.Fatal("retry", err)
		}
	}
	h, _ = e.g.TeaHome("wang")
	if h.Coins != 2000+r.Result.Profit+r.Result.Bonus || h.Shop.Runs != 1 || h.AttemptsRemaining != 2 {
		t.Fatal("settlement", h)
	}
	bad := p
	bad.Stock = 60
	if _, err = e.g.TeaRun("wang", bad, "official", "once"); err == nil {
		t.Fatal("key reuse with changed plan")
	}
	h, err = e.g.TeaUpgrade("wang", 1)
	if err != nil {
		t.Fatal(err)
	}
	coins := h.Coins
	h, err = e.g.TeaUpgrade("wang", 1)
	if err != nil || h.Coins != coins || h.Shop.Level != 2 {
		t.Fatal("upgrade retry", err)
	}
}
func TestTeaHireConsentAndQuota(t *testing.T) {
	e := setup(t)
	_, err := e.g.TeaHome("li")
	if err != nil {
		t.Fatal(err)
	}
	p := teaPlan("employee:li", "demo-chen")
	if _, err = e.g.TeaRun("wang", p, "official", "closed"); err == nil {
		t.Fatal("unconsented avatar hired")
	}
	_, err = e.g.TeaHireSettings("li", true)
	if err != nil {
		t.Fatal(err)
	}
	before, _ := e.g.TeaHome("li")
	salary := teaAvatar("li", "", "").Salary
	for _, owner := range []string{"wang", "mei", "liu"} {
		r, err := e.g.TeaRun(owner, p, "official", "hired")
		if err != nil {
			t.Fatal(err)
		}
		if r.Result.Completed >= 72 {
			t.Log("well matched employee", owner)
		}
	}
	h, err := e.g.TeaHome("li")
	if err != nil {
		t.Fatal(err)
	}
	if len(h.Notices) != 3 || h.Coins != before.Coins+3*salary {
		t.Fatal("offline wages", h.Coins, len(h.Notices), salary)
	}
	if _, err = e.g.TeaRun("wang", p, "official", "quota"); err == nil {
		t.Fatal("daily employee quota exceeded")
	}
	// A historical successful run is immutable even after authorization changes.
	_, _ = e.g.TeaHireSettings("li", false)
	r, err := e.g.TeaRun("wang", p, "official", "hired")
	if err != nil || r.ID == "" {
		t.Fatal("retry after consent change", err)
	}
	next := e.clock.Load() + 86400000
	e.clock.Store(next)
	if _, err = e.g.TeaRun("wang", p, "official", "next-day-disabled"); err == nil {
		t.Fatal("disabled employee hired")
	}
}
func TestTeaValidationAndIsolation(t *testing.T) {
	e := setup(t)
	p := teaPlan("demo-li", "demo-wang")
	cases := []TeaPlan{teaPlan("self", "system-a"), teaPlan("missing", "system-a")}
	q := teaPlan("system-a", "system-b")
	q.Assignments[1].Role = "support"
	cases = append(cases, q)
	q = teaPlan("demo-li", "demo-wang")
	q.Stock = 100
	cases = append(cases, q)
	q = teaPlan("system-a", "system-b")
	q.Strategy = "cheat"
	cases = append(cases, q)
	for i, bad := range cases {
		if _, err := e.g.TeaRun("wang", bad, "official", fmt.Sprint(i)); err == nil {
			t.Fatal("invalid accepted", i)
		}
	}
	_, _ = e.g.TeaHome("wang")
	_, _ = e.g.DB.Exec("UPDATE players SET coins=100 WHERE id='wang'")
	if _, err := e.g.TeaRun("wang", p, "official", "poor"); err == nil {
		t.Fatal("insufficient funds")
	}
	h, _ := e.g.TeaHome("wang")
	if h.Coins != 100 || h.Shop.Runs != 0 {
		t.Fatal("failed request mutated wallet")
	}
	_, err := e.g.TeaRun("li", p, "official", "other")
	if err != nil {
		t.Fatal(err)
	}
	h, _ = e.g.TeaHome("wang")
	if h.Shop.Runs != 0 {
		t.Fatal("shop isolation")
	}
}
func TestTeaConcurrentIdempotency(t *testing.T) {
	e := setup(t)
	p := teaPlan("demo-li", "demo-wang")
	var wg sync.WaitGroup
	out := make(chan TeaRun, 8)
	errs := make(chan error, 8)
	for i := 0; i < 8; i++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			r, err := e.g.TeaRun("wang", p, "official", "concurrent")
			out <- r
			errs <- err
		}()
	}
	wg.Wait()
	close(out)
	close(errs)
	id := ""
	for err := range errs {
		if err != nil {
			t.Fatal(err)
		}
	}
	for r := range out {
		if id != "" && r.ID != id {
			t.Fatal("duplicate runs")
		}
		id = r.ID
	}
	h, _ := e.g.TeaHome("wang")
	if h.Shop.Runs != 1 {
		t.Fatal("double settlement")
	}
}
func TestTeaHTTPAndRunPrivacy(t *testing.T) {
	e := setup(t)
	token := e.login(t, "wang")
	other := e.login(t, "li")
	status, _ := e.call(t, "/api/tea/home", "", nil)
	if status != 401 {
		t.Fatal("unauthenticated", status)
	}
	status, h := e.call(t, "/api/tea/home", token, nil)
	if status != 200 {
		t.Fatal(status, h)
	}
	status, r := e.call(t, "/api/tea/runs", token, map[string]any{"plan": teaPlan("demo-li", "demo-wang"), "mode": "official", "idempotencyKey": "http"})
	if status != 200 {
		t.Fatal(status, r)
	}
	var id string
	_ = json.Unmarshal(r["id"], &id)
	status, _ = e.call(t, "/api/tea/runs/"+id, other, nil)
	if status != 404 {
		t.Fatal("leaked private run", status)
	}
	status, _ = e.call(t, "/api/tea/runs/"+id, token, nil)
	if status != 200 {
		t.Fatal(status)
	}
}

func TestTeaSkillsAffectQueues(t *testing.T) {
	ch := teaChallenge("2026-10-21")
	p := teaPlan("demo-li", "demo-wang")
	fs := teaFixtures()
	ws := []TeaWorker{teaSelf("wang", "我", "#fff"), fs[3], fs[2]}
	// Isolate each skill under congestion with a neutral support character.
	ws[0].Adaptability, ws[0].Skill = 60, "steady_hand"
	for _, index := range []int{1, 2} {
		active := append([]TeaWorker{}, ws...)
		if index == 1 {
			active[1].Service = 45
		}
		rich := simulateTea(ch, p, active)
		plain := append([]TeaWorker{}, active...)
		plain[index].Skill = "none"
		r := simulateTea(ch, p, plain)
		if reflect.DeepEqual(r.Frames, rich.Frames) {
			t.Fatalf("skill %s has no real queue impact", ws[index].Skill)
		}
	}
	p.Stock = 60
	ws[2] = fs[5]
	p.Assignments[2].WorkerID = ws[2].ID
	saved := simulateTea(ch, p, ws)
	ws[2].Skill = "none"
	plain := simulateTea(ch, p, ws)
	if saved.Completed <= plain.Completed || saved.SkillCounts["materials_saver"] == 0 {
		t.Fatalf("saver has no inventory effect: %d/%d", saved.Completed, plain.Completed)
	}
	p = teaPlan("system-a", "system-b")
	ws = []TeaWorker{fs[4], fs[0], fs[1]}
	p.Assignments[0].WorkerID = ws[0].ID
	rescue := simulateTea(ch, p, ws)
	ws[0].Skill = "none"
	plain = simulateTea(ch, p, ws)
	if rescue.SkillCounts["rescue_captain"] == 0 || reflect.DeepEqual(rescue.Frames, plain.Frames) {
		t.Fatal("rescue skill has no queue effect")
	}
	ws = []TeaWorker{teaSelf("wang", "我", "#fff"), fs[0], fs[1]}
	ws[0].Skill = "steady_hand"
	steady := simulateTea(ch, p, ws)
	ws[0].Skill = "none"
	plain = simulateTea(ch, p, ws)
	if steady.SkillCounts["steady_hand"] == 0 || reflect.DeepEqual(steady.Frames, plain.Frames) {
		t.Fatal("steady skill has no pressure effect")
	}
}
func TestTeaDailyAttemptsAndBonus(t *testing.T) {
	e := setup(t)
	p := teaPlan("demo-li", "demo-wang")
	bonus := 0
	for i := 0; i < 3; i++ {
		r, err := e.g.TeaRun("wang", p, "official", fmt.Sprint(i))
		if err != nil {
			t.Fatal(err)
		}
		bonus += r.Result.Bonus
	}
	if bonus != 200 {
		t.Fatal("bonus not once", bonus)
	}
	if _, err := e.g.TeaRun("wang", p, "official", "fourth"); err == nil {
		t.Fatal("daily owner quota")
	}
	e.clock.Add(86400000)
	r, err := e.g.TeaRun("wang", p, "official", "tomorrow")
	if err != nil {
		t.Fatal(err)
	}
	if r.Result.Passed && r.Result.Bonus != 200 {
		t.Fatal("bonus did not reset")
	}
}
func TestTeaEmployeeQuotaIsAtomic(t *testing.T) {
	e := setup(t)
	_, _ = e.g.TeaHireSettings("li", true)
	p := teaPlan("employee:li", "demo-chen")
	var wg sync.WaitGroup
	results := make(chan error, 4)
	for i, owner := range []string{"wang", "mei", "liu", "wang"} {
		wg.Add(1)
		go func(owner string, i int) {
			defer wg.Done()
			_, err := e.g.TeaRun(owner, p, "official", fmt.Sprintf("atomic-%d", i))
			results <- err
		}(owner, i)
	}
	wg.Wait()
	close(results)
	ok := 0
	for err := range results {
		if err == nil {
			ok++
		}
	}
	if ok != 3 {
		t.Fatal("quota accepted", ok)
	}
	h, _ := e.g.TeaHome("li")
	if len(h.Notices) != 3 {
		t.Fatal("quota exceeded", len(h.Notices))
	}
}
func TestTeaPracticeReplayAndWalletRestart(t *testing.T) {
	e := setup(t)
	p := teaPlan("system-a", "system-b")
	a, err := e.g.TeaRun("wang", p, "practice", "replay")
	if err != nil {
		t.Fatal(err)
	}
	b, err := e.g.TeaRun("wang", p, "practice", "replay")
	if err != nil || !reflect.DeepEqual(a, b) {
		t.Fatal("practice retry", err)
	}
	b, err = e.g.TeaGetRun("wang", a.ID)
	if err != nil || !reflect.DeepEqual(a, b) {
		t.Fatal("practice lookup", err)
	}
}
func TestTeaPersistentShopAndProfile(t *testing.T) {
	path := t.TempDir() + "/persist.db"
	clock := func() int64 { return 1800000000000 }
	g, err := Open(path, clock)
	if err != nil {
		t.Fatal(err)
	}
	h, err := g.TeaHome("wang")
	if err != nil {
		t.Fatal(err)
	}
	avatar := teaAvatar(h.PlayerID, h.Name, h.Self.Color)
	if h.Self.Service != avatar.Service || h.Self.Production != avatar.Production || h.Self.Adaptability != avatar.Adaptability || h.Self.Skill != avatar.Skill {
		t.Fatal("owner and clone mismatch")
	}
	if _, err = g.TeaRun("wang", teaPlan("demo-li", "demo-wang"), "official", "unlock-upgrade"); err != nil {
		t.Fatal(err)
	}
	h, err = g.TeaUpgrade("wang", 1)
	if err != nil {
		t.Fatal(err)
	}
	coins := h.Coins
	g.Close()
	g, err = Open(path, clock)
	if err != nil {
		t.Fatal(err)
	}
	defer g.Close()
	h, err = g.TeaHome("wang")
	if err != nil {
		t.Fatal(err)
	}
	if h.Coins != coins || h.Shop.Level != 2 {
		t.Fatal("opening grant or upgrade reset on restart", h)
	}
}
func TestTeaPracticeBeforeHomeHasNoGrant(t *testing.T) {
	e := setup(t)
	var before, after, entries int
	_ = e.g.DB.QueryRow("SELECT coins FROM players WHERE id='wang'").Scan(&before)
	_, err := e.g.TeaRun("wang", teaPlan("system-a", "system-b"), "practice", "before-home")
	if err != nil {
		t.Fatal(err)
	}
	_ = e.g.DB.QueryRow("SELECT coins FROM players WHERE id='wang'").Scan(&after)
	_ = e.g.DB.QueryRow("SELECT COUNT(*) FROM ledger WHERE reason='tea_opening_grant'").Scan(&entries)
	if before != after || entries != 0 {
		t.Fatal("practice created real opening grant", before, after, entries)
	}
}

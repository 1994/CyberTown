package backend

import (
	"bufio"
	"encoding/json"
	"net/http"
	"path/filepath"
	"strings"
	"sync"
	"sync/atomic"
	"testing"
	"time"
)

func projectActions(r Run, limit int) []Action {
	actions := []Action{}
	for _, task := range GenerateTasks(r.Seed, r.DurationMS) {
		if task.Kind != "trap" && (limit < 0 || len(actions) < limit) {
			actions = append(actions, Action{task.ID, float64(task.SpawnAt + 200)})
		}
	}
	return actions
}

func finishCareerRun(t *testing.T, e *testEnv, r Run, hits int) Finish {
	t.Helper()
	e.clock.Store(r.Deadline)
	out, err := e.g.FinishProject("wang", r.ID, projectActions(r, hits))
	if err != nil {
		t.Fatal(err)
	}
	return out
}

func TestCareerVerifiedProgressAndPromotionSkills(t *testing.T) {
	e := setup(t)
	token := e.login(t, "wang")
	initial := e.snapshot(t, "wang")
	if initial.Career.Name != "职场新人" || initial.Career.Performance != 0 || initial.Career.Next.RequiredPerformance != 60 || initial.Career.CanPromote {
		t.Fatal(initial.Career)
	}
	// Signing and dividends cannot buy career progress.
	if _, err := e.g.Sign("li", "c-wang", 300); err != nil {
		t.Fatal(err)
	}
	if c, _ := e.g.Career("wang"); c.Performance != 0 || c.CompletedProjects != 0 {
		t.Fatal(c)
	}
	status, body := e.call(t, "/api/career/promote", token, map[string]int{"expectedRank": 0})
	assertCode(t, status, body, 409, "NOT_ELIGIBLE")
	r, err := e.g.StartProject("wang")
	if err != nil {
		t.Fatal(err)
	}
	finish := finishCareerRun(t, e, r, 6)
	if finish.PerformanceEarned != 60 || finish.Career.CompletedProjects != 1 || !finish.Career.CanPromote {
		t.Fatal(finish)
	}
	// Start a run before promotion: its locked skill snapshot must not change.
	oldRun, err := e.g.StartProject("wang")
	if err != nil {
		t.Fatal(err)
	}
	coins := e.snapshot(t, "wang").Me.Coins
	status, body = e.call(t, "/api/career/promote", token, map[string]int{"expectedRank": 0})
	assertCode(t, status, body, 200, "")
	s := e.snapshot(t, "wang")
	if s.Me.Coins != coins || s.Career.Rank != 1 || s.Career.Performance != 60 || s.Career.CompletedProjects != 1 || s.Me.RankName != "项目专员" || s.ProjectSkills.IncomePct != 5 || s.TeamSkills.IncomePct != 0 {
		t.Fatal(s.Career, s.Me, s.ProjectSkills)
	}
	finish = finishCareerRun(t, e, oldRun, 6)
	if finish.Result.IncomeBonus != 0 {
		t.Fatal("promotion changed an in-flight project", finish)
	}
	if _, err = e.g.Sign("wang", "c-zhang", 300); err != nil {
		t.Fatal(err)
	}
	newRun, err := e.g.StartProject("wang")
	if err != nil || newRun.Skills.IncomePct != 30 {
		t.Fatal(newRun, err)
	}
	finish = finishCareerRun(t, e, newRun, 6)
	if finish.Result.Total != finish.Result.BasePoints*130/100 || finish.Career.Performance != 180 || finish.Career.CanPromote {
		t.Fatal(finish)
	}
	before := finish.Career
	if _, err = e.g.FinishProject("wang", newRun.ID, projectActions(newRun, 6)); err == nil {
		t.Fatal("duplicate project accepted")
	}
	if after, _ := e.g.Career("wang"); after.Performance != before.Performance || after.CompletedProjects != before.CompletedProjects {
		t.Fatal("duplicate career progress", after)
	}
	checkAudit(t, e.g)
}

func TestCareerValidationAndCompleteLadder(t *testing.T) {
	e := setup(t)
	token := e.login(t, "wang")
	s, b := e.call(t, "/api/career", "", nil)
	assertCode(t, s, b, 401, "NO_SESSION")
	s, b = e.call(t, "/api/career/promote", "", map[string]int{"expectedRank": 0})
	assertCode(t, s, b, 401, "NO_SESSION")
	for _, body := range []any{map[string]any{}, map[string]any{"expectedRank": nil}, map[string]any{"expectedRank": "0"}, map[string]any{"expectedRank": 0.5}, map[string]any{"expectedRank": -1}, map[string]any{"expectedRank": 5}} {
		s, b = e.call(t, "/api/career/promote", token, body)
		assertCode(t, s, b, 400, "BAD_RANK")
	}
	r, _ := e.g.StartProject("wang")
	empty := finishCareerRun(t, e, r, 0)
	if empty.PerformanceEarned != 0 || empty.Career.CompletedProjects != 0 {
		t.Fatal("idle run earned career progress", empty)
	}
	for target := 1; target < len(careerLevels); target++ {
		c, _ := e.g.Career("wang")
		for attempts := 0; !c.CanPromote; attempts++ {
			if attempts > 30 {
				t.Fatal("cannot reach promotion", c)
			}
			r, err := e.g.StartProject("wang")
			if err != nil {
				t.Fatal(err)
			}
			c = finishCareerRun(t, e, r, -1).Career
		}
		ev, promoted, err := e.g.Promote("wang", target-1)
		if err != nil || ev.ToRank != target || promoted.Name != careerLevels[target].Name || promoted.IncomePct != target*5 || promoted.Performance != c.Performance {
			t.Fatal(ev, promoted, err)
		}
	}
	c, _ := e.g.Career("wang")
	if c.Next != nil || c.CanPromote || c.CompletedProjects < 12 {
		t.Fatal(c)
	}
	s, b = e.call(t, "/api/career/promote", token, map[string]int{"expectedRank": 4})
	assertCode(t, s, b, 409, "MAX_RANK")
	s, b = e.call(t, "/api/career/promote", token, map[string]int{"expectedRank": 0})
	assertCode(t, s, b, 409, "RANK_CHANGED")
	checkAudit(t, e.g)
}

func TestCareerConcurrentPromotionAndCommitBroadcast(t *testing.T) {
	e := setup(t)
	token := e.login(t, "wang")
	r, _ := e.g.StartProject("wang")
	finishCareerRun(t, e, r, 6)
	// Separate DB connections share SQLite's immediate transaction lock.
	var databasePath string
	var seq int
	var databaseName string
	if err := e.g.DB.QueryRow("PRAGMA database_list").Scan(&seq, &databaseName, &databasePath); err != nil {
		t.Fatal(err)
	}
	other, err := Open(databasePath, e.clock.Load)
	if err != nil {
		t.Fatal(err)
	}
	defer other.Close()
	var successes atomic.Int64
	var wg sync.WaitGroup
	for i := 0; i < 24; i++ {
		wg.Add(1)
		go func(i int) {
			defer wg.Done()
			game := []*Game{e.g, other}[i%2]
			if _, _, err := game.Promote("wang", 0); err == nil {
				successes.Add(1)
			}
		}(i)
	}
	wg.Wait()
	if successes.Load() != 1 {
		t.Fatal("duplicate promotion", successes.Load())
	}
	// Advance to the next threshold through actual project settlement.
	for c, _ := e.g.Career("wang"); !c.CanPromote; c, _ = e.g.Career("wang") {
		r, _ := e.g.StartProject("wang")
		finishCareerRun(t, e, r, -1)
	}
	observer := e.login(t, "li")
	res, err := http.Get(e.server.URL + "/api/events?token=" + observer)
	if err != nil {
		t.Fatal(err)
	}
	defer res.Body.Close()
	got := make(chan Promotion, 1)
	go func() {
		scanner := bufio.NewScanner(res.Body)
		for scanner.Scan() {
			line := scanner.Text()
			if strings.HasPrefix(line, "data: ") {
				var msg struct {
					Event Promotion `json:"event"`
				}
				if json.Unmarshal([]byte(strings.TrimPrefix(line, "data: ")), &msg) == nil && msg.Event.Kind == "promotion" {
					got <- msg.Event
					return
				}
			}
		}
	}()
	s, b := e.call(t, "/api/career/promote", token, map[string]int{"expectedRank": 1})
	assertCode(t, s, b, 200, "")
	select {
	case ev := <-got:
		c, err := e.g.Career("wang")
		if ev.PlayerID != "wang" || ev.ToRank != 2 || c.Rank != 2 || err != nil {
			t.Fatal("broadcast before commit", ev, c, err)
		}
	case <-time.After(3 * time.Second):
		t.Fatal("promotion SSE did not arrive")
	}
	checkAudit(t, e.g)
}

func TestCareerSettlementAndPromotionRollback(t *testing.T) {
	e := setup(t)
	r, _ := e.g.StartProject("wang")
	e.clock.Store(r.Deadline)
	if _, err := e.g.DB.Exec(`CREATE TRIGGER fail_career BEFORE UPDATE ON player_careers BEGIN SELECT RAISE(ABORT,'test failure'); END`); err != nil {
		t.Fatal(err)
	}
	if _, err := e.g.FinishProject("wang", r.ID, projectActions(r, 6)); err == nil {
		t.Fatal("expected failure")
	}
	state := e.snapshot(t, "wang")
	if state.Me.Coins != 600 || state.ActiveRun == nil || state.ActiveRun.ID != r.ID || state.Career.Performance != 0 {
		t.Fatal("partial project commit", state)
	}
	checkAudit(t, e.g)
	if _, err := e.g.DB.Exec("DROP TRIGGER fail_career"); err != nil {
		t.Fatal(err)
	}
	finishCareerRun(t, e, r, 6)
	before := e.snapshot(t, "wang")
	if _, err := e.g.DB.Exec(`CREATE TRIGGER fail_promotion BEFORE INSERT ON messages WHEN NEW.kind='promotion' BEGIN SELECT RAISE(ABORT,'test failure'); END`); err != nil {
		t.Fatal(err)
	}
	if _, _, err := e.g.Promote("wang", 0); err == nil {
		t.Fatal("expected failure")
	}
	after := e.snapshot(t, "wang")
	if after.Career.Rank != 0 || after.Version != before.Version || after.Me.Coins != before.Me.Coins || after.Career.Performance != before.Career.Performance || len(after.Messages) != len(before.Messages) {
		t.Fatal("partial promotion commit", after.Career)
	}
}

func TestCareerMigrationPersistenceAndReset(t *testing.T) {
	path := filepath.Join(t.TempDir(), "migration.db")
	now := int64(1800000000000)
	g, err := Open(path, func() int64 { return now })
	if err != nil {
		t.Fatal(err)
	}
	r, err := g.StartProject("wang")
	if err != nil {
		t.Fatal(err)
	}
	now = r.Deadline
	finish, err := g.FinishProject("wang", r.ID, projectActions(r, 6))
	if err != nil {
		t.Fatal(err)
	}
	// Emulate a pre-career database. Opening it must be additive and idempotent.
	if _, err = g.DB.Exec("DROP TABLE player_careers"); err != nil {
		t.Fatal(err)
	}
	g.Close()
	g, err = Open(path, func() int64 { return now })
	if err != nil {
		t.Fatal(err)
	}
	s, err := g.Snapshot("wang", nil)
	if err != nil || s.Me.Coins != finish.Coins || s.Career.Performance != 60 || s.Career.CompletedProjects != 1 || !s.Career.CanPromote {
		t.Fatal(s.Career, err)
	}
	if _, _, err = g.Promote("wang", 0); err != nil {
		t.Fatal(err)
	}
	g.Close()
	g, err = Open(path, func() int64 { return now })
	if err != nil {
		t.Fatal(err)
	}
	defer g.Close()
	s, err = g.Snapshot("wang", nil)
	if err != nil || s.Career.Rank != 1 || s.Career.Performance != 60 || s.Career.CompletedProjects != 1 || s.Me.Coins != finish.Coins {
		t.Fatal("reopen changed progress", s.Career, err)
	}
	if err = g.Reset(); err != nil {
		t.Fatal(err)
	}
	s, err = g.Snapshot("wang", nil)
	if err != nil || s.Career.Rank != 0 || s.Career.Performance != 0 || s.Career.CompletedProjects != 0 || s.Me.Coins != 600 {
		t.Fatal("reset failed", s.Career, err)
	}
	checkAudit(t, g)
}

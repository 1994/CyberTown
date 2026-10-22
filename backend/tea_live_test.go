package backend

import (
	"encoding/json"
	"fmt"
	"reflect"
	"sync"
	"testing"
)

func livePlan(ids ...string) TeaPlan {
	p := TeaPlan{Assignments: []TeaAssignment{{WorkerID: "self", Role: "support"}}, Stock: 80, Strategy: "balanced"}
	for i, id := range ids {
		role := "maker"
		if i == 1 {
			role = "cashier"
		}
		p.Assignments = append(p.Assignments, TeaAssignment{WorkerID: id, Role: role})
	}
	return p
}
func openLive(t *testing.T, g *Game, player, lesson, mode string, ids ...string) TeaSession {
	t.Helper()
	s, e := g.TeaOpen(player, TeaOpenSession{Plan: livePlan(ids...), Lesson: lesson, Mode: mode, Key: randomID()})
	if e != nil {
		t.Fatal(e)
	}
	return s
}
func liveStep(t *testing.T, g *Game, player string, s TeaSession, advance int, role string) TeaSession {
	t.Helper()
	next, e := g.TeaStepSession(player, s.ID, TeaStep{Revision: s.Revision, Advance: advance, Assign: role, RequestID: randomID()})
	if e != nil {
		t.Fatal(e)
	}
	return next
}
func driveLive(t *testing.T, g *Game, player string, s TeaSession) TeaSession {
	t.Helper()
	for s.Status == "active" {
		role := ""
		if s.Frame.SelfTask.Role == "idle" && s.Frame.CashierQueue+s.Frame.MakerQueue > 0 {
			threshold := 0
			if len(s.Run.Workers) >= 3 {
				threshold = 4
			}
			if max(s.Frame.CashierQueue, s.Frame.MakerQueue) > threshold {
				role = "cashier"
				if s.Frame.MakerQueue >= s.Frame.CashierQueue {
					role = "maker"
				}
			}
		}
		s = liveStep(t, g, player, s, 1, role)
	}
	return s
}
func unlockLive(t *testing.T, g *Game, player string) {
	t.Helper()
	s := driveLive(t, g, player, openLive(t, g, player, "solo", "practice"))
	if s.Run.Result.Completed == 0 {
		t.Fatal("solo did not serve")
	}
	s = driveLive(t, g, player, openLive(t, g, player, "duo", "practice", "demo-wang"))
	if s.Run.Result.Completed == 0 {
		t.Fatal("duo did not serve")
	}
}
func TestTeaLiveChapterAndNoPrecomputedIncome(t *testing.T) {
	e := setup(t)
	h, _ := e.g.TeaHome("li")
	s := openLive(t, e.g, "li", "solo", "practice")
	if s.T != 0 || s.Run.SettledAt != 0 || s.Run.Result.Completed != 0 || len(s.Run.Result.Frames) != 1 || s.Frame.SelfTask.Role != "idle" {
		t.Fatal("future results exposed", s)
	}
	var n int
	e.g.DB.QueryRow("SELECT COUNT(*) FROM tea_runs WHERE id=?", s.ID).Scan(&n)
	if n != 0 {
		t.Fatal("settled on opening")
	}
	idle := liveStep(t, e.g, "li", s, 90, "")
	if idle.Run.Result.Completed != 0 {
		t.Fatal("unassigned owner worked")
	}
	h2, _ := e.g.TeaHome("li")
	if h2.Coins != h.Coins || h2.Chapter.Stage != "solo" {
		t.Fatal("empty solo advanced or changed economy")
	}
	s = driveLive(t, e.g, "li", openLive(t, e.g, "li", "solo", "practice"))
	h2, _ = e.g.TeaHome("li")
	if s.Run.Result.Completed < 1 || h2.Chapter.Stage != "duo" || h2.Coins != h.Coins {
		t.Fatal("solo progression", s.Run.Result.Completed, h2.Chapter)
	}
	s = driveLive(t, e.g, "li", openLive(t, e.g, "li", "duo", "practice", "demo-wang"))
	h2, _ = e.g.TeaHome("li")
	if h2.Chapter.Stage != "rush" || h2.Coins != h.Coins || h2.AttemptsRemaining != 3 {
		t.Fatal("duo progression/economy")
	}
	automatic := 0
	for _, event := range s.Run.Result.Events {
		if event.Type == "making_started" && event.WorkerID == "demo-wang" {
			automatic++
		}
	}
	if automatic == 0 {
		t.Fatal("hired maker needed manual commands")
	}
	t.Logf("chapter actual solo=%d duo=%d hired-maker automatic jobs=%d", h2.Chapter.SoloBest, h2.Chapter.DuoBest, automatic)
}
func TestTeaLiveBatchQueueAndIdempotency(t *testing.T) {
	e := setup(t)
	s := openLive(t, e.g, "wang", "solo", "practice")
	s = liveStep(t, e.g, "wang", s, 4, "")
	s = liveStep(t, e.g, "wang", s, 0, "cashier")
	s = liveStep(t, e.g, "wang", s, 0, "cashier")
	if _, err := e.g.TeaStepSession("wang", s.ID, TeaStep{Revision: s.Revision, Assign: "cashier", RequestID: "spam"}); err == nil {
		t.Fatal("unbounded queued batches")
	}
	if len(s.Commands) != 2 || s.T != 4 || s.Run.Result.Completed != 0 {
		t.Fatal("clicking accelerated work")
	}
	op := TeaStep{Revision: s.Revision, Advance: 10, RequestID: "same-step"}
	first, err := e.g.TeaStepSession("wang", s.ID, op)
	if err != nil {
		t.Fatal(err)
	}
	again, err := e.g.TeaStepSession("wang", s.ID, op)
	if err != nil || !reflect.DeepEqual(first, again) {
		t.Fatal("operation retry changed result", err)
	}
	if _, err = e.g.TeaStepSession("wang", s.ID, TeaStep{Revision: op.Revision, Advance: 1, RequestID: "old-revision"}); err == nil {
		t.Fatal("stale revision accepted")
	}
	changed := op
	changed.Advance++
	if _, err = e.g.TeaStepSession("wang", s.ID, changed); err == nil {
		t.Fatal("request id changed meaning")
	}
	if _, err = e.g.TeaGetSession("li", s.ID); err == nil {
		t.Fatal("private session exposed")
	}
	if _, err = e.g.TeaStepSession("li", s.ID, TeaStep{Revision: first.Revision, Advance: 1, RequestID: "other"}); err == nil {
		t.Fatal("other player advanced session")
	}
}
func TestTeaLiveOfficialHoldSettlementAndUpgrade(t *testing.T) {
	e := setup(t)
	unlockLive(t, e.g, "li")
	before, _ := e.g.TeaHome("li")
	input := TeaOpenSession{Plan: livePlan("demo-wang", "demo-li"), Lesson: "rush", Mode: "official", Key: "open-once"}
	s, err := e.g.TeaOpen("li", input)
	if err != nil {
		t.Fatal(err)
	}
	h, _ := e.g.TeaHome("li")
	if h.Coins != before.Coins-s.Hold || h.Shop.Runs != 0 || h.AttemptsRemaining != 2 {
		t.Fatal("opening did not reserve only cost/quota", h, s.Hold)
	}
	again, err := e.g.TeaOpen("li", input)
	if err != nil || again.ID != s.ID {
		t.Fatal("opening retry", err)
	}
	h2, _ := e.g.TeaHome("li")
	if h2.Coins != h.Coins {
		t.Fatal("opening charged twice")
	}
	s = driveLive(t, e.g, "li", s)
	t.Logf("official served=%d self batches=%d profit=%d", s.Run.Result.Completed, len(s.Commands), s.Run.Result.Profit)
	if !s.Run.Result.Passed {
		t.Fatal("well matched semi-auto team cannot pass", s.Run.Result.Completed)
	}
	h, _ = e.g.TeaHome("li")
	if h.Coins != before.Coins+s.Run.Result.Profit+s.Run.Result.Bonus || h.Shop.Runs != 1 || h.Chapter.Stage != "upgrade" {
		t.Fatal("final money/progress", h)
	}
	if h.Chapter.ActiveSessionID != nil {
		t.Fatal("finished session still active")
	}
	replay, err := e.g.TeaGetSession("li", s.ID)
	if err != nil || !reflect.DeepEqual(replay, s) {
		t.Fatal("immutable replay", err)
	}
	r, err := e.g.TeaGetRun("li", s.ID)
	if err != nil || !reflect.DeepEqual(r, s.Run) {
		t.Fatal("settled history differs", err)
	}
	h, err = e.g.TeaUpgrade("li", 1)
	if err != nil || h.Shop.Level != 2 || h.Chapter.Stage != "complete" {
		t.Fatal("first chapter upgrade", err)
	}
	h, err = e.g.TeaUpgrade("li", 2)
	if err != nil || h.Shop.Level != 3 {
		t.Fatal("flagship upgrade", err)
	}
	var balance int
	if err := e.g.DB.QueryRow("SELECT COALESCE(SUM(delta),0) FROM ledger WHERE ref IN (?,?)", "tea:hold:"+s.ID, "tea:"+s.ID).Scan(&balance); err != nil {
		t.Fatal(err)
	}
	if balance != 0 {
		t.Fatal("unbalanced live ledger", balance)
	}
}
func TestTeaLiveSameDemandFewerManualBatches(t *testing.T) {
	self := TeaWorker{ID: "self", Service: 60, Production: 60, Adaptability: 95}
	maker := TeaWorker{ID: "maker", Service: 30, Production: 95, Adaptability: 45}
	cashier := TeaWorker{ID: "cashier", Service: 95, Production: 30, Adaptability: 45, Skill: "golden_service"}
	ch := teaChallenge("fixed-demand")
	ch.Arrivals = 18
	ch.Target = 18
	counts := []int{}
	completed := []int{}
	for n := 0; n <= 2; n++ {
		ws := []TeaWorker{self}
		if n >= 1 {
			ws = append(ws, maker)
		}
		if n >= 2 {
			ws = append(ws, cashier)
		}
		p := livePlan()
		if n >= 1 {
			p.Assignments = append(p.Assignments, TeaAssignment{"maker", "maker"})
		}
		if n >= 2 {
			p.Assignments = append(p.Assignments, TeaAssignment{"cashier", "cashier"})
		}
		cmds := []TeaCommand{}
		var result TeaResult
		for at := 0; at < ch.Duration; at++ {
			var f TeaLiveFrame
			result, f = simulateTeaUntil(ch, p, ws, at, cmds, true, "free")
			if f.SelfTask.Role != "idle" {
				continue
			}
			role := ""
			if n == 0 {
				if f.CashierQueue+f.MakerQueue > 0 {
					role = "cashier"
					if f.MakerQueue >= f.CashierQueue {
						role = "maker"
					}
				}
			}
			if n == 1 && f.CashierQueue > 0 {
				role = "cashier"
			}
			if role != "" {
				cmds = append(cmds, TeaCommand{T: float64(at), Role: role})
			}
		}
		result, _ = simulateTeaUntil(ch, p, ws, ch.Duration, cmds, true, "free")
		counts = append(counts, len(cmds))
		completed = append(completed, result.Completed)
	}
	t.Logf("same 18 customers: 0/1/2 hires commands=%v completed=%v", counts, completed)
	if completed[0] != 18 || completed[1] != 18 || completed[2] != 18 || counts[0] <= counts[1] || counts[1] <= counts[2] || counts[2] != 0 {
		t.Fatal("hiring did not reduce necessary commands", counts, completed)
	}
}
func TestTeaLiveConcurrentOpenAndFinish(t *testing.T) {
	e := setup(t)
	unlockLive(t, e.g, "wang")
	input := TeaOpenSession{Plan: livePlan("demo-wang", "demo-li"), Lesson: "rush", Mode: "official", Key: "concurrent-live"}
	var wg sync.WaitGroup
	ids := make(chan string, 8)
	errs := make(chan error, 8)
	for i := 0; i < 8; i++ {
		wg.Add(1)
		go func() { defer wg.Done(); s, err := e.g.TeaOpen("wang", input); ids <- s.ID; errs <- err }()
	}
	wg.Wait()
	close(ids)
	close(errs)
	for err := range errs {
		if err != nil {
			t.Fatal(err)
		}
	}
	id := ""
	for next := range ids {
		if id != "" && id != next {
			t.Fatal("duplicate session")
		}
		id = next
	}
	s, _ := e.g.TeaGetSession("wang", id)
	op := TeaStep{Revision: s.Revision, Advance: 240, RequestID: "close-once"}
	errs = make(chan error, 8)
	for i := 0; i < 8; i++ {
		wg.Add(1)
		go func() { defer wg.Done(); _, err := e.g.TeaStepSession("wang", id, op); errs <- err }()
	}
	wg.Wait()
	close(errs)
	for err := range errs {
		if err != nil {
			t.Fatal(err)
		}
	}
	h, _ := e.g.TeaHome("wang")
	ended, _ := e.g.TeaGetSession("wang", id)
	t.Logf("two specialists, no owner commands: completed=%d passed=%t", ended.Run.Result.Completed, ended.Run.Result.Passed)
	if h.Shop.Runs != 1 || h.AttemptsRemaining != 2 {
		t.Fatal("duplicate final settlement")
	}
}
func TestTeaLiveHTTPAndSessionValidation(t *testing.T) {
	e := setup(t)
	token := e.login(t, "mei")
	other := e.login(t, "li")
	status, _ := e.call(t, "/api/tea/sessions", token, TeaOpenSession{Plan: livePlan("demo-wang", "demo-li"), Lesson: "rush", Mode: "official", Key: "skip-chapter"})
	if status != 409 {
		t.Fatal("chapter bypass", status)
	}
	status, body := e.call(t, "/api/tea/sessions", token, TeaOpenSession{Plan: livePlan(), Lesson: "solo", Mode: "practice", Key: "solo"})
	if status != 200 {
		t.Fatal(status, body)
	}
	var id string
	json.Unmarshal(body["id"], &id)
	status, _ = e.call(t, "/api/tea/sessions/"+id, other, nil)
	if status != 404 {
		t.Fatal("private GET", status)
	}
	for i, op := range []any{map[string]any{"revision": 0, "advance": -1, "requestId": "bad"}, map[string]any{"revision": 0, "advance": 241, "requestId": "bad"}, map[string]any{"revision": 0, "advance": 1, "assign": "coworker", "requestId": "bad"}, map[string]any{"revision": 0, "advance": 1, "requestId": "bad", "coins": 999999}} {
		status, _ = e.call(t, "/api/tea/sessions/"+id+"/step", token, op)
		if status != 400 {
			t.Fatal(fmt.Sprint(i), status)
		}
	}
}

func TestTeaLiveReservationsPayWagesOnFailure(t *testing.T) {
	e := setup(t)
	if _, err := e.g.TeaHireSettings("li", true); err != nil {
		t.Fatal(err)
	}
	before, _ := e.g.TeaHome("li")
	sessions := []TeaSession{}
	for _, owner := range []string{"wang", "mei", "liu"} {
		unlockLive(t, e.g, owner)
		sessions = append(sessions, openLive(t, e.g, owner, "rush", "official", "employee:li", "demo-li"))
	}
	during, _ := e.g.TeaHome("li")
	if during.Coins != before.Coins {
		t.Fatal("employee paid before close")
	}
	var reserved int
	if err := e.g.DB.QueryRow("SELECT COUNT(*) FROM tea_live_jobs WHERE employee_id='li'").Scan(&reserved); err != nil || reserved != 3 {
		t.Fatal("reservations", reserved, err)
	}
	if _, err := e.g.TeaRun("wang", teaPlan("demo-li", "employee:li"), "official", "legacy-quota-bypass"); err == nil {
		t.Fatal("legacy route bypassed live quota")
	}
	for i, s := range sessions {
		ended := liveStep(t, e.g, []string{"wang", "mei", "liu"}[i], s, 240, "")
		if ended.Run.Result.Passed {
			t.Fatal("low-production hire unexpectedly passed")
		}
	}
	after, _ := e.g.TeaHome("li")
	salary := teaAvatar("li", "", "").Salary
	if after.Coins != before.Coins+salary*3 || len(after.Notices) != 3 {
		t.Fatal("failure did not pay frozen wages", after.Coins, salary)
	}
	if err := e.g.DB.QueryRow("SELECT COUNT(*) FROM tea_live_jobs WHERE employee_id='li'").Scan(&reserved); err != nil || reserved != 0 {
		t.Fatal("finished reservation leak", reserved, err)
	}
	var delta int
	if err := e.g.DB.QueryRow("SELECT COALESCE(SUM(delta),0) FROM ledger WHERE ref=? OR ref=?", "tea:hold:"+sessions[0].ID, "tea:"+sessions[0].ID).Scan(&delta); err != nil || delta != 0 {
		t.Fatal("real employee ledger", delta, err)
	}
}

func TestTeaLiveDurableStateAcrossGameReopen(t *testing.T) {
	e := setup(t)
	s := openLive(t, e.g, "wang", "solo", "practice")
	s = liveStep(t, e.g, "wang", s, 4, "")
	s = liveStep(t, e.g, "wang", s, 0, "cashier")
	var seq int
	var name, path string
	if err := e.g.DB.QueryRow("PRAGMA database_list").Scan(&seq, &name, &path); err != nil {
		t.Fatal(err)
	}
	reopened, err := Open(path, e.clock.Load)
	if err != nil {
		t.Fatal(err)
	}
	defer reopened.Close()
	restored, err := reopened.TeaGetSession("wang", s.ID)
	if err != nil || !reflect.DeepEqual(s, restored) {
		t.Fatal("persisted service changed", err)
	}
	h, err := reopened.TeaHome("wang")
	if err != nil || h.Chapter.ActiveSessionID == nil || *h.Chapter.ActiveSessionID != s.ID {
		t.Fatal("active service not discoverable", err)
	}
	restored = driveLive(t, reopened, "wang", restored)
	h, err = e.g.TeaHome("wang")
	if err != nil || h.Chapter.Stage != "duo" || restored.Run.Result.Completed == 0 {
		t.Fatal("reopened service could not complete", err)
	}
}

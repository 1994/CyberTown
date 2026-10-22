package backend

import (
	"fmt"
	"path/filepath"
	"testing"
)

func counterPlan(staff bool) (TeaPlan, []TeaWorker) {
	p := TeaPlan{Stock: 20, Strategy: "balanced", Assignments: []TeaAssignment{{WorkerID: "self", Role: "support"}}}
	ws := []TeaWorker{teaSelf("wang", "老王", "#ffd400")}
	if staff {
		p.Assignments = append(p.Assignments, TeaAssignment{WorkerID: "maker", Role: "maker"}, TeaAssignment{WorkerID: "server", Role: "cashier"})
		ws = append(ws, TeaWorker{ID: "maker", Production: 55, Service: 55, Salary: 25}, TeaWorker{ID: "server", Production: 55, Service: 55, Salary: 25})
	}
	return p, ws
}
func TestCounterManualAndAutomaticService(t *testing.T) {
	ch := counterChallenge("2026-10-22", 1, 1)
	p, ws := counterPlan(false)
	commands := []TeaCommand{}
	seenReady := false
	seenDelivery := false
	for sec := 0; sec <= ch.Duration; sec++ {
		r, f := simulateCounter(ch, p, ws, sec, commands)
		if f.SelfTask.Role == "idle" && sec < ch.Duration {
			role := ""
			if f.CashierQueue > 0 {
				role = "cashier"
			} else if f.MakerQueue > 0 {
				role = "maker"
			}
			if role != "" {
				commands = append(commands, TeaCommand{T: float64(sec), Role: role})
			}
		}
		if f.CashierQueue > 0 {
			seenReady = true
		}
		for _, c := range f.CustomersState {
			if c.State == "delivering" {
				seenDelivery = true
			}
		}
		occupied := map[int]bool{}
		for _, c := range f.CustomersState {
			if c.Seat >= 0 && c.State != "served" && c.State != "lost" {
				if occupied[c.Seat] {
					t.Fatal("seat collision", sec, c.Seat)
				}
				occupied[c.Seat] = true
			}
		}
		if sec == ch.Duration {
			if !r.Passed || r.SelfMade < 12 || r.SelfServed < 12 {
				t.Fatalf("solo unplayable served=%d made=%d target=%d", r.Completed, r.SelfMade, ch.Target)
			}
			t.Logf("solo %d/%d cups, made %d, net %d before bonus", r.Completed, ch.Arrivals, r.SelfMade, r.Profit)
		}
	}
	if !seenReady || !seenDelivery {
		t.Fatal("missing production/delivery lifecycle")
	}
	p, ws = counterPlan(true)
	r, _ := simulateCounter(ch, p, ws, ch.Duration, nil)
	if !r.Passed || r.SelfMade != 0 || r.SelfServed != 0 {
		t.Fatalf("two staff should work with no player commands: %+v", r.Completed)
	}
	p, ws = counterPlan(false)
	r, _ = simulateCounter(ch, p, ws, 20, []TeaCommand{{T: 3, Role: "maker"}, {T: 10, Role: "maker"}})
	if r.SelfMade == 0 || r.Revenue != 0 {
		t.Fatal("making alone must never count as revenue", r.SelfMade, r.Revenue)
	}
	r, _ = simulateCounter(ch, p, ws, ch.Duration, nil)
	if r.Completed != 0 || r.Lost != ch.Arrivals {
		t.Fatal("unattended solo should lose customers", r.Completed, r.Lost)
	}
}
func TestCounterProgressDaysPersistAndRollback(t *testing.T) {
	path := filepath.Join(t.TempDir(), "counter.db")
	g, e := Open(path, nil)
	if e != nil {
		t.Fatal(e)
	}
	if _, e = g.TeaAcceptMission("wang"); e != nil {
		t.Fatal(e)
	}
	p, _ := counterPlan(false)
	s, e := g.TeaOpen("wang", TeaOpenSession{Lesson: "rescue", Mode: "official", Key: "first", Plan: p})
	if e != nil {
		t.Fatal(e)
	}
	for s.T < s.Run.Challenge.Duration-1 {
		input := TeaStep{Revision: s.Revision, Advance: 1, RequestID: fmt.Sprint(s.Revision)}
		if s.Frame.SelfTask.Role == "idle" {
			if s.Frame.CashierQueue > 0 {
				input.Assign = "cashier"
			} else if s.Frame.MakerQueue > 0 {
				input.Assign = "maker"
			}
		}
		s, e = g.TeaStepSession("wang", s.ID, input)
		if e != nil {
			t.Fatal(e)
		}
	}
	if _, e = g.DB.Exec(`CREATE TRIGGER counter_fail BEFORE INSERT ON ledger WHEN NEW.reason='tea_sales' BEGIN SELECT RAISE(ABORT,'counter failure'); END`); e != nil {
		t.Fatal(e)
	}
	input := TeaStep{Revision: s.Revision, Advance: 1, RequestID: "finish"}
	if _, e = g.TeaStepSession("wang", s.ID, input); e == nil {
		t.Fatal("expected settlement failure")
	}
	h, _ := g.TeaHome("wang")
	if h.Counter.Day != 1 || h.Counter.MakerXP != 0 {
		t.Fatal("failed settlement changed progress", h.Counter)
	}
	g.DB.Exec("DROP TRIGGER counter_fail")
	s, e = g.TeaStepSession("wang", s.ID, input)
	if e != nil {
		t.Fatal(e)
	}
	if _, e = g.TeaStepSession("wang", s.ID, input); e != nil {
		t.Fatal(e)
	}
	h, _ = g.TeaHome("wang")
	if h.Counter.Day != 2 || h.Counter.MakerXP != s.Run.Result.SelfMade || h.Counter.ServiceXP != s.Run.Result.SelfServed {
		t.Fatal("wrong progression", h.Counter)
	}
	if _, e = g.TeaDismissGuide("wang"); e != nil {
		t.Fatal(e)
	}
	g.Close()
	g, e = Open(path, nil)
	if e != nil {
		t.Fatal(e)
	}
	defer g.Close()
	h, _ = g.TeaHome("wang")
	if !h.Counter.GuideSeen || h.Counter.Day != 2 {
		t.Fatal("progress lost after reopen", h.Counter)
	}
	for i := 0; i < 4; i++ {
		s, e = g.TeaOpen("wang", TeaOpenSession{Lesson: "rescue", Mode: "practice", Key: fmt.Sprint("practice", i), Plan: p})
		if e != nil {
			t.Fatal(e)
		}
		_, e = g.TeaStepSession("wang", s.ID, TeaStep{Revision: s.Revision, Advance: s.Run.Challenge.Duration, RequestID: "finish"})
		if e != nil {
			t.Fatal(e)
		}
	}
	h, _ = g.TeaHome("wang")
	if h.Counter.Day != 2 {
		t.Fatal("practice advanced day")
	}
	checkAudit(t, g)
}

func TestCounterBeginnerHasTimeToFinish(t *testing.T) {
	ch := counterChallenge("2026-10-22", 1, 1)
	p, ws := counterPlan(false)
	ws[0].Production, ws[0].Service = 30, 30
	commands := []TeaCommand{}
	// A beginner checks the counter every two seconds, without perfect timing.
	for sec := 0; sec < ch.Duration; sec += 2 {
		_, f := simulateCounter(ch, p, ws, sec, commands)
		if f.SelfTask.Role != "idle" {
			continue
		}
		role := ""
		if f.CashierQueue > 0 {
			role = "cashier"
		} else if f.MakerQueue > 0 {
			role = "maker"
		}
		if role != "" {
			commands = append(commands, TeaCommand{T: float64(sec), Role: role})
		}
	}
	r, _ := simulateCounter(ch, p, ws, ch.Duration, commands)
	if !r.Passed {
		t.Fatalf("beginner cannot pass: %d/%d", r.Completed, ch.Target)
	}
}

func TestCounterUnattendedQueueIsBounded(t *testing.T) {
	ch := counterChallenge("2026-10-22", 1, 1)
	// Stress arrivals beyond normal demo traffic to exercise the doorway cap.
	ch.Arrivals = 100
	p, ws := counterPlan(false)
	firstLost := -1
	for sec := 0; sec <= ch.Duration; sec++ {
		r, f := simulateCounter(ch, p, ws, sec, nil)
		waiting, seated := 0, 0
		for _, c := range f.CustomersState {
			if c.State == "waiting" {
				waiting++
				if float64(sec)-c.At >= 10 {
					t.Fatal("door queue never expires", sec, c)
				}
			}
			if c.State == "maker" {
				seated++
				if float64(sec)-float64(2+(c.ID-1)*(ch.Duration-20)/(ch.Arrivals-1)) > 37 {
					t.Fatal("order deadline exceeded", sec, c)
				}
			}
		}
		if waiting > 2 || seated > 8 {
			t.Fatalf("unbounded crowd at %d: seated=%d waiting=%d", sec, seated, waiting)
		}
		if firstLost < 0 && r.Lost > 0 {
			firstLost = sec
		}
		if r.Revenue != 0 {
			t.Fatal("unserved customers paid")
		}
		if sec == ch.Duration && r.Lost != ch.Arrivals {
			t.Fatal("customers missing from settlement", r.Lost, ch.Arrivals)
		}
	}
	if firstLost < 0 || firstLost > 38 {
		t.Fatal("unattended customers do not leave promptly", firstLost)
	}
}

func TestCounterPatienceDoesNotResetAtPickup(t *testing.T) {
	ch := counterChallenge("2026-10-22", 1, 1)
	ch.Arrivals = 1
	p, ws := counterPlan(false)
	commands := []TeaCommand{{T: 25, Role: "maker"}}
	_, f := simulateCounter(ch, p, ws, 31, commands)
	if f.CustomersState[0].State != "ready" || f.CustomersState[0].Patience > .25 {
		t.Fatal("making reset patience", f.CustomersState)
	}
	r, _ := simulateCounter(ch, p, ws, 38, commands)
	if r.Lost != 1 || r.LostCashier != 1 {
		t.Fatal("ready cup did not expire", r.Lost, r.LostCashier)
	}
	// Saved counter.1 runs keep their original timing and replay deterministically.
	ch.Flow = "counter.1"
	r, _ = simulateTeaUntil(ch, p, ws, 38, commands, true, "")
	if r.Lost != 0 {
		t.Fatal("legacy replay timing changed")
	}
}

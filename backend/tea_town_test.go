package backend

import (
	"encoding/json"
	"fmt"
	"sync"
	"testing"
)

func rescueOpen(t *testing.T, g *Game, player, mode string, ids ...string) TeaSession {
	t.Helper()
	p := livePlan(ids...)
	p.Stock = 20
	s, err := g.TeaOpen(player, TeaOpenSession{Plan: p, Lesson: "rescue", Mode: mode, Key: randomID(), Duration: 60})
	if err != nil {
		t.Fatal(err)
	}
	return s
}

func TestTeaTownOptionalRecruitmentAndIncome(t *testing.T) {
	for _, player := range []string{"wang", "li", "mei", "liu"} {
		for hires := 0; hires <= 2; hires++ {
			t.Run(fmt.Sprintf("%s-%d", player, hires), func(t *testing.T) {
				e := setup(t)
				g := e.g
				before, err := g.TeaHome(player)
				if err != nil {
					t.Fatal(err)
				}
				if before.Mission.Status != "offered" || before.Wallet.Balance != before.Coins {
					t.Fatal("new mission/wallet", before.Mission)
				}
				p := livePlan()
				p.Stock = 20
				if _, err = g.TeaOpen(player, TeaOpenSession{Plan: p, Lesson: "rescue", Mode: "official", Key: "before-accept"}); err == nil {
					t.Fatal("unaccepted mission started")
				}
				h, err := g.TeaAcceptMission(player)
				if err != nil {
					t.Fatal(err)
				}
				h2, err := g.TeaAcceptMission(player)
				if err != nil || h.Mission.AcceptedAt != h2.Mission.AcceptedAt || h.Coins != h2.Coins {
					t.Fatal("accept retry changed state")
				}
				ids := []string{"demo-wang", "demo-li"}[:hires]
				s := rescueOpen(t, g, player, "official", ids...)
				if len(s.Run.Workers) != hires+1 || s.Run.Result.Revenue != 0 || s.Run.SettledAt != 0 {
					t.Fatal("future income or forced hires")
				}
				paid, _ := g.TeaHome(player)
				if paid.Coins != before.Coins-s.Hold || paid.Mission.Status != "accepted" {
					t.Fatal("opening settlement")
				}
				s = driveLive(t, g, player, s)
				h, err = g.TeaHome(player)
				if err != nil {
					t.Fatal(err)
				}
				t.Logf("%s hires=%d completed=%d batches=%d cost=%d net=%d coins=%d", player, hires, s.Run.Result.Completed, len(s.Commands), s.Hold, s.Run.Result.Profit+s.Run.Result.Bonus, h.Coins)
				if !s.Run.Result.Passed || h.Coins <= before.Coins || h.Mission.Status != "completed" || h.Mission.RunID == nil || *h.Mission.RunID != s.ID || h.Mission.Income != s.Run.Result.Profit+s.Run.Result.Bonus {
					t.Fatalf("could not save shop: completed=%d net=%d mission=%+v", s.Run.Result.Completed, s.Run.Result.Profit+s.Run.Result.Bonus, h.Mission)
				}
				if h.Coins != before.Coins+s.Run.Result.Profit+s.Run.Result.Bonus || h.Wallet.Balance != h.Coins {
					t.Fatal("wallet mismatch")
				}
				hold, sales := 0, 0
				for _, entry := range h.Wallet.Entries {
					if entry.Ref == "tea:hold:"+s.ID {
						hold += entry.Delta
					}
					if entry.Ref == "tea:"+s.ID {
						sales += entry.Delta
					}
				}
				if hold != -s.Hold || sales != s.Run.Result.Revenue+s.Run.Result.Bonus {
					t.Fatal("missing wallet receipts", hold, sales)
				}
				if _, err = g.TeaUpgrade(player, 1); err != nil {
					t.Fatal("mission failed to unlock upgrade", err)
				}
			})
		}
	}
}

func TestTeaTownPracticeAndIdleCannotCompleteMission(t *testing.T) {
	e := setup(t)
	g := e.g
	before, _ := g.TeaAcceptMission("li")
	s := driveLive(t, g, "li", rescueOpen(t, g, "li", "practice"))
	if s.Run.Result.Completed == 0 {
		t.Fatal("practice did no work")
	}
	h, _ := g.TeaHome("li")
	if h.Coins != before.Coins || h.Mission.Status != "accepted" {
		t.Fatal("practice minted mission reward")
	}
	s = rescueOpen(t, g, "li", "official")
	s = liveStep(t, g, "li", s, s.Run.Challenge.Duration, "")
	h, _ = g.TeaHome("li")
	if h.Mission.Status != "accepted" || s.Run.Result.Revenue != 0 || h.Coins != before.Coins-s.Hold {
		t.Fatal("idle owner earned income")
	}
}

func TestTeaTownConcurrentAcceptAndMissionReceipt(t *testing.T) {
	e := setup(t)
	g := e.g
	_, _ = g.TeaHome("mei")
	var wg sync.WaitGroup
	errs := make(chan error, 8)
	for i := 0; i < 8; i++ {
		wg.Add(1)
		go func() { defer wg.Done(); _, err := g.TeaAcceptMission("mei"); errs <- err }()
	}
	wg.Wait()
	close(errs)
	for err := range errs {
		if err != nil {
			t.Fatal(err)
		}
	}
	var n int
	if err := g.DB.QueryRow("SELECT COUNT(*) FROM tea_missions WHERE player_id='mei'").Scan(&n); err != nil || n != 1 {
		t.Fatal(n, err)
	}
	s := driveLive(t, g, "mei", rescueOpen(t, g, "mei", "official", "demo-wang", "demo-li"))
	first, _ := g.TeaHome("mei")
	again, err := g.TeaAcceptMission("mei")
	if err != nil || again.Mission.CompletedAt != first.Mission.CompletedAt || again.Coins != first.Coins {
		t.Fatal("reaccept rewrote completion")
	}
	_, err = g.TeaStepSession("mei", s.ID, TeaStep{Revision: s.Revision, Advance: 1, RequestID: "finished-new"})
	if err == nil {
		t.Fatal("finished session mutable")
	}
	after, _ := g.TeaHome("mei")
	if after.Coins != first.Coins || after.Mission.Income != first.Mission.Income || after.Mission.CompletedAt != first.Mission.CompletedAt || *after.Mission.RunID != *first.Mission.RunID {
		t.Fatal("repeated mission income")
	}
}

func TestTeaTownHTTPMissionAuthority(t *testing.T) {
	e := setup(t)
	token := e.login(t, "wang")
	other := e.login(t, "li")
	for _, body := range []any{map[string]any{"coins": 99999}, map[string]any{"status": "completed"}} {
		status, _ := e.call(t, "/api/tea/mission/accept", token, body)
		if status != 400 {
			t.Fatal("client forged mission", status)
		}
	}
	status, _ := e.call(t, "/api/tea/mission/accept", "", map[string]any{})
	if status != 401 {
		t.Fatal("unauthed accept", status)
	}
	status, _ = e.call(t, "/api/tea/mission/accept", token, map[string]any{})
	if status != 200 {
		t.Fatal("accept", status)
	}
	mine, _ := e.g.TeaHome("wang")
	theirs, _ := e.g.TeaHome("li")
	if mine.Mission.Status != "accepted" || theirs.Mission.Status != "offered" {
		t.Fatal("cross-player task state")
	}
	p := livePlan()
	p.Stock = 20
	status, body := e.call(t, "/api/tea/sessions", token, TeaOpenSession{Lesson: "rescue", Mode: "official", Key: "town-http", Plan: p})
	if status != 200 {
		t.Fatal(status, body)
	}
	var id string
	if err := json.Unmarshal(body["id"], &id); err != nil {
		t.Fatal(err)
	}
	status, _ = e.call(t, "/api/tea/sessions/"+id, other, nil)
	if status != 404 {
		t.Fatal("private session exposed")
	}
}

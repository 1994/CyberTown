package backend

import (
	"github.com/1994/boss-works-for-me/storage"
	"path/filepath"
	"testing"
)

func openBusiness(t *testing.T, g *Game, player, mode string) TeaSession {
	t.Helper()
	h, err := g.TeaHome(player)
	if err != nil {
		t.Fatal(err)
	}
	p := livePlan("demo-wang", "demo-li")
	p.Stock = h.Business.RecommendedStock
	s, err := g.TeaOpen(player, TeaOpenSession{Plan: p, Lesson: "rescue", Mode: mode, Key: randomID()})
	if err != nil {
		t.Fatal(err)
	}
	return s
}

func TestTeaBusinessProgressionAndActualRewards(t *testing.T) {
	e := setup(t)
	g := e.g
	h, err := g.TeaAcceptMission("mei")
	if err != nil {
		t.Fatal(err)
	}
	for level := 1; level <= 3; level++ {
		h, err = g.TeaHome("mei")
		if err != nil {
			t.Fatal(err)
		}
		if h.Business.Challenge.Arrivals != []int{20, 32, 48}[level-1] || h.Business.Challenge.Price != 18+level*2 || h.Business.Challenge.ShopLevel != level {
			t.Fatalf("wrong unlocked challenge: %+v", h.Business)
		}
		before := h.Coins
		if level == 2 {
			if _, err = g.TeaUpgrade("mei", 2); err == nil {
				t.Fatal("flagship unlocked before regular service")
			}
			practice := driveLive(t, g, "mei", openBusiness(t, g, "mei", "practice"))
			if !practice.Run.Result.Passed {
				t.Fatal("practice plan cannot meet the new goal")
			}
			h, _ = g.TeaHome("mei")
			if h.Business.Stage != "regulars" || h.Coins != before || h.Business.UpgradeReady {
				t.Fatal("practice advanced paid progression", h.Business)
			}
		}
		s := openBusiness(t, g, "mei", "official")
		hold := s.Hold
		paid, _ := g.TeaHome("mei")
		if paid.Coins != before-hold || s.T != 0 || s.Run.Result.Revenue != 0 {
			t.Fatal("prepaid service leaked future income")
		}
		s = driveLive(t, g, "mei", s)
		h, err = g.TeaHome("mei")
		if err != nil {
			t.Fatal(err)
		}
		net := s.Run.Result.Profit + s.Run.Result.Bonus
		t.Logf("Lv%d served=%d/%d net=%d coins=%d stage=%s", level, s.Run.Result.Completed, s.Run.Challenge.Arrivals, net, h.Coins, h.Business.Stage)
		if !s.Run.Result.Passed || net <= 0 || h.Coins != before+net {
			t.Fatal("new service not profitable or mis-settled", s.Run.Result)
		}
		stage := []string{"renovate", "expand", "complete"}[level-1]
		if h.Business.Stage != stage {
			t.Fatalf("wanted %s: %+v", stage, h.Business)
		}
		if level < 3 {
			cost := h.Shop.NextUpgradeCost
			if !h.Business.UpgradeReady {
				t.Fatal("qualified upgrade locked")
			}
			h, err = g.TeaUpgrade("mei", level)
			if err != nil {
				t.Fatal(err)
			}
			if h.Coins != before+net-cost || h.Shop.Level != level+1 {
				t.Fatal("upgrade cost mismatch")
			}
		}
	}
	if h.Coins <= 0 || h.Shop.Runs != 3 || h.AttemptsRemaining != 0 {
		t.Fatal("three-service loop or daily limits changed", h)
	}
	checkAudit(t, g)
}

func TestTeaBusinessChallengeIsFrozen(t *testing.T) {
	e := setup(t)
	_, _ = e.g.TeaAcceptMission("li")
	s := openBusiness(t, e.g, "li", "practice")
	if _, err := e.g.DB.Exec("UPDATE tea_shops SET level=3 WHERE player_id='li'"); err != nil {
		t.Fatal(err)
	}
	s = liveStep(t, e.g, "li", s, 30, "")
	if s.Run.Challenge.ShopLevel != 1 || s.Run.Challenge.Arrivals != 20 || s.Run.Challenge.Price != 20 {
		t.Fatal("upgrade rewrote active service")
	}
}

func TestTeaBusinessMigrationPreservesWalletAndOldSession(t *testing.T) {
	path := filepath.Join(t.TempDir(), "migration.db")
	g, err := Open(path, nil)
	if err != nil {
		t.Fatal(err)
	}
	_, _ = g.TeaAcceptMission("wang")
	s := openBusiness(t, g, "wang", "practice")
	err = g.transaction(func(tx storage.Tx) error {
		r, err := teaLiveRead(tx, "wang", s.ID)
		if err != nil {
			return err
		}
		r.Run.Challenge.RuleVersion, r.Run.Challenge.ShopLevel = "tea.3", 0
		return teaLiveSave(tx, &r)
	})
	if err != nil {
		t.Fatal(err)
	}
	h, _ := g.TeaHome("wang")
	before := h.Coins
	if _, err = g.DB.Exec("DROP TABLE tea_business_progress"); err != nil {
		t.Fatal(err)
	}
	g.Close()
	g, err = Open(path, nil)
	if err != nil {
		t.Fatal(err)
	}
	defer g.Close()
	h, err = g.TeaHome("wang")
	if err != nil || h.Coins != before || h.Mission.Status != "accepted" {
		t.Fatal("migration changed saved game", err)
	}
	restored, err := g.TeaGetSession("wang", s.ID)
	if err != nil || restored.Run.Challenge.RuleVersion != "tea.3" || restored.Run.Challenge.Price != 20 {
		t.Fatal("legacy challenge not frozen", err)
	}
}

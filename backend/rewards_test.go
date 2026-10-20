package backend

import (
	"path/filepath"
	"sync"
	"sync/atomic"
	"testing"
)

func TestYearBonusAtomicProgressAndRankLock(t *testing.T) {
	e := setup(t)
	first, _ := e.g.StartProject("wang")
	finish := finishCareerRun(t, e, first, 6)
	if finish.YearAward != nil {
		t.Fatal("early year bonus")
	}
	if _, _, err := e.g.Promote("wang", 0); err != nil {
		t.Fatal(err)
	}
	if _, err := e.g.highfiveReward("wang", "li"); err != nil {
		t.Fatal(err)
	}
	second, _ := e.g.StartProject("wang")
	finishCareerRun(t, e, second, 6)
	before := e.snapshot(t, "wang")
	if before.Year.Completed != 2 || before.Year.Base != 300 || before.Year.FriendPct != 10 {
		t.Fatal(before.Year)
	}
	third, _ := e.g.StartProject("wang")
	finish = finishCareerRun(t, e, third, 6)
	if finish.YearAward == nil {
		t.Fatal("missing annual award")
	}
	a := finish.YearAward
	// Income bonus snapshots: 0%,5%,5%; 6 hits each; friend boost 10%.
	if a.Year != 1 || a.Base != 300 || a.TeamPct != 3 || a.PlayPct != 6 || a.FriendPct != 10 || a.Total != 357 {
		t.Fatal(a)
	}
	if finish.Coins != before.Me.Coins+finish.Result.Total+a.Total {
		t.Fatal("year bonus missing from wallet", finish)
	}
	y := e.snapshot(t, "wang").Year
	if y.Number != 2 || y.Completed != 0 || y.Base != 450 || y.FriendPct != 0 || y.LastAward == nil || y.LastAward.Total != 357 {
		t.Fatal(y)
	}
	if _, err := e.g.FinishProject("wang", third.ID, projectActions(third, 6)); err == nil {
		t.Fatal("replay accepted")
	}
	if e.snapshot(t, "wang").Year.Number != 2 {
		t.Fatal("replay advanced year")
	}
	checkAudit(t, e.g)
}

func TestYearBonusFailureRollsBackWholeRound(t *testing.T) {
	e := setup(t)
	for i := 0; i < 2; i++ {
		r, _ := e.g.StartProject("wang")
		finishCareerRun(t, e, r, 6)
	}
	r, _ := e.g.StartProject("wang")
	e.clock.Store(r.Deadline)
	before := e.snapshot(t, "wang")
	if _, err := e.g.DB.Exec(`CREATE TRIGGER fail_year BEFORE INSERT ON year_awards BEGIN SELECT RAISE(ABORT,'test failure'); END`); err != nil {
		t.Fatal(err)
	}
	if _, err := e.g.FinishProject("wang", r.ID, projectActions(r, 6)); err == nil {
		t.Fatal("expected failure")
	}
	after := e.snapshot(t, "wang")
	if after.Year.Completed != 2 || after.Career.Performance != before.Career.Performance || after.Me.Coins != before.Me.Coins || after.ActiveRun == nil {
		t.Fatal("partial annual commit", after.Year, after.Career)
	}
	checkAudit(t, e.g)
}

func TestShopOwnershipEquipmentAndConcurrentSpending(t *testing.T) {
	e := setup(t)
	token := e.login(t, "wang")
	status, body := e.call(t, "/api/shop/buy", "", map[string]any{"itemId": "glasses", "expectedPrice": 80})
	assertCode(t, status, body, 401, "NO_SESSION")
	status, body = e.call(t, "/api/shop/buy", token, map[string]any{"itemId": "glasses"})
	assertCode(t, status, body, 400, "BAD_PRICE")
	if err := e.g.BuyItem("wang", "glasses", 1); err == nil {
		t.Fatal("accepted fake price")
	}
	if err := e.g.EquipItem("wang", "sunglasses", "accessory", "player"); err == nil {
		t.Fatal("equipped unowned item")
	}
	var success atomic.Int64
	var wg sync.WaitGroup
	for i := 0; i < 20; i++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			if e.g.BuyItem("wang", "sunglasses", 120) == nil {
				success.Add(1)
			}
		}()
	}
	wg.Wait()
	if success.Load() != 1 || e.snapshot(t, "wang").Me.Coins != 480 {
		t.Fatal("duplicate item purchase", success.Load())
	}
	if err := e.g.EquipItem("wang", "sunglasses", "shirt", "player"); err == nil {
		t.Fatal("wrong slot")
	}
	if err := e.g.EquipItem("wang", "sunglasses", "accessory", "other"); err == nil {
		t.Fatal("wrong target")
	}
	status, body = e.call(t, "/api/shop/equip", token, map[string]any{"itemId": "sunglasses", "kind": "accessory", "target": "boss"})
	assertCode(t, status, body, 200, "")
	s := e.snapshot(t, "wang")
	if s.Me.Style.BossAccessory != "sunglasses" || s.Me.Style.Accessory != "" {
		t.Fatal(s.Me.Style)
	}
	if err := e.g.EquipItem("wang", "", "accessory", "boss"); err != nil {
		t.Fatal(err)
	}
	if e.snapshot(t, "wang").Me.Style.BossAccessory != "" {
		t.Fatal("unequip failed")
	}
	if err := e.g.BuyItem("wang", "gold-aura", 360); err != nil {
		t.Fatal(err)
	}
	if err := e.g.BuyItem("wang", "sunset-shirt", 160); err == nil {
		t.Fatal("overspent")
	}
	checkAudit(t, e.g)
}

func TestShopRollbackAndRewardPersistence(t *testing.T) {
	path := filepath.Join(t.TempDir(), "reward.db")
	now := int64(1800000000000)
	g, err := Open(path, func() int64 { return now })
	if err != nil {
		t.Fatal(err)
	}
	if _, err = g.DB.Exec(`CREATE TRIGGER fail_item BEFORE INSERT ON player_items BEGIN SELECT RAISE(ABORT,'test failure'); END`); err != nil {
		t.Fatal(err)
	}
	if err = g.BuyItem("wang", "glasses", 80); err == nil {
		t.Fatal("expected failure")
	}
	s, _ := g.Snapshot("wang", nil)
	if s.Me.Coins != 600 {
		t.Fatal("partial buy", s.Me.Coins)
	}
	if _, err = g.DB.Exec("DROP TRIGGER fail_item"); err != nil {
		t.Fatal(err)
	}
	if err = g.BuyItem("wang", "mint-shirt", 160); err != nil {
		t.Fatal(err)
	}
	if err = g.EquipItem("wang", "mint-shirt", "shirt", "player"); err != nil {
		t.Fatal(err)
	}
	r, _ := g.StartProject("wang")
	now = r.Deadline
	if _, err = g.FinishProject("wang", r.ID, projectActions(r, 6)); err != nil {
		t.Fatal(err)
	}
	g.Close()
	g, err = Open(path, func() int64 { return now })
	if err != nil {
		t.Fatal(err)
	}
	defer g.Close()
	s, err = g.Snapshot("wang", nil)
	if err != nil || s.Year.Completed != 1 || s.Me.Style.Shirt != "#7bbcac" {
		t.Fatal(s.Year, s.Me.Style, err)
	}
	owned := false
	for _, i := range s.Shop {
		if i.ID == "mint-shirt" {
			owned = i.Owned
		}
	}
	if !owned {
		t.Fatal("inventory lost")
	}
	checkAudit(t, g)
	if err = g.Reset(); err != nil {
		t.Fatal(err)
	}
	s, _ = g.Snapshot("wang", nil)
	if s.Year.Number != 1 || s.Year.Completed != 0 || s.Me.Style.Shirt != "" || s.Me.Coins != 600 {
		t.Fatal("reset failed", s.Year, s.Me.Style)
	}
	for _, i := range s.Shop {
		if i.Owned {
			t.Fatal("inventory retained on reset")
		}
	}
}

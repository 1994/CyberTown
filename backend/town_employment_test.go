package backend

import (
	"context"
	"encoding/json"
	"github.com/1994/boss-works-for-me/identity"
	"sync"
	"testing"
)

func TestTownNewIdentityVisibleWithoutLegacyOptIn(t *testing.T) {
	e := setup(t)
	g := e.g
	if _, err := g.TownEnter("wang", "wang"); err != nil {
		t.Fatal(err)
	}
	_, id, err := g.loginIdentity(context.Background(), "company", identity.User{Subject: "new-colleague", Name: "新同事"})
	if err != nil {
		t.Fatal(err)
	}
	h, err := g.TownHome("wang", "wang")
	if err != nil {
		t.Fatal(err)
	}
	found := false
	for _, c := range h.Candidates {
		if c.PlayerID == id {
			found = true
			if !c.Enabled || c.Price != 120 {
				t.Fatal(c)
			}
		}
	}
	if !found {
		t.Fatal("new login missing from shared directory")
	}
	if _, err = g.TownHire("wang", "employee:"+id, 120); err != nil {
		t.Fatal(err)
	}
	workers, err := g.TeaHome("wang")
	if err != nil {
		t.Fatal(err)
	}
	found = false
	for _, w := range workers.Workers {
		if w.ID == "employee:"+id {
			found = true
		}
	}
	if !found {
		t.Fatal("hired new identity missing from shop roster")
	}
}
func TestTownSharedEmploymentPoachAndReceipts(t *testing.T) {
	e := setup(t)
	g := e.g
	for _, p := range []string{"wang", "li", "mei", "liu"} {
		if _, err := g.TownEnter(p, p); err != nil {
			t.Fatal(err)
		}
	}
	if _, err := g.TownHire("wang", "employee:li", 120); err != nil {
		t.Fatal(err)
	}
	if _, err := g.TownHire("mei", "employee:li", 150); err == nil {
		t.Fatal("duplicate colleague contract created")
	}
	mine, _ := g.TownHome("li", "li")
	if len(mine.MyEmployments) != 1 || mine.MyEmployments[0].Employer.ID != "wang" {
		t.Fatal(mine.MyEmployments)
	}
	if _, err := g.TownStartJob("wang", "employee:li", "clean"); err != nil {
		t.Fatal(err)
	}
	e.clock.Add(60000)
	before, _ := g.TownHome("wang", "wang")
	after, err := g.TownPoach("mei", "employee:li", "wang", 180, "same-request")
	if err != nil {
		t.Fatal(err)
	}
	c := marketClone(after, "employee:li")
	if c == nil || c.XP != 60 || c.HiredPrice != 180 || c.Job != nil || after.Coins != 1820 {
		t.Fatal("transfer failed", c, after.Coins)
	}
	seller, _ := g.TownHome("wang", "wang")
	if seller.Coins != before.Coins+171 || marketClone(seller, "employee:li") != nil {
		t.Fatal("compensation/ownership", seller.Coins, before.Coins)
	}
	mine, _ = g.TownHome("li", "li")
	if mine.MyEmployments[0].Employer.ID != "mei" || mine.MyEmployments[0].PoachPrice != 270 {
		t.Fatal(mine.MyEmployments)
	}
	if _, err = g.TownPoach("liu", "employee:li", "wang", 180, "stale"); err == nil {
		t.Fatal("stale employer accepted")
	}
	// Retry is safe even after another buyer has moved the employee onward.
	if _, err = g.TownPoach("liu", "employee:li", "mei", 270, "onward"); err != nil {
		t.Fatal(err)
	}
	balance, _ := g.TownHome("mei", "mei")
	replay, err := g.TownPoach("mei", "employee:li", "wang", 180, "same-request")
	if err != nil || replay.Coins != balance.Coins || marketClone(replay, "employee:li") != nil {
		t.Fatal("receipt replay double charged", err)
	}
	if _, err = g.TownPoach("li", "employee:li", "liu", 405, "self"); err == nil {
		t.Fatal("self hire")
	}
}
func TestTownPoachConcurrentAndActiveShop(t *testing.T) {
	e := setup(t)
	g := e.g
	for _, p := range []string{"wang", "li", "mei", "liu"} {
		g.TownEnter(p, p)
	}
	if _, err := g.TownHire("wang", "employee:li", 120); err != nil {
		t.Fatal(err)
	}
	raw, _ := json.Marshal(teaLiveRecord{Run: TeaRun{Workers: []TeaWorker{{ID: "employee:li"}}}})
	// Exercise the same frozen roster read used by real live sessions.
	if _, err := g.DB.Exec("INSERT INTO tea_sessions(id,player_id,request_key,request_body,status,data,day,mode) VALUES('busy','wang','busy','{}','active',?,'2026-10-22','official')", string(raw)); err != nil {
		t.Fatal(err)
	}
	if _, err := g.TownPoach("mei", "employee:li", "wang", 180, "busy"); err == nil {
		t.Fatal("active employee stolen")
	}
	h, err := g.TownHome("li", "li")
	if err != nil || !h.MyEmployments[0].Busy {
		t.Fatal("busy state missing", err)
	}
	g.DB.Exec("DELETE FROM tea_sessions WHERE id='busy'")
	var wg sync.WaitGroup
	results := make(chan error, 2)
	for _, p := range []string{"mei", "liu"} {
		wg.Add(1)
		go func(p string) {
			defer wg.Done()
			_, err := g.TownPoach(p, "employee:li", "wang", 180, p)
			results <- err
		}(p)
	}
	wg.Wait()
	close(results)
	success := 0
	for err := range results {
		if err == nil {
			success++
		}
	}
	if success != 1 {
		t.Fatal("concurrent winners", success)
	}
	var n int
	g.DB.QueryRow("SELECT COUNT(*) FROM town_clones WHERE source_id='employee:li'").Scan(&n)
	if n != 1 {
		t.Fatal("duplicate contracts", n)
	}
}

func TestTownPoachRejectsFundsPriceAndRollsBack(t *testing.T) {
	e := setup(t)
	g := e.g
	for _, p := range []string{"wang", "li", "mei"} {
		g.TownEnter(p, p)
	}
	if _, err := g.TownHire("wang", "employee:li", 120); err != nil {
		t.Fatal(err)
	}
	if _, err := g.TownList("wang", "employee:li", 300, "list-first"); err != nil {
		t.Fatal(err)
	}
	if _, err := g.TownPoach("mei", "employee:li", "wang", 1, "wrong-price"); err == nil {
		t.Fatal("tampered price")
	}
	g.DB.Exec("UPDATE players SET coins=0 WHERE id='mei'")
	if _, err := g.TownPoach("mei", "employee:li", "wang", 180, "retry"); err == nil {
		t.Fatal("insufficient funds")
	}
	seller, _ := g.TownHome("wang", "wang")
	if len(seller.Clones) != 1 || seller.Clones[0].ListingID == nil {
		t.Fatal("failed poach mutated contract")
	}
	g.DB.Exec("UPDATE players SET coins=2000 WHERE id='mei'")
	// A ledger failure must roll back both wallets, transfer and old listing cancellation.
	if _, err := g.DB.Exec("CREATE TRIGGER fail_poach BEFORE INSERT ON ledger WHEN NEW.reason='town_poach' BEGIN SELECT RAISE(ABORT,'test ledger failure'); END"); err != nil {
		t.Fatal(err)
	}
	if _, err := g.TownPoach("mei", "employee:li", "wang", 180, "retry"); err == nil {
		t.Fatal("ledger failure accepted")
	}
	after, _ := g.TownHome("wang", "wang")
	buyer, _ := g.TownHome("mei", "mei")
	if after.Coins != seller.Coins || len(after.Clones) != 1 || after.Clones[0].ListingID == nil || buyer.Coins != 2000 {
		t.Fatal("partial transaction")
	}
	g.DB.Exec("DROP TRIGGER fail_poach")
	if _, err := g.TownPoach("mei", "employee:li", "wang", 180, "retry"); err != nil {
		t.Fatal(err)
	}
	after, _ = g.TownHome("wang", "wang")
	if len(after.Market) != 0 || len(after.Clones) != 0 {
		t.Fatal("old listing survived")
	}
}

func TestTownColleagueResaleKeepsValue(t *testing.T) {
	e := setup(t)
	g := e.g
	for _, p := range []string{"wang", "li", "mei", "liu"} {
		g.TownEnter(p, p)
	}
	if _, err := g.TownHire("wang", "employee:li", 120); err != nil {
		t.Fatal(err)
	}
	if _, err := g.TownPoach("mei", "employee:li", "wang", 180, "grow-value"); err != nil {
		t.Fatal(err)
	}
	h, err := g.TownList("mei", "employee:li", 10, "cheap-resale")
	if err != nil {
		t.Fatal(err)
	}
	listing := marketListing(h, "employee:li")
	if listing == nil {
		t.Fatal("missing listing")
	}
	h, err = g.TownBuy("liu", listing.ListingID, 10)
	if err != nil {
		t.Fatal(err)
	}
	c := marketClone(h, "employee:li")
	if c == nil || c.HiredPrice != 180 || h.Coins != 1990 {
		t.Fatal("resale reset value or charged value instead of price")
	}
	me, err := g.TownHome("li", "li")
	if err != nil || me.MyEmployments[0].PoachPrice != 270 {
		t.Fatal("resale poach quote", err, me.MyEmployments)
	}
}

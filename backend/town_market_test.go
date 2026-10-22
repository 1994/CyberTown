package backend

import (
	"sync"
	"testing"
)

func marketClone(h TownHome, source string) *TownClone {
	for i := range h.Clones {
		if h.Clones[i].ID == source {
			return &h.Clones[i]
		}
	}
	return nil
}

func marketListing(h TownHome, source string) *TownEmployeeListing {
	for i := range h.Market {
		if h.Market[i].SourceID == source {
			return &h.Market[i]
		}
	}
	return nil
}

func marketTrade(h TownHome, id string) *TownEmployeeListing {
	for i := range h.Trades {
		if h.Trades[i].ListingID == id {
			return &h.Trades[i]
		}
	}
	return nil
}

func growMarketClone(t *testing.T, e *testEnv, owner string, hirePrice int) TownHome {
	t.Helper()
	g := e.g
	if _, err := g.TownEnter(owner, owner); err != nil {
		t.Fatal(err)
	}
	if _, err := g.TownHire(owner, "system-a", hirePrice); err != nil {
		t.Fatal(err)
	}
	if _, err := g.TownStartJob(owner, "system-a", "clean"); err != nil {
		t.Fatal(err)
	}
	e.clock.Add(60000)
	if _, err := g.TownHome(owner, owner); err != nil {
		t.Fatal(err)
	}
	if _, err := g.TownStartJob(owner, "system-a", "rest"); err != nil {
		t.Fatal(err)
	}
	home, err := g.TownHome(owner, owner)
	if err != nil || marketClone(home, "system-a") == nil {
		t.Fatalf("grow clone: %v %+v", err, home.Clones)
	}
	return home
}

func TestTownMarketListBuyTransferAndLedger(t *testing.T) {
	e := setup(t)
	g := e.g
	seller := growMarketClone(t, e, "wang", 120)
	if seller.Earned != 36 {
		t.Fatalf("past job earned=%d", seller.Earned)
	}

	if _, err := g.TownList("wang", "system-b", 120, "unowned"); err == nil {
		t.Fatal("unowned clone listed")
	}
	for _, price := range []int{9, 100001} {
		if _, err := g.TownList("wang", "system-a", price, "price-bad"); err == nil {
			t.Fatalf("price %d accepted", price)
		}
	}
	if _, err := g.TownStartJob("wang", "system-a", "clean"); err != nil {
		t.Fatal(err)
	}
	if _, err := g.TownList("wang", "system-a", 150, "busy-job"); err == nil {
		t.Fatal("working clone listed")
	}
	if _, err := g.TownStartJob("wang", "system-a", "rest"); err != nil {
		t.Fatal(err)
	}

	home, err := g.TownList("wang", "system-a", 150, "market-sell")
	if err != nil {
		t.Fatal(err)
	}
	listing := marketListing(home, "system-a")
	if listing == nil || listing.Status != "active" || listing.Price != 150 || listing.Fee != 8 || listing.Proceeds != 142 {
		t.Fatalf("listing terms: %+v", listing)
	}
	again, err := g.TownList("wang", "system-a", 150, "market-sell")
	if err != nil || len(again.Market) != 1 || again.Market[0].ListingID != listing.ListingID {
		t.Fatal("listing key not idempotent", err, again.Market)
	}
	if _, err := g.TownStartJob("wang", "system-a", "clean"); err == nil {
		t.Fatal("listed clone start job")
	}
	staff, err := g.TeaHome("wang")
	if err != nil || townWorker(staff, "system-a") != nil {
		t.Fatal("listed clone entered staffing", err)
	}

	if _, err = g.TownEnter("liu", "liu"); err != nil {
		t.Fatal(err)
	}
	buyerBefore, _ := g.TeaHome("liu")
	if _, err = g.TownWithdraw("liu", listing.ListingID); err == nil {
		t.Fatal("non-seller withdrew listing")
	}
	if _, err = g.TownBuy("wang", listing.ListingID, 150); err == nil {
		t.Fatal("seller bought own listing")
	}
	bought, err := g.TownBuy("liu", listing.ListingID, 150)
	if err != nil {
		t.Fatal(err)
	}
	transfer := marketClone(bought, "system-a")
	if transfer == nil || transfer.XP != 60 || transfer.Level != 2 || transfer.HiredPrice != 150 {
		t.Fatalf("transferred clone lost XP/level: %+v", transfer)
	}
	if bought.Coins != buyerBefore.Coins-150 {
		t.Fatalf("buyer paid %d from %d", bought.Coins, buyerBefore.Coins)
	}
	sellerAfter, _ := g.TownHome("wang", "wang")
	if sellerAfter.Coins != seller.Coins+142 || sellerAfter.Earned != 36 || marketClone(sellerAfter, "system-a") != nil {
		t.Fatalf("seller settlement: %+v", sellerAfter)
	}
	if marketTrade(bought, listing.ListingID) == nil || marketTrade(bought, listing.ListingID).Status != "sold" {
		t.Fatalf("buyer trade missing: %+v", bought.Trades)
	}
	var buyerLedger, sellerLedger int
	if err = g.DB.QueryRow("SELECT COUNT(*) FROM ledger WHERE account='player:liu' AND delta=-150").Scan(&buyerLedger); err != nil {
		t.Fatal(err)
	}
	if err = g.DB.QueryRow("SELECT COUNT(*) FROM ledger WHERE account='player:wang' AND delta=142").Scan(&sellerLedger); err != nil {
		t.Fatal(err)
	}
	if buyerLedger != 1 || sellerLedger != 1 {
		t.Fatalf("market ledgers buyer=%d seller=%d", buyerLedger, sellerLedger)
	}
	var feeLedger int
	if err = g.DB.QueryRow("SELECT COUNT(*) FROM ledger WHERE account='system' AND delta=8 AND reason='town_market_fee' AND ref=?", listing.ListingID).Scan(&feeLedger); err != nil || feeLedger != 1 {
		t.Fatalf("fee ledger=%d err=%v", feeLedger, err)
	}
	checkAudit(t, g)
	repeated, err := g.TownBuy("liu", listing.ListingID, 150)
	if err != nil || repeated.Coins != bought.Coins || len(repeated.Clones) != 1 {
		t.Fatal("repeat buy not idempotent", err, repeated)
	}

	// A clone on an active shop shift cannot be listed.
	growMarketClone(t, e, "li", 150)
	if _, err = g.TeaAcceptMission("li"); err != nil {
		t.Fatal(err)
	}
	plan := TeaPlan{Assignments: []TeaAssignment{{WorkerID: "self", Role: "support"}, {WorkerID: "system-a", Role: "maker"}}, Stock: 20, Strategy: "balanced"}
	if _, err = g.TeaOpen("li", TeaOpenSession{Plan: plan, Lesson: "rescue", Mode: "practice", Key: "market-shop"}); err != nil {
		t.Fatal(err)
	}
	if _, err = g.TownList("li", "system-a", 120, "shop-active"); err == nil {
		t.Fatal("clone on active shop shift listed")
	}
}

func TestTownMarketWithdrawAndRejections(t *testing.T) {
	e := setup(t)
	g := e.g
	growMarketClone(t, e, "wang", 120)
	home, err := g.TownList("wang", "system-a", 150, "rejections")
	if err != nil {
		t.Fatal(err)
	}
	listing := marketListing(home, "system-a")
	if listing == nil {
		t.Fatal("listing missing")
	}
	if _, err = g.TownEnter("liu", "liu"); err != nil {
		t.Fatal(err)
	}
	if _, err = g.TownWithdraw("liu", listing.ListingID); err == nil {
		t.Fatal("non-seller withdrawal accepted")
	}
	withdrawn, err := g.TownWithdraw("wang", listing.ListingID)
	if err != nil || marketListing(withdrawn, "system-a") != nil || marketClone(withdrawn, "system-a") == nil {
		t.Fatal("withdraw failed", err)
	}
	if _, err = g.TownWithdraw("wang", listing.ListingID); err != nil {
		t.Fatal("withdraw retry not idempotent", err)
	}
	relisted, err := g.TownList("wang", "system-a", 150, "relisted")
	if err != nil {
		t.Fatal(err)
	}
	listing = marketListing(relisted, "system-a")

	if _, err = g.TownHire("liu", "system-a", 150); err != nil {
		t.Fatal(err)
	}
	if _, err = g.TownBuy("liu", listing.ListingID, 150); err == nil {
		t.Fatal("same-source clone bought twice")
	}
	if _, err = g.TownEnter("mei", "mei"); err != nil {
		t.Fatal(err)
	}
	if _, err = g.DB.Exec("UPDATE players SET coins=0 WHERE id='mei'"); err != nil {
		t.Fatal(err)
	}
	if _, err = g.TownBuy("mei", listing.ListingID, 150); err == nil {
		t.Fatal("insufficient buyer purchased")
	}
	if _, err = g.TownEnter("li", "li"); err != nil {
		t.Fatal(err)
	}
	for i := 0; i < 12; i++ {
		if _, err = g.DB.Exec("INSERT OR IGNORE INTO town_clones(owner_id,source_id,xp,hired_price,hired_at) VALUES('li',?,0,120,?)", "fill-"+string(rune('a'+i)), g.Now()); err != nil {
			t.Fatal(err)
		}
	}
	if _, err = g.TownBuy("li", listing.ListingID, 150); err == nil {
		t.Fatal("full roster purchased")
	}
	still, err := g.TownHome("wang", "wang")
	if err != nil || marketListing(still, "system-a") == nil || marketListing(still, "system-a").Status != "active" {
		t.Fatal("failed buys closed listing", err)
	}
}

func TestTownMarketConcurrentBuyers(t *testing.T) {
	e := setup(t)
	g := e.g
	growMarketClone(t, e, "wang", 120)
	home, err := g.TownList("wang", "system-a", 150, "race")
	if err != nil {
		t.Fatal(err)
	}
	listing := marketListing(home, "system-a")
	if listing == nil {
		t.Fatal("listing missing")
	}
	if _, err = g.TownEnter("liu", "liu"); err != nil {
		t.Fatal(err)
	}
	if _, err = g.TownEnter("mei", "mei"); err != nil {
		t.Fatal(err)
	}
	beforeLiu, _ := g.TeaHome("liu")
	beforeMei, _ := g.TeaHome("mei")

	var wg sync.WaitGroup
	results := make(chan error, 8)
	for i := 0; i < 8; i++ {
		wg.Add(1)
		buyer := "liu"
		if i%2 == 1 {
			buyer = "mei"
		}
		go func(id string) {
			defer wg.Done()
			_, err := g.TownBuy(id, listing.ListingID, 150)
			results <- err
		}(buyer)
	}
	wg.Wait()
	close(results)
	successes := 0
	for err := range results {
		if err == nil {
			successes++
		}
	}
	if successes == 0 {
		t.Fatal("no concurrent buyer succeeded")
	}
	liuHome, _ := g.TownHome("liu", "liu")
	meiHome, _ := g.TownHome("mei", "mei")
	liuClone := marketClone(liuHome, "system-a") != nil
	meiClone := marketClone(meiHome, "system-a") != nil
	if liuClone == meiClone {
		t.Fatal("concurrent buyers not exactly one winner", liuClone, meiClone)
	}
	if liuClone {
		if liuHome.Coins != beforeLiu.Coins-150 || meiHome.Coins != beforeMei.Coins {
			t.Fatal("losing buyer was charged")
		}
	} else if meiHome.Coins != beforeMei.Coins-150 || liuHome.Coins != beforeLiu.Coins {
		t.Fatal("losing buyer was charged")
	}
	var marketDebits, sellerCredits, sold int
	if err = g.DB.QueryRow("SELECT COUNT(*) FROM ledger WHERE account IN ('player:liu','player:mei') AND delta=-150").Scan(&marketDebits); err != nil {
		t.Fatal(err)
	}
	if err = g.DB.QueryRow("SELECT COUNT(*) FROM ledger WHERE account='player:wang' AND delta=142").Scan(&sellerCredits); err != nil {
		t.Fatal(err)
	}
	if err = g.DB.QueryRow("SELECT COUNT(*) FROM town_employee_market WHERE id=? AND status='sold'", listing.ListingID).Scan(&sold); err != nil {
		t.Fatal(err)
	}
	if marketDebits != 1 || sellerCredits != 1 || sold != 1 {
		t.Fatalf("race paid multiple: debits=%d credits=%d sold=%d", marketDebits, sellerCredits, sold)
	}
}

func TestTownMarketRollbackAndReopen(t *testing.T) {
	e := setup(t)
	g := e.g
	growMarketClone(t, e, "wang", 120)
	home, err := g.TownList("wang", "system-a", 150, "persist")
	if err != nil {
		t.Fatal(err)
	}
	listing := marketListing(home, "system-a")
	if listing == nil {
		t.Fatal("listing missing")
	}
	listingID := listing.ListingID
	path := databasePath(t, g)
	e.app.Close()
	e.server.Close()
	if err = g.Close(); err != nil {
		t.Fatal(err)
	}
	reopened, err := Open(path, e.clock.Load)
	if err != nil {
		t.Fatal(err)
	}
	defer reopened.Close()
	if _, err = reopened.TownEnter("liu", "liu"); err != nil {
		t.Fatal(err)
	}
	active, err := reopened.TownHome("wang", "wang")
	if err != nil || marketListing(active, "system-a") == nil {
		t.Fatal("listing lost after reopen", err, active.Market)
	}
	beforeSeller, _ := reopened.TeaHome("wang")
	beforeBuyer, _ := reopened.TeaHome("liu")
	if _, err = reopened.DB.Exec(`CREATE TRIGGER market_ledger_fail BEFORE INSERT ON ledger
		WHEN NEW.account='player:liu' BEGIN SELECT RAISE(ABORT,'injected market failure'); END`); err != nil {
		t.Fatal(err)
	}
	if _, err = reopened.TownBuy("liu", listingID, 150); err == nil {
		t.Fatal("injected ledger failure was swallowed")
	}
	rolled, _ := reopened.TownHome("wang", "wang")
	rolledBuyer, _ := reopened.TeaHome("liu")
	var status string
	if err = reopened.DB.QueryRow("SELECT status FROM town_employee_market WHERE id=?", listingID).Scan(&status); err != nil || status != "active" {
		t.Fatalf("listing status after rollback=%s err=%v", status, err)
	}
	if marketClone(rolled, "system-a") == nil || townWorker(rolledBuyer, "system-a") != nil ||
		rolled.Coins != beforeSeller.Coins || rolledBuyer.Coins != beforeBuyer.Coins {
		t.Fatal("failed buy left partial transfer")
	}
	if _, err = reopened.DB.Exec("DROP TRIGGER market_ledger_fail"); err != nil {
		t.Fatal(err)
	}
	bought, err := reopened.TownBuy("liu", listingID, 150)
	if err != nil || marketClone(bought, "system-a") == nil {
		t.Fatal("retry did not buy", err)
	}
	if err = reopened.Close(); err != nil {
		t.Fatal(err)
	}
	persisted, err := Open(path, e.clock.Load)
	if err != nil {
		t.Fatal(err)
	}
	defer persisted.Close()
	buyer, err := persisted.TownHome("liu", "liu")
	if err != nil {
		t.Fatal(err)
	}
	seller, err := persisted.TownHome("wang", "wang")
	if err != nil {
		t.Fatal(err)
	}
	if marketTrade(buyer, listingID) == nil || marketClone(buyer, "system-a") == nil || marketClone(seller, "system-a") != nil {
		t.Fatal("sold trade not persisted", buyer.Trades, buyer.Clones, seller.Clones)
	}
	if seller.Earned != 36 {
		t.Fatalf("past job earned lost after trade/reopen: %d", seller.Earned)
	}
}

package backend

import "testing"

func TestRestartTownIsPrivateAndFresh(t *testing.T) {
	e := setup(t)
	g := e.g
	token := e.login(t, "wang")
	if _, err := g.TownEnter("wang", "wang"); err != nil {
		t.Fatal(err)
	}
	if _, err := g.TownHire("wang", "system-a", 120); err != nil {
		t.Fatal(err)
	}
	if _, err := g.TownEnter("li", "li"); err != nil {
		t.Fatal(err)
	}
	before, err := g.TownHire("li", "system-a", 150)
	if err != nil {
		t.Fatal(err)
	}
	if _, err = g.TownList("wang", "system-a", 200, "restart-list"); err != nil {
		t.Fatal(err)
	}
	old := openLive(t, g, "wang", "solo", "practice")
	if _, err = g.DB.Exec("INSERT OR REPLACE INTO tea_counter_progress(player_id,day,maker_xp,service_xp,guide_seen) VALUES('wang',8,120,100,1)"); err != nil {
		t.Fatal(err)
	}
	if code, _ := e.call(t, "/api/tea/restart", token, map[string]string{"confirm": "wrong"}); code != 400 {
		t.Fatal(code)
	}
	if code, _ := e.call(t, "/api/tea/restart", token, map[string]string{"confirm": "restart-my-town"}); code != 200 {
		t.Fatal(code)
	}
	h, err := g.TownHome("wang", "wang")
	if err != nil {
		t.Fatal(err)
	}
	if h.Coins != 2000 || h.Level != 1 || h.ShopLevel != 1 || len(h.Clones) != 0 || h.Earned != 0 {
		t.Fatalf("not fresh: %+v", h)
	}
	after, err := g.TownHome("li", "li")
	if err != nil {
		t.Fatal(err)
	}
	if after.Coins != before.Coins || len(after.Clones) != 1 {
		t.Fatal("other player changed")
	}
	if _, err = g.TeaGetSession("wang", old.ID); err == nil {
		t.Fatal("old round still exists")
	}
	var count int
	if err = g.DB.QueryRow("SELECT COUNT(*) FROM tea_counter_progress WHERE player_id='wang'").Scan(&count); err != nil || count != 0 {
		t.Fatal("skills retained", err)
	}
	if err = g.DB.QueryRow("SELECT COUNT(*) FROM town_employee_market WHERE seller_id='wang' AND status='active'").Scan(&count); err != nil || count != 0 {
		t.Fatal("listing retained", err)
	}
	if code, _ := e.call(t, "/api/tea/restart", token, map[string]string{"confirm": "restart-my-town"}); code != 200 {
		t.Fatal("identity lost", code)
	}
	h, err = g.TownHome("wang", "wang")
	if err != nil || h.Coins != 2000 {
		t.Fatal("repeated restart duplicated grant", err)
	}
}

// The first request after the browser reload is the full state, not TownHome.
func TestRestartTownKeepsAuthenticatedSnapshot(t *testing.T) {
	e := setup(t)
	token := e.login(t, "wang")
	for attempt := 0; attempt < 2; attempt++ {
		if code, body := e.call(t, "/api/tea/restart", token, map[string]string{"confirm": "restart-my-town"}); code != 200 {
			t.Fatalf("restart: %d %s", code, body)
		}
		player, err := e.g.Auth(token)
		if err != nil || player != "wang" {
			t.Fatalf("session lost: %s %v", player, err)
		}
		snap, err := e.g.Snapshot(player, nil)
		if err != nil {
			t.Fatalf("reload snapshot after restart: %v", err)
		}
		if snap.Me.ID != player || snap.Me.Coins != 2000 || snap.Career.Rank != 0 || snap.Career.Performance != 0 || snap.Year.Number != 1 {
			t.Fatalf("invalid fresh snapshot: %+v", snap)
		}
	}
}

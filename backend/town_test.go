package backend

import (
	"encoding/json"
	"testing"
)

func TestPrivateTownCloneGrowthAutomaticWorkAndBuilding(t *testing.T) {
	e := setup(t)
	g := e.g
	h, err := g.TownEnter("wang", "wang")
	if err != nil {
		t.Fatal(err)
	}
	if h.Level != 1 || h.Visitor || len(h.Clones) != 0 || len(h.Candidates) == 0 || h.Coins != 2000 {
		t.Fatalf("initial private town: %+v", h)
	}
	h, err = g.TownHire("wang", "system-a", 120)
	if err != nil {
		t.Fatal(err)
	}
	if h.Coins != 1880 || len(h.Clones) != 1 || h.Clones[0].Level != 1 {
		t.Fatal("hire did not persist/debit", h)
	}
	h, err = g.TownHire("wang", "system-a", 120)
	if err != nil || h.Coins != 1880 {
		t.Fatal("hire retry double debit", err)
	}
	_, err = g.TownEnter("li", "li")
	if err != nil {
		t.Fatal(err)
	}
	if _, err = g.TownHire("li", "system-a", 120); err == nil {
		t.Fatal("stale global price accepted")
	}
	other, err := g.TownHire("li", "system-a", 150)
	if err != nil || other.Coins != 1850 {
		t.Fatal("independent clone/global demand", err)
	}
	if _, err = g.TownStartJob("wang", "system-a", "manage"); err == nil {
		t.Fatal("Lv1 manager accepted")
	}
	h, err = g.TownStartJob("wang", "system-a", "clean")
	if err != nil {
		t.Fatal(err)
	}
	firstID := h.Clones[0].Job.ID
	e.clock.Add(60000)
	h, err = g.TownHome("wang", "wang")
	if err != nil {
		t.Fatal(err)
	}
	if h.Coins != 1916 || h.Clones[0].XP != 60 || !h.Clones[0].CanStaff || h.Earned != 36 {
		t.Fatal("three auto cycles did not pay/grow", h)
	}
	h2, err := g.TownHome("wang", "wang")
	if err != nil || h2.Coins != h.Coins {
		t.Fatal("refresh double paid", err)
	}
	h, err = g.TownStartJob("wang", "system-a", "clean")
	if err != nil || h.Clones[0].Job.ID != firstID {
		t.Fatal("repeat assignment reset job", err)
	}
	e.clock.Add(120000)
	h, err = g.TownHome("wang", "wang")
	if err != nil || !h.Clones[0].CanManage || h.Clones[0].XP != 180 {
		t.Fatal("Lv3 did not unlock", err, h.Clones)
	}
	h, err = g.TownStartJob("wang", "system-a", "manage")
	if err != nil {
		t.Fatal(err)
	}
	before := h.Coins
	e.clock.Add(12 * 3600000)
	h, err = g.TownHome("wang", "wang")
	if err != nil || h.Coins != before+8*60*60 {
		t.Fatal("offline cap/manager revenue", err, h.Coins, before)
	}
	again, err := g.TownHome("wang", "wang")
	if err != nil || again.Coins != h.Coins {
		t.Fatal("offline collection replayed", err)
	}
	for level := 1; level < 5; level++ {
		cost := h.NextUpgrade.Cost
		before = h.Coins
		h, err = g.TownUpgrade("wang", level)
		if err != nil || h.Level != level+1 || h.Coins != before-cost {
			t.Fatal("building cost/gate", err, h)
		}
	}
	if h.NextUpgrade != nil || h.Title != "霓虹都会" {
		t.Fatal("final city tier", h)
	}
	h, err = g.TownStartJob("wang", "system-a", "rest")
	if err != nil || h.Clones[0].Job != nil {
		t.Fatal("recall failed", err)
	}
	money := h.Coins
	e.clock.Add(600000)
	h, err = g.TownHome("wang", "wang")
	if err != nil || h.Coins != money {
		t.Fatal("recalled worker still earned", err)
	}
	checkAudit(t, g)
}

func TestPrivateTownRoomsAndVisitorMutationBoundary(t *testing.T) {
	e := setup(t)
	a, b := e.login(t, "wang"), e.login(t, "li")
	for _, p := range []struct{ token, id string }{{a, "wang"}, {b, "li"}} {
		status, body := e.call(t, "/api/tea/town/enter", p.token, map[string]any{"ownerId": p.id})
		assertCode(t, status, body, 200, "")
	}
	sa, sb := worldStream(t, e, a), worldStream(t, e, b)
	awaitWorld(t, sa, func(ps []WorldPlayer) bool { return len(ps) == 1 && ps[0].ID == "wang" && ps[0].TownID == "wang" })
	awaitWorld(t, sb, func(ps []WorldPlayer) bool { return len(ps) == 1 && ps[0].ID == "li" && ps[0].TownID == "li" })
	status, body := e.call(t, "/api/world/focus", a, map[string]any{"targetId": "li"})
	assertCode(t, status, body, 403, "TOWN_OTHER")
	status, body = e.call(t, "/api/tea/town/enter", b, map[string]any{"ownerId": "wang"})
	assertCode(t, status, body, 200, "")
	var visit TownHome
	encoded, _ := json.Marshal(body)
	json.Unmarshal(encoded, &visit)
	if !visit.Visitor || visit.Owner.ID != "wang" {
		t.Fatal("not a read-only visit", visit)
	}
	awaitWorld(t, sa, func(ps []WorldPlayer) bool { return len(ps) == 2 })
	for _, p := range []string{"/api/tea/town/hire", "/api/tea/town/jobs", "/api/tea/town/upgrade", "/api/tea/explore", "/api/tea/mission/accept", "/api/tea/sessions"} {
		status, body = e.call(t, p, b, map[string]any{})
		assertCode(t, status, body, 403, "TOWN_VISITOR")
	}
	status, body = e.call(t, "/api/tea/town/enter", b, map[string]any{"ownerId": "li"})
	assertCode(t, status, body, 200, "")
	awaitWorld(t, sa, func(ps []WorldPlayer) bool { return len(ps) == 1 && ps[0].ID == "wang" })
}

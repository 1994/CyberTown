package backend

import "testing"

func TestPropertyOwnershipPaymentAndRestart(t *testing.T) {
	e := setup(t)
	g := e.g
	if _, err := g.TownEnter("wang", "wang"); err != nil {
		t.Fatal(err)
	}
	if _, err := g.TownBuyProperty("wang", "old-town", 20000); err == nil {
		t.Fatal("allowed insufficient coins")
	}
	if _, err := g.DB.Exec("UPDATE players SET coins=100000 WHERE id='wang'"); err != nil {
		t.Fatal(err)
	}
	if _, err := g.TownBuyProperty("wang", "old-town", 1); err == nil {
		t.Fatal("accepted client price")
	}
	h, err := g.TownBuyProperty("wang", "old-town", 20000)
	if err != nil {
		t.Fatal(err)
	}
	if h.Coins != 80000 || len(h.Properties) != 1 {
		t.Fatal("purchase not persisted", h)
	}
	h, err = g.TownBuyProperty("wang", "old-town", 20000)
	if err != nil || h.Coins != 80000 {
		t.Fatal("duplicate debit", err)
	}
	view, err := g.TownHome("li", "wang")
	if err != nil || len(view.Properties) != 1 {
		t.Fatal("visitor cannot see ownership", err)
	}
	other, err := g.TownEnter("li", "li")
	if err != nil || len(other.Properties) != 0 {
		t.Fatal("ownership leaked", err)
	}
	token := e.login(t, "li")
	if code, _ := e.call(t, "/api/tea/town/enter", token, map[string]string{"ownerId": "wang"}); code != 200 {
		t.Fatal(code)
	}
	if code, _ := e.call(t, "/api/tea/town/property/buy", token, map[string]any{"propertyId": "night-market", "expectedPrice": 80000}); code != 403 {
		t.Fatal("visitor purchase allowed", code)
	}
	if err = g.RestartTown("wang"); err != nil {
		t.Fatal(err)
	}
	h, err = g.TownHome("wang", "wang")
	if err != nil || len(h.Properties) != 0 {
		t.Fatal("restart retained property", err)
	}
}

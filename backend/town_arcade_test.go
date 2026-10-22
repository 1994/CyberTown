package backend

import (
	"github.com/1994/boss-works-for-me/gameplay"
	"sync"
	"testing"
)

func TestArcadeRegistration(t *testing.T) {
	e := setup(t)
	g := e.g
	before, _ := g.TeaHome("wang")
	if _, err := g.ArcadeRegister("wang", "coming-soon", "closed-key", 18, 11.2); err == nil {
		t.Fatal("closed game charged")
	}
	after, _ := g.TeaHome("wang")
	if after.Coins != before.Coins {
		t.Fatal("closed changed balance")
	}
	game := gameplay.ArcadeGame{ID: "test-game", Fee: 20, Ready: true}
	if _, err := g.arcadeRegister("wang", game, "far-key-1", 0, 0); err == nil {
		t.Fatal("remote admission")
	}
	if _, err := g.arcadeRegister("wang", game, "short", 18, 11.2); err == nil {
		t.Fatal("invalid key")
	}
	var wg sync.WaitGroup
	for i := 0; i < 8; i++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			if _, err := g.arcadeRegister("wang", game, "same-key-1", 18, 11.2); err != nil {
				t.Error(err)
			}
		}()
	}
	wg.Wait()
	after, _ = g.TeaHome("wang")
	if after.Coins != before.Coins-20 {
		t.Fatalf("charged retries: %d", after.Coins)
	}
	var total int
	if err := g.DB.QueryRow("SELECT SUM(delta) FROM ledger WHERE ref='arcade:test-game:same-key-1'").Scan(&total); err != nil || total != 0 {
		t.Fatal("unbalanced ledger", total, err)
	}
	if _, err := g.arcadeRegister("wang", game, "same-key-1", 0, 0); err != nil {
		t.Fatal("cannot recover paid receipt", err)
	}
	game.Fee = 999999
	if _, err := g.arcadeRegister("wang", game, "no-coins-key", 18, 11.2); err == nil {
		t.Fatal("insufficient balance accepted")
	}
	after, _ = g.TeaHome("wang")
	if after.Coins != before.Coins-20 {
		t.Fatal("failed payment changed balance")
	}
}
func TestArcadeHTTPClosedAndAuth(t *testing.T) {
	e := setup(t)
	status, _ := e.call(t, "/api/tea/arcade", "", nil)
	if status != 401 {
		t.Fatal(status)
	}
	token := e.login(t, "wang")
	status, _ = e.call(t, "/api/tea/arcade", token, nil)
	if status != 200 {
		t.Fatal(status)
	}
	status, _ = e.call(t, "/api/tea/arcade/register", token, map[string]any{"gameId": "coming-soon", "key": "closed-key"})
	if status != 409 {
		t.Fatal(status)
	}
}

func TestArcadeLedgerFailureRollsBack(t *testing.T) {
	e := setup(t)
	before, _ := e.g.TeaHome("li")
	if _, err := e.g.DB.Exec(`CREATE TRIGGER reject_arcade BEFORE INSERT ON ledger WHEN NEW.reason='arcade_entry' BEGIN SELECT RAISE(ABORT, 'test'); END`); err != nil {
		t.Fatal(err)
	}
	_, err := e.g.arcadeRegister("li", gameplay.ArcadeGame{ID: "test", Fee: 20, Ready: true}, "rollback-key", 18, 11.2)
	if err == nil {
		t.Fatal("expected storage failure")
	}
	after, _ := e.g.TeaHome("li")
	if after.Coins != before.Coins {
		t.Fatal("fee not rolled back")
	}
}

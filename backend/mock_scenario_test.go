package backend

import (
	"os"
	"path/filepath"
	"strings"
	"sync"
	"testing"
)

func TestMockScenarioAtomicIdempotentPersisted(t *testing.T) {
	path := filepath.Join(t.TempDir(), "mock.db")
	g, e := Open(path, nil)
	if e != nil {
		t.Fatal(e)
	}
	f, e := os.Open("../examples/storage/tea-team.json")
	if e != nil {
		t.Fatal(e)
	}
	s, e := DecodeMockScenario(f)
	f.Close()
	if e != nil {
		t.Fatal(e)
	}
	var wg sync.WaitGroup
	for range 8 {
		wg.Add(1)
		go func() {
			defer wg.Done()
			if e := g.ApplyMockScenario(s); e != nil {
				t.Error(e)
			}
		}()
	}
	wg.Wait()
	h, e := g.TownHome("wang", "wang")
	if e != nil {
		t.Fatal(e)
	}
	if h.Coins != 5000 || h.ShopLevel != 2 || len(h.Clones) != 2 {
		t.Fatalf("bad scenario %+v", h)
	}
	xp := map[string]int{}
	for _, c := range h.Clones {
		xp[c.ID] = c.XP
	}
	if xp["system-a"] != 60 || xp["system-b"] != 180 {
		t.Fatal(xp)
	}
	var balance int
	g.DB.QueryRow("SELECT SUM(delta) FROM ledger WHERE reason='mock_grant'").Scan(&balance)
	if balance != 0 {
		t.Fatal("unbalanced grant", balance)
	}
	s.Players[0].CoinsGrant++
	if e := g.ApplyMockScenario(s); e == nil {
		t.Fatal("changed fixture silently reapplied")
	}
	g.Close()
	g, e = Open(path, nil)
	if e != nil {
		t.Fatal(e)
	}
	defer g.Close()
	s.Players[0].CoinsGrant--
	if e = g.ApplyMockScenario(s); e != nil {
		t.Fatal(e)
	}
	h, _ = g.TownHome("wang", "wang")
	if h.Coins != 5000 {
		t.Fatal("grant repeated after reopen", h.Coins)
	}
	bad := MockScenario{ID: "fail", Players: []MockPlayer{{PlayerID: "wang", CoinsGrant: 100}, {PlayerID: "li", Clones: []MockClone{{SourceID: "missing"}}}}}
	if e = g.ApplyMockScenario(bad); e == nil {
		t.Fatal("invalid clone accepted")
	}
	h, _ = g.TownHome("wang", "wang")
	if h.Coins != 5000 {
		t.Fatal("partial fixture persisted")
	}
	var n int
	g.DB.QueryRow("SELECT COUNT(*) FROM meta WHERE key='mock_scenario:fail'").Scan(&n)
	if n != 0 {
		t.Fatal("failed marker persisted")
	}
}
func TestMockScenarioValidationAndProduction(t *testing.T) {
	for _, raw := range []string{`{"id":"a","players":[],"typo":1}`, `{"id":"a","players":[{"playerId":"wang","coinsGrant":-1}]}`, `{"id":"a","players":[{"playerId":"wang"}]} {}`, strings.Repeat(" ", 1<<20) + "{}"} {
		if _, e := DecodeMockScenario(strings.NewReader(raw)); e == nil {
			t.Fatal("accepted invalid fixture")
		}
	}
	g, e := OpenWithOptions(":memory:", nil, DatabaseOptions{})
	if e != nil {
		t.Fatal(e)
	}
	defer g.Close()
	if e = g.ApplyMockScenario(MockScenario{ID: "x", Players: []MockPlayer{{PlayerID: "wang", CoinsGrant: 10}}}); e == nil {
		t.Fatal("production accepted mock")
	}
}

func TestMockScenarioColleaguesRecruitmentAndPersistence(t *testing.T) {
	path := filepath.Join(t.TempDir(), "colleagues.db")
	g, err := Open(path, nil)
	if err != nil {
		t.Fatal(err)
	}
	fixture := `{"id":"colleagues-test","colleagues":[{"playerId":"mock-lin","name":"小林","avatarUrl":"https://example.com/lin.png","color":"#aabbcc"}],"players":[{"playerId":"wang","clones":[{"sourceId":"employee:mock-lin","xp":60}]}]}`
	s, err := DecodeMockScenario(strings.NewReader(fixture))
	if err != nil {
		t.Fatal(err)
	}
	for range 2 {
		if err = g.ApplyMockScenario(s); err != nil {
			t.Fatal(err)
		}
	}
	h, err := g.TownHome("wang", "wang")
	if err != nil {
		t.Fatal(err)
	}
	found := 0
	for _, c := range h.Candidates {
		if c.PlayerID == "mock-lin" {
			found++
			if c.Name != "小林" || c.AvatarURL != "https://example.com/lin.png" || !c.Owned || !c.Enabled {
				t.Fatalf("bad colleague: %+v", c)
			}
		}
	}
	if found != 1 || len(h.Clones) != 1 {
		t.Fatalf("recruitment missing: %d %+v", found, h.Clones)
	}
	var sessions int
	if err = g.DB.QueryRow("SELECT COUNT(*) FROM sessions WHERE player_id='mock-lin'").Scan(&sessions); err != nil || sessions != 0 {
		t.Fatal("fixture issued login credentials", err)
	}
	g.Close()
	g, err = Open(path, nil)
	if err != nil {
		t.Fatal(err)
	}
	defer g.Close()
	if err = g.ApplyMockScenario(s); err != nil {
		t.Fatal(err)
	}
	// A different fixture must not overwrite an existing colleague or add an earlier entry partially.
	bad := MockScenario{ID: "conflict", Colleagues: []MockColleague{{PlayerID: "mock-new", Name: "新同事"}, {PlayerID: "mock-lin", Name: "被覆盖"}}}
	if err = g.ApplyMockScenario(bad); err == nil {
		t.Fatal("duplicate colleague overwritten")
	}
	var n int
	if err = g.DB.QueryRow("SELECT COUNT(*) FROM players WHERE id='mock-new'").Scan(&n); err != nil || n != 0 {
		t.Fatal("partial import survived", err)
	}
	var name string
	if err = g.DB.QueryRow("SELECT name FROM players WHERE id='mock-lin'").Scan(&name); err != nil || name != "小林" {
		t.Fatal("existing profile changed", err)
	}
}

func TestMockScenarioColleagueValidation(t *testing.T) {
	for _, raw := range []string{
		`{"id":"x","colleagues":[{"playerId":"wang","name":"x"}]}`,
		`{"id":"x","colleagues":[{"playerId":"mock-a","name":""}]}`,
		`{"id":"x","colleagues":[{"playerId":"mock-a","name":"x","color":"red"}]}`,
		`{"id":"x","colleagues":[{"playerId":"mock-a","name":"x","avatarUrl":"javascript:alert(1)"}]}`,
		`{"id":"x","colleagues":[{"playerId":"mock-a","name":"x"},{"playerId":"mock-a","name":"y"}]}`,
	} {
		if _, err := DecodeMockScenario(strings.NewReader(raw)); err == nil {
			t.Fatalf("accepted %s", raw)
		}
	}
}

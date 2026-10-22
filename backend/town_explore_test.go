package backend

import (
	"encoding/json"
	"fmt"
	"io"
	"math"
	"net/http"
	"path/filepath"
	"strings"
	"sync"
	"testing"

	"github.com/1994/boss-works-for-me/gameplay"
)

func decodeTeaHome(t *testing.T, body map[string]json.RawMessage) TeaHome {
	t.Helper()
	raw, err := json.Marshal(body)
	if err != nil {
		t.Fatal(err)
	}
	var h TeaHome
	if err = json.Unmarshal(raw, &h); err != nil {
		t.Fatal(err)
	}
	return h
}

func worldPosition(e *testEnv, id string) (float64, float64) {
	e.app.mu.Lock()
	defer e.app.mu.Unlock()
	p := e.app.ensureWorldLocked(id)
	return p.X, p.Z
}

func moveNear(t *testing.T, e *testEnv, token, player string, targetX, targetZ float64) {
	t.Helper()
	for step := 0; step < 40; step++ {
		x, z := worldPosition(e, player)
		dist := math.Hypot(targetX-x, targetZ-z)
		if dist <= 1 {
			return
		}
		size := math.Min(7, dist)
		nextX := x + (targetX-x)/dist*size
		nextZ := z + (targetZ-z)/dist*size
		e.clock.Add(1000)
		status, body := e.call(t, "/api/world/move", token, map[string]any{
			"x": nextX, "z": nextZ, "yaw": 0, "moving": true,
		})
		assertCode(t, status, body, 200, "")
	}
	t.Fatal("did not reach world destination")
}

func rawExplore(e *testEnv, token, site string) (int, error) {
	req, err := http.NewRequest(http.MethodPost, e.server.URL+"/api/tea/explore",
		strings.NewReader(fmt.Sprintf(`{"siteId":%q}`, site)))
	if err != nil {
		return 0, err
	}
	req.Header.Set("Authorization", "Bearer "+token)
	req.Header.Set("Content-Type", "application/json")
	res, err := http.DefaultClient.Do(req)
	if err != nil {
		return 0, err
	}
	defer res.Body.Close()
	_, _ = io.Copy(io.Discard, res.Body)
	return res.StatusCode, nil
}

func explorationSite(h TeaHome, id string) TownOpportunityState {
	for _, site := range h.Exploration.Opportunities {
		if site.ID == id {
			return site
		}
	}
	return TownOpportunityState{}
}

func TestTownExploreHTTPProximityAndRewards(t *testing.T) {
	e := setup(t)
	wang := e.login(t, "wang")

	status, body := e.call(t, "/api/tea/explore", "", map[string]any{"siteId": "west-market"})
	assertCode(t, status, body, 401, "NO_SESSION")
	status, body = e.call(t, "/api/tea/explore", wang, map[string]any{"siteId": "made-up"})
	assertCode(t, status, body, 400, "TOWN_SITE")
	status, body = e.call(t, "/api/tea/explore", wang, map[string]any{
		"siteId": "west-market", "x": -64.0, "z": -12.0,
	})
	assertCode(t, status, body, 400, "TEA_BODY")
	status, body = e.call(t, "/api/tea/explore", wang, map[string]any{"siteId": "west-market"})
	assertCode(t, status, body, 409, "TOWN_TOO_FAR")

	if _, err := e.g.TownExplore("li", "star-park", math.NaN(), 11); err == nil {
		t.Fatal("NaN coordinates accepted")
	} else if gameErr, ok := err.(*GameError); !ok || gameErr.Code != "TOWN_TOO_FAR" {
		t.Fatalf("NaN returned %v", err)
	}

	before, err := e.g.TeaHome("wang")
	if err != nil {
		t.Fatal(err)
	}
	moveNear(t, e, wang, "wang", -64, -12)
	status, body = e.call(t, "/api/tea/explore", wang, map[string]any{"siteId": "west-market"})
	assertCode(t, status, body, 200, "")
	home := decodeTeaHome(t, body)
	if home.Coins != before.Coins+30 {
		t.Fatalf("reward coins=%d want=%d", home.Coins, before.Coins+30)
	}
	first := explorationSite(home, "west-market")
	if first.VisitedAt <= 0 || home.Exploration.Visited != 1 {
		t.Fatalf("exploration not recorded: %+v", home.Exploration)
	}
	status, body = e.call(t, "/api/tea/explore", wang, map[string]any{"siteId": "west-market"})
	assertCode(t, status, body, 200, "")
	repeat := decodeTeaHome(t, body)
	if repeat.Coins != home.Coins || explorationSite(repeat, "west-market").VisitedAt != first.VisitedAt {
		t.Fatal("repeated claim paid twice")
	}
	var ledgerRows int
	var delta int
	if err = e.g.DB.QueryRow("SELECT COUNT(*),COALESCE(SUM(delta),0) FROM ledger WHERE account='player:wang' AND reason='town_explore' AND ref='town:explore:west-market'").Scan(&ledgerRows, &delta); err != nil {
		t.Fatal(err)
	}
	if ledgerRows != 1 || delta != 30 {
		t.Fatalf("ledger rows=%d delta=%d", ledgerRows, delta)
	}

	moveNear(t, e, wang, "wang", -62, 42)
	beforeConcurrent, _ := e.g.TeaHome("wang")
	var wg sync.WaitGroup
	results := make(chan int, 8)
	for i := 0; i < 8; i++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			code, err := rawExplore(e, wang, "river-dock")
			if err != nil {
				results <- -1
				return
			}
			results <- code
		}()
	}
	wg.Wait()
	close(results)
	for code := range results {
		if code != 200 {
			t.Fatalf("concurrent claim status=%d", code)
		}
	}
	afterConcurrent, _ := e.g.TeaHome("wang")
	if afterConcurrent.Coins != beforeConcurrent.Coins+30 {
		t.Fatalf("concurrent reward paid wrong: %d -> %d", beforeConcurrent.Coins, afterConcurrent.Coins)
	}
	if err = e.g.DB.QueryRow("SELECT COUNT(*) FROM ledger WHERE account='player:wang' AND ref='town:explore:river-dock'").Scan(&ledgerRows); err != nil {
		t.Fatal(err)
	}
	if ledgerRows != 1 {
		t.Fatalf("concurrent ledger rows=%d", ledgerRows)
	}

	// A different player has an independent visited set and wallet reward.
	li := e.login(t, "li")
	liBefore, _ := e.g.TeaHome("li")
	moveNear(t, e, li, "li", -64, -12)
	status, body = e.call(t, "/api/tea/explore", li, map[string]any{"siteId": "west-market"})
	assertCode(t, status, body, 200, "")
	liAfter, _ := e.g.TeaHome("li")
	wangAfter, _ := e.g.TeaHome("wang")
	if liAfter.Coins != liBefore.Coins+30 || liAfter.Exploration.Visited != 1 {
		t.Fatalf("li isolation failed: %+v", liAfter.Exploration)
	}
	if wangAfter.Exploration.Visited != 2 || wangAfter.Coins != afterConcurrent.Coins {
		t.Fatalf("wang changed by li: %+v", wangAfter.Exploration)
	}
}

func databasePath(t *testing.T, g *Game) string {
	t.Helper()
	rows, err := g.DB.Query("PRAGMA database_list")
	if err != nil {
		t.Fatal(err)
	}
	defer rows.Close()
	for rows.Next() {
		var seq int
		var name, file string
		if err = rows.Scan(&seq, &name, &file); err != nil {
			t.Fatal(err)
		}
		if name == "main" && file != "" {
			return file
		}
	}
	t.Fatal("no main database path")
	return ""
}

func TestTownExploreChainReadyAndPersistence(t *testing.T) {
	e := setup(t)
	e.login(t, "liu")
	sites := gameplay.TownOpportunities()
	for _, site := range sites {
		if _, err := e.g.TownExplore("liu", site.ID, site.X, site.Z); err != nil {
			t.Fatalf("visit %s: %v", site.ID, err)
		}
	}
	visited, err := e.g.TeaHome("liu")
	if err != nil {
		t.Fatal(err)
	}
	if visited.Exploration.Visited != 4 || visited.Exploration.FirstShopComplete || visited.Exploration.ChainReady {
		t.Fatalf("incomplete first shop chain=%+v", visited.Exploration)
	}
	if _, err = e.g.DB.Exec("UPDATE tea_shops SET level=3 WHERE player_id='liu'"); err != nil {
		t.Fatal(err)
	}
	if _, err = e.g.DB.Exec("UPDATE tea_business_progress SET flagship_best=36 WHERE player_id='liu'"); err != nil {
		t.Fatal(err)
	}
	complete, err := e.g.TeaHome("liu")
	if err != nil {
		t.Fatal(err)
	}
	if !complete.Exploration.FirstShopComplete || !complete.Exploration.ChainReady || complete.Exploration.Visited != 4 {
		t.Fatalf("complete chain not ready: %+v", complete.Exploration)
	}
	var ledgerRows int
	if err = e.g.DB.QueryRow("SELECT COUNT(*) FROM ledger WHERE account='player:liu' AND reason='town_explore'").Scan(&ledgerRows); err != nil || ledgerRows != 4 {
		t.Fatalf("exploration ledger rows=%d err=%v", ledgerRows, err)
	}

	path := databasePath(t, e.g)
	e.app.Close()
	e.server.Close()
	if err = e.g.Close(); err != nil {
		t.Fatal(err)
	}
	reopened, err := Open(path, e.clock.Load)
	if err != nil {
		t.Fatal(err)
	}
	defer reopened.Close()
	persisted, err := reopened.TeaHome("liu")
	if err != nil {
		t.Fatal(err)
	}
	if persisted.Exploration.Visited != 4 || !persisted.Exploration.ChainReady {
		t.Fatalf("exploration lost after reopen: %+v", persisted.Exploration)
	}
	if err = reopened.DB.QueryRow("SELECT COUNT(*) FROM ledger WHERE account='player:liu' AND reason='town_explore'").Scan(&ledgerRows); err != nil || ledgerRows != 4 {
		t.Fatalf("ledger lost after reopen rows=%d err=%v", ledgerRows, err)
	}
}

func TestTownExploreMigrationAndAtomicReward(t *testing.T) {
	path := filepath.Join(t.TempDir(), "existing.db")
	g, err := Open(path, nil)
	if err != nil {
		t.Fatal(err)
	}
	old, err := g.TeaHome("mei")
	if err != nil {
		t.Fatal(err)
	}
	if _, err = g.DB.Exec("DROP TABLE town_explorations"); err != nil {
		t.Fatal(err)
	}
	g.Close()
	g, err = Open(path, nil)
	if err != nil {
		t.Fatal(err)
	}
	defer g.Close()
	h, err := g.TeaHome("mei")
	if err != nil || h.Coins != old.Coins || h.Shop.Level != old.Shop.Level || h.Exploration.Visited != 0 || h.Exploration.Total != 4 {
		t.Fatalf("additive migration changed save: %+v %v", h, err)
	}
	if _, err = g.DB.Exec(`CREATE TRIGGER deny_town_reward BEFORE INSERT ON ledger WHEN NEW.reason='town_explore' BEGIN SELECT RAISE(ABORT, 'injected reward failure'); END`); err != nil {
		t.Fatal(err)
	}
	if _, err = g.TownExplore("mei", "west-market", -64, -12); err == nil {
		t.Fatal("injected failure not returned")
	}
	h, err = g.TeaHome("mei")
	if err != nil || h.Coins != old.Coins || h.Exploration.Visited != 0 {
		t.Fatal("failed reward partially committed", h.Exploration, err)
	}
	if _, err = g.DB.Exec("DROP TRIGGER deny_town_reward"); err != nil {
		t.Fatal(err)
	}
	h, err = g.TownExplore("mei", "west-market", -64, -12)
	if err != nil || h.Coins != old.Coins+30 || h.Exploration.Visited != 1 {
		t.Fatal("retry after rollback failed", h.Exploration, err)
	}
	checkAudit(t, g)
}

package backend

import (
	"bufio"
	"encoding/json"
	"net/http"
	"os"
	"path/filepath"
	"reflect"
	"strings"
	"sync"
	"testing"
	"time"
)

func worldStream(t *testing.T, e *testEnv, token string) <-chan []WorldPlayer {
	t.Helper()
	res, err := http.Get(e.server.URL + "/api/events?token=" + token)
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { res.Body.Close() })
	out := make(chan []WorldPlayer, 64)
	go func() {
		defer close(out)
		scanner := bufio.NewScanner(res.Body)
		for scanner.Scan() {
			line := scanner.Text()
			if !strings.HasPrefix(line, "data: ") {
				continue
			}
			var msg struct {
				Type    string        `json:"type"`
				Players []WorldPlayer `json:"players"`
			}
			if json.Unmarshal([]byte(strings.TrimPrefix(line, "data: ")), &msg) == nil && msg.Type == "world" {
				select {
				case out <- msg.Players:
				default:
				}
			}
		}
	}()
	return out
}

func awaitWorld(t *testing.T, stream <-chan []WorldPlayer, check func([]WorldPlayer) bool) {
	t.Helper()
	timer := time.NewTimer(2 * time.Second)
	defer timer.Stop()
	for {
		select {
		case players, ok := <-stream:
			if !ok {
				t.Fatal("world stream closed")
			}
			if check(players) {
				return
			}
		case <-timer.C:
			t.Fatal("world update did not arrive")
		}
	}
}

func TestSharedWorldMovementAndSocialSSE(t *testing.T) {
	e := setup(t)
	a, b := e.login(t, "wang"), e.login(t, "li")
	worldStream(t, e, a)
	streamB := worldStream(t, e, b)
	awaitWorld(t, streamB, func(players []WorldPlayer) bool { return len(players) == 2 })
	e.clock.Add(200)
	status, body := e.call(t, "/api/world/move", a, map[string]any{"x": 0.8, "z": 11, "yaw": 1, "moving": true})
	assertCode(t, status, body, 200, "")
	awaitWorld(t, streamB, func(players []WorldPlayer) bool {
		for _, p := range players {
			if p.ID == "wang" && p.X == 0.8 && p.Moving {
				return true
			}
		}
		return false
	})
	status, body = e.call(t, "/api/world/social", a, map[string]any{"emote": "wave", "text": "一起摸鱼？"})
	assertCode(t, status, body, 200, "")
	awaitWorld(t, streamB, func(players []WorldPlayer) bool {
		for _, p := range players {
			if p.ID == "wang" && p.Emote == "wave" && p.Said == "一起摸鱼？" {
				return true
			}
		}
		return false
	})
	e.clock.Add(6001)
	status, body = e.call(t, "/api/world", a, nil)
	assertCode(t, status, body, 200, "")
	var players []WorldPlayer
	json.Unmarshal(body["players"], &players)
	if len(players) != 2 {
		t.Fatal(players)
	}
	for _, p := range players {
		if p.Emote != "" || p.Said != "" || p.Moving {
			t.Fatal("expired animation/bubble not cleared", p)
		}
	}
	status, body = e.call(t, "/api/logout", b, map[string]any{})
	assertCode(t, status, body, 200, "")
	status, body = e.call(t, "/api/world", a, nil)
	assertCode(t, status, body, 200, "")
	json.Unmarshal(body["players"], &players)
	if len(players) != 1 || players[0].ID != "wang" {
		t.Fatal("offline player remained visible", players)
	}
}

func TestWorldRejectsInvalidAndFastInputs(t *testing.T) {
	e := setup(t)
	token := e.login(t, "wang")
	status, body := e.call(t, "/api/world", "", nil)
	assertCode(t, status, body, 401, "NO_SESSION")
	e.call(t, "/api/world", token, nil)
	e.clock.Add(200)
	for _, move := range []map[string]any{
		{"x": 91, "z": 11, "yaw": 0, "moving": true},
		{"x": 0, "z": -67, "yaw": 0, "moving": true},
		{"x": nil, "z": 11, "yaw": 0, "moving": true},
		{"x": 0, "z": 11, "yaw": 0},
	} {
		status, body = e.call(t, "/api/world/move", token, move)
		assertCode(t, status, body, 400, "BAD_POSITION")
	}
	status, body = e.call(t, "/api/world/move", token, map[string]any{"x": 20, "z": 11, "yaw": 0, "moving": true})
	assertCode(t, status, body, 409, "MOVE_TOO_FAR")
	move := map[string]any{"x": 1, "z": 11, "yaw": 0, "moving": true}
	status, body = e.call(t, "/api/world/move", token, move)
	assertCode(t, status, body, 200, "")
	status, body = e.call(t, "/api/world/move", token, move)
	assertCode(t, status, body, 429, "TOO_FAST")
	for _, social := range []map[string]any{
		{"emote": "fake"}, {"text": strings.Repeat("字", 41)}, {"text": "换\n行"}, {},
	} {
		status, body = e.call(t, "/api/world/social", token, social)
		assertCode(t, status, body, 400, "BAD_SOCIAL")
	}
	status, body = e.call(t, "/api/world/social", token, map[string]any{"text": strings.Repeat("字", 40)})
	assertCode(t, status, body, 200, "")
	status, body = e.call(t, "/api/world/social", token, map[string]any{"emote": "coffee"})
	assertCode(t, status, body, 429, "TOO_SOON")
}

func TestHighfiveDistanceOnlineCooldownAndLedger(t *testing.T) {
	e := setup(t)
	a, b := e.login(t, "wang"), e.login(t, "li")
	worldStream(t, e, a)
	worldStream(t, e, b)
	status, body := e.call(t, "/api/world/highfive", a, map[string]string{"targetId": "wang"})
	assertCode(t, status, body, 400, "BAD_TARGET")
	status, body = e.call(t, "/api/world/highfive", a, map[string]string{"targetId": "mei"})
	assertCode(t, status, body, 409, "OFFLINE")
	status, body = e.call(t, "/api/world/highfive", a, map[string]string{"targetId": "li"})
	assertCode(t, status, body, 200, "")
	if e.snapshot(t, "wang").Me.Coins != 615 || e.snapshot(t, "li").Me.Coins != 615 {
		t.Fatal("both players should receive exactly 15")
	}
	status, body = e.call(t, "/api/world/highfive", b, map[string]string{"targetId": "wang"})
	assertCode(t, status, body, 429, "TOO_SOON")
	e.clock.Add(60000)
	if _, err := e.app.moveWorld("li", 15, 11, 0, false); err != nil {
		t.Fatal(err)
	}
	status, body = e.call(t, "/api/world/highfive", a, map[string]string{"targetId": "li"})
	assertCode(t, status, body, 409, "TOO_FAR")
	checkAudit(t, e.g)
}

func TestHighfiveConcurrentAndRestartPersistence(t *testing.T) {
	dbPath := filepath.Join(t.TempDir(), "persistent.db")
	now := int64(1800000000000)
	g, err := Open(dbPath, func() int64 { return now })
	if err != nil {
		t.Fatal(err)
	}
	var wg sync.WaitGroup
	results := make(chan error, 20)
	for i := 0; i < 20; i++ {
		wg.Add(1)
		go func() { defer wg.Done(); _, err := g.highfiveReward("wang", "li"); results <- err }()
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
		t.Fatal("duplicate rewards", success)
	}
	checkAudit(t, g)
	g.Close()
	g, err = Open(dbPath, func() int64 { return now })
	if err != nil {
		t.Fatal(err)
	}
	defer g.Close()
	if _, err = g.highfiveReward("li", "wang"); err == nil {
		t.Fatal("restart bypassed pair cooldown")
	}
	now += 60000
	if _, err = g.highfiveReward("li", "wang"); err != nil {
		t.Fatal(err)
	}
	snap, _ := g.Snapshot("wang", nil)
	if snap.Me.Coins != 630 {
		t.Fatal(snap.Me.Coins)
	}
	checkAudit(t, g)
}

// The separately packaged API and web must agree on the expanded campus.
func TestCampusBoundsContractAndOuterStreetMovement(t *testing.T) {
	data, err := os.ReadFile("../contracts/world-contract.json")
	if err != nil {
		t.Fatal(err)
	}
	var contract struct {
		Bounds map[string]int `json:"bounds"`
	}
	if err = json.Unmarshal(data, &contract); err != nil {
		t.Fatal(err)
	}
	e := setup(t)
	token := e.login(t, "wang")
	status, body := e.call(t, "/api/world", token, nil)
	assertCode(t, status, body, 200, "")
	var bounds map[string]int
	if err = json.Unmarshal(body["bounds"], &bounds); err != nil {
		t.Fatal(err)
	}
	if !reflect.DeepEqual(bounds, contract.Bounds) {
		t.Fatalf("API bounds drift: %v != %v", bounds, contract.Bounds)
	}
	// Ordinary legal-speed movement reaches beyond the original 30m edge.
	for x := 5.0; x <= 40; x += 5 {
		e.clock.Add(1000)
		status, body = e.call(t, "/api/world/move", token, map[string]any{"x": x, "z": 11, "yaw": 1.57, "moving": true})
		assertCode(t, status, body, 200, "")
	}
	e.clock.Add(1000)
	status, body = e.call(t, "/api/world/move", token, map[string]any{"x": 91, "z": 11, "yaw": 0, "moving": true})
	assertCode(t, status, body, 400, "BAD_POSITION")
}

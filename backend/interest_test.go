package backend

import (
	"encoding/json"
	"fmt"
	"math"
	"math/rand"
	"sort"
	"testing"
	"time"
)

func viewIDs(players []WorldPlayer) map[string]bool {
	ids := map[string]bool{}
	for _, p := range players {
		ids[p.ID] = true
	}
	return ids
}
func TestInterestDistanceHysteresisAndFocus(t *testing.T) {
	me := WorldPlayer{ID: "me"}
	person := WorldPlayer{ID: "other", X: 25}
	view := interestPlayers(buildWorldIndex([]WorldPlayer{me, person}), me, nil, "")
	if !viewIDs(view)["other"] {
		t.Fatal("nearby missing")
	}
	previous := map[string]WorldPlayer{"other": person}
	person.X = 29
	if viewIDs(interestPlayers(buildWorldIndex([]WorldPlayer{me, person}), me, nil, ""))["other"] {
		t.Fatal("outside entry radius")
	}
	if !viewIDs(interestPlayers(buildWorldIndex([]WorldPlayer{me, person}), me, previous, ""))["other"] {
		t.Fatal("hysteresis failed")
	}
	person.X = 31
	_, nearby := selectInterest(buildWorldIndex([]WorldPlayer{me, person}), me, previous, "other")
	if nearby != 0 {
		t.Fatal("far pin inflated physical nearby count")
	}
	if viewIDs(interestPlayers(buildWorldIndex([]WorldPlayer{me, person}), me, previous, ""))["other"] {
		t.Fatal("departure missing")
	}
	if !viewIDs(interestPlayers(buildWorldIndex([]WorldPlayer{me, person}), me, previous, "other"))["other"] {
		t.Fatal("focused contact missing")
	}
}
func TestDenseInterestBoundAndStableOrdering(t *testing.T) {
	people := []WorldPlayer{{ID: "me"}}
	for i := 0; i < 300; i++ {
		people = append(people, WorldPlayer{ID: fmt.Sprintf("p%03d", i), X: 1, Z: 1})
	}
	index := buildWorldIndex(people)
	view, nearby := selectInterest(index, people[0], nil, "p299")
	if nearby != 300 {
		t.Fatal("nearby census must include people beyond render/subscription budget", nearby)
	}
	if len(view) != worldLimit+1 || !viewIDs(view)["p299"] || !viewIDs(view)["me"] {
		t.Fatal("unbounded/focus lost", len(view))
	}
	for i := 0; i < 10; i++ {
		next := interestPlayers(index, people[0], nil, "p299")
		for j, p := range view {
			if next[j].ID != p.ID {
				t.Fatal("unstable cell iteration")
			}
		}
	}
}

func TestBoundedInterestMatchesFullSort(t *testing.T) {
	r := rand.New(rand.NewSource(92))
	for trial := 0; trial < 100; trial++ {
		me := WorldPlayer{ID: "self", X: float64(r.Intn(60) - 30), Z: float64(r.Intn(40) - 20)}
		people := []WorldPlayer{me}
		previous := map[string]WorldPlayer{}
		for i := 0; i < 500; i++ {
			p := WorldPlayer{ID: fmt.Sprintf("p%03d", i), X: float64(r.Intn(90) - 45), Z: float64(r.Intn(66) - 33)}
			people = append(people, p)
			if r.Intn(3) == 0 {
				previous[p.ID] = p
			}
		}
		focus := ""
		if trial%2 == 0 {
			focus = "p499"
		}
		got, nearby := selectInterest(buildWorldIndex(people), me, previous, focus)
		want := []WorldPlayer{}
		count := 0
		for _, p := range people[1:] {
			d := math.Hypot(p.X-me.X, p.Z-me.Z)
			if d <= worldRadius {
				count++
			}
			radius := worldRadius
			if _, ok := previous[p.ID]; ok {
				radius = worldLeaveRadius
			}
			if d <= radius && p.ID != focus {
				want = append(want, p)
			}
		}
		score := func(p WorldPlayer) float64 {
			d := math.Hypot(p.X-me.X, p.Z-me.Z)
			if _, ok := previous[p.ID]; ok {
				d -= .8
			}
			return d
		}
		sort.Slice(want, func(i, j int) bool {
			a, b := score(want[i]), score(want[j])
			if a == b {
				return want[i].ID < want[j].ID
			}
			return a < b
		})
		limit := worldLimit
		if focus != "" {
			limit--
		}
		if len(want) > limit {
			want = want[:limit]
		}
		if focus != "" {
			want = append(want, people[500])
		}
		want = append(want, me)
		sort.Slice(want, func(i, j int) bool { return want[i].ID < want[j].ID })
		if count != nearby || len(want) != len(got) {
			t.Fatal("census/bound mismatch", trial)
		}
		for i := range want {
			if want[i] != got[i] {
				t.Fatalf("selection changed trial %d index %d: %s != %s", trial, i, want[i].ID, got[i].ID)
			}
		}
	}
}
func interestSubscriber(id string) *subscriber {
	return &subscriber{player: id, events: make(chan []byte, 32), worldEvents: make(chan []byte, 1), worldDelta: true, view: map[string]WorldPlayer{}}
}

type worldPacket struct {
	Partial bool          `json:"partial"`
	Players []WorldPlayer `json:"players"`
	Removed []string      `json:"removed"`
	Online  int           `json:"onlineCount"`
}

func readPacket(t *testing.T, c *subscriber) worldPacket {
	t.Helper()
	select {
	case data := <-c.worldEvents:
		var packet worldPacket
		if err := json.Unmarshal(data, &packet); err != nil {
			t.Fatal(err)
		}
		return packet
	default:
		t.Fatal("no world packet")
	}
	return worldPacket{}
}
func TestWorldDeltaDepartureSlowConsumerAndLegacy(t *testing.T) {
	e := setup(t)
	e.app.mu.Lock()
	defer e.app.mu.Unlock()
	a, b := interestSubscriber("wang"), interestSubscriber("li")
	e.app.clients[a] = true
	e.app.clients[b] = true
	e.app.world["wang"] = WorldPlayer{ID: "wang"}
	e.app.world["li"] = WorldPlayer{ID: "li", X: 2}
	flushWorldTestLocked(e.app, 1)
	packet := readPacket(t, a)
	readPacket(t, b)
	if packet.Partial || len(packet.Players) != 2 || packet.Online != 2 {
		t.Fatal("initial reset", packet)
	}
	p := e.app.world["li"]
	p.X = 3
	e.app.world["li"] = p
	flushWorldTestLocked(e.app, 2)
	packet = readPacket(t, a)
	readPacket(t, b)
	if !packet.Partial || len(packet.Players) != 1 || packet.Players[0].ID != "li" {
		t.Fatal("not a delta", packet)
	}
	p.X = 31
	e.app.world["li"] = p
	flushWorldTestLocked(e.app, 3)
	packet = readPacket(t, a)
	readPacket(t, b)
	if len(packet.Removed) != 1 || packet.Removed[0] != "li" || packet.Online != 2 {
		t.Fatal("far != offline", packet)
	}
	// Backpressure replaces the unread delta with a full reset, so no enter/removal is lost.
	p.X = 2
	e.app.world["li"] = p
	flushWorldTestLocked(e.app, 4)
	p.X = 3
	e.app.world["li"] = p
	flushWorldTestLocked(e.app, 5)
	packet = readPacket(t, a)
	readPacket(t, b)
	if packet.Partial || len(packet.Players) != 2 {
		t.Fatal("slow consumer needs full recovery", packet)
	}
	a.worldDelta = false
	p.X = 4
	e.app.world["li"] = p
	flushWorldTestLocked(e.app, 6)
	packet = readPacket(t, a)
	if packet.Partial || len(packet.Players) != 2 {
		t.Fatal("legacy client did not get full view")
	}
	// Synthetic subscriber queues must be removed before the setup cleanup closes streams.
	delete(e.app.clients, a)
	delete(e.app.clients, b)
}
func TestWorldFocusFarNavigationAndOffline(t *testing.T) {
	e := setup(t)
	token := e.login(t, "wang")
	e.app.mu.Lock()
	c := interestSubscriber("li")
	e.app.clients[c] = true
	e.app.world["li"] = WorldPlayer{ID: "li", X: -25, Z: -20}
	e.app.mu.Unlock()
	defer func() { e.app.mu.Lock(); delete(e.app.clients, c); e.app.mu.Unlock() }()
	status, body := e.call(t, "/api/world/focus", token, map[string]string{"targetId": "li"})
	assertCode(t, status, body, 200, "")
	status, body = e.call(t, "/api/world", token, nil)
	assertCode(t, status, body, 200, "")
	var players []WorldPlayer
	_ = json.Unmarshal(body["players"], &players)
	if !viewIDs(players)["li"] {
		t.Fatal("far lookup failed")
	}
	status, body = e.call(t, "/api/world/focus", token, map[string]string{"targetId": "offline"})
	assertCode(t, status, body, 409, "OFFLINE")
}

func BenchmarkCrowdedWorldFlush(b *testing.B) {
	for _, n := range []int{100, 300, 1000} {
		for _, dense := range []bool{false, true} {
			b.Run(fmt.Sprintf("n%d/dense%t", n, dense), func(b *testing.B) {
				g, err := Open(":memory:", nil)
				if err != nil {
					b.Fatal(err)
				}
				defer g.Close()
				a := NewApp(g, Options{})
				defer a.Close()
				a.mu.Lock()
				defer a.mu.Unlock()
				for i := 0; i < n; i++ {
					id := fmt.Sprint(i)
					x, z := float64(i%20)*3-28, float64((i/20)%14)*3-20
					if dense {
						x, z = 1, 1
					}
					a.world[id] = WorldPlayer{ID: id, X: x, Z: z}
					a.clients[interestSubscriber(id)] = true
				}
				b.ReportAllocs()
				b.ResetTimer()
				for i := 0; i < b.N; i++ {
					for id, p := range a.world {
						p.X += math.Sin(float64(i)) * .001
						p.UpdatedAt = time.Now().UnixMilli()
						a.world[id] = p
					}
					flushWorldTestLocked(a, i+1)
					for c := range a.clients {
						select {
						case <-c.worldEvents:
						default:
						}
					}
				}
			})
		}
	}
}

// Existing fixture mutations hold mu. Production flushing snapshots under that
// lock and computes outside it; the dedicated flush mutex serializes producers.
func flushWorldTestLocked(a *App, tick int) { a.mu.Unlock(); a.flushWorld(tick); a.mu.Lock() }

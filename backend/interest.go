package backend

import (
	"encoding/json"
	"math"
	"runtime"
	"sort"
	"sync"
	"time"
)

const worldRadius = 26.0
const worldLeaveRadius = 30.0
const worldCellSize = 10.0
const worldLimit = 64 // excluding self; dense crowds remain bounded

type worldFocus struct {
	ID    string
	Until int64
}
type worldCell struct{ X, Z int }
type worldIndex struct {
	Cells map[worldCell][]WorldPlayer
	ByID  map[string]WorldPlayer
}

func cellOf(x, z float64) worldCell {
	return worldCell{int(math.Floor(x / worldCellSize)), int(math.Floor(z / worldCellSize))}
}
func buildWorldIndex(players []WorldPlayer) worldIndex {
	index := worldIndex{Cells: map[worldCell][]WorldPlayer{}, ByID: map[string]WorldPlayer{}}
	for _, p := range players {
		key := cellOf(p.X, p.Z)
		index.Cells[key] = append(index.Cells[key], p)
		index.ByID[p.ID] = p
	}
	return index
}

// A max heap keeps only the best 64 candidates, rather than allocating and
// sorting the whole crowd for each viewer. Distance and retention are scored once.
type interestCandidate struct {
	player WorldPlayer
	score  float64
}

func candidateLess(a, b interestCandidate) bool {
	if a.score == b.score {
		return a.player.ID < b.player.ID
	}
	return a.score < b.score
}
func keepCandidate(top []interestCandidate, p interestCandidate, limit int) []interestCandidate {
	if len(top) < limit {
		top = append(top, p)
		for i := len(top) - 1; i > 0; {
			parent := (i - 1) / 2
			if !candidateLess(top[parent], top[i]) {
				break
			}
			top[parent], top[i] = top[i], top[parent]
			i = parent
		}
		return top
	}
	if !candidateLess(p, top[0]) {
		return top
	}
	top[0] = p
	for i := 0; ; {
		child := i*2 + 1
		if child >= len(top) {
			break
		}
		if child+1 < len(top) && candidateLess(top[child], top[child+1]) {
			child++
		}
		if !candidateLess(top[i], top[child]) {
			break
		}
		top[i], top[child] = top[child], top[i]
		i = child
	}
	return top
}

// Hysteresis retains previous subscriptions until 30m, entering at 26m.
// The exact focus and retention ordering is unchanged by bounded selection.
func selectInterest(index worldIndex, center WorldPlayer, previous map[string]WorldPlayer, focus string) ([]WorldPlayer, int) {
	if p, ok := index.ByID[center.ID]; ok {
		center = p
	}
	pinned, hasPin := index.ByID[focus]
	hasPin = hasPin && pinned.ID != center.ID && pinned.TownID == center.TownID
	limit := worldLimit
	if hasPin {
		limit--
	}
	top := make([]interestCandidate, 0, limit)
	nearby := 0
	min, max := cellOf(center.X-worldLeaveRadius, center.Z-worldLeaveRadius), cellOf(center.X+worldLeaveRadius, center.Z+worldLeaveRadius)
	for x := min.X; x <= max.X; x++ {
		for z := min.Z; z <= max.Z; z++ {
			for _, p := range index.Cells[worldCell{x, z}] {
				if p.ID == center.ID || p.TownID != center.TownID {
					continue
				}
				dx, dz := p.X-center.X, p.Z-center.Z
				d2 := dx*dx + dz*dz
				if d2 <= worldRadius*worldRadius {
					nearby++
				}
				if p.ID == focus {
					continue
				}
				_, retained := previous[p.ID]
				radius := worldRadius
				if retained {
					radius = worldLeaveRadius
				}
				if d2 > radius*radius {
					continue
				}
				score := math.Sqrt(d2)
				if retained {
					score -= .8
				}
				top = keepCandidate(top, interestCandidate{p, score}, limit)
			}
		}
	}
	players := make([]WorldPlayer, 0, len(top)+2)
	for _, p := range top {
		players = append(players, p.player)
	}
	if hasPin {
		players = append(players, pinned)
	}
	players = append(players, center)
	sort.Slice(players, func(i, j int) bool { return players[i].ID < players[j].ID })
	return players, nearby
}

func interestPlayers(index worldIndex, center WorldPlayer, previous map[string]WorldPlayer, focus string) []WorldPlayer {
	players, _ := selectInterest(index, center, previous, focus)
	return players
}

func (a *App) worldViewLocked(id string, previous map[string]WorldPlayer) ([]WorldPlayer, int, int) {
	players := a.worldPlayersLocked()
	focus := a.worldFocus[id]
	if focus.Until < a.Game.Now() {
		focus.ID = ""
	}
	view, nearby := selectInterest(buildWorldIndex(players), a.ensureWorldLocked(id), previous, focus.ID)
	count := 0
	for _, p := range players {
		if p.TownID == a.townOwner[id] {
			count++
		}
	}
	return view, count, nearby
}

// Movement writes mark the next 200ms batch instead of broadcasting on each POST.
func (a *App) broadcastWorld() { a.mu.Lock(); a.worldDirty = true; a.mu.Unlock() }
func (a *App) presenceChanged() {
	a.mu.Lock()
	a.worldDirty = true
	a.presenceDirty = true
	a.mu.Unlock()
}
func (a *App) worldLoop() {
	defer close(a.worldDone)
	ticker := time.NewTicker(200 * time.Millisecond)
	defer ticker.Stop()
	tick := 0
	for {
		select {
		case <-a.worldStop:
			return
		case <-ticker.C:
			tick++
			a.mu.Lock()
			if a.closed {
				a.mu.Unlock()
				return
			}
			presence := a.presenceDirty
			a.presenceDirty = false
			flush := len(a.clients) > 0 && (a.worldDirty || tick%5 == 0)
			a.worldDirty = false
			a.mu.Unlock()
			if flush {
				a.flushWorld(tick)
			}
			if presence {
				a.Broadcast(map[string]any{"kind": "presence", "at": a.Game.Now()})
			}
		}
	}
}

type worldJob struct {
	client               *subscriber
	center               WorldPlayer
	focus                string
	previous             map[string]WorldPlayer
	ready, delta, queued bool
	online, nearby       int
}
type worldFrame struct {
	client  *subscriber
	next    map[string]WorldPlayer
	nearby  int
	message []byte
}

// Only this pipeline produces world packets. Its own mutex preserves delta
// ordering while CPU-heavy AOI/JSON work runs outside the movement/global lock.
func (a *App) flushWorld(tick int) {
	a.worldFlushMu.Lock()
	defer a.worldFlushMu.Unlock()
	a.mu.Lock()
	if a.closed || len(a.clients) == 0 {
		a.mu.Unlock()
		return
	}
	all := a.worldPlayersLocked()
	now := a.Game.Now()
	if tick%25 == 0 {
		online := map[string]bool{}
		for _, p := range all {
			online[p.ID] = true
		}
		for id, p := range a.world {
			if !online[id] && now-p.UpdatedAt > 120000 {
				delete(a.world, id)
				delete(a.socialAt, id)
				delete(a.worldFocus, id)
			}
		}
		for id, focus := range a.worldFocus {
			if focus.Until < now {
				delete(a.worldFocus, id)
			}
		}
	}
	jobs := make([]worldJob, 0, len(a.clients))
	for c := range a.clients {
		focus := a.worldFocus[c.player]
		if focus.Until < now {
			focus.ID = ""
		}
		jobs = append(jobs, worldJob{c, a.ensureWorldLocked(c.player), focus.ID, c.view, c.worldReady, c.worldDelta, len(c.worldEvents) > 0, c.onlineCount, c.nearbyCount})
	}
	a.mu.Unlock()
	index := buildWorldIndex(all)
	counts := map[string]int{}
	for _, p := range all {
		counts[p.TownID]++
	}
	frames := make([]worldFrame, len(jobs))
	// Amortize scheduling with >=32 viewers per worker; bounded by available CPU.
	workers := min(32, runtime.GOMAXPROCS(0), max(1, len(jobs)/32))
	compute := func(start, end int) {
		for i := start; i < end; i++ {
			frames[i] = buildWorldFrame(index, jobs[i], tick, now, counts[jobs[i].center.TownID])
		}
	}
	if workers == 1 {
		compute(0, len(jobs))
	} else {
		var wg sync.WaitGroup
		for w := 0; w < workers; w++ {
			wg.Add(1)
			go func(w int) { defer wg.Done(); compute(w*len(jobs)/workers, (w+1)*len(jobs)/workers) }(w)
		}
		wg.Wait()
	}
	a.mu.Lock()
	defer a.mu.Unlock()
	if a.closed {
		return
	}
	for _, f := range frames {
		c := f.client
		if f.message == nil || !a.clients[c] {
			continue
		}
		c.view = f.next
		c.worldReady = true
		c.onlineCount = counts[a.townOwner[c.player]]
		c.nearbyCount = f.nearby
		// A pending old packet is known before encoding. Replace it with the full
		// current AOI, so dropping a delta cannot strand entered/removed people.
		select {
		case c.worldEvents <- f.message:
		default:
			select {
			case <-c.worldEvents:
			default:
			}
			select {
			case c.worldEvents <- f.message:
			default:
			}
		}
	}
}

func buildWorldFrame(index worldIndex, j worldJob, tick int, now int64, online int) worldFrame {
	view, nearby := selectInterest(index, j.center, j.previous, j.focus)
	next := make(map[string]WorldPlayer, len(view))
	changed := make([]WorldPlayer, 0, len(view))
	removed := []string{}
	for _, p := range view {
		old, exists := j.previous[p.ID]
		dx, dz := p.X-j.center.X, p.Z-j.center.Z
		d2 := dx*dx + dz*dz
		cadence := 1
		if d2 > 22*22 {
			cadence = 5
		} else if d2 > 12*12 {
			cadence = 2
		}
		if exists && p.ID != j.center.ID && p.ID != j.focus && tick%cadence != 0 {
			p = old
		}
		next[p.ID] = p
		if !exists || old != p {
			changed = append(changed, p)
		}
	}
	for id := range j.previous {
		if _, ok := next[id]; !ok {
			removed = append(removed, id)
		}
	}
	if j.ready && len(changed) == 0 && len(removed) == 0 && j.online == online && j.nearby == nearby {
		return worldFrame{}
	}
	sort.Strings(removed)
	partial := j.ready && j.delta && !j.queued
	players := changed
	if !partial {
		players = view
		for i, p := range view {
			players[i] = next[p.ID]
		}
		removed = []string{}
	}
	// A concrete wire struct avoids reflect/map-key sorting and interface boxing
	// for every player's packet, while preserving the JSON protocol.
	packet := struct {
		Type       string        `json:"type"`
		ServerTime int64         `json:"serverTime"`
		Online     int           `json:"onlineCount"`
		Visible    int           `json:"visibleCount"`
		Nearby     int           `json:"nearbyCount"`
		Radius     float64       `json:"radius"`
		Partial    bool          `json:"partial"`
		Removed    []string      `json:"removed"`
		Players    []WorldPlayer `json:"players"`
	}{Type: "world", ServerTime: now, Online: online, Visible: len(next), Nearby: nearby, Radius: worldRadius, Partial: partial, Removed: removed, Players: players}
	message, _ := json.Marshal(packet)
	return worldFrame{j.client, next, nearby, message}
}

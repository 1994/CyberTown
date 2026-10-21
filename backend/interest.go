package backend

import (
	"encoding/json"
	"math"
	"sort"
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

// Hysteresis retains previously subscribed people until 30m, entering at 26m.
// A selected contact is explicitly pinned, including while walking towards them.
func selectInterest(index worldIndex, center WorldPlayer, previous map[string]WorldPlayer, focus string) ([]WorldPlayer, int) {
	nearby := 0
	candidates := []WorldPlayer{}
	min, max := cellOf(center.X-worldLeaveRadius, center.Z-worldLeaveRadius), cellOf(center.X+worldLeaveRadius, center.Z+worldLeaveRadius)
	var pinned *WorldPlayer
	if p, ok := index.ByID[center.ID]; ok {
		center = p
	}
	if p, ok := index.ByID[focus]; ok && p.ID != center.ID {
		pinned = &p
	}
	for x := min.X; x <= max.X; x++ {
		for z := min.Z; z <= max.Z; z++ {
			for _, p := range index.Cells[worldCell{x, z}] {
				if p.ID == center.ID {
					continue
				}
				distance := math.Hypot(p.X-center.X, p.Z-center.Z)
				if distance <= worldRadius {
					nearby++
				}
				if p.ID == focus {
					continue
				}
				radius := worldRadius
				if _, ok := previous[p.ID]; ok {
					radius = worldLeaveRadius
				}
				if math.Hypot(p.X-center.X, p.Z-center.Z) <= radius {
					candidates = append(candidates, p)
				}
			}
		}
	}
	sort.Slice(candidates, func(i, j int) bool {
		a, b := candidates[i], candidates[j]
		da, db := math.Hypot(a.X-center.X, a.Z-center.Z), math.Hypot(b.X-center.X, b.Z-center.Z)
		// A small retention bias avoids reshuffling equally distant people in a crowd.
		if _, ok := previous[a.ID]; ok {
			da -= .8
		}
		if _, ok := previous[b.ID]; ok {
			db -= .8
		}
		if da == db {
			return a.ID < b.ID
		}
		return da < db
	})
	limit := worldLimit
	if pinned != nil {
		limit--
	}
	if len(candidates) > limit {
		candidates = candidates[:limit]
	}
	if pinned != nil {
		candidates = append(candidates, *pinned)
	}
	candidates = append(candidates, center)
	sort.Slice(candidates, func(i, j int) bool { return candidates[i].ID < candidates[j].ID })
	return candidates, nearby
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
	return view, len(players), nearby
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
			if len(a.clients) > 0 && (a.worldDirty || tick%5 == 0) {
				a.flushWorldLocked(tick)
			}
			a.worldDirty = false
			a.mu.Unlock()
			if presence {
				a.Broadcast(map[string]any{"kind": "presence", "at": a.Game.Now()})
			}
		}
	}
}

// Separate latest-only position mailboxes keep a slow viewport from filling its
// economic event queue. One subscriber receives at most five world packets/sec.
func (a *App) flushWorldLocked(tick int) {
	all := a.worldPlayersLocked()
	if tick%25 == 0 {
		online := map[string]bool{}
		for _, p := range all {
			online[p.ID] = true
		}
		for id, p := range a.world {
			if !online[id] && a.Game.Now()-p.UpdatedAt > 120000 {
				delete(a.world, id)
				delete(a.socialAt, id)
				delete(a.worldFocus, id)
			}
		}
		for id, focus := range a.worldFocus {
			if focus.Until < a.Game.Now() {
				delete(a.worldFocus, id)
			}
		}
	}
	index := buildWorldIndex(all)
	now := a.Game.Now()
	for c := range a.clients {
		focus := a.worldFocus[c.player]
		if focus.Until < now {
			focus.ID = ""
		}
		center := a.ensureWorldLocked(c.player)
		view, nearby := selectInterest(index, center, c.view, focus.ID)
		next := make(map[string]WorldPlayer, len(view))
		changed := []WorldPlayer{}
		removed := []string{}
		reset := !c.worldReady
		for _, p := range view {
			old, exists := c.view[p.ID]
			distance := math.Hypot(p.X-center.X, p.Z-center.Z)
			cadence := 1
			if distance > 22 {
				cadence = 5
			} else if distance > 12 {
				cadence = 2
			}
			if exists && p.ID != center.ID && p.ID != focus.ID && tick%cadence != 0 {
				p = old
			}
			next[p.ID] = p
			if !exists || old != p {
				changed = append(changed, p)
			}
		}
		for id := range c.view {
			if _, ok := next[id]; !ok {
				removed = append(removed, id)
			}
		}
		sort.Strings(removed)
		if !reset && len(changed) == 0 && len(removed) == 0 && c.onlineCount == len(all) && c.nearbyCount == nearby {
			continue
		}
		payload := map[string]any{"type": "world", "serverTime": now, "onlineCount": len(all), "visibleCount": len(next), "nearbyCount": nearby, "radius": worldRadius, "partial": !reset && c.worldDelta, "removed": removed}
		if !c.worldDelta || reset {
			full := make([]WorldPlayer, 0, len(next))
			for _, p := range view {
				full = append(full, next[p.ID])
			}
			payload["players"] = full
		} else {
			payload["players"] = changed
		}
		message, _ := json.Marshal(payload)
		c.view = next
		c.onlineCount = len(all)
		c.nearbyCount = nearby
		c.worldReady = true
		// When replacing an unread delta, reset to the complete current AOI. This
		// prevents a dropped enter/remove delta from leaving ghosts on slow clients.
		select {
		case c.worldEvents <- message:
		default:
			select {
			case <-c.worldEvents:
			default:
			}
			payload["partial"] = false
			payload["removed"] = []string{}
			full := make([]WorldPlayer, 0, len(next))
			for _, p := range view {
				full = append(full, next[p.ID])
			}
			payload["players"] = full
			message, _ = json.Marshal(payload)
			select {
			case c.worldEvents <- message:
			default:
			}
		}
	}
}

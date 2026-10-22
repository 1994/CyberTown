package backend

import (
	"fmt"
	"math"
	"testing"

	"github.com/1994/boss-works-for-me/gameplay"
)

func TestArrivalSpawnsWalkableAndRoutes(t *testing.T) {
	e := setup(t)
	nav := gameplay.Navigation()

	e.app.mu.Lock()
	defer e.app.mu.Unlock()

	spawns := map[[2]int]gameplay.Point{}
	for i := 0; i < 2000; i++ {
		id := fmt.Sprintf("spi-arrival-%04d", i)
		p := e.app.ensureWorldLocked(id)
		if p.X < -6 || p.X > 6 || p.Z < 10.5 || p.Z > 12.5 {
			t.Fatalf("%s spawn out of range: %v,%v", id, p.X, p.Z)
		}
		point := gameplay.Point{X: p.X, Z: p.Z}
		if nav.Blocked(point, nav.PlayerRadius) {
			t.Fatalf("%s spawn blocked: %v,%v", id, p.X, p.Z)
		}
		key := [2]int{int(math.Round(p.X * 2)), int(math.Round(p.Z * 2))}
		spawns[key] = point
	}
	if len(spawns) < 21 {
		t.Fatalf("only %d unique arrival cells", len(spawns))
	}

	goals := []struct {
		name string
		at   gameplay.Point
	}{
		{"recruit", gameplay.Point{X: -5, Z: 12}},
		{"shop", gameplay.Point{X: -19.4, Z: -1}},
	}
	checked := 0
	for _, start := range spawns {
		for _, goal := range goals {
			path, err := nav.FindPath(start, goal.at)
			if err != nil || len(path) == 0 {
				t.Fatalf("%s route from %v: %v", goal.name, start, err)
			}
			end := path[len(path)-1]
			if math.Hypot(end.X-goal.at.X, end.Z-goal.at.Z) > 0.75 {
				t.Fatalf("%s route from %v ends at %v", goal.name, start, end)
			}
			if nav.Blocked(end, nav.PlayerRadius) {
				t.Fatalf("%s route ends blocked at %v", goal.name, end)
			}
		}
		checked++
		if checked == 21 {
			break
		}
	}
	if checked != 21 {
		t.Fatalf("checked %d arrival cells", checked)
	}

	// Existing positions must survive repeated ensure calls without teleporting.
	fixed := e.app.ensureWorldLocked("spi-arrival-stable")
	fixed.X, fixed.Z = 5, 12
	e.app.world[fixed.ID] = fixed
	again := e.app.ensureWorldLocked(fixed.ID)
	if again.X != 5 || again.Z != 12 {
		t.Fatalf("existing spawn moved to %v,%v", again.X, again.Z)
	}
}

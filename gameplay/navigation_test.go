package gameplay

import (
	"math"
	"testing"
)

func TestNavigationRoutesAndNoWallCuts(t *testing.T) {
	m := Navigation()
	starts := []Point{{0, 11}, {2, 11}, {-2, 11}, {4, 11}, {-33, -24}, {33, -24}, {-33, 24}, {33, 24}}
	for _, s := range starts {
		for _, z := range m.Zones {
			path, err := m.FindPath(s, Point{z.X, z.Z})
			if err != nil {
				t.Fatalf("%v to %s: %v", s, z.ID, err)
			}
			if len(path) == 0 {
				t.Fatal("empty path")
			}
			p := s
			for _, target := range path {
				steps := max(1, int(math.Ceil(math.Hypot(target.X-p.X, target.Z-p.Z)/.025)))
				for i := 1; i <= steps; i++ {
					v := float64(i) / float64(steps)
					q := Point{p.X + (target.X-p.X)*v, p.Z + (target.Z-p.Z)*v}
					if m.Blocked(q, m.PlayerRadius) {
						t.Fatalf("%v to %s cuts obstacle at %v", s, z.ID, q)
					}
				}
				p = target
			}
			if math.Hypot(p.X-z.X, p.Z-z.Z) > 4 {
				t.Fatalf("%s route ends too far: %v", z.ID, p)
			}
		}
	}
	if _, err := m.FindPath(starts[0], Point{100, 0}); err == nil {
		t.Fatal("accepted off-map destination")
	}
	if _, err := m.FindPath(starts[0], Point{math.NaN(), 0}); err == nil {
		t.Fatal("accepted NaN")
	}
}

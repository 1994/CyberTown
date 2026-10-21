package gameplay

import (
	"container/heap"
	_ "embed"
	"encoding/json"
	"fmt"
	"math"
)

type Point struct {
	X float64 `json:"x"`
	Z float64 `json:"z"`
}
type Box struct {
	MinX float64 `json:"minX"`
	MaxX float64 `json:"maxX"`
	MinZ float64 `json:"minZ"`
	MaxZ float64 `json:"maxZ"`
}
type Circle struct {
	X float64 `json:"x"`
	Z float64 `json:"z"`
	R float64 `json:"r"`
}
type Zone struct {
	ID   string  `json:"id"`
	Name string  `json:"name"`
	X    float64 `json:"x"`
	Z    float64 `json:"z"`
}
type Map struct {
	Bounds       Box        `json:"bounds"`
	Boxes        []Box      `json:"boxes"`
	Circles      []Circle   `json:"circles"`
	Zones        []Zone     `json:"zones"`
	PlayerRadius float64    `json:"playerRadius"`
	WalkSpeed    float64    `json:"walkSpeed"`
	BeltZone     [2]float64 `json:"beltZone"`
}

//go:embed navigation.json
var navigationJSON []byte

func Navigation() Map {
	var m Map
	if err := json.Unmarshal(navigationJSON, &m); err != nil {
		panic(err)
	}
	return m
}
func (m Map) Blocked(p Point, r float64) bool {
	b := m.Bounds
	if p.X < b.MinX+.6 || p.X > b.MaxX-.6 || p.Z < b.MinZ+.6 || p.Z > b.MaxZ-.6 {
		return true
	}
	for _, b := range m.Boxes {
		dx, dz := p.X-math.Max(b.MinX, math.Min(p.X, b.MaxX)), p.Z-math.Max(b.MinZ, math.Min(p.Z, b.MaxZ))
		if dx*dx+dz*dz < r*r {
			return true
		}
	}
	for _, c := range m.Circles {
		if math.Hypot(p.X-c.X, p.Z-c.Z) < c.R+r {
			return true
		}
	}
	return false
}
func (m Map) Clear(a, b Point) bool {
	steps := max(1, int(math.Ceil(math.Hypot(a.X-b.X, a.Z-b.Z)/.05)))
	for i := 1; i <= steps; i++ {
		t := float64(i) / float64(steps)
		if m.Blocked(Point{a.X + (b.X-a.X)*t, a.Z + (b.Z-a.Z)*t}, m.PlayerRadius+.08) {
			return false
		}
	}
	return true
}

type node struct {
	id   int
	cost float64
}
type queue []node

func (q queue) Len() int           { return len(q) }
func (q queue) Less(i, j int) bool { return q[i].cost < q[j].cost }
func (q queue) Swap(i, j int)      { q[i], q[j] = q[j], q[i] }
func (q *queue) Push(x any)        { *q = append(*q, x.(node)) }
func (q *queue) Pop() any          { a := *q; x := a[len(a)-1]; *q = a[:len(a)-1]; return x }

// FindPath walks around the same furniture as the web client. Blocked landmarks
// (e.g. a pond) resolve to nearby free ground, as with the web's click-to-walk.
func (m Map) FindPath(start, goal Point) ([]Point, error) {
	b := m.Bounds
	if math.IsNaN(goal.X) || math.IsNaN(goal.Z) || math.IsInf(goal.X, 0) || math.IsInf(goal.Z, 0) || goal.X < b.MinX || goal.X > b.MaxX || goal.Z < b.MinZ || goal.Z > b.MaxZ {
		return nil, fmt.Errorf("destination outside map")
	}
	if m.Clear(start, goal) {
		return []Point{goal}, nil
	}
	const cell = .5
	w, h := int(math.Round((b.MaxX-b.MinX)/cell))+1, int(math.Round((b.MaxZ-b.MinZ)/cell))+1
	point := func(id int) Point { return Point{b.MinX + float64(id%w)*cell, b.MinZ + float64(id/w)*cell} }
	blocked := make([]bool, w*h)
	for i := range blocked {
		blocked[i] = m.Blocked(point(i), m.PlayerRadius+.12)
	}
	free := func(x, z int) bool { return x >= 0 && x < w && z >= 0 && z < h && !blocked[z*w+x] }
	nearest := func(p Point, connect bool) int {
		x, z := int(math.Round((p.X-b.MinX)/cell)), int(math.Round((p.Z-b.MinZ)/cell))
		for r := 0; r < 12; r++ {
			for dz := -r; dz <= r; dz++ {
				for dx := -r; dx <= r; dx++ {
					if max(abs(dx), abs(dz)) != r || !free(x+dx, z+dz) {
						continue
					}
					id := (z+dz)*w + x + dx
					if !connect || m.Clear(p, point(id)) {
						return id
					}
				}
			}
		}
		return -1
	}
	s, t := nearest(start, true), nearest(goal, false)
	if s < 0 || t < 0 {
		return nil, fmt.Errorf("no walkable start/destination")
	}
	dist := make([]float64, w*h)
	prev := make([]int, w*h)
	for i := range dist {
		dist[i] = math.Inf(1)
		prev[i] = -1
	}
	dist[s] = 0
	q := &queue{{s, 0}}
	heap.Init(q)
	for q.Len() > 0 {
		cur := heap.Pop(q).(node)
		if cur.id == t {
			break
		}
		if cur.cost != dist[cur.id] {
			continue
		}
		x, z := cur.id%w, cur.id/w
		for dz := -1; dz <= 1; dz++ {
			for dx := -1; dx <= 1; dx++ {
				if dx == 0 && dz == 0 || !free(x+dx, z+dz) || dx != 0 && dz != 0 && (!free(x+dx, z) || !free(x, z+dz)) {
					continue
				}
				n := (z+dz)*w + x + dx
				d := cur.cost + math.Hypot(float64(dx), float64(dz))
				if d < dist[n] {
					dist[n] = d
					prev[n] = cur.id
					heap.Push(q, node{n, d})
				}
			}
		}
	}
	if math.IsInf(dist[t], 1) {
		return nil, fmt.Errorf("no path to destination")
	}
	path := []Point{}
	for i := t; i >= 0; i = prev[i] {
		path = append(path, point(i))
	}
	for i, j := 0, len(path)-1; i < j; i, j = i+1, j-1 {
		path[i], path[j] = path[j], path[i]
	}
	if m.Clear(point(t), goal) {
		path = append(path, goal)
	}
	out := []Point{}
	a := start
	for k := 0; k < len(path); {
		far := -1
		for j := len(path) - 1; j >= k; j-- {
			if m.Clear(a, path[j]) {
				far = j
				break
			}
		}
		if far < 0 {
			return nil, fmt.Errorf("path clearance failed")
		}
		out = append(out, path[far])
		a = path[far]
		k = far + 1
	}
	return out, nil
}
func abs(n int) int {
	if n < 0 {
		return -n
	}
	return n
}

package backend

import (
	"math"
	"sort"

	"github.com/1994/boss-works-for-me/gameplay"
)

const (
	StartCoins              = 600
	InitialPrice            = 300
	MaxTeam                 = 3
	BaseProjectMS     int64 = 15000
	FinishToleranceMS int64 = 300
	FinishGraceMS     int64 = 30000
	MaxActions              = 200
)

func NextPrice(previous int) int { return ((previous*125 + 999) / 1000) * 10 }
func PriceFor(previous *int) int {
	if previous == nil {
		return InitialPrice
	}
	return NextPrice(*previous)
}
func Shares(price int, hasOwner bool) (owner, self, system int) {
	if hasOwner {
		owner = price * 90 / 100
	}
	self = price * 5 / 100
	system = price - owner - self
	return
}
func TeamSkills(team []Colleague) Skills {
	var s Skills
	for _, c := range team {
		switch c.Skill.Kind {
		case "income":
			s.IncomePct += c.Skill.Value
		case "time":
			s.TimeSec += c.Skill.Value
		case "shield":
			s.Shield += c.Skill.Value
		}
	}
	s.IncomePct = min(s.IncomePct, 75)
	s.TimeSec = min(s.TimeSec, 6)
	s.Shield = min(s.Shield, 4)
	return s
}
func ProjectDuration(s Skills) int64 { return BaseProjectMS + int64(s.TimeSec)*1000 }
func SkillText(s Skill) string {
	return map[string]string{"income": "业绩光环", "time": "时间管理", "shield": "甩锅护盾"}[s.Kind]
}

// GenerateTasks is shared with the headless player CLI.
func GenerateTasks(seed uint32, duration int64) []Task { return gameplay.GenerateTasks(seed, duration) }
func ScoreProject(tasks []Task, raw []Action, skills Skills, duration, elapsed int64) ProjectResult {
	result := ProjectResult{}
	actions := make([]Action, 0, len(raw))
	byID := map[int]Task{}
	for _, t := range tasks {
		byID[t.ID] = t
	}
	for i, a := range raw {
		if i >= MaxActions || a.TaskID < 0 || math.IsNaN(a.T) || math.IsInf(a.T, 0) {
			result.Rejected++
			continue
		}
		actions = append(actions, a)
	}
	sort.SliceStable(actions, func(i, j int) bool { return actions[i].T < actions[j].T })
	seen := map[int]bool{}
	lastT := math.Inf(-1)
	type event struct {
		t    float64
		kind string
	}
	events := []event{}
	for _, a := range actions {
		task, ok := byID[a.TaskID]
		if !ok || seen[a.TaskID] || a.T < float64(task.SpawnAt) || a.T > float64(task.SpawnAt+task.TTL) || a.T > float64(min(duration, elapsed)) || a.T-lastT < 90 {
			result.Rejected++
			continue
		}
		seen[a.TaskID] = true
		lastT = a.T
		kind := "hit"
		if task.Kind == "trap" {
			kind = "trap"
		}
		events = append(events, event{a.T, kind})
	}
	for _, t := range tasks {
		if t.Kind != "trap" && !seen[t.ID] {
			events = append(events, event{float64(t.SpawnAt + t.TTL), "miss"})
		}
	}
	sort.SliceStable(events, func(i, j int) bool { return events[i].t < events[j].t })
	combo := 0
	shield := skills.Shield
	for _, e := range events {
		if e.kind == "hit" {
			combo++
			result.Hits++
			result.MaxCombo = max(result.MaxCombo, combo)
			result.BasePoints += 8 + 2*min(combo-1, 8)
		} else {
			if e.kind == "miss" {
				result.Misses++
			} else {
				result.Traps++
			}
			if shield > 0 {
				shield--
				result.ShieldsUsed++
			} else {
				combo = 0
			}
		}
	}
	result.Total = result.BasePoints * (100 + skills.IncomePct) / 100
	result.IncomeBonus = result.Total - result.BasePoints
	return result
}

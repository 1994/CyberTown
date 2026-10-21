// Package gameplay contains deterministic client/server rules, with no database or HTTP dependencies.
package gameplay

type Task struct {
	ID      int    `json:"id"`
	Kind    string `json:"kind"`
	Lane    int    `json:"lane"`
	SpawnAt int64  `json:"spawnAt"`
	TTL     int64  `json:"ttl"`
}
type Action struct {
	TaskID int     `json:"taskId"`
	T      float64 `json:"t"`
}

// 与 shared/rules.ts 的 mulberry32 逐位一致，任务序列不能由客户端提交。
func randomSource(seed uint32) func() float64 {
	a := seed
	return func() float64 {
		a += 0x6d2b79f5
		t := (a ^ (a >> 15)) * (1 | a)
		t ^= t + (t^(t>>7))*(61|t)
		return float64(t^(t>>14)) / 4294967296
	}
}
func GenerateTasks(seed uint32, duration int64) []Task {
	r := randomSource(seed)
	tasks := []Task{}
	kinds := []string{"mail", "bug", "meeting", "report"}
	t := int64(500)
	lastLane := -1
	for t < duration-900 {
		trap := r() < .16
		lane := int(r() * 5)
		if lane == lastLane {
			lane = (lane + 1 + int(r()*4)) % 5
		}
		lastLane = lane
		kind := "trap"
		if !trap {
			kind = kinds[int(r()*4)]
		}
		ttl := int64(1900)
		if !trap {
			ttl = 2300 - min(int64(700), t/30)
		}
		tasks = append(tasks, Task{len(tasks), kind, lane, t, min(ttl, duration-t)})
		t += 420 + int64(r()*330)
	}
	return tasks
}

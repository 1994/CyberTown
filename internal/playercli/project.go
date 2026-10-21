package playercli

import (
	"context"
	"encoding/json"
	"io"
	"os"

	"github.com/1994/boss-works-for-me/gameplay"
)

type run struct {
	ID         string `json:"id"`
	Seed       uint32 `json:"seed"`
	StartedAt  int64  `json:"startedAt"`
	DurationMS int64  `json:"durationMs"`
	Deadline   int64  `json:"deadline"`
}
type journal struct {
	Server   string            `json:"server"`
	PlayerID string            `json:"playerId"`
	Run      run               `json:"run"`
	Actions  []gameplay.Action `json:"actions"`
}

func decodeStdin(r io.Reader, out any) error {
	if err := json.NewDecoder(io.LimitReader(r, 64<<10)).Decode(out); err != nil {
		return problem("BAD_INPUT", "expected JSON on stdin")
	}
	return nil
}
func (c *client) readJournal(player string, r run) (journal, error) {
	j := journal{Server: c.server, PlayerID: player, Run: r, Actions: []gameplay.Action{}}
	var saved journal
	if err := loadJSON(c.file(".project.json"), &saved); err != nil {
		if os.IsNotExist(err) {
			return j, nil
		}
		return j, problem("PROJECT_FILE", "invalid local action journal; do not overwrite recorded actions")
	}
	if saved.Server == c.server && saved.PlayerID == player && saved.Run.ID == r.ID {
		return saved, nil
	}
	return j, nil
}
func (c *client) project(ctx context.Context, args []string) error {
	if len(args) != 1 {
		return problem("USAGE", "project start|view|hit|finish")
	}
	op := args[0]
	if op != "start" && op != "view" && op != "hit" && op != "finish" {
		return problem("USAGE", "project start|view|hit|finish")
	}
	// Serialize local start/hit/finish from concurrent tool calls. Atomic replacement
	// protects readers; a killed writer leaves an explicit lock instead of losing hits.
	f, err := os.OpenFile(c.file(".project.lock"), os.O_CREATE|os.O_EXCL|os.O_WRONLY, 0600)
	if err != nil {
		return problem("PROJECT_BUSY", "another project command is running; if it was killed, remove "+c.file(".project.lock"))
	}
	_ = f.Close()
	defer os.Remove(c.file(".project.lock"))
	var view struct {
		PlayerID   string `json:"playerId"`
		ServerTime int64  `json:"serverTime"`
		ActiveRun  *run   `json:"activeRun"`
	}
	if err = c.call(ctx, "GET", "/api/project", nil, &view); err != nil {
		return err
	}
	player := view.PlayerID
	var r run
	now := view.ServerTime
	if op == "start" {
		var reply struct {
			Run        run   `json:"run"`
			ServerTime int64 `json:"serverTime"`
		}
		if err = c.call(ctx, "POST", "/api/project/start", object{}, &reply); err != nil {
			return err
		}
		r, now = reply.Run, reply.ServerTime
	} else if view.ActiveRun != nil {
		r = *view.ActiveRun
	} else if op == "finish" {
		var saved journal
		if loadJSON(c.file(".project.json"), &saved) == nil && saved.Server == c.server && saved.PlayerID == player {
			r = saved.Run
		}
	}
	if r.ID == "" {
		return problem("NO_RUN", "no active project; project start")
	}
	j, err := c.readJournal(player, r)
	if err != nil {
		return err
	}
	if op == "finish" {
		return c.result(ctx, "POST", "/api/project/finish", object{"runId": r.ID, "actions": j.Actions})
	}
	elapsed := max(int64(0), now-r.StartedAt)
	seen := map[int]bool{}
	for _, a := range j.Actions {
		seen[a.TaskID] = true
	}
	visible := []any{}
	var best *gameplay.Task
	bestP := -1.0
	zone := gameplay.Navigation().BeltZone
	if elapsed < r.DurationMS {
		for _, task := range gameplay.GenerateTasks(r.Seed, r.DurationMS) {
			if seen[task.ID] || elapsed < task.SpawnAt || elapsed > task.SpawnAt+task.TTL {
				continue
			}
			p := float64(elapsed-task.SpawnAt) / float64(task.TTL)
			in := p >= zone[0] && p <= zone[1]
			visible = append(visible, object{"id": task.ID, "kind": task.Kind, "progress": p, "inZone": in})
			if in && p > bestP {
				t := task
				best = &t
				bestP = p
			}
		}
	}
	out := object{"runId": r.ID, "serverTime": now, "elapsedMs": elapsed, "remainingMs": max(int64(0), r.DurationMS-elapsed), "deadline": r.Deadline, "visible": visible, "recordedHits": len(j.Actions), "front": best}
	if op == "hit" {
		if elapsed >= r.DurationMS {
			return problem("RUN_ENDED", "project ended; project finish")
		}
		if len(j.Actions) > 0 && float64(elapsed)-j.Actions[len(j.Actions)-1].T < 90 {
			return problem("TOO_FAST", "wait 90ms between project inputs")
		}
		out["pressed"] = true
		out["caught"] = nil
		if best != nil {
			j.Actions = append(j.Actions, gameplay.Action{TaskID: best.ID, T: float64(elapsed)})
			out["caught"] = object{"id": best.ID, "kind": best.Kind}
			out["recordedHits"] = len(j.Actions)
		}
	}
	if op == "start" || op == "hit" {
		if err = atomicJSON(c.file(".project.json"), j); err != nil {
			return err
		}
	}
	return c.emit(out)
}

package backend

import (
	"encoding/json"
	"github.com/1994/boss-works-for-me/gameplay"
	"io"
	"net/http"
	"strings"
)

func teaDecode(w http.ResponseWriter, r *http.Request, v any) error {
	r.Body = http.MaxBytesReader(w, r.Body, 64*1024)
	defer r.Body.Close()
	d := json.NewDecoder(r.Body)
	d.DisallowUnknownFields()
	if err := d.Decode(v); err != nil {
		return fail(400, "TEA_BODY", "请求格式无效")
	}
	if err := d.Decode(new(any)); err != io.EOF {
		return fail(400, "TEA_BODY", "请求只能包含一个JSON对象")
	}
	return nil
}
func (a *App) handleTea(w http.ResponseWriter, r *http.Request, player string) error {
	path := r.URL.Path
	if path == "/api/tea/town" || strings.HasPrefix(path, "/api/tea/town/") {
		return a.handleTown(w, r, player)
	}
	if r.Method != "GET" {
		a.mu.Lock()
		owner := a.townOwner[player]
		a.mu.Unlock()
		if owner != "" && owner != player {
			return fail(403, "TOWN_VISITOR", "参观时不能经营，请先回自己的小镇")
		}
	}
	switch {
	case path == "/api/tea/arcade" && r.Method == "GET":
		respond(w, 200, gameplay.Arcade())
	case path == "/api/tea/arcade/register" && r.Method == "POST":
		var body struct {
			GameID string `json:"gameId"`
			Key    string `json:"key"`
		}
		if err := teaDecode(w, r, &body); err != nil {
			return err
		}
		a.mu.Lock()
		pos := a.ensureWorldLocked(player)
		a.mu.Unlock()
		ticket, err := a.Game.ArcadeRegister(player, body.GameID, body.Key, pos.X, pos.Z)
		if err != nil {
			return err
		}
		respond(w, 200, ticket)

	case path == "/api/tea/guide" && r.Method == "POST":
		var body struct{}
		if err := teaDecode(w, r, &body); err != nil {
			return err
		}
		h, err := a.Game.TeaDismissGuide(player)
		if err != nil {
			return err
		}
		respond(w, 200, h)
	case path == "/api/tea/explore" && r.Method == "POST":
		var body struct {
			SiteID string `json:"siteId"`
		}
		if err := teaDecode(w, r, &body); err != nil {
			return err
		}
		a.mu.Lock()
		pos := a.ensureWorldLocked(player)
		a.mu.Unlock()
		h, err := a.Game.TownExplore(player, body.SiteID, pos.X, pos.Z)
		if err != nil {
			return err
		}
		respond(w, 200, h)
		a.Broadcast(map[string]any{"kind": "town_explored", "playerId": player})
	case path == "/api/tea/mission/accept" && r.Method == "POST":
		var body struct{}
		if err := teaDecode(w, r, &body); err != nil {
			return err
		}
		h, err := a.Game.TeaAcceptMission(player)
		if err != nil {
			return err
		}
		respond(w, 200, h)
	case path == "/api/tea/sessions" && r.Method == "POST":
		var body TeaOpenSession
		if err := teaDecode(w, r, &body); err != nil {
			return err
		}
		s, err := a.Game.TeaOpen(player, body)
		if err != nil {
			return err
		}
		respond(w, 200, s)
	case strings.HasPrefix(path, "/api/tea/sessions/"):
		rest := strings.TrimPrefix(path, "/api/tea/sessions/")
		if strings.HasSuffix(rest, "/step") && r.Method == "POST" {
			id := strings.TrimSuffix(rest, "/step")
			if id == "" || strings.Contains(id, "/") {
				return fail(404, "NOT_FOUND", "接口不存在")
			}
			var body TeaStep
			if err := teaDecode(w, r, &body); err != nil {
				return err
			}
			s, err := a.Game.TeaStepSession(player, id, body)
			if err != nil {
				return err
			}
			respond(w, 200, s)
			if s.Status == "finished" && s.Run.Mode == "official" {
				a.Broadcast(map[string]any{"kind": "tea_settled", "playerId": player})
			}
		} else if r.Method == "GET" && rest != "" && !strings.Contains(rest, "/") {
			s, err := a.Game.TeaGetSession(player, rest)
			if err != nil {
				return err
			}
			respond(w, 200, s)
		} else {
			return fail(404, "NOT_FOUND", "接口不存在")
		}
	case path == "/api/tea/home" && r.Method == "GET":
		h, err := a.Game.TeaHome(player)
		if err != nil {
			return err
		}
		respond(w, 200, h)
	case path == "/api/tea/runs" && r.Method == "POST":
		var body struct {
			Plan TeaPlan `json:"plan"`
			Mode string  `json:"mode"`
			Key  string  `json:"idempotencyKey"`
		}
		if err := teaDecode(w, r, &body); err != nil {
			return err
		}
		run, err := a.Game.TeaRun(player, body.Plan, body.Mode, body.Key)
		if err != nil {
			return err
		}
		respond(w, 200, run)
		if run.Mode == "official" {
			a.Broadcast(map[string]any{"kind": "tea_settled", "playerId": player})
		}
	case strings.HasPrefix(path, "/api/tea/runs/") && r.Method == "GET":
		run, err := a.Game.TeaGetRun(player, strings.TrimPrefix(path, "/api/tea/runs/"))
		if err != nil {
			return err
		}
		respond(w, 200, run)
	case path == "/api/tea/upgrade" && r.Method == "POST":
		var body struct {
			Level int `json:"expectedLevel"`
		}
		if err := teaDecode(w, r, &body); err != nil {
			return err
		}
		h, err := a.Game.TeaUpgrade(player, body.Level)
		if err != nil {
			return err
		}
		respond(w, 200, h)
	case path == "/api/tea/hire-settings" && r.Method == "PATCH":
		var body struct {
			Enabled *bool `json:"enabled"`
		}
		if err := teaDecode(w, r, &body); err != nil {
			return err
		}
		if body.Enabled == nil {
			return fail(400, "TEA_BODY", "必须提供公开招聘开关")
		}
		h, err := a.Game.TeaHireSettings(player, *body.Enabled)
		if err != nil {
			return err
		}
		respond(w, 200, h)
	default:
		return fail(404, "NOT_FOUND", "接口不存在")
	}
	return nil
}

package backend

import (
	"database/sql"
	"encoding/json"
	"hash/fnv"
	"math"
	"net/http"
	"sort"
	"strings"
	"unicode"
	"unicode/utf8"
)

// Campus extent is mirrored by shared/world.ts and checked by the map contract test.
const worldMinX, worldMaxX, worldMinZ, worldMaxZ = -45, 45, -33, 33

// World positions and expression bubbles are ephemeral. Wallet rewards and
// pair cooldowns are transactional SQLite records, and survive restarts.
type WorldPlayer struct {
	ID         string  `json:"id"`
	X          float64 `json:"x"`
	Z          float64 `json:"z"`
	Yaw        float64 `json:"yaw"`
	Moving     bool    `json:"moving"`
	Emote      string  `json:"emote"`
	EmoteUntil int64   `json:"emoteUntil"`
	Said       string  `json:"said"`
	SaidUntil  int64   `json:"saidUntil"`
	UpdatedAt  int64   `json:"updatedAt"`
}

func (a *App) ensureWorldLocked(id string) WorldPlayer {
	if p, ok := a.world[id]; ok {
		return p
	}
	x, known := map[string]float64{"wang": 0, "li": 2, "mei": -2, "liu": 4}[id]
	z := 11.0
	if !known {
		h := fnv.New32a()
		_, _ = h.Write([]byte(id))
		n := h.Sum32()
		x = float64(int(n%7)-3) * 2
		z = 9.5 + float64((n/7)%3)
	}
	p := WorldPlayer{ID: id, X: x, Z: z, UpdatedAt: a.Game.Now()}
	a.world[id] = p
	return p
}

func (a *App) onlineLocked(id string) bool {
	for c := range a.clients {
		if c.player == id {
			return true
		}
	}
	return false
}

func (a *App) worldPlayersLocked() []WorldPlayer {
	now := a.Game.Now()
	players := make([]WorldPlayer, 0, len(a.world))
	online := map[string]bool{}
	for c := range a.clients {
		online[c.player] = true
	}
	for id, p := range a.world {
		if !online[id] {
			continue
		}
		if p.EmoteUntil <= now {
			p.Emote = ""
		}
		if p.SaidUntil <= now {
			p.Said = ""
		}
		if now-p.UpdatedAt > 1500 {
			p.Moving = false
		}
		players = append(players, p)
	}
	sort.Slice(players, func(i, j int) bool { return players[i].ID < players[j].ID })
	return players
}

func finite(n float64) bool { return !math.IsNaN(n) && !math.IsInf(n, 0) }

func (a *App) moveWorld(id string, x, z, yaw float64, moving bool) (WorldPlayer, error) {
	a.mu.Lock()
	defer a.mu.Unlock()
	p := a.ensureWorldLocked(id)
	if !finite(x) || !finite(z) || !finite(yaw) || x < worldMinX || x > worldMaxX || z < worldMinZ || z > worldMaxZ {
		return p, fail(400, "BAD_POSITION", "超出地图范围")
	}
	now := a.Game.Now()
	dt := now - p.UpdatedAt
	if dt < 80 {
		return p, fail(429, "TOO_FAST", "移动更新过于频繁")
	}
	// Client prediction supports ordinary walking; reject large teleport jumps.
	allowed := 7.5*math.Min(float64(dt)/1000, 2) + 0.55
	if math.Hypot(x-p.X, z-p.Z) > allowed {
		return p, fail(409, "MOVE_TOO_FAR", "移动过快，请重新同步位置")
	}
	p.X, p.Z, p.Yaw, p.Moving, p.UpdatedAt = x, z, math.Mod(yaw, 2*math.Pi), moving, now
	a.world[id] = p
	return p, nil
}

func (a *App) socialWorld(id, emote, text string) (WorldPlayer, error) {
	a.mu.Lock()
	defer a.mu.Unlock()
	p := a.ensureWorldLocked(id)
	text = strings.TrimSpace(text)
	if (emote != "" && emote != "wave" && emote != "dance" && emote != "coffee") ||
		utf8.RuneCountInString(text) > 40 || strings.ContainsFunc(text, unicode.IsControl) || (text == "" && emote == "") {
		return p, fail(400, "BAD_SOCIAL", "短句最多40字，可挥手、跳舞或喝咖啡")
	}
	now := a.Game.Now()
	if last, ok := a.socialAt[id]; ok && now-last < 1000 {
		return p, fail(429, "TOO_SOON", "稍等一秒再互动")
	}
	a.socialAt[id] = now
	if emote != "" {
		p.Emote, p.EmoteUntil = emote, now+3000
	}
	if text != "" {
		p.Said, p.SaidUntil = text, now+6000
	}
	a.world[id] = p
	return p, nil
}

func (g *Game) highfiveReward(first, second string) (int64, error) {
	ids := []string{first, second}
	sort.Strings(ids)
	pair := strings.Join(ids, ":")
	now := g.Now()
	err := g.transaction(func(tx *sql.Tx) error {
		var last int64
		err := tx.QueryRow("SELECT claimed_at FROM social_rewards WHERE pair_key=?", pair).Scan(&last)
		if err != nil && err != sql.ErrNoRows {
			return err
		}
		if err == nil && now-last < 60000 {
			return fail(429, "TOO_SOON", "这位同事刚碰过杯，稍后再来")
		}
		if _, err = tx.Exec("INSERT INTO social_rewards(pair_key,claimed_at) VALUES(?,?) ON CONFLICT(pair_key) DO UPDATE SET claimed_at=excluded.claimed_at", pair, now); err != nil {
			return err
		}
		ref := "social:" + randomID()
		for _, id := range ids {
			if _, err = tx.Exec("UPDATE player_years SET friend_pct=10 WHERE player_id=?", id); err != nil {
				return err
			}
			res, e := tx.Exec("UPDATE players SET coins=coins+15 WHERE id=?", id)
			if e != nil {
				return e
			}
			n, _ := res.RowsAffected()
			if n != 1 {
				return fail(404, "NO_PLAYER", "玩家不存在")
			}
			if err = ledger(tx, "player:"+id, 15, "social_reward", ref, now); err != nil {
				return err
			}
			if err = message(tx, ptr(id), "social", "碰杯 +15", "遇到同事，一起摸个鱼。", nil, now); err != nil {
				return err
			}
		}
		return bump(tx)
	})
	return now + 60000, err
}

func (a *App) highfiveWorld(id, target string) (int64, error) {
	a.mu.Lock()
	defer a.mu.Unlock()
	if id == target || target == "" {
		return 0, fail(400, "BAD_TARGET", "选一位附近的同事")
	}
	if !a.onlineLocked(id) || !a.onlineLocked(target) {
		return 0, fail(409, "OFFLINE", "对方暂时离开了")
	}
	p, q := a.ensureWorldLocked(id), a.ensureWorldLocked(target)
	if math.Hypot(p.X-q.X, p.Z-q.Z) > 4 {
		return 0, fail(409, "TOO_FAR", "走近一点再碰杯")
	}
	until, err := a.Game.highfiveReward(id, target)
	if err != nil {
		return 0, err
	}
	now := a.Game.Now()
	p.Emote, q.Emote, p.EmoteUntil, q.EmoteUntil = "coffee", "coffee", now+3000, now+3000
	a.world[id], a.world[target] = p, q
	return until, nil
}

func (a *App) handleWorld(w http.ResponseWriter, r *http.Request, id string) error {
	if r.Method == "GET" && r.URL.Path == "/api/world" {
		a.mu.Lock()
		a.ensureWorldLocked(id)
		players, onlineCount, nearbyCount := a.worldViewLocked(id, nil)
		a.mu.Unlock()
		respond(w, 200, map[string]any{"serverTime": a.Game.Now(), "bounds": map[string]int{"minX": worldMinX, "maxX": worldMaxX, "minZ": worldMinZ, "maxZ": worldMaxZ}, "players": players, "onlineCount": onlineCount, "nearbyCount": nearbyCount, "radius": worldRadius})
		return nil
	}
	if r.Method != "POST" {
		return fail(404, "NOT_FOUND", "未找到")
	}
	body, err := readBody(w, r)
	if err != nil {
		return err
	}
	switch r.URL.Path {
	case "/api/world/focus":
		target := stringField(body, "targetId")
		a.mu.Lock()
		if target == "" || !a.onlineLocked(target) {
			a.mu.Unlock()
			return fail(409, "OFFLINE", "对方暂时离开了")
		}
		p := a.ensureWorldLocked(target)
		a.worldFocus[id] = worldFocus{target, a.Game.Now() + 60000}
		a.worldDirty = true
		a.mu.Unlock()
		respond(w, 200, map[string]any{"player": p, "serverTime": a.Game.Now()})
	case "/api/world/move":
		var x, z, yaw float64
		var moving bool
		for key, value := range map[string]*float64{"x": &x, "z": &z, "yaw": &yaw} {
			raw := body[key]
			if len(raw) == 0 || string(raw) == "null" || json.Unmarshal(raw, value) != nil {
				return fail(400, "BAD_POSITION", "位置需要完整坐标")
			}
		}
		if json.Unmarshal(body["moving"], &moving) != nil || string(body["moving"]) == "null" {
			return fail(400, "BAD_POSITION", "缺少移动状态")
		}
		p, err := a.moveWorld(id, x, z, yaw, moving)
		if err != nil {
			return err
		}
		a.broadcastWorld()
		respond(w, 200, map[string]any{"player": p})
	case "/api/world/social":
		p, err := a.socialWorld(id, stringField(body, "emote"), stringField(body, "text"))
		if err != nil {
			return err
		}
		a.broadcastWorld()
		respond(w, 200, map[string]any{"player": p})
	case "/api/world/highfive":
		target := stringField(body, "targetId")
		until, err := a.highfiveWorld(id, target)
		if err != nil {
			return err
		}
		a.Broadcast(map[string]any{"kind": "highfive", "playerId": id, "targetId": target, "reward": 15, "at": a.Game.Now()})
		a.broadcastWorld()
		respond(w, 200, map[string]any{"reward": 15, "cooldownUntil": until})
	default:
		return fail(404, "NOT_FOUND", "未找到")
	}
	return nil
}

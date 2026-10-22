package backend

import (
	"database/sql"
	"encoding/json"
	"fmt"
	"github.com/1994/boss-works-for-me/storage"
	"math"
	"sort"
)

type TownOwner struct {
	ID        string `json:"id"`
	Name      string `json:"name"`
	Color     string `json:"color"`
	AvatarURL string `json:"avatarUrl,omitempty"`
}
type TownJob struct {
	ID        string `json:"id"`
	CloneID   string `json:"cloneId"`
	Kind      string `json:"kind"`
	StartedAt int64  `json:"startedAt"`
	EndsAt    int64  `json:"endsAt"`
	Status    string `json:"status"`
	Reward    int    `json:"reward"`
	XP        int    `json:"xp"`
	Earned    int    `json:"earned"`
}
type TownCandidate struct {
	TeaWorker
	Price     int    `json:"price"`
	HireCount int    `json:"hireCount"`
	Owned     bool   `json:"owned"`
	AvatarURL string `json:"avatarUrl,omitempty"`
}
type TownClone struct {
	TeaWorker
	Level      int      `json:"level"`
	XP         int      `json:"xp"`
	NextXP     int      `json:"nextXp"`
	CanStaff   bool     `json:"canStaff"`
	CanManage  bool     `json:"canManage"`
	HiredPrice int      `json:"hiredPrice"`
	Job        *TownJob `json:"job"`
	AvatarURL  string   `json:"avatarUrl,omitempty"`
	ListingID  *string  `json:"listingId"`
}
type TownListing struct {
	TownOwner
	Level      int    `json:"level"`
	Title      string `json:"title"`
	Earned     int    `json:"earned"`
	CloneCount int    `json:"cloneCount"`
}
type TownUpgrade struct {
	Level          int    `json:"level"`
	Title          string `json:"title"`
	Cost           int    `json:"cost"`
	RequiredEarned int    `json:"requiredEarned"`
	Ready          bool   `json:"ready"`
	Reason         string `json:"reason"`
}
type TownHome struct {
	Owner       TownOwner             `json:"owner"`
	Visitor     bool                  `json:"visitor"`
	Level       int                   `json:"level"`
	Title       string                `json:"title"`
	Earned      int                   `json:"earned"`
	Coins       int                   `json:"coins"`
	ServerTime  int64                 `json:"serverTime"`
	ShopLevel   int                   `json:"shopLevel"`
	NextUpgrade *TownUpgrade          `json:"nextUpgrade"`
	Clones      []TownClone           `json:"clones"`
	Candidates  []TownCandidate       `json:"candidates"`
	Jobs        []TownJob             `json:"jobs"`
	Visitable   []TownListing         `json:"visitable"`
	Market      []TownEmployeeListing `json:"market"`
	Trades      []TownEmployeeListing `json:"trades"`
}

var townTitles = []string{"", "初创小镇", "商业街区", "繁华商都", "摩天新城", "霓虹都会"}
var townCosts = []int{0, 0, 500, 1800, 5000, 12000}
var townEarnedGates = []int{0, 0, 100, 600, 2000, 6000}

func cloneLevel(xp int) int {
	if xp >= 180 {
		return 3
	}
	if xp >= 60 {
		return 2
	}
	return 1
}

func townCloneInShop(tx storage.Tx, owner, source string) (bool, error) {
	var raw string
	err := tx.QueryRow("SELECT data FROM tea_sessions WHERE player_id=? AND status='active' LIMIT 1", owner).Scan(&raw)
	if err == sql.ErrNoRows {
		return false, nil
	}
	if err != nil {
		return false, err
	}
	var s teaLiveRecord
	if err = json.Unmarshal([]byte(raw), &s); err != nil {
		return false, err
	}
	for _, w := range s.Run.Workers {
		if w.ID == source {
			return true, nil
		}
	}
	return false, nil
}
func clonePrice(count int) int {
	return int(math.Ceil(math.Min(10000, 120*math.Pow(1.25, float64(max(0, count))))/10)) * 10
}
func townGrownWorker(w TeaWorker, xp int) TeaWorker {
	boost := (cloneLevel(xp) - 1) * 10
	w.Service = min(99, w.Service+boost)
	w.Production = min(99, w.Production+boost)
	w.Adaptability = min(99, w.Adaptability+boost)
	return w
}
func townRecordService(tx storage.Tx, player string, r TeaRun) error {
	if r.Mode != "official" {
		return nil
	}
	for _, w := range r.Workers {
		if w.ID == "self" {
			continue
		}
		if _, err := tx.Exec("UPDATE town_clones SET xp=MIN(180,xp+20) WHERE owner_id=? AND source_id=?", player, w.ID); err != nil {
			return err
		}
	}
	return nil
}
func townExists(tx storage.Tx, player string) bool {
	var n int
	return tx.QueryRow("SELECT COUNT(*) FROM town_profiles WHERE player_id=?", player).Scan(&n) == nil && n > 0
}
func townEnsure(tx storage.Tx, player string, now int64) error {
	if err := teaEnsure(tx, player, now); err != nil {
		return err
	}
	_, err := tx.Exec("INSERT OR IGNORE INTO town_profiles(player_id) VALUES(?)", player)
	return err
}

// Legacy Tea APIs keep their frozen hire rules. Private-town players can staff
// stores with their own clones, including apprentices that are not currently on another job.
func teaWorkers(tx storage.Tx, player, day string) ([]TeaWorker, error) {
	ws, err := teaWorkerCatalog(tx, player, day)
	if err != nil || !townExists(tx, player) {
		return ws, err
	}
	out := []TeaWorker{}
	for _, w := range ws {
		var xp, active int
		err := tx.QueryRow("SELECT xp,(SELECT COUNT(*) FROM town_jobs j WHERE j.owner_id=c.owner_id AND j.source_id=c.source_id AND j.status='active') FROM town_clones c WHERE owner_id=? AND source_id=?", player, w.ID).Scan(&xp, &active)
		if err == sql.ErrNoRows {
			continue
		}
		if err != nil {
			return nil, err
		}
		if active > 0 || townIsListed(tx, player, w.ID) {
			continue
		}
		w.Enabled = true
		w = townGrownWorker(w, xp)
		w.PlayerID = "" // an independently hired copy, not the real colleague on a shared shift
		w.Remaining = 999
		out = append(out, w)
	}
	return out, nil
}

// Lazy settlement uses server time and advances each job's deadline in the same
// transaction as wallet, XP and ledger. Refresh/reconnect never pays a cycle twice.
// Offline work is capped at eight hours per return.
func townSettleJobs(tx storage.Tx, owner string, now int64) error {
	type due struct {
		id, source         string
		ends, duration     int64
		reward, xp, cycles int
	}
	rows, err := tx.Query("SELECT id,source_id,ends_at,duration_ms,reward,xp,cycles FROM town_jobs WHERE owner_id=? AND status='active' AND ends_at<=?", owner, now)
	if err != nil {
		return err
	}
	ds := []due{}
	for rows.Next() {
		var d due
		if err = rows.Scan(&d.id, &d.source, &d.ends, &d.duration, &d.reward, &d.xp, &d.cycles); err != nil {
			rows.Close()
			return err
		}
		ds = append(ds, d)
	}
	err = rows.Err()
	rows.Close()
	if err != nil {
		return err
	}
	for _, d := range ds {
		if d.duration <= 0 {
			return fmt.Errorf("invalid town job duration")
		}
		elapsed := (now-d.ends)/d.duration + 1
		cycles := min(elapsed, 8*3600000/d.duration)
		amount := int(cycles) * d.reward
		next := d.ends + elapsed*d.duration
		if _, err = tx.Exec("UPDATE town_jobs SET ends_at=?,earned=earned+?,cycles=cycles+? WHERE id=? AND owner_id=?", next, amount, cycles, d.id, owner); err != nil {
			return err
		}
		if _, err = tx.Exec("UPDATE town_clones SET xp=MIN(180,xp+?) WHERE owner_id=? AND source_id=?", int(cycles)*d.xp, owner, d.source); err != nil {
			return err
		}
		if _, err = tx.Exec("UPDATE players SET coins=coins+? WHERE id=?", amount, owner); err != nil {
			return err
		}
		if err = ledger(tx, "player:"+owner, amount, "town_job", fmt.Sprintf("town:job:%s:%d", d.id, d.cycles+int(cycles)), now); err != nil {
			return err
		}
	}
	if len(ds) > 0 {
		return bump(tx)
	}
	return nil
}

func townEarned(tx storage.Tx, owner string) (int, error) {
	var earned int
	if err := tx.QueryRow("SELECT COALESCE(SUM(delta),0) FROM ledger WHERE account=? AND reason='town_job'", "player:"+owner).Scan(&earned); err != nil {
		return 0, err
	}
	rows, err := tx.Query("SELECT result FROM tea_runs WHERE player_id=? AND mode='official'", owner)
	if err != nil {
		return 0, err
	}
	defer rows.Close()
	for rows.Next() {
		var raw string
		if err = rows.Scan(&raw); err != nil {
			return 0, err
		}
		var r TeaRun
		if err = json.Unmarshal([]byte(raw), &r); err != nil {
			return 0, err
		}
		earned += max(0, r.Result.Profit+r.Result.Bonus)
	}
	return earned, rows.Err()
}

func townRead(tx storage.Tx, viewer, owner string, now int64) (TownHome, error) {
	h := TownHome{Visitor: viewer != owner, ServerTime: now, Clones: []TownClone{}, Candidates: []TownCandidate{}, Jobs: []TownJob{}, Visitable: []TownListing{}, Market: []TownEmployeeListing{}, Trades: []TownEmployeeListing{}}
	if !townExists(tx, owner) {
		return h, fail(404, "TOWN_NOT_READY", "这位同事还没有创建小镇")
	}
	if err := townSettleJobs(tx, owner, now); err != nil {
		return h, err
	}
	if err := tx.QueryRow("SELECT p.id,p.name,p.color,COALESCE((SELECT json_extract(c.look,'$.avatarUrl') FROM colleagues c WHERE c.self_player_id=p.id LIMIT 1),''),p.coins,t.level,s.level FROM town_profiles t JOIN players p ON p.id=t.player_id JOIN tea_shops s ON s.player_id=p.id WHERE p.id=?", owner).Scan(&h.Owner.ID, &h.Owner.Name, &h.Owner.Color, &h.Owner.AvatarURL, &h.Coins, &h.Level, &h.ShopLevel); err != nil {
		return h, err
	}
	h.Title = townTitles[min(5, max(1, h.Level))]
	var err error
	h.Earned, err = townEarned(tx, owner)
	if err != nil {
		return h, err
	}
	if h.Level < 5 {
		n := h.Level + 1
		u := TownUpgrade{Level: n, Title: townTitles[n], Cost: townCosts[n], RequiredEarned: townEarnedGates[n]}
		u.Ready = h.Coins >= u.Cost && h.Earned >= u.RequiredEarned
		if h.Earned < u.RequiredEarned {
			u.Reason = fmt.Sprintf("累计经营收益达到%d金币", u.RequiredEarned)
		} else if h.Coins < u.Cost {
			u.Reason = fmt.Sprintf("还需%d金币", u.Cost-h.Coins)
		}
		h.NextUpgrade = &u
	}
	rows, err := tx.Query("SELECT id,source_id,kind,started_at,ends_at,status,reward,xp,earned FROM town_jobs WHERE owner_id=? ORDER BY (status='active') DESC,started_at DESC,rowid DESC LIMIT 40", owner)
	if err != nil {
		return h, err
	}
	active := map[string]*TownJob{}
	for rows.Next() {
		var j TownJob
		if err = rows.Scan(&j.ID, &j.CloneID, &j.Kind, &j.StartedAt, &j.EndsAt, &j.Status, &j.Reward, &j.XP, &j.Earned); err != nil {
			rows.Close()
			return h, err
		}
		h.Jobs = append(h.Jobs, j)
		if j.Status == "active" {
			copy := j
			active[j.CloneID] = &copy
		}
	}
	err = rows.Err()
	rows.Close()
	if err != nil {
		return h, err
	}
	workers, err := teaWorkerCatalog(tx, owner, teaDay(now))
	if err != nil {
		return h, err
	}
	for _, w := range workers {
		var count int
		if err = tx.QueryRow("SELECT COALESCE((SELECT hires FROM town_clone_demand WHERE source_id=?),0)", w.ID).Scan(&count); err != nil {
			return h, err
		}
		var xp, price int
		owned := true
		err = tx.QueryRow("SELECT xp,hired_price FROM town_clones WHERE owner_id=? AND source_id=?", owner, w.ID).Scan(&xp, &price)
		if err == sql.ErrNoRows {
			owned = false
		} else if err != nil {
			return h, err
		}
		avatar := ""
		if w.PlayerID != "" {
			_ = tx.QueryRow("SELECT COALESCE(json_extract(look,'$.avatarUrl'),'') FROM colleagues WHERE self_player_id=? LIMIT 1", w.PlayerID).Scan(&avatar)
		}
		if owned {
			lv := cloneLevel(xp)
			next := 0
			if lv == 1 {
				next = 60
			} else if lv == 2 {
				next = 180
			}
			var listingID *string
			var id string
			if tx.QueryRow("SELECT id FROM town_employee_market WHERE seller_id=? AND source_id=? AND status='active'", owner, w.ID).Scan(&id) == nil {
				listingID = &id
			}
			h.Clones = append(h.Clones, TownClone{townGrownWorker(w, xp), lv, xp, next, listingID == nil, lv >= 3 && listingID == nil, price, active[w.ID], avatar, listingID})
		}
		if !h.Visitor {
			h.Candidates = append(h.Candidates, TownCandidate{w, clonePrice(count), count, owned, avatar})
		}
	}
	if !h.Visitor {
		h.Market, h.Trades, err = townMarketRead(tx, viewer)
		if err != nil {
			return h, err
		}
		rows, err = tx.Query("SELECT p.id,p.name,p.color,COALESCE((SELECT json_extract(c.look,'$.avatarUrl') FROM colleagues c WHERE c.self_player_id=p.id LIMIT 1),''),t.level,(SELECT COUNT(*) FROM town_clones c WHERE c.owner_id=p.id) FROM town_profiles t JOIN players p ON p.id=t.player_id WHERE p.id<>? ORDER BY p.name LIMIT 100", viewer)
		if err != nil {
			return h, err
		}
		for rows.Next() {
			var l TownListing
			if err = rows.Scan(&l.ID, &l.Name, &l.Color, &l.AvatarURL, &l.Level, &l.CloneCount); err != nil {
				rows.Close()
				return h, err
			}
			l.Title = townTitles[min(5, max(1, l.Level))]
			h.Visitable = append(h.Visitable, l)
		}
		err = rows.Err()
		rows.Close()
		if err != nil {
			return h, err
		}
	}
	for i := range h.Visitable {
		h.Visitable[i].Earned, err = townEarned(tx, h.Visitable[i].ID)
		if err != nil {
			return h, err
		}
	}
	sort.SliceStable(h.Visitable, func(i, j int) bool {
		if h.Visitable[i].Level != h.Visitable[j].Level {
			return h.Visitable[i].Level > h.Visitable[j].Level
		}
		return h.Visitable[i].Earned > h.Visitable[j].Earned
	})
	return h, nil
}

func (g *Game) TownHome(viewer, owner string) (TownHome, error) {
	var h TownHome
	err := g.transaction(func(tx storage.Tx) error { var e error; h, e = townRead(tx, viewer, owner, g.Now()); return e })
	return h, err
}
func (g *Game) TownEnter(player, owner string) (TownHome, error) {
	if owner == "" {
		owner = player
	}
	var h TownHome
	err := g.transaction(func(tx storage.Tx) error {
		if owner == player {
			if e := townEnsure(tx, player, g.Now()); e != nil {
				return e
			}
		}
		var e error
		h, e = townRead(tx, player, owner, g.Now())
		return e
	})
	return h, err
}

func (g *Game) TownHire(player, source string, expected int) (TownHome, error) {
	err := g.transaction(func(tx storage.Tx) error {
		if err := townEnsure(tx, player, g.Now()); err != nil {
			return err
		}
		var count int
		if err := tx.QueryRow("SELECT COUNT(*) FROM town_clones WHERE owner_id=? AND source_id=?", player, source).Scan(&count); err != nil {
			return err
		}
		if count > 0 {
			return nil
		}
		if err := tx.QueryRow("SELECT COUNT(*) FROM town_clones WHERE owner_id=?", player).Scan(&count); err != nil {
			return err
		}
		if count >= 12 {
			return fail(409, "TOWN_TEAM_FULL", "本镇最多雇佣12位分身")
		}
		ws, err := teaWorkerCatalog(tx, player, teaDay(g.Now()))
		if err != nil {
			return err
		}
		valid := false
		for _, w := range ws {
			if w.ID == source && w.Enabled {
				valid = true
			}
		}
		if !valid {
			return fail(409, "TOWN_CLONE", "这位同事暂未开放分身雇佣")
		}
		if err = tx.QueryRow("SELECT COALESCE((SELECT hires FROM town_clone_demand WHERE source_id=?),0)", source).Scan(&count); err != nil {
			return err
		}
		price := clonePrice(count)
		if expected != price {
			return fail(409, "TOWN_PRICE_CHANGED", "分身报价已更新，请刷新后再雇佣")
		}
		result, err := tx.Exec("UPDATE players SET coins=coins-? WHERE id=? AND coins>=?", price, player, price)
		if err != nil {
			return err
		}
		n, _ := result.RowsAffected()
		if n != 1 {
			return fail(402, "INSUFFICIENT", "金币不足，先营业或派工赚取金币")
		}
		if _, err = tx.Exec("INSERT INTO town_clones(owner_id,source_id,hired_price,hired_at) VALUES(?,?,?,?)", player, source, price, g.Now()); err != nil {
			return err
		}
		if _, err = tx.Exec("INSERT INTO town_clone_demand(source_id,hires) VALUES(?,1) ON CONFLICT(source_id) DO UPDATE SET hires=hires+1", source); err != nil {
			return err
		}
		if err = ledger(tx, "player:"+player, -price, "town_hire", "town:hire:"+source, g.Now()); err != nil {
			return err
		}
		return bump(tx)
	})
	if err != nil {
		return TownHome{}, err
	}
	return g.TownHome(player, player)
}

func (g *Game) TownStartJob(player, source, kind string) (TownHome, error) {
	err := g.transaction(func(tx storage.Tx) error {
		if kind != "clean" && kind != "stock" && kind != "manage" && kind != "rest" {
			return fail(400, "TOWN_JOB", "请选择有效的工作")
		}
		if err := townSettleJobs(tx, player, g.Now()); err != nil {
			return err
		}
		var xp int
		if err := tx.QueryRow("SELECT xp FROM town_clones WHERE owner_id=? AND source_id=?", player, source).Scan(&xp); err != nil {
			return noRow(err, "TOWN_CLONE", "只能安排自己的分身")
		}
		if kind == "manage" && cloneLevel(xp) < 3 {
			return fail(409, "TOWN_LEVEL", "Lv3分身才能担任经理")
		}
		if townIsListed(tx, player, source) {
			return fail(409, "TOWN_LISTED", "员工正在挂牌，请先撤单")
		}
		var activeKind string
		_ = tx.QueryRow("SELECT kind FROM town_jobs WHERE owner_id=? AND source_id=? AND status='active'", player, source).Scan(&activeKind)
		if activeKind == kind {
			return nil
		}
		// A clone cannot simultaneously work in an active store and on town chores.
		inShop, err := townCloneInShop(tx, player, source)
		if err != nil {
			return err
		}
		if inShop {
			return fail(409, "TOWN_BUSY", "这位分身正在营业中")
		}
		if _, err := tx.Exec("UPDATE town_jobs SET status='completed' WHERE owner_id=? AND source_id=? AND status='active'", player, source); err != nil {
			return err
		}
		if kind == "rest" {
			return bump(tx)
		}
		duration, reward, experience := int64(20000), 12, 20
		if kind == "stock" {
			duration, reward = 30000, 18
		}
		if kind == "manage" {
			duration, reward, experience = 60000, 60, 30
		}
		now := g.Now()
		_, err = tx.Exec("INSERT INTO town_jobs(id,owner_id,source_id,kind,started_at,ends_at,reward,xp,duration_ms) VALUES(?,?,?,?,?,?,?,?,?)", randomID(), player, source, kind, now, now+duration, reward, experience, duration)
		if err != nil {
			return err
		}
		return bump(tx)
	})
	if err != nil {
		return TownHome{}, err
	}
	return g.TownHome(player, player)
}

func (g *Game) TownUpgrade(player string, expected int) (TownHome, error) {
	if expected < 1 || expected > 4 {
		return TownHome{}, fail(400, "TOWN_LEVEL", "建设等级无效")
	}
	err := g.transaction(func(tx storage.Tx) error {
		h, err := townRead(tx, player, player, g.Now())
		if err != nil {
			return err
		}
		if h.Level > expected {
			return nil
		}
		if h.Level != expected || h.NextUpgrade == nil {
			return fail(409, "TOWN_LEVEL_CHANGED", "建设等级已更新")
		}
		if !h.NextUpgrade.Ready {
			return fail(409, "TOWN_BUILD_LOCKED", h.NextUpgrade.Reason)
		}
		cost := h.NextUpgrade.Cost
		if _, err = tx.Exec("UPDATE players SET coins=coins-? WHERE id=?", cost, player); err != nil {
			return err
		}
		if _, err = tx.Exec("UPDATE town_profiles SET level=level+1 WHERE player_id=?", player); err != nil {
			return err
		}
		if err = ledger(tx, "player:"+player, -cost, "town_build", fmt.Sprintf("town:build:%d", h.Level+1), g.Now()); err != nil {
			return err
		}
		return bump(tx)
	})
	if err != nil {
		return TownHome{}, err
	}
	return g.TownHome(player, player)
}

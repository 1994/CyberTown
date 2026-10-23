package backend

import (
	"database/sql"
	"encoding/json"
	"fmt"
	"github.com/1994/boss-works-for-me/storage"
	"hash/fnv"
	"strings"
	"time"
)

type TeaShop struct {
	Level           int `json:"level"`
	Best            int `json:"best"`
	Runs            int `json:"runs"`
	NextUpgradeCost int `json:"nextUpgradeCost"`
}
type TeaNotice struct {
	ID          int64  `json:"id"`
	Employer    string `json:"employer"`
	Worker      string `json:"worker"`
	Role        string `json:"role"`
	Salary      int    `json:"salary"`
	Completed   int    `json:"completed"`
	Cooperation int    `json:"cooperation"`
	At          int64  `json:"at"`
}
type TeaHome struct {
	Counter           TeaCounterProgress `json:"counter"`
	PlayerID          string             `json:"playerId"`
	Name              string             `json:"name"`
	Coins             int                `json:"coins"`
	Self              TeaWorker          `json:"self"`
	Workers           []TeaWorker        `json:"workers"`
	Shop              TeaShop            `json:"shop"`
	Challenge         TeaChallenge       `json:"challenge"`
	AttemptsRemaining int                `json:"attemptsRemaining"`
	HireEnabled       bool               `json:"hireEnabled"`
	Notices           []TeaNotice        `json:"notices"`
	RecentRuns        []TeaRun           `json:"recentRuns"`
	Chapter           TeaChapter         `json:"chapter"`
	Mission           TeaMission         `json:"mission"`
	Wallet            TeaWallet          `json:"wallet"`
	Business          TeaBusiness        `json:"business"`
	Exploration       TownExploration    `json:"exploration"`
}

// One date zone defines the daily challenge for everyone, regardless of server TZ.
func teaDay(now int64) string { return time.UnixMilli(now).UTC().Format("2006-01-02") }
func teaChallenge(day string) TeaChallenge {
	h := fnv.New32a()
	_, _ = h.Write([]byte(day + teaVersion))
	return TeaChallenge{ID: "lunch-" + day, Seed: h.Sum32(), RuleVersion: teaVersion, Name: "午间奶茶高峰", Duration: 240, Arrivals: 80, Target: 72, Budget: 1100, Price: 20, MaterialCost: 6, OperatingCost: 120}
}
func teaEnsure(tx storage.Tx, player string, now int64) error {
	res, err := tx.Exec("INSERT OR IGNORE INTO tea_shops(player_id) VALUES(?)", player)
	if err != nil {
		return err
	}
	n, _ := res.RowsAffected()
	if n == 1 {
		if _, err = tx.Exec("UPDATE players SET coins=coins+1400 WHERE id=?", player); err != nil {
			return err
		}
		if err = ledger(tx, "player:"+player, 1400, "tea_opening_grant", "tea:opening:"+player, now); err != nil {
			return err
		}
	}
	if _, err = tx.Exec("INSERT OR IGNORE INTO tea_chapters(player_id) VALUES(?)", player); err != nil {
		return err
	}
	if _, err = tx.Exec("INSERT OR IGNORE INTO tea_business_progress(player_id) VALUES(?)", player); err != nil {
		return err
	}
	_, err = tx.Exec("INSERT OR IGNORE INTO tea_avatars(player_id) VALUES(?)", player)
	return err
}
func teaAvatar(id, name, color string) TeaWorker {
	h := fnv.New32a()
	_, _ = h.Write([]byte(id))
	templates := teaFixtures()
	w := templates[2+int(h.Sum32()%5)]
	w.ID = "employee:" + id
	w.PlayerID = id
	w.Name = name
	w.Color = color
	w.Demo = false
	return w
}
func teaWorkerCatalog(tx storage.Tx, player, day string) ([]TeaWorker, error) {
	out := teaFixtures()
	rows, err := tx.Query(`SELECT p.id,p.name,p.color,a.enabled,((SELECT COUNT(*) FROM tea_jobs j WHERE j.employee_id=p.id AND j.day=?)+(SELECT COUNT(*) FROM tea_live_jobs l WHERE l.employee_id=p.id AND l.day=?)) FROM tea_avatars a JOIN players p ON p.id=a.player_id WHERE p.id<>? AND (a.enabled=1 OR EXISTS(SELECT 1 FROM town_clones c WHERE c.owner_id=? AND c.source_id='employee:'||p.id)) ORDER BY p.id`, day, day, player, player)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	for rows.Next() {
		var id, name, color string
		var enabled, count int
		if err = rows.Scan(&id, &name, &color, &enabled, &count); err != nil {
			return nil, err
		}
		w := teaAvatar(id, name, color)
		w.Enabled = enabled == 1
		w.Remaining = max(0, 3-count)
		out = append(out, w)
	}
	return out, rows.Err()
}
func teaSelf(player, name, color string) TeaWorker {
	// The owner's character and the hireable clone share one game profile.
	// The profile is derived only from the game ID, never real job performance.
	w := teaAvatar(player, name, color)
	w.ID, w.Salary, w.Enabled, w.Remaining = "self", 0, true, 999
	return w
}
func (g *Game) TeaHome(player string) (TeaHome, error) {
	h := TeaHome{PlayerID: player, Workers: []TeaWorker{}, Notices: []TeaNotice{}, RecentRuns: []TeaRun{}}
	now := g.Now()
	day := teaDay(now)
	h.Challenge = teaChallenge(day)
	err := g.transaction(func(tx storage.Tx) error {
		if err := teaEnsure(tx, player, now); err != nil {
			return err
		}
		chapter, err := teaChapter(tx, player)
		if err != nil {
			return err
		}
		h.Chapter = chapter
		mission, err := teaMission(tx, player)
		if err != nil {
			return err
		}
		h.Mission = mission
		wallet, err := teaWallet(tx, player)
		if err != nil {
			return err
		}
		h.Wallet = wallet
		var color string
		var enabled, attempts int
		if err := tx.QueryRow("SELECT name,color,coins FROM players WHERE id=?", player).Scan(&h.Name, &color, &h.Coins); err != nil {
			return err
		}
		h.Counter, err = teaCounterRead(tx, player)
		if err != nil {
			return err
		}
		h.Self = counterSelf(teaSelf(player, h.Name, color), h.Counter)
		if err := tx.QueryRow("SELECT level,best,runs FROM tea_shops WHERE player_id=?", player).Scan(&h.Shop.Level, &h.Shop.Best, &h.Shop.Runs); err != nil {
			return err
		}
		if h.Shop.Level == 1 {
			h.Shop.NextUpgradeCost = 600
		}
		if h.Shop.Level == 2 {
			h.Shop.NextUpgradeCost = 1200
		}
		h.Business, err = teaBusiness(tx, player, day, h.Shop, h.Mission, h.Coins)
		if err != nil {
			return err
		}
		h.Business.Challenge = counterChallenge(day, h.Shop.Level, h.Counter.Day)
		h.Exploration, err = townExploration(tx, player, h.Business)
		if err != nil {
			return err
		}
		if err := tx.QueryRow("SELECT enabled FROM tea_avatars WHERE player_id=?", player).Scan(&enabled); err != nil {
			return err
		}
		h.HireEnabled = enabled == 1
		if err := tx.QueryRow("SELECT (SELECT COUNT(*) FROM tea_runs WHERE player_id=? AND day=? AND mode='official')+(SELECT COUNT(*) FROM tea_sessions WHERE player_id=? AND day=? AND mode='official' AND status='active')", player, day, player, day).Scan(&attempts); err != nil {
			return err
		}
		h.AttemptsRemaining = max(0, 3-attempts)
		workers, err := teaWorkers(tx, player, day)
		if err != nil {
			return err
		}
		h.Workers = workers
		rows, err := tx.Query(`SELECT j.rowid,p.name,j.worker_name,j.role,j.salary,j.completed,j.created_at,(SELECT COUNT(*) FROM tea_jobs c WHERE (c.employee_id=j.employee_id AND c.employer_id=j.employer_id) OR (c.employee_id=j.employer_id AND c.employer_id=j.employee_id)) FROM tea_jobs j JOIN players p ON p.id=j.employer_id WHERE j.employee_id=? ORDER BY j.created_at DESC,j.rowid DESC LIMIT 20`, player)
		if err != nil {
			return err
		}
		for rows.Next() {
			var n TeaNotice
			if err = rows.Scan(&n.ID, &n.Employer, &n.Worker, &n.Role, &n.Salary, &n.Completed, &n.At, &n.Cooperation); err != nil {
				rows.Close()
				return err
			}
			h.Notices = append(h.Notices, n)
		}
		err = rows.Err()
		rows.Close()
		if err != nil {
			return err
		}
		rows, err = tx.Query("SELECT result FROM tea_runs WHERE player_id=? AND mode='official' ORDER BY created_at DESC,rowid DESC LIMIT 5", player)
		if err != nil {
			return err
		}
		for rows.Next() {
			var raw string
			var run TeaRun
			if err = rows.Scan(&raw); err != nil {
				rows.Close()
				return err
			}
			if err = json.Unmarshal([]byte(raw), &run); err != nil {
				rows.Close()
				return err
			}
			h.RecentRuns = append(h.RecentRuns, run)
		}
		err = rows.Err()
		rows.Close()
		return err
	})
	return h, err
}
func teaResolve(tx storage.Tx, player, day string, plan TeaPlan) ([]TeaWorker, error) {
	if len(plan.Assignments) != 3 {
		return nil, fail(400, "TEA_TEAM", "需要自己和两位员工，共三人")
	}
	if plan.Stock != 60 && plan.Stock != 80 && plan.Stock != 100 {
		return nil, fail(400, "TEA_STOCK", "备货请选择60、80或100杯")
	}
	if plan.Strategy != "balanced" && plan.Strategy != "speed" && plan.Strategy != "service" {
		return nil, fail(400, "TEA_STRATEGY", "请选择有效的经营策略")
	}
	var name, color string
	if err := tx.QueryRow("SELECT name,color FROM players WHERE id=?", player).Scan(&name, &color); err != nil {
		return nil, err
	}
	available, err := teaWorkers(tx, player, day)
	if err != nil {
		return nil, err
	}
	available = append(available, teaSelf(player, name, color))
	byID := map[string]TeaWorker{}
	for _, w := range available {
		byID[w.ID] = w
	}
	seen := map[string]bool{}
	cashier, maker := false, false
	out := []TeaWorker{}
	for _, a := range plan.Assignments {
		if seen[a.WorkerID] {
			return nil, fail(400, "TEA_DUPLICATE", "同一员工不能占两个席位")
		}
		seen[a.WorkerID] = true
		if a.Role != "cashier" && a.Role != "maker" && a.Role != "support" {
			return nil, fail(400, "TEA_ROLE", "岗位无效")
		}
		cashier = cashier || a.Role == "cashier"
		maker = maker || a.Role == "maker"
		w, ok := byID[a.WorkerID]
		if !ok || !w.Enabled {
			return nil, fail(409, "TEA_UNAVAILABLE", "员工已暂停招聘，请返回招募场景重新选择")
		}
		out = append(out, w)
	}
	if !seen["self"] || !cashier || !maker {
		return nil, fail(400, "TEA_ROLES", "主角必须参加，且至少一名前台和一名制作")
	}
	cost := plan.Stock*6 + 120
	for _, w := range out {
		cost += w.Salary
	}
	if cost > 1100 {
		return nil, fail(400, "TEA_BUDGET", fmt.Sprintf("本次支出%d，超过1100金币预算", cost))
	}
	return out, nil
}
func (g *Game) TeaRun(player string, plan TeaPlan, mode, key string) (TeaRun, error) {
	var run TeaRun
	if mode != "practice" && mode != "official" {
		return run, fail(400, "TEA_MODE", "请选择试营业或正式营业")
	}
	if len(key) < 1 || len(key) > 128 || strings.TrimSpace(key) == "" {
		return run, fail(400, "TEA_KEY", "请提供1至128字节的幂等键")
	}
	raw, _ := json.Marshal(struct {
		Plan TeaPlan `json:"plan"`
		Mode string  `json:"mode"`
	}{plan, mode})
	request := string(raw)
	now := g.Now()
	day := teaDay(now)
	err := g.transaction(func(tx storage.Tx) error {
		var prev, prevBody string
		err := tx.QueryRow("SELECT result,request_body FROM tea_runs WHERE player_id=? AND request_key=?", player, key).Scan(&prev, &prevBody)
		if err == nil {
			if prevBody != request {
				return fail(409, "TEA_KEY_REUSED", "该幂等键已用于另一份计划")
			}
			return json.Unmarshal([]byte(prev), &run)
		}
		if err != sql.ErrNoRows {
			return err
		}
		if mode == "official" {
			if err = teaEnsure(tx, player, now); err != nil {
				return err
			}
		}
		workers, err := teaResolve(tx, player, day, plan)
		if err != nil {
			return err
		}
		var coins int
		if err = tx.QueryRow("SELECT coins FROM players WHERE id=?", player).Scan(&coins); err != nil {
			return err
		}
		run = TeaRun{ID: randomID(), Mode: mode, Challenge: teaChallenge(day), Plan: plan, Workers: workers, CoinsAfter: coins, SettledAt: now}
		run.Result = simulateTea(run.Challenge, plan, workers)
		if mode == "practice" {
			run.ID = "practice-" + run.ID
			resultJSON, _ := json.Marshal(run)
			_, err = tx.Exec("INSERT INTO tea_runs(id,player_id,request_key,request_body,mode,day,completed,bonus,result,created_at) VALUES(?,?,?,?,?,?,?,?,?,?)", run.ID, player, key, request, mode, day, run.Result.Completed, 0, string(resultJSON), now)
			return err
		}
		var attempts, bonuses int
		if err = tx.QueryRow("SELECT (SELECT COUNT(*) FROM tea_runs WHERE player_id=? AND day=? AND mode='official')+(SELECT COUNT(*) FROM tea_sessions WHERE player_id=? AND day=? AND mode='official' AND status='active'),(SELECT COALESCE(SUM(bonus),0) FROM tea_runs WHERE player_id=? AND day=? AND mode='official')", player, day, player, day, player, day).Scan(&attempts, &bonuses); err != nil {
			return err
		}
		if attempts >= 3 {
			return fail(409, "TEA_DAILY_LIMIT", "今天已完成3次正式营业，可以继续免费试营业")
		}
		for _, w := range workers {
			if w.PlayerID != "" && w.ID != "self" && w.Remaining <= 0 {
				return fail(409, "TEA_HIRE_LIMIT", w.Name+"今天已完成3次有酬营业")
			}
		}
		if coins < run.Result.TotalCost {
			return fail(402, "TEA_FUNDS", "钱包不足以支付本次筹备费用，请先选择更经济的方案")
		}
		if run.Result.Passed && bonuses == 0 {
			run.Result.Bonus = 200
		}
		run.CoinsAfter = coins + run.Result.Profit + run.Result.Bonus
		// Insert once before all payments. The request key and all transfers commit together.
		resultJSON, _ := json.Marshal(run)
		if _, err = tx.Exec("INSERT INTO tea_runs(id,player_id,request_key,request_body,mode,day,completed,bonus,result,created_at) VALUES(?,?,?,?,?,?,?,?,?,?)", run.ID, player, key, request, mode, day, run.Result.Completed, run.Result.Bonus, string(resultJSON), now); err != nil {
			return err
		}
		if _, err = tx.Exec("UPDATE players SET coins=? WHERE id=?", run.CoinsAfter, player); err != nil {
			return err
		}
		ref := "tea:" + run.ID
		if err = ledger(tx, "player:"+player, -run.Result.TotalCost, "tea_cost", ref, now); err != nil {
			return err
		}
		if err = ledger(tx, "player:"+player, run.Result.Revenue+run.Result.Bonus, "tea_sales", ref, now); err != nil {
			return err
		}
		sink := run.Result.MaterialCost + run.Result.OperatingCost
		for i, w := range workers {
			if w.Salary == 0 {
				continue
			}
			if w.PlayerID == "" {
				sink += w.Salary
				continue
			}
			if _, err = tx.Exec("UPDATE players SET coins=coins+? WHERE id=?", w.Salary, w.PlayerID); err != nil {
				return err
			}
			if err = ledger(tx, "player:"+w.PlayerID, w.Salary, "tea_wage", ref, now); err != nil {
				return err
			}
			if _, err = tx.Exec("INSERT INTO tea_jobs(run_id,employee_id,employer_id,worker_name,role,salary,completed,day,created_at) VALUES(?,?,?,?,?,?,?,?,?)", run.ID, w.PlayerID, player, w.Name, plan.Assignments[i].Role, w.Salary, run.Result.Completed, day, now); err != nil {
				return err
			}
			if err = message(tx, &w.PlayerID, "tea_wage", "你的分身完成了一场营业", fmt.Sprintf("%s 的奶茶店聘请你担任%s，工资%d金币已到账。", player, plan.Assignments[i].Role, w.Salary), map[string]any{"runId": run.ID, "salary": w.Salary}, now); err != nil {
				return err
			}
		}
		if err = ledger(tx, "system", sink-run.Result.Revenue-run.Result.Bonus, "tea_economy", ref, now); err != nil {
			return err
		}
		_, err = tx.Exec("UPDATE tea_shops SET runs=runs+1,best=MAX(best,?) WHERE player_id=?", run.Result.Completed, player)
		return err
	})
	return run, err
}
func (g *Game) TeaGetRun(player, id string) (TeaRun, error) {
	var run TeaRun
	var raw string
	err := g.readDB().QueryRow("SELECT result FROM tea_runs WHERE id=? AND player_id=?", id, player).Scan(&raw)
	if err != nil {
		return run, noRow(err, "TEA_NO_RUN", "这场营业记录不存在")
	}
	err = json.Unmarshal([]byte(raw), &run)
	return run, err
}
func (g *Game) TeaHireSettings(player string, enabled bool) (TeaHome, error) {
	err := g.transaction(func(tx storage.Tx) error {
		if err := teaEnsure(tx, player, g.Now()); err != nil {
			return err
		}
		_, err := tx.Exec("UPDATE tea_avatars SET enabled=? WHERE player_id=?", enabled, player)
		return err
	})
	if err != nil {
		return TeaHome{}, err
	}
	return g.TeaHome(player)
}
func (g *Game) TeaUpgrade(player string, expected int) (TeaHome, error) {
	if expected < 1 || expected > 2 {
		return TeaHome{}, fail(400, "TEA_LEVEL", "升级前等级必须为1或2")
	}
	err := g.transaction(func(tx storage.Tx) error {
		now := g.Now()
		if err := teaEnsure(tx, player, now); err != nil {
			return err
		}
		var level, coins int
		if err := tx.QueryRow("SELECT s.level,p.coins FROM tea_shops s JOIN players p ON p.id=s.player_id WHERE s.player_id=?", player).Scan(&level, &coins); err != nil {
			return err
		}
		if level > expected {
			return nil
		}
		if level != expected {
			return fail(409, "TEA_LEVEL_CHANGED", "店铺等级已变化，请刷新")
		}
		var active int
		if err := tx.QueryRow("SELECT COUNT(*) FROM tea_sessions WHERE player_id=? AND status='active'", player).Scan(&active); err != nil {
			return err
		}
		if active > 0 {
			return fail(409, "TEA_ACTIVE", "营业中不能装修，请结束本班后升级")
		}
		price := 600
		if level == 2 {
			price = 1200
		}
		if coins < price {
			return fail(402, "TEA_FUNDS", "金币不足，先完成几场营业吧")
		}
		if _, err := tx.Exec("UPDATE players SET coins=coins-? WHERE id=?", price, player); err != nil {
			return err
		}
		if _, err := tx.Exec("UPDATE tea_shops SET level=level+1 WHERE player_id=?", player); err != nil {
			return err
		}
		if _, err := tx.Exec("UPDATE tea_chapters SET stage=4 WHERE player_id=? AND stage>=3", player); err != nil {
			return err
		}
		ref := fmt.Sprintf("tea:upgrade:%s:%d", player, expected)
		if err := ledger(tx, "player:"+player, -price, "tea_upgrade", ref, now); err != nil {
			return err
		}
		return ledger(tx, "system", price, "tea_upgrade", ref, now)
	})
	if err != nil {
		return TeaHome{}, err
	}
	return g.TeaHome(player)
}

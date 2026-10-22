package backend

import (
	"database/sql"
	"encoding/json"
	"fmt"
	"strings"
)

type TeaCommand struct {
	T    float64 `json:"t"`
	Role string  `json:"role"`
}
type TeaChapter struct {
	Stage           string  `json:"stage"`
	SoloBest        int     `json:"soloBest"`
	DuoBest         int     `json:"duoBest"`
	ActiveSessionID *string `json:"activeSessionId"`
}
type TeaLiveCustomer struct {
	ID       int     `json:"id"`
	State    string  `json:"state"`
	At       float64 `json:"at"`
	WorkerID string  `json:"workerId,omitempty"`
}
type TeaLiveWorker struct {
	ID         string  `json:"id"`
	Role       string  `json:"role"`
	CustomerID int     `json:"customerId,omitempty"`
	Progress   float64 `json:"progress"`
}
type TeaSelfTask struct {
	Role       string  `json:"role"`
	Done       int     `json:"done"`
	Remaining  int     `json:"remaining"`
	QueuedRole *string `json:"queuedRole"`
}
type TeaLiveFrame struct {
	TeaFrame
	CustomersState []TeaLiveCustomer `json:"customersState"`
	WorkersState   []TeaLiveWorker   `json:"workersState"`
	SelfTask       TeaSelfTask       `json:"selfTask"`
}
type TeaSession struct {
	ID       string       `json:"id"`
	Lesson   string       `json:"lesson"`
	Status   string       `json:"status"`
	Revision int          `json:"revision"`
	T        int          `json:"t"`
	Run      TeaRun       `json:"run"`
	Frame    TeaLiveFrame `json:"frame"`
	Commands []TeaCommand `json:"commands"`
	Hold     int          `json:"hold"`
}
type TeaOpenSession struct {
	Plan   TeaPlan `json:"plan"`
	Lesson string  `json:"lesson"`
	Mode   string  `json:"mode"`
	Key    string  `json:"idempotencyKey"`
}
type TeaStep struct {
	Revision  int    `json:"revision"`
	Advance   int    `json:"advance"`
	Assign    string `json:"assign,omitempty"`
	RequestID string `json:"requestId"`
}

// Store only the frozen inputs and accepted commands, rather than an unearned
// future result. Reconstructing a prefix makes retries and process restarts exact.
type teaLiveRecord struct {
	ID, Lesson, Status, Day, Key    string
	Revision, T, Hold, OpeningCoins int
	Run                             TeaRun
	Commands                        []TeaCommand
	Receipts                        map[string]string
	ReceiptOrder                    []string
}

func (s *teaLiveRecord) snapshot() TeaSession {
	run := s.Run
	result, frame := simulateTeaUntil(run.Challenge, run.Plan, run.Workers, s.T, s.Commands, true, s.Lesson)
	if s.Status == "finished" {
		result = s.Run.Result
	}
	run.Result = result
	return TeaSession{ID: s.ID, Lesson: s.Lesson, Status: s.Status, Revision: s.Revision, T: s.T, Run: run, Frame: frame, Commands: s.Commands, Hold: s.Hold}
}
func teaLiveRead(tx *sql.Tx, player, id string) (teaLiveRecord, error) {
	var s teaLiveRecord
	var raw string
	err := tx.QueryRow("SELECT data FROM tea_sessions WHERE id=? AND player_id=?", id, player).Scan(&raw)
	if err != nil {
		return s, noRow(err, "TEA_NO_SESSION", "这场营业不存在")
	}
	err = json.Unmarshal([]byte(raw), &s)
	return s, err
}
func teaLiveSave(tx *sql.Tx, s *teaLiveRecord) error {
	raw, err := json.Marshal(s)
	if err != nil {
		return err
	}
	_, err = tx.Exec("UPDATE tea_sessions SET status=?,data=? WHERE id=?", s.Status, string(raw), s.ID)
	return err
}
func teaChapter(tx *sql.Tx, player string) (TeaChapter, error) {
	c := TeaChapter{}
	var stage int
	err := tx.QueryRow("SELECT stage,solo_best,duo_best FROM tea_chapters WHERE player_id=?", player).Scan(&stage, &c.SoloBest, &c.DuoBest)
	if err != nil {
		return c, err
	}
	c.Stage = []string{"solo", "duo", "rush", "upgrade", "complete"}[min(4, max(0, stage))]
	var id string
	err = tx.QueryRow("SELECT id FROM tea_sessions WHERE player_id=? AND status='active'", player).Scan(&id)
	if err == nil {
		c.ActiveSessionID = &id
	} else if err != sql.ErrNoRows {
		return c, err
	}
	return c, nil
}
func teaResolveLive(tx *sql.Tx, player, day, lesson string, plan TeaPlan) ([]TeaWorker, error) {
	n := len(plan.Assignments)
	expected := map[string]int{"solo": 1, "duo": 2, "rush": 3}[lesson]
	if n < 1 || n > 3 || plan.Assignments[0].WorkerID != "self" || (expected > 0 && n != expected) {
		return nil, fail(400, "TEA_TEAM", "本段需要主角和对应数量的同事")
	}
	validStock := plan.Stock == 60 || plan.Stock == 80 || plan.Stock == 100
	if lesson == "rescue" {
		var level int
		if err := tx.QueryRow("SELECT level FROM tea_shops WHERE player_id=?", player).Scan(&level); err != nil {
			return nil, err
		}
		validStock = false
		for _, stock := range teaBusinessStocks(level) {
			validStock = validStock || plan.Stock == stock
		}
	}
	if !validStock {
		return nil, fail(400, "TEA_STOCK", "请选择本班支持的备货数量")
	}
	if plan.Strategy != "balanced" && plan.Strategy != "speed" && plan.Strategy != "service" {
		return nil, fail(400, "TEA_STRATEGY", "经营策略无效")
	}
	var name, color string
	if err := tx.QueryRow("SELECT name,color FROM players WHERE id=?", player).Scan(&name, &color); err != nil {
		return nil, err
	}
	ws, err := teaWorkers(tx, player, day)
	if err != nil {
		return nil, err
	}
	ws = append(ws, teaSelf(player, name, color))
	byID := map[string]TeaWorker{}
	for _, w := range ws {
		byID[w.ID] = w
	}
	out := []TeaWorker{}
	seen := map[string]bool{}
	cost := plan.Stock*6 + 120
	for _, a := range plan.Assignments {
		if seen[a.WorkerID] {
			return nil, fail(400, "TEA_DUPLICATE", "一位同事只能占一个岗位")
		}
		seen[a.WorkerID] = true
		if a.Role != "cashier" && a.Role != "maker" && a.Role != "support" {
			return nil, fail(400, "TEA_ROLE", "岗位无效")
		}
		w, ok := byID[a.WorkerID]
		if !ok || !w.Enabled {
			return nil, fail(409, "TEA_UNAVAILABLE", "这位同事暂不可招募")
		}
		if lesson == "rescue" {
			w.Salary = (w.Salary + 3) / 4
		}
		cost += w.Salary
		out = append(out, w)
	}
	if cost > 1100 {
		return nil, fail(400, "TEA_BUDGET", "筹备支出超过1100预算")
	}
	return out, nil
}
func (g *Game) TeaOpen(player string, input TeaOpenSession) (TeaSession, error) {
	var out TeaSession
	if input.Mode != "practice" && input.Mode != "official" {
		return out, fail(400, "TEA_MODE", "营业模式无效")
	}
	if len(input.Key) < 1 || len(input.Key) > 128 || strings.TrimSpace(input.Key) == "" {
		return out, fail(400, "TEA_KEY", "缺少有效请求编号")
	}
	if input.Lesson != "solo" && input.Lesson != "duo" && input.Lesson != "rush" && input.Lesson != "free" && input.Lesson != "rescue" {
		return out, fail(400, "TEA_LESSON", "章节无效")
	}
	if (input.Lesson == "solo" || input.Lesson == "duo") && input.Mode != "practice" {
		return out, fail(400, "TEA_MODE", "教学试营免费")
	}
	raw, _ := json.Marshal(input)
	request := string(raw)
	now := g.Now()
	day := teaDay(now)
	err := g.transaction(func(tx *sql.Tx) error {
		var id, body string
		err := tx.QueryRow("SELECT id,request_body FROM tea_sessions WHERE player_id=? AND request_key=?", player, input.Key).Scan(&id, &body)
		if err == nil {
			if body != request {
				return fail(409, "TEA_KEY_REUSED", "同一请求编号不能更换筹备计划")
			}
			s, e := teaLiveRead(tx, player, id)
			if e != nil {
				return e
			}
			out = s.snapshot()
			return nil
		}
		if err != sql.ErrNoRows {
			return err
		}
		if err = teaEnsure(tx, player, now); err != nil {
			return err
		}
		c, err := teaChapter(tx, player)
		if err != nil {
			return err
		}
		if c.ActiveSessionID != nil {
			return fail(409, "TEA_ACTIVE", "还有一场营业尚未结束，请先继续营业")
		}
		stage := map[string]int{"solo": 0, "duo": 1, "rush": 2, "upgrade": 3, "complete": 4}[c.Stage]
		need := map[string]int{"solo": 0, "duo": 1, "rush": 2, "free": 4}[input.Lesson]
		if stage < need {
			return fail(409, "TEA_CHAPTER_LOCKED", "先完成眼前的章节目标")
		}
		if input.Lesson == "rescue" {
			m, err := teaMission(tx, player)
			if err != nil {
				return err
			}
			if m.Status == "offered" {
				return fail(409, "TEA_MISSION_REQUIRED", "先在手机接下救店任务")
			}
		}
		workers, err := teaResolveLive(tx, player, day, input.Lesson, input.Plan)
		if err != nil {
			return err
		}
		var coins int
		if err = tx.QueryRow("SELECT coins FROM players WHERE id=?", player).Scan(&coins); err != nil {
			return err
		}
		ch := teaChallenge(day)
		ch.RuleVersion = "tea.2"
		ch.ID = "first-cup-" + day + "-" + input.Lesson
		if input.Lesson == "solo" {
			ch.Name = "第一杯生意"
			ch.Duration = 90
			ch.Arrivals = 8
			ch.Target = 1
		}
		if input.Lesson == "duo" {
			ch.Name = "有人替你出杯"
			ch.Duration = 120
			ch.Arrivals = 18
			ch.Target = 1
		}
		if input.Lesson == "rescue" {
			var level int
			if err := tx.QueryRow("SELECT level FROM tea_shops WHERE player_id=?", player).Scan(&level); err != nil {
				return err
			}
			ch = teaBusinessChallenge(day, level)
		}
		s := teaLiveRecord{ID: randomID(), Lesson: input.Lesson, Status: "active", Day: day, Key: input.Key, OpeningCoins: coins, Commands: []TeaCommand{}, Receipts: map[string]string{}, ReceiptOrder: []string{}}
		s.Run = TeaRun{ID: s.ID, Mode: input.Mode, Challenge: ch, Plan: input.Plan, Workers: workers, CoinsAfter: coins}
		result, _ := simulateTeaUntil(ch, input.Plan, workers, 0, nil, true, input.Lesson)
		if input.Mode == "official" {
			var used int
			if err = tx.QueryRow("SELECT (SELECT COUNT(*) FROM tea_runs WHERE player_id=? AND day=? AND mode='official')+(SELECT COUNT(*) FROM tea_sessions WHERE player_id=? AND day=? AND mode='official' AND status='active')", player, day, player, day).Scan(&used); err != nil {
				return err
			}
			if used >= 3 {
				return fail(409, "TEA_DAILY_LIMIT", "今天正式营业机会已用完，可继续免费试营")
			}
			for _, w := range workers {
				if w.PlayerID != "" && w.ID != "self" && w.Remaining <= 0 {
					return fail(409, "TEA_HIRE_LIMIT", w.Name+"今天的有酬名额已用完")
				}
			}
			if coins < result.TotalCost {
				return fail(402, "TEA_FUNDS", "钱包不足以预付本场筹备费用")
			}
			s.Hold = result.TotalCost
			s.Run.CoinsAfter = coins - s.Hold
			if _, err = tx.Exec("UPDATE players SET coins=coins-? WHERE id=?", s.Hold, player); err != nil {
				return err
			}
			ref := "tea:hold:" + s.ID
			if err = ledger(tx, "player:"+player, -s.Hold, "tea_hold", ref, now); err != nil {
				return err
			}
			if err = ledger(tx, "system", s.Hold, "tea_hold", ref, now); err != nil {
				return err
			}
		}
		data, _ := json.Marshal(s)
		if _, err = tx.Exec("INSERT INTO tea_sessions(id,player_id,request_key,request_body,mode,day,status,data) VALUES(?,?,?,?,?,?,?,?)", s.ID, player, input.Key, request, input.Mode, day, s.Status, string(data)); err != nil {
			return err
		}
		if input.Mode == "official" {
			for _, w := range workers {
				if w.PlayerID != "" && w.ID != "self" {
					if _, err = tx.Exec("INSERT INTO tea_live_jobs(session_id,employee_id,day) VALUES(?,?,?)", s.ID, w.PlayerID, day); err != nil {
						return err
					}
				}
			}
		}
		out = s.snapshot()
		return nil
	})
	return out, err
}
func (g *Game) TeaGetSession(player, id string) (TeaSession, error) {
	var out TeaSession
	err := g.transaction(func(tx *sql.Tx) error {
		s, err := teaLiveRead(tx, player, id)
		if err != nil {
			return err
		}
		out = s.snapshot()
		return nil
	})
	return out, err
}
func (g *Game) TeaStepSession(player, id string, input TeaStep) (TeaSession, error) {
	var out TeaSession
	if input.Advance < 0 || input.Advance > 240 || input.Revision < 0 || len(input.RequestID) < 1 || len(input.RequestID) > 128 {
		return out, fail(400, "TEA_STEP", "营业操作无效")
	}
	if input.Assign != "" && input.Assign != "cashier" && input.Assign != "maker" {
		return out, fail(400, "TEA_ROLE", "只能指派自己接待或制作")
	}
	raw, _ := json.Marshal(input)
	request := string(raw)
	err := g.transaction(func(tx *sql.Tx) error {
		s, err := teaLiveRead(tx, player, id)
		if err != nil {
			return err
		}
		if previous, ok := s.Receipts[input.RequestID]; ok {
			if previous != request {
				return fail(409, "TEA_KEY_REUSED", "同一操作编号内容不一致")
			}
			out = s.snapshot()
			return nil
		}
		if input.Revision != s.Revision {
			return fail(409, "TEA_REVISION", "营业已更新，正在同步最新状态")
		}
		if s.Status != "active" {
			return fail(409, "TEA_FINISHED", "营业已经结束")
		}
		if input.Advance == 0 && input.Assign == "" {
			return fail(400, "TEA_STEP", "请推进时间或指派一批工作")
		}
		if input.Assign != "" {
			snapshot := s.snapshot()
			if snapshot.Frame.SelfTask.QueuedRole != nil {
				return fail(409, "TEA_SELF_BUSY", "下一批已经安排好了")
			}
			q := snapshot.Frame.CashierQueue
			if input.Assign == "maker" {
				q = snapshot.Frame.MakerQueue
			}
			if q == 0 {
				return fail(409, "TEA_EMPTY", "这个岗位暂时没有积压")
			}
			if len(s.Commands) >= 1024 {
				return fail(409, "TEA_COMMAND_LIMIT", "本场指派已达上限")
			}
			s.Commands = append(s.Commands, TeaCommand{T: float64(s.T), Role: input.Assign})
		}
		s.T = min(s.Run.Challenge.Duration, s.T+input.Advance)
		s.Revision++
		s.Receipts[input.RequestID] = request
		s.ReceiptOrder = append(s.ReceiptOrder, input.RequestID)
		if len(s.ReceiptOrder) > 256 {
			delete(s.Receipts, s.ReceiptOrder[0])
			s.ReceiptOrder = s.ReceiptOrder[1:]
		}
		if s.T == s.Run.Challenge.Duration {
			s.Run.Result, _ = simulateTeaUntil(s.Run.Challenge, s.Run.Plan, s.Run.Workers, s.T, s.Commands, true, s.Lesson)
			if err = g.teaFinishLive(tx, player, &s); err != nil {
				return err
			}
			s.Status = "finished"
		}
		if err = teaLiveSave(tx, &s); err != nil {
			return err
		}
		out = s.snapshot()
		return nil
	})
	return out, err
}
func (g *Game) teaFinishLive(tx *sql.Tx, player string, s *teaLiveRecord) error {
	now := g.Now()
	r := &s.Run
	var coins int
	if err := tx.QueryRow("SELECT coins FROM players WHERE id=?", player).Scan(&coins); err != nil {
		return err
	}
	if r.Mode == "official" {
		var bonuses int
		if err := tx.QueryRow("SELECT COALESCE(SUM(bonus),0) FROM tea_runs WHERE player_id=? AND day=? AND mode='official'", player, s.Day).Scan(&bonuses); err != nil {
			return err
		}
		if r.Result.Passed && bonuses == 0 {
			r.Result.Bonus = 200
		}
		coins += r.Result.Revenue + r.Result.Bonus
	}
	r.CoinsAfter, r.SettledAt = coins, now
	encoded, _ := json.Marshal(r)
	if _, err := tx.Exec("INSERT INTO tea_runs(id,player_id,request_key,request_body,mode,day,completed,bonus,result,created_at) VALUES(?,?,?,?,?,?,?,?,?,?)", s.ID, player, "live:"+s.Key, "live:"+s.ID, r.Mode, s.Day, r.Result.Completed, r.Result.Bonus, string(encoded), now); err != nil {
		return err
	}
	if r.Mode == "official" {
		if _, err := tx.Exec("UPDATE players SET coins=? WHERE id=?", coins, player); err != nil {
			return err
		}
		ref := "tea:" + s.ID
		income := r.Result.Revenue + r.Result.Bonus
		if err := ledger(tx, "player:"+player, income, "tea_sales", ref, now); err != nil {
			return err
		}
		realWages := 0
		for i, w := range r.Workers {
			if w.ID == "self" || w.PlayerID == "" || w.Salary == 0 {
				continue
			}
			realWages += w.Salary
			if _, err := tx.Exec("UPDATE players SET coins=coins+? WHERE id=?", w.Salary, w.PlayerID); err != nil {
				return err
			}
			if err := ledger(tx, "player:"+w.PlayerID, w.Salary, "tea_wage", ref, now); err != nil {
				return err
			}
			if _, err := tx.Exec("INSERT INTO tea_jobs(run_id,employee_id,employer_id,worker_name,role,salary,completed,day,created_at) VALUES(?,?,?,?,?,?,?,?,?)", s.ID, w.PlayerID, player, w.Name, r.Plan.Assignments[i].Role, w.Salary, r.Result.Completed, s.Day, now); err != nil {
				return err
			}
			if err := message(tx, &w.PlayerID, "tea_wage", "你的分身完成了一场营业", fmt.Sprintf("奶茶店聘请你担任%s，工资%d金币已到账。", r.Plan.Assignments[i].Role, w.Salary), map[string]any{"runId": s.ID, "salary": w.Salary}, now); err != nil {
				return err
			}
		}
		if err := ledger(tx, "system", -income-realWages, "tea_economy", ref, now); err != nil {
			return err
		}
		if _, err := tx.Exec("UPDATE tea_shops SET runs=runs+1,best=MAX(best,?) WHERE player_id=?", r.Result.Completed, player); err != nil {
			return err
		}
		if err := teaBusinessRecord(tx, player, *r); err != nil {
			return err
		}
		if s.Lesson == "rescue" && r.Result.Revenue > 0 && r.Result.Profit+r.Result.Bonus > 0 {
			if _, err := tx.Exec("UPDATE tea_missions SET completed_at=?,income=?,run_id=? WHERE player_id=? AND completed_at=0", now, r.Result.Profit+r.Result.Bonus, s.ID, player); err != nil {
				return err
			}
		}
		if r.Result.Passed {
			var level int
			if err := tx.QueryRow("SELECT level FROM tea_shops WHERE player_id=?", player).Scan(&level); err != nil {
				return err
			}
			stage := 3
			if level >= 2 {
				stage = 4
			}
			if _, err := tx.Exec("UPDATE tea_chapters SET stage=MAX(stage,?) WHERE player_id=?", stage, player); err != nil {
				return err
			}
		}
	}
	if s.Lesson == "solo" || s.Lesson == "duo" {
		col, stage := "solo_best", 1
		if s.Lesson == "duo" {
			col, stage = "duo_best", 2
		}
		if _, err := tx.Exec("UPDATE tea_chapters SET "+col+"=MAX("+col+",?),stage=MAX(stage,?) WHERE player_id=?", r.Result.Completed, func() int {
			if r.Result.Completed > 0 {
				return stage
			}
			return 0
		}(), player); err != nil {
			return err
		}
	}
	_, err := tx.Exec("DELETE FROM tea_live_jobs WHERE session_id=?", s.ID)
	return err
}

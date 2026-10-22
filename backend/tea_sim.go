package backend

import (
	"math"
	"sort"
)

const teaVersion = "tea.1"

type TeaWorker struct {
	ID           string `json:"id"`
	PlayerID     string `json:"playerId"`
	Name         string `json:"name"`
	Color        string `json:"color"`
	Service      int    `json:"service"`
	Production   int    `json:"production"`
	Adaptability int    `json:"adaptability"`
	Skill        string `json:"skill"`
	Salary       int    `json:"salary"`
	Enabled      bool   `json:"enabled"`
	Remaining    int    `json:"remaining"`
	Demo         bool   `json:"demo"`
}
type TeaAssignment struct {
	WorkerID string `json:"workerId"`
	Role     string `json:"role"`
}
type TeaPlan struct {
	Assignments []TeaAssignment `json:"assignments"`
	Stock       int             `json:"stock"`
	Strategy    string          `json:"strategy"`
}
type TeaChallenge struct {
	ID            string `json:"id"`
	Seed          uint32 `json:"seed"`
	RuleVersion   string `json:"ruleVersion"`
	ShopLevel     int    `json:"shopLevel,omitempty"`
	Name          string `json:"name"`
	Duration      int    `json:"duration"`
	Arrivals      int    `json:"arrivals"`
	Target        int    `json:"target"`
	Budget        int    `json:"budget"`
	Price         int    `json:"price"`
	MaterialCost  int    `json:"materialCost"`
	OperatingCost int    `json:"operatingCost"`
}
type TeaFrame struct {
	T            float64 `json:"t"`
	Customers    int     `json:"customers"`
	Served       int     `json:"served"`
	Lost         int     `json:"lost"`
	CashierQueue int     `json:"cashierQueue"`
	MakerQueue   int     `json:"makerQueue"`
	Stock        float64 `json:"stock"`
}
type TeaEvent struct {
	T          float64 `json:"t"`
	Type       string  `json:"type"`
	CustomerID int     `json:"customerId,omitempty"`
	WorkerID   string  `json:"workerId,omitempty"`
	Role       string  `json:"role,omitempty"`
	Skill      string  `json:"skill,omitempty"`
	Reason     string  `json:"reason,omitempty"`
}
type TeaResult struct {
	Arrivals         int            `json:"arrivals"`
	Accepted         int            `json:"accepted"`
	Completed        int            `json:"completed"`
	Lost             int            `json:"lost"`
	ReceptionRate    float64        `json:"receptionRate"`
	Revenue          int            `json:"revenue"`
	MaterialCost     int            `json:"materialCost"`
	Wages            int            `json:"wages"`
	OperatingCost    int            `json:"operatingCost"`
	TotalCost        int            `json:"totalCost"`
	Profit           int            `json:"profit"`
	Bonus            int            `json:"bonus"`
	PeakCashierQueue int            `json:"peakCashierQueue"`
	PeakMakerQueue   int            `json:"peakMakerQueue"`
	AvgCashierWait   float64        `json:"avgCashierWait"`
	AvgMakerWait     float64        `json:"avgMakerWait"`
	StockLeft        float64        `json:"stockLeft"`
	LostCashier      int            `json:"lostCashier"`
	LostMaker        int            `json:"lostMaker"`
	LostStock        int            `json:"lostStock"`
	Passed           bool           `json:"passed"`
	Bottleneck       string         `json:"bottleneck"`
	Suggestion       string         `json:"suggestion"`
	SkillCounts      map[string]int `json:"skillCounts"`
	Frames           []TeaFrame     `json:"frames"`
	Events           []TeaEvent     `json:"events"`
}
type TeaRun struct {
	ID         string       `json:"id"`
	Mode       string       `json:"mode"`
	Challenge  TeaChallenge `json:"challenge"`
	Plan       TeaPlan      `json:"plan"`
	Workers    []TeaWorker  `json:"workers"`
	Result     TeaResult    `json:"result"`
	CoinsAfter int          `json:"coinsAfter"`
	SettledAt  int64        `json:"settledAt"`
}

type teaCustomer struct {
	id                                int
	arrival, patience, waited, queued float64
	state                             string
	at                                float64
	workerID                          string
}
type teaStation struct {
	w                             TeaWorker
	role, currentRole             string
	customer                      int
	end, switchUntil, congestedAt float64
	made, boost                   int
	steady, rescuing              bool
	start                         float64
}

// Pure, fixed-quarter-second simulation. Ties: completion, arrivals, patience,
// dispatch in assignment order. Neither wall time nor global randomness participates.
func simulateTea(ch TeaChallenge, plan TeaPlan, workers []TeaWorker) TeaResult {
	r, _ := simulateTeaUntil(ch, plan, workers, ch.Duration, nil, false, "")
	return r
}

// Both legacy replays and live play use this core. Live requests reveal only
// the prefix reached by the server-owned clock and accepted command timeline.
func simulateTeaUntil(ch TeaChallenge, plan TeaPlan, workers []TeaWorker, until int, commands []TeaCommand, manual bool, lesson string) (TeaResult, TeaLiveFrame) {
	r := TeaResult{Arrivals: ch.Arrivals, MaterialCost: plan.Stock * ch.MaterialCost, OperatingCost: ch.OperatingCost, SkillCounts: map[string]int{}, Frames: []TeaFrame{}, Events: []TeaEvent{}}
	for _, w := range workers {
		r.Wages += w.Salary
	}
	r.TotalCost = r.MaterialCost + r.OperatingCost + r.Wages
	seed := ch.Seed
	rand := func() float64 { seed = seed*1664525 + 1013904223; return float64(seed) / 4294967296 }
	cs := make([]teaCustomer, ch.Arrivals)
	for i := range cs {
		u := rand()
		at := 0.0
		switch {
		case u < .18:
			at = 3 + u/.18*55
		case u < .82:
			at = 58 + (u-.18)/.64*90
		default:
			at = 148 + (u-.82)/.18*47
		}
		if lesson == "solo" || lesson == "duo" || lesson == "rescue" {
			// Small teaching services use the same jobs, skills and patience rules.
			at = 4 + float64(i)*float64(ch.Duration-30)/float64(max(1, ch.Arrivals-1))
		}
		patience := 35 + rand()*22
		if plan.Strategy == "service" {
			patience *= 1.15
		}
		if plan.Strategy == "speed" {
			patience *= .92
		}
		cs[i] = teaCustomer{id: i + 1, arrival: math.Ceil(at*4) / 4, patience: patience, state: "pending"}
	}
	sort.SliceStable(cs, func(i, j int) bool { return cs[i].arrival < cs[j].arrival })
	stations := make([]teaStation, len(workers))
	golden := false
	for i, w := range workers {
		stations[i] = teaStation{w: w, role: plan.Assignments[i].Role, customer: -1, congestedAt: -1}
		if w.Skill == "golden_service" && plan.Assignments[i].Role == "cashier" {
			golden = true
		}
	}
	stock := float64(plan.Stock)
	arrived, served, lost := 0, 0, 0
	cw, mw := 0.0, 0.0
	nc, nm := 0, 0
	event := func(t float64, kind string, c int, w *teaStation, role, reason, skill string) {
		e := TeaEvent{T: t, Type: kind, Reason: reason, Role: role, Skill: skill}
		if c >= 0 {
			e.CustomerID = cs[c].id
		}
		if w != nil {
			e.WorkerID = w.w.ID
		}
		r.Events = append(r.Events, e)
	}
	skill := func(t float64, w *teaStation, role string) {
		r.SkillCounts[w.w.Skill]++
		event(t, "skill_triggered", -1, w, role, "", w.w.Skill)
	}
	if golden {
		for i := range stations {
			s := &stations[i]
			if s.w.Skill == "golden_service" && s.role == "cashier" {
				skill(0, s, "cashier")
				break
			}
		}
	}
	queues := func() (int, int) {
		a, b := 0, 0
		for i := range cs {
			if cs[i].state == "cashier" {
				a++
			}
			if cs[i].state == "maker" {
				b++
			}
		}
		return a, b
	}
	lose := func(t float64, i int, why string) {
		cs[i].state = "lost"
		cs[i].at = t
		lost++
		switch why {
		case "cashier":
			r.LostCashier++
		case "stock":
			r.LostStock++
		default:
			r.LostMaker++
		}
		event(t, "customer_lost", i, nil, "", why, "")
	}
	self := -1
	for i := range stations {
		if stations[i].w.ID == "self" {
			self = i
		}
	}
	taskRole, queuedRole := "", ""
	taskDone, taskEnd, nextCommand := 0, 0.0, 0
	beginTask := func(t float64, role string) {
		taskRole, taskDone, taskEnd = role, 0, t+12
		if self >= 0 {
			s := &stations[self]
			if s.currentRole != role {
				s.currentRole, s.switchUntil = role, t+1.5
				event(t, "support_moved", -1, s, role, "", "")
			}
			event(t, "self_assigned", -1, s, role, "", "")
		}
	}
	for tick := 0; tick <= min(until, ch.Duration)*4; tick++ {
		t := float64(tick) / 4
		for j := range stations {
			s := &stations[j]
			if s.customer >= 0 && s.end <= t {
				i := s.customer
				s.customer = -1
				if s.currentRole == "cashier" {
					cs[i].state = "maker"
					cs[i].at, cs[i].workerID = t, ""
					cs[i].queued = t
					cs[i].waited = 0
					r.Accepted++
					event(t, "order_queued", i, s, "maker", "", "")
				} else {
					cs[i].state = "served"
					cs[i].at = t
					served++
					event(t, "order_fulfilled", i, s, "maker", "", "")
					s.made++
					if s.boost > 0 {
						s.boost--
					}
					if s.w.Skill == "batch_master" && s.made%5 == 0 {
						s.boost = 3
						skill(t, s, "maker")
					}
				}
				if manual && j == self {
					taskDone++
				}
			}
		}
		for i := range cs {
			c := &cs[i]
			if c.state == "pending" && c.arrival <= t {
				c.state = "cashier"
				c.at = t
				c.queued = t
				arrived++
				event(t, "customer_arrived", i, nil, "", "", "")
			}
		}
		for i := range cs {
			c := &cs[i]
			if c.state == "cashier" || c.state == "maker" {
				d := .25
				if c.state == "cashier" && golden {
					d *= .85
				}
				if t > c.queued {
					c.waited += d
				}
				if c.waited >= c.patience {
					lose(t, i, c.state)
				}
			}
		}
		a, b := queues()
		r.PeakCashierQueue = max(r.PeakCashierQueue, a)
		r.PeakMakerQueue = max(r.PeakMakerQueue, b)
		if tick < ch.Duration*4 {
			if manual && self >= 0 {
				if taskRole != "" && stations[self].customer < 0 && (taskDone >= 3 || t >= taskEnd) {
					taskRole = ""
					event(t, "self_idle", -1, &stations[self], "", "", "")
				}
				if taskRole == "" && queuedRole != "" {
					role := queuedRole
					queuedRole = ""
					beginTask(t, role)
				}
				for nextCommand < len(commands) && commands[nextCommand].T <= t {
					role := commands[nextCommand].Role
					if taskRole == "" {
						beginTask(t, role)
					} else if queuedRole == "" {
						queuedRole = role
					}
					nextCommand++
				}
			}
			for j := range stations {
				s := &stations[j]
				if manual && j == self && taskRole == "" {
					continue
				}
				// Count uninterrupted congestion even while support is busy.
				if s.role == "support" && s.w.Skill == "rescue_captain" {
					qa, qb := queues()
					queue := qa
					if s.currentRole == "maker" {
						queue = qb
					}
					if s.currentRole != "" && queue >= 6 {
						if s.congestedAt < 0 {
							s.congestedAt = t
						}
						if !s.rescuing && t-s.congestedAt >= 5 {
							skill(t, s, s.currentRole)
							s.rescuing = true
						}
					} else {
						s.congestedAt, s.rescuing = -1, false
					}
				}
				if s.customer >= 0 || s.switchUntil > t {
					continue
				}
				role := s.role
				if manual && j == self {
					role = taskRole
				}
				if role == "support" {
					qa, qb := queues()
					if max(qa, qb) < 3 {
						s.currentRole = ""
						s.congestedAt = -1
						s.rescuing = false
						continue
					}
					role = "cashier"
					if qb >= qa {
						role = "maker"
					}
					if s.currentRole != role {
						s.currentRole = role
						s.switchUntil = t + 2
						s.congestedAt, s.rescuing = -1, false
						event(t, "support_moved", -1, s, role, "", "")
						continue
					}
				}
				chosen := -1
				for i := range cs {
					if cs[i].state == role {
						chosen = i
						break
					}
				}
				if chosen < 0 {
					continue
				}
				if role == "maker" {
					cost := 1.0
					if s.w.Skill == "materials_saver" {
						cost = .9
					}
					if stock+1e-8 < cost {
						lose(t, chosen, "stock")
						continue
					}
					stock = math.Round((stock-cost)*10) / 10
					if cost < 1 {
						skill(t, s, role)
					}
				}
				stat := s.w.Service
				if role == "maker" {
					stat = s.w.Production
				}
				if s.role == "support" {
					stat = s.w.Adaptability
				}
				duration := 8.5 - .06*float64(stat)
				if plan.Strategy == "speed" {
					duration /= 1.08
				}
				if plan.Strategy == "service" {
					duration /= .95
				}
				peak := t >= 60 && t < 150
				if peak {
					if s.w.Skill == "steady_hand" {
						if !s.steady {
							skill(t, s, role)
							s.steady = true
						}
					} else {
						duration *= 1.12
					}
				}
				if role == "maker" && s.boost > 0 {
					duration *= .8
				}
				if s.role == "support" && s.w.Skill == "rescue_captain" && s.rescuing {
					duration *= .8
				}
				if role == "cashier" {
					cw += t - cs[chosen].queued
					nc++
					cs[chosen].state = "ordering"
					event(t, "order_started", chosen, s, role, "", "")
				} else {
					mw += t - cs[chosen].queued
					nm++
					cs[chosen].state = "making"
					event(t, "making_started", chosen, s, role, "", "")
				}
				cs[chosen].at, cs[chosen].workerID = t, s.w.ID
				s.customer = chosen
				s.currentRole = role
				s.start = t
				s.end = t + math.Ceil(duration*4)/4
			}
		}
		if tick == ch.Duration*4 {
			for i := range cs {
				if cs[i].state != "served" && cs[i].state != "lost" {
					why := "maker"
					if cs[i].state == "cashier" || cs[i].state == "ordering" {
						why = "cashier"
					}
					lose(t, i, why)
				}
			}
		}
		if tick%4 == 0 {
			a, b = queues()
			r.Frames = append(r.Frames, TeaFrame{T: t, Customers: arrived, Served: served, Lost: lost, CashierQueue: a, MakerQueue: b, Stock: stock})
		}
	}
	r.Completed = served
	r.Lost = lost
	r.StockLeft = stock
	r.ReceptionRate = float64(served) / float64(ch.Arrivals)
	r.Revenue = served * ch.Price
	r.Profit = r.Revenue - r.TotalCost
	r.Passed = served >= ch.Target
	if nc > 0 {
		r.AvgCashierWait = math.Round(cw/float64(nc)*100) / 100
	}
	if nm > 0 {
		r.AvgMakerWait = math.Round(mw/float64(nm)*100) / 100
	}
	switch {
	case r.LostStock > 0:
		r.Bottleneck = "原料不足"
		r.Suggestion = "试试增加备货，或让节约原料的同事负责制作。"
	case r.LostCashier > r.LostMaker:
		r.Bottleneck = "前台接待拥堵"
		r.Suggestion = "招募接待更快的同事并安排前台，试试金牌服务。"
	case r.LostMaker > 0:
		r.Bottleneck = "制作出杯拥堵"
		r.Suggestion = "把高制作同事放到制作台，或用机动岗支援出杯。"
	case r.StockLeft >= 25:
		r.Bottleneck = "备货有余量"
		r.Suggestion = "已稳定接待，可以减少备货或选择更经济的阵容。"
	default:
		r.Bottleneck = "配合默契"
		r.Suggestion = "阵容已经均衡，继续优化成本，向明星旗舰店迈进。"
	}
	frame := TeaLiveFrame{TeaFrame: r.Frames[len(r.Frames)-1], CustomersState: []TeaLiveCustomer{}, WorkersState: []TeaLiveWorker{}, SelfTask: TeaSelfTask{Role: "idle"}}
	for _, c := range cs {
		if c.state != "pending" {
			frame.CustomersState = append(frame.CustomersState, TeaLiveCustomer{ID: c.id, State: c.state, At: c.at, WorkerID: c.workerID})
		}
	}
	for i, s := range stations {
		role := s.currentRole
		if role == "" {
			role = s.role
		}
		if manual && i == self {
			role = taskRole
			if role == "" {
				role = "idle"
			}
			frame.SelfTask = TeaSelfTask{Role: role, Done: taskDone, Remaining: max(0, 3-taskDone)}
			if queuedRole != "" {
				q := queuedRole
				frame.SelfTask.QueuedRole = &q
			}
			if role == "idle" {
				frame.SelfTask.Remaining = 0
			}
		}
		w := TeaLiveWorker{ID: s.w.ID, Role: role}
		if s.customer >= 0 {
			w.CustomerID = cs[s.customer].id
			w.Progress = math.Max(0, math.Min(1, (float64(until)-s.start)/math.Max(.25, s.end-s.start)))
		}
		frame.WorkersState = append(frame.WorkersState, w)
	}
	return r, frame
}

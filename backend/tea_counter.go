package backend

import (
	"fmt"
	"github.com/1994/boss-works-for-me/storage"
	"math"
)

type TeaCounterProgress struct {
	Day       int  `json:"day"`
	MakerXP   int  `json:"makerXp"`
	ServiceXP int  `json:"serviceXp"`
	GuideSeen bool `json:"guideSeen"`
}

func teaCounterRead(tx storage.Tx, player string) (TeaCounterProgress, error) {
	p := TeaCounterProgress{}
	if _, e := tx.Exec("INSERT OR IGNORE INTO tea_counter_progress(player_id) VALUES(?)", player); e != nil {
		return p, e
	}
	e := tx.QueryRow("SELECT day,maker_xp,service_xp,guide_seen FROM tea_counter_progress WHERE player_id=?", player).Scan(&p.Day, &p.MakerXP, &p.ServiceXP, &p.GuideSeen)
	return p, e
}
func counterSelf(w TeaWorker, p TeaCounterProgress) TeaWorker {
	w.Production = min(95, w.Production+min(5, p.MakerXP/10)*5)
	w.Service = min(95, w.Service+min(5, p.ServiceXP/10)*5)
	return w
}
func isCounterFlow(flow string) bool {
	return flow == "counter.1" || flow == "counter.2" || flow == "counter.3"
}

func counterChallenge(day string, level, businessDay int) TeaChallenge {
	c := teaBusinessChallenge(day, level)
	c.Flow = "counter.3"
	c.BusinessDay = businessDay
	c.ID = fmt.Sprintf("counter-%d-lv%d", businessDay, level)
	c.Duration = 60
	return c
}
func (g *Game) TeaDismissGuide(player string) (TeaHome, error) {
	e := g.transaction(func(tx storage.Tx) error {
		if e := teaEnsure(tx, player, g.Now()); e != nil {
			return e
		}
		if _, e := teaCounterRead(tx, player); e != nil {
			return e
		}
		_, e := tx.Exec("UPDATE tea_counter_progress SET guide_seen=1 WHERE player_id=?", player)
		return e
	})
	if e != nil {
		return TeaHome{}, e
	}
	return g.TeaHome(player)
}

// A saved counter run has its own versioned simulator. Older sessions replay
// with their original rules. Orders arrive automatically; money is earned only
// after a completed delivery. A single actor cannot work two stations at once.
func simulateCounter(ch TeaChallenge, plan TeaPlan, workers []TeaWorker, until int, commands []TeaCommand) (TeaResult, TeaLiveFrame) {
	until = min(ch.Duration, max(0, until))
	bounded := ch.Flow == "counter.2" || ch.Flow == "counter.3"
	r := TeaResult{Arrivals: ch.Arrivals, MaterialCost: plan.Stock * ch.MaterialCost, OperatingCost: ch.OperatingCost, SkillCounts: map[string]int{}, Frames: []TeaFrame{}, Events: []TeaEvent{}}
	for _, w := range workers {
		r.Wages += w.Salary
	}
	r.TotalCost = r.MaterialCost + r.OperatingCost + r.Wages
	arrivalWindow := ch.Duration - 40
	if bounded {
		arrivalWindow = ch.Duration - 20
	}
	cs := make([]teaCustomer, ch.Arrivals)
	for i := range cs {
		cs[i] = teaCustomer{id: i + 1, arrival: 2 + float64(i)*float64(arrivalWindow)/float64(max(1, ch.Arrivals-1)), patience: 55, state: "pending", seat: -1}
	}
	ss := make([]teaStation, len(workers))
	self := -1
	for i, w := range workers {
		ss[i] = teaStation{w: w, role: plan.Assignments[i].Role, customer: -1}
		if w.ID == "self" {
			self = i
		}
	}
	stock := float64(plan.Stock)
	arrived, served, lost := 0, 0, 0
	task, queued := "", ""
	done, next := 0, 0
	emit := func(t float64, kind string, c int, w, role, reason string) {
		e := TeaEvent{T: t, Type: kind, WorkerID: w, Role: role, Reason: reason}
		if c >= 0 {
			e.CustomerID = cs[c].id
		}
		r.Events = append(r.Events, e)
	}
	queues := func() (int, int) {
		a, b := 0, 0
		for _, c := range cs {
			if c.state == "ready" {
				a++
			}
			if c.state == "maker" {
				b++
			}
		}
		return a, b
	}
	startTask := func(t float64, role string) { task = role; done = 0; emit(t, "self_assigned", -1, "self", role, "") }
	for tick := 0; tick <= until*4; tick++ {
		t := float64(tick) / 4
		for j := range ss {
			s := &ss[j]
			if s.customer < 0 || s.end > t {
				continue
			}
			i := s.customer
			s.customer = -1
			if s.currentRole == "maker" {
				cs[i].state = "ready"
				cs[i].at = t
				cs[i].queued = t
				cs[i].workerID = ""
				emit(t, "drink_ready", i, s.w.ID, "maker", "")
				if j == self {
					r.SelfMade++
				}
			} else {
				cs[i].state = "served"
				cs[i].at = t
				served++
				emit(t, "order_fulfilled", i, s.w.ID, "cashier", "")
				if j == self {
					r.SelfServed++
				}
			}
			if j == self {
				done++
			}
		}
		for i := range cs {
			c := &cs[i]
			if c.state == "pending" && c.arrival <= t {
				if bounded {
					active, waiting := 0, 0
					for _, other := range cs {
						if other.state == "waiting" {
							waiting++
						}
						if other.state != "pending" && other.state != "lost" && other.state != "served" {
							active++
						}
					}
					if active >= 10 || waiting >= 2 {
						c.state = "lost"
						c.at = t
						arrived++
						lost++
						r.LostMaker++
						emit(t, "customer_lost", i, "", "", "full")
						continue
					}
				}
				c.state = "waiting"
				c.at = t
				c.queued = t
				arrived++
				r.Accepted++
				emit(t, "customer_arrived", i, "", "", "")
			}
			if c.state == "maker" || c.state == "ready" || (bounded && c.state == "waiting") {
				expired := t-c.queued >= c.patience
				if bounded {
					expired = t-c.arrival >= 36 || (c.state == "waiting" && t-c.queued >= 10)
				}
				if expired {
					reason := "maker"
					if c.state == "ready" {
						reason = "cashier"
						r.LostCashier++
					} else {
						r.LostMaker++
					}
					c.state = "lost"
					c.at = t
					lost++
					emit(t, "customer_lost", i, "", "", reason)
				}
			}
		}

		occupied := map[int]bool{}
		for _, c := range cs {
			if c.seat >= 0 && ((c.state != "served" && c.state != "lost") || t-c.at < counterSeatRelease(bounded)) {
				occupied[c.seat] = true
			}
		}
		for i := range cs {
			c := &cs[i]
			if c.state != "waiting" {
				continue
			}
			seat := -1
			for n := 0; n < 8; n++ {
				if !occupied[n] {
					seat = n
					break
				}
			}
			if seat >= 0 {
				c.seat = seat
				occupied[seat] = true
				c.state = "maker"
				c.at = t
				c.queued = t
				emit(t, "order_queued", i, "", "maker", "")
			}
		}
		if self >= 0 && ss[self].customer < 0 && task != "" {
			a, b := queues()
			n := a
			if task == "maker" {
				n = b
			}
			if done >= 3 || n == 0 {
				task = ""
				emit(t, "self_idle", -1, "self", "", "")
			}
		}
		if task == "" && queued != "" {
			role := queued
			queued = ""
			startTask(t, role)
		}
		for next < len(commands) && commands[next].T <= t {
			role := commands[next].Role
			if task == "" {
				startTask(t, role)
			} else if queued == "" {
				queued = role
			}
			next++
		}
		a, b := queues()
		r.PeakCashierQueue = max(r.PeakCashierQueue, a)
		r.PeakMakerQueue = max(r.PeakMakerQueue, b)
		if tick < ch.Duration*4 {
			for j := range ss {
				s := &ss[j]
				if s.customer >= 0 {
					continue
				}
				role := s.role
				if j == self {
					role = task
				}
				if role == "support" {
					a, b := queues()
					role = "maker"
					if a > 0 {
						role = "cashier"
					} else if b == 0 {
						role = ""
					}
				}
				chosen := -1
				state := "maker"
				if role == "cashier" {
					state = "ready"
				}
				if role != "maker" && role != "cashier" {
					s.currentRole = ""
					continue
				}
				for i := range cs {
					if cs[i].state == state {
						chosen = i
						break
					}
				}
				if chosen < 0 {
					s.currentRole = ""
					continue
				}
				if role == "maker" {
					cost := 1.0
					if s.w.Skill == "materials_saver" {
						cost = .9
					}
					if stock+1e-8 < cost {
						cs[chosen].state = "lost"
						cs[chosen].at = t
						lost++
						r.LostStock++
						emit(t, "customer_lost", chosen, "", "", "stock")
						continue
					}
					stock = math.Round((stock-cost)*10) / 10
				}
				stat := s.w.Production
				duration := 4.8 - .025*float64(stat)
				if role == "cashier" {
					stat = s.w.Service
					duration = 3.8 - .02*float64(stat)
				}
				if s.w.Skill == "batch_master" && role == "maker" {
					duration *= .9
				}
				if s.w.Skill == "golden_service" && role == "cashier" {
					duration *= .9
				}
				if plan.Strategy == "speed" {
					duration *= .9
				}
				s.customer = chosen
				s.currentRole = role
				s.start = t
				// One-minute services retain the original goals and economy. Upgraded
				// equipment scales throughput; frozen .1/.2 sessions keep old timing.
				minimum := 1.5
				if ch.Flow == "counter.3" {
					duration /= float64(1 + min(3, max(1, ch.ShopLevel)))
					minimum = .5
				}
				s.end = t + math.Ceil(max(minimum, duration)*4)/4
				cs[chosen].state = "making"
				event := "making_started"
				if role == "cashier" {
					cs[chosen].state = "delivering"
					event = "delivery_started"
				}
				cs[chosen].at = t
				cs[chosen].workerID = s.w.ID
				emit(t, event, chosen, s.w.ID, role, "")
			}
		}
		if tick == ch.Duration*4 {
			for i := range cs {
				c := &cs[i]
				if c.state != "served" && c.state != "lost" && c.state != "pending" {
					if c.state == "ready" || c.state == "delivering" {
						r.LostCashier++
					} else {
						r.LostMaker++
					}
					c.state = "lost"
					c.at = t
					lost++
					emit(t, "customer_lost", i, "", "", "closing")
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
	r.Revenue = served * ch.Price
	r.Profit = r.Revenue - r.TotalCost
	r.Passed = served >= ch.Target
	r.ReceptionRate = float64(served) / float64(max(1, ch.Arrivals))
	r.Bottleneck = "配合顺畅"
	r.Suggestion = "下一天可以安排员工接手岗位，自己只在忙时帮一把。"
	if r.LostStock > 0 {
		r.Bottleneck = "原料用完了"
		r.Suggestion = "下一天多备一些原料。"
	} else if r.LostCashier > 0 {
		r.Bottleneck = "饮品做好却没送达"
		r.Suggestion = "取餐台有杯子时优先端送，或给端送岗安排员工。"
	} else if r.LostMaker > 0 {
		r.Bottleneck = "制作排队太久"
		r.Suggestion = "订单出现后开始制作，或给制作岗安排员工。"
	}
	f := TeaLiveFrame{TeaFrame: r.Frames[len(r.Frames)-1], CustomersState: []TeaLiveCustomer{}, WorkersState: []TeaLiveWorker{}, SelfTask: TeaSelfTask{Role: "idle"}}
	for _, c := range cs {
		if c.state != "pending" {
			patience := 1.0
			if c.state == "maker" || c.state == "ready" || c.state == "waiting" || c.state == "making" || c.state == "delivering" {
				patience = max(0, 1-(float64(until)-c.queued)/c.patience)
				if bounded {
					patience = max(0, 1-(float64(until)-c.arrival)/36)
					if c.state == "waiting" {
						patience = min(patience, max(0, 1-(float64(until)-c.queued)/10))
					}
				}
			}
			f.CustomersState = append(f.CustomersState, TeaLiveCustomer{ID: c.id, State: c.state, At: c.at, WorkerID: c.workerID, Patience: patience, Seat: c.seat})
		}
	}
	for j, s := range ss {
		w := TeaLiveWorker{ID: s.w.ID, Role: s.role}
		if s.customer >= 0 {
			w.Role = s.currentRole
			w.CustomerID = cs[s.customer].id
			w.Progress = max(0, min(1, (float64(until)-s.start)/(s.end-s.start)))
		} else if j == self {
			w.Role = "idle"
		}
		f.WorkersState = append(f.WorkersState, w)
	}
	if self >= 0 && task != "" {
		f.SelfTask = TeaSelfTask{Role: task, Done: done, Remaining: max(0, 3-done)}
	}
	if queued != "" {
		q := queued
		f.SelfTask.QueuedRole = &q
	}
	return r, f
}

func counterSeatRelease(bounded bool) float64 {
	if bounded {
		return 1.5
	}
	return 5
}

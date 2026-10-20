package backend

import (
	"crypto/rand"
	"database/sql"
	"encoding/binary"
	"encoding/json"
	"fmt"
	"sort"
)

func sortPlayers(players []Player) {
	sort.SliceStable(players, func(i, j int) bool {
		a, b := players[i], players[j]
		if a.Assets != b.Assets {
			return a.Assets > b.Assets
		}
		if a.Coins != b.Coins {
			return a.Coins > b.Coins
		}
		return a.ID < b.ID
	})
}
func (g *Game) Sign(buyer, id string, expected int) (Trade, error) {
	var ev Trade
	if expected <= 0 || int64(expected) > 9007199254740991 {
		return ev, fail(400, "BAD_PRICE", "请提交当前显示的整数报价")
	}
	now := g.Now()
	err := g.transaction(func(tx *sql.Tx) error {
		c, err := scanCol(tx.QueryRow("SELECT "+colleagueColumns+" FROM colleagues WHERE id=?", id))
		if err != nil {
			return noRow(err, "NO_COLLEAGUE", "该同事不存在")
		}
		var coins int
		var buyerName string
		if err = tx.QueryRow("SELECT coins,name FROM players WHERE id=?", buyer).Scan(&coins, &buyerName); err != nil {
			return noRow(err, "NO_PLAYER", "玩家不存在")
		}
		if same(c.OwnerID, buyer) {
			return fail(409, "ALREADY_OWNED", c.Name+" 已经在你的团队里了")
		}
		if same(c.SelfPlayerID, buyer) {
			return fail(409, "SELF_AVATAR", "不能签约自己的分身")
		}
		price := PriceFor(c.LastPrice)
		if price != expected {
			return fail(409, "PRICE_CHANGED", fmt.Sprintf("手慢了！当前价已变为 %d 金币", price))
		}
		all, err := colleagues(tx)
		if err != nil {
			return err
		}
		team := ownTeam(all, buyer)
		if len(team) >= MaxTeam {
			return fail(409, "TEAM_FULL", "团队已满（最多 3 名生效队员）")
		}
		if coins < price {
			return fail(402, "INSUFFICIENT", fmt.Sprintf("余额不足：需要 %d，当前 %d 金币", price, coins))
		}
		used := map[int]bool{}
		for _, t := range team {
			if t.DeskSlot != nil {
				used[*t.DeskSlot] = true
			}
		}
		slot := 0
		for used[slot] {
			slot++
		}
		owner, self, system := Shares(price, c.OwnerID != nil)
		ref := fmt.Sprintf("trade:%s:%d", id, c.Version+1)
		paid, err := tx.Exec("UPDATE players SET coins=coins-? WHERE id=? AND coins>=?", price, buyer, price)
		if err != nil {
			return err
		}
		n, _ := paid.RowsAffected()
		if n != 1 {
			return fail(402, "INSUFFICIENT", "余额不足")
		}
		reason := "sign"
		if c.OwnerID != nil {
			reason = "poach"
		}
		if err = ledger(tx, "player:"+buyer, -price, reason, ref, now); err != nil {
			return err
		}
		if c.OwnerID != nil {
			if _, err = tx.Exec("UPDATE players SET coins=coins+? WHERE id=?", owner, *c.OwnerID); err != nil {
				return err
			}
			if err = ledger(tx, "player:"+*c.OwnerID, owner, "poached_compensation", ref, now); err != nil {
				return err
			}
		}
		account := "colleague:" + id
		if c.SelfPlayerID != nil {
			account = "player:" + *c.SelfPlayerID
			if _, err = tx.Exec("UPDATE players SET coins=coins+? WHERE id=?", self, *c.SelfPlayerID); err != nil {
				return err
			}
		}
		if err = ledger(tx, account, self, "avatar_dividend", ref, now); err != nil {
			return err
		}
		if err = ledger(tx, "system", system, "system_recycle", ref, now); err != nil {
			return err
		}
		moved, err := tx.Exec("UPDATE colleagues SET owner_id=?,desk_slot=?,last_price=?,trades=trades+1,earnings=earnings+?,version=version+1,acquired_at=? WHERE id=? AND version=?", buyer, slot, price, self, now, id, c.Version)
		if err != nil {
			return err
		}
		n, _ = moved.RowsAffected()
		if n != 1 {
			return fail(409, "CONFLICT", "交易冲突，请重试")
		}
		if _, err = tx.Exec("INSERT INTO trades(colleague_id,buyer_id,seller_id,self_player_id,price,owner_share,self_share,system_share,created_at) VALUES(?,?,?,?,?,?,?,?,?)", id, buyer, c.OwnerID, c.SelfPlayerID, price, owner, self, system, now); err != nil {
			return err
		}
		ev = Trade{"trade", id, c.Name, buyer, c.OwnerID, c.SelfPlayerID, price, owner, self, system, slot, c.DeskSlot, now}
		if c.OwnerID != nil {
			var sellerName string
			if err = tx.QueryRow("SELECT name FROM players WHERE id=?", *c.OwnerID).Scan(&sellerName); err != nil {
				return err
			}
			if err = message(tx, ptr(buyer), "poach", "挖角成功："+c.Name, fmt.Sprintf("支付 %d 金币，从 %s 手中挖来 %s。技能「%s」已生效。", price, sellerName, c.Name, SkillText(c.Skill)), ev, now); err != nil {
				return err
			}
			if err = message(tx, c.OwnerID, "poached", c.Name+" 被挖走了", fmt.Sprintf("%s 以 %d 金币挖走了 %s，你获得 90%% 补偿 %d 金币（向下取整）。", buyerName, price, c.Name, owner), ev, now); err != nil {
				return err
			}
			if err = message(tx, nil, "market", "挖角快讯", fmt.Sprintf("%s 以 %d 金币从 %s 手中挖走 %s！", buyerName, price, sellerName, c.Name), ev, now); err != nil {
				return err
			}
		} else {
			if err = message(tx, ptr(buyer), "sign", "签约成功："+c.Name, fmt.Sprintf("支付初签价 %d 金币，技能「%s」已生效。初签无原持有人：分身本人 5%% = %d，其余 %d 由系统回收。", price, SkillText(c.Skill), self, system), ev, now); err != nil {
				return err
			}
			if err = message(tx, nil, "market", "签约快讯", fmt.Sprintf("%s 以 %d 金币签下 %s", buyerName, price, c.Name), ev, now); err != nil {
				return err
			}
		}
		if c.SelfPlayerID != nil {
			if err = message(tx, c.SelfPlayerID, "dividend", fmt.Sprintf("分身分红 +%d", self), fmt.Sprintf("你的分身「%s」以 %d 金币成交，你获得 5%% 分红 %d 金币。", c.Name, price, self), ev, now); err != nil {
				return err
			}
		}
		return bump(tx)
	})
	return ev, err
}

func (g *Game) StartProject(player string) (Run, error) {
	var run Run
	now := g.Now()
	err := g.transaction(func(tx *sql.Tx) error {
		existing, err := scanRun(tx.QueryRow("SELECT "+runColumns+" FROM project_runs WHERE player_id=? AND status='active' ORDER BY started_at DESC LIMIT 1", player))
		if err != nil && err != sql.ErrNoRows {
			return err
		}
		if err == nil {
			if now <= existing.Deadline+FinishGraceMS {
				if now < existing.Deadline {
					run = existing
					return nil
				}
				return fail(409, "RUN_PENDING", "上一个项目已结束但尚未结算，请先提交结算")
			}
			if _, err = tx.Exec("UPDATE project_runs SET status='expired' WHERE player_id=? AND status='active'", player); err != nil {
				return err
			}
		}
		all, err := colleagues(tx)
		if err != nil {
			return err
		}
		skills := TeamSkills(ownTeam(all, player))
		career, err := readCareer(tx, player)
		if err != nil {
			return err
		}
		skills = careerSkills(skills, career)
		var random [4]byte
		if _, err = rand.Read(random[:]); err != nil {
			return err
		}
		seed := binary.LittleEndian.Uint32(random[:])%2147483646 + 1
		run = Run{randomID(), seed, now, ProjectDuration(skills), 0, skills, "active"}
		run.Deadline = now + run.DurationMS
		b, _ := json.Marshal(skills)
		_, err = tx.Exec("INSERT INTO project_runs(id,player_id,seed,started_at,duration_ms,skills,status) VALUES(?,?,?,?,?,?,?)", run.ID, player, run.Seed, now, run.DurationMS, string(b), run.Status)
		return err
	})
	return run, err
}
func (g *Game) FinishProject(player, id string, actions []Action) (Finish, error) {
	var out Finish
	if len(actions) > MaxActions {
		return out, fail(400, "BAD_ACTIONS", "上报次数异常")
	}
	now := g.Now()
	expired := false
	err := g.transaction(func(tx *sql.Tx) error {
		r, err := scanRun(tx.QueryRow("SELECT "+runColumns+" FROM project_runs WHERE id=? AND player_id=?", id, player))
		if err != nil {
			return noRow(err, "NO_RUN", "项目不存在（或不属于你）")
		}
		if r.Status == "claimed" {
			return fail(409, "ALREADY_CLAIMED", "该项目奖励已领取，不能重复领取")
		}
		if r.Status == "expired" {
			return fail(410, "EXPIRED", "项目已过期，奖励作废")
		}
		if now < r.Deadline-FinishToleranceMS {
			return fail(425, "TOO_EARLY", "项目还没结束，不能提前领取")
		}
		if now > r.Deadline+FinishGraceMS {
			if _, err = tx.Exec("UPDATE project_runs SET status='expired' WHERE id=?", id); err != nil {
				return err
			}
			expired = true
			return bump(tx)
		}
		out.Result = ScoreProject(GenerateTasks(r.Seed, r.DurationMS), actions, r.Skills, r.DurationMS, now-r.StartedAt)
		encoded, _ := json.Marshal(out.Result)
		res, err := tx.Exec("UPDATE project_runs SET status='claimed',reward=?,result=?,finished_at=? WHERE id=? AND status='active'", out.Result.Total, string(encoded), now, id)
		if err != nil {
			return err
		}
		n, _ := res.RowsAffected()
		if n != 1 {
			return fail(409, "ALREADY_CLAIMED", "该项目奖励已领取")
		}
		if _, err = tx.Exec("UPDATE players SET coins=coins+? WHERE id=?", out.Result.Total, player); err != nil {
			return err
		}
		if err = ledger(tx, "player:"+player, out.Result.Total, "project_reward", "run:"+id, now); err != nil {
			return err
		}
		out.PerformanceEarned = out.Result.Hits * 10
		if out.Result.Hits > 0 {
			if _, err = tx.Exec("UPDATE player_careers SET performance=performance+?,completed_projects=completed_projects+1 WHERE player_id=?", out.PerformanceEarned, player); err != nil {
				return err
			}
		}
		out.Career, err = readCareer(tx, player)
		if err != nil {
			return err
		}
		out.YearAward, err = advanceYear(tx, player, r.Skills, out.Result, now)
		if err != nil {
			return err
		}
		if err = message(tx, ptr(player), "project", fmt.Sprintf("紧急项目完成 +%d", out.Result.Total), fmt.Sprintf("完成 %d 项任务，最高连击 %d，护盾抵消 %d 次失误，技能加成 +%d，共获得 %d 金币。", out.Result.Hits, out.Result.MaxCombo, out.Result.ShieldsUsed, out.Result.IncomeBonus, out.Result.Total), out.Result, now); err != nil {
			return err
		}
		if err = tx.QueryRow("SELECT coins FROM players WHERE id=?", player).Scan(&out.Coins); err != nil {
			return err
		}
		return bump(tx)
	})
	if err == nil && expired {
		err = fail(410, "EXPIRED", "超过结算时限，项目已过期，奖励作废")
	}
	return out, err
}
func (g *Game) Audit() (Audit, error) {
	out := Audit{Mismatches: []string{}}
	err := g.transaction(func(tx *sql.Tx) error {
		rows, err := tx.Query("SELECT p.id,p.coins,COALESCE(SUM(l.delta),0) FROM players p LEFT JOIN ledger l ON l.account='player:'||p.id GROUP BY p.id")
		if err != nil {
			return err
		}
		for rows.Next() {
			var id string
			var coins, sum int
			if err = rows.Scan(&id, &coins, &sum); err != nil {
				rows.Close()
				return err
			}
			if coins != sum {
				out.Mismatches = append(out.Mismatches, fmt.Sprintf("%s: coins=%d ledger=%d", id, coins, sum))
			}
		}
		err = rows.Err()
		rows.Close()
		if err != nil {
			return err
		}
		rows, err = tx.Query("SELECT ref,SUM(delta) FROM ledger WHERE ref LIKE 'trade:%' GROUP BY ref HAVING SUM(delta)!=0")
		if err != nil {
			return err
		}
		for rows.Next() {
			var ref string
			var balance int
			if err = rows.Scan(&ref, &balance); err != nil {
				rows.Close()
				return err
			}
			out.Mismatches = append(out.Mismatches, fmt.Sprintf("%s: imbalance=%d", ref, balance))
		}
		err = rows.Err()
		rows.Close()
		if err != nil {
			return err
		}
		rows, err = tx.Query("SELECT c.id,c.earnings,COALESCE(SUM(l.delta),0) FROM colleagues c LEFT JOIN ledger l ON l.account='colleague:'||c.id WHERE c.self_player_id IS NULL GROUP BY c.id")
		if err != nil {
			return err
		}
		for rows.Next() {
			var id string
			var earnings, sum int
			if err = rows.Scan(&id, &earnings, &sum); err != nil {
				rows.Close()
				return err
			}
			if earnings != sum {
				out.Mismatches = append(out.Mismatches, id+": dividend mismatch")
			}
		}
		err = rows.Err()
		rows.Close()
		if err != nil {
			return err
		}
		if err = tx.QueryRow("SELECT COUNT(*) FROM players WHERE coins<0").Scan(&out.Negative); err != nil {
			return err
		}
		if err = tx.QueryRow("SELECT COUNT(*) FROM (SELECT owner_id FROM colleagues WHERE owner_id IS NOT NULL GROUP BY owner_id HAVING COUNT(*)>3)").Scan(&out.Overfull); err != nil {
			return err
		}
		return tx.QueryRow("SELECT COUNT(*) FROM (SELECT owner_id,desk_slot FROM colleagues WHERE owner_id IS NOT NULL GROUP BY owner_id,desk_slot HAVING COUNT(*)>1)").Scan(&out.DoubleOwned)
	})
	return out, err
}

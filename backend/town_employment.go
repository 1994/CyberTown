package backend

import (
	"database/sql"
	"encoding/json"
	"github.com/1994/boss-works-for-me/storage"
	"strings"
)

// Town recruitment is a shared game directory, independent of the legacy tea
// shift opt-in. Identity and mock providers both populate players/colleagues.
func townWorkerCatalog(tx storage.Tx, player string) ([]TeaWorker, error) {
	out := teaFixtures()
	rows, err := tx.Query("SELECT id,name,color FROM players WHERE id<>? ORDER BY name,id", player)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	for rows.Next() {
		var id, name, color string
		if err = rows.Scan(&id, &name, &color); err != nil {
			return nil, err
		}
		w := teaAvatar(id, name, color)
		w.Enabled = true
		w.Remaining = 999
		out = append(out, w)
	}
	return out, rows.Err()
}

type TownEmployment struct {
	SourceID   string    `json:"sourceId"`
	Employer   TownOwner `json:"employer"`
	Value      int       `json:"value"`
	PoachPrice int       `json:"poachPrice"`
	Level      int       `json:"level"`
	XP         int       `json:"xp"`
	Job        string    `json:"job"`
	Busy       bool      `json:"busy"`
}

func poachPrice(value int) int { return min(1000000, max(180, (value*3+1)/2)) }

func townEmployments(tx storage.Tx) (map[string][]TownEmployment, error) {
	out := map[string][]TownEmployment{}
	rows, err := tx.Query(`SELECT c.source_id,p.id,p.name,p.color,c.hired_price,c.xp,
 COALESCE((SELECT j.kind FROM town_jobs j WHERE j.owner_id=c.owner_id AND j.source_id=c.source_id AND j.status='active' LIMIT 1),'rest')
 FROM town_clones c JOIN players p ON p.id=c.owner_id WHERE c.source_id LIKE 'employee:%' ORDER BY c.hired_at,p.id`)
	if err != nil {
		return nil, err
	}
	for rows.Next() {
		var e TownEmployment
		var xp int
		if err = rows.Scan(&e.SourceID, &e.Employer.ID, &e.Employer.Name, &e.Employer.Color, &e.Value, &xp, &e.Job); err != nil {
			rows.Close()
			return nil, err
		}
		e.Level = cloneLevel(xp)
		e.XP = xp
		e.Value = max(120, e.Value)
		e.PoachPrice = poachPrice(e.Value)
		out[e.SourceID] = append(out[e.SourceID], e)
	}
	err = rows.Err()
	rows.Close()
	if err != nil {
		return nil, err
	}
	// Decode each active shop once, rather than one query for every employee.
	rows, err = tx.Query("SELECT player_id,data FROM tea_sessions WHERE status='active'")
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	for rows.Next() {
		var owner, raw string
		if err = rows.Scan(&owner, &raw); err != nil {
			return nil, err
		}
		var s teaLiveRecord
		if err = json.Unmarshal([]byte(raw), &s); err != nil {
			return nil, err
		}
		for _, w := range s.Run.Workers {
			for i, e := range out[w.ID] {
				if e.Employer.ID == owner {
					e.Busy = true
					e.Job = "shop"
					out[w.ID][i] = e
				}
			}
		}
	}
	return out, rows.Err()
}

// The receipt, wallets, recalled job and transferred XP commit together. The
// request key is retained across retries, including after the employee moves on.
func (g *Game) TownPoach(player, source, seller string, expected int, key string) (TownHome, error) {
	if !strings.HasPrefix(source, "employee:") || source == "employee:"+player || seller == player {
		return TownHome{}, fail(400, "TOWN_POACH_SELF", "只能挖其他镇主雇佣的同事分身")
	}
	if strings.TrimSpace(key) == "" || len(key) > 100 {
		return TownHome{}, fail(400, "TOWN_POACH_KEY", "请重新确认挖人")
	}
	request := "poach:" + player + ":" + key
	err := g.transaction(func(tx storage.Tx) error {
		var oldSource, oldSeller string
		var oldPrice int
		e := tx.QueryRow("SELECT source_id,seller_id,price FROM town_employee_market WHERE buyer_id=? AND request_key=?", player, request).Scan(&oldSource, &oldSeller, &oldPrice)
		if e == nil {
			if oldSource != source || oldSeller != seller || oldPrice != expected {
				return fail(409, "TOWN_POACH_KEY", "请求已使用，请重新确认")
			}
			return nil
		}
		if e != sql.ErrNoRows {
			return e
		}
		if e = townEnsure(tx, player, g.Now()); e != nil {
			return e
		}
		var count int
		if e = tx.QueryRow("SELECT COUNT(*) FROM town_clones WHERE owner_id=?", player).Scan(&count); e != nil {
			return e
		}
		if count >= 12 {
			return fail(409, "TOWN_TEAM_FULL", "员工名额已满")
		}
		if e = tx.QueryRow("SELECT COUNT(*) FROM town_clones WHERE owner_id=? AND source_id=?", player, source).Scan(&count); e != nil {
			return e
		}
		if count > 0 {
			return fail(409, "TOWN_CLONE_OWNED", "这位同事已在你的小镇")
		}
		inShop, e := townCloneInShop(tx, seller, source)
		if e != nil {
			return e
		}
		if inShop {
			return fail(409, "TOWN_BUSY", "同事正在营业，本班结束后才能挖人")
		}
		if e = townSettleJobs(tx, seller, g.Now()); e != nil {
			return e
		}
		var xp, value int
		if e = tx.QueryRow("SELECT xp,hired_price FROM town_clones WHERE owner_id=? AND source_id=?", seller, source).Scan(&xp, &value); e != nil {
			return noRow(e, "TOWN_EMPLOYER_CHANGED", "同事已换雇主，请刷新列表")
		}
		price := poachPrice(value)
		if price != expected {
			return fail(409, "TOWN_PRICE_CHANGED", "身价已变化，请重新确认")
		}
		var name, color string
		if e = tx.QueryRow("SELECT name,color FROM players WHERE id=?", strings.TrimPrefix(source, "employee:")).Scan(&name, &color); e != nil {
			return e
		}
		var employer TownOwner
		if e = tx.QueryRow("SELECT id,name,color FROM players WHERE id=?", seller).Scan(&employer.ID, &employer.Name, &employer.Color); e != nil {
			return e
		}
		w := townGrownWorker(teaAvatar(strings.TrimPrefix(source, "employee:"), name, color), xp)
		raw, e := json.Marshal(TownEmployeeListing{TeaWorker: w, Seller: employer})
		if e != nil {
			return e
		}
		res, e := tx.Exec("UPDATE players SET coins=coins-? WHERE id=? AND coins>=?", price, player, price)
		if e != nil {
			return e
		}
		n, e := res.RowsAffected()
		if e != nil {
			return e
		}
		if n != 1 {
			return fail(402, "INSUFFICIENT", "金币不足")
		}
		fee := (price + 19) / 20
		if _, e = tx.Exec("UPDATE players SET coins=coins+? WHERE id=?", price-fee, seller); e != nil {
			return e
		}
		if _, e = tx.Exec("UPDATE town_employee_market SET status='cancelled',closed_at=? WHERE seller_id=? AND source_id=? AND status='active'", g.Now(), seller, source); e != nil {
			return e
		}
		if _, e = tx.Exec("DELETE FROM town_clones WHERE owner_id=? AND source_id=?", seller, source); e != nil {
			return e
		}
		if _, e = tx.Exec("INSERT INTO town_clones(owner_id,source_id,xp,hired_price,hired_at) VALUES(?,?,?,?,?)", player, source, xp, price, g.Now()); e != nil {
			return e
		}
		id := randomID()
		if _, e = tx.Exec("INSERT INTO town_employee_market(id,seller_id,source_id,request_key,data,price,xp,status,buyer_id,listed_at,closed_at) VALUES(?,?,?,?,?,?,?,'sold',?,?,?)", id, seller, source, request, string(raw), price, xp, player, g.Now(), g.Now()); e != nil {
			return e
		}
		for _, l := range []struct {
			account string
			amount  int
			kind    string
		}{{"player:" + player, -price, "town_poach"}, {"player:" + seller, price - fee, "town_poach_compensation"}, {"system", fee, "town_market_fee"}} {
			if e = ledger(tx, l.account, l.amount, l.kind, id, g.Now()); e != nil {
				return e
			}
		}
		return bump(tx)
	})
	if err != nil {
		return TownHome{}, err
	}
	return g.TownHome(player, player)
}

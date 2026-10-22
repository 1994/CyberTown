package backend

import (
	"database/sql"
	"encoding/json"
	"github.com/1994/boss-works-for-me/storage"
	"strings"
)

// The employee is a game contract, not ownership of the real colleague.
// A closed listing is the immutable receipt and retry identity for a transfer.
type TownEmployeeListing struct {
	TeaWorker
	SourceID  string    `json:"sourceId"`
	ListingID string    `json:"listingId"`
	Seller    TownOwner `json:"seller"`
	BuyerID   *string   `json:"buyerId"`
	Price     int       `json:"price"`
	Fee       int       `json:"fee"`
	Proceeds  int       `json:"proceeds"`
	XP        int       `json:"xp"`
	Level     int       `json:"level"`
	ListedAt  int64     `json:"listedAt"`
	ClosedAt  int64     `json:"closedAt"`
	Status    string    `json:"status"`
	AvatarURL string    `json:"avatarUrl,omitempty"`
}

func townIsListed(tx storage.Tx, owner, source string) bool {
	var n int
	return tx.QueryRow("SELECT COUNT(*) FROM town_employee_market WHERE seller_id=? AND source_id=? AND status='active'", owner, source).Scan(&n) == nil && n > 0
}

func townMarketRead(tx storage.Tx, viewer string) ([]TownEmployeeListing, []TownEmployeeListing, error) {
	market, history := []TownEmployeeListing{}, []TownEmployeeListing{}
	for _, part := range []struct {
		where string
		args  []any
		out   *[]TownEmployeeListing
	}{
		{"status='active' ORDER BY listed_at DESC,rowid DESC LIMIT 100", nil, &market},
		{"(seller_id=? OR buyer_id=?) ORDER BY (status='active') DESC,closed_at DESC,rowid DESC LIMIT 42", []any{viewer, viewer}, &history},
	} {
		rows, err := tx.Query("SELECT id,seller_id,source_id,data,price,xp,status,buyer_id,listed_at,closed_at FROM town_employee_market WHERE "+part.where, part.args...)
		if err != nil {
			return nil, nil, err
		}
		for rows.Next() {
			var l TownEmployeeListing
			var raw, seller string
			var buyer sql.NullString
			if err = rows.Scan(&l.ListingID, &seller, &l.SourceID, &raw, &l.Price, &l.XP, &l.Status, &buyer, &l.ListedAt, &l.ClosedAt); err != nil {
				rows.Close()
				return nil, nil, err
			}
			// Snapshot includes the worker's grown attributes, avatar and seller identity.
			var snapshot TownEmployeeListing
			if err = json.Unmarshal([]byte(raw), &snapshot); err != nil {
				rows.Close()
				return nil, nil, err
			}
			l.TeaWorker, l.AvatarURL, l.Seller = snapshot.TeaWorker, snapshot.AvatarURL, snapshot.Seller
			if buyer.Valid {
				id := buyer.String
				l.BuyerID = &id
			}
			l.Fee = (l.Price + 19) / 20
			l.Proceeds = l.Price - l.Fee
			l.Level = cloneLevel(l.XP)
			*part.out = append(*part.out, l)
		}
		err = rows.Err()
		rows.Close()
		if err != nil {
			return nil, nil, err
		}
	}
	return market, history, nil
}

func (g *Game) TownList(player, source string, price int, key string) (TownHome, error) {
	if price < 10 || price > 100000 {
		return TownHome{}, fail(400, "TOWN_MARKET_PRICE", "挂牌价应为10到100000之间的整数")
	}
	if len(strings.TrimSpace(key)) == 0 || len(key) > 100 {
		return TownHome{}, fail(400, "TOWN_MARKET_KEY", "请重新确认挂牌")
	}
	err := g.transaction(func(tx storage.Tx) error {
		var previousSource string
		var previousPrice int
		e := tx.QueryRow("SELECT source_id,price FROM town_employee_market WHERE seller_id=? AND request_key=?", player, key).Scan(&previousSource, &previousPrice)
		if e == nil {
			if source != previousSource || price != previousPrice {
				return fail(409, "TOWN_MARKET_KEY", "这次挂牌请求已使用")
			}
			return nil
		}
		if e != sql.ErrNoRows {
			return e
		}
		h, e := townRead(tx, player, player, g.Now())
		if e != nil {
			return e
		}
		var clone *TownClone
		for i := range h.Clones {
			if h.Clones[i].ID == source {
				clone = &h.Clones[i]
				break
			}
		}
		if clone == nil {
			return fail(404, "TOWN_CLONE", "只能挂牌自己的员工合同")
		}
		if clone.ListingID != nil {
			return fail(409, "TOWN_LISTED", "员工已在挂牌中")
		}
		if clone.Job != nil {
			return fail(409, "TOWN_BUSY", "请先召回正在派工的员工")
		}
		inShop, e := townCloneInShop(tx, player, source)
		if e != nil {
			return e
		}
		if inShop {
			return fail(409, "TOWN_BUSY", "员工正在店里营业，结束后才能挂牌")
		}
		snapshot, e := json.Marshal(TownEmployeeListing{TeaWorker: clone.TeaWorker, Seller: h.Owner, AvatarURL: clone.AvatarURL})
		if e != nil {
			return e
		}
		_, e = tx.Exec("INSERT INTO town_employee_market(id,seller_id,source_id,request_key,data,price,xp,listed_at) VALUES(?,?,?,?,?,?,?,?)", randomID(), player, source, key, string(snapshot), price, clone.XP, g.Now())
		if e != nil {
			return e
		}
		return bump(tx)
	})
	if err != nil {
		return TownHome{}, err
	}
	return g.TownHome(player, player)
}

func (g *Game) TownWithdraw(player, id string) (TownHome, error) {
	err := g.transaction(func(tx storage.Tx) error {
		var seller, status string
		if err := tx.QueryRow("SELECT seller_id,status FROM town_employee_market WHERE id=?", id).Scan(&seller, &status); err != nil {
			return noRow(err, "TOWN_LISTING", "挂牌不存在")
		}
		if seller != player {
			return fail(403, "TOWN_LISTING_OWNER", "只能撤回自己的挂牌")
		}
		if status == "cancelled" {
			return nil
		}
		if status != "active" {
			return fail(409, "TOWN_LISTING_CLOSED", "员工已成交，不能撤单")
		}
		if _, err := tx.Exec("UPDATE town_employee_market SET status='cancelled',closed_at=? WHERE id=?", g.Now(), id); err != nil {
			return err
		}
		return bump(tx)
	})
	if err != nil {
		return TownHome{}, err
	}
	return g.TownHome(player, player)
}

func (g *Game) TownBuy(player, id string, expected int) (TownHome, error) {
	err := g.transaction(func(tx storage.Tx) error {
		if err := townEnsure(tx, player, g.Now()); err != nil {
			return err
		}
		var seller, source, status string
		var buyer sql.NullString
		var price, xp int
		if err := tx.QueryRow("SELECT seller_id,source_id,status,buyer_id,price,xp FROM town_employee_market WHERE id=?", id).Scan(&seller, &source, &status, &buyer, &price, &xp); err != nil {
			return noRow(err, "TOWN_LISTING", "挂牌不存在")
		}
		if status == "sold" && buyer.Valid && buyer.String == player {
			return nil
		}
		if status != "active" {
			return fail(409, "TOWN_LISTING_CLOSED", "这份合同已成交或撤单，请刷新市场")
		}
		if seller == player {
			return fail(409, "TOWN_MARKET_SELF", "不能购买自己的挂牌")
		}
		if source == "employee:"+player {
			return fail(409, "TOWN_MARKET_SELF", "不能雇佣自己的分身")
		}
		if price != expected {
			return fail(409, "TOWN_PRICE_CHANGED", "挂牌报价已更新，请重新确认")
		}
		var n int
		if err := tx.QueryRow("SELECT COUNT(*) FROM town_clones WHERE owner_id=? AND source_id=?", player, source).Scan(&n); err != nil {
			return err
		}
		if n > 0 {
			return fail(409, "TOWN_CLONE_OWNED", "本镇已有这位同事的分身")
		}
		if err := tx.QueryRow("SELECT COUNT(*) FROM town_clones WHERE owner_id=?", player).Scan(&n); err != nil {
			return err
		}
		if n >= 12 {
			return fail(409, "TOWN_TEAM_FULL", "员工名额已满，请先流转部分合同")
		}
		var sellerXP int
		if err := tx.QueryRow("SELECT xp FROM town_clones WHERE owner_id=? AND source_id=?", seller, source).Scan(&sellerXP); err != nil {
			return noRow(err, "TOWN_CLONE", "卖家的员工已离开")
		}
		if sellerXP != xp {
			return fail(409, "TOWN_LISTING_CHANGED", "员工状态已更新，请重新挂牌")
		}
		var active int
		if err := tx.QueryRow("SELECT COUNT(*) FROM town_jobs WHERE owner_id=? AND source_id=? AND status='active'", seller, source).Scan(&active); err != nil {
			return err
		}
		inShop, err := townCloneInShop(tx, seller, source)
		if err != nil {
			return err
		}
		if active > 0 || inShop {
			return fail(409, "TOWN_BUSY", "员工工作状态已变化，暂不能成交")
		}
		result, err := tx.Exec("UPDATE players SET coins=coins-? WHERE id=? AND coins>=?", price, player, price)
		if err != nil {
			return err
		}
		n64, err := result.RowsAffected()
		if err != nil {
			return err
		}
		if n64 != 1 {
			return fail(402, "INSUFFICIENT", "金币不足")
		}
		fee := (price + 19) / 20
		if _, err = tx.Exec("UPDATE players SET coins=coins+? WHERE id=?", price-fee, seller); err != nil {
			return err
		}
		if _, err = tx.Exec("INSERT INTO town_clones(owner_id,source_id,xp,hired_price,hired_at) VALUES(?,?,?,?,?)", player, source, xp, price, g.Now()); err != nil {
			return err
		}
		// Completed job rows can be pruned with the seller's copy; the immutable
		// wallet ledger retains their historical operating income and audit trail.
		if _, err = tx.Exec("DELETE FROM town_clones WHERE owner_id=? AND source_id=?", seller, source); err != nil {
			return err
		}
		if _, err = tx.Exec("UPDATE town_employee_market SET status='sold',buyer_id=?,closed_at=? WHERE id=? AND status='active'", player, g.Now(), id); err != nil {
			return err
		}
		if err = ledger(tx, "player:"+player, -price, "town_market_buy", id, g.Now()); err != nil {
			return err
		}
		if err = ledger(tx, "player:"+seller, price-fee, "town_market_sell", id, g.Now()); err != nil {
			return err
		}
		if err = ledger(tx, "system", fee, "town_market_fee", id, g.Now()); err != nil {
			return err
		}
		return bump(tx)
	})
	if err != nil {
		return TownHome{}, err
	}
	return g.TownHome(player, player)
}

package backend

import (
	"github.com/1994/boss-works-for-me/gameplay"
	"github.com/1994/boss-works-for-me/storage"
)

func (g *Game) TownBuyProperty(player, id string, expected int) (TownHome, error) {
	price := 0
	for _, p := range gameplay.TownProperties() {
		if p.ID == id {
			price = p.Price
		}
	}
	if price == 0 || price != expected {
		return TownHome{}, fail(400, "PROPERTY_PRICE", "铺面或价格已变更，请刷新")
	}
	err := g.transaction(func(tx storage.Tx) error {
		if err := townEnsure(tx, player, g.Now()); err != nil {
			return err
		}
		var owned int
		if err := tx.QueryRow("SELECT COUNT(*) FROM town_properties WHERE player_id=? AND property_id=?", player, id).Scan(&owned); err != nil {
			return err
		}
		if owned > 0 {
			return nil
		}
		result, err := tx.Exec("UPDATE players SET coins=coins-? WHERE id=? AND coins>=?", price, player, price)
		if err != nil {
			return err
		}
		n, err := result.RowsAffected()
		if err != nil {
			return err
		}
		if n != 1 {
			return fail(409, "PROPERTY_COINS", "金币不足，先经营奶茶店积累资金")
		}
		if _, err = tx.Exec("INSERT INTO town_properties(player_id,property_id,price,purchased_at) VALUES(?,?,?,?)", player, id, price, g.Now()); err != nil {
			return err
		}
		if err = ledger(tx, "player:"+player, -price, "town_property", id, g.Now()); err != nil {
			return err
		}
		return bump(tx)
	})
	if err != nil {
		return TownHome{}, err
	}
	return g.TownHome(player, player)
}

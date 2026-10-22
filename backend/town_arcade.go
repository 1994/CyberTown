package backend

import (
	"github.com/1994/boss-works-for-me/gameplay"
	"github.com/1994/boss-works-for-me/storage"
	"math"
)

type ArcadeTicket struct {
	ID     string `json:"id"`
	GameID string `json:"gameId"`
	Fee    int    `json:"fee"`
}

func (g *Game) ArcadeRegister(player, id, key string, x, z float64) (ArcadeTicket, error) {
	c := gameplay.Arcade()
	for _, item := range c.Games {
		if item.ID == id {
			return g.arcadeRegister(player, item, key, x, z)
		}
	}
	return ArcadeTicket{}, fail(404, "ARCADE_GAME", "找不到这个小游戏")
}

// A paid registration is a durable receipt in the storage SPI ledger. Reusing
// the same player/game/key is safe after a timeout; clients cannot choose a fee.
func (g *Game) arcadeRegister(player string, item gameplay.ArcadeGame, key string, x, z float64) (ArcadeTicket, error) {
	out := ArcadeTicket{}
	if !item.Ready {
		return out, fail(409, "ARCADE_CLOSED", "小游戏尚未开放，不收报名费")
	}
	if len(key) < 8 || len(key) > 80 {
		return out, fail(400, "ARCADE_KEY", "报名编号无效")
	}
	if item.Fee < 0 {
		return out, fail(500, "ARCADE_CONFIG", "报名价格配置无效")
	}
	ref := "arcade:" + item.ID + ":" + key
	out = ArcadeTicket{ID: ref, GameID: item.ID, Fee: item.Fee}
	err := g.transaction(func(tx storage.Tx) error {
		var count, paid int
		if err := tx.QueryRow("SELECT COUNT(*),COALESCE(SUM(delta),0) FROM ledger WHERE account=? AND reason='arcade_entry' AND ref=?", "player:"+player, ref).Scan(&count, &paid); err != nil {
			return err
		}
		if count > 0 {
			out.Fee = -paid
			return nil
		}
		c := gameplay.Arcade()
		if !finite(x) || !finite(z) || math.Hypot(x-c.X, z-c.Z) > c.Range+.5 {
			return fail(409, "ARCADE_TOO_FAR", "先走到小游戏大厅")
		}
		if err := teaEnsure(tx, player, g.Now()); err != nil {
			return err
		}
		var coins int
		if err := tx.QueryRow("SELECT coins FROM players WHERE id=?", player).Scan(&coins); err != nil {
			return err
		}
		if coins < item.Fee {
			return fail(409, "ARCADE_COINS", "金币不足，先去赚点金币吧")
		}
		if _, err := tx.Exec("UPDATE players SET coins=coins-? WHERE id=?", item.Fee, player); err != nil {
			return err
		}
		if err := ledger(tx, "player:"+player, -item.Fee, "arcade_entry", ref, g.Now()); err != nil {
			return err
		}
		return ledger(tx, "system", item.Fee, "arcade_entry", ref, g.Now())
	})
	return out, err
}

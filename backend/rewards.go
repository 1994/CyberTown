package backend

import (
	"database/sql"
	"encoding/json"
	"fmt"
	"github.com/1994/boss-works-for-me/storage"
)

var yearBases = [...]int{300, 450, 650, 900, 1200}

type YearAward struct {
	Year      int `json:"year"`
	Base      int `json:"base"`
	TeamPct   int `json:"teamPct"`
	PlayPct   int `json:"playPct"`
	FriendPct int `json:"friendPct"`
	Total     int `json:"total"`
}
type Year struct {
	Number    int        `json:"number"`
	Completed int        `json:"completed"`
	Required  int        `json:"required"`
	Base      int        `json:"base"`
	Estimate  int        `json:"estimate"`
	TeamPct   int        `json:"teamPct"`
	PlayPct   int        `json:"playPct"`
	FriendPct int        `json:"friendPct"`
	LastAward *YearAward `json:"lastAward"`
}
type Style struct {
	Shirt         string `json:"shirt"`
	Accessory     string `json:"accessory"`
	Aura          string `json:"aura"`
	BossShirt     string `json:"bossShirt"`
	BossAccessory string `json:"bossAccessory"`
	BossAura      string `json:"bossAura"`
}
type ShopItem struct {
	ID          string `json:"id"`
	Name        string `json:"name"`
	Kind        string `json:"kind"`
	Price       int    `json:"price"`
	Value       string `json:"value"`
	Description string `json:"description"`
	Owned       bool   `json:"owned"`
}

var shopItems = []ShopItem{
	{ID: "neon-mask", Name: "霓虹面罩", Kind: "accessory", Price: 90, Value: "neon-mask", Description: "冷光眼线 · 夜行者"},
	{ID: "fox-mask", Name: "白狐面具", Kind: "accessory", Price: 140, Value: "fox-mask", Description: "瓷白与玫红 · 小镇限定"},
	{ID: "city-bike", Name: "薄荷巡游", Kind: "vehicle", Price: 220, Value: "#50dfd3", Description: "随时骑行 · 比步行快约 50%"},
	{ID: "sunset-bike", Name: "落日疾风", Kind: "vehicle", Price: 320, Value: "#f2b94e", Description: "金色车架 · 与薄荷巡游同速"},
	{ID: "sunset-shirt", Name: "落日橘衬衫", Kind: "shirt", Price: 160, Value: "#ec976a", Description: "今天，把快乐穿在身上"},
	{ID: "mint-shirt", Name: "薄荷假日", Kind: "shirt", Price: 160, Value: "#7bbcac", Description: "自带周五的轻松气息"},
	{ID: "sunglasses", Name: "准点下班墨镜", Kind: "accessory", Price: 120, Value: "sunglasses", Description: "街头经典 · 深色镜片"},
	{ID: "glasses", Name: "灵感圆框眼镜", Kind: "accessory", Price: 80, Value: "glasses", Description: "认真摸鱼，也要有型"},
	{ID: "gold-aura", Name: "年终锦鲤", Kind: "aura", Price: 360, Value: "#e7b94f", Description: "走到哪里，幸运跟到哪里"},
	{ID: "mint-aura", Name: "薄荷星光", Kind: "aura", Price: 260, Value: "#70c8b2", Description: "一圈属于你的柔和星光"},
}

func ensureRewards(q queryer) error {
	if _, err := q.Exec("INSERT INTO player_years(player_id) SELECT id FROM players WHERE id NOT IN (SELECT player_id FROM player_years)"); err != nil {
		return err
	}
	_, err := q.Exec("INSERT INTO player_styles(player_id) SELECT id FROM players WHERE id NOT IN (SELECT player_id FROM player_styles)")
	return err
}
func ensureProgress(q queryer) error {
	if err := ensureCareers(q); err != nil {
		return err
	}
	return ensureRewards(q)
}
func readYear(q queryer, player string) (Year, error) {
	var y Year
	var rank, team, play int
	err := q.QueryRow("SELECT year,rounds,rank,team_points,play_points,friend_pct FROM player_years WHERE player_id=?", player).Scan(&y.Number, &y.Completed, &rank, &team, &play, &y.FriendPct)
	if err != nil {
		return y, err
	}
	y.Required = 3
	if y.Completed == 0 {
		if err = q.QueryRow("SELECT rank FROM player_careers WHERE player_id=?", player).Scan(&rank); err != nil {
			return y, err
		}
		team, e := ownedColleagues(q, player)
		if e != nil {
			return y, e
		}
		y.TeamPct = min(30, TeamSkills(team).IncomePct+careerLevels[rank].IncomePct)
	} else {
		y.TeamPct = team / y.Completed
		y.PlayPct = play / y.Completed
	}
	y.Base = yearBases[rank]
	y.Estimate = y.Base * (100 + y.TeamPct + y.PlayPct + y.FriendPct) / 100
	var encoded string
	err = q.QueryRow("SELECT award FROM year_awards WHERE player_id=? ORDER BY year DESC LIMIT 1", player).Scan(&encoded)
	if err == nil {
		var a YearAward
		if err = json.Unmarshal([]byte(encoded), &a); err != nil {
			return y, err
		}
		y.LastAward = &a
	} else if err != sql.ErrNoRows {
		return y, err
	}
	return y, nil
}
func advanceYear(q queryer, player string, skills Skills, result ProjectResult, now int64) (*YearAward, error) {
	if result.Hits == 0 {
		return nil, nil
	}
	// Three validated rounds make a demo year. Rank locks on the first completion.
	_, err := q.Exec(`UPDATE player_years SET rank=CASE WHEN rounds=0 THEN (SELECT rank FROM player_careers WHERE player_id=?) ELSE rank END,
	 rounds=rounds+1,team_points=team_points+?,play_points=play_points+? WHERE player_id=?`, player, min(30, skills.IncomePct), min(20, result.Hits), player)
	if err != nil {
		return nil, err
	}
	y, err := readYear(q, player)
	if err != nil || y.Completed < 3 {
		return nil, err
	}
	a := &YearAward{y.Number, y.Base, y.TeamPct, y.PlayPct, y.FriendPct, y.Estimate}
	encoded, _ := json.Marshal(a)
	if _, err = q.Exec("INSERT INTO year_awards(player_id,year,award) VALUES(?,?,?)", player, y.Number, string(encoded)); err != nil {
		return nil, err
	}
	if _, err = q.Exec("UPDATE players SET coins=coins+? WHERE id=?", a.Total, player); err != nil {
		return nil, err
	}
	if err = ledger(q, "player:"+player, a.Total, "year_end_bonus", fmt.Sprintf("year:%s:%d", player, y.Number), now); err != nil {
		return nil, err
	}
	if err = message(q, ptr(player), "year_end", "年终奖到账", fmt.Sprintf("第%d年，老板替你挣到%d金币", y.Number, a.Total), a, now); err != nil {
		return nil, err
	}
	_, err = q.Exec("UPDATE player_years SET year=year+1,rounds=0,team_points=0,play_points=0,friend_pct=0 WHERE player_id=?", player)
	return a, err
}
func readStyle(q queryer, player string) (Style, error) {
	var s Style
	err := q.QueryRow("SELECT shirt,accessory,aura,boss_shirt,boss_accessory,boss_aura FROM player_styles WHERE player_id=?", player).Scan(&s.Shirt, &s.Accessory, &s.Aura, &s.BossShirt, &s.BossAccessory, &s.BossAura)
	return s, err
}
func readShop(q queryer, player string) ([]ShopItem, error) {
	rows, err := q.Query("SELECT item_id FROM player_items WHERE player_id=?", player)
	if err != nil {
		return nil, err
	}
	owned := map[string]bool{}
	for rows.Next() {
		var id string
		if err = rows.Scan(&id); err != nil {
			rows.Close()
			return nil, err
		}
		owned[id] = true
	}
	err = rows.Err()
	rows.Close()
	if err != nil {
		return nil, err
	}
	items := append([]ShopItem{}, shopItems...)
	for i := range items {
		items[i].Owned = owned[items[i].ID]
	}
	return items, nil
}
func (g *Game) BuyItem(player, id string, price int) error {
	var item *ShopItem
	for i := range shopItems {
		if shopItems[i].ID == id {
			item = &shopItems[i]
		}
	}
	if item == nil {
		return fail(404, "NO_ITEM", "道具不存在")
	}
	if price != item.Price {
		return fail(409, "PRICE_CHANGED", "价格已更新，请刷新")
	}
	return g.transaction(func(tx storage.Tx) error {
		var count int
		if err := tx.QueryRow("SELECT COUNT(*) FROM player_items WHERE player_id=? AND item_id=?", player, id).Scan(&count); err != nil {
			return err
		}
		if count > 0 {
			return fail(409, "ALREADY_OWNED_ITEM", "已经拥有这件道具")
		}
		r, err := tx.Exec("UPDATE players SET coins=coins-? WHERE id=? AND coins>=?", price, player, price)
		if err != nil {
			return err
		}
		n, _ := r.RowsAffected()
		if n != 1 {
			return fail(402, "INSUFFICIENT", "金币不足，先去经营赚一些吧")
		}
		if _, err = tx.Exec("INSERT INTO player_items(player_id,item_id) VALUES(?,?)", player, id); err != nil {
			return err
		}
		now := g.Now()
		ref := "item:" + player + ":" + id
		if err = ledger(tx, "player:"+player, -price, "shop_purchase", ref, now); err != nil {
			return err
		}
		if err = ledger(tx, "system", price, "shop_purchase", ref, now); err != nil {
			return err
		}
		if err = message(tx, ptr(player), "shop", "入手："+item.Name, "去购物街查看或使用", nil, now); err != nil {
			return err
		}
		return bump(tx)
	})
}
func (g *Game) EquipItem(player, id, kind, target string) error {
	columns := map[string]string{"shirt": "shirt", "accessory": "accessory", "aura": "aura"}
	column, ok := columns[kind]
	if !ok {
		return fail(400, "BAD_SLOT", "穿戴位置不正确")
	}
	if target != "player" && target != "boss" {
		return fail(400, "BAD_TARGET", "请选择自己或老板")
	}
	if target == "boss" {
		column = "boss_" + column
	}
	return g.transaction(func(tx storage.Tx) error {
		value := ""
		if id != "" {
			found := false
			for _, item := range shopItems {
				if item.ID == id && item.Kind == kind {
					found = true
					value = item.Value
					break
				}
			}
			if !found {
				return fail(400, "BAD_ITEM", "这件道具不能穿在这里")
			}
			var count int
			if err := tx.QueryRow("SELECT COUNT(*) FROM player_items WHERE player_id=? AND item_id=?", player, id).Scan(&count); err != nil {
				return err
			}
			if count != 1 {
				return fail(403, "ITEM_NOT_OWNED", "先在商店兑换这件道具")
			}
		}
		if _, err := tx.Exec("UPDATE player_styles SET "+column+"=? WHERE player_id=?", value, player); err != nil {
			return err
		}
		return bump(tx)
	})
}

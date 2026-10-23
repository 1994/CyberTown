package backend

import (
	"fmt"
	"github.com/1994/boss-works-for-me/storage"
)

type TeaBusiness struct {
	Stage            string       `json:"stage"`
	Title            string       `json:"title"`
	Goal             string       `json:"goal"`
	Reward           string       `json:"reward"`
	Progress         int          `json:"progress"`
	Target           int          `json:"target"`
	Unit             string       `json:"unit"`
	Challenge        TeaChallenge `json:"challenge"`
	StockOptions     []int        `json:"stockOptions"`
	RecommendedStock int          `json:"recommendedStock"`
	UpgradeReady     bool         `json:"upgradeReady"`
	UpgradeReason    string       `json:"upgradeReason"`
}

// Each service freezes this profile; upgrading never changes an existing run.
func teaBusinessChallenge(day string, level int) TeaChallenge {
	level = min(3, max(1, level))
	c := teaChallenge(day)
	c.ID = fmt.Sprintf("business-%s-lv%d", day, level)
	c.RuleVersion, c.ShopLevel = "tea.4", level
	c.Name = []string{"救救街角奶茶", "霓虹奶茶·站稳脚跟", "夜城旗舰·招牌热场"}[level-1]
	c.Arrivals = []int{20, 32, 48}[level-1]
	c.Target = []int{12, 24, 36}[level-1]
	c.Price = []int{20, 22, 24}[level-1]
	return c
}

func teaBusinessStocks(level int) []int {
	switch level {
	case 2:
		return []int{40, 60, 80}
	case 3:
		return []int{60, 80, 100}
	default:
		return []int{20, 40, 60}
	}
}

func teaBusiness(tx storage.Tx, player, day string, shop TeaShop, mission TeaMission, coins int) (TeaBusiness, error) {
	var regular, flagship int
	if err := tx.QueryRow("SELECT regular_best,flagship_best FROM tea_business_progress WHERE player_id=?", player).Scan(&regular, &flagship); err != nil {
		return TeaBusiness{}, err
	}
	b := TeaBusiness{Challenge: teaBusinessChallenge(day, shop.Level), StockOptions: teaBusinessStocks(shop.Level), Unit: "杯"}
	b.RecommendedStock = b.StockOptions[0]
	legacyPassed := shop.Best >= teaChallenge(day).Target
	switch shop.Level {
	case 1:
		b.Stage, b.Title, b.Goal, b.Reward = "rescue", "救回街角店", "正式营业赚到第一笔净收益", "救店奖励 · 继续经营"
		b.Progress, b.Target = shop.Best, 12
		b.UpgradeReady = true
		b.UpgradeReason = "停业时可随时升级"
		if mission.Status == "completed" || legacyPassed {
			b.Stage, b.Title, b.Goal, b.Reward = "renovate", "焕新小店", "投入600金币，升级霓虹奶茶", "32位顾客 · 每杯22金币"
			b.Progress, b.Target, b.Unit = min(coins, 600), 600, "金币"
			b.UpgradeReason = "已解锁门店焕新"
		}
	case 2:
		b.Stage, b.Title, b.Goal, b.Reward = "regulars", "站稳脚跟", "正式营业盈利并完成24杯", "积累收益 · 扩建旗舰"
		b.Progress, b.Target = regular, 24
		b.UpgradeReady = true
		b.UpgradeReason = "停业时可随时升级"
		if regular >= 24 || legacyPassed {
			b.Stage, b.Title, b.Goal, b.Reward = "expand", "扩建旗舰", "投入1200金币，升级夜城旗舰", "48位顾客 · 每杯24金币"
			b.Progress, b.Target, b.Unit = min(coins, 1200), 1200, "金币"
			b.UpgradeReason = "已解锁旗舰扩建"
		}
	default:
		b.Stage, b.Title, b.Goal, b.Reward = "flagship", "招牌热场", "正式营业盈利并完成36杯", "完成首店篇 · 准备连锁布局"
		b.Progress, b.Target = flagship, 36
		b.UpgradeReason = "门店已达最高等级"
		if flagship >= 36 || legacyPassed {
			b.Stage, b.Title, b.Goal, b.Reward = "complete", "小镇招牌店", "首店篇完成，探索新商圈，准备连锁布局", "首店旗舰已开张"
		}
	}
	return b, nil
}

func teaBusinessRecord(tx storage.Tx, player string, r TeaRun) error {
	if err := townRecordService(tx, player, r); err != nil {
		return err
	}
	if r.Mode != "official" || r.Challenge.RuleVersion != "tea.4" || r.Result.Revenue <= 0 || r.Result.Profit+r.Result.Bonus <= 0 {
		return nil
	}
	var column string
	switch r.Challenge.ShopLevel {
	case 2:
		column = "regular_best"
	case 3:
		column = "flagship_best"
	default:
		return nil
	}
	_, err := tx.Exec("UPDATE tea_business_progress SET "+column+"=MAX("+column+",?) WHERE player_id=?", r.Result.Completed, player)
	return err
}

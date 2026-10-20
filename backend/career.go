package backend

import (
	"database/sql"
	"fmt"
)

// Career progress is earned from verified project actions, never from wallet income.
// Thresholds are cumulative; promotion consumes neither performance nor coins.
type CareerLevel struct {
	Rank                int    `json:"rank"`
	Name                string `json:"name"`
	RequiredPerformance int    `json:"requiredPerformance"`
	RequiredProjects    int    `json:"requiredProjects"`
	IncomePct           int    `json:"incomePct"`
}

var careerLevels = [...]CareerLevel{
	{0, "职场新人", 0, 0, 0},
	{1, "项目专员", 60, 1, 5},
	{2, "团队主管", 250, 3, 10},
	{3, "部门经理", 600, 6, 15},
	{4, "合伙人", 1200, 12, 20},
}

type Career struct {
	Rank              int          `json:"rank"`
	Name              string       `json:"name"`
	Performance       int          `json:"performance"`
	CompletedProjects int          `json:"completedProjects"`
	IncomePct         int          `json:"incomePct"`
	Next              *CareerLevel `json:"next"`
	CanPromote        bool         `json:"canPromote"`
}

type Promotion struct {
	Kind      string `json:"kind"`
	PlayerID  string `json:"playerId"`
	FromRank  int    `json:"fromRank"`
	ToRank    int    `json:"toRank"`
	RankName  string `json:"rankName"`
	IncomePct int    `json:"incomePct"`
	At        int64  `json:"at"`
}

// Additive migration: preserve balances and recover progress from old settled runs.
// Existing career rows are not changed on restart; reset runs inside the seed tx.
func ensureCareers(q queryer) error {
	_, err := q.Exec(`INSERT INTO player_careers(player_id,rank,performance,completed_projects)
		SELECT p.id,0,
		COALESCE(SUM(CASE WHEN json_valid(r.result) THEN COALESCE(json_extract(r.result,'$.hits'),0)*10 ELSE 0 END),0),
		COALESCE(SUM(CASE WHEN json_valid(r.result) THEN CASE WHEN json_extract(r.result,'$.hits')>0 THEN 1 ELSE 0 END ELSE 0 END),0)
		FROM players p LEFT JOIN project_runs r ON r.player_id=p.id AND r.status='claimed'
		WHERE NOT EXISTS (SELECT 1 FROM player_careers c WHERE c.player_id=p.id)
		GROUP BY p.id`)
	return err
}

func readCareer(q queryer, player string) (Career, error) {
	var c Career
	err := q.QueryRow("SELECT rank,performance,completed_projects FROM player_careers WHERE player_id=?", player).Scan(&c.Rank, &c.Performance, &c.CompletedProjects)
	if err != nil {
		return c, noRow(err, "NO_PLAYER", "玩家不存在")
	}
	c.Name = careerLevels[c.Rank].Name
	c.IncomePct = careerLevels[c.Rank].IncomePct
	if c.Rank+1 < len(careerLevels) {
		next := careerLevels[c.Rank+1]
		c.Next = &next
		c.CanPromote = c.Performance >= next.RequiredPerformance && c.CompletedProjects >= next.RequiredProjects
	}
	return c, nil
}

func (g *Game) Career(player string) (Career, error) { return readCareer(g.DB, player) }

func careerSkills(team Skills, c Career) Skills {
	// Team income remains capped at 75%; career adds at most 20 percentage points.
	team.IncomePct += c.IncomePct
	return team
}

func (g *Game) Promote(player string, expectedRank int) (Promotion, Career, error) {
	var ev Promotion
	var out Career
	if expectedRank < 0 || expectedRank >= len(careerLevels) {
		return ev, out, fail(400, "BAD_RANK", "请提交当前职级")
	}
	now := g.Now()
	err := g.transaction(func(tx *sql.Tx) error {
		c, err := readCareer(tx, player)
		if err != nil {
			return err
		}
		if c.Rank != expectedRank {
			return fail(409, "RANK_CHANGED", "职级已更新，请刷新")
		}
		if c.Next == nil {
			return fail(409, "MAX_RANK", "已达到本次演示的最高职级")
		}
		if !c.CanPromote {
			return fail(409, "NOT_ELIGIBLE", fmt.Sprintf("晋升需要累计 %d 业绩、%d 个有效项目", c.Next.RequiredPerformance, c.Next.RequiredProjects))
		}
		if _, err = tx.Exec("UPDATE player_careers SET rank=rank+1 WHERE player_id=? AND rank=?", player, expectedRank); err != nil {
			return err
		}
		out, err = readCareer(tx, player)
		if err != nil {
			return err
		}
		ev = Promotion{"promotion", player, c.Rank, out.Rank, out.Name, out.IncomePct, now}
		if err = message(tx, ptr(player), "promotion", "晋升："+out.Name, fmt.Sprintf("后续项目收益加成 +%d%%", out.IncomePct), ev, now); err != nil {
			return err
		}
		return bump(tx)
	})
	return ev, out, err
}

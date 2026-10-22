package backend

import (
	"database/sql"
	"math"

	"github.com/1994/boss-works-for-me/gameplay"
)

type TownOpportunityState struct {
	gameplay.TownOpportunity
	VisitedAt int64 `json:"visitedAt"`
}
type TownExploration struct {
	Visited           int                    `json:"visited"`
	Total             int                    `json:"total"`
	RewardTotal       int                    `json:"rewardTotal"`
	FirstShopComplete bool                   `json:"firstShopComplete"`
	ChainReady        bool                   `json:"chainReady"`
	Opportunities     []TownOpportunityState `json:"opportunities"`
}

func townExploration(tx *sql.Tx, player string, business TeaBusiness) (TownExploration, error) {
	e := TownExploration{FirstShopComplete: business.Stage == "complete", Opportunities: []TownOpportunityState{}}
	rows, err := tx.Query("SELECT site_id,visited_at FROM town_explorations WHERE player_id=?", player)
	if err != nil {
		return e, err
	}
	visited := map[string]int64{}
	for rows.Next() {
		var site string
		var at int64
		if err = rows.Scan(&site, &at); err != nil {
			rows.Close()
			return e, err
		}
		visited[site] = at
	}
	err = rows.Err()
	rows.Close()
	if err != nil {
		return e, err
	}
	for _, site := range gameplay.TownOpportunities() {
		at := visited[site.ID]
		e.Opportunities = append(e.Opportunities, TownOpportunityState{site, at})
		if at > 0 {
			e.Visited++
			e.RewardTotal += site.Reward
		}
	}
	e.Total = len(e.Opportunities)
	e.ChainReady = e.FirstShopComplete && e.Visited == e.Total && e.Total > 0
	return e, nil
}

// Coordinates come from the authenticated server world, never the request body.
// The (player,site) key makes retries and concurrent claims reward exactly once.
func (g *Game) TownExplore(player, id string, x, z float64) (TeaHome, error) {
	var target *gameplay.TownOpportunity
	for _, site := range gameplay.TownOpportunities() {
		if site.ID == id {
			copy := site
			target = &copy
			break
		}
	}
	if target == nil {
		return TeaHome{}, fail(400, "TOWN_SITE", "未知的考察据点")
	}
	err := g.transaction(func(tx *sql.Tx) error {
		var at int64
		err := tx.QueryRow("SELECT visited_at FROM town_explorations WHERE player_id=? AND site_id=?", player, id).Scan(&at)
		if err == nil {
			return nil
		}
		if err != sql.ErrNoRows {
			return err
		}
		if !finite(x) || !finite(z) || math.Hypot(x-target.X, z-target.Z) > 4.2 {
			return fail(409, "TOWN_TOO_FAR", "先走近据点，再开始考察")
		}
		if err := teaEnsure(tx, player, g.Now()); err != nil {
			return err
		}
		now := max(int64(1), g.Now())
		if _, err := tx.Exec("INSERT INTO town_explorations(player_id,site_id,visited_at) VALUES(?,?,?)", player, id, now); err != nil {
			return err
		}
		if _, err := tx.Exec("UPDATE players SET coins=coins+? WHERE id=?", target.Reward, player); err != nil {
			return err
		}
		return ledger(tx, "player:"+player, target.Reward, "town_explore", "town:explore:"+id, now)
	})
	if err != nil {
		return TeaHome{}, err
	}
	return g.TeaHome(player)
}

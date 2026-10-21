package backend

import "database/sql"

// ProjectView is a small ordinary-player observation endpoint. Fast CLI input
// polling must not load the entire employee directory, rankings and messages.
type ProjectView struct {
	PlayerID   string `json:"playerId"`
	ServerTime int64  `json:"serverTime"`
	ActiveRun  *Run   `json:"activeRun"`
}

func (g *Game) ProjectView(player string) (ProjectView, error) {
	out := ProjectView{PlayerID: player, ServerTime: g.Now()}
	r, err := scanRun(g.readDB().QueryRow("SELECT "+runColumns+" FROM project_runs WHERE player_id=? AND status='active' ORDER BY started_at DESC LIMIT 1", player))
	if err == sql.ErrNoRows {
		return out, nil
	}
	if err != nil {
		return out, err
	}
	if out.ServerTime <= r.Deadline+FinishGraceMS {
		out.ActiveRun = &r
	}
	return out, nil
}

package backend

import (
	"database/sql"
	"github.com/1994/boss-works-for-me/storage"
)

type TeaMission struct {
	Status      string  `json:"status"`
	AcceptedAt  int64   `json:"acceptedAt"`
	CompletedAt int64   `json:"completedAt"`
	Income      int     `json:"income"`
	RunID       *string `json:"runId"`
}
type TeaLedgerEntry struct {
	ID    int64  `json:"id"`
	Delta int    `json:"delta"`
	Kind  string `json:"kind"`
	Ref   string `json:"ref"`
	At    int64  `json:"at"`
}
type TeaWallet struct {
	Balance int              `json:"balance"`
	Entries []TeaLedgerEntry `json:"entries"`
}

func teaMission(tx storage.Tx, player string) (TeaMission, error) {
	m := TeaMission{Status: "offered"}
	var run sql.NullString
	err := tx.QueryRow("SELECT accepted_at,completed_at,income,run_id FROM tea_missions WHERE player_id=?", player).Scan(&m.AcceptedAt, &m.CompletedAt, &m.Income, &run)
	if err == sql.ErrNoRows {
		return m, nil
	}
	if err != nil {
		return m, err
	}
	m.Status = "accepted"
	if m.CompletedAt > 0 {
		m.Status = "completed"
	}
	if run.Valid {
		m.RunID = &run.String
	}
	return m, nil
}

func teaWallet(tx storage.Tx, player string) (TeaWallet, error) {
	w := TeaWallet{Entries: []TeaLedgerEntry{}}
	if err := tx.QueryRow("SELECT coins FROM players WHERE id=?", player).Scan(&w.Balance); err != nil {
		return w, err
	}
	rows, err := tx.Query("SELECT id,delta,reason,COALESCE(ref,''),created_at FROM ledger WHERE account=? ORDER BY id DESC LIMIT 30", "player:"+player)
	if err != nil {
		return w, err
	}
	defer rows.Close()
	for rows.Next() {
		var e TeaLedgerEntry
		if err = rows.Scan(&e.ID, &e.Delta, &e.Kind, &e.Ref, &e.At); err != nil {
			return w, err
		}
		w.Entries = append(w.Entries, e)
	}
	return w, rows.Err()
}

func (g *Game) TeaAcceptMission(player string) (TeaHome, error) {
	err := g.transaction(func(tx storage.Tx) error {
		if err := teaEnsure(tx, player, g.Now()); err != nil {
			return err
		}
		_, err := tx.Exec("INSERT OR IGNORE INTO tea_missions(player_id,accepted_at) VALUES(?,?)", player, g.Now())
		return err
	})
	if err != nil {
		return TeaHome{}, err
	}
	return g.TeaHome(player)
}

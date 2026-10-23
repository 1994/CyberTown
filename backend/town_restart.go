package backend

import "github.com/1994/boss-works-for-me/storage"

// RestartTown uses the storage SPI and a single transaction. Identity, other
// towns, global hiring demand and completed marketplace trades are preserved.
func (g *Game) RestartTown(player string) error {
	return g.transaction(func(tx storage.Tx) error {
		var coins int
		if err := tx.QueryRow("SELECT coins FROM players WHERE id=?", player).Scan(&coins); err != nil {
			return err
		}
		if _, err := tx.Exec("UPDATE town_employee_market SET status='cancelled',closed_at=? WHERE seller_id=? AND status='active'", g.Now(), player); err != nil {
			return err
		}
		for _, table := range []string{"town_properties", "tea_missions", "tea_sessions", "tea_runs", "tea_counter_progress", "tea_business_progress", "tea_chapters", "tea_shops", "tea_avatars", "town_explorations", "town_profiles", "project_runs", "year_awards", "player_years", "player_careers", "player_items", "player_styles"} {
			if _, err := tx.Exec("DELETE FROM "+table+" WHERE player_id=?", player); err != nil {
				return err
			}
		}
		if _, err := tx.Exec("DELETE FROM town_clones WHERE owner_id=?", player); err != nil {
			return err
		}
		// Archive wallet history so past income no longer unlocks new buildings.
		if _, err := tx.Exec("UPDATE ledger SET account=? WHERE account=?", "archive:"+player+":"+randomID(), "player:"+player); err != nil {
			return err
		}
		if _, err := tx.Exec("UPDATE players SET coins=? WHERE id=?", StartCoins, player); err != nil {
			return err
		}
		if err := ledger(tx, "player:"+player, StartCoins, "restart", "", g.Now()); err != nil {
			return err
		}
		// Snapshot requires these rows immediately after reload. Recreate only this
		// player's defaults inside the reset transaction, before readers resume.
		for _, table := range []string{"player_careers", "player_years", "player_styles"} {
			if _, err := tx.Exec("INSERT INTO "+table+"(player_id) VALUES(?)", player); err != nil {
				return err
			}
		}
		return townEnsure(tx, player, g.Now())
	})
}

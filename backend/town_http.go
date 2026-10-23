package backend

import (
	"net/http"
)

// A town is an explicit world room. Ordinary legacy campus clients retain their
// old room; the game enters its own town before starting position synchronization.
func (a *App) switchTownLocked(player, owner string) {
	if a.townOwner[player] == owner {
		return
	}
	a.townOwner[player] = owner
	delete(a.world, player)
	delete(a.worldFocus, player)
	delete(a.socialAt, player)
	a.ensureWorldLocked(player)
	for c := range a.clients {
		if c.player == player {
			c.worldReady = false
			c.view = map[string]WorldPlayer{}
		}
	}
	a.worldDirty, a.presenceDirty = true, true
}
func (a *App) handleTown(w http.ResponseWriter, r *http.Request, player string) error {
	path := r.URL.Path
	if path == "/api/tea/town/enter" && r.Method == "POST" {
		var b struct {
			OwnerID string `json:"ownerId"`
		}
		if err := teaDecode(w, r, &b); err != nil {
			return err
		}
		if b.OwnerID == "" {
			b.OwnerID = player
		}
		h, err := a.Game.TownEnter(player, b.OwnerID)
		if err != nil {
			return err
		}
		a.mu.Lock()
		a.switchTownLocked(player, b.OwnerID)
		a.mu.Unlock()
		respond(w, 200, h)
		return nil
	}
	a.mu.Lock()
	owner := a.townOwner[player]
	a.mu.Unlock()
	if owner == "" {
		owner = player
	}
	if path == "/api/tea/town" && r.Method == "GET" {
		h, err := a.Game.TownHome(player, owner)
		if err != nil {
			return err
		}
		respond(w, 200, h)
		return nil
	}
	if r.Method != "POST" {
		return fail(404, "NOT_FOUND", "接口不存在")
	}
	if owner != player {
		return fail(403, "TOWN_VISITOR", "参观时不能操作镇主的员工或建设")
	}
	var h TownHome
	var err error
	switch path {
	case "/api/tea/town/property/buy":
		var b struct {
			PropertyID    string `json:"propertyId"`
			ExpectedPrice int    `json:"expectedPrice"`
		}
		if err = teaDecode(w, r, &b); err != nil {
			return err
		}
		h, err = a.Game.TownBuyProperty(player, b.PropertyID, b.ExpectedPrice)
	case "/api/tea/town/poach":
		var b struct {
			SourceID      string `json:"sourceId"`
			EmployerID    string `json:"employerId"`
			ExpectedPrice int    `json:"expectedPrice"`
			RequestKey    string `json:"requestKey"`
		}
		if err = teaDecode(w, r, &b); err != nil {
			return err
		}
		h, err = a.Game.TownPoach(player, b.SourceID, b.EmployerID, b.ExpectedPrice, b.RequestKey)
	case "/api/tea/town/hire":
		var b struct {
			SourceID      string `json:"sourceId"`
			ExpectedPrice int    `json:"expectedPrice"`
		}
		if err = teaDecode(w, r, &b); err != nil {
			return err
		}
		h, err = a.Game.TownHire(player, b.SourceID, b.ExpectedPrice)
	case "/api/tea/town/jobs":
		var b struct {
			CloneID string `json:"cloneId"`
			Kind    string `json:"kind"`
		}
		if err = teaDecode(w, r, &b); err != nil {
			return err
		}
		h, err = a.Game.TownStartJob(player, b.CloneID, b.Kind)
	case "/api/tea/town/upgrade":
		var b struct {
			ExpectedLevel int `json:"expectedLevel"`
		}
		if err = teaDecode(w, r, &b); err != nil {
			return err
		}
		h, err = a.Game.TownUpgrade(player, b.ExpectedLevel)
	case "/api/tea/town/market/list":
		var b struct {
			CloneID    string `json:"cloneId"`
			Price      int    `json:"price"`
			RequestKey string `json:"requestKey"`
		}
		if err = teaDecode(w, r, &b); err != nil {
			return err
		}
		h, err = a.Game.TownList(player, b.CloneID, b.Price, b.RequestKey)
	case "/api/tea/town/market/withdraw":
		var b struct {
			ListingID string `json:"listingId"`
		}
		if err = teaDecode(w, r, &b); err != nil {
			return err
		}
		h, err = a.Game.TownWithdraw(player, b.ListingID)
	case "/api/tea/town/market/buy":
		var b struct {
			ListingID     string `json:"listingId"`
			ExpectedPrice int    `json:"expectedPrice"`
		}
		if err = teaDecode(w, r, &b); err != nil {
			return err
		}
		h, err = a.Game.TownBuy(player, b.ListingID, b.ExpectedPrice)
	default:
		return fail(404, "NOT_FOUND", "接口不存在")
	}
	if err != nil {
		return err
	}
	respond(w, 200, h)
	a.Broadcast(map[string]any{"kind": "town_changed", "playerId": player})
	return nil
}

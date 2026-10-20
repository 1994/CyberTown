package backend

import (
	"context"
	"encoding/json"

	"github.com/1994/boss-works-for-me/identity"
)

// Demo authentication is confined to this adapter, never a fallback for SSO.
type demoIdentityProvider struct{ game *Game }

func (*demoIdentityProvider) ID() string { return "demo" }
func (p *demoIdentityProvider) Authenticate(ctx context.Context, c identity.Credentials) (identity.User, error) {
	if err := ctx.Err(); err != nil {
		return identity.User{}, err
	}
	ids, err := p.game.demoIdentities()
	if err != nil {
		return identity.User{}, err
	}
	for _, u := range ids {
		if u.ID == c.PlayerID {
			return identity.User{Subject: u.ID, Name: u.Name, Title: u.Title}, nil
		}
	}
	return identity.User{}, identity.ErrUnauthorized
}

func demoPlayerIDs() (map[string]bool, error) {
	var seed struct {
		Players []Identity `json:"players"`
	}
	if err := json.Unmarshal(seedJSON, &seed); err != nil {
		return nil, err
	}
	out := map[string]bool{}
	for _, p := range seed.Players {
		out[p.ID] = true
	}
	return out, nil
}

func (g *Game) demoIdentities() ([]Identity, error) {
	allowed, err := demoPlayerIDs()
	if err != nil {
		return nil, err
	}
	all, err := g.Identities()
	if err != nil {
		return nil, err
	}
	out := []Identity{}
	for _, p := range all {
		if allowed[p.ID] {
			out = append(out, p)
		}
	}
	return out, nil
}

// Additive migration for existing Demo databases; never links new SSO users to
// Demo accounts based on their name, email, or incoming playerId.
func ensureDemoBindings(q queryer) error {
	ids, err := demoPlayerIDs()
	if err != nil {
		return err
	}
	for id := range ids {
		if _, err = q.Exec(`INSERT OR IGNORE INTO identity_bindings(provider,subject,player_id)
			SELECT 'demo',id,id FROM players WHERE id=?`, id); err != nil {
			return err
		}
	}
	return nil
}

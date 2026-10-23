package backend

import (
	"bytes"
	"crypto/sha256"
	"database/sql"
	"encoding/json"
	"fmt"
	"github.com/1994/boss-works-for-me/identity"
	"io"
	"regexp"
	"strings"

	"github.com/1994/boss-works-for-me/storage"
)

// MockScenario is explicit test data, separate from identity credentials. It is
// applied once, atomically. Colleagues are created before player scenarios.
type MockScenario struct {
	ID         string          `json:"id"`
	Players    []MockPlayer    `json:"players"`
	Colleagues []MockColleague `json:"colleagues,omitempty"`
}

// MockColleague creates a hireable test colleague without issuing login credentials.
// Existing IDs are never overwritten; use a new scenario and new IDs for additions.
type MockColleague struct {
	PlayerID  string `json:"playerId"`
	Name      string `json:"name"`
	Title     string `json:"title,omitempty"`
	AvatarURL string `json:"avatarUrl,omitempty"`
	Color     string `json:"color,omitempty"`
}

var mockColleagueID = regexp.MustCompile(`^mock-[a-zA-Z0-9_-]{1,64}$`)
var mockColor = regexp.MustCompile(`^#[a-fA-F0-9]{6}$`)

type MockPlayer struct {
	PlayerID   string      `json:"playerId"`
	CoinsGrant int         `json:"coinsGrant"`
	ShopLevel  int         `json:"shopLevel,omitempty"`
	Clones     []MockClone `json:"clones,omitempty"`
}
type MockClone struct {
	SourceID string `json:"sourceId"`
	XP       int    `json:"xp"`
}

func DecodeMockScenario(r io.Reader) (MockScenario, error) {
	var s MockScenario
	raw, err := io.ReadAll(io.LimitReader(r, (1<<20)+1))
	if err != nil {
		return s, err
	}
	if len(raw) > 1<<20 {
		return s, fmt.Errorf("mock scenario exceeds 1 MiB")
	}
	d := json.NewDecoder(bytes.NewReader(raw))
	d.DisallowUnknownFields()
	if err := d.Decode(&s); err != nil {
		return s, err
	}
	var extra any
	if err := d.Decode(&extra); err != io.EOF {
		return s, fmt.Errorf("mock scenario must contain exactly one JSON object")
	}
	return s, s.Validate()
}
func (s MockScenario) Validate() error {
	if strings.TrimSpace(s.ID) == "" || len(s.ID) > 100 || len(s.Players)+len(s.Colleagues) == 0 || len(s.Players) > 100 || len(s.Colleagues) > 100 {
		return fmt.Errorf("mock scenario requires an id and up to 100 players/colleagues, with at least one entry")
	}
	colleagues := map[string]bool{}
	for _, c := range s.Colleagues {
		if !mockColleagueID.MatchString(c.PlayerID) || colleagues[c.PlayerID] || (c.Color != "" && !mockColor.MatchString(c.Color)) || !validIdentityUser(identity.User{Subject: c.PlayerID, Name: c.Name, Title: c.Title, AvatarURL: &c.AvatarURL}) {
			return fmt.Errorf("invalid mock colleague %q", c.PlayerID)
		}
		colleagues[c.PlayerID] = true
	}
	seen := map[string]bool{}
	for _, p := range s.Players {
		if p.PlayerID == "" || seen[p.PlayerID] || p.CoinsGrant < 0 || p.CoinsGrant > 10000000 || p.ShopLevel < 0 || p.ShopLevel > 3 || len(p.Clones) > 12 {
			return fmt.Errorf("invalid mock player %q", p.PlayerID)
		}
		seen[p.PlayerID] = true
		clones := map[string]bool{}
		for _, c := range p.Clones {
			if c.SourceID == "" || clones[c.SourceID] || c.XP < 0 || c.XP > 1000000 {
				return fmt.Errorf("invalid mock clone %q", c.SourceID)
			}
			clones[c.SourceID] = true
		}
	}
	return nil
}
func (g *Game) ApplyMockScenario(s MockScenario) error {
	if !g.demoData {
		return fmt.Errorf("mock scenarios are test-only")
	}
	if err := s.Validate(); err != nil {
		return err
	}
	raw, _ := json.Marshal(s)
	fingerprint := fmt.Sprintf("%x", sha256.Sum256(raw))
	key := "mock_scenario:" + s.ID
	return g.transaction(func(tx storage.Tx) error {
		var existing string
		err := tx.QueryRow("SELECT value FROM meta WHERE key=?", key).Scan(&existing)
		if err == nil {
			if existing != fingerprint {
				return fmt.Errorf("mock scenario id already used with different data")
			}
			return nil
		}
		if err != sql.ErrNoRows {
			return err
		}
		for _, c := range s.Colleagues {
			color := c.Color
			if color == "" {
				color = "#39dbe8"
			}
			// Plain INSERT deliberately rejects collisions, preserving real profiles and saves.
			if _, err := tx.Exec("INSERT INTO players(id,name,title,color,coins,created_at) VALUES(?,?,?,?,0,?)", c.PlayerID, c.Name, c.Title, color, g.Now()); err != nil {
				return fmt.Errorf("create mock colleague %q (ID must be new): %w", c.PlayerID, err)
			}
			look, _ := json.Marshal(Look{Skin: "#f2c7a5", Hair: "#24243f", HairStyle: "short", Shirt: color, Pants: "#24243f", Accessory: "none", AvatarURL: c.AvatarURL})
			if _, err := tx.Exec(`INSERT INTO colleagues(id,name,title,bio,look,skill_kind,skill_value,self_player_id,sort)
    VALUES(?,?,?,'测试同事分身',?,'income',10,?,(SELECT COALESCE(MAX(sort),0)+1 FROM colleagues))`, "colleague:"+c.PlayerID, c.Name, c.Title, string(look), c.PlayerID); err != nil {
				return err
			}
			if _, err := tx.Exec("INSERT INTO tea_avatars(player_id,enabled) VALUES(?,1)", c.PlayerID); err != nil {
				return err
			}
		}
		for _, p := range s.Players {
			if err := townEnsure(tx, p.PlayerID, g.Now()); err != nil {
				return err
			}
			if p.CoinsGrant > 0 {
				if _, err := tx.Exec("UPDATE players SET coins=coins+? WHERE id=?", p.CoinsGrant, p.PlayerID); err != nil {
					return err
				}
				if err := ledger(tx, "player:"+p.PlayerID, p.CoinsGrant, "mock_grant", key, g.Now()); err != nil {
					return err
				}
				if err := ledger(tx, "system", -p.CoinsGrant, "mock_grant", key, g.Now()); err != nil {
					return err
				}
			}
			if p.ShopLevel > 0 {
				if _, err := tx.Exec("UPDATE tea_shops SET level=? WHERE player_id=?", p.ShopLevel, p.PlayerID); err != nil {
					return err
				}
			}
			ws, err := townWorkerCatalog(tx, p.PlayerID)
			if err != nil {
				return err
			}
			valid := map[string]bool{}
			for _, w := range ws {
				valid[w.ID] = w.Enabled
			}
			var count int
			if err := tx.QueryRow("SELECT COUNT(*) FROM town_clones WHERE owner_id=?", p.PlayerID).Scan(&count); err != nil {
				return err
			}
			if count+len(p.Clones) > 12 {
				return fmt.Errorf("mock roster exceeds 12")
			}
			for _, c := range p.Clones {
				if !valid[c.SourceID] {
					return fmt.Errorf("unknown or disabled mock clone %q", c.SourceID)
				}
				if _, err := tx.Exec("INSERT INTO town_clones(owner_id,source_id,xp,hired_price,hired_at) VALUES(?,?,?,0,?)", p.PlayerID, c.SourceID, c.XP, g.Now()); err != nil {
					return err
				}
				if _, err := tx.Exec("INSERT INTO town_clone_demand(source_id,hires) VALUES(?,1) ON CONFLICT(source_id) DO UPDATE SET hires=hires+1", c.SourceID); err != nil {
					return err
				}
			}
		}
		if _, err := tx.Exec("INSERT INTO meta(key,value) VALUES(?,?)", key, fingerprint); err != nil {
			return err
		}
		return bump(tx)
	})
}

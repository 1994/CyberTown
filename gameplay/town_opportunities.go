package gameplay

import (
	_ "embed"
	"encoding/json"
)

type TownOpportunity struct {
	ID       string  `json:"id"`
	Name     string  `json:"name"`
	District string  `json:"district"`
	X        float64 `json:"x"`
	Z        float64 `json:"z"`
	Reward   int     `json:"reward"`
	Insight  string  `json:"insight"`
}

//go:embed town-opportunities.json
var townOpportunitiesJSON []byte

// Return fresh values so callers cannot mutate the shared reward catalog.
func TownOpportunities() []TownOpportunity {
	var sites []TownOpportunity
	if err := json.Unmarshal(townOpportunitiesJSON, &sites); err != nil {
		panic(err)
	}
	return sites
}

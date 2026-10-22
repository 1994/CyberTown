package gameplay

import (
	_ "embed"
	"encoding/json"
)

type ArcadeGame struct {
	ID    string `json:"id"`
	Name  string `json:"name"`
	Fee   int    `json:"fee"`
	Ready bool   `json:"ready"`
}
type ArcadeCatalog struct {
	X     float64      `json:"x"`
	Z     float64      `json:"z"`
	Range float64      `json:"range"`
	Games []ArcadeGame `json:"games"`
}

//go:embed arcade.json
var arcadeJSON []byte

func Arcade() ArcadeCatalog {
	var c ArcadeCatalog
	if err := json.Unmarshal(arcadeJSON, &c); err != nil {
		panic(err)
	}
	return c
}

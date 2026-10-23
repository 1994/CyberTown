package gameplay

import (
	_ "embed"
	"encoding/json"
)

type TownProperty struct {
	ID    string `json:"id"`
	Name  string `json:"name"`
	Price int    `json:"price"`
}

//go:embed town-properties.json
var propertiesJSON []byte

func TownProperties() []TownProperty {
	var p []TownProperty
	if err := json.Unmarshal(propertiesJSON, &p); err != nil {
		panic(err)
	}
	return p
}

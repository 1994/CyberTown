package main

import (
	"encoding/json"
	"fmt"
	"os"

	"github.com/1994/boss-works-for-me/identity"
	identitymock "github.com/1994/boss-works-for-me/identity/mock"
)

func identityProvider(mode, fixturePath string) (identity.Provider, error) {
	switch mode {
	case "demo":
		return nil, nil // backend.NewApp installs its isolated Demo adapter.
	case "mock":
		if fixturePath == "" {
			return nil, fmt.Errorf("AUTH_MODE=mock requires MOCK_IDENTITIES_FILE")
		}
		data, err := os.ReadFile(fixturePath)
		if err != nil {
			return nil, fmt.Errorf("read mock identity fixtures: %w", err)
		}
		var users map[string]identity.User
		if err = json.Unmarshal(data, &users); err != nil || len(users) == 0 {
			return nil, fmt.Errorf("mock identity fixtures must be a nonempty token-to-user JSON object")
		}
		return identitymock.New(users), nil
	default:
		return nil, fmt.Errorf("unknown AUTH_MODE %q; use demo/mock, or inject your SSO identity.Provider in cmd/boss-server/main.go", mode)
	}
}

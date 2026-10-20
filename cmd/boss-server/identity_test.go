package main

import (
	"context"
	"os"
	"path/filepath"
	"testing"

	"github.com/1994/boss-works-for-me/identity"
)

func TestIdentityProviderConfiguration(t *testing.T) {
	if p, err := identityProvider("demo", ""); err != nil || p != nil {
		t.Fatal("Demo default broken")
	}
	for _, mode := range []string{"", "sso", "typo", "mock"} {
		if _, err := identityProvider(mode, ""); err == nil {
			t.Fatal("bad config silently fell back", mode)
		}
	}
	file := filepath.Join(t.TempDir(), "mock.json")
	if err := os.WriteFile(file, []byte(`{"test":{"subject":"123","name":"员工"}}`), 0600); err != nil {
		t.Fatal(err)
	}
	p, err := identityProvider("mock", file)
	if err != nil {
		t.Fatal(err)
	}
	u, err := p.Authenticate(context.Background(), identity.Credentials{AccessToken: "test"})
	if err != nil || u.Subject != "123" {
		t.Fatal("fixture not loaded", err)
	}
	if err := os.WriteFile(file, []byte(`{}`), 0600); err != nil {
		t.Fatal(err)
	}
	if _, err := identityProvider("mock", file); err == nil {
		t.Fatal("empty fixtures accepted")
	}
}

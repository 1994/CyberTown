package mock

import (
	"context"
	"errors"
	"testing"

	"github.com/1994/boss-works-for-me/identity"
)

func TestMockIdentityIsolation(t *testing.T) {
	url := "/original.png"
	fixtures := map[string]identity.User{"token": {Subject: "123", Name: "员工", AvatarURL: &url}}
	p := New(fixtures)
	url = "/changed.png"
	delete(fixtures, "token")
	ctx := context.Background()
	u, err := p.Authenticate(ctx, identity.Credentials{AccessToken: "token"})
	if err != nil || *u.AvatarURL != "/original.png" {
		t.Fatal("fixture mutation leaked", err)
	}
	*u.AvatarURL = "/returned.png"
	u, err = p.Authenticate(ctx, identity.Credentials{AccessToken: "token"})
	if err != nil || *u.AvatarURL != "/original.png" {
		t.Fatal("returned profile mutation leaked", err)
	}
	for _, c := range []identity.Credentials{{}, {AccessToken: "invalid"}, {PlayerID: "123"}, {Code: "token"}} {
		if _, err = p.Authenticate(ctx, c); !errors.Is(err, identity.ErrUnauthorized) {
			t.Fatal("accepted unconfigured credential", c)
		}
	}
	canceled, cancel := context.WithCancel(ctx)
	cancel()
	if _, err = p.Authenticate(canceled, identity.Credentials{AccessToken: "token"}); !errors.Is(err, context.Canceled) {
		t.Fatal("ignored cancellation", err)
	}
}

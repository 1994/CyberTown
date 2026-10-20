// Package mock supplies an explicitly selected, in-memory identity provider for
// local integration tests. Tokens are fixtures, not real SSO credentials.
package mock

import (
	"context"

	"github.com/1994/boss-works-for-me/identity"
)

type Provider struct{ users map[string]identity.User }

// New copies all fixtures so callers can safely share the provider between
// concurrent HTTP requests. Map keys are the accepted accessToken values.
func New(users map[string]identity.User) *Provider {
	p := &Provider{users: make(map[string]identity.User, len(users))}
	for token, user := range users {
		p.users[token] = clone(user)
	}
	return p
}

func (*Provider) ID() string { return "mock" }
func (p *Provider) Authenticate(ctx context.Context, c identity.Credentials) (identity.User, error) {
	if err := ctx.Err(); err != nil {
		return identity.User{}, err
	}
	u, ok := p.users[c.AccessToken]
	if !ok || c.AccessToken == "" {
		return identity.User{}, identity.ErrUnauthorized
	}
	return clone(u), nil
}

func clone(u identity.User) identity.User {
	if u.AvatarURL != nil {
		url := *u.AvatarURL
		u.AvatarURL = &url
	}
	return u
}

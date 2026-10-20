// Package identity defines the identity SPI. It has no dependency on HTTP,
// the game database, or a particular SSO protocol.
package identity

import (
	"context"
	"errors"
)

// ErrUnauthorized means credentials were absent, invalid, expired, or denied.
// Other errors are treated as provider outages; no game session is issued.
var ErrUnauthorized = errors.New("identity: unauthorized")

// Credentials are untrusted input. Each adapter must verify the fields it uses
// with its identity authority. PlayerID is exclusively for the built-in Demo.
// Never accept a client-supplied user name, subject, or avatar as proof of identity.
type Credentials struct {
	Code        string `json:"code,omitempty"`
	AccessToken string `json:"accessToken,omitempty"`
	RedirectURI string `json:"redirectUri,omitempty"`
	PlayerID    string `json:"playerId,omitempty"`
}

// User is returned only after verification. Subject must be an immutable upstream
// identifier (not a display name/email); the game namespaces it by Provider.ID().
// AvatarURL nil preserves the existing avatar; pointer-to-empty clears it.
// Title is display-only and never grants game ranks, skills, or privileges.
type User struct {
	Subject   string  `json:"subject"`
	Name      string  `json:"name"`
	Title     string  `json:"title"`
	AvatarURL *string `json:"avatarUrl,omitempty"`
}

// Provider implementations must be safe for concurrent calls, honor ctx and
// bound upstream requests. ID must remain stable across restarts and identify
// the issuer/tenant. The built-in provider reserves ID "demo".
type Provider interface {
	ID() string
	Authenticate(ctx context.Context, credentials Credentials) (User, error)
}

// ProviderFunc makes integration tests and small adapters easy to inject.
type ProviderFunc struct {
	ProviderID string
	Verify     func(context.Context, Credentials) (User, error)
}

func (p ProviderFunc) ID() string { return p.ProviderID }
func (p ProviderFunc) Authenticate(ctx context.Context, c Credentials) (User, error) {
	if err := ctx.Err(); err != nil {
		return User{}, err
	}
	if p.Verify == nil {
		return User{}, ErrUnauthorized
	}
	return p.Verify(ctx, c)
}

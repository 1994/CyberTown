package backend

import (
	"encoding/json"
	"testing"
)

func TestAvatarIdentityAndPersistence(t *testing.T) {
	e := setup(t)
	a, b := e.login(t, "wang"), e.login(t, "li")
	avatarURL := "https://images.example.com/wang.png?v=2"
	before := e.snapshot(t, "wang")
	status, body := e.call(t, "/api/profile/avatar", a, map[string]string{"avatarUrl": avatarURL, "playerId": "li"})
	assertCode(t, status, body, 200, "")
	if before.Me.Coins != e.snapshot(t, "wang").Me.Coins {
		t.Fatal("avatar update changed the balance")
	}
	status, body = e.call(t, "/api/state", b, nil)
	assertCode(t, status, body, 200, "")
	var players []Player
	if err := json.Unmarshal(body["players"], &players); err != nil {
		t.Fatal(err)
	}
	for _, p := range players {
		if p.ID == "wang" && p.AvatarURL != avatarURL || p.ID != "wang" && p.AvatarURL != "" {
			t.Fatalf("wrong identity avatar: %+v", p)
		}
	}
	// Signing a virtual clone must not replace its identity with the owner's.
	status, body = e.call(t, "/api/colleagues/c-wang/sign", b, map[string]int{"expectedPrice": 300})
	assertCode(t, status, body, 200, "")
	snapshot := e.snapshot(t, "li")
	for _, c := range snapshot.Colleagues {
		if c.ID == "c-wang" && (c.Look.AvatarURL != avatarURL || c.Look.AvatarName != "老王" || !same(c.OwnerID, "li")) {
			t.Fatalf("clone lost its face: %+v", c)
		}
	}
	identities, err := e.g.Identities()
	if err != nil {
		t.Fatal(err)
	}
	for _, p := range identities {
		if p.ID == "wang" && p.AvatarURL != avatarURL {
			t.Fatal("login identity avatar missing")
		}
	}
	// A second connection exercises persisted JSON, not in-memory appearance state.
	var dbPath string
	var seq int
	var name string
	if err = e.g.DB.QueryRow("PRAGMA database_list").Scan(&seq, &name, &dbPath); err != nil {
		t.Fatal(err)
	}
	reopened, err := Open(dbPath, e.clock.Load)
	if err != nil {
		t.Fatal(err)
	}
	defer reopened.Close()
	restored, err := reopened.Snapshot("wang", nil)
	if err != nil || restored.Me.AvatarURL != avatarURL {
		t.Fatalf("avatar not persisted: %v %+v", err, restored.Me)
	}
	status, body = e.call(t, "/api/profile/avatar", a, map[string]string{"avatarUrl": ""})
	assertCode(t, status, body, 200, "")
	if got := e.snapshot(t, "wang").Me.AvatarURL; got != "" {
		t.Fatal("avatar reset failed", got)
	}
	audit, err := e.g.Audit()
	if err != nil || len(audit.Mismatches) != 0 || audit.DoubleOwned != 0 || audit.Negative != 0 || audit.Overfull != 0 {
		t.Fatalf("audit: %+v %v", audit, err)
	}
}

func TestAvatarValidationAndAuth(t *testing.T) {
	e := setup(t)
	token := e.login(t, "wang")
	status, body := e.call(t, "/api/profile/avatar", "", map[string]string{"avatarUrl": "/avatars/wang.png"})
	assertCode(t, status, body, 401, "NO_SESSION")
	for _, value := range []any{nil, 42, "javascript:alert(1)", "data:image/png;base64,abc", "//outside.example/a.png", "https://user:secret@example.com/a.png", " /a.png", "/\\evil/a.png"} {
		before := e.g.Version()
		status, body = e.call(t, "/api/profile/avatar", token, map[string]any{"avatarUrl": value})
		assertCode(t, status, body, 400, "BAD_AVATAR")
		if before != e.g.Version() {
			t.Fatal("rejected avatar changed state")
		}
	}
	for _, value := range []string{"/avatars/local.png?v=1", "http://192.168.1.2:8787/avatar.png", "https://images.example.com/avatar.webp"} {
		status, body = e.call(t, "/api/profile/avatar", token, map[string]string{"avatarUrl": value})
		assertCode(t, status, body, 200, "")
	}
}

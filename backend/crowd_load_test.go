package backend

import (
	"bufio"
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"path/filepath"
	"strings"
	"sync"
	"testing"
	"time"

	"github.com/1994/boss-works-for-me/identity"
)

// Real HTTP/SSE smoke load, fake identities only. This is not a production
// capacity guarantee: it excludes 100 physical browsers and corporate SSO.
func TestCrowd100Burst(t *testing.T) {
	if testing.Short() {
		t.Skip("100-client HTTP/SSE integration")
	}
	g, err := OpenWithOptions(filepath.Join(t.TempDir(), "crowd.db"), nil, DatabaseOptions{})
	if err != nil {
		t.Fatal(err)
	}
	provider := identity.ProviderFunc{ProviderID: "load-fixture", Verify: func(ctx context.Context, c identity.Credentials) (identity.User, error) {
		return identity.User{Subject: c.AccessToken, Name: "假玩家" + c.AccessToken}, ctx.Err()
	}}
	app := NewApp(g, Options{IdentityProvider: provider})
	srv := httptest.NewServer(app)
	t.Cleanup(func() { app.Close(); srv.Close(); g.Close() })
	type viewer struct {
		mu                             sync.Mutex
		token, id                      string
		players                        map[string]WorldPlayer
		online, nearby, packets, bytes int
		body                           *http.Response
	}
	viewers := make([]*viewer, 100)
	request := func(path, token string, body any, out any) error {
		method := "GET"
		var data []byte
		if body != nil {
			method = "POST"
			data, _ = json.Marshal(body)
		}
		r, _ := http.NewRequest(method, srv.URL+path, bytes.NewReader(data))
		r.Header.Set("Content-Type", "application/json")
		if token != "" {
			r.Header.Set("Authorization", "Bearer "+token)
		}
		res, err := http.DefaultClient.Do(r)
		if err != nil {
			return err
		}
		defer res.Body.Close()
		if res.StatusCode != 200 {
			return fmt.Errorf("%s: status %d", path, res.StatusCode)
		}
		return json.NewDecoder(res.Body).Decode(out)
	}
	parallel := func(fn func(int) error) {
		t.Helper()
		var wg sync.WaitGroup
		errors := make(chan error, 100)
		gate := make(chan struct{}, 20)
		for i := range viewers {
			wg.Add(1)
			go func(i int) {
				defer wg.Done()
				gate <- struct{}{}
				defer func() { <-gate }()
				if err := fn(i); err != nil {
					errors <- err
				}
			}(i)
		}
		wg.Wait()
		close(errors)
		for err := range errors {
			t.Fatal(err)
		}
	}
	start := time.Now()
	parallel(func(i int) error {
		var login struct {
			Token    string `json:"token"`
			PlayerID string `json:"playerId"`
		}
		if err := request("/api/auth/login", "", map[string]string{"accessToken": fmt.Sprint(i)}, &login); err != nil {
			return err
		}
		viewers[i] = &viewer{token: login.Token, id: login.PlayerID, players: map[string]WorldPlayer{}}
		return nil
	})
	loginTime := time.Since(start)
	parallel(func(i int) error {
		v := viewers[i]
		res, err := http.Get(srv.URL + "/api/events?world=2&token=" + v.token)
		if err != nil {
			return err
		}
		v.body = res
		if res.StatusCode != 200 {
			res.Body.Close()
			return fmt.Errorf("SSE status %d", res.StatusCode)
		}
		go func() {
			scanner := bufio.NewScanner(res.Body)
			scanner.Buffer(make([]byte, 4096), 1024*1024)
			for scanner.Scan() {
				line := scanner.Text()
				if !strings.HasPrefix(line, "data: ") {
					continue
				}
				var msg struct {
					Type        string
					Partial     bool
					Players     []WorldPlayer
					Removed     []string
					OnlineCount int
					NearbyCount int
				}
				if json.Unmarshal([]byte(line[6:]), &msg) != nil || msg.Type != "world" {
					continue
				}
				v.mu.Lock()
				if !msg.Partial {
					v.players = map[string]WorldPlayer{}
				}
				for _, id := range msg.Removed {
					delete(v.players, id)
				}
				for _, p := range msg.Players {
					v.players[p.ID] = p
				}
				v.online = msg.OnlineCount
				v.nearby = msg.NearbyCount
				v.packets++
				v.bytes += len(line)
				v.mu.Unlock()
			}
		}()
		t.Cleanup(func() { res.Body.Close() })
		return nil
	})
	wait := func(check func(*viewer) bool) {
		t.Helper()
		deadline := time.Now().Add(5 * time.Second)
		for time.Now().Before(deadline) {
			complete := true
			for _, v := range viewers {
				v.mu.Lock()
				ok := check(v)
				v.mu.Unlock()
				complete = complete && ok
			}
			if complete {
				return
			}
			time.Sleep(20 * time.Millisecond)
		}
		t.Fatal("100-client convergence timed out")
	}
	wait(func(v *viewer) bool {
		_, self := v.players[v.id]
		return self && v.online == 100 && v.nearby == 99 && len(v.players) <= worldLimit+1
	})
	snapshotStart := time.Now()
	parallel(func(i int) error {
		var state Snapshot
		if err := request("/api/state", viewers[i].token, nil, &state); err != nil {
			return err
		}
		if len(state.Players) != 100 || state.Me.Coins != 600 {
			return fmt.Errorf("snapshot mismatch")
		}
		return nil
	})
	snapshotTime := time.Since(snapshotStart)
	// Observe a legitimate simultaneous movement burst after the 80ms input bound.
	time.Sleep(100 * time.Millisecond)
	parallel(func(i int) error {
		v := viewers[i]
		v.mu.Lock()
		p := v.players[v.id]
		v.mu.Unlock()
		var out any
		return request("/api/world/move", v.token, map[string]any{"x": p.X + .1, "z": p.Z, "yaw": .2, "moving": true}, &out)
	})
	wait(func(v *viewer) bool { return v.players[v.id].Moving })
	totalPackets, totalBytes := 0, 0
	for _, v := range viewers {
		v.mu.Lock()
		totalPackets += v.packets
		totalBytes += v.bytes
		if len(v.players) > worldLimit+1 {
			t.Fatal("unbounded view")
		}
		v.mu.Unlock()
	}
	t.Logf("100 fake identities: login burst=%s; 100 snapshots=%s; convergence=%s; world packets=%d bytes=%d; max tracked per client=%d", loginTime, snapshotTime, time.Since(start), totalPackets, totalBytes, worldLimit+1)
}

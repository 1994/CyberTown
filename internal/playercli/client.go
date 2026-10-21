// Package playercli is an ordinary HTTP game client. It has no database, admin
// API, model SDK, or privileged game operations.
package playercli

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"os"
	"path/filepath"
	"strings"
	"time"
)

type object = map[string]any
type Error struct {
	Code    string `json:"code"`
	Message string `json:"message"`
	Status  int    `json:"status,omitempty"`
}

func (e *Error) Error() string           { return e.Code + ": " + e.Message }
func problem(code, message string) error { return &Error{Code: code, Message: message} }

type session struct {
	Server   string `json:"server"`
	Token    string `json:"token"`
	PlayerID string `json:"playerId"`
}
type client struct {
	server, token, dir, profile string
	http                        *http.Client
	in                          io.Reader
	out                         io.Writer
}

func (c *client) file(suffix string) string { return filepath.Join(c.dir, c.profile+suffix) }
func atomicJSON(path string, v any) error {
	b, err := json.Marshal(v)
	if err != nil {
		return err
	}
	f, err := os.CreateTemp(filepath.Dir(path), ".boss-*")
	if err != nil {
		return err
	}
	defer os.Remove(f.Name())
	if _, err = f.Write(append(b, '\n')); err != nil {
		f.Close()
		return err
	}
	if err = f.Close(); err != nil {
		return err
	}
	return os.Rename(f.Name(), path)
}
func loadJSON(path string, v any) error {
	b, err := os.ReadFile(path)
	if err != nil {
		return err
	}
	return json.Unmarshal(b, v)
}
func (c *client) emit(v any) error { return json.NewEncoder(c.out).Encode(v) }
func (c *client) request(ctx context.Context, method, path string, body any) (*http.Response, error) {
	var buf bytes.Buffer
	if body != nil {
		if err := json.NewEncoder(&buf).Encode(body); err != nil {
			return nil, err
		}
	}
	req, err := http.NewRequestWithContext(ctx, method, c.server+path, &buf)
	if err != nil {
		return nil, err
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("User-Agent", "boss-player-cli/1")
	if c.token != "" {
		req.Header.Set("Authorization", "Bearer "+c.token)
	}
	res, err := c.http.Do(req)
	if err != nil {
		return nil, problem("NETWORK", "request failed; check server and connection")
	}
	if res.StatusCode < 200 || res.StatusCode >= 300 {
		defer res.Body.Close()
		var reply struct {
			Error Error `json:"error"`
		}
		_ = json.NewDecoder(io.LimitReader(res.Body, 1<<20)).Decode(&reply)
		reply.Error.Status = res.StatusCode
		if reply.Error.Code == "" {
			reply.Error.Code = fmt.Sprintf("HTTP_%d", res.StatusCode)
			reply.Error.Message = "request failed"
		}
		return nil, &reply.Error
	}
	return res, nil
}
func (c *client) call(ctx context.Context, method, path string, body, out any) error {
	ctx, cancel := context.WithTimeout(ctx, 12*time.Second)
	defer cancel()
	res, err := c.request(ctx, method, path, body)
	if err != nil {
		return err
	}
	defer res.Body.Close()
	if err = json.NewDecoder(io.LimitReader(res.Body, 16<<20)).Decode(out); err != nil {
		return problem("BAD_RESPONSE", "server returned invalid JSON")
	}
	return nil
}
func (c *client) result(ctx context.Context, method, path string, body any) error {
	var out json.RawMessage
	if err := c.call(ctx, method, path, body, &out); err != nil {
		return err
	}
	return c.emit(out)
}
func (c *client) state(ctx context.Context) (object, error) {
	var s object
	err := c.call(ctx, "GET", "/api/state", nil, &s)
	return s, err
}
func asObject(v any) object { m, _ := v.(map[string]any); return m }
func asList(v any) []any    { a, _ := v.([]any); return a }
func str(v any) string      { s, _ := v.(string); return s }
func number(v any) float64  { f, _ := v.(float64); return f }
func fields(m object, keys ...string) object {
	out := object{}
	for _, k := range keys {
		out[k] = m[k]
	}
	return out
}
func market(s object, teamOnly bool) []any {
	out := []any{}
	id := asObject(s["me"])["id"]
	for _, v := range asList(s["colleagues"]) {
		m := asObject(v)
		if teamOnly && m["ownerId"] != id {
			continue
		}
		out = append(out, fields(m, "id", "name", "title", "price", "ownerId", "selfPlayerId", "skill", "deskSlot"))
	}
	return out
}
func (c *client) login(ctx context.Context, args []string) error {
	if len(args) != 1 {
		return problem("USAGE", "login ID (demo only), or login --stdin (SPI credentials JSON)")
	}
	path := "/api/auth/test-login"
	var body any = object{"playerId": args[0]}
	if args[0] == "--stdin" {
		path = "/api/auth/login"
		var raw json.RawMessage
		if err := json.NewDecoder(io.LimitReader(c.in, 64<<10)).Decode(&raw); err != nil {
			return problem("BAD_INPUT", "expected credentials JSON on stdin")
		}
		body = raw
	}
	var s session
	// Never attach a previous player's bearer token to a new login request.
	old := c.token
	c.token = ""
	err := c.call(ctx, "POST", path, body, &s)
	c.token = old
	if err != nil {
		return err
	}
	if s.Token == "" || s.PlayerID == "" {
		return problem("BAD_RESPONSE", "login returned no session")
	}
	s.Server = c.server
	if err = atomicJSON(c.file(".json"), s); err != nil {
		return err
	}
	return c.emit(object{"ok": true, "playerId": s.PlayerID, "server": s.Server, "profile": c.profile})
}
func normalizeServer(s string) (string, error) {
	u, err := url.Parse(strings.TrimRight(s, "/"))
	if err != nil || u == nil || u.Host == "" || u.Hostname() == "" || u.Scheme != "http" && u.Scheme != "https" || u.User != nil || u.RawQuery != "" || u.Fragment != "" || u.Opaque != "" {
		return "", problem("BAD_SERVER", "server must be an http(s) URL, optionally with a gateway path prefix")
	}
	return strings.TrimRight(u.String(), "/"), nil
}
func noRedirect(_ *http.Request, _ []*http.Request) error { return http.ErrUseLastResponse }
func report(w io.Writer, err error) int {
	var e *Error
	if !errors.As(err, &e) {
		e = &Error{Code: "CLIENT", Message: err.Error()}
	}
	_ = json.NewEncoder(w).Encode(object{"error": e})
	return 1
}

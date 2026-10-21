package playercli

import (
	"bufio"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"math"
	"strconv"
	"strings"
	"time"

	"github.com/1994/boss-works-for-me/gameplay"
)

type worldPlayer struct {
	ID     string  `json:"id"`
	X      float64 `json:"x"`
	Z      float64 `json:"z"`
	Yaw    float64 `json:"yaw"`
	Moving bool    `json:"moving"`
}

func wait(ctx context.Context, d time.Duration) error {
	timer := time.NewTimer(d)
	defer timer.Stop()
	select {
	case <-ctx.Done():
		return ctx.Err()
	case <-timer.C:
		return nil
	}
}
func (c *client) position(ctx context.Context) (worldPlayer, error) {
	s, err := c.state(ctx)
	if err != nil {
		return worldPlayer{}, err
	}
	id := str(asObject(s["me"])["id"])
	var world struct {
		Players []worldPlayer `json:"players"`
	}
	if err = c.call(ctx, "GET", "/api/world", nil, &world); err != nil {
		return worldPlayer{}, err
	}
	for _, p := range world.Players {
		if p.ID == id {
			return p, nil
		}
	}
	return worldPlayer{}, problem("BAD_RESPONSE", "self position missing")
}
func (c *client) walk(ctx context.Context, cmd string, args []string) error {
	m := gameplay.Navigation()
	var dest gameplay.Point
	if cmd == "walk-player" {
		if err := exact(args, 1, "walk-player PLAYER"); err != nil {
			return err
		}
		var reply struct {
			Player worldPlayer `json:"player"`
		}
		if err := c.call(ctx, "POST", "/api/world/focus", object{"targetId": args[0]}, &reply); err != nil {
			return err
		}
		dest = gameplay.Point{X: reply.Player.X, Z: reply.Player.Z}
	} else {
		switch len(args) {
		case 1:
			found := false
			for _, z := range m.Zones {
				if z.ID == args[0] {
					dest = gameplay.Point{X: z.X, Z: z.Z}
					found = true
					break
				}
			}
			if !found {
				return problem("BAD_ZONE", "unknown landmark; boss map")
			}
		case 2:
			x, e1 := strconv.ParseFloat(args[0], 64)
			z, e2 := strconv.ParseFloat(args[1], 64)
			if e1 != nil || e2 != nil {
				return problem("BAD_INPUT", "walk X Z: coordinates must be finite numbers")
			}
			dest = gameplay.Point{X: x, Z: z}
		default:
			return problem("USAGE", "walk ZONE | walk X Z")
		}
	}
	p, err := c.position(ctx)
	if err != nil {
		return err
	}
	if cmd == "walk-player" {
		dx, dz := dest.X-p.X, dest.Z-p.Z
		d := math.Hypot(dx, dz)
		if d <= 2 {
			return c.emit(object{"arrived": true, "player": p})
		}
		dest.X -= dx / d * 1.8
		dest.Z -= dz / d * 1.8
	}
	path, err := m.FindPath(gameplay.Point{X: p.X, Z: p.Z}, dest)
	if err != nil {
		return problem("NO_PATH", err.Error())
	}
	moved := 0.0
	// Each step is 200ms of ordinary walking (4.2m/s). Waiting before the first
	// step also respects the server's 80ms update limit immediately after spawn.
	for _, goal := range path {
		for {
			dx, dz := goal.X-p.X, goal.Z-p.Z
			d := math.Hypot(dx, dz)
			if d < .001 {
				break
			}
			if err = wait(ctx, 200*time.Millisecond); err != nil {
				return err
			}
			step := math.Min(d, m.WalkSpeed*.2)
			next := object{"x": p.X + dx/d*step, "z": p.Z + dz/d*step, "yaw": math.Atan2(dx, dz), "moving": true}
			var reply struct {
				Player worldPlayer `json:"player"`
			}
			if err = c.call(ctx, "POST", "/api/world/move", next, &reply); err != nil {
				return err
			}
			p = reply.Player
			moved += step
		}
	}
	if err = wait(ctx, 100*time.Millisecond); err != nil {
		return err
	}
	var reply struct {
		Player worldPlayer `json:"player"`
	}
	if err = c.call(ctx, "POST", "/api/world/move", object{"x": p.X, "z": p.Z, "yaw": p.Yaw, "moving": false}, &reply); err != nil {
		return err
	}
	return c.emit(object{"arrived": true, "requested": dest, "player": reply.Player, "walkedMeters": moved})
}
func (c *client) watch(ctx context.Context, args []string) error {
	if len(args) > 1 {
		return problem("USAGE", "watch [SECONDS]")
	}
	if len(args) == 1 {
		seconds, err := integer(args[0])
		if err != nil || seconds < 0 || seconds > 86400 {
			return problem("BAD_INPUT", "watch seconds must be 0..86400")
		}
		if seconds > 0 {
			var cancel context.CancelFunc
			ctx, cancel = context.WithTimeout(ctx, time.Duration(seconds)*time.Second)
			defer cancel()
		}
	}
	for ctx.Err() == nil {
		err := c.stream(ctx)
		if ctx.Err() != nil {
			return nil
		}
		var apiErr *Error
		if errors.As(err, &apiErr) && apiErr.Status > 0 {
			return err
		}
		if err = c.emit(object{"type": "connection", "connected": false, "retryMs": 1500}); err != nil {
			return err
		}
		if err = wait(ctx, 1500*time.Millisecond); err != nil {
			return nil
		}
	}
	return nil
}
func (c *client) stream(ctx context.Context) error {
	ctx, cancel := context.WithCancel(ctx)
	defer cancel()
	// Server comments arrive every 15s. Reconnect if either response headers or
	// a stalled stream stops making progress, without an overall session timeout.
	timer := time.AfterFunc(35*time.Second, cancel)
	defer timer.Stop()
	res, err := c.request(ctx, "GET", "/api/events?world=2", nil)
	if err != nil {
		return err
	}
	defer res.Body.Close()
	if !strings.HasPrefix(strings.ToLower(res.Header.Get("Content-Type")), "text/event-stream") {
		return &Error{Code: "BAD_RESPONSE", Message: "events endpoint did not return text/event-stream", Status: res.StatusCode}
	}
	scanner := bufio.NewScanner(res.Body)
	scanner.Buffer(make([]byte, 4096), 2<<20)
	data := []string{}
	for scanner.Scan() {
		timer.Reset(35 * time.Second)
		line := scanner.Text()
		if strings.HasPrefix(line, "data:") {
			data = append(data, strings.TrimPrefix(strings.TrimPrefix(line, "data:"), " "))
		}
		if line == "" && len(data) > 0 {
			raw := json.RawMessage(strings.Join(data, "\n"))
			data = nil
			if !json.Valid(raw) {
				return fmt.Errorf("invalid SSE data")
			}
			if err = c.emit(raw); err != nil {
				return err
			}
		}
	}
	return scanner.Err()
}

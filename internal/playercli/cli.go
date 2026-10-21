package playercli

import (
	"context"
	"errors"
	"flag"
	"fmt"
	"io"
	"net/http"
	"os"
	"path/filepath"
	"regexp"
	"strconv"
	"strings"

	"github.com/1994/boss-works-for-me/gameplay"
)

const help = `boss — coding agent player for 今天老板给我打工

Global options (before command):
  --server URL       Game server, including optional gateway prefix
  --profile NAME     Independent identity/session (default: default)
  --config-dir DIR   Private session/action directory
Environment: BOSS_SERVER, BOSS_TOKEN, BOSS_CONFIG_DIR
Output: JSON; watch emits NDJSON. Errors: JSON on stderr, exit 1 (interrupted=130).

Discovery/auth:
  help                         This help
  identities                   Available login mode and demo identities
  login ID                     Demo identity login (production disables it)
  login --stdin                SPI credentials JSON on stdin
  import-session               Game bearer token JSON {"token":"..."} on stdin
  logout                       Revoke current game session
  health                       Server health

Observe/plan:
  observe                      Compact player, team, career, year, nearby world
  state                        Complete ordinary player state
  market | team | ranking      Hireable colleagues / my team / asset ranking
  career | shop | messages     Career / cosmetics / inbox
  map                          Shared landmarks, collision geometry and rules
  world                        Nearby online players (AOI, not all-world radar)
  focus PLAYER                 Locate one online contact
  watch [SECONDS]              Keep player online; world/sync NDJSON (0=until Ctrl+C)

Actions:
  sign COLLEAGUE PRICE          Sign or poach at the exact observed quote
  walk ZONE                    Walk to map landmark, respecting walls and speed
  walk X Z                     Walk to coordinates (meters)
  walk-player PLAYER           Walk near one online contact's current position
  say TEXT                     Nearby bubble, max 40 characters, same rate limit
  emote wave|dance|coffee       Avatar gesture
  highfive PLAYER              Same online/distance/cooldown checks as web
  promote CURRENT_RANK          Request promotion
  buy ITEM PRICE               Buy a cosmetic at the exact observed quote
  equip ITEM KIND player|boss   KIND=shirt|accessory|aura
  avatar URL                   Set own avatar mask
  messages-read                Mark own messages read

Project (same 15-second arcade as web; no automatic play):
  project start                Start/resume; save actions in this profile
  project view                 Currently visible belt items and hit window
  project hit                  Press web's single action button NOW; front item wins
  project finish               Submit recorded actions, server computes rewards

Keep watch running in a separate process while playing. Use different profiles
AND different identities for different players. Never retry a stale price blindly.
`

var profilePattern = regexp.MustCompile(`^[a-zA-Z0-9_-]{1,64}$`)

// Run is separately callable for API-level integration tests; production only
// supplies process I/O and a signal context. No game data is read locally.
func Run(ctx context.Context, args []string, in io.Reader, out, errOut io.Writer) int {
	if len(args) == 0 || args[0] == "help" || args[0] == "--help" || args[0] == "-h" {
		_, _ = io.WriteString(out, help)
		return 0
	}
	fs := flag.NewFlagSet("boss", flag.ContinueOnError)
	fs.SetOutput(io.Discard)
	var server, profile, dir string
	fs.StringVar(&server, "server", os.Getenv("BOSS_SERVER"), "")
	fs.StringVar(&profile, "profile", "default", "")
	fs.StringVar(&dir, "config-dir", os.Getenv("BOSS_CONFIG_DIR"), "")
	if err := fs.Parse(args); err != nil {
		if errors.Is(err, flag.ErrHelp) {
			_, _ = io.WriteString(out, help)
			return 0
		}
		return report(errOut, problem("USAGE", err.Error()+"; boss help"))
	}
	args = fs.Args()
	if len(args) == 0 {
		return report(errOut, problem("USAGE", "missing command; boss help"))
	}
	if args[0] == "help" {
		_, _ = io.WriteString(out, help)
		return 0
	}
	if !profilePattern.MatchString(profile) {
		return report(errOut, problem("BAD_PROFILE", "use 1–64 letters, digits, underscores or hyphens"))
	}
	if dir == "" {
		base, err := os.UserConfigDir()
		if err != nil {
			return report(errOut, err)
		}
		dir = filepath.Join(base, "boss-player")
	}
	if err := os.MkdirAll(dir, 0700); err != nil {
		return report(errOut, err)
	}
	c := &client{dir: dir, profile: profile, in: in, out: out, http: &http.Client{CheckRedirect: noRedirect}}
	var s session
	if err := loadJSON(c.file(".json"), &s); err != nil && !os.IsNotExist(err) {
		return report(errOut, problem("SESSION_FILE", "invalid profile session file"))
	}
	if server == "" {
		server = s.Server
	}
	if server == "" {
		server = "http://127.0.0.1:8787"
	}
	var err error
	c.server, err = normalizeServer(server)
	if err != nil {
		return report(errOut, err)
	}
	// A stored credential is scoped to its server, never forwarded by --server.
	if c.server == s.Server {
		c.token = s.Token
	}
	if token := os.Getenv("BOSS_TOKEN"); token != "" {
		c.token = token
	}
	err = c.dispatch(ctx, args[0], args[1:])
	if err != nil {
		if ctx.Err() != nil {
			report(errOut, problem("CANCELED", "command interrupted; observe state before retrying an action"))
			return 130
		}
		return report(errOut, err)
	}
	return 0
}
func exact(args []string, n int, syntax string) error {
	if len(args) != n {
		return problem("USAGE", syntax)
	}
	return nil
}
func integer(s string) (int, error) {
	n, err := strconv.Atoi(s)
	if err != nil {
		return 0, problem("BAD_INPUT", "expected integer")
	}
	return n, nil
}
func (c *client) dispatch(ctx context.Context, cmd string, args []string) error {
	switch cmd {
	case "login":
		return c.login(ctx, args)
	case "health", "identities":
		if err := exact(args, 0, cmd); err != nil {
			return err
		}
		return c.result(ctx, "GET", "/api/"+cmd, nil)
	case "map":
		if err := exact(args, 0, "map"); err != nil {
			return err
		}
		return c.emit(gameplay.Navigation())
	case "import-session":
		return c.importSession(ctx, args)
	}
	if c.token == "" {
		return problem("NOT_LOGGED_IN", "boss login ID, boss login --stdin, or boss import-session; boss help")
	}
	switch cmd {
	case "logout":
		if err := exact(args, 0, "logout"); err != nil {
			return err
		}
		if err := c.result(ctx, "POST", "/api/logout", object{}); err != nil {
			return err
		}
		var s session
		if loadJSON(c.file(".json"), &s) == nil && s.Server == c.server && s.Token == c.token {
			return os.Remove(c.file(".json"))
		}
		return nil
	case "state", "observe", "market", "team", "ranking", "career", "shop", "messages":
		if err := exact(args, 0, cmd); err != nil {
			return err
		}
		s, err := c.state(ctx)
		if err != nil {
			return err
		}
		switch cmd {
		case "market", "team":
			return c.emit(market(s, cmd == "team"))
		case "ranking":
			return c.emit(s["players"])
		case "career", "shop", "messages":
			return c.emit(s[cmd])
		case "observe":
			var world object
			if err = c.call(ctx, "GET", "/api/world", nil, &world); err != nil {
				return err
			}
			return c.emit(object{"serverTime": s["serverTime"], "me": s["me"], "career": s["career"], "year": s["year"], "team": market(s, true), "projectSkills": s["projectSkills"], "activeRun": s["activeRun"], "unread": s["unread"], "world": world})
		default:
			return c.emit(s)
		}
	case "world":
		if err := exact(args, 0, cmd); err != nil {
			return err
		}
		return c.result(ctx, "GET", "/api/world", nil)
	case "watch":
		return c.watch(ctx, args)
	case "walk", "walk-player":
		return c.walk(ctx, cmd, args)
	case "project":
		return c.project(ctx, args)
	case "sign", "buy":
		if err := exact(args, 2, cmd+" ID EXPECTED_PRICE"); err != nil {
			return err
		}
		price, err := integer(args[1])
		if err != nil {
			return err
		}
		if price <= 0 {
			return problem("BAD_PRICE", "price must be positive")
		}
		if cmd == "buy" {
			return c.result(ctx, "POST", "/api/shop/buy", object{"itemId": args[0], "expectedPrice": price})
		}
		if !profilePattern.MatchString(args[0]) {
			return problem("BAD_INPUT", "invalid colleague ID")
		}
		return c.result(ctx, "POST", "/api/colleagues/"+args[0]+"/sign", object{"expectedPrice": price})
	case "focus", "highfive":
		if err := exact(args, 1, cmd+" PLAYER"); err != nil {
			return err
		}
		return c.result(ctx, "POST", "/api/world/"+cmd, object{"targetId": args[0]})
	case "say", "emote":
		if err := exact(args, 1, cmd+" TEXT_OR_EMOTE"); err != nil {
			return err
		}
		key := "text"
		if cmd == "emote" {
			key = "emote"
		}
		return c.result(ctx, "POST", "/api/world/social", object{key: args[0]})
	case "promote":
		if err := exact(args, 1, "promote CURRENT_RANK"); err != nil {
			return err
		}
		rank, err := integer(args[0])
		if err != nil {
			return err
		}
		return c.result(ctx, "POST", "/api/career/promote", object{"expectedRank": rank})
	case "equip":
		if err := exact(args, 3, "equip ITEM KIND player|boss"); err != nil {
			return err
		}
		return c.result(ctx, "POST", "/api/shop/equip", object{"itemId": args[0], "kind": args[1], "target": args[2]})
	case "avatar":
		if err := exact(args, 1, "avatar URL"); err != nil {
			return err
		}
		return c.result(ctx, "POST", "/api/profile/avatar", object{"avatarUrl": args[0]})
	case "messages-read":
		if err := exact(args, 0, cmd); err != nil {
			return err
		}
		return c.result(ctx, "POST", "/api/messages/read", object{})
	default:
		return problem("USAGE", fmt.Sprintf("unknown command %q; boss help", cmd))
	}
}
func (c *client) importSession(ctx context.Context, args []string) error {
	if err := exact(args, 0, "import-session < session.json"); err != nil {
		return err
	}
	var s session
	if err := decodeStdin(c.in, &s); err != nil {
		return err
	}
	if strings.TrimSpace(s.Token) == "" {
		return problem("BAD_INPUT", "expected {\"token\":\"game bearer token\"} on stdin")
	}
	c.token = s.Token
	state, err := c.state(ctx)
	if err != nil {
		return err
	}
	s.Server = c.server
	s.PlayerID = str(asObject(state["me"])["id"])
	if s.PlayerID == "" {
		return problem("BAD_RESPONSE", "missing player identity")
	}
	if err = atomicJSON(c.file(".json"), s); err != nil {
		return err
	}
	return c.emit(object{"ok": true, "playerId": s.PlayerID, "profile": c.profile, "server": c.server})
}

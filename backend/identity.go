package backend

import (
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"net/http"
	"net/url"
	"regexp"
	"strings"
	"time"
	"unicode"
	"unicode/utf8"

	"github.com/1994/boss-works-for-me/identity"
)

var providerIDPattern = regexp.MustCompile(`^[a-zA-Z0-9][a-zA-Z0-9._-]{0,63}$`)

func (a *App) demoAuth() bool {
	_, ok := a.identityProvider.(*demoIdentityProvider)
	return ok
}

func (a *App) beginBrowserLogin(w http.ResponseWriter, r *http.Request) error {
	p, ok := a.identityProvider.(identity.BrowserProvider)
	if !ok || a.Options.LoginCallbackURL == "" {
		return fail(404, "BROWSER_LOGIN_UNAVAILABLE", "未配置浏览器登录")
	}
	ctx, cancel := context.WithTimeout(r.Context(), 10*time.Second)
	defer cancel()
	login, err := p.BeginLogin(ctx, a.Options.LoginCallbackURL)
	u, parseErr := url.Parse(login.URL)
	if err != nil || login.State == "" || ctx.Err() != nil || parseErr != nil || u.Host == "" || u.User != nil || (u.Scheme != "http" && u.Scheme != "https") {
		return fail(503, "IDENTITY_UNAVAILABLE", "身份服务暂时不可用，请稍后重试")
	}
	respond(w, 200, login)
	return nil
}

func (a *App) login(w http.ResponseWriter, r *http.Request) error {
	body, err := readBody(w, r)
	if err != nil {
		return err
	}
	var c identity.Credentials
	encoded, err := json.Marshal(body)
	if err != nil || json.Unmarshal(encoded, &c) != nil {
		return fail(400, "BAD_CREDENTIALS", "登录凭证格式无效")
	}
	if _, browser := a.identityProvider.(identity.BrowserProvider); browser && c.Code != "" && (a.Options.LoginCallbackURL == "" || c.RedirectURI != a.Options.LoginCallbackURL || c.State == "") {
		return fail(400, "BAD_CALLBACK", "登录回调无效，请重新登录")
	}
	provider := a.identityProvider.ID()
	if !providerIDPattern.MatchString(provider) || (!a.demoAuth() && provider == "demo") {
		return fail(503, "IDENTITY_UNAVAILABLE", "身份服务配置无效")
	}
	// Credential verification happens outside the database transaction. An outage
	// must not hold the game write lock or fall back to Demo authentication.
	ctx, cancel := context.WithTimeout(r.Context(), 10*time.Second)
	defer cancel()
	u, err := a.identityProvider.Authenticate(ctx, c)
	if err == nil {
		err = ctx.Err()
	}
	if err != nil {
		if errors.Is(err, identity.ErrUnauthorized) {
			return fail(401, "IDENTITY_REJECTED", "登录凭证无效或无权进入")
		}
		// Adapter errors can contain upstream tokens. Never log or return them.
		return fail(503, "IDENTITY_UNAVAILABLE", "身份服务暂时不可用，请稍后重试")
	}
	if !validIdentityUser(u) {
		return fail(503, "IDENTITY_PROFILE_INVALID", "身份服务返回的用户资料无效")
	}
	token, player, err := a.Game.loginIdentity(ctx, provider, u)
	if err != nil {
		return err
	}
	a.Broadcast(map[string]any{"kind": "identity", "playerId": player, "at": a.Game.Now()})
	respond(w, 200, map[string]string{"token": token, "playerId": player})
	return nil
}

func validIdentityUser(u identity.User) bool {
	clean := func(s string, max int) bool {
		return utf8.ValidString(s) && utf8.RuneCountInString(s) <= max &&
			strings.TrimSpace(s) == s && !strings.ContainsFunc(s, unicode.IsControl)
	}
	return u.Subject != "" && clean(u.Subject, 512) && u.Name != "" && clean(u.Name, 64) &&
		clean(u.Title, 128) && (u.AvatarURL == nil || validateAvatarURL(*u.AvatarURL) == nil)
}

// Provisioning, profile refresh, initial grant and local session creation are
// one transaction. Upstream identity never controls game IDs, money or skills.
func (g *Game) loginIdentity(ctx context.Context, provider string, u identity.User) (string, string, error) {
	tx, err := g.DB.BeginTx(ctx, nil)
	if err != nil {
		return "", "", err
	}
	defer tx.Rollback()
	var player string
	err = tx.QueryRowContext(ctx, "SELECT player_id FROM identity_bindings WHERE provider=? AND subject=?", provider, u.Subject).Scan(&player)
	if err == sql.ErrNoRows {
		// Demo may only use seeded accounts, never auto-provision arbitrary IDs.
		if provider == "demo" {
			return "", "", fail(401, "IDENTITY_REJECTED", "测试身份不存在")
		}
		player = "p-" + randomID()
		if _, err = tx.ExecContext(ctx, "INSERT INTO players(id,name,title,color,coins,created_at) VALUES(?,?,?,?,?,?)", player, u.Name, u.Title, "#39dbe8", StartCoins, g.Now()); err != nil {
			return "", "", err
		}
		if _, err = tx.ExecContext(ctx, "INSERT INTO identity_bindings(provider,subject,player_id) VALUES(?,?,?)", provider, u.Subject, player); err != nil {
			return "", "", err
		}
		look := Look{Skin: "#f2c7a5", Hair: "#24243f", HairStyle: "short", Shirt: "#39dbe8", Pants: "#24243f", Accessory: "none"}
		data, _ := json.Marshal(look)
		if _, err = tx.ExecContext(ctx, `INSERT INTO colleagues(id,name,title,bio,look,skill_kind,skill_value,self_player_id,sort)
			VALUES(?,?,?,'园区玩家的游戏分身',?,'income',10,?,(SELECT COALESCE(MAX(sort),0)+1 FROM colleagues))`, "c-"+randomID(), u.Name, u.Title, string(data), player); err != nil {
			return "", "", err
		}
		if err = ledger(tx, "player:"+player, StartCoins, "new_player", "", g.Now()); err != nil {
			return "", "", err
		}
		if err = ensureProgress(tx); err != nil {
			return "", "", err
		}
	} else if err != nil {
		return "", "", err
	}
	// Keep cosmetics, clone ownership, trading history and progression intact.
	c, err := scanCol(tx.QueryRowContext(ctx, "SELECT "+colleagueColumns+" FROM colleagues WHERE self_player_id=?", player))
	if err != nil {
		return "", "", err
	}
	if u.AvatarURL != nil {
		c.Look.AvatarURL = *u.AvatarURL
	}
	data, err := json.Marshal(c.Look)
	if err != nil {
		return "", "", err
	}
	if _, err = tx.ExecContext(ctx, "UPDATE players SET name=?,title=? WHERE id=?", u.Name, u.Title, player); err != nil {
		return "", "", err
	}
	if _, err = tx.ExecContext(ctx, "UPDATE colleagues SET name=?,title=?,look=?,version=version+1 WHERE id=?", u.Name, u.Title, string(data), c.ID); err != nil {
		return "", "", err
	}
	token := randomID()
	if _, err = tx.ExecContext(ctx, "INSERT INTO sessions(token,player_id,created_at) VALUES(?,?,?)", token, player, g.Now()); err != nil {
		return "", "", err
	}
	if _, err = tx.ExecContext(ctx, "INSERT INTO identity_sessions(token,provider) VALUES(?,?)", token, provider); err != nil {
		return "", "", err
	}
	if err = bump(tx); err != nil {
		return "", "", err
	}
	if err = ctx.Err(); err != nil {
		return "", "", err
	}
	if err = tx.Commit(); err != nil {
		return "", "", err
	}
	return token, player, nil
}

func (g *Game) authProvider(token, provider string) (string, error) {
	if token == "" {
		return "", fail(401, "NO_SESSION", "请先登录")
	}
	var player string
	err := g.readDB().QueryRow(`SELECT s.player_id FROM sessions s LEFT JOIN identity_sessions i ON i.token=s.token
		WHERE s.token=? AND COALESCE(i.provider,'demo')=?`, token, provider).Scan(&player)
	if err == sql.ErrNoRows {
		return "", fail(401, "BAD_SESSION", "登录已失效，请重新登录")
	}
	return player, err
}

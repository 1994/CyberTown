package backend

import (
	"crypto/rand"
	"database/sql"
	_ "embed"
	"encoding/hex"
	"encoding/json"
	"fmt"
	_ "modernc.org/sqlite"
	"net/url"
	"os"
	"path/filepath"
	"time"
)

//go:embed schema.sql
var schema string

//go:embed seed.json
var seedJSON []byte

type queryer interface {
	Exec(string, ...any) (sql.Result, error)
	Query(string, ...any) (*sql.Rows, error)
	QueryRow(string, ...any) *sql.Row
}
type Game struct {
	DB       *sql.DB
	Now      func() int64
	demoData bool
}

func randomID() string {
	var b [24]byte
	if _, err := rand.Read(b[:]); err != nil {
		panic(err)
	}
	return hex.EncodeToString(b[:])
}

// Open preserves the local Demo API. Deployed services use OpenWithOptions.
func Open(path string, clock func() int64) (*Game, error) {
	return OpenWithOptions(path, clock, DatabaseOptions{DemoData: true})
}

// DatabaseOptions separates disposable fixtures from an intranet world.
// DemoData=false seeds fictional NPCs only; employees are provisioned by the SPI.
type DatabaseOptions struct{ DemoData bool }

func OpenWithOptions(path string, clock func() int64, opts DatabaseOptions) (*Game, error) {
	if clock == nil {
		clock = func() int64 { return time.Now().UnixMilli() }
	}
	var uri string
	if path == ":memory:" {
		uri = "file:boss-" + randomID() + "?mode=memory&cache=shared&"
	} else {
		abs, err := filepath.Abs(path)
		if err != nil {
			return nil, err
		}
		if err = os.MkdirAll(filepath.Dir(abs), 0755); err != nil {
			return nil, err
		}
		u := url.URL{Scheme: "file", Path: abs}
		uri = u.String() + "?"
	}
	db, err := sql.Open("sqlite", uri+"_pragma=foreign_keys(1)&_pragma=busy_timeout(5000)&_txlock=immediate")
	if err != nil {
		return nil, err
	}
	// 单进程连接串行化；跨进程由 SQLite IMMEDIATE 写锁保证一致性。SSE 不持有数据库连接。
	db.SetMaxOpenConns(1)
	db.SetMaxIdleConns(1)
	g := &Game{DB: db, Now: clock, demoData: opts.DemoData}
	if _, err = db.Exec("PRAGMA journal_mode=WAL; PRAGMA synchronous=NORMAL;" + schema); err != nil {
		db.Close()
		return nil, err
	}
	if err = g.seed(false, opts.DemoData); err != nil {
		db.Close()
		return nil, err
	}
	return g, nil
}
func (g *Game) Close() error { return g.DB.Close() }
func (g *Game) transaction(fn func(*sql.Tx) error) error {
	tx, err := g.DB.Begin()
	if err != nil {
		return err
	}
	defer tx.Rollback()
	if err = fn(tx); err != nil {
		return err
	}
	return tx.Commit()
}
func (g *Game) Reset() error {
	if !g.demoData {
		return fail(403, "FORBIDDEN", "正式数据不支持演示重置")
	}
	return g.seed(true, true)
}
func (g *Game) seed(reset, demo bool) error {
	return g.transaction(func(tx *sql.Tx) error {
		var initialized int
		if err := tx.QueryRow("SELECT COUNT(*) FROM meta WHERE key='version'").Scan(&initialized); err != nil {
			return err
		}
		if initialized > 0 && !reset {
			var dataset string
			_ = tx.QueryRow("SELECT value FROM meta WHERE key='dataset'").Scan(&dataset)
			if demo && dataset == "production" {
				return fmt.Errorf("test environment refuses a production database; configure a separate DB_PATH")
			}
			if !demo {
				var fixtures int
				if err := tx.QueryRow("SELECT COUNT(*) FROM identity_bindings WHERE provider IN ('demo','mock')").Scan(&fixtures); err != nil {
					return err
				}
				if fixtures > 0 || dataset == "test" {
					return fmt.Errorf("production refuses a demo/mock database; configure a separate DB_PATH")
				}
				// Older pre-SPI databases have no provider binding or dataset tag.
				ids, err := demoPlayerIDs()
				if err != nil {
					return err
				}
				for id := range ids {
					if err := tx.QueryRow("SELECT COUNT(*) FROM players WHERE id=?", id).Scan(&fixtures); err != nil {
						return err
					}
					if fixtures > 0 {
						return fmt.Errorf("production refuses legacy demo players; configure a separate DB_PATH")
					}
				}
			} else if err := ensureDemoBindings(tx); err != nil {
				return err
			}
			if dataset == "" {
				value := "production"
				if demo {
					value = "test"
				}
				if _, err := tx.Exec("INSERT INTO meta(key,value) VALUES('dataset',?)", value); err != nil {
					return err
				}
			}
			return ensureProgress(tx)
		}
		for _, t := range []string{"identity_sessions", "sessions", "identity_bindings", "trades", "ledger", "project_runs", "social_rewards", "player_items", "player_styles", "year_awards", "player_years", "player_careers", "messages", "colleagues", "players", "meta"} {
			if _, err := tx.Exec("DELETE FROM " + t); err != nil {
				return err
			}
		}
		if _, err := tx.Exec("DELETE FROM sqlite_sequence WHERE name IN ('trades','ledger','messages')"); err != nil {
			return err
		}
		var seed struct {
			Players    []Identity `json:"players"`
			Colleagues []struct {
				ID           string  `json:"id"`
				Name         string  `json:"name"`
				Title        string  `json:"title"`
				Bio          string  `json:"bio"`
				Look         Look    `json:"look"`
				Skill        Skill   `json:"skill"`
				SelfPlayerID *string `json:"selfPlayerId"`
			} `json:"colleagues"`
		}
		if err := json.Unmarshal(seedJSON, &seed); err != nil {
			return err
		}
		now := g.Now()
		for _, p := range seed.Players {
			if !demo {
				continue
			}
			if _, err := tx.Exec("INSERT INTO players(id,name,title,color,coins,created_at) VALUES(?,?,?,?,?,?)", p.ID, p.Name, p.Title, p.Color, StartCoins, now); err != nil {
				return err
			}
			if err := ledger(tx, "player:"+p.ID, StartCoins, "new_player", "", now); err != nil {
				return err
			}
		}
		for i, c := range seed.Colleagues {
			if !demo && c.SelfPlayerID != nil {
				continue
			}
			look, _ := json.Marshal(c.Look)
			if _, err := tx.Exec("INSERT INTO colleagues(id,name,title,bio,look,skill_kind,skill_value,self_player_id,sort) VALUES(?,?,?,?,?,?,?,?,?)", c.ID, c.Name, c.Title, c.Bio, string(look), c.Skill.Kind, c.Skill.Value, c.SelfPlayerID, i); err != nil {
				return err
			}
		}
		if err := message(tx, nil, "system", "新的一天开始了", "人才市场开张！所有同事自愿挂牌，初签价 300 金币。", nil, now); err != nil {
			return err
		}
		if _, err := tx.Exec("INSERT INTO meta(key,value) VALUES('version','1')"); err != nil {
			return err
		}
		dataset := "production"
		if demo {
			dataset = "test"
			if err := ensureDemoBindings(tx); err != nil {
				return err
			}
		}
		if _, err := tx.Exec("INSERT INTO meta(key,value) VALUES('dataset',?)", dataset); err != nil {
			return err
		}
		return ensureProgress(tx)
	})
}
func ledger(q queryer, account string, delta int, reason, ref string, now int64) error {
	if delta == 0 {
		return nil
	}
	_, err := q.Exec("INSERT INTO ledger(account,delta,reason,ref,created_at) VALUES(?,?,?,?,?)", account, delta, reason, ref, now)
	return err
}
func message(q queryer, playerID *string, kind, title, body string, data any, now int64) error {
	var encoded any
	if data != nil {
		b, err := json.Marshal(data)
		if err != nil {
			return err
		}
		encoded = string(b)
	}
	_, err := q.Exec("INSERT INTO messages(player_id,kind,title,body,data,created_at) VALUES(?,?,?,?,?,?)", playerID, kind, title, body, encoded, now)
	return err
}
func bump(q queryer) error {
	_, err := q.Exec("UPDATE meta SET value=CAST(value AS INTEGER)+1 WHERE key='version'")
	return err
}
func version(q queryer) (int64, error) {
	var v int64
	err := q.QueryRow("SELECT CAST(value AS INTEGER) FROM meta WHERE key='version'").Scan(&v)
	return v, err
}
func (g *Game) Version() int64 { v, _ := version(g.DB); return v }
func ptr[T any](value T) *T    { return &value }

type scanner interface{ Scan(...any) error }

const colleagueColumns = "id,name,title,bio,look,skill_kind,skill_value,self_player_id,owner_id,desk_slot,last_price,trades,earnings,version,acquired_at"

func scanCol(row scanner) (Colleague, error) {
	var c Colleague
	var look string
	err := row.Scan(&c.ID, &c.Name, &c.Title, &c.Bio, &look, &c.Skill.Kind, &c.Skill.Value, &c.SelfPlayerID, &c.OwnerID, &c.DeskSlot, &c.LastPrice, &c.Trades, &c.Earnings, &c.Version, &c.AcquiredAt)
	if err != nil {
		return c, err
	}
	if err = json.Unmarshal([]byte(look), &c.Look); err != nil {
		return c, err
	}
	c.Look.AvatarName = c.Name
	c.Price = PriceFor(c.LastPrice)
	return c, nil
}
func colleagues(q queryer) ([]Colleague, error) {
	rows, err := q.Query("SELECT " + colleagueColumns + " FROM colleagues ORDER BY sort")
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []Colleague{}
	for rows.Next() {
		c, e := scanCol(rows)
		if e != nil {
			return nil, e
		}
		out = append(out, c)
	}
	return out, rows.Err()
}
func ownTeam(all []Colleague, id string) []Colleague {
	out := []Colleague{}
	for _, c := range all {
		if same(c.OwnerID, id) {
			out = append(out, c)
		}
	}
	return out
}
func scanRun(row scanner) (Run, error) {
	var r Run
	var skills string
	err := row.Scan(&r.ID, &r.Seed, &r.StartedAt, &r.DurationMS, &skills, &r.Status)
	if err != nil {
		return r, err
	}
	err = json.Unmarshal([]byte(skills), &r.Skills)
	r.Deadline = r.StartedAt + r.DurationMS
	return r, err
}

const runColumns = "id,seed,started_at,duration_ms,skills,status"

func noRow(err error, code, msg string) error {
	if err == sql.ErrNoRows {
		return fail(404, code, msg)
	}
	return err
}

// Login creates a legacy Demo-only session for internal callers. HTTP login
// must authenticate through Options.IdentityProvider, not this helper.
func (g *Game) Login(player string) (string, error) {
	var id string
	if err := g.DB.QueryRow("SELECT id FROM players WHERE id=?", player).Scan(&id); err != nil {
		return "", noRow(err, "NO_PLAYER", "测试身份不存在")
	}
	token := randomID()
	_, err := g.DB.Exec("INSERT INTO sessions(token,player_id,created_at) VALUES(?,?,?)", token, id, g.Now())
	return token, err
}
func (g *Game) Auth(token string) (string, error) {
	if token == "" {
		return "", fail(401, "NO_SESSION", "请先登录")
	}
	var id string
	err := g.DB.QueryRow("SELECT player_id FROM sessions WHERE token=?", token).Scan(&id)
	if err == sql.ErrNoRows {
		return "", fail(401, "BAD_SESSION", "登录已失效，请重新登录")
	}
	return id, err
}
func (g *Game) Logout(token string) error {
	_, err := g.DB.Exec("DELETE FROM sessions WHERE token=?", token)
	return err
}
func (g *Game) MarkRead(player string) error {
	_, err := g.DB.Exec("UPDATE messages SET read_at=? WHERE player_id=? AND read_at IS NULL", g.Now(), player)
	return err
}
func (g *Game) Identities() ([]Identity, error) {
	rows, err := g.DB.Query("SELECT p.id,p.name,p.title,p.color,c.id,COALESCE(c.look,'{}') FROM players p LEFT JOIN colleagues c ON c.self_player_id=p.id ORDER BY p.created_at,p.rowid")
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []Identity{}
	for rows.Next() {
		var p Identity
		var raw string
		if err = rows.Scan(&p.ID, &p.Name, &p.Title, &p.Color, &p.AvatarColleagueID, &raw); err != nil {
			return nil, err
		}
		var look Look
		if err = json.Unmarshal([]byte(raw), &look); err != nil {
			return nil, err
		}
		p.AvatarURL = look.AvatarURL
		out = append(out, p)
	}
	return out, rows.Err()
}
func (g *Game) Snapshot(id string, online map[string]bool) (Snapshot, error) {
	var snap Snapshot
	err := g.transaction(func(tx *sql.Tx) error {
		snap.ServerTime = g.Now()
		var err error
		snap.Version, err = version(tx)
		if err != nil {
			return err
		}
		snap.Colleagues, err = colleagues(tx)
		if err != nil {
			return err
		}
		// Aggregate once: a crowded login must not issue two queries per employee
		// or rescan the whole colleague directory for each wallet snapshot.
		type teamSummary struct{ Size, Value int }
		teams := map[string]teamSummary{}
		clones := map[string]Colleague{}
		for _, c := range snap.Colleagues {
			if c.OwnerID != nil {
				team := teams[*c.OwnerID]
				team.Size++
				if c.LastPrice != nil {
					team.Value += *c.LastPrice
				}
				teams[*c.OwnerID] = team
			}
			if c.SelfPlayerID != nil {
				clones[*c.SelfPlayerID] = c
			}
		}
		snap.Players = []Player{}
		rows, err := tx.Query(`SELECT p.id,p.name,p.title,p.color,p.coins,COALESCE(c.rank,0),
   COALESCE(s.shirt,''),COALESCE(s.accessory,''),COALESCE(s.aura,''),
   COALESCE(s.boss_shirt,''),COALESCE(s.boss_accessory,''),COALESCE(s.boss_aura,'')
   FROM players p LEFT JOIN player_careers c ON c.player_id=p.id
   LEFT JOIN player_styles s ON s.player_id=p.id ORDER BY p.id`)
		if err != nil {
			return err
		}
		names := map[string]string{}
		for rows.Next() {
			var p Player
			if err = rows.Scan(&p.ID, &p.Name, &p.Title, &p.Color, &p.Coins, &p.Rank, &p.Style.Shirt, &p.Style.Accessory, &p.Style.Aura, &p.Style.BossShirt, &p.Style.BossAccessory, &p.Style.BossAura); err != nil {
				rows.Close()
				return err
			}
			p.Online = online[p.ID]
			team := teams[p.ID]
			p.TeamSize, p.TeamValue = team.Size, team.Value
			if clone, ok := clones[p.ID]; ok {
				p.AvatarColleagueID = ptr(clone.ID)
				p.AvatarURL = clone.Look.AvatarURL
			}
			p.Assets = p.Coins + p.TeamValue
			p.RankName = careerLevels[p.Rank].Name
			names[p.ID] = p.Name
			snap.Players = append(snap.Players, p)
		}
		err = rows.Err()
		rows.Close()
		if err != nil {
			return err
		}
		for i := range snap.Colleagues {
			c := &snap.Colleagues[i]
			if c.SelfPlayerID != nil {
				c.Look.AvatarName = names[*c.SelfPlayerID]
			}
		}
		sortPlayers(snap.Players)
		found := false
		for _, p := range snap.Players {
			if p.ID == id {
				snap.Me = p
				found = true
			}
		}
		if !found {
			return fail(401, "NO_PLAYER", "玩家不存在")
		}
		snap.TeamSkills = TeamSkills(ownTeam(snap.Colleagues, id))
		snap.Career, err = readCareer(tx, id)
		if err != nil {
			return err
		}
		snap.ProjectSkills = careerSkills(snap.TeamSkills, snap.Career)
		snap.Year, err = readYear(tx, id)
		if err != nil {
			return err
		}
		snap.Shop, err = readShop(tx, id)
		if err != nil {
			return err
		}
		run, err := scanRun(tx.QueryRow("SELECT "+runColumns+" FROM project_runs WHERE player_id=? AND status='active' ORDER BY started_at DESC LIMIT 1", id))
		if err != nil && err != sql.ErrNoRows {
			return err
		}
		if err == nil && snap.ServerTime <= run.Deadline+FinishGraceMS {
			snap.ActiveRun = &run
		}
		snap.Messages = []Message{}
		rows, err = tx.Query("SELECT id,player_id,kind,title,body,data,created_at,read_at FROM messages WHERE player_id=? OR player_id IS NULL ORDER BY id DESC LIMIT 40", id)
		if err != nil {
			return err
		}
		for rows.Next() {
			var m Message
			var player, data *string
			var read *int64
			if err = rows.Scan(&m.ID, &player, &m.Kind, &m.Title, &m.Body, &data, &m.CreatedAt, &read); err != nil {
				rows.Close()
				return err
			}
			m.Scope = "global"
			m.Read = true
			if player != nil {
				m.Scope = "me"
				m.Read = read != nil
			}
			if data != nil {
				m.Data = json.RawMessage(*data)
			}
			snap.Messages = append(snap.Messages, m)
		}
		err = rows.Err()
		rows.Close()
		if err != nil {
			return err
		}
		if err = tx.QueryRow("SELECT COUNT(*) FROM messages WHERE player_id=? AND read_at IS NULL", id).Scan(&snap.Unread); err != nil {
			return err
		}
		return tx.QueryRow("SELECT COALESCE(SUM(delta),0) FROM ledger WHERE account='system'").Scan(&snap.SystemPool)
	})
	return snap, err
}
func (g *Game) SystemPool() (int, error) {
	var n int
	err := g.DB.QueryRow("SELECT COALESCE(SUM(delta),0) FROM ledger WHERE account='system'").Scan(&n)
	return n, err
}

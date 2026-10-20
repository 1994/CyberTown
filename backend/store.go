package backend

import (
	"crypto/rand"
	"database/sql"
	_ "embed"
	"encoding/hex"
	"encoding/json"
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
	DB  *sql.DB
	Now func() int64
}

func randomID() string {
	var b [24]byte
	if _, err := rand.Read(b[:]); err != nil {
		panic(err)
	}
	return hex.EncodeToString(b[:])
}
func Open(path string, clock func() int64) (*Game, error) {
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
	g := &Game{db, clock}
	if _, err = db.Exec("PRAGMA journal_mode=WAL; PRAGMA synchronous=NORMAL;" + schema); err != nil {
		db.Close()
		return nil, err
	}
	if err = g.seed(false); err != nil {
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
func (g *Game) Reset() error { return g.seed(true) }
func (g *Game) seed(reset bool) error {
	return g.transaction(func(tx *sql.Tx) error {
		var count int
		if err := tx.QueryRow("SELECT COUNT(*) FROM players").Scan(&count); err != nil {
			return err
		}
		if count > 0 && !reset {
			return ensureCareers(tx)
		}
		for _, t := range []string{"sessions", "trades", "ledger", "project_runs", "social_rewards", "player_careers", "messages", "colleagues", "players", "meta"} {
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
			if _, err := tx.Exec("INSERT INTO players(id,name,title,color,coins,created_at) VALUES(?,?,?,?,?,?)", p.ID, p.Name, p.Title, p.Color, StartCoins, now); err != nil {
				return err
			}
			if err := ledger(tx, "player:"+p.ID, StartCoins, "new_player", "", now); err != nil {
				return err
			}
		}
		for i, c := range seed.Colleagues {
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
		return ensureCareers(tx)
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
		return "", fail(401, "NO_SESSION", "请先选择测试身份登录")
	}
	var id string
	err := g.DB.QueryRow("SELECT player_id FROM sessions WHERE token=?", token).Scan(&id)
	if err == sql.ErrNoRows {
		return "", fail(401, "BAD_SESSION", "登录已失效，请重新选择测试身份")
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
	rows, err := g.DB.Query("SELECT p.id,p.name,p.title,p.color,c.id FROM players p LEFT JOIN colleagues c ON c.self_player_id=p.id ORDER BY p.created_at,p.rowid")
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []Identity{}
	for rows.Next() {
		var p Identity
		if err = rows.Scan(&p.ID, &p.Name, &p.Title, &p.Color, &p.AvatarColleagueID); err != nil {
			return nil, err
		}
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
		snap.Players = []Player{}
		rows, err := tx.Query("SELECT id,name,title,color,coins FROM players ORDER BY id")
		if err != nil {
			return err
		}
		for rows.Next() {
			var p Player
			if err = rows.Scan(&p.ID, &p.Name, &p.Title, &p.Color, &p.Coins); err != nil {
				rows.Close()
				return err
			}
			p.Online = online[p.ID]
			for _, c := range snap.Colleagues {
				if same(c.OwnerID, p.ID) {
					p.TeamSize++
					if c.LastPrice != nil {
						p.TeamValue += *c.LastPrice
					}
				}
				if same(c.SelfPlayerID, p.ID) {
					p.AvatarColleagueID = ptr(c.ID)
				}
			}
			p.Assets = p.Coins + p.TeamValue
			snap.Players = append(snap.Players, p)
		}
		err = rows.Err()
		rows.Close()
		if err != nil {
			return err
		}
		for i := range snap.Players {
			career, err := readCareer(tx, snap.Players[i].ID)
			if err != nil {
				return err
			}
			snap.Players[i].Rank = career.Rank
			snap.Players[i].RankName = career.Name
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

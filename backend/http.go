package backend

import (
	"compress/gzip"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"log"
	"math"
	"mime"
	"net/http"
	"os"
	"path/filepath"
	"runtime"
	"strconv"
	"strings"
	"sync"
	"time"

	"github.com/1994/boss-works-for-me/identity"
)

type Options struct {
	StaticDir  string
	AllowReset bool
	// Nil selects the built-in Demo adapter. Inject company SSO or a mock here.
	IdentityProvider identity.Provider
	LoginCallbackURL string
}
type subscriber struct {
	player, token string
	events        chan []byte
	worldEvents   chan []byte
	worldDelta    bool
	worldReady    bool
	view          map[string]WorldPlayer
	nearbyCount   int
	onlineCount   int
}
type App struct {
	Game                      *Game
	Options                   Options
	mu                        sync.Mutex
	worldFlushMu              sync.Mutex
	clients                   map[*subscriber]bool
	closed                    bool
	world                     map[string]WorldPlayer
	socialAt                  map[string]int64
	identityProvider          identity.Provider
	worldFocus                map[string]worldFocus
	worldDirty, presenceDirty bool
	worldStop, worldDone      chan struct{}
}

func NewApp(game *Game, opts Options) *App {
	provider := opts.IdentityProvider
	if provider == nil {
		provider = &demoIdentityProvider{game}
	}
	app := &App{Game: game, Options: opts, identityProvider: provider, clients: map[*subscriber]bool{}, world: map[string]WorldPlayer{}, socialAt: map[string]int64{}, worldFocus: map[string]worldFocus{}, worldStop: make(chan struct{}), worldDone: make(chan struct{})}
	go app.worldLoop()
	return app
}
func (a *App) Online() map[string]bool {
	a.mu.Lock()
	defer a.mu.Unlock()
	out := map[string]bool{}
	for c := range a.clients {
		out[c.player] = true
	}
	return out
}
func (a *App) Broadcast(event any) {
	payload, _ := json.Marshal(map[string]any{"type": "sync", "version": a.Game.Version(), "event": event})
	a.mu.Lock()
	defer a.mu.Unlock()
	for c := range a.clients {
		select {
		case c.events <- payload:
		default:
			close(c.events)
			delete(a.clients, c)
			a.worldDirty, a.presenceDirty = true, true
		}
	}
}
func (a *App) Close() {
	a.mu.Lock()
	if !a.closed {
		a.closed = true
		close(a.worldStop)
		for c := range a.clients {
			close(c.events)
			delete(a.clients, c)
		}
	}
	a.mu.Unlock()
	<-a.worldDone
}
func (a *App) closeToken(token string) {
	a.mu.Lock()
	defer a.mu.Unlock()
	for c := range a.clients {
		if c.token == token {
			close(c.events)
			delete(a.clients, c)
		}
	}
}
func respond(w http.ResponseWriter, status int, data any) {
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	w.Header().Set("Cache-Control", "no-store")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(data)
}

var snapshotCompressors = sync.Pool{New: func() any {
	z, _ := gzip.NewWriterLevel(io.Discard, gzip.BestSpeed)
	return z
}}

// Only full economy snapshots are compressed here. World SSE stays unbuffered.
func respondSnapshot(w http.ResponseWriter, r *http.Request, snap Snapshot) {
	w.Header().Add("Vary", "Accept-Encoding")
	if !acceptsGzip(r.Header.Get("Accept-Encoding")) {
		respond(w, http.StatusOK, snap)
		return
	}
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	w.Header().Set("Cache-Control", "no-store")
	w.Header().Set("Content-Encoding", "gzip")
	w.WriteHeader(http.StatusOK)
	z := snapshotCompressors.Get().(*gzip.Writer)
	z.Reset(w)
	defer func() { _ = z.Close(); z.Reset(io.Discard); snapshotCompressors.Put(z) }()
	_ = json.NewEncoder(z).Encode(snap)
}
func apiError(w http.ResponseWriter, err error) {
	var e *GameError
	if errors.As(err, &e) {
		respond(w, e.Status, map[string]any{"error": e})
		return
	}
	log.Printf("server error: %v", err)
	respond(w, 500, map[string]any{"error": map[string]string{"code": "INTERNAL", "message": "服务器开小差了，请稍后重试"}})
}
func readBody(w http.ResponseWriter, r *http.Request) (map[string]json.RawMessage, error) {
	r.Body = http.MaxBytesReader(w, r.Body, 64*1024)
	defer r.Body.Close()
	var body map[string]json.RawMessage
	dec := json.NewDecoder(r.Body)
	if err := dec.Decode(&body); err != nil {
		if err == io.EOF {
			return map[string]json.RawMessage{}, nil
		}
		var tooLarge *http.MaxBytesError
		if errors.As(err, &tooLarge) {
			return nil, fail(413, "TOO_LARGE", "请求过大")
		}
		return nil, fail(400, "BAD_JSON", "请求体不是合法 JSON 对象")
	}
	if body == nil {
		return nil, fail(400, "BAD_JSON", "请求体必须是 JSON 对象")
	}
	var extra any
	if err := dec.Decode(&extra); err != io.EOF {
		return nil, fail(400, "BAD_JSON", "请求体包含多余数据")
	}
	return body, nil
}
func stringField(body map[string]json.RawMessage, key string) string {
	var s string
	_ = json.Unmarshal(body[key], &s)
	return s
}
func (a *App) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("X-Content-Type-Options", "nosniff")
	w.Header().Set("Referrer-Policy", "same-origin")
	defer func() {
		if err := recover(); err != nil {
			log.Printf("panic: %v", err)
			respond(w, 500, map[string]any{"error": map[string]string{"code": "INTERNAL", "message": "服务器开小差了"}})
		}
	}()
	if err := a.handle(w, r); err != nil {
		apiError(w, err)
	}
}
func (a *App) handle(w http.ResponseWriter, r *http.Request) error {
	path, method := r.URL.Path, r.Method
	if !strings.HasPrefix(path, "/api/") {
		if method != http.MethodGet && method != http.MethodHead {
			return fail(405, "METHOD_NOT_ALLOWED", "不支持的请求方法")
		}
		return a.serveStatic(w, r)
	}
	if path == "/api/health" && method == "GET" {
		respond(w, 200, map[string]any{"ok": true, "time": a.Game.Now(), "version": a.Game.Version(), "runtime": "go", "parallelism": runtime.GOMAXPROCS(0), "dbReaders": a.Game.readDB().Stats().MaxOpenConnections})
		return nil
	}
	if !providerIDPattern.MatchString(a.identityProvider.ID()) || (!a.demoAuth() && a.identityProvider.ID() == "demo") {
		return fail(503, "IDENTITY_UNAVAILABLE", "身份服务配置无效")
	}
	if path == "/api/identities" && method == "GET" {
		_, browser := a.identityProvider.(identity.BrowserProvider)
		if !a.demoAuth() {
			mode, notice := "sso", "请通过公司身份服务登录"
			if a.identityProvider.ID() == "mock" {
				mode, notice = "mock", "本地 Mock 身份（非真实 SSO），请使用配置的测试凭证登录"
			}
			respond(w, 200, map[string]any{"identities": []Identity{}, "notice": notice, "provider": a.identityProvider.ID(), "mode": mode, "browserLogin": browser && a.Options.LoginCallbackURL != "", "loginCallbackUrl": a.Options.LoginCallbackURL})
			return nil
		}
		ids, err := a.Game.demoIdentities()
		if err != nil {
			return err
		}
		respond(w, 200, map[string]any{"identities": ids, "notice": "测试身份登录（演示用，非真实 SSO）", "provider": "demo", "mode": "demo"})
		return nil
	}
	if path == "/api/auth/login" && method == "POST" {
		return a.login(w, r)
	}
	if path == "/api/auth/browser" && method == "POST" {
		return a.beginBrowserLogin(w, r)
	}
	if path == "/api/auth/test-login" && method == "POST" {
		if !a.demoAuth() {
			return fail(404, "NOT_FOUND", "测试登录未开启")
		}
		return a.login(w, r)
	}
	if path == "/api/demo/reset" && method == "POST" {
		if !a.Options.AllowReset || !a.demoAuth() {
			return fail(403, "FORBIDDEN", "演示重置未开启（ALLOW_DEMO_RESET=1）")
		}
		if err := a.Game.Reset(); err != nil {
			return err
		}
		a.mu.Lock()
		a.world = map[string]WorldPlayer{}
		a.socialAt = map[string]int64{}
		a.mu.Unlock()
		a.Broadcast(map[string]any{"kind": "reset", "at": a.Game.Now()})
		respond(w, 200, map[string]bool{"ok": true})
		return nil
	}
	token := strings.TrimPrefix(r.Header.Get("Authorization"), "Bearer ")
	if !strings.HasPrefix(r.Header.Get("Authorization"), "Bearer ") {
		token = ""
	}
	if path == "/api/events" && token == "" {
		token = r.URL.Query().Get("token")
	}
	player, err := a.Game.authProvider(token, a.identityProvider.ID())
	if err != nil {
		return err
	}
	if strings.HasPrefix(path, "/api/tea/") {
		return a.handleTea(w, r, player)
	}
	if strings.HasPrefix(path, "/api/world") {
		return a.handleWorld(w, r, player)
	}
	switch {
	case path == "/api/events" && method == "GET":
		return a.events(w, r, player, token)
	case path == "/api/project" && method == "GET":
		view, err := a.Game.ProjectView(player)
		if err != nil {
			return err
		}
		respond(w, 200, view)
	case path == "/api/logout" && method == "POST":
		if err = a.Game.Logout(token); err != nil {
			return err
		}
		a.closeToken(token)
		a.Broadcast(map[string]any{"kind": "presence", "at": a.Game.Now()})
		respond(w, 200, map[string]bool{"ok": true})
	case path == "/api/state" && method == "GET":
		snap, err := a.Game.Snapshot(player, a.Online())
		if err != nil {
			return err
		}
		respondSnapshot(w, r, snap)
	case path == "/api/profile/avatar" && method == "POST":
		body, err := readBody(w, r)
		if err != nil {
			return err
		}
		var avatarURL string
		if raw, ok := body["avatarUrl"]; !ok || string(raw) == "null" || json.Unmarshal(raw, &avatarURL) != nil {
			return fail(400, "BAD_AVATAR", "请提交 avatarUrl 字符串，空字符串可还原默认头像")
		}
		if err = a.Game.SetAvatar(player, avatarURL); err != nil {
			return err
		}
		a.Broadcast(map[string]any{"kind": "avatar", "playerId": player, "at": a.Game.Now()})
		respond(w, 200, map[string]bool{"ok": true})
	case path == "/api/messages/read" && method == "POST":
		if err = a.Game.MarkRead(player); err != nil {
			return err
		}
		respond(w, 200, map[string]bool{"ok": true})
	case path == "/api/career" && method == "GET":
		career, err := a.Game.Career(player)
		if err != nil {
			return err
		}
		respond(w, 200, career)
	case path == "/api/shop/buy" && method == "POST":
		body, err := readBody(w, r)
		if err != nil {
			return err
		}
		var price *int
		if json.Unmarshal(body["expectedPrice"], &price) != nil || price == nil || *price <= 0 {
			return fail(400, "BAD_PRICE", "请提交当前道具价格")
		}
		if err = a.Game.BuyItem(player, stringField(body, "itemId"), *price); err != nil {
			return err
		}
		a.Broadcast(map[string]any{"kind": "shop", "playerId": player, "at": a.Game.Now()})
		respond(w, 200, map[string]bool{"ok": true})
	case path == "/api/shop/equip" && method == "POST":
		body, err := readBody(w, r)
		if err != nil {
			return err
		}
		if err = a.Game.EquipItem(player, stringField(body, "itemId"), stringField(body, "kind"), stringField(body, "target")); err != nil {
			return err
		}
		a.Broadcast(map[string]any{"kind": "style", "playerId": player, "at": a.Game.Now()})
		respond(w, 200, map[string]bool{"ok": true})
	case path == "/api/career/promote" && method == "POST":
		body, err := readBody(w, r)
		if err != nil {
			return err
		}
		var expectedRank *int
		if json.Unmarshal(body["expectedRank"], &expectedRank) != nil || expectedRank == nil {
			return fail(400, "BAD_RANK", "请提交当前职级")
		}
		promotion, career, err := a.Game.Promote(player, *expectedRank)
		if err != nil {
			return err
		}
		a.Broadcast(promotion)
		respond(w, 200, map[string]any{"promotion": promotion, "career": career})
	case strings.HasPrefix(path, "/api/colleagues/") && strings.HasSuffix(path, "/sign") && method == "POST":
		id := strings.TrimSuffix(strings.TrimPrefix(path, "/api/colleagues/"), "/sign")
		if id == "" || strings.Contains(id, "/") {
			return fail(404, "NO_COLLEAGUE", "该同事不存在")
		}
		body, err := readBody(w, r)
		if err != nil {
			return err
		}
		var price int
		if err = json.Unmarshal(body["expectedPrice"], &price); err != nil || price <= 0 || int64(price) > 9007199254740991 {
			return fail(400, "BAD_PRICE", "请提交当前显示的整数报价后重试")
		}
		trade, err := a.Game.Sign(player, id, price)
		if err != nil {
			return err
		}
		a.Broadcast(trade)
		coins, err := a.Game.Balance(player)
		if err != nil {
			return err
		}
		respond(w, 200, map[string]any{"trade": trade, "coins": coins})
	case path == "/api/project/start" && method == "POST":
		run, err := a.Game.StartProject(player)
		if err != nil {
			return err
		}
		respond(w, 200, map[string]any{"run": run, "serverTime": a.Game.Now()})
	case path == "/api/project/finish" && method == "POST":
		body, err := readBody(w, r)
		if err != nil {
			return err
		}
		var raw []json.RawMessage
		data := body["actions"]
		if len(data) == 0 || data[0] != '[' || json.Unmarshal(data, &raw) != nil || len(raw) > MaxActions {
			return fail(400, "BAD_ACTIONS", "上报数据格式或次数异常")
		}
		actions := make([]Action, 0, len(raw))
		for _, item := range raw {
			var in struct {
				TaskID *int     `json:"taskId"`
				T      *float64 `json:"t"`
			}
			if json.Unmarshal(item, &in) != nil || in.TaskID == nil || in.T == nil {
				actions = append(actions, Action{-1, math.NaN()})
			} else {
				actions = append(actions, Action{*in.TaskID, *in.T})
			}
		}
		out, err := a.Game.FinishProject(player, stringField(body, "runId"), actions)
		if err != nil {
			return err
		}
		a.Broadcast(map[string]any{"kind": "project", "playerId": player, "total": out.Result.Total, "at": a.Game.Now()})
		respond(w, 200, out)
	case path == "/api/audit" && method == "GET":
		audit, err := a.Game.Audit()
		if err != nil {
			return err
		}
		pool, err := a.Game.SystemPool()
		if err != nil {
			return err
		}
		respond(w, 200, map[string]any{"audit": audit, "systemPool": pool})
	default:
		return fail(404, "NOT_FOUND", "接口不存在")
	}
	return nil
}
func (a *App) events(w http.ResponseWriter, r *http.Request, player, token string) error {
	flusher, ok := w.(http.Flusher)
	if !ok {
		return fail(500, "STREAM_UNAVAILABLE", "连接不支持实时通知")
	}
	c := &subscriber{player: player, token: token, events: make(chan []byte, 32), worldEvents: make(chan []byte, 1), worldDelta: r.URL.Query().Get("world") == "2", view: map[string]WorldPlayer{}}
	a.mu.Lock()
	if a.closed {
		a.mu.Unlock()
		return fail(503, "CLOSED", "服务正在关闭")
	}
	a.clients[c] = true
	a.ensureWorldLocked(player)
	a.mu.Unlock()
	defer func() {
		a.mu.Lock()
		delete(a.clients, c)
		a.mu.Unlock()
		a.presenceChanged()
	}()
	w.Header().Set("Content-Type", "text/event-stream; charset=utf-8")
	w.Header().Set("Cache-Control", "no-cache, no-transform")
	w.Header().Set("Connection", "keep-alive")
	w.Header().Set("X-Accel-Buffering", "no")
	hello, _ := json.Marshal(map[string]any{"type": "hello", "version": a.Game.Version(), "serverTime": a.Game.Now()})
	if _, err := fmt.Fprintf(w, "retry: 1500\n\ndata: %s\n\n", hello); err != nil {
		return nil
	}
	flusher.Flush()
	a.presenceChanged()
	ticker := time.NewTicker(15 * time.Second)
	defer ticker.Stop()
	controller := http.NewResponseController(w)
	for {
		select {
		case <-r.Context().Done():
			return nil
		case msg, ok := <-c.events:
			if !ok {
				return nil
			}
			_ = controller.SetWriteDeadline(time.Now().Add(10 * time.Second))
			if _, err := fmt.Fprintf(w, "data: %s\n\n", msg); err != nil {
				return nil
			}
			flusher.Flush()
		case msg := <-c.worldEvents:
			_ = controller.SetWriteDeadline(time.Now().Add(10 * time.Second))
			if _, err := fmt.Fprintf(w, "data: %s\n\n", msg); err != nil {
				return nil
			}
			flusher.Flush()
		case <-ticker.C:
			_ = controller.SetWriteDeadline(time.Now().Add(10 * time.Second))
			if _, err := fmt.Fprint(w, ": ping\n\n"); err != nil {
				return nil
			}
			flusher.Flush()
		}
	}
}
func inside(root, path string) bool {
	rel, err := filepath.Rel(root, path)
	return err == nil && rel != ".." && !strings.HasPrefix(rel, ".."+string(filepath.Separator)) && !filepath.IsAbs(rel)
}
func (a *App) serveStatic(w http.ResponseWriter, r *http.Request) error {
	if a.Options.StaticDir == "" {
		return fail(404, "API_ONLY", "当前服务仅提供 API，请访问独立前端地址")
	}
	root, err := filepath.Abs(a.Options.StaticDir)
	if err != nil {
		return err
	}
	root, err = filepath.EvalSymlinks(root)
	if err != nil {
		return fail(404, "NOT_FOUND", "前端尚未构建")
	}
	file := filepath.Join(root, filepath.FromSlash(r.URL.Path))
	if !inside(root, file) {
		return fail(404, "NOT_FOUND", "未找到")
	}
	stat, err := os.Stat(file)
	if err != nil || stat.IsDir() {
		if filepath.Ext(r.URL.Path) != "" {
			return fail(404, "NOT_FOUND", "未找到")
		}
		file = filepath.Join(root, "index.html")
	}
	real, err := filepath.EvalSymlinks(file)
	if err != nil || !inside(root, real) {
		return fail(404, "NOT_FOUND", "未找到")
	}
	// Precompressed build assets save bandwidth without request-time compression
	// CPU. Mutable config/HTML and SSE keep their existing caching/stream behavior.
	compressedAsset := false
	if ext := filepath.Ext(file); ext == ".js" || ext == ".css" {
		w.Header().Add("Vary", "Accept-Encoding")
		if acceptsGzip(r.Header.Get("Accept-Encoding")) && r.Header.Get("Range") == "" {
			if compressed, err := filepath.EvalSymlinks(real + ".gz"); err == nil && inside(root, compressed) {
				if info, err := os.Stat(compressed); err == nil && info.Mode().IsRegular() {
					real = compressed
					compressedAsset = true
				}
			}
		}
	}
	f, err := os.Open(real)
	if err != nil {
		return fail(404, "NOT_FOUND", "未找到")
	}
	defer f.Close()
	stat, err = f.Stat()
	if err != nil || !stat.Mode().IsRegular() {
		return fail(404, "NOT_FOUND", "未找到")
	}
	if compressedAsset {
		w.Header().Set("Content-Encoding", "gzip")
		w.Header().Set("Content-Length", strconv.FormatInt(stat.Size(), 10))
	}
	if t := mime.TypeByExtension(filepath.Ext(file)); t != "" {
		w.Header().Set("Content-Type", t)
	}
	w.Header().Set("Cache-Control", "no-cache")
	if strings.HasPrefix(r.URL.Path, "/assets/") {
		w.Header().Set("Cache-Control", "public, max-age=31536000, immutable")
	}
	http.ServeContent(w, r, stat.Name(), stat.ModTime(), f)
	return nil
}

func acceptsGzip(header string) bool {
	wildcard := false
	for _, value := range strings.Split(header, ",") {
		parts := strings.Split(value, ";")
		coding := strings.ToLower(strings.TrimSpace(parts[0]))
		if coding != "gzip" && coding != "*" {
			continue
		}
		quality := 1.0
		for _, param := range parts[1:] {
			key, value, ok := strings.Cut(strings.TrimSpace(param), "=")
			if ok && key == "q" {
				q, err := strconv.ParseFloat(value, 64)
				if err != nil || !finite(q) || q < 0 || q > 1 {
					quality = 0
				} else {
					quality = q
				}
			}
		}
		if coding == "gzip" {
			return quality > 0
		}
		wildcard = quality > 0
	}
	return wildcard
}

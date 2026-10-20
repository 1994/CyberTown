package backend

import (
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
	"strings"
	"sync"
	"time"
)

type Options struct {
	StaticDir  string
	AllowReset bool
}
type subscriber struct {
	player, token string
	events        chan []byte
}
type App struct {
	Game     *Game
	Options  Options
	mu       sync.Mutex
	clients  map[*subscriber]bool
	closed   bool
	world    map[string]WorldPlayer
	socialAt map[string]int64
}

func NewApp(game *Game, opts Options) *App {
	return &App{Game: game, Options: opts, clients: map[*subscriber]bool{}, world: map[string]WorldPlayer{}, socialAt: map[string]int64{}}
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
		}
	}
}
func (a *App) Close() {
	a.mu.Lock()
	defer a.mu.Unlock()
	a.closed = true
	for c := range a.clients {
		close(c.events)
		delete(a.clients, c)
	}
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
		respond(w, 200, map[string]any{"ok": true, "time": a.Game.Now(), "version": a.Game.Version(), "runtime": "go"})
		return nil
	}
	if path == "/api/identities" && method == "GET" {
		ids, err := a.Game.Identities()
		if err != nil {
			return err
		}
		respond(w, 200, map[string]any{"identities": ids, "notice": "测试身份登录（演示用，非真实 SSO）"})
		return nil
	}
	if path == "/api/auth/test-login" && method == "POST" {
		body, err := readBody(w, r)
		if err != nil {
			return err
		}
		id := stringField(body, "playerId")
		token, err := a.Game.Login(id)
		if err != nil {
			return err
		}
		respond(w, 200, map[string]string{"token": token, "playerId": id})
		return nil
	}
	if path == "/api/demo/reset" && method == "POST" {
		if !a.Options.AllowReset {
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
	player, err := a.Game.Auth(token)
	if err != nil {
		return err
	}
	if strings.HasPrefix(path, "/api/world") {
		return a.handleWorld(w, r, player)
	}
	switch {
	case path == "/api/events" && method == "GET":
		return a.events(w, r, player, token)
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
		respond(w, 200, snap)
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
		snap, err := a.Game.Snapshot(player, a.Online())
		if err != nil {
			return err
		}
		respond(w, 200, map[string]any{"trade": trade, "coins": snap.Me.Coins})
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
	c := &subscriber{player, token, make(chan []byte, 32)}
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
		a.Broadcast(map[string]any{"kind": "presence", "at": a.Game.Now()})
		a.broadcastWorld()
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
	a.Broadcast(map[string]any{"kind": "presence", "at": a.Game.Now()})
	a.broadcastWorld()
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
		return fail(404, "NOT_FOUND", "前端尚未构建，请运行 npm run build 或访问 Vite 开发地址")
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
	f, err := os.Open(real)
	if err != nil {
		return fail(404, "NOT_FOUND", "未找到")
	}
	defer f.Close()
	stat, err = f.Stat()
	if err != nil || !stat.Mode().IsRegular() {
		return fail(404, "NOT_FOUND", "未找到")
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

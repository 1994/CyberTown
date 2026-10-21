package server

import (
	"net/http"
	"strings"
)

// CORS is opt-in, exact-origin, bearer-only. No credentialed cookies, wildcard
// origins or Private-Network-Access bypass. Public development uses test APIs.
func cors(next http.Handler, origins []string) http.Handler {
	// A same-origin TLS gateway may forward an internal Host and plain HTTP.
	// With no allowlist, emit no CORS headers; the browser enforces same-origin.
	if len(origins) == 0 {
		return next
	}
	allowed := map[string]bool{}
	for _, origin := range origins {
		allowed[origin] = true
	}
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if !strings.HasPrefix(r.URL.Path, "/api/") {
			next.ServeHTTP(w, r)
			return
		}
		w.Header().Add("Vary", "Origin")
		origin := r.Header.Get("Origin")
		// Same-origin reverse proxies need no CORS configuration.
		scheme := "http"
		if r.TLS != nil {
			scheme = "https"
		}
		same := origin == scheme+"://"+r.Host
		if origin != "" && !same && !allowed[origin] {
			http.Error(w, "origin not allowed", http.StatusForbidden)
			return
		}
		if allowed[origin] {
			w.Header().Set("Access-Control-Allow-Origin", origin)
		}
		if r.Method == http.MethodOptions {
			method := r.Header.Get("Access-Control-Request-Method")
			if method != "GET" && method != "POST" {
				http.Error(w, "method not allowed", http.StatusForbidden)
				return
			}
			for _, header := range strings.Split(r.Header.Get("Access-Control-Request-Headers"), ",") {
				h := strings.ToLower(strings.TrimSpace(header))
				if h != "" && h != "authorization" && h != "content-type" {
					http.Error(w, "header not allowed", http.StatusForbidden)
					return
				}
			}
			w.Header().Add("Vary", "Access-Control-Request-Method")
			w.Header().Add("Vary", "Access-Control-Request-Headers")
			w.Header().Set("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
			w.Header().Set("Access-Control-Allow-Headers", "Authorization, Content-Type")
			w.Header().Set("Access-Control-Max-Age", "600")
			w.WriteHeader(http.StatusNoContent)
			return
		}
		next.ServeHTTP(w, r)
	})
}

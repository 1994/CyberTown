package backend

import (
	"bytes"
	"compress/gzip"
	"encoding/json"
	"io"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func TestSnapshotCompressionPreservesPrivateState(t *testing.T) {
	g := performanceGame(t, 1000)
	snap, err := g.Snapshot("load-0000", nil)
	if err != nil {
		t.Fatal(err)
	}
	plain, _ := json.Marshal(snap)
	for _, encoding := range []string{"", "gzip", "gzip;q=0"} {
		r := httptest.NewRequest("GET", "/api/state", nil)
		r.Header.Set("Accept-Encoding", encoding)
		w := httptest.NewRecorder()
		respondSnapshot(w, r, snap)
		body := w.Body.Bytes()
		if encoding == "gzip" {
			if w.Header().Get("Content-Encoding") != "gzip" {
				t.Fatal("missing gzip header")
			}
			t.Logf("1000-player snapshot JSON: raw=%d bytes gzip=%d bytes", len(plain), len(body))
			z, err := gzip.NewReader(bytes.NewReader(body))
			if err != nil {
				t.Fatal(err)
			}
			body, err = io.ReadAll(z)
			z.Close()
			if err != nil {
				t.Fatal(err)
			}
		} else if w.Header().Get("Content-Encoding") != "" {
			t.Fatal("client refused gzip")
		}
		if !bytes.Equal(bytes.TrimSpace(body), plain) || w.Header().Get("Cache-Control") != "no-store" || w.Header().Get("Vary") != "Accept-Encoding" {
			t.Fatal("snapshot changed or became cacheable")
		}
	}
}

func TestPrecompressedAssetsNegotiateWithoutChangingContent(t *testing.T) {
	e := setup(t)
	root := t.TempDir()
	if err := os.Mkdir(filepath.Join(root, "assets"), 0755); err != nil {
		t.Fatal(err)
	}
	content := []byte(strings.Repeat("const greeting='hello';\n", 100))
	file := filepath.Join(root, "assets", "test.js")
	if err := os.WriteFile(file, content, 0644); err != nil {
		t.Fatal(err)
	}
	var compressed bytes.Buffer
	z := gzip.NewWriter(&compressed)
	_, _ = z.Write(content)
	_ = z.Close()
	if err := os.WriteFile(file+".gz", compressed.Bytes(), 0644); err != nil {
		t.Fatal(err)
	}
	e.app.Options.StaticDir = root
	for _, encoding := range []string{"", "br, gzip", "gzip;q=0", "*;q=1, gzip;q=0", "gzip;q=NaN", "*"} {
		r := httptest.NewRequest("GET", "/assets/test.js", nil)
		r.Header.Set("Accept-Encoding", encoding)
		w := httptest.NewRecorder()
		e.app.ServeHTTP(w, r)
		if w.Code != 200 {
			t.Fatal(w.Code)
		}
		data := w.Body.Bytes()
		if w.Header().Get("Content-Encoding") == "gzip" {
			reader, err := gzip.NewReader(bytes.NewReader(data))
			if err != nil {
				t.Fatal(err)
			}
			data, err = io.ReadAll(reader)
			reader.Close()
			if err != nil {
				t.Fatal(err)
			}
		}
		want := encoding == "br, gzip" || encoding == "*"
		if got := w.Header().Get("Content-Encoding") == "gzip"; got != want {
			t.Fatalf("%q: gzip=%v", encoding, got)
		}
		if !bytes.Equal(data, content) || !strings.Contains(w.Header().Get("Content-Type"), "javascript") || w.Header().Get("Vary") != "Accept-Encoding" {
			t.Fatalf("changed response %q", encoding)
		}
	}
	// Byte ranges address the original representation; HEAD has no body.
	for _, method := range []string{"GET", "HEAD"} {
		r := httptest.NewRequest(method, "/assets/test.js", nil)
		r.Header.Set("Accept-Encoding", "gzip")
		r.Header.Set("Range", "bytes=0-9")
		w := httptest.NewRecorder()
		e.app.ServeHTTP(w, r)
		if w.Code != 206 || w.Header().Get("Content-Encoding") != "" {
			t.Fatal("range representation changed", w.Code)
		}
		if method == "GET" && !bytes.Equal(w.Body.Bytes(), content[:10]) {
			t.Fatal("wrong range")
		}
		if method == "HEAD" && w.Body.Len() != 0 {
			t.Fatal("HEAD returned a body")
		}
	}
	// A malicious/out-of-root compressed sibling cannot bypass static isolation.
	outside := filepath.Join(t.TempDir(), "outside.gz")
	_ = os.WriteFile(outside, []byte("private"), 0644)
	_ = os.Remove(file + ".gz")
	if err := os.Symlink(outside, file+".gz"); err != nil {
		t.Fatal(err)
	}
	r := httptest.NewRequest("GET", "/assets/test.js", nil)
	r.Header.Set("Accept-Encoding", "gzip")
	w := httptest.NewRecorder()
	e.app.ServeHTTP(w, r)
	if !bytes.Equal(w.Body.Bytes(), content) || w.Header().Get("Content-Encoding") != "" {
		t.Fatal("compressed symlink escaped root")
	}
}

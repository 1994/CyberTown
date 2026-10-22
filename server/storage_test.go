package server

import (
	"github.com/1994/boss-works-for-me/storage/sqlite"
	"os"
	"path/filepath"
	"testing"
)

func TestStorageInjectionAndMockFile(t *testing.T) {
	st, e := sqlite.Open(":memory:")
	if e != nil {
		t.Fatal(e)
	}
	c := Config{Environment: "test", Storage: st, MockDataFile: "../examples/storage/tea-team.json"}
	r, e := New(c, nil)
	if e != nil {
		t.Fatal(e)
	}
	defer r.Close()
	h, e := r.Game.TownHome("wang", "wang")
	if e != nil || h.Coins != 5000 || len(h.Clones) != 2 {
		t.Fatalf("mock injection %v %+v", e, h)
	}
}
func TestMockFileRejectedBeforeProductionDatabase(t *testing.T) {
	c := config(t)
	c.MockDataFile = "../examples/storage/tea-team.json"
	if _, e := New(c, provider()); e == nil {
		t.Fatal("accepted production mock")
	}
	if _, e := os.Stat(c.DatabasePath); !os.IsNotExist(e) {
		t.Fatal("opened production DB")
	}
}
func TestMockFileFailureClosesInjectedStore(t *testing.T) {
	st, e := sqlite.Open(filepath.Join(t.TempDir(), "mock.db"))
	if e != nil {
		t.Fatal(e)
	}
	c := Config{Environment: "test", Storage: st, MockDataFile: "missing-scenario.json"}
	if _, e = New(c, nil); e == nil {
		t.Fatal("missing file silently accepted")
	}
	var n int
	if e = st.Writer().QueryRow("SELECT 1").Scan(&n); e == nil {
		t.Fatal("failed runtime leaked storage")
	}
}

func TestStorageInjectionStartupColleagueFile(t *testing.T) {
	st, err := sqlite.Open(":memory:")
	if err != nil {
		t.Fatal(err)
	}
	r, err := New(Config{Environment: "test", Storage: st, MockDataFile: "../examples/storage/colleagues.json"}, nil)
	if err != nil {
		t.Fatal(err)
	}
	defer r.Close()
	h, err := r.Game.TownEnter("wang", "wang")
	if err != nil {
		t.Fatal(err)
	}
	count := 0
	for _, c := range h.Candidates {
		if c.PlayerID == "mock-design" || c.PlayerID == "mock-engineer" || c.PlayerID == "mock-operations" {
			count++
		}
	}
	if count != 3 {
		t.Fatalf("expected 3 startup colleagues, got %d", count)
	}
}

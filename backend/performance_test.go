package backend

import (
	"fmt"
	"github.com/1994/boss-works-for-me/storage"
	"path/filepath"
	"testing"
)

// Disk WAL and populated directories exercise the actual snapshot path rather
// than the four-user demo. Identities here are entirely synthetic.
func performanceGame(b testing.TB, count int) *Game {
	b.Helper()
	g, err := OpenWithOptions(filepath.Join(b.TempDir(), "performance.db"), nil, DatabaseOptions{})
	if err != nil {
		b.Fatal(err)
	}
	b.Cleanup(func() { g.Close() })
	err = g.transaction(func(tx storage.Tx) error {
		for i := 0; i < count; i++ {
			id := fmt.Sprintf("load-%04d", i)
			if _, err := tx.Exec("INSERT INTO players(id,name,title,color,coins,created_at) VALUES(?,?,?,'#55ddcc',600,0)", id, "假玩家"+id, "测试"); err != nil {
				return err
			}
		}
		if _, err := tx.Exec(`INSERT INTO colleagues(id,name,title,bio,look,skill_kind,skill_value,self_player_id,sort)
			SELECT 'clone-'||id,name,title,'benchmark only','{"skin":"#f1c9a0","hair":"#27272c","shirt":"#52b4aa","pants":"#303648"}', 'income',10,id,100 FROM players`); err != nil {
			return err
		}
		return ensureProgress(tx)
	})
	if err != nil {
		b.Fatal(err)
	}
	return g
}

func BenchmarkSnapshotDirectory(b *testing.B) {
	for _, n := range []int{100, 1000} {
		b.Run(fmt.Sprint(n), func(b *testing.B) {
			g := performanceGame(b, n)
			b.ReportAllocs()
			b.ResetTimer()
			b.RunParallel(func(pb *testing.PB) {
				for pb.Next() {
					s, err := g.Snapshot("load-0000", nil)
					if err != nil || len(s.Players) != n {
						b.Errorf("snapshot: count=%d err=%v", len(s.Players), err)
						return
					}
				}
			})
		})
	}
}

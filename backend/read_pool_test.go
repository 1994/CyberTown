package backend

import (
	"path/filepath"
	"testing"
	"time"
)

func TestWALReadersDoNotWaitForWalletWriter(t *testing.T) {
	g, err := Open(filepath.Join(t.TempDir(), "wal.db"), nil)
	if err != nil {
		t.Fatal(err)
	}
	defer g.Close()
	token, err := g.Login("wang")
	if err != nil {
		t.Fatal(err)
	}
	tx, err := g.DB.Begin()
	if err != nil {
		t.Fatal(err)
	}
	defer tx.Rollback()
	if _, err := tx.Exec("UPDATE players SET coins=999 WHERE id='wang'"); err != nil {
		t.Fatal(err)
	}
	done := make(chan error, 1)
	go func() {
		id, err := g.authProvider(token, "demo")
		if err == nil && id != "wang" {
			err = fail(500, "TEST", "wrong identity")
		}
		if err == nil {
			var s Snapshot
			s, err = g.Snapshot(id, nil)
			if err == nil && s.Me.Coins != 600 {
				err = fail(500, "TEST", "uncommitted wallet leaked")
			}
		}
		done <- err
	}()
	select {
	case err := <-done:
		if err != nil {
			t.Fatal(err)
		}
	case <-time.After(2 * time.Second):
		tx.Rollback() // Unblock a regressed single-connection implementation.
		<-done
		t.Fatal("authentication/snapshot queued behind an unrelated wallet writer")
	}
	if err := tx.Commit(); err != nil {
		t.Fatal(err)
	}
	s, err := g.Snapshot("wang", nil)
	if err != nil || s.Me.Coins != 999 {
		t.Fatalf("committed wallet not visible: coins=%d err=%v", s.Me.Coins, err)
	}
	if _, err := g.readDB().Exec("UPDATE players SET coins=0"); err == nil {
		t.Fatal("read pool accepted a write")
	}
}

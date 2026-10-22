package backend

import (
	"context"
	"database/sql"
	"errors"
	"path/filepath"
	"testing"

	"github.com/1994/boss-works-for-me/storage"
	"github.com/1994/boss-works-for-me/storage/sqlite"
)

type spiPool struct {
	delegate    storage.Pool
	beginCalls  int
	execCalls   int
	rollbacks   int
	beginErr    error
	failCommits int
}

func (p *spiPool) Exec(q string, a ...any) (sql.Result, error) {
	p.execCalls++
	return p.delegate.Exec(q, a...)
}
func (p *spiPool) Query(q string, a ...any) (storage.Rows, error) {
	return p.delegate.Query(q, a...)
}
func (p *spiPool) QueryRow(q string, a ...any) storage.Row { return p.delegate.QueryRow(q, a...) }
func (p *spiPool) Stats() sql.DBStats                      { return p.delegate.Stats() }
func (p *spiPool) Begin() (storage.Tx, error) {
	p.beginCalls++
	if p.beginErr != nil {
		return nil, p.beginErr
	}
	tx, err := p.delegate.Begin()
	if err != nil {
		return nil, err
	}
	return &spiTx{delegate: tx, pool: p}, nil
}
func (p *spiPool) BeginTx(ctx context.Context, opts *sql.TxOptions) (storage.Tx, error) {
	p.beginCalls++
	if p.beginErr != nil {
		return nil, p.beginErr
	}
	tx, err := p.delegate.BeginTx(ctx, opts)
	if err != nil {
		return nil, err
	}
	return &spiTx{delegate: tx, pool: p}, nil
}

type spiTx struct {
	delegate storage.Tx
	pool     *spiPool
}

func (t *spiTx) Exec(q string, a ...any) (sql.Result, error) {
	t.pool.execCalls++
	return t.delegate.Exec(q, a...)
}
func (t *spiTx) Query(q string, a ...any) (storage.Rows, error) { return t.delegate.Query(q, a...) }
func (t *spiTx) QueryRow(q string, a ...any) storage.Row {
	return t.delegate.QueryRow(q, a...)
}
func (t *spiTx) ExecContext(ctx context.Context, q string, a ...any) (sql.Result, error) {
	t.pool.execCalls++
	return t.delegate.ExecContext(ctx, q, a...)
}
func (t *spiTx) QueryRowContext(ctx context.Context, q string, a ...any) storage.Row {
	return t.delegate.QueryRowContext(ctx, q, a...)
}
func (t *spiTx) Commit() error {
	if t.pool.failCommits > 0 {
		t.pool.failCommits--
		return errors.New("injected commit failure")
	}
	return t.delegate.Commit()
}
func (t *spiTx) Rollback() error {
	t.pool.rollbacks++
	return t.delegate.Rollback()
}

type spiStore struct {
	delegate   storage.Store
	writer     *spiPool
	initCalls  int
	closeCalls int
	initErr    error
}

func newSPIStore(t *testing.T) *spiStore {
	t.Helper()
	db, err := sqlite.Open(filepath.Join(t.TempDir(), "storage-spi.db"))
	if err != nil {
		t.Fatal(err)
	}
	return &spiStore{
		delegate: db,
		writer:   &spiPool{delegate: db.Writer()},
	}
}
func (s *spiStore) Initialize(ctx context.Context) error {
	s.initCalls++
	if s.initErr != nil {
		return s.initErr
	}
	return s.delegate.Initialize(ctx)
}
func (s *spiStore) Writer() storage.Pool { return s.writer }
func (s *spiStore) Reader() storage.Pool { return s.delegate.Reader() }
func (s *spiStore) Close() error {
	s.closeCalls++
	return s.delegate.Close()
}

func openSPI(t *testing.T, st *spiStore) *Game {
	t.Helper()
	g, err := OpenWithStorage(st, func() int64 { return 1800000000000 }, DatabaseOptions{DemoData: true})
	if err != nil {
		t.Fatal(err)
	}
	return g
}

func TestStorageSPIInjectedStoreAndTownFlow(t *testing.T) {
	st := newSPIStore(t)
	g := openSPI(t, st)
	if st.initCalls != 1 {
		t.Fatalf("Initialize calls=%d", st.initCalls)
	}
	home, err := g.TownEnter("wang", "wang")
	if err != nil {
		t.Fatal(err)
	}
	if home.Owner.ID != "wang" {
		t.Fatalf("owner=%s", home.Owner.ID)
	}
	if _, err = g.TownHire("wang", "system-a", 120); err != nil {
		t.Fatal(err)
	}
	if st.writer.beginCalls == 0 || st.writer.execCalls == 0 {
		t.Fatalf("injected writer unused: begin=%d exec=%d", st.writer.beginCalls, st.writer.execCalls)
	}
	if err = g.Close(); err != nil {
		t.Fatal(err)
	}
	if st.closeCalls != 1 {
		t.Fatalf("Close calls=%d", st.closeCalls)
	}
}

func TestStorageSPIInitAndSeedFailuresCloseStore(t *testing.T) {
	t.Run("initialize", func(t *testing.T) {
		st := newSPIStore(t)
		st.initErr = errors.New("injected initialize failure")
		if _, err := OpenWithStorage(st, nil, DatabaseOptions{DemoData: true}); err == nil {
			t.Fatal("initialize failure accepted")
		}
		if st.initCalls != 1 || st.closeCalls != 1 || st.writer.beginCalls != 0 {
			t.Fatalf("init=%d close=%d begin=%d", st.initCalls, st.closeCalls, st.writer.beginCalls)
		}
	})

	t.Run("seed", func(t *testing.T) {
		st := newSPIStore(t)
		st.writer.beginErr = errors.New("injected seed begin failure")
		if _, err := OpenWithStorage(st, nil, DatabaseOptions{DemoData: true}); err == nil {
			t.Fatal("seed failure accepted")
		}
		if st.initCalls != 1 || st.closeCalls != 1 || st.writer.beginCalls == 0 {
			t.Fatalf("init=%d close=%d begin=%d", st.initCalls, st.closeCalls, st.writer.beginCalls)
		}
	})
}

func TestStorageSPICommitFailureRollsBack(t *testing.T) {
	st := newSPIStore(t)
	g := openSPI(t, st)
	defer func() { _ = g.Close() }()
	st.writer.failCommits = 1
	err := g.transaction(func(tx storage.Tx) error {
		_, err := tx.Exec("INSERT INTO meta(key,value) VALUES('storage-spi','uncommitted')")
		return err
	})
	if err == nil {
		t.Fatal("commit failure swallowed")
	}
	var rows int
	if err = g.DB.QueryRow("SELECT COUNT(*) FROM meta WHERE key='storage-spi'").Scan(&rows); err != nil {
		t.Fatal(err)
	}
	if rows != 0 {
		t.Fatal("failed transaction persisted")
	}
	if st.writer.rollbacks == 0 {
		t.Fatal("rollback was not called")
	}
}

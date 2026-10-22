// Package sqlite is the default local persistence adapter.
package sqlite

import (
	"context"
	"crypto/rand"
	"database/sql"
	_ "embed"
	"errors"
	"github.com/1994/boss-works-for-me/storage"
	"github.com/1994/boss-works-for-me/storage/sqlstore"
	_ "modernc.org/sqlite"
	"net/url"
	"os"
	"path/filepath"
	"runtime"
	"sync"
)

//go:embed schema.sql
var schema string

type Store struct {
	writer, reader     *sqlstore.Pool
	writerDB, readerDB *sql.DB
	once               sync.Once
	closeErr           error
}

var _ storage.Store = (*Store)(nil)

func (s *Store) Writer() storage.Pool { return s.writer }
func (s *Store) Reader() storage.Pool {
	if s.reader != nil {
		return s.reader
	}
	return s.writer
}
func (s *Store) Close() error {
	s.once.Do(func() {
		if s.reader != nil {
			s.closeErr = s.readerDB.Close()
		}
		s.closeErr = errors.Join(s.closeErr, s.writerDB.Close())
	})
	return s.closeErr
}
func (s *Store) Initialize(ctx context.Context) error {
	_, err := s.writerDB.ExecContext(ctx, "PRAGMA journal_mode=WAL; PRAGMA synchronous=NORMAL;"+schema)
	return err
}
func Open(path string) (*Store, error) {
	var uri string
	if path == ":memory:" {
		uri = "file:town-" + rand.Text() + "?mode=memory&cache=shared&"
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
	db.SetMaxOpenConns(1)
	db.SetMaxIdleConns(1)
	s := &Store{writer: sqlstore.Wrap(db), writerDB: db}
	// Create the file before opening the read-only pool; schema is initialized by
	// OpenWithStorage, so custom adapters own their migration lifecycle too.
	if err = db.Ping(); err != nil {
		s.Close()
		return nil, err
	}
	if path != ":memory:" {
		reader, e := sql.Open("sqlite", uri+"mode=ro&_pragma=busy_timeout(5000)&_query_only=1&_txlock=deferred")
		if e != nil {
			s.Close()
			return nil, e
		}
		s.reader = sqlstore.Wrap(reader)
		s.readerDB = reader
		n := min(16, max(2, runtime.GOMAXPROCS(0)))
		reader.SetMaxOpenConns(n)
		reader.SetMaxIdleConns(n)
		if e = reader.Ping(); e != nil {
			s.Close()
			return nil, e
		}
	}
	return s, nil
}

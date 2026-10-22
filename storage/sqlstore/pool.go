// Package sqlstore bridges database/sql drivers to the storage SPI. It does not
// translate SQL dialects or supply migrations. Callers own the database lifetime.
package sqlstore

import (
	"context"
	"database/sql"
	"github.com/1994/boss-works-for-me/storage"
)

// Wrap exposes a preconfigured database/sql connection pool through the SPI.
func Wrap(db *sql.DB) *Pool { return &Pool{db: db} }

type Pool struct{ db *sql.DB }

func (p *Pool) Exec(q string, a ...any) (sql.Result, error)    { return p.db.Exec(q, a...) }
func (p *Pool) Query(q string, a ...any) (storage.Rows, error) { return p.db.Query(q, a...) }
func (p *Pool) QueryRow(q string, a ...any) storage.Row        { return p.db.QueryRow(q, a...) }
func (p *Pool) Stats() sql.DBStats                             { return p.db.Stats() }
func (p *Pool) Begin() (storage.Tx, error)                     { return p.BeginTx(context.Background(), nil) }
func (p *Pool) BeginTx(c context.Context, o *sql.TxOptions) (storage.Tx, error) {
	t, e := p.db.BeginTx(c, o)
	if e != nil {
		return nil, e
	}
	return &transaction{t}, nil
}

type transaction struct{ tx *sql.Tx }

func (t *transaction) Exec(q string, a ...any) (sql.Result, error)    { return t.tx.Exec(q, a...) }
func (t *transaction) Query(q string, a ...any) (storage.Rows, error) { return t.tx.Query(q, a...) }
func (t *transaction) QueryRow(q string, a ...any) storage.Row        { return t.tx.QueryRow(q, a...) }
func (t *transaction) ExecContext(c context.Context, q string, a ...any) (sql.Result, error) {
	return t.tx.ExecContext(c, q, a...)
}
func (t *transaction) QueryRowContext(c context.Context, q string, a ...any) storage.Row {
	return t.tx.QueryRowContext(c, q, a...)
}
func (t *transaction) Commit() error   { return t.tx.Commit() }
func (t *transaction) Rollback() error { return t.tx.Rollback() }

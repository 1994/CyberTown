// Package storage defines the persistence SPI used by the game. Implementations
// must preserve atomic transactions, uniqueness constraints and Scan semantics.
// Queries currently use the SQLite dialect; an adapter for a different engine
// must translate SQL and supply its own equivalent schema/migrations.
package storage

import (
	"context"
	"database/sql"
)

type Row interface{ Scan(...any) error }
type Rows interface {
	Next() bool
	Scan(...any) error
	Err() error
	Close() error
}
type Queryer interface {
	Exec(string, ...any) (sql.Result, error)
	Query(string, ...any) (Rows, error)
	QueryRow(string, ...any) Row
}
type Tx interface {
	Queryer
	ExecContext(context.Context, string, ...any) (sql.Result, error)
	QueryRowContext(context.Context, string, ...any) Row
	Commit() error
	Rollback() error
}
type Pool interface {
	Queryer
	Begin() (Tx, error)
	BeginTx(context.Context, *sql.TxOptions) (Tx, error)
	Stats() sql.DBStats
}

// Store owns both pools. Initialize is additive and must never reset saved data.
// Readers must not see partial writes. Writers must serialize conflicting writes.
// A failed transaction (including Commit failure) must never partially persist.
// Adapters return sql.ErrNoRows for missing rows and support sql.Scanner values.
type Store interface {
	Writer() Pool
	Reader() Pool
	Initialize(context.Context) error
	Close() error
}

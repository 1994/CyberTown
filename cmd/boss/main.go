// boss lets a coding agent play through the same API as the web player.
package main

import (
	"context"
	"os"
	"os/signal"
	"syscall"

	"github.com/1994/boss-works-for-me/internal/playercli"
)

func main() {
	ctx, cancel := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	code := playercli.Run(ctx, os.Args[1:], os.Stdin, os.Stdout, os.Stderr)
	cancel()
	os.Exit(code)
}

package backend

import (
	"database/sql"
	"encoding/json"
	"net/url"
	"strings"
)

// SetAvatar updates only this player's identity, including their hireable clone.
func (g *Game) SetAvatar(player, avatarURL string) error {
	if err := validateAvatarURL(avatarURL); err != nil {
		return err
	}
	return g.transaction(func(tx *sql.Tx) error {
		c, err := scanCol(tx.QueryRow("SELECT "+colleagueColumns+" FROM colleagues WHERE self_player_id=?", player))
		if err == sql.ErrNoRows {
			return fail(404, "NO_AVATAR", "未找到玩家分身")
		}
		if err != nil {
			return err
		}
		c.Look.AvatarURL = avatarURL
		data, err := json.Marshal(c.Look)
		if err != nil {
			return err
		}
		if _, err = tx.Exec("UPDATE colleagues SET look=?,version=version+1 WHERE id=?", string(data), c.ID); err != nil {
			return err
		}
		return bump(tx)
	})
}

func validateAvatarURL(avatarURL string) error {
	if len(avatarURL) > 2048 || strings.ContainsAny(avatarURL, "\r\n\t") || strings.TrimSpace(avatarURL) != avatarURL {
		return fail(400, "BAD_AVATAR", "头像地址无效")
	}
	if avatarURL != "" {
		u, err := url.Parse(avatarURL)
		if err != nil || u.User != nil || u.Fragment != "" {
			return fail(400, "BAD_AVATAR", "请使用 HTTP(S) 头像地址或站内图片路径")
		}
		remote := (u.Scheme == "http" || u.Scheme == "https") && u.Hostname() != ""
		local := u.Scheme == "" && u.Host == "" && strings.HasPrefix(u.Path, "/") && !strings.HasPrefix(avatarURL, "//") && !strings.Contains(avatarURL, "\\")
		if !remote && !local {
			return fail(400, "BAD_AVATAR", "请使用 HTTP(S) 头像地址或站内图片路径")
		}
	}
	return nil
}

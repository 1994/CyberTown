package backend

import (
	"encoding/json"

	"github.com/1994/boss-works-for-me/gameplay"
)

type Skill struct {
	Kind  string `json:"kind"`
	Value int    `json:"value"`
}
type Skills struct {
	IncomePct int `json:"incomePct"`
	TimeSec   int `json:"timeSec"`
	Shield    int `json:"shield"`
}
type Look struct {
	AvatarURL  string `json:"avatarUrl,omitempty"`
	AvatarName string `json:"avatarName,omitempty"`
	Skin       string `json:"skin"`
	Hair       string `json:"hair"`
	HairStyle  string `json:"hairStyle"`
	Shirt      string `json:"shirt"`
	Pants      string `json:"pants"`
	Accessory  string `json:"accessory"`
}
type Identity struct {
	AvatarURL         string  `json:"avatarUrl,omitempty"`
	ID                string  `json:"id"`
	Name              string  `json:"name"`
	Title             string  `json:"title"`
	Color             string  `json:"color"`
	AvatarColleagueID *string `json:"avatarColleagueId"`
}
type Player struct {
	AvatarURL         string  `json:"avatarUrl,omitempty"`
	ID                string  `json:"id"`
	Name              string  `json:"name"`
	Title             string  `json:"title"`
	Color             string  `json:"color"`
	Coins             int     `json:"coins"`
	TeamValue         int     `json:"teamValue"`
	Assets            int     `json:"assets"`
	TeamSize          int     `json:"teamSize"`
	AvatarColleagueID *string `json:"avatarColleagueId"`
	Online            bool    `json:"online"`
	Rank              int     `json:"rank"`
	RankName          string  `json:"rankName"`
	Style             Style   `json:"style"`
}
type Colleague struct {
	ID           string  `json:"id"`
	Name         string  `json:"name"`
	Title        string  `json:"title"`
	Bio          string  `json:"bio"`
	Look         Look    `json:"look"`
	Skill        Skill   `json:"skill"`
	SelfPlayerID *string `json:"selfPlayerId"`
	OwnerID      *string `json:"ownerId"`
	DeskSlot     *int    `json:"deskSlot"`
	LastPrice    *int    `json:"lastPrice"`
	Price        int     `json:"price"`
	Trades       int     `json:"trades"`
	Earnings     int     `json:"earnings"`
	Version      int     `json:"version"`
	AcquiredAt   *int64  `json:"acquiredAt"`
}
type Message struct {
	ID        int64           `json:"id"`
	Scope     string          `json:"scope"`
	Kind      string          `json:"kind"`
	Title     string          `json:"title"`
	Body      string          `json:"body"`
	CreatedAt int64           `json:"createdAt"`
	Read      bool            `json:"read"`
	Data      json.RawMessage `json:"data,omitempty"`
}
type Run struct {
	ID         string `json:"id"`
	Seed       uint32 `json:"seed"`
	StartedAt  int64  `json:"startedAt"`
	DurationMS int64  `json:"durationMs"`
	Deadline   int64  `json:"deadline"`
	Skills     Skills `json:"skills"`
	Status     string `json:"status"`
}
type Snapshot struct {
	ServerTime    int64       `json:"serverTime"`
	Version       int64       `json:"version"`
	Me            Player      `json:"me"`
	Players       []Player    `json:"players"`
	Colleagues    []Colleague `json:"colleagues"`
	TeamSkills    Skills      `json:"teamSkills"`
	ProjectSkills Skills      `json:"projectSkills"`
	Career        Career      `json:"career"`
	Year          Year        `json:"year"`
	Shop          []ShopItem  `json:"shop"`
	ActiveRun     *Run        `json:"activeRun"`
	Messages      []Message   `json:"messages"`
	Unread        int         `json:"unread"`
	SystemPool    int         `json:"systemPool"`
}
type Trade struct {
	Kind             string  `json:"kind"`
	ColleagueID      string  `json:"colleagueId"`
	ColleagueName    string  `json:"colleagueName"`
	BuyerID          string  `json:"buyerId"`
	SellerID         *string `json:"sellerId"`
	SelfPlayerID     *string `json:"selfPlayerId"`
	Price            int     `json:"price"`
	OwnerShare       int     `json:"ownerShare"`
	SelfShare        int     `json:"selfShare"`
	SystemShare      int     `json:"systemShare"`
	DeskSlot         int     `json:"deskSlot"`
	PreviousDeskSlot *int    `json:"previousDeskSlot"`
	At               int64   `json:"at"`
}
type Task = gameplay.Task
type Action struct {
	TaskID int     `json:"taskId"`
	T      float64 `json:"t"`
}
type ProjectResult struct {
	Hits        int `json:"hits"`
	Misses      int `json:"misses"`
	Traps       int `json:"traps"`
	ShieldsUsed int `json:"shieldsUsed"`
	MaxCombo    int `json:"maxCombo"`
	Rejected    int `json:"rejected"`
	BasePoints  int `json:"basePoints"`
	IncomeBonus int `json:"incomeBonus"`
	Total       int `json:"total"`
}
type Finish struct {
	Result            ProjectResult `json:"result"`
	Coins             int           `json:"coins"`
	PerformanceEarned int           `json:"performanceEarned"`
	Career            Career        `json:"career"`
	YearAward         *YearAward    `json:"yearAward"`
}
type Audit struct {
	Mismatches  []string `json:"mismatches"`
	DoubleOwned int      `json:"doubleOwned"`
	Negative    int      `json:"negative"`
	Overfull    int      `json:"overfull"`
}
type GameError struct {
	Status  int    `json:"-"`
	Code    string `json:"code"`
	Message string `json:"message"`
}

func (e *GameError) Error() string                { return e.Code + ": " + e.Message }
func fail(status int, code, message string) error { return &GameError{status, code, message} }
func same(p *string, s string) bool               { return p != nil && *p == s }

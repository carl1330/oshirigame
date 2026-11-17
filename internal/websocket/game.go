package websocket

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"math/rand"
	"strings"
	"sync"
	"time"

	haikunator "github.com/atrox/haikunatorgo/v2"
	"github.com/carl1330/oshirigame/internal/oshirigame"
)

type game struct {
	Id          string `json:"id"`
	players     map[string]*Player
	GameState   *GameState
	WordList    *oshirigame.WordList
	register    chan *Player
	unregister  chan *client
	expire      chan *client
	broadcast   chan *Message
	running     bool
	roundCtx    context.Context
	cancelRound context.CancelFunc
	// roundStartedAt anchors per-turn timing for the end-of-game awards.
	roundStartedAt time.Time
	sync.Mutex
}

// How long a disconnected player may reconnect before being removed from the game.
const reconnectGrace = 30 * time.Second

// How long the battle royale turn result stays on screen before the server
// starts the next turn on its own: ~2s of verdict animation + 4s of reading.
const royaleNextTurnDelay = 6 * time.Second

const (
	GameModeClassic = "classic"
	GameModeLongest = "longest"
	GameModeRoyale  = "royale"
)

// Battle royale mutations tweak the chain rule.
const (
	MutationNone        = ""
	MutationExactLength = "exactLength" // each word must be exactly one letter longer than the last
)

type GameState struct {
	Started          bool      `json:"started"`
	GameMode         string    `json:"gameMode"`
	Round            int       `json:"round"`
	MaxRounds        int       `json:"maxRounds"`
	Time             int       `json:"time"`
	RoundTime        int       `json:"roundTime"`
	WordCombinations int       `json:"wordCombinations"`
	Language         string    `json:"language"`
	BannedAtama      string    `json:"bannedAtama"`
	BannedOshiri     string    `json:"bannedOshiri"`
	SubmitOnEnter    bool      `json:"submitOnEnter"`
	Lives            int       `json:"lives"`     // battle royale: starting lives
	SwapTurns        int       `json:"swapTurns"` // battle royale: turns per letter combination
	Mutation         string    `json:"mutation"`  // battle royale: chain rule mutation
	RequiredLength   int       `json:"requiredLength"`
	SwapIn           int       `json:"swapIn"` // battle royale: turns left on current letters
	PlayerQueue      []*Player `json:"playerQueue"`
	// EliminatedPlayers holds knocked-out battle royale players in elimination
	// order so they can still be shown (and ranked) after losing their seat.
	EliminatedPlayers []*Player `json:"eliminatedPlayers"`
	Input            string    `json:"input"`
	Atama            string    `json:"atama"`
	Oshiri           string    `json:"oshiri"`
	RoundOver        bool      `json:"roundOver"`
	TurnCount        int       `json:"-"` // Track turns in current round, not sent to client
	sync.Mutex
}

type Player struct {
	token string
	// IsLeader marks whose turn it is (head of the queue); IsHost marks the
	// stable room admin who controls options, starting and round flow.
	IsLeader   bool   `json:"isLeader"`
	IsHost     bool   `json:"isHost"`
	Username   string `json:"username"`
	Avatar     string `json:"avatar"`
	Score      int    `json:"score"`
	Lives      int    `json:"lives"`      // battle royale: remaining lives
	Eliminated bool   `json:"eliminated"` // battle royale: out of the game
	roundInput string // this player's word in longest-word mode
	submitted  bool   // locked in their word this round (longest-word mode)
	lastChatAt time.Time
	stats      playerStats
	client     *client
	sync.Mutex
}

// AllowChat enforces the per-player chat cooldown; a true result claims the
// slot, so call it only when the message is otherwise valid.
func (p *Player) AllowChat(now time.Time, minInterval time.Duration) bool {
	p.Lock()
	defer p.Unlock()
	if now.Sub(p.lastChatAt) < minInterval {
		return false
	}
	p.lastChatAt = now
	return true
}

// playerStats accumulates per-game material for the end-of-game awards.
// Not serialized; awards are computed server-side at game over.
type playerStats struct {
	longestWord string // longest accepted word this game
	fastestMs   int64  // quickest accepted turn, -1 = none yet
	totalMs     int64  // summed turn time across the game
	turns       int
	fails       int   // turns that produced no accepted word
	submitMs    int64 // this round's lock-in time (longest mode), -1 = not submitted
	// Battle royale material
	outOnTurn     int    // turn the player was eliminated on, 0 = survived
	clutchTurns   int    // turns survived while on their last life
	bestOvershoot int    // most letters over the required length in one word
	overshootWord string // the word that did it
}

func NewGame() *game {
	haikunator := haikunator.New()
	haikunator.TokenLength = 0
	return &game{
		Id:         haikunator.Haikunate(),
		broadcast:  make(chan *Message),
		register:   make(chan *Player),
		unregister: make(chan *client),
		expire:     make(chan *client),
		players:    make(map[string]*Player),
		GameState:  NewGameState(),
		WordList:   oshirigame.NewWordList(),
		running:    false,
	}
}

func NewGameState() *GameState {
	return &GameState{
		Started:          false,
		GameMode:         GameModeClassic,
		Round:            1,
		MaxRounds:        10,
		Time:             0,
		RoundTime:        25,
		WordCombinations: 400,
		Language:         string(oshirigame.English),
		BannedAtama:      "",
		BannedOshiri:     "",
		SubmitOnEnter:     false,
		Lives:             3,
		SwapTurns:         5,
		Mutation:          MutationNone,
		RequiredLength:    0,
		SwapIn:            0,
		PlayerQueue:       make([]*Player, 0),
		EliminatedPlayers: make([]*Player, 0),
	}
}

func NewPlayer(username string, token string, avatar string, client *client) *Player {
	return &Player{
		token:    token,
		IsLeader: false,
		Username: username,
		Avatar:   avatar,
		Score:    0,
		stats:    playerStats{fastestMs: -1, submitMs: -1},
		client:   client,
	}
}

func (g *game) Enqueue(player *Player) {
	g.GameState.Lock()
	defer g.GameState.Unlock()
	if len(g.GameState.PlayerQueue) == 0 {
		player.IsLeader = true
	}
	// A room always has exactly one host; claim the role if it's vacant
	hasHost := false
	for _, p := range g.GameState.PlayerQueue {
		if p.IsHost {
			hasHost = true
			break
		}
	}
	if !hasHost {
		player.IsHost = true
	}
	g.GameState.PlayerQueue = append(g.GameState.PlayerQueue, player)
}

func (g *game) Dequeue() *Player {
	g.GameState.Lock()
	defer g.GameState.Unlock()
	player := g.GameState.PlayerQueue[0]
	player.IsLeader = false
	g.GameState.PlayerQueue = g.GameState.PlayerQueue[1:]
	if len(g.GameState.PlayerQueue) > 0 {
		g.GameState.PlayerQueue[0].IsLeader = true
	}

	return player
}

func (g *game) RemovePlayer(token string) {
	g.Lock()
	defer g.Unlock()
	for i, player := range g.GameState.PlayerQueue {
		if player.token == token {
			updatedQueue := make([]*Player, 0)
			updatedQueue = append(updatedQueue, g.GameState.PlayerQueue[:i]...)
			g.GameState.PlayerQueue = append(updatedQueue, g.GameState.PlayerQueue[i+1:]...)

			if len(g.GameState.PlayerQueue) > 0 {
				g.GameState.PlayerQueue[0].IsLeader = true
				// If the host left, the next player in line inherits the room
				if player.IsHost {
					g.GameState.PlayerQueue[0].IsHost = true
				}
				g.SendPlayerState(g.GameState.PlayerQueue[0])
			}
		}
	}
	delete(g.players, token)
}

func (g *game) GetPlayer(token string) (*Player, error) {
	g.Lock()
	defer g.Unlock()
	if _, ok := g.players[token]; !ok {
		return nil, errors.New("player not found")
	}
	return g.players[token], nil
}

func (g *game) GetStarted() bool {
	g.GameState.Lock()
	defer g.GameState.Unlock()
	return g.GameState.Started
}

func (g *game) InitializeGame() {
	g.SetGameStarted(true)
	alphabet, bannedAtama, bannedOshiri := g.GetLetterConfig()
	g.SetAtama(RandomLetter(alphabet, bannedAtama))
	g.SetOshiri(RandomLetter(alphabet, bannedOshiri))
	g.SetGameStateTime(g.GameState.RoundTime)
	g.SetGameStateInput("")
	g.SetRoundOver(false)

	if g.GetGameMode() == GameModeRoyale {
		g.GameState.Lock()
		// SwapIn 0 forces fresh letters (with the full reveal) on round one
		g.GameState.RequiredLength = 0
		g.GameState.SwapIn = 0
		g.GameState.EliminatedPlayers = make([]*Player, 0)
		lives := g.GameState.Lives
		g.GameState.Unlock()
		g.Lock()
		for _, player := range g.players {
			player.SetLives(lives)
			player.SetEliminated(false)
		}
		g.Unlock()
	}
}

func (g *game) StartRound() {
	// Create a new context for this round that can be cancelled
	g.Lock()
	g.roundCtx, g.cancelRound = context.WithCancel(context.Background())
	ctx := g.roundCtx
	g.Unlock()

	letterTimer := time.NewTimer(3 * time.Second)
	roundTicker := time.NewTicker(1 * time.Second)
	defer letterTimer.Stop()
	defer roundTicker.Stop()

	g.SetGameStarted(true)
	g.SetGameRunning(true)
	g.SetRoundOver(false)
	g.SetGameStateTime(g.GameState.RoundTime)
	g.SetGameStateInput("")
	g.ResetRoundInputs()

	// Battle royale keeps the same letters for several turns; only re-roll
	// (with the full scroller reveal) when the current combination is spent.
	royale := g.GetGameMode() == GameModeRoyale
	rollLetters := !royale || g.ShouldSwapLetters()

	if rollLetters {
		//Generate random letters and check if that combination of letters has more than 400 possible words
		//If not try again until successful. Capped attempts: banned letters can make the
		//threshold unreachable, in which case we keep the last picked combination.
		alphabet, bannedAtama, bannedOshiri := g.GetLetterConfig()
		for attempts := 0; attempts < 500; attempts++ {
			g.SetAtama(RandomLetter(alphabet, bannedAtama))
			g.SetOshiri(RandomLetter(alphabet, bannedOshiri))
			if g.WordList.WordCount(g.GameState.Atama, g.GameState.Oshiri) >= g.GameState.WordCombinations {
				break
			}
		}
		if royale {
			// Fresh letters restart the chain and the swap countdown
			g.ResetLetterCycle()
		}

		// Wait for letter timer or cancellation
		select {
		case <-letterTimer.C:
			g.BroadcastMessage(ROUND_ATAMA, json.RawMessage(`{"letter":"`+g.GameState.Atama+`"}`))
		case <-ctx.Done():
			return // Round cancelled
		}

		letterTimer.Reset(3 * time.Second)
		select {
		case <-letterTimer.C:
			g.BroadcastMessage(ROUND_OSHIRI, json.RawMessage(`{"letter":"`+g.GameState.Oshiri+`"}`))
		case <-ctx.Done():
			return // Round cancelled
		}

		// The client scroller decelerates for ~0.5s after the letter event lands;
		// hold the round start until it has visibly settled.
		letterTimer.Reset(1 * time.Second)
		select {
		case <-letterTimer.C:
		case <-ctx.Done():
			return // Round cancelled
		}
	} else {
		// Letters unchanged, stop the client scrollers right away and give
		// them just enough time to settle before the clock starts.
		atama, oshiri := g.GetRoundLetters()
		g.BroadcastMessage(ROUND_ATAMA, json.RawMessage(`{"letter":"`+atama+`"}`))
		g.BroadcastMessage(ROUND_OSHIRI, json.RawMessage(`{"letter":"`+oshiri+`"}`))
		letterTimer.Reset(500 * time.Millisecond)
		select {
		case <-letterTimer.C:
		case <-ctx.Done():
			return // Round cancelled
		}
	}

	data := g.MarsalGameState()
	g.Lock()
	g.roundStartedAt = time.Now()
	g.Unlock()
	g.BroadcastMessage(ROUND_START, data)

	// Ticks buffered during the letter reveal would instantly eat the first
	// countdown second, restart the ticker now that the round is live.
	roundTicker.Reset(1 * time.Second)

	// Round timer with cancellation support
	for i := g.GameState.RoundTime; i > 0; i-- {
		select {
		case <-roundTicker.C:
			g.DecreaseTime()
			g.BroadcastGameState()
		case <-ctx.Done():
			return // Round cancelled
		}
	}

	g.FinishRound()
}

// roundElapsedMs returns milliseconds since the live round started, clamped
// to [0, round length] so timer-expiry turns read as the full round.
func (g *game) roundElapsedMs() int64 {
	g.Lock()
	started := g.roundStartedAt
	g.Unlock()
	maxMs := g.roundLengthMs()
	if started.IsZero() {
		return maxMs
	}
	ms := time.Since(started).Milliseconds()
	if ms < 0 {
		ms = 0
	}
	if ms > maxMs {
		ms = maxMs
	}
	return ms
}

func (g *game) roundLengthMs() int64 {
	g.GameState.Lock()
	defer g.GameState.Unlock()
	return int64(g.GameState.RoundTime) * 1000
}

// claimFinish atomically flips running to false and reports whether the
// caller won the claim, so FinishRound runs exactly once per round even if
// the timer and an early end race each other.
func (g *game) claimFinish() bool {
	g.Lock()
	defer g.Unlock()
	if !g.running {
		return false
	}
	g.running = false
	return true
}

// EndTurnEarly stops the round timer and finishes the round immediately.
func (g *game) EndTurnEarly() {
	g.Lock()
	if g.cancelRound != nil {
		g.cancelRound()
		g.cancelRound = nil
		g.roundCtx = nil
	}
	g.Unlock()
	g.FinishRound()
}

func (g *game) FinishRound() {
	// Only the first caller finishes the round (timer vs early end race)
	if !g.claimFinish() {
		return
	}

	if g.GetGameMode() == GameModeLongest {
		g.FinishLongestRound()
		return
	}

	if g.GetGameMode() == GameModeRoyale {
		g.FinishRoyaleRound()
		return
	}

	if len(g.players) > 0 {
		player := g.Dequeue()
		word := g.GameState.Atama + g.GameState.Input + g.GameState.Oshiri
		player.RecordTurn(word, g.GameState.Input != "" && g.WordList.IsValidWord(word), g.roundElapsedMs())
		player.SetPlayerScore(player.GetPlayerScore() + g.WordList.GetScore(word))

		g.Enqueue(player)

		// Increment turn counter
		g.GameState.Lock()
		g.GameState.TurnCount++
		totalPlayers := len(g.players)
		// A round completes when everyone has had exactly one turn
		wasLastPlayer := g.GameState.TurnCount >= totalPlayers
		if wasLastPlayer {
			g.GameState.TurnCount = 0 // Reset for next round
		}
		g.GameState.Unlock()

		var roundOverResponse RoundOverResponse
		roundOverResponse.TopWords = g.WordList.TopWords(g.GameState.Atama, g.GameState.Oshiri)
		roundOverResponse.Word = g.GameState.Atama + g.GameState.Input + g.GameState.Oshiri
		roundOverResponse.WordAccepted = g.WordList.IsValidWord(g.GameState.Atama + g.GameState.Input + g.GameState.Oshiri)

		g.SetRoundOver(true)

		roundOverResponse.GameState = g.MarsalGameState()

		data, _ := json.Marshal(roundOverResponse)

		g.BroadcastMessage(ROUND_FINISHED, data)

		for _, player := range g.players {
			g.SendPlayerState(player)
		}

		// Check if game is over (max rounds reached) before incrementing for next round
		// If this was the last player and we've reached max rounds, end the game
		if wasLastPlayer && g.IsGameOver() {
			g.EndGame()
		} else if wasLastPlayer {
			// Only increment round when we've completed a full cycle (back to the first player)
			g.IncrementRound()
		}

	}
}

// FinishRoyaleRound resolves one battle royale turn: the word must be valid
// AND longer than the previous word in the chain (with the exact-length
// mutation, exactly one letter longer), or the player loses a life.
// At zero lives the player is eliminated; the last one standing wins.
func (g *game) FinishRoyaleRound() {
	g.GameState.Lock()
	queueLen := len(g.GameState.PlayerQueue)
	g.GameState.Unlock()
	if queueLen == 0 {
		return
	}

	player := g.Dequeue()
	atama, oshiri := g.GetRoundLetters()

	g.GameState.Lock()
	input := g.GameState.Input
	needed := g.GameState.RequiredLength
	mutation := g.GameState.Mutation
	turn := g.GameState.Round
	g.GameState.Unlock()

	word := atama + input + oshiri
	wordLen := len([]rune(word))
	valid := input != "" && g.WordList.IsValidWord(word)
	tooShort := valid && needed > 0 && wordLen < needed
	tooLong := valid && needed > 0 && mutation == MutationExactLength && wordLen > needed
	accepted := valid && !tooShort && !tooLong

	player.RecordTurn(word, accepted, g.roundElapsedMs())

	livesBefore := player.GetLives()
	eliminated := false
	if accepted {
		player.SetPlayerScore(player.GetPlayerScore() + g.WordList.GetScore(word))
		g.SetRequiredLength(wordLen + 1)
		// Award material: chain overshoot, and turns survived on the last life
		if needed > 0 {
			player.RecordOvershoot(word, wordLen-needed)
		}
		if livesBefore == 1 {
			player.RecordClutchTurn()
		}
	} else {
		player.LoseLife()
		// A miss breaks the chain, the next player starts fresh
		g.SetRequiredLength(0)
		eliminated = player.GetLives() <= 0
	}

	g.GameState.Lock()
	g.GameState.SwapIn--
	if eliminated {
		player.SetEliminated(true)
		player.SetOutOnTurn(turn)
		g.GameState.EliminatedPlayers = append(g.GameState.EliminatedPlayers, player)
		// An eliminated host hands the room to the next player in line
		if player.IsHost && len(g.GameState.PlayerQueue) > 0 {
			player.IsHost = false
			g.GameState.PlayerQueue[0].IsHost = true
		}
	}
	alive := len(g.GameState.PlayerQueue)
	eliminatedCount := len(g.GameState.EliminatedPlayers)
	g.GameState.Unlock()

	if !eliminated {
		g.Enqueue(player)
		alive++
	}

	g.SetRoundOver(true)
	g.IncrementRound()

	// Last one standing wins. A solo game runs until its only player dies.
	gameEnding := alive == 0 || (alive == 1 && eliminatedCount > 0)

	var roundOverResponse RoundOverResponse
	// The same letters stay in play for several turns, only reveal the best
	// words once this combination is spent (or the game is ending). Always a
	// real slice: a nil one marshals to JSON null and breaks clients reading
	// topWords.length.
	if gameEnding || g.ShouldSwapLetters() {
		roundOverResponse.TopWords = g.WordList.TopWords(atama, oshiri)
	} else {
		roundOverResponse.TopWords = []string{}
	}
	roundOverResponse.Word = word
	roundOverResponse.WordAccepted = accepted
	roundOverResponse.TooShort = tooShort
	roundOverResponse.TooLong = tooLong
	roundOverResponse.NeededLength = needed
	roundOverResponse.TurnUsername = player.Username
	if eliminated {
		roundOverResponse.EliminatedPlayer = player.Username
	}
	if !gameEnding {
		roundOverResponse.AutoNextIn = int(royaleNextTurnDelay / time.Second)
	}
	roundOverResponse.GameState = g.MarsalGameState()

	data, _ := json.Marshal(roundOverResponse)
	g.BroadcastMessage(ROUND_FINISHED, data)

	for _, p := range g.players {
		g.SendPlayerState(p)
	}

	if gameEnding {
		g.EndRoyaleGame()
	} else {
		g.scheduleAutoAdvance(royaleNextTurnDelay)
	}
}

// scheduleAutoAdvance starts the next battle royale turn after the result has
// been on screen for a while, no host interaction needed. The round counter
// is captured so a reset (or anything else that moved the game on) cancels
// the pending advance.
func (g *game) scheduleAutoAdvance(delay time.Duration) {
	g.GameState.Lock()
	round := g.GameState.Round
	g.GameState.Unlock()

	go func() {
		time.Sleep(delay)

		g.GameState.Lock()
		stillPending := g.GameState.Started &&
			g.GameState.RoundOver &&
			g.GameState.GameMode == GameModeRoyale &&
			g.GameState.Round == round &&
			len(g.GameState.PlayerQueue) > 0
		data, _ := json.Marshal(g.GameState)
		g.GameState.Unlock()

		if !stillPending || g.IsRunning() {
			return
		}

		// Mirror the NEXT_ROUND flow the host button used to drive
		g.BroadcastMessage(NEXT_ROUND, data)
		g.StartRound()
	}()
}

// pick returns a random entry so repeated screens don't always read the same.
func pick(phrases []string) string {
	return phrases[rand.Intn(len(phrases))]
}

var royaleWinnerPhrases = []string{
	"Last one standing",
	"Sole survivor",
	"Outlasted them all",
	"Still breathing",
	"The final boss",
}

var royaleKnockoutPhrases = []string{
	"Knocked out on turn %d",
	"Fell on turn %d",
	"Out of lives on turn %d",
	"Didn't survive turn %d",
	"Turn %d claimed them",
}

// EndRoyaleGame ranks players by survival: the last one standing first, then
// the eliminated players in reverse elimination order. Each ranking carries a
// pre-formatted survival stat, battle royale isn't about points.
func (g *game) EndRoyaleGame() {
	g.GameState.Lock()
	startingLives := g.GameState.Lives
	alive := make([]*Player, len(g.GameState.PlayerQueue))
	copy(alive, g.GameState.PlayerQueue)
	ranked := make([]*Player, 0, len(g.GameState.PlayerQueue)+len(g.GameState.EliminatedPlayers))
	ranked = append(ranked, g.GameState.PlayerQueue...)
	for i := len(g.GameState.EliminatedPlayers) - 1; i >= 0; i-- {
		ranked = append(ranked, g.GameState.EliminatedPlayers[i])
	}
	g.GameState.Unlock()

	winners := make([]PlayerRanking, 0, len(ranked))
	for i, player := range ranked {
		stats := player.GetStats()
		var stat string
		if stats.outOnTurn == 0 {
			stat = fmt.Sprintf("%s · %d♥ left", pick(royaleWinnerPhrases), player.GetLives())
		} else {
			stat = fmt.Sprintf(pick(royaleKnockoutPhrases), stats.outOnTurn)
		}
		winners = append(winners, PlayerRanking{
			Username: player.Username,
			Avatar:   player.Avatar,
			Score:    player.GetPlayerScore(),
			Rank:     i + 1,
			Stat:     stat,
		})
	}

	var gameOverResponse GameOverResponse
	gameOverResponse.Winners = winners
	gameOverResponse.Awards = append(g.ComputeAwards(), g.computeRoyaleAwards(alive, startingLives)...)

	data, _ := json.Marshal(gameOverResponse)
	g.BroadcastMessage(GAME_OVER, data)
}

// computeRoyaleAwards adds the battle-royale-only superlatives on top of the
// shared ones.
func (g *game) computeRoyaleAwards(alive []*Player, startingLives int) []Award {
	awards := make([]Award, 0, 3)

	// Untouchable: won without losing a single life
	if len(alive) == 1 && alive[0].GetLives() == startingLives {
		awards = append(awards, Award{
			Id:       "untouchable",
			Username: alive[0].Username,
			Avatar:   alive[0].Avatar,
			Value:    "FLAWLESS",
		})
	}

	g.Lock()
	players := make([]*Player, 0, len(g.players))
	for _, player := range g.players {
		players = append(players, player)
	}
	g.Unlock()

	// Overachiever: beat the chain's required length by the most letters
	var overPlayer *Player
	bestOver := 0
	// Clutch Player: most turns survived on the last life
	var clutchPlayer *Player
	bestClutch := 0
	for _, player := range players {
		stats := player.GetStats()
		if stats.bestOvershoot > bestOver {
			bestOver = stats.bestOvershoot
			overPlayer = player
		}
		if stats.clutchTurns > bestClutch {
			bestClutch = stats.clutchTurns
			clutchPlayer = player
		}
	}
	if overPlayer != nil {
		awards = append(awards, Award{
			Id:       "overachiever",
			Username: overPlayer.Username,
			Avatar:   overPlayer.Avatar,
			Value:    overPlayer.GetStats().overshootWord,
		})
	}
	if clutchPlayer != nil {
		awards = append(awards, Award{
			Id:       "clutch",
			Username: clutchPlayer.Username,
			Avatar:   clutchPlayer.Avatar,
			Value:    fmt.Sprintf("%d", bestClutch),
		})
	}

	return awards
}

// RoyaleGameOver reports whether the battle royale has ended: one player (or
// none, in a solo game) left standing after at least one elimination.
func (g *game) RoyaleGameOver() bool {
	g.GameState.Lock()
	defer g.GameState.Unlock()
	alive := len(g.GameState.PlayerQueue)
	return alive == 0 || (alive == 1 && len(g.GameState.EliminatedPlayers) > 0)
}

// ShouldSwapLetters reports whether the battle royale letter combination is
// spent and must be re-rolled before the next turn.
func (g *game) ShouldSwapLetters() bool {
	g.GameState.Lock()
	defer g.GameState.Unlock()
	return g.GameState.SwapIn <= 0 || g.GameState.Atama == "" || g.GameState.Oshiri == ""
}

// ResetLetterCycle restarts the battle royale swap countdown and word chain.
func (g *game) ResetLetterCycle() {
	g.GameState.Lock()
	defer g.GameState.Unlock()
	g.GameState.SwapIn = g.GameState.SwapTurns
	g.GameState.RequiredLength = 0
}

func (g *game) SetRequiredLength(length int) {
	g.GameState.Lock()
	defer g.GameState.Unlock()
	g.GameState.RequiredLength = length
}

// FinishLongestRound scores a longest-word round: every valid word is
// compared by length and the longest one(s) earn a point.
func (g *game) FinishLongestRound() {
	if len(g.players) == 0 {
		return
	}

	atama, oshiri := g.GetRoundLetters()

	// Snapshot the queue so results come out in a stable player order
	g.GameState.Lock()
	queue := make([]*Player, len(g.GameState.PlayerQueue))
	copy(queue, g.GameState.PlayerQueue)
	g.GameState.Unlock()

	results := make([]PlayerWordResult, 0, len(queue))
	maxLen := 0
	for _, player := range queue {
		input := player.GetRoundInput()
		word := atama + input + oshiri
		accepted := input != "" && g.WordList.IsValidWord(word)
		if accepted && len([]rune(word)) > maxLen {
			maxLen = len([]rune(word))
		}
		results = append(results, PlayerWordResult{
			Username: player.Username,
			Avatar:   player.Avatar,
			Word:     word,
			Accepted: accepted,
		})
	}

	// Longest valid word wins; ties all score
	roundMs := g.roundLengthMs()
	for i, player := range queue {
		// Never locked in = rode out the full clock
		elapsed := player.GetSubmitMs()
		if elapsed < 0 {
			elapsed = roundMs
		}
		player.RecordTurn(results[i].Word, results[i].Accepted, elapsed)
		if results[i].Accepted && len([]rune(results[i].Word)) == maxLen {
			results[i].Winner = true
			player.SetPlayerScore(player.GetPlayerScore() + 1)
		}
	}

	g.SetRoundOver(true)

	var roundOverResponse RoundOverResponse
	roundOverResponse.TopWords = g.WordList.TopWords(atama, oshiri)
	roundOverResponse.PlayerWords = results
	roundOverResponse.GameState = g.MarsalGameState()

	data, _ := json.Marshal(roundOverResponse)
	g.BroadcastMessage(ROUND_FINISHED, data)

	for _, player := range g.players {
		g.SendPlayerState(player)
	}

	if g.IsGameOver() {
		g.EndGame()
	} else {
		g.IncrementRound()
	}
}

// ResetRoundInputs clears every player's word and submit flag for a new round.
func (g *game) ResetRoundInputs() {
	g.Lock()
	defer g.Unlock()
	for _, player := range g.players {
		player.Lock()
		player.roundInput = ""
		player.submitted = false
		player.stats.submitMs = -1
		player.Unlock()
	}
}

// AllSubmitted reports whether every player has locked in a word (longest-word mode).
func (g *game) AllSubmitted() bool {
	g.Lock()
	defer g.Unlock()
	if len(g.players) == 0 {
		return false
	}
	for _, player := range g.players {
		if !player.GetSubmitted() {
			return false
		}
	}
	return true
}

func (g *game) GetGameMode() string {
	g.GameState.Lock()
	defer g.GameState.Unlock()
	return g.GameState.GameMode
}

// SetGameMode switches game mode; ignores unknown modes.
func (g *game) SetGameMode(mode string) {
	if mode != GameModeClassic && mode != GameModeLongest && mode != GameModeRoyale {
		return
	}
	g.GameState.Lock()
	defer g.GameState.Unlock()
	g.GameState.GameMode = mode
}

func (g *game) Run() {
	for {
		select {
		case player := <-g.register:
			if _, ok := g.players[player.client.token]; !ok {
				g.Enqueue(player)
			}
			g.players[player.client.token] = player
			go g.BroadcastGameState()
			go g.SendPlayerState(player)
		case c := <-g.unregister:
			// Don't drop the player immediately, give them a grace period
			// to reconnect (flaky mobile connections, page reloads).
			if player, ok := g.players[c.token]; ok && player.GetClient() == c {
				go func() {
					time.Sleep(reconnectGrace)
					g.expire <- c
				}()
			}
		case c := <-g.expire:
			// Only remove if the player never reconnected (client unchanged).
			if player, ok := g.players[c.token]; ok && player.GetClient() == c {
				g.RemovePlayer(c.token)
				go g.BroadcastGameState()
			}
		case message := <-g.broadcast:
			for _, player := range g.players {
				player.Lock()
				// Non-blocking: a disconnected player's send buffer may be
				// full, and that must never stall the whole game loop.
				select {
				case player.client.send <- message:
				default:
				}
				player.Unlock()
			}
		}
	}
}

func (g *game) BroadcastGameState() {
	g.GameState.Lock()
	data, _ := json.Marshal(g.GameState)
	g.GameState.Unlock()
	gameState := &Message{
		Type: GAME_STATE,
		Data: data,
	}
	g.broadcast <- gameState
}

func (g *game) SendPlayerState(player *Player) {
	data, _ := json.Marshal(player)
	message := &Message{
		Type: PLAYER_STATE,
		Data: data,
	}
	player.Lock()
	defer player.Unlock()
	select {
	case player.client.send <- message:
	default:
	}
}

func RandomLetter(alphabet string, banned string) string {
	allowed := make([]rune, 0, len(alphabet))
	for _, letter := range alphabet {
		if !strings.ContainsRune(banned, letter) {
			allowed = append(allowed, letter)
		}
	}
	// Fall back to the full alphabet if everything is banned
	if len(allowed) == 0 {
		allowed = []rune(alphabet)
	}
	return string(allowed[rand.Intn(len(allowed))])
}

// SanitizeBannedLetters keeps only unique letters from the alphabet, lowercased,
// capped at one less than the alphabet size so a letter always remains available.
func SanitizeBannedLetters(input string, alphabet string) string {
	max := len([]rune(alphabet)) - 1
	seen := make(map[rune]bool)
	result := make([]rune, 0, max)
	for _, r := range strings.ToLower(input) {
		if strings.ContainsRune(alphabet, r) && !seen[r] && len(result) < max {
			seen[r] = true
			result = append(result, r)
		}
	}
	return string(result)
}

func (g *game) GetLetterConfig() (alphabet string, bannedAtama string, bannedOshiri string) {
	g.GameState.Lock()
	defer g.GameState.Unlock()
	alphabet = oshirigame.Alphabet(oshirigame.Language(g.GameState.Language))
	return alphabet, g.GameState.BannedAtama, g.GameState.BannedOshiri
}

func (g *game) SetBannedLetters(bannedAtama string, bannedOshiri string) {
	g.GameState.Lock()
	defer g.GameState.Unlock()
	alphabet := oshirigame.Alphabet(oshirigame.Language(g.GameState.Language))
	g.GameState.BannedAtama = SanitizeBannedLetters(bannedAtama, alphabet)
	g.GameState.BannedOshiri = SanitizeBannedLetters(bannedOshiri, alphabet)
}

// SetLanguage switches the word list; ignores unknown languages.
func (g *game) SetLanguage(language string) {
	if !oshirigame.IsValidLanguage(language) {
		return
	}
	g.Lock()
	g.WordList = oshirigame.GetWordList(oshirigame.Language(language))
	g.Unlock()
	g.GameState.Lock()
	defer g.GameState.Unlock()
	g.GameState.Language = language
}

func (g *game) IsRunning() bool {
	g.Lock()
	defer g.Unlock()
	return g.running
}

func (g *game) BroadcastMessage(messageType string, data json.RawMessage) {
	message := &Message{
		Type: messageType,
		Data: data,
	}
	g.broadcast <- message
}

func (g *game) SendGameState(c *client) {
	c.send <- &Message{
		Type: GAME_STATE,
		Data: g.MarsalGameState(),
	}
}

func (g *game) SetGameRunning(running bool) {
	g.Lock()
	defer g.Unlock()
	g.running = running
}

func (g *game) SetRoundOver(roundOver bool) {
	g.GameState.Lock()
	defer g.GameState.Unlock()
	g.GameState.RoundOver = roundOver
}

func (g *game) SetGameStateInput(input string) {
	g.GameState.Lock()
	defer g.GameState.Unlock()
	g.GameState.Input = input
}

func (g *game) SetGameStateTime(time int) {
	g.GameState.Lock()
	defer g.GameState.Unlock()
	g.GameState.Time = time
}

func (g *game) DecreaseTime() {
	g.GameState.Lock()
	defer g.GameState.Unlock()
	g.GameState.Time--
}

func (g *game) MarsalGameState() []byte {
	g.GameState.Lock()
	defer g.GameState.Unlock()
	data, _ := json.Marshal(g.GameState)
	return data
}

func (g *game) SetGameStarted(started bool) {
	g.GameState.Lock()
	defer g.GameState.Unlock()
	g.GameState.Started = started
}

func (g *game) SetAtama(atama string) {
	g.GameState.Lock()
	defer g.GameState.Unlock()
	g.GameState.Atama = atama
}

func (g *game) SetOshiri(oshiri string) {
	g.GameState.Lock()
	defer g.GameState.Unlock()
	g.GameState.Oshiri = oshiri
}

func (g *game) IncrementRound() {
	g.GameState.Lock()
	defer g.GameState.Unlock()
	g.GameState.Round++
}

func (g *game) IsGameOver() bool {
	g.GameState.Lock()
	defer g.GameState.Unlock()
	return g.GameState.Round >= g.GameState.MaxRounds
}

func (g *game) EndGame() {
	// Calculate winners by sorting players by score
	type playerScore struct {
		username string
		avatar   string
		score    int
	}

	var scores []playerScore
	for _, player := range g.players {
		scores = append(scores, playerScore{
			username: player.Username,
			avatar:   player.Avatar,
			score:    player.GetPlayerScore(),
		})
	}

	// Sort by score descending
	for i := 0; i < len(scores); i++ {
		for j := i + 1; j < len(scores); j++ {
			if scores[j].score > scores[i].score {
				scores[i], scores[j] = scores[j], scores[i]
			}
		}
	}

	// Create rankings (handle ties by giving same rank)
	var winners []PlayerRanking
	currentRank := 1
	for i, ps := range scores {
		// If not first player and score is different from previous, increment rank
		if i > 0 && ps.score != scores[i-1].score {
			currentRank = i + 1
		}
		winners = append(winners, PlayerRanking{
			Username: ps.username,
			Avatar:   ps.avatar,
			Score:    ps.score,
			Rank:     currentRank,
		})
	}

	var gameOverResponse GameOverResponse
	gameOverResponse.Winners = winners
	gameOverResponse.Awards = g.ComputeAwards()

	data, _ := json.Marshal(gameOverResponse)
	g.BroadcastMessage(GAME_OVER, data)
}

// ComputeAwards derives the end-of-game superlatives from accumulated player
// stats. Positive awards always run; the roasts need at least two players so
// a solo game never roasts its only player.
func (g *game) ComputeAwards() []Award {
	type entry struct {
		player *Player
		stats  playerStats
	}

	g.Lock()
	entries := make([]entry, 0, len(g.players))
	for _, player := range g.players {
		entries = append(entries, entry{player, player.GetStats()})
	}
	g.Unlock()

	awards := make([]Award, 0, 4)
	award := func(id string, p *Player, value string) {
		awards = append(awards, Award{
			Id:       id,
			Username: p.Username,
			Avatar:   p.Avatar,
			Value:    value,
		})
	}
	seconds := func(ms int64) string {
		return fmt.Sprintf("%.1fs", float64(ms)/1000)
	}

	// Wordsmith: longest accepted word of the game
	best := -1
	for i, e := range entries {
		if e.stats.longestWord != "" &&
			(best < 0 || len([]rune(e.stats.longestWord)) > len([]rune(entries[best].stats.longestWord))) {
			best = i
		}
	}
	if best >= 0 {
		award("wordsmith", entries[best].player, entries[best].stats.longestWord)
	}

	// Speed Demon: fastest single accepted word
	best = -1
	for i, e := range entries {
		if e.stats.fastestMs >= 0 && (best < 0 || e.stats.fastestMs < entries[best].stats.fastestMs) {
			best = i
		}
	}
	if best >= 0 {
		award("speed_demon", entries[best].player, seconds(entries[best].stats.fastestMs))
	}

	if len(entries) < 2 {
		return awards
	}

	// The Thinker: slowest average turn
	best = -1
	var bestAvg int64
	for i, e := range entries {
		if e.stats.turns == 0 {
			continue
		}
		avg := e.stats.totalMs / int64(e.stats.turns)
		if best < 0 || avg > bestAvg {
			best, bestAvg = i, avg
		}
	}
	if best >= 0 {
		award("thinker", entries[best].player, seconds(bestAvg))
	}

	// Swing and a Miss: most turns without an accepted word
	best = -1
	for i, e := range entries {
		if e.stats.fails > 0 && (best < 0 || e.stats.fails > entries[best].stats.fails) {
			best = i
		}
	}
	if best >= 0 {
		award("swing_miss", entries[best].player, fmt.Sprintf("%d", entries[best].stats.fails))
	}

	return awards
}

func (g *game) ResetToLobby() {
	// Cancel any running round and wait for it to finish
	g.Lock()
	if g.cancelRound != nil {
		g.cancelRound()
		// Give the goroutine time to exit cleanly
		time.Sleep(100 * time.Millisecond)
		g.cancelRound = nil
		g.roundCtx = nil
	}
	g.Unlock()

	// Reset running flag first to prevent new rounds from starting
	g.SetGameRunning(false)

	// Reset game state to initial lobby state
	g.GameState.Lock()
	g.GameState.Started = false
	g.GameState.Round = 1
	g.GameState.Time = 0
	g.GameState.Input = ""
	g.GameState.Atama = ""
	g.GameState.Oshiri = ""
	g.GameState.RoundOver = false
	g.GameState.TurnCount = 0
	g.GameState.RequiredLength = 0
	g.GameState.SwapIn = 0
	g.GameState.EliminatedPlayers = make([]*Player, 0)
	// Snapshot who still holds a seat, eliminated battle royale players
	// were removed from the queue and must get their seat back
	queued := make(map[string]bool, len(g.GameState.PlayerQueue))
	for _, player := range g.GameState.PlayerQueue {
		queued[player.token] = true
	}
	g.GameState.Unlock()

	// Reset all player scores but keep them in the game
	g.Lock()
	benched := make([]*Player, 0)
	for _, player := range g.players {
		player.SetPlayerScore(0)
		player.ResetStats()
		player.SetEliminated(false)
		player.Lock()
		player.roundInput = ""
		player.submitted = false
		player.Unlock()
		if !queued[player.token] {
			benched = append(benched, player)
		}
	}
	g.Unlock()
	for _, player := range benched {
		g.Enqueue(player)
	}

	// Broadcast updated game state to all players
	g.BroadcastGameState()

	// Send updated player states to all players
	for _, player := range g.players {
		g.SendPlayerState(player)
	}
}

func (g *game) SetMaxRounds(maxRounds int) {
	g.GameState.Lock()
	defer g.GameState.Unlock()
	g.GameState.MaxRounds = maxRounds
}

func (g *game) SetWordCombinations(min int) {
	g.GameState.Lock()
	defer g.GameState.Unlock()
	g.GameState.WordCombinations = min
}

// SetLives sets the battle royale starting lives, clamped to a sane range.
// Zero means "not provided" and leaves the current value untouched.
func (g *game) SetLives(lives int) {
	if lives == 0 {
		return
	}
	if lives < 1 {
		lives = 1
	}
	if lives > 5 {
		lives = 5
	}
	g.GameState.Lock()
	defer g.GameState.Unlock()
	g.GameState.Lives = lives
}

// SetSwapTurns sets how many battle royale turns a letter combination lasts.
// Zero means "not provided" and leaves the current value untouched.
func (g *game) SetSwapTurns(turns int) {
	if turns == 0 {
		return
	}
	if turns < 2 {
		turns = 2
	}
	if turns > 10 {
		turns = 10
	}
	g.GameState.Lock()
	defer g.GameState.Unlock()
	g.GameState.SwapTurns = turns
}

// SetMutation sets the battle royale chain rule mutation; unknown values
// fall back to no mutation.
func (g *game) SetMutation(mutation string) {
	if mutation != MutationExactLength {
		mutation = MutationNone
	}
	g.GameState.Lock()
	defer g.GameState.Unlock()
	g.GameState.Mutation = mutation
}

func (g *game) SetRoundTime(time int) {
	g.GameState.Lock()
	defer g.GameState.Unlock()
	g.GameState.RoundTime = time
}

func (g *game) SetSubmitOnEnter(enabled bool) {
	g.GameState.Lock()
	defer g.GameState.Unlock()
	g.GameState.SubmitOnEnter = enabled
}

func (g *game) GetSubmitOnEnter() bool {
	g.GameState.Lock()
	defer g.GameState.Unlock()
	return g.GameState.SubmitOnEnter
}

func (g *game) GetRoundOver() bool {
	g.GameState.Lock()
	defer g.GameState.Unlock()
	return g.GameState.RoundOver
}

// GetRoundLetters returns the current atama/oshiri pair.
func (g *game) GetRoundLetters() (string, string) {
	g.GameState.Lock()
	defer g.GameState.Unlock()
	return g.GameState.Atama, g.GameState.Oshiri
}

// RecordOvershoot keeps the single biggest beat-the-chain margin of the game.
func (p *Player) RecordOvershoot(word string, over int) {
	p.Lock()
	defer p.Unlock()
	if over > p.stats.bestOvershoot {
		p.stats.bestOvershoot = over
		p.stats.overshootWord = word
	}
}

// RecordClutchTurn counts a turn survived while on the last life.
func (p *Player) RecordClutchTurn() {
	p.Lock()
	defer p.Unlock()
	p.stats.clutchTurns++
}

func (p *Player) SetOutOnTurn(turn int) {
	p.Lock()
	defer p.Unlock()
	p.stats.outOnTurn = turn
}

func (p *Player) SetLives(lives int) {
	p.Lock()
	defer p.Unlock()
	p.Lives = lives
}

func (p *Player) GetLives() int {
	p.Lock()
	defer p.Unlock()
	return p.Lives
}

func (p *Player) LoseLife() {
	p.Lock()
	defer p.Unlock()
	if p.Lives > 0 {
		p.Lives--
	}
}

func (p *Player) SetEliminated(eliminated bool) {
	p.Lock()
	defer p.Unlock()
	p.Eliminated = eliminated
}

func (p *Player) SetPlayerScore(score int) {
	p.Lock()
	defer p.Unlock()
	p.Score = score
}

func (p *Player) GetPlayerScore() int {
	p.Lock()
	defer p.Unlock()
	return p.Score
}

func (p *Player) SetRoundInput(input string) {
	p.Lock()
	defer p.Unlock()
	if p.submitted {
		return
	}
	p.roundInput = input
}

func (p *Player) GetRoundInput() string {
	p.Lock()
	defer p.Unlock()
	return p.roundInput
}

func (p *Player) SetSubmitted(submitted bool) {
	p.Lock()
	defer p.Unlock()
	p.submitted = submitted
}

func (p *Player) GetSubmitted() bool {
	p.Lock()
	defer p.Unlock()
	return p.submitted
}

// RecordTurn folds one finished turn into the player's game stats.
func (p *Player) RecordTurn(word string, accepted bool, elapsedMs int64) {
	p.Lock()
	defer p.Unlock()
	p.stats.turns++
	p.stats.totalMs += elapsedMs
	if accepted {
		if len([]rune(word)) > len([]rune(p.stats.longestWord)) {
			p.stats.longestWord = word
		}
		if p.stats.fastestMs < 0 || elapsedMs < p.stats.fastestMs {
			p.stats.fastestMs = elapsedMs
		}
	} else {
		p.stats.fails++
	}
}

func (p *Player) GetStats() playerStats {
	p.Lock()
	defer p.Unlock()
	return p.stats
}

func (p *Player) ResetStats() {
	p.Lock()
	defer p.Unlock()
	p.stats = playerStats{fastestMs: -1, submitMs: -1}
}

func (p *Player) SetSubmitMs(ms int64) {
	p.Lock()
	defer p.Unlock()
	p.stats.submitMs = ms
}

func (p *Player) GetSubmitMs() int64 {
	p.Lock()
	defer p.Unlock()
	return p.stats.submitMs
}

func (p *Player) SetPlayerClient(client *client) {
	p.Lock()
	defer p.Unlock()
	p.client = client
}

func (p *Player) GetClient() *client {
	p.Lock()
	defer p.Unlock()
	return p.client
}

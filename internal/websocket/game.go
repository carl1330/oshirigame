package websocket

import (
	"context"
	"encoding/json"
	"errors"
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
	sync.Mutex
}

// How long a disconnected player may reconnect before being removed from the game.
const reconnectGrace = 30 * time.Second

const (
	GameModeClassic = "classic"
	GameModeLongest = "longest"
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
	PlayerQueue      []*Player `json:"playerQueue"`
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
	roundInput string // this player's word in longest-word mode
	submitted  bool   // locked in their word this round (longest-word mode)
	client     *client
	sync.Mutex
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
		SubmitOnEnter:    false,
		PlayerQueue:      make([]*Player, 0),
	}
}

func NewPlayer(username string, token string, avatar string, client *client) *Player {
	return &Player{
		token:    token,
		IsLeader: false,
		Username: username,
		Avatar:   avatar,
		Score:    0,
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

	data := g.MarsalGameState()
	g.BroadcastMessage(ROUND_START, data)

	// Ticks buffered during the letter reveal would instantly eat the first
	// countdown second — restart the ticker now that the round is live.
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

	if len(g.players) > 0 {
		player := g.Dequeue()
		player.SetPlayerScore(player.GetPlayerScore() + g.WordList.GetScore(g.GameState.Atama+g.GameState.Input+g.GameState.Oshiri))

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
	for i, player := range queue {
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
	if mode != GameModeClassic && mode != GameModeLongest {
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
			// Don't drop the player immediately — give them a grace period
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

	data, _ := json.Marshal(gameOverResponse)
	g.BroadcastMessage(GAME_OVER, data)
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
	g.GameState.Unlock()

	// Reset all player scores but keep them in the game
	g.Lock()
	for _, player := range g.players {
		player.SetPlayerScore(0)
		player.Lock()
		player.roundInput = ""
		player.submitted = false
		player.Unlock()
	}
	g.Unlock()

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

package websocket

import (
	"context"
	"encoding/json"
	"errors"
	"math/rand"
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
	broadcast   chan *Message
	running     bool
	roundCtx    context.Context
	cancelRound context.CancelFunc
	sync.Mutex
}

type GameState struct {
	Started          bool      `json:"started"`
	Round            int       `json:"round"`
	MaxRounds        int       `json:"maxRounds"`
	Time             int       `json:"time"`
	RoundTime        int       `json:"roundTime"`
	WordCombinations int       `json:"wordCombinations"`
	PlayerQueue      []*Player `json:"playerQueue"`
	Input            string    `json:"input"`
	Atama            string    `json:"atama"`
	Oshiri           string    `json:"oshiri"`
	RoundOver        bool      `json:"roundOver"`
	TurnCount        int       `json:"-"` // Track turns in current round, not sent to client
	sync.Mutex
}

type Player struct {
	token    string
	IsLeader bool   `json:"isLeader"`
	Username string `json:"username"`
	Score    int    `json:"score"`
	client   *client
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
		players:    make(map[string]*Player),
		GameState:  NewGameState(),
		WordList:   oshirigame.NewWordList(),
		running:    false,
	}
}

func NewGameState() *GameState {
	return &GameState{
		Started:          false,
		Round:            1,
		MaxRounds:        10,
		Time:             0,
		RoundTime:        25,
		WordCombinations: 400,
		PlayerQueue:      make([]*Player, 0),
	}
}

func NewPlayer(username string, token string, client *client) *Player {
	return &Player{
		token:    token,
		IsLeader: false,
		Username: username,
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
	g.SetAtama(RandomLetter())
	g.SetOshiri(RandomLetter())
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

	//Generate random letters and check if that combination of letters has more than 400 possible words
	//If not try again until successful
	for {
		g.SetAtama(RandomLetter())
		g.SetOshiri(RandomLetter())
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

	data := g.MarsalGameState()
	g.BroadcastMessage(ROUND_START, data)

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

func (g *game) FinishRound() {
	// Check if game is still running (not cancelled)
	if !g.IsRunning() {
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

		g.SetGameRunning(false)

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
		case player := <-g.unregister:
			g.RemovePlayer(player.token)
			go g.BroadcastGameState()
		case message := <-g.broadcast:
			for _, player := range g.players {
				player.Lock()
				player.client.send <- message
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
	player.client.send <- message
}

func RandomLetter() string {
	var letters = []rune("abcdefghijklmnopqrstuvwxyz")
	return string(letters[rand.Intn(len(letters))])
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
		score    int
	}

	var scores []playerScore
	for _, player := range g.players {
		scores = append(scores, playerScore{
			username: player.Username,
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

func (p *Player) SetPlayerClient(client *client) {
	p.Lock()
	defer p.Unlock()
	p.client = client
}

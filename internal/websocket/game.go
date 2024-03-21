package websocket

import (
	"encoding/json"
	"errors"
	"math/rand"
	"sync"
	"time"

	haikunator "github.com/atrox/haikunatorgo/v2"
	"github.com/carl1330/oshirigame/internal/oshirigame"
)

type game struct {
	Id         string `json:"id"`
	players    map[string]*Player
	GameState  *GameState
	WordList   *oshirigame.WordList
	register   chan *Player
	unregister chan *client
	broadcast  chan *Message
	running    bool
	sync.Mutex
}

type GameState struct {
	Started     bool      `json:"started"`
	Round       int       `json:"round"`
	MaxRounds   int       `json:"maxRounds"`
	Time        int       `json:"time"`
	PlayerQueue []*Player `json:"playerQueue"`
	Input       string    `json:"input"`
	Atama       string    `json:"atama"`
	Oshiri      string    `json:"oshiri"`
	RoundOver   bool      `json:"roundOver"`
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
		Started:     false,
		Round:       0,
		MaxRounds:   10,
		Time:        10,
		PlayerQueue: make([]*Player, 0),
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
	if len(g.GameState.PlayerQueue) == 0 {
		player.IsLeader = true
	}
	g.GameState.PlayerQueue = append(g.GameState.PlayerQueue, player)
}

func (g *game) Dequeue() *Player {
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

func (g *game) InitializeGame() {
	g.SetGameStarted(true)
	g.SetAtama(RandomLetter())
	g.SetOshiri(RandomLetter())
	g.SetGameStateTime(10)
	g.SetGameStateInput("")
	g.SetRoundOver(false)
}

func (g *game) StartRound() {
	g.SetGameRunning(true)
	g.SetRoundOver(false)
	g.SetGameStateTime(10)
	g.SetGameStateInput("")
	data := g.MarsalGameState()
	g.BroadcastMessage(ROUND_START, data)
	for i := 0; i < 10; i++ {
		time.Sleep(1 * time.Second)
		g.DecreaseTime()
		g.BroadcastGameState()
	}
	g.FinishRound()
}

func (g *game) FinishRound() {
	player := g.Dequeue()
	player.SetPlayerScore(g.WordList.GetScore(g.GameState.Atama + g.GameState.Input + g.GameState.Oshiri))
	g.Enqueue(player)

	var roundOverResponse RoundOverResponse
	roundOverResponse.TopWords = g.WordList.TopWords(g.GameState.Atama, g.GameState.Oshiri)

	g.SetRoundOver(true)
	g.SetAtama(RandomLetter())
	g.SetAtama(RandomLetter())
	g.IncrementRound()

	roundOverResponse.GameState = g.MarsalGameState()

	data, _ := json.Marshal(roundOverResponse)

	g.BroadcastMessage(ROUND_FINISHED, data)

	for _, player := range g.players {
		g.SendPlayerState(player)
	}

	g.SetGameRunning(false)
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

func (p *Player) SetPlayerScore(score int) {
	p.Lock()
	defer p.Unlock()
	p.Score = score
}

func (p *Player) SetPlayerClient(client *client) {
	p.Lock()
	defer p.Unlock()
	p.client = client
}

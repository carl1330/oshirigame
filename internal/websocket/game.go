package websocket

import (
	"encoding/json"
	"errors"
	"fmt"
	"sync"
	"time"

	haikunator "github.com/atrox/haikunatorgo/v2"
)

type game struct {
	Id         string `json:"id"`
	players    map[string]*Player
	GameState  *GameState
	register   chan *Player
	unregister chan *client
	broadcast  chan *Message
	sync.Mutex
}

type GameState struct {
	Started     bool      `json:"started"`
	Round       int       `json:"round"`
	MaxRounds   int       `json:"maxRounds"`
	Time        int       `json:"time"`
	PlayerQueue []*Player `json:"playerQueue"`
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
		player.Lock()
		player.IsLeader = true
		player.Unlock()
	}
	g.GameState.PlayerQueue = append(g.GameState.PlayerQueue, player)
}

func (g *game) Dequeue() *Player {
	player := g.GameState.PlayerQueue[0]
	g.GameState.PlayerQueue = g.GameState.PlayerQueue[1:]
	return player
}

func (g *game) RemovePlayer(token string) {
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

func (g *game) StartRound() {
	g.GameState.Lock()
	g.GameState.Started = true
	g.GameState.Unlock()
	g.BroadcastGameState()

	for i := 0; i < 10; i++ {
		fmt.Println("time", g.GameState.Time)
		time.Sleep(1 * time.Second)
		g.GameState.Lock()
		g.GameState.Time--
		g.GameState.Unlock()
		g.BroadcastGameState()
	}
}

func (g *game) Countdown() {
	g.GameState.Started = true
	g.StartRound()
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
				player.client.send <- message
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

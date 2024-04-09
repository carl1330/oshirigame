package websocket

import (
	"encoding/json"
	"fmt"
	"net/http"
	"strings"

	"github.com/google/uuid"
	"github.com/gorilla/websocket"
)

var upgrader = websocket.Upgrader{
	ReadBufferSize:  1024,
	WriteBufferSize: 1024,
	CheckOrigin:     func(r *http.Request) bool { return true },
}

const (
	JOIN_GAME           = "JOIN_GAME"
	START_GAME          = "START_GAME"
	ROUND_START         = "ROUND_START"
	ROUND_ATAMA         = "ROUND_ATAMA"
	ROUND_OSHIRI        = "ROUND_OSHIRI"
	NEXT_ROUND          = "NEXT_ROUND"
	GAME_STATE          = "GAME_STATE"
	NEW_CLIENT          = "NEW_CLIENT"
	PLAYER_STATE        = "PLAYER_STATE"
	PLAYER_INPUT        = "PLAYER_INPUT"
	ROUND_FINISHED      = "ROUND_FINISHED"
	UPDATE_GAME_OPTIONS = "UPDATE_GAME_OPTIONS"
	ERROR               = "ERROR"
)

type handler struct {
	hub *hub
}

type Message struct {
	Type string          `json:"type"`
	Data json.RawMessage `json:"data"`
}

type JoinRoomMessage struct {
	Id       string
	Username string
	Token    string
}

type StartGameMessage struct {
	Id    string
	Token string
}

type PlayerInputMessage struct {
	Id    string
	Token string
	Input string
}

type GameOptionsUpdateMessage struct {
	MaxRounds           int
	RoundTime           int
	MinWordCombinations int
}

type RoundOverResponse struct {
	TopWords     []string        `json:"topWords"`
	GameState    json.RawMessage `json:"gameState"`
	Word         string          `json:"word"`
	WordAccepted bool            `json:"wordAccepted"`
}

type ErrorResponse struct {
	Message string `json:"message"`
}

type MessageHandler func(m *Message, c *client) error

func NewHandler(h *hub) *handler {
	return &handler{
		hub: h,
	}
}

func (h *handler) ServeWS(w http.ResponseWriter, r *http.Request) {
	token := r.URL.Query().Get("token")

	if token == "" {
		token = uuid.NewString()
	}

	conn, err := upgrader.Upgrade(w, r, nil)
	if err != nil {
		fmt.Println(err)
		return
	}

	client := NewClient(conn, token)
	h.hub.register <- client

	go client.WritePump(h.hub)
	client.send <- &Message{
		Type: NEW_CLIENT,
		Data: []byte(fmt.Sprintf(`{"token": "%s"}`, token)),
	}
	client.ReadPump(h.hub)

}

func (h *handler) CreateGame(w http.ResponseWriter, r *http.Request) {
	game := NewGame()
	h.hub.addgame <- game
	w.Write([]byte(fmt.Sprintf(`{"id": "%s"}`, game.Id)))
	go game.Run()
}

func (h *hub) JoinRoom(m *Message, c *client) error {
	var joinRoomMessage JoinRoomMessage
	err := json.Unmarshal(m.Data, &joinRoomMessage)

	if err != nil {
		return fmt.Errorf("error unmarshalling message data")
	}

	if len(joinRoomMessage.Username) > 20 {
		errMsg := &ErrorResponse{
			Message: "Username too long",
		}
		data, _ := json.Marshal(errMsg)
		c.send <- &Message{
			Type: ERROR,
			Data: data,
		}
		return fmt.Errorf("username too long")
	}

	game, err := h.GetGame(joinRoomMessage.Id)

	if err != nil {
		return err
	}

	if game.GetStarted() {
		errMsg := &ErrorResponse{
			Message: "Can't join room, game has already started",
		}

		data, err := json.Marshal(errMsg)

		if err != nil {
			return fmt.Errorf("can't join gameroom, game already started")
		}

		c.send <- &Message{
			Type: ERROR,
			Data: data,
		}
		return fmt.Errorf("can't join gameroom, game already started")
	}

	player, err := game.GetPlayer(joinRoomMessage.Token)

	if err != nil {
		player = NewPlayer(joinRoomMessage.Username, joinRoomMessage.Token, c)
	} else {
		player.SetPlayerClient(c)
	}

	c.SetClientGameId(game.Id)
	game.register <- player

	return nil
}

func (h *hub) StartGame(m *Message, c *client) error {
	var startGameMessage StartGameMessage
	err := json.Unmarshal(m.Data, &startGameMessage)

	if err != nil {
		return err
	}

	game, err := h.GetGame(startGameMessage.Id)

	if err != nil {
		return err
	}

	game.InitializeGame()
	go game.StartRound()
	game.GameState.Lock()
	data, _ := json.Marshal(game.GameState)
	game.GameState.Unlock()
	message := &Message{
		Type: START_GAME,
		Data: data,
	}
	game.broadcast <- message

	return nil
}

func (h *hub) StartRound(m *Message, c *client) error {
	game, err := h.GetGame(c.gameId)

	if err != nil {
		return err
	}

	player, err := game.GetPlayer(c.token)

	if err != nil {
		return err
	}

	if !player.IsLeader {
		return fmt.Errorf("player is not leader")
	}

	if !game.IsRunning() {
		go game.StartRound()
	}
	return nil
}

func (h *hub) NextRound(m *Message, c *client) error {
	game, err := h.GetGame(c.gameId)

	if err != nil {
		return err
	}

	data, _ := json.Marshal(game.GameState)

	game.broadcast <- &Message{
		Type: NEXT_ROUND,
		Data: data,
	}

	if !game.IsRunning() {
		go game.StartRound()
	}
	return nil
}

func (h *hub) PlayerInput(m *Message, c *client) error {
	var playerInputMessage PlayerInputMessage
	err := json.Unmarshal(m.Data, &playerInputMessage)

	if err != nil {
		return fmt.Errorf("error unmarshalling message data")
	}

	game, err := h.GetGame(c.gameId)

	if err != nil {
		return err
	}

	player, err := game.GetPlayer(c.token)

	if err != nil {
		return err
	}

	if !player.IsLeader {
		return fmt.Errorf("player is not leader")
	}

	if !game.GameState.Started {
		return fmt.Errorf("game not started")
	}

	game.GameState.Lock()
	game.GameState.Input = strings.ToLower(playerInputMessage.Input)
	game.GameState.Unlock()

	game.BroadcastGameState()

	return nil
}

func (h *hub) UpdateGameOptions(m *Message, c *client) error {
	var gameOptionsUpdateMessage GameOptionsUpdateMessage
	err := json.Unmarshal(m.Data, &gameOptionsUpdateMessage)

	if err != nil {
		return fmt.Errorf("error unmarshalling json")
	}

	game, err := h.GetGame(c.gameId)

	if err != nil {
		return err
	}

	game.SetMaxRounds(gameOptionsUpdateMessage.MaxRounds)
	game.SetWordCombinations(gameOptionsUpdateMessage.MinWordCombinations)
	game.SetRoundTime(gameOptionsUpdateMessage.RoundTime)

	game.BroadcastGameState()

	return nil
}

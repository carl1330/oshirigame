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
	JOIN_GAME      = "JOIN_GAME"
	START_GAME     = "START_GAME"
	ROUND_START    = "ROUND_START"
	NEXT_ROUND     = "NEXT_ROUND"
	GAME_STATE     = "GAME_STATE"
	NEW_CLIENT     = "NEW_CLIENT"
	PLAYER_STATE   = "PLAYER_STATE"
	PLAYER_INPUT   = "PLAYER_INPUT"
	ROUND_FINISHED = "ROUND_FINISHED"
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

type RoundOverResponse struct {
	TopWords  []string   `json:"topWords"`
	GameState *GameState `json:"gameState"`
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

	go client.ReadPump(h.hub)
	go client.WritePump(h.hub)

	client.send <- &Message{
		Type: NEW_CLIENT,
		Data: []byte(fmt.Sprintf(`{"token": "%s"}`, token)),
	}

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

	game, err := h.GetGame(joinRoomMessage.Id)

	if err != nil {
		return err
	}

	player, err := game.GetPlayer(joinRoomMessage.Token)

	if err != nil {
		player = NewPlayer(joinRoomMessage.Username, joinRoomMessage.Token, c)
	} else {
		player.client = c
	}

	c.Lock()
	c.gameId = game.Id
	c.Unlock()
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

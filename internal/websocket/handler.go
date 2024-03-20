package websocket

import (
	"encoding/json"
	"fmt"
	"net/http"

	"github.com/google/uuid"
	"github.com/gorilla/websocket"
)

var upgrader = websocket.Upgrader{
	ReadBufferSize:  1024,
	WriteBufferSize: 1024,
	CheckOrigin:     func(r *http.Request) bool { return true },
}

const (
	JOIN_GAME    = "JOIN_GAME"
	START_GAME   = "START_GAME"
	GAME_STATE   = "GAME_STATE"
	NEW_CLIENT   = "NEW_CLIENT"
	PLAYER_STATE = "PLAYER_STATE"
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
		player.Lock()
		player.client = c
		player.Unlock()
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

	go game.StartRound()

	return nil
}

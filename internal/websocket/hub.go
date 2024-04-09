package websocket

import (
	"errors"
	"sync"
)

type hub struct {
	clients    map[string]*client
	games      map[string]*game
	register   chan *client
	unregister chan *client
	addgame    chan *game
	removegame chan *game
	broadcast  chan *Message
	handlers   map[string]MessageHandler
	sync.Mutex
}

var (
	ErrEventNotSupported = errors.New("this event type is not supported")
)

func NewHub() *hub {
	h := &hub{
		clients:    make(map[string]*client),
		games:      make(map[string]*game),
		register:   make(chan *client),
		unregister: make(chan *client),
		addgame:    make(chan *game),
		removegame: make(chan *game),
		broadcast:  make(chan *Message),
		handlers:   make(map[string]MessageHandler),
	}
	h.handlers[JOIN_GAME] = h.JoinRoom
	h.handlers[START_GAME] = h.StartGame
	h.handlers[ROUND_START] = h.StartRound
	h.handlers[PLAYER_INPUT] = h.PlayerInput
	h.handlers[NEXT_ROUND] = h.NextRound
	h.handlers[UPDATE_GAME_OPTIONS] = h.UpdateGameOptions
	return h
}

func (h *hub) Run() {
	for {
		select {
		case client := <-h.register:
			h.Lock()
			h.clients[client.token] = client
			h.Unlock()
		case client := <-h.unregister:
			if game, ok := h.games[client.gameId]; ok {
				game.unregister <- client
				game.Lock()
				if len(game.players) == 0 {
					h.removegame <- game
				}
				game.Unlock()
			}
			delete(h.clients, client.token)
		case game := <-h.addgame:
			h.Lock()
			h.games[game.Id] = game
			h.Unlock()
		case game := <-h.removegame:
			h.Lock()
			delete(h.games, game.Id)
			h.Unlock()
		case message := <-h.broadcast:
			for _, client := range h.clients {
				client.send <- message
			}
		}
	}
}

func (h *hub) GetGame(id string) (*game, error) {
	h.Lock()
	defer h.Unlock()
	if room, ok := h.games[id]; ok {
		return room, nil
	}
	return nil, errors.New("room not found")
}

func (h *hub) GetClient(token string) (*client, error) {
	h.Lock()
	defer h.Unlock()
	if c, ok := h.clients[token]; ok {
		return c, nil
	}
	return nil, errors.New("client not found")
}

func (h *hub) RouteMessage(m *Message, c *client) error {
	if handler, ok := h.handlers[m.Type]; ok {
		if err := handler(m, c); err != nil {
			return err
		}
		return nil
	} else {
		return ErrEventNotSupported
	}
}

package websocket

import (
	"encoding/json"
	"fmt"
	"log"
	"sync"
	"time"

	"github.com/gorilla/websocket"
)

const (
	// Time allowed to write a message to the peer.
	writeWait = 10 * time.Second

	// Time allowed to read the next pong message from the peer.
	pongWait = 10 * time.Second

	// Send pings to peer with this period. Must be less than pongWait.
	pingPeriod = (pongWait * 9) / 10

	// Maximum message size allowed from peer.
	maxMessageSize = 512
)

type client struct {
	token  string
	gameId string
	conn   *websocket.Conn
	send   chan *Message
	sync.Mutex
}

func NewClient(conn *websocket.Conn, token string) *client {
	return &client{
		token:  token,
		gameId: "",
		conn:   conn,
		send:   make(chan *Message),
	}
}

func (c *client) ReadPump(h *hub) {
	defer func() {
		h.unregister <- c
		c.conn.Close()
	}()
	c.conn.SetReadLimit(maxMessageSize)
	c.conn.SetReadDeadline(time.Now().Add(pongWait))
	c.conn.SetPongHandler(func(appData string) error {
		c.conn.SetReadDeadline(time.Now().Add(pongWait))
		return nil
	})

	for {
		_, message, err := c.conn.ReadMessage()
		if err != nil {
			if websocket.IsUnexpectedCloseError(err, websocket.CloseGoingAway, websocket.CloseAbnormalClosure) {
				log.Printf("error: %v", err)
			}
			break
		}

		var m *Message
		if err := json.Unmarshal(message, &m); err != nil {
			fmt.Printf("error unmarshalling: %v", err)
		}

		if err := h.RouteMessage(m, c); err != nil {
			fmt.Println(err)
		}
	}
}

func (c *client) WritePump(h *hub) {
	ticker := time.NewTicker(pingPeriod)
	defer func() {
		ticker.Stop()
		c.conn.Close()
	}()
	for {
		select {
		case message, ok := <-c.send:
			if !ok {
				return
			}

			c.conn.WriteJSON(message)
		case <-ticker.C:
			c.conn.SetWriteDeadline(time.Now().Add(writeWait))
			if err := c.conn.WriteMessage(websocket.PingMessage, nil); err != nil {
				return
			}
		}
	}
}

func (c *client) SetClientGameId(id string) {
	c.Lock()
	defer c.Unlock()
	c.gameId = id
}

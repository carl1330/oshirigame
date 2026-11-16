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
	GAME_OVER           = "GAME_OVER"
	RESET_GAME          = "RESET_GAME"
	END_TURN            = "END_TURN"
	ALL_WORDS           = "ALL_WORDS"
	ROOM_NOT_FOUND      = "ROOM_NOT_FOUND"
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
	Avatar   string
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
	Language            string
	GameMode            string
	BannedAtama         string
	BannedOshiri        string
	SubmitOnEnter       bool
	Lives               int
	SwapTurns           int
}

type AllWordsResponse struct {
	Atama  string   `json:"atama"`
	Oshiri string   `json:"oshiri"`
	Words  []string `json:"words"`
}

type RoundOverResponse struct {
	TopWords     []string           `json:"topWords"`
	GameState    json.RawMessage    `json:"gameState"`
	Word         string             `json:"word"`
	WordAccepted bool               `json:"wordAccepted"`
	PlayerWords  []PlayerWordResult `json:"playerWords,omitempty"`
	// Battle royale extras: who played, whether the word was merely too short,
	// the length it had to reach, and who (if anyone) got knocked out.
	TurnUsername     string `json:"turnUsername,omitempty"`
	TooShort         bool   `json:"tooShort,omitempty"`
	NeededLength     int    `json:"neededLength,omitempty"`
	EliminatedPlayer string `json:"eliminatedPlayer,omitempty"`
	// Seconds until the server starts the next turn on its own (0 = it won't,
	// e.g. the game is ending)
	AutoNextIn int `json:"autoNextIn,omitempty"`
}

// PlayerWordResult is one player's outcome in a longest-word round.
type PlayerWordResult struct {
	Username string `json:"username"`
	Avatar   string `json:"avatar"`
	Word     string `json:"word"`
	Accepted bool   `json:"accepted"`
	Winner   bool   `json:"winner"`
}

type GameOverResponse struct {
	Winners []PlayerRanking `json:"winners"`
	Awards  []Award         `json:"awards"`
}

// Award is one end-of-game superlative ("longest word", "fastest answer"...).
// Value is pre-formatted: the word itself, "3.2s", or a count.
type Award struct {
	Id       string `json:"id"`
	Username string `json:"username"`
	Avatar   string `json:"avatar"`
	Value    string `json:"value"`
}

type PlayerRanking struct {
	Username string `json:"username"`
	Avatar   string `json:"avatar"`
	Score    int    `json:"score"`
	Rank     int    `json:"rank"`
	// Stat replaces the points display when set (battle royale survival story)
	Stat string `json:"stat,omitempty"`
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
		c.send <- &Message{
			Type: ROOM_NOT_FOUND,
			Data: []byte(`{}`),
		}
		return err
	}

	// Avatar config is a short client-generated string; cap it defensively
	if len(joinRoomMessage.Avatar) > 64 {
		joinRoomMessage.Avatar = ""
	}

	// A known token may rejoin a started game (reconnect); only brand-new
	// players are locked out once the game is running.
	player, playerErr := game.GetPlayer(joinRoomMessage.Token)

	if playerErr != nil {
		if game.GetStarted() {
			errMsg := &ErrorResponse{
				Message: "Can't join room, game has already started",
			}
			data, _ := json.Marshal(errMsg)
			c.send <- &Message{
				Type: ERROR,
				Data: data,
			}
			return fmt.Errorf("can't join gameroom, game already started")
		}
		player = NewPlayer(joinRoomMessage.Username, joinRoomMessage.Token, joinRoomMessage.Avatar, c)
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

	if !game.GetStarted() {
		return fmt.Errorf("game not started")
	}

	// Longest-word mode: everyone types their own hidden word at the same time
	if game.GetGameMode() == GameModeLongest {
		if game.GetRoundOver() {
			return nil
		}
		input := strings.ToLower(playerInputMessage.Input)
		if len([]rune(input)) > 45 {
			input = string([]rune(input)[:45])
		}
		player.SetRoundInput(input)
		return nil
	}

	if !player.IsLeader {
		return fmt.Errorf("player is not leader")
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

	game.SetGameMode(gameOptionsUpdateMessage.GameMode)
	game.SetMaxRounds(gameOptionsUpdateMessage.MaxRounds)
	game.SetWordCombinations(gameOptionsUpdateMessage.MinWordCombinations)
	game.SetRoundTime(gameOptionsUpdateMessage.RoundTime)
	// Language first so banned letters are sanitized against the right alphabet
	game.SetLanguage(gameOptionsUpdateMessage.Language)
	game.SetBannedLetters(gameOptionsUpdateMessage.BannedAtama, gameOptionsUpdateMessage.BannedOshiri)
	game.SetSubmitOnEnter(gameOptionsUpdateMessage.SubmitOnEnter)
	game.SetLives(gameOptionsUpdateMessage.Lives)
	game.SetSwapTurns(gameOptionsUpdateMessage.SwapTurns)

	game.BroadcastGameState()

	return nil
}

// EndTurn lets the active player finish the round before the timer runs out.
// Only allowed when the submit-on-enter option is enabled.
func (h *hub) EndTurn(m *Message, c *client) error {
	game, err := h.GetGame(c.gameId)

	if err != nil {
		return err
	}

	player, err := game.GetPlayer(c.token)

	if err != nil {
		return err
	}

	if !game.GetStarted() || game.GetRoundOver() || !game.IsRunning() {
		return fmt.Errorf("no active round to end")
	}

	// Longest-word mode: Enter locks in this player's word; the round ends
	// early once everyone has locked in.
	if game.GetGameMode() == GameModeLongest {
		player.SetSubmitMs(game.roundElapsedMs())
		player.SetSubmitted(true)
		if game.AllSubmitted() {
			game.EndTurnEarly()
		}
		return nil
	}

	if !player.IsLeader {
		return fmt.Errorf("not this player's turn")
	}

	// Battle royale always submits on Enter — the chain lives on speed
	if game.GetGameMode() != GameModeRoyale && !game.GetSubmitOnEnter() {
		return fmt.Errorf("submit on enter is disabled")
	}

	game.EndTurnEarly()

	return nil
}

// AllWords sends the requesting client every valid word for the finished
// round's letters. Only available once the round is over, so it can't be
// used to cheat mid-round.
func (h *hub) AllWords(m *Message, c *client) error {
	game, err := h.GetGame(c.gameId)

	if err != nil {
		return err
	}

	if !game.GetRoundOver() {
		return fmt.Errorf("round is not over")
	}

	// Battle royale keeps the same letters for several turns — revealing the
	// word list mid-cycle would spoil the turns still to play on it
	if game.GetGameMode() == GameModeRoyale && !game.ShouldSwapLetters() && !game.RoyaleGameOver() {
		return fmt.Errorf("letters are still in play")
	}

	atama, oshiri := game.GetRoundLetters()
	response := AllWordsResponse{
		Atama:  atama,
		Oshiri: oshiri,
		Words:  game.WordList.AllWords(atama, oshiri),
	}

	data, err := json.Marshal(response)

	if err != nil {
		return err
	}

	c.send <- &Message{
		Type: ALL_WORDS,
		Data: data,
	}

	return nil
}

func (h *hub) ResetGame(m *Message, c *client) error {
	game, err := h.GetGame(c.gameId)

	if err != nil {
		return err
	}

	player, err := game.GetPlayer(c.token)

	if err != nil {
		return err
	}

	// Only leader can reset the game
	if !player.IsLeader {
		return fmt.Errorf("only leader can reset game")
	}

	// Reset game to lobby state
	game.ResetToLobby()

	// Broadcast updated game state to all players
	game.BroadcastGameState()

	return nil
}

package daily

import (
	"encoding/json"
	"errors"
	"net/http"
	"regexp"
	"strings"

	"github.com/carl1330/oshirigame/internal/oshirigame"
)

const leaderboardLimit = 50

type Handler struct {
	store *Store
}

func NewHandler(store *Store) *Handler {
	return &Handler{store: store}
}

type challengeResponse struct {
	Day       string  `json:"day"`
	Language  string  `json:"language"`
	RoundTime int     `json:"roundTime"`
	Combos    []Combo `json:"combos"`
	// Played is true when the requesting token already submitted today.
	Played bool   `json:"played"`
	Entry  *Entry `json:"entry,omitempty"`
}

type submitRequest struct {
	Token    string   `json:"token"`
	Username string   `json:"username"`
	Avatar   string   `json:"avatar"`
	Language string   `json:"language"`
	Words    []string `json:"words"`
}

type submitResponse struct {
	Day     string        `json:"day"`
	Score   int           `json:"score"`
	Rank    int           `json:"rank"`
	Results []RoundResult `json:"results"`
}

type leaderboardResponse struct {
	Day      string  `json:"day"`
	Language string  `json:"language"`
	Entries  []Entry `json:"entries"`
	Total    int     `json:"total"`
}

func writeJSON(w http.ResponseWriter, status int, v any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	json.NewEncoder(w).Encode(v)
}

func writeError(w http.ResponseWriter, status int, message string) {
	writeJSON(w, status, map[string]string{"error": message})
}

func requestLanguage(r *http.Request) string {
	language := r.URL.Query().Get("language")
	if !oshirigame.IsValidLanguage(language) {
		language = string(oshirigame.English)
	}
	return language
}

// GetChallenge returns today's letter combinations, and the caller's existing
// entry when their token already played.
func (h *Handler) GetChallenge(w http.ResponseWriter, r *http.Request) {
	language := requestLanguage(r)
	day := Today()
	response := challengeResponse{
		Day:       day,
		Language:  language,
		RoundTime: RoundTime,
		Combos:    Combos(day, oshirigame.Language(language)),
	}
	if token := r.URL.Query().Get("token"); token != "" {
		entry, _, err := h.store.GetEntry(day, language, token)
		if err == nil {
			response.Played = true
			response.Entry = &entry
		}
	}
	writeJSON(w, http.StatusOK, response)
}

var tokenPattern = regexp.MustCompile(`^[A-Za-z0-9-]{8,64}$`)

// Submit validates and scores a finished run, stores it, and returns the
// per-round verdicts plus the player's rank.
func (h *Handler) Submit(w http.ResponseWriter, r *http.Request) {
	var req submitRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid request body")
		return
	}

	req.Username = strings.TrimSpace(req.Username)
	if req.Username == "" || len(req.Username) > 20 {
		writeError(w, http.StatusBadRequest, "username must be 1-20 characters")
		return
	}
	if !tokenPattern.MatchString(req.Token) {
		writeError(w, http.StatusBadRequest, "invalid token")
		return
	}
	if len(req.Avatar) > 64 {
		req.Avatar = ""
	}
	if len(req.Words) > Rounds {
		writeError(w, http.StatusBadRequest, "too many words")
		return
	}

	language := req.Language
	if !oshirigame.IsValidLanguage(language) {
		language = string(oshirigame.English)
	}

	day := Today()
	combos := Combos(day, oshirigame.Language(language))
	wordList := oshirigame.GetWordList(oshirigame.Language(language))

	words := make([]string, len(req.Words))
	for i, word := range req.Words {
		words[i] = strings.ToLower(strings.TrimSpace(word))
		if len([]rune(words[i])) > 45 {
			words[i] = ""
		}
	}

	results, score := ScoreWords(combos, words, wordList)

	err := h.store.SubmitScore(day, language, req.Token, req.Username, req.Avatar, score, results)
	if errors.Is(err, ErrAlreadyPlayed) {
		writeError(w, http.StatusConflict, "already played today")
		return
	}
	if err != nil {
		writeError(w, http.StatusInternalServerError, "could not save score")
		return
	}

	entry, _, err := h.store.GetEntry(day, language, req.Token)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "could not read score")
		return
	}

	writeJSON(w, http.StatusOK, submitResponse{
		Day:     day,
		Score:   score,
		Rank:    entry.Rank,
		Results: results,
	})
}

// Leaderboard returns the top entries for a day (today by default).
func (h *Handler) Leaderboard(w http.ResponseWriter, r *http.Request) {
	language := requestLanguage(r)
	day := r.URL.Query().Get("day")
	if day == "" || !dayPattern.MatchString(day) {
		day = Today()
	}
	entries, total, err := h.store.Leaderboard(day, language, leaderboardLimit)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "could not read leaderboard")
		return
	}
	writeJSON(w, http.StatusOK, leaderboardResponse{
		Day:      day,
		Language: language,
		Entries:  entries,
		Total:    total,
	})
}

var dayPattern = regexp.MustCompile(`^\d{4}-\d{2}-\d{2}$`)

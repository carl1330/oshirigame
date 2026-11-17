package daily

import (
	"encoding/json"
	"errors"
	"net/http"
	"regexp"
	"strings"
	"time"

	"github.com/carl1330/oshirigame/internal/oshirigame"
)

const leaderboardLimit = 50

type Handler struct {
	store *Store
	// now is swappable in tests.
	now func() int64
}

func NewHandler(store *Store) *Handler {
	return &Handler{store: store, now: func() int64 { return time.Now().Unix() }}
}

// runState tells a reloading client where an in-progress run stands so it can
// resume instead of restarting. Round is the first unplayed round;
// RoundStartedAt is zero when that round's clock has not been started yet
// (the player is on the verdict screen deciding when to continue).
type runState struct {
	StartedAt      int64          `json:"startedAt"`
	Now            int64          `json:"now"`
	Round          int            `json:"round"`
	RoundStartedAt int64          `json:"roundStartedAt"`
	Results        []*RoundResult `json:"results"`
}

// firstUnlocked returns the index of the first round without a verdict, or
// len(results) when every round is locked.
func firstUnlocked(results []*RoundResult) int {
	for i, r := range results {
		if r == nil {
			return i
		}
	}
	return len(results)
}

type challengeResponse struct {
	Day       string  `json:"day"`
	Language  string  `json:"language"`
	RoundTime int     `json:"roundTime"`
	Combos    []Combo `json:"combos"`
	// Played is true when the requesting token already submitted today.
	Played bool   `json:"played"`
	Entry  *Entry `json:"entry,omitempty"`
	// Results are the player's submitted words, so a return visit can show
	// the day's answers again.
	Results []RoundResult `json:"results,omitempty"`
	Run     *runState     `json:"run,omitempty"`
}

type startRequest struct {
	Token    string `json:"token"`
	Username string `json:"username"`
	Avatar   string `json:"avatar"`
	Language string `json:"language"`
}

type startResponse struct {
	Day       string `json:"day"`
	StartedAt int64  `json:"startedAt"`
	Now       int64  `json:"now"`
}

type lockRequest struct {
	Token    string `json:"token"`
	Language string `json:"language"`
	Round    int    `json:"round"`
	Word     string `json:"word"`
}

type submitRequest struct {
	Token    string `json:"token"`
	Language string `json:"language"`
}

type nextRequest struct {
	Token    string `json:"token"`
	Language string `json:"language"`
}

type nextResponse struct {
	Round          int   `json:"round"`
	RoundStartedAt int64 `json:"roundStartedAt"`
	Now            int64 `json:"now"`
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

func normalizeLanguage(language string) string {
	if !oshirigame.IsValidLanguage(language) {
		return string(oshirigame.English)
	}
	return language
}

// GetChallenge returns today's letter combinations, plus the caller's run in
// progress (so a page reload resumes instead of restarting) or their finished
// entry.
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
		if entry, results, err := h.store.GetEntry(day, language, token); err == nil {
			response.Played = true
			response.Entry = &entry
			response.Results = results
		} else if run, err := h.loadRun(day, language, token); err == nil {
			if firstUnlocked(run.Results) >= Rounds {
				// Every round is locked: score the run so the attempt counts
				// even if the player never pressed the final button.
				if _, _, err := h.finalizeRun(day, language, token, run); err == nil {
					if entry, results, err := h.store.GetEntry(day, language, token); err == nil {
						response.Played = true
						response.Entry = &entry
						response.Results = results
					}
				}
			} else {
				response.Run = h.runStateFor(run)
			}
		}
	}
	writeJSON(w, http.StatusOK, response)
}

// loadRun fetches a run and locks the current round as unanswered if its
// clock ran out while the page was away, so reloading can't buy extra time.
func (h *Handler) loadRun(day, language, token string) (Run, error) {
	run, err := h.store.GetRun(day, language, token)
	if err != nil {
		return Run{}, err
	}
	cur := firstUnlocked(run.Results)
	if cur < len(run.Results) && run.StartedRound == cur &&
		h.now() > RoundDeadline(run.RoundStartedAt)+GraceSeconds {
		combos := Combos(day, oshirigame.Language(language))
		result := RoundResult{Atama: combos[cur].Atama, Oshiri: combos[cur].Oshiri}
		if err := h.store.SetRunResult(day, language, token, cur, result); err == nil {
			run.Results[cur] = &result
		}
	}
	return run, nil
}

func (h *Handler) runStateFor(run Run) *runState {
	cur := firstUnlocked(run.Results)
	state := &runState{
		StartedAt: run.StartedAt,
		Now:       h.now(),
		Round:     cur,
		Results:   run.Results,
	}
	// The current round's clock only counts once the player advanced to it
	if run.StartedRound == cur {
		state.RoundStartedAt = run.RoundStartedAt
	}
	return state
}

var tokenPattern = regexp.MustCompile(`^[A-Za-z0-9-]{8,64}$`)

// Start begins (or idempotently resumes) today's run for a token. The clock
// starts server-side here; a reload cannot restart it.
func (h *Handler) Start(w http.ResponseWriter, r *http.Request) {
	var req startRequest
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
	language := normalizeLanguage(req.Language)
	day := Today()

	if _, _, err := h.store.GetEntry(day, language, req.Token); err == nil {
		writeError(w, http.StatusConflict, "already played today")
		return
	}

	run, err := h.store.StartRun(day, language, req.Token, req.Username, req.Avatar, h.now())
	if err != nil {
		writeError(w, http.StatusInternalServerError, "could not start run")
		return
	}
	writeJSON(w, http.StatusOK, startResponse{
		Day:       day,
		StartedAt: run.StartedAt,
		Now:       h.now(),
	})
}

// LockWord scores and permanently locks in one round's word. Each round can
// only be locked once, and only before its deadline — late words score zero.
func (h *Handler) LockWord(w http.ResponseWriter, r *http.Request) {
	var req lockRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid request body")
		return
	}
	if !tokenPattern.MatchString(req.Token) {
		writeError(w, http.StatusBadRequest, "invalid token")
		return
	}
	language := normalizeLanguage(req.Language)
	day := Today()
	combos := Combos(day, oshirigame.Language(language))
	if req.Round < 0 || req.Round >= len(combos) {
		writeError(w, http.StatusBadRequest, "invalid round")
		return
	}

	run, err := h.store.GetRun(day, language, req.Token)
	if errors.Is(err, ErrNoRun) {
		writeError(w, http.StatusBadRequest, "run not started")
		return
	}
	if err != nil {
		writeError(w, http.StatusInternalServerError, "could not read run")
		return
	}

	// Locking an already-decided round returns the standing verdict
	if req.Round < len(run.Results) && run.Results[req.Round] != nil {
		writeJSON(w, http.StatusOK, *run.Results[req.Round])
		return
	}
	// Only the round whose clock is running can be locked
	if run.StartedRound != req.Round {
		writeError(w, http.StatusBadRequest, "round not started")
		return
	}

	word := strings.ToLower(strings.TrimSpace(req.Word))
	if len([]rune(word)) > 45 {
		word = ""
	}
	// A word arriving after the round's deadline no longer counts.
	if h.now() > RoundDeadline(run.RoundStartedAt)+GraceSeconds {
		word = ""
	}

	wordList := oshirigame.GetWordList(oshirigame.Language(language))
	results, _ := ScoreWords(combos[req.Round:req.Round+1], []string{word}, wordList)
	result := results[0]

	err = h.store.SetRunResult(day, language, req.Token, req.Round, result)
	if errors.Is(err, ErrRoundLocked) {
		// Return the verdict that already stands; locking twice never
		// changes the outcome.
		if run.Results[req.Round] != nil {
			writeJSON(w, http.StatusOK, *run.Results[req.Round])
			return
		}
		writeError(w, http.StatusConflict, "round already locked")
		return
	}
	if err != nil {
		writeError(w, http.StatusInternalServerError, "could not save word")
		return
	}
	writeJSON(w, http.StatusOK, result)
}

// NextRound starts the clock on the next unplayed round. The player controls
// when this happens (the verdict screen waits for them), but once started a
// round's deadline is fixed server-side. Idempotent: if the round is already
// running, the original start time is returned.
func (h *Handler) NextRound(w http.ResponseWriter, r *http.Request) {
	var req nextRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid request body")
		return
	}
	if !tokenPattern.MatchString(req.Token) {
		writeError(w, http.StatusBadRequest, "invalid token")
		return
	}
	language := normalizeLanguage(req.Language)
	day := Today()

	run, err := h.loadRun(day, language, req.Token)
	if errors.Is(err, ErrNoRun) {
		writeError(w, http.StatusBadRequest, "run not started")
		return
	}
	if err != nil {
		writeError(w, http.StatusInternalServerError, "could not read run")
		return
	}

	cur := firstUnlocked(run.Results)
	if cur >= Rounds {
		writeError(w, http.StatusConflict, "run already finished")
		return
	}
	if run.StartedRound != cur {
		now := h.now()
		if err := h.store.StartRound(day, language, req.Token, cur, now); err != nil {
			writeError(w, http.StatusInternalServerError, "could not start round")
			return
		}
		run.StartedRound = cur
		run.RoundStartedAt = now
	}
	writeJSON(w, http.StatusOK, nextResponse{
		Round:          cur,
		RoundStartedAt: run.RoundStartedAt,
		Now:            h.now(),
	})
}

// finalizeRun turns a run's locked-in results into a leaderboard entry.
// Rounds that were never locked count as unanswered.
func (h *Handler) finalizeRun(day, language, token string, run Run) (int, []RoundResult, error) {
	combos := Combos(day, oshirigame.Language(language))
	results := make([]RoundResult, len(combos))
	score := 0
	for i, combo := range combos {
		if i < len(run.Results) && run.Results[i] != nil {
			results[i] = *run.Results[i]
		} else {
			results[i] = RoundResult{Atama: combo.Atama, Oshiri: combo.Oshiri}
		}
		score += results[i].Score
	}
	err := h.store.SubmitScore(day, language, token, run.Username, run.Avatar, score, results)
	return score, results, err
}

// Submit finalizes the caller's run. The words were already locked in round by
// round, so the client sends nothing but its token.
func (h *Handler) Submit(w http.ResponseWriter, r *http.Request) {
	var req submitRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid request body")
		return
	}
	if !tokenPattern.MatchString(req.Token) {
		writeError(w, http.StatusBadRequest, "invalid token")
		return
	}
	language := normalizeLanguage(req.Language)
	day := Today()

	run, err := h.store.GetRun(day, language, req.Token)
	if errors.Is(err, ErrNoRun) {
		writeError(w, http.StatusBadRequest, "run not started")
		return
	}
	if err != nil {
		writeError(w, http.StatusInternalServerError, "could not read run")
		return
	}

	score, results, err := h.finalizeRun(day, language, req.Token, run)
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

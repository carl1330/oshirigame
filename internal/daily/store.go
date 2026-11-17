package daily

import (
	"database/sql"
	"encoding/json"
	"errors"
	"os"
	"path/filepath"
	"strings"

	_ "modernc.org/sqlite"
)

// ErrAlreadyPlayed means this token already has a score for the day.
var ErrAlreadyPlayed = errors.New("already played today")

// ErrRoundLocked means a word was already locked in for this round.
var ErrRoundLocked = errors.New("round already locked")

// ErrNoRun means no run has been started for this token today.
var ErrNoRun = errors.New("run not started")

type Store struct {
	db *sql.DB
}

type Entry struct {
	Rank     int    `json:"rank"`
	Username string `json:"username"`
	Avatar   string `json:"avatar"`
	Score    int    `json:"score"`
	// Results are the entry's played words; only sent to viewers who have
	// finished their own run (words must not leak mid-day to active players).
	Results []RoundResult `json:"results,omitempty"`
}

// NewStore opens (and migrates) the sqlite database at path, creating parent
// directories as needed.
func NewStore(path string) (*Store, error) {
	if dir := filepath.Dir(path); dir != "." {
		if err := os.MkdirAll(dir, 0o755); err != nil {
			return nil, err
		}
	}
	db, err := sql.Open("sqlite", path)
	if err != nil {
		return nil, err
	}
	// sqlite handles one writer at a time; serializing through a single
	// connection avoids SQLITE_BUSY under concurrent submissions.
	db.SetMaxOpenConns(1)
	if _, err := db.Exec(`
		CREATE TABLE IF NOT EXISTS daily_scores (
			id         INTEGER PRIMARY KEY AUTOINCREMENT,
			day        TEXT NOT NULL,
			language   TEXT NOT NULL,
			token      TEXT NOT NULL,
			username   TEXT NOT NULL,
			avatar     TEXT NOT NULL DEFAULT '',
			score      INTEGER NOT NULL,
			results    TEXT NOT NULL,
			created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
			UNIQUE(day, language, token)
		);
		CREATE INDEX IF NOT EXISTS idx_daily_scores_board
			ON daily_scores(day, language, score DESC, id ASC);
		CREATE TABLE IF NOT EXISTS daily_runs (
			id         INTEGER PRIMARY KEY AUTOINCREMENT,
			day        TEXT NOT NULL,
			language   TEXT NOT NULL,
			token      TEXT NOT NULL,
			username   TEXT NOT NULL,
			avatar     TEXT NOT NULL DEFAULT '',
			started_at INTEGER NOT NULL,
			started_round    INTEGER NOT NULL DEFAULT 0,
			round_started_at INTEGER NOT NULL DEFAULT 0,
			results    TEXT NOT NULL DEFAULT '[]',
			UNIQUE(day, language, token)
		);
	`); err != nil {
		db.Close()
		return nil, err
	}
	// Columns added after daily_runs first shipped; ignore "duplicate column"
	// on databases that already have them.
	for _, alter := range []string{
		`ALTER TABLE daily_runs ADD COLUMN started_round INTEGER NOT NULL DEFAULT 0`,
		`ALTER TABLE daily_runs ADD COLUMN round_started_at INTEGER NOT NULL DEFAULT 0`,
	} {
		if _, err := db.Exec(alter); err != nil && !strings.Contains(err.Error(), "duplicate column") {
			db.Close()
			return nil, err
		}
	}
	return &Store{db: db}, nil
}

func (s *Store) Close() error {
	return s.db.Close()
}

// SubmitScore records one finished run. Returns ErrAlreadyPlayed if the token
// already has an entry for this day and language.
func (s *Store) SubmitScore(day, language, token, username, avatar string, score int, results []RoundResult) error {
	resultsJSON, err := json.Marshal(results)
	if err != nil {
		return err
	}
	_, err = s.db.Exec(
		`INSERT INTO daily_scores (day, language, token, username, avatar, score, results)
		 VALUES (?, ?, ?, ?, ?, ?, ?)`,
		day, language, token, username, avatar, score, string(resultsJSON),
	)
	if err != nil && isUniqueViolation(err) {
		return ErrAlreadyPlayed
	}
	return err
}

func isUniqueViolation(err error) bool {
	// modernc.org/sqlite wraps sqlite error codes; matching on the message
	// avoids importing its internal error types.
	return err != nil && strings.Contains(err.Error(), "UNIQUE constraint failed")
}

// Run is an in-progress (or finished but unsubmitted) daily attempt. Results
// has one slot per round; nil means the round has not been locked in yet.
// StartedRound/RoundStartedAt record which round's clock is running: the
// current round's timer only starts when the player advances to it.
type Run struct {
	Username       string
	Avatar         string
	StartedAt      int64
	StartedRound   int
	RoundStartedAt int64
	Results        []*RoundResult
}

// StartRun records the start of a token's run (round 0's clock starts now).
// Idempotent: if the run already exists, the original run is returned
// unchanged.
func (s *Store) StartRun(day, language, token, username, avatar string, now int64) (Run, error) {
	_, err := s.db.Exec(
		`INSERT INTO daily_runs (day, language, token, username, avatar, started_at, started_round, round_started_at)
		 VALUES (?, ?, ?, ?, ?, ?, 0, ?)
		 ON CONFLICT(day, language, token) DO NOTHING`,
		day, language, token, username, avatar, now, now,
	)
	if err != nil {
		return Run{}, err
	}
	return s.GetRun(day, language, token)
}

// StartRound starts one round's clock.
func (s *Store) StartRound(day, language, token string, round int, now int64) error {
	_, err := s.db.Exec(
		`UPDATE daily_runs SET started_round = ?, round_started_at = ?
		 WHERE day = ? AND language = ? AND token = ?`,
		round, now, day, language, token,
	)
	return err
}

// GetRun returns a token's run for the day, or ErrNoRun.
func (s *Store) GetRun(day, language, token string) (Run, error) {
	var run Run
	var resultsJSON string
	err := s.db.QueryRow(
		`SELECT username, avatar, started_at, started_round, round_started_at, results FROM daily_runs
		 WHERE day = ? AND language = ? AND token = ?`,
		day, language, token,
	).Scan(&run.Username, &run.Avatar, &run.StartedAt, &run.StartedRound, &run.RoundStartedAt, &resultsJSON)
	if errors.Is(err, sql.ErrNoRows) {
		return Run{}, ErrNoRun
	}
	if err != nil {
		return Run{}, err
	}
	if err := json.Unmarshal([]byte(resultsJSON), &run.Results); err != nil {
		return Run{}, err
	}
	// Normalize to one slot per round regardless of what was stored.
	for len(run.Results) < Rounds {
		run.Results = append(run.Results, nil)
	}
	run.Results = run.Results[:Rounds]
	return run, nil
}

// SetRunResult locks in the verdict for one round. A round can only be locked
// once; a second attempt returns ErrRoundLocked.
func (s *Store) SetRunResult(day, language, token string, round int, result RoundResult) error {
	run, err := s.GetRun(day, language, token)
	if err != nil {
		return err
	}
	if round < 0 || round >= len(run.Results) {
		return errors.New("round out of range")
	}
	if run.Results[round] != nil {
		return ErrRoundLocked
	}
	run.Results[round] = &result
	resultsJSON, err := json.Marshal(run.Results)
	if err != nil {
		return err
	}
	_, err = s.db.Exec(
		`UPDATE daily_runs SET results = ? WHERE day = ? AND language = ? AND token = ?`,
		string(resultsJSON), day, language, token,
	)
	return err
}

// GetEntry returns a token's entry and rank for the day, or sql.ErrNoRows.
func (s *Store) GetEntry(day, language, token string) (Entry, []RoundResult, error) {
	var entry Entry
	var resultsJSON string
	var id int64
	err := s.db.QueryRow(
		`SELECT id, username, avatar, score, results FROM daily_scores
		 WHERE day = ? AND language = ? AND token = ?`,
		day, language, token,
	).Scan(&id, &entry.Username, &entry.Avatar, &entry.Score, &resultsJSON)
	if err != nil {
		return Entry{}, nil, err
	}
	var results []RoundResult
	if err := json.Unmarshal([]byte(resultsJSON), &results); err != nil {
		return Entry{}, nil, err
	}
	// Rank: higher score wins; earlier submission wins ties.
	err = s.db.QueryRow(
		`SELECT COUNT(*) + 1 FROM daily_scores
		 WHERE day = ? AND language = ? AND (score > ? OR (score = ? AND id < ?))`,
		day, language, entry.Score, entry.Score, id,
	).Scan(&entry.Rank)
	if err != nil {
		return Entry{}, nil, err
	}
	return entry, results, nil
}

// Leaderboard returns the day's top entries (ranked) and the total player count.
func (s *Store) Leaderboard(day, language string, limit int) ([]Entry, int, error) {
	rows, err := s.db.Query(
		`SELECT username, avatar, score, results FROM daily_scores
		 WHERE day = ? AND language = ?
		 ORDER BY score DESC, id ASC
		 LIMIT ?`,
		day, language, limit,
	)
	if err != nil {
		return nil, 0, err
	}
	defer rows.Close()

	entries := make([]Entry, 0, limit)
	rank := 0
	prevScore := 0
	for rows.Next() {
		var e Entry
		var resultsJSON string
		if err := rows.Scan(&e.Username, &e.Avatar, &e.Score, &resultsJSON); err != nil {
			return nil, 0, err
		}
		if err := json.Unmarshal([]byte(resultsJSON), &e.Results); err != nil {
			return nil, 0, err
		}
		// Standard competition ranking: ties share a rank.
		if rank == 0 || e.Score != prevScore {
			rank = len(entries) + 1
		}
		prevScore = e.Score
		e.Rank = rank
		entries = append(entries, e)
	}
	if err := rows.Err(); err != nil {
		return nil, 0, err
	}

	var total int
	if err := s.db.QueryRow(
		`SELECT COUNT(*) FROM daily_scores WHERE day = ? AND language = ?`,
		day, language,
	).Scan(&total); err != nil {
		return nil, 0, err
	}
	return entries, total, nil
}

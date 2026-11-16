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

type Store struct {
	db *sql.DB
}

type Entry struct {
	Rank     int    `json:"rank"`
	Username string `json:"username"`
	Avatar   string `json:"avatar"`
	Score    int    `json:"score"`
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
	`); err != nil {
		db.Close()
		return nil, err
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
		`SELECT username, avatar, score FROM daily_scores
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
		if err := rows.Scan(&e.Username, &e.Avatar, &e.Score); err != nil {
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

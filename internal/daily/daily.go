// Package daily implements the daily challenge: every player gets the same
// seeded letter combinations for the day, plays 10 words solo, and the scores
// land on a per-day leaderboard.
package daily

import (
	"hash/fnv"
	"math/rand"
	"time"

	"github.com/carl1330/oshirigame/internal/oshirigame"
)

const (
	Rounds = 10
	// RoundTime is the per-word time limit the client enforces, in seconds.
	RoundTime = 25
	// minWordCombinations mirrors the classic-mode default so daily letter
	// pairs are never unreasonably hard.
	minWordCombinations = 400
)

type Combo struct {
	Atama  string `json:"atama"`
	Oshiri string `json:"oshiri"`
}

// Today returns the current challenge day in UTC, so everyone worldwide
// plays the same board and the day flips at a single moment.
func Today() string {
	return time.Now().UTC().Format("2006-01-02")
}

// Combos deterministically derives the day's letter pairs from the date and
// language, so every player sees the same board without storing anything.
func Combos(day string, language oshirigame.Language) []Combo {
	h := fnv.New64a()
	h.Write([]byte(day + "|" + string(language)))
	rng := rand.New(rand.NewSource(int64(h.Sum64())))

	alphabet := []rune(oshirigame.Alphabet(language))
	wordList := oshirigame.GetWordList(language)

	combos := make([]Combo, 0, Rounds)
	seen := make(map[Combo]bool)
	for len(combos) < Rounds {
		combo := Combo{
			Atama:  string(alphabet[rng.Intn(len(alphabet))]),
			Oshiri: string(alphabet[rng.Intn(len(alphabet))]),
		}
		if seen[combo] {
			continue
		}
		seen[combo] = true
		if wordList.WordCount(combo.Atama, combo.Oshiri) >= minWordCombinations {
			combos = append(combos, combo)
		}
	}
	return combos
}

// RoundResult is the server-side verdict on one submitted word.
type RoundResult struct {
	Atama    string `json:"atama"`
	Oshiri   string `json:"oshiri"`
	Word     string `json:"word"`
	Accepted bool   `json:"accepted"`
	Score    int    `json:"score"`
}

// ScoreWords validates each submitted word against the day's combos and the
// word list, returning per-round results and the total score. words[i] is the
// full word for combos[i] (including atama and oshiri); empty means no answer.
func ScoreWords(combos []Combo, words []string, wordList *oshirigame.WordList) ([]RoundResult, int) {
	results := make([]RoundResult, len(combos))
	total := 0
	for i, combo := range combos {
		word := ""
		if i < len(words) {
			word = words[i]
		}
		result := RoundResult{Atama: combo.Atama, Oshiri: combo.Oshiri, Word: word}
		runes := []rune(word)
		// The middle must be non-empty: atama+oshiri alone is not a play.
		if len(runes) >= 3 &&
			string(runes[0]) == combo.Atama &&
			string(runes[len(runes)-1]) == combo.Oshiri &&
			wordList.IsValidWord(word) {
			result.Accepted = true
			result.Score = wordList.GetScore(word)
			total += result.Score
		}
		results[i] = result
	}
	return results, total
}

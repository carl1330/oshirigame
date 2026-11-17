package daily

import (
	"bytes"
	"encoding/json"
	"net/http/httptest"
	"path/filepath"
	"testing"

	"github.com/carl1330/oshirigame/internal/oshirigame"
)

func TestCombosDeterministicAndPlayable(t *testing.T) {
	a := Combos("2026-11-16", oshirigame.English)
	b := Combos("2026-11-16", oshirigame.English)
	if len(a) != Rounds {
		t.Fatalf("expected %d combos, got %d", Rounds, len(a))
	}
	for i := range a {
		if a[i] != b[i] {
			t.Fatalf("combos not deterministic at %d: %v vs %v", i, a[i], b[i])
		}
	}
	wl := oshirigame.GetWordList(oshirigame.English)
	for _, c := range a {
		if wl.WordCount(c.Atama, c.Oshiri) < minWordCombinations {
			t.Errorf("combo %v below word count threshold", c)
		}
	}
	other := Combos("2026-11-17", oshirigame.English)
	same := true
	for i := range a {
		if a[i] != other[i] {
			same = false
		}
	}
	if same {
		t.Error("different days produced identical combos")
	}
}

func TestScoreWords(t *testing.T) {
	wl := oshirigame.GetWordList(oshirigame.English)
	combos := []Combo{{Atama: "c", Oshiri: "t"}, {Atama: "d", Oshiri: "g"}}
	results, total := ScoreWords(combos, []string{"cat", "wrong"}, wl)
	if !results[0].Accepted || results[0].Score != 1 {
		t.Errorf("expected cat accepted with score 1, got %+v", results[0])
	}
	if results[1].Accepted {
		t.Errorf("expected 'wrong' rejected for combo d..g, got %+v", results[1])
	}
	if total != 1 {
		t.Errorf("expected total 1, got %d", total)
	}
	// atama+oshiri with empty middle is not a play even if it were a word
	results, _ = ScoreWords([]Combo{{Atama: "a", Oshiri: "t"}}, []string{"at"}, wl)
	if results[0].Accepted {
		t.Error("two-letter word (empty middle) should be rejected")
	}
}

func TestStoreAndHandlers(t *testing.T) {
	store, err := NewStore(filepath.Join(t.TempDir(), "test.db"))
	if err != nil {
		t.Fatal(err)
	}
	defer store.Close()
	h := NewHandler(store)

	// Fetch today's challenge
	rec := httptest.NewRecorder()
	h.GetChallenge(rec, httptest.NewRequest("GET", "/daily?language=english", nil))
	var challenge challengeResponse
	if err := json.Unmarshal(rec.Body.Bytes(), &challenge); err != nil {
		t.Fatal(err)
	}
	if len(challenge.Combos) != Rounds || challenge.Played {
		t.Fatalf("unexpected challenge: %+v", challenge)
	}

	// Submitting without a started run is rejected
	noRunBody, _ := json.Marshal(submitRequest{Token: "test-token-123", Language: "english"})
	rec = httptest.NewRecorder()
	h.Submit(rec, httptest.NewRequest("POST", "/daily/submit", bytes.NewReader(noRunBody)))
	if rec.Code != 400 {
		t.Fatalf("expected 400 submitting without a run, got %d", rec.Code)
	}

	// Start a run
	startBody, _ := json.Marshal(startRequest{
		Token: "test-token-123", Username: "carl", Language: "english",
	})
	rec = httptest.NewRecorder()
	h.Start(rec, httptest.NewRequest("POST", "/daily/start", bytes.NewReader(startBody)))
	if rec.Code != 200 {
		t.Fatalf("start failed: %d %s", rec.Code, rec.Body.String())
	}
	var started startResponse
	json.Unmarshal(rec.Body.Bytes(), &started)

	// Starting again resumes the same run instead of resetting the clock
	rec = httptest.NewRecorder()
	h.Start(rec, httptest.NewRequest("POST", "/daily/start", bytes.NewReader(startBody)))
	var restarted startResponse
	json.Unmarshal(rec.Body.Bytes(), &restarted)
	if restarted.StartedAt != started.StartedAt {
		t.Fatalf("restart changed startedAt: %d vs %d", restarted.StartedAt, started.StartedAt)
	}

	// Challenge now reports the in-progress run
	rec = httptest.NewRecorder()
	h.GetChallenge(rec, httptest.NewRequest("GET", "/daily?language=english&token=test-token-123", nil))
	json.Unmarshal(rec.Body.Bytes(), &challenge)
	if challenge.Played || challenge.Run == nil || challenge.Run.StartedAt != started.StartedAt {
		t.Fatalf("expected in-progress run in challenge, got %+v", challenge)
	}

	// Lock a valid word for round 0 to guarantee a nonzero score
	wl := oshirigame.GetWordList(oshirigame.English)
	firstWord := wl.AllWords(challenge.Combos[0].Atama, challenge.Combos[0].Oshiri)[0]
	lockBody, _ := json.Marshal(lockRequest{
		Token: "test-token-123", Language: "english", Round: 0, Word: firstWord,
	})
	rec = httptest.NewRecorder()
	h.LockWord(rec, httptest.NewRequest("POST", "/daily/word", bytes.NewReader(lockBody)))
	if rec.Code != 200 {
		t.Fatalf("lock failed: %d %s", rec.Code, rec.Body.String())
	}
	var verdict RoundResult
	json.Unmarshal(rec.Body.Bytes(), &verdict)
	if !verdict.Accepted || verdict.Score <= 0 {
		t.Fatalf("expected %q accepted, got %+v", firstWord, verdict)
	}

	// Locking the same round again cannot change the stored word
	relockBody, _ := json.Marshal(lockRequest{
		Token: "test-token-123", Language: "english", Round: 0, Word: "",
	})
	rec = httptest.NewRecorder()
	h.LockWord(rec, httptest.NewRequest("POST", "/daily/word", bytes.NewReader(relockBody)))
	var relocked RoundResult
	json.Unmarshal(rec.Body.Bytes(), &relocked)
	if !relocked.Accepted || relocked.Word != verdict.Word {
		t.Fatalf("relock changed stored verdict: %+v", relocked)
	}

	// Locking a round whose clock hasn't been started is rejected
	earlyBody, _ := json.Marshal(lockRequest{
		Token: "test-token-123", Language: "english", Round: 1, Word: firstWord,
	})
	rec = httptest.NewRecorder()
	h.LockWord(rec, httptest.NewRequest("POST", "/daily/word", bytes.NewReader(earlyBody)))
	if rec.Code != 400 {
		t.Fatalf("expected 400 locking unstarted round, got %d", rec.Code)
	}

	// Advance to round 1: its clock starts now
	nextBody, _ := json.Marshal(nextRequest{Token: "test-token-123", Language: "english"})
	rec = httptest.NewRecorder()
	h.NextRound(rec, httptest.NewRequest("POST", "/daily/next", bytes.NewReader(nextBody)))
	if rec.Code != 200 {
		t.Fatalf("next failed: %d %s", rec.Code, rec.Body.String())
	}
	var next nextResponse
	json.Unmarshal(rec.Body.Bytes(), &next)
	if next.Round != 1 {
		t.Fatalf("expected round 1, got %+v", next)
	}

	// A word arriving after the round's deadline scores zero
	realNow := h.now
	h.now = func() int64 { return next.RoundStartedAt + int64(RoundTime) + GraceSeconds + 1 }
	rec = httptest.NewRecorder()
	h.LockWord(rec, httptest.NewRequest("POST", "/daily/word", bytes.NewReader(earlyBody)))
	var late RoundResult
	json.Unmarshal(rec.Body.Bytes(), &late)
	if late.Accepted || late.Word != "" {
		t.Fatalf("expected late word rejected, got %+v", late)
	}
	h.now = realNow

	// Submit finalizes from the stored run
	rec = httptest.NewRecorder()
	h.Submit(rec, httptest.NewRequest("POST", "/daily/submit", bytes.NewReader(noRunBody)))
	if rec.Code != 200 {
		t.Fatalf("submit failed: %d %s", rec.Code, rec.Body.String())
	}
	var submitted submitResponse
	json.Unmarshal(rec.Body.Bytes(), &submitted)
	if submitted.Score != verdict.Score || submitted.Rank != 1 || !submitted.Results[0].Accepted {
		t.Fatalf("unexpected submit response: %+v", submitted)
	}

	// Second submission with the same token must be rejected
	rec = httptest.NewRecorder()
	h.Submit(rec, httptest.NewRequest("POST", "/daily/submit", bytes.NewReader(noRunBody)))
	if rec.Code != 409 {
		t.Fatalf("expected 409 on replay, got %d", rec.Code)
	}

	// Starting again after playing must be rejected
	rec = httptest.NewRecorder()
	h.Start(rec, httptest.NewRequest("POST", "/daily/start", bytes.NewReader(startBody)))
	if rec.Code != 409 {
		t.Fatalf("expected 409 starting after playing, got %d", rec.Code)
	}

	// Lower-scoring second player ranks below
	start2, _ := json.Marshal(startRequest{
		Token: "test-token-456", Username: "rival", Language: "english",
	})
	rec = httptest.NewRecorder()
	h.Start(rec, httptest.NewRequest("POST", "/daily/start", bytes.NewReader(start2)))
	submit2, _ := json.Marshal(submitRequest{Token: "test-token-456", Language: "english"})
	rec = httptest.NewRecorder()
	h.Submit(rec, httptest.NewRequest("POST", "/daily/submit", bytes.NewReader(submit2)))
	var second submitResponse
	json.Unmarshal(rec.Body.Bytes(), &second)
	if second.Rank != 2 {
		t.Fatalf("expected rank 2 for zero score, got %+v", second)
	}

	// Leaderboard lists both, ordered
	rec = httptest.NewRecorder()
	h.Leaderboard(rec, httptest.NewRequest("GET", "/daily/leaderboard?language=english", nil))
	var board leaderboardResponse
	json.Unmarshal(rec.Body.Bytes(), &board)
	if board.Total != 2 || len(board.Entries) != 2 ||
		board.Entries[0].Username != "carl" || board.Entries[0].Rank != 1 ||
		board.Entries[1].Rank != 2 {
		t.Fatalf("unexpected leaderboard: %+v", board)
	}

	// Challenge now reports played for the token
	rec = httptest.NewRecorder()
	h.GetChallenge(rec, httptest.NewRequest("GET", "/daily?language=english&token=test-token-123", nil))
	json.Unmarshal(rec.Body.Bytes(), &challenge)
	if !challenge.Played || challenge.Entry == nil || challenge.Entry.Rank != 1 {
		t.Fatalf("expected played entry, got %+v", challenge)
	}
	// The day's answers come back so a return visit can show them
	if len(challenge.Results) != Rounds || challenge.Results[0].Word != firstWord ||
		!challenge.Results[0].Accepted {
		t.Fatalf("expected stored answers in challenge, got %+v", challenge.Results)
	}
}

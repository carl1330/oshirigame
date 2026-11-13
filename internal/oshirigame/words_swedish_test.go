package oshirigame

import "testing"

func TestSwedishWordList(t *testing.T) {
	sv := GetWordList(Swedish)
	if len(sv.Words) < 100000 {
		t.Fatalf("expected >100k words, got %d", len(sv.Words))
	}
	if !sv.IsValidWord("fågel") {
		t.Error("fågel should be valid")
	}
	if got := sv.GetScore("fågel"); got != 3 {
		t.Errorf("fågel score = %d, want 3 (rune count - 2)", got)
	}
	if sv.WordCount("f", "l") < 100 {
		t.Errorf("f..l combos suspiciously low: %d", sv.WordCount("f", "l"))
	}
	if Alphabet(Swedish) != "abcdefghijklmnopqrstuvwxyzåäö" {
		t.Error("wrong swedish alphabet")
	}
	en := GetWordList(English)
	if !en.IsValidWord("apple") {
		t.Error("apple should be valid in english list")
	}
}

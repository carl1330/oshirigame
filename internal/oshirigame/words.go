package oshirigame

import (
	"bufio"
	"bytes"
	"fmt"
	"io"
	"net/http"
	"os"
	"path/filepath"
	"sort"
	"strings"
	"sync"
	"time"
)

type Language string

const (
	English Language = "english"
	Swedish Language = "swedish"
)

// Word lists are downloaded on startup rather than shipped in the binary.
// English uses the ENABLE list (public domain, built for word games).
// Swedish is expanded from the ONLYOFFICE sv_SE hunspell dictionary
// (LGPL-3.0, maintained by Göran Andersson).
const (
	enableURL = "https://raw.githubusercontent.com/dolph/dictionary/master/enable1.txt"
	svDicURL  = "https://raw.githubusercontent.com/ONLYOFFICE/dictionaries/master/sv_SE/sv_SE.dic"
	svAffURL  = "https://raw.githubusercontent.com/ONLYOFFICE/dictionaries/master/sv_SE/sv_SE.aff"
)

var alphabets = map[Language]string{
	English: "abcdefghijklmnopqrstuvwxyz",
	Swedish: "abcdefghijklmnopqrstuvwxyzåäö",
}

var (
	wordListCache   = make(map[Language]*WordList)
	wordListCacheMu sync.Mutex
)

type WordList struct {
	Words map[string]bool
}

func IsValidLanguage(language string) bool {
	switch Language(language) {
	case English, Swedish:
		return true
	}
	return false
}

func Alphabet(language Language) string {
	if alphabet, ok := alphabets[language]; ok {
		return alphabet
	}
	return alphabets[English]
}

// Preload downloads and builds every word list. Call it once on startup so
// the server fails fast when a list cannot be fetched, instead of handing
// out empty lists mid-game.
func Preload() error {
	for _, language := range []Language{English, Swedish} {
		if _, err := loadWordList(language); err != nil {
			return fmt.Errorf("loading %s word list: %w", language, err)
		}
	}
	return nil
}

// GetWordList returns the shared word list for a language, loading it once.
func GetWordList(language Language) *WordList {
	wl, err := loadWordList(language)
	if err != nil {
		// Callers have no error path; Preload on startup is the real guard.
		fmt.Fprintln(os.Stderr, "Error loading word list:", err)
		return &WordList{Words: make(map[string]bool)}
	}
	return wl
}

func NewWordList() *WordList {
	return GetWordList(English)
}

func loadWordList(language Language) (*WordList, error) {
	wordListCacheMu.Lock()
	defer wordListCacheMu.Unlock()
	if wl, ok := wordListCache[language]; ok {
		return wl, nil
	}

	var words map[string]bool
	switch language {
	case Swedish:
		dic, err := fetchCached("sv_SE.dic", svDicURL)
		if err != nil {
			return nil, err
		}
		aff, err := fetchCached("sv_SE.aff", svAffURL)
		if err != nil {
			return nil, err
		}
		words, err = expandHunspell(dic, aff, alphabets[Swedish])
		if err != nil {
			return nil, err
		}
	default:
		data, err := fetchCached("enable1.txt", enableURL)
		if err != nil {
			return nil, err
		}
		words = make(map[string]bool)
		scanner := bufio.NewScanner(bytes.NewReader(data))
		for scanner.Scan() {
			word := strings.TrimSpace(scanner.Text())
			if word != "" {
				words[word] = true
			}
		}
		if err := scanner.Err(); err != nil {
			return nil, err
		}
	}

	wl := &WordList{Words: words}
	wordListCache[language] = wl
	return wl, nil
}

// wordlistDir is where downloaded dictionary files are cached so restarts
// and offline development don't depend on GitHub being reachable.
func wordlistDir() string {
	if dir := os.Getenv("WORDLIST_DIR"); dir != "" {
		return dir
	}
	if dir, err := os.UserCacheDir(); err == nil {
		return filepath.Join(dir, "oshirigame", "wordlists")
	}
	return filepath.Join(os.TempDir(), "oshirigame-wordlists")
}

func fetchCached(name, url string) ([]byte, error) {
	path := filepath.Join(wordlistDir(), name)
	if data, err := os.ReadFile(path); err == nil && len(data) > 0 {
		return data, nil
	}

	client := &http.Client{Timeout: 60 * time.Second}
	resp, err := client.Get(url)
	if err != nil {
		return nil, fmt.Errorf("downloading %s: %w", url, err)
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("downloading %s: status %s", url, resp.Status)
	}
	data, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, fmt.Errorf("downloading %s: %w", url, err)
	}

	if err := os.MkdirAll(wordlistDir(), 0o755); err == nil {
		// Write via a temp file so a crash mid-write never leaves a
		// truncated file that a later start would trust.
		tmp := path + ".tmp"
		if err := os.WriteFile(tmp, data, 0o644); err == nil {
			_ = os.Rename(tmp, path)
		}
	}
	return data, nil
}

func (wl *WordList) GetScore(word string) int {
	if wl.Words[word] {
		return len([]rune(word)) - 2
	}
	return 0
}

func (wl *WordList) TopWords(atama string, oshiri string) []string {
	words := make([]string, 3)
	for word := range wl.Words {
		if strings.HasPrefix(word, atama) && strings.HasSuffix(word, oshiri) {
			for i := 0; i < 3; i++ {
				if len(word) > len(words[i]) {
					copy(words[i+1:], words[i:])
					words[i] = word
					break
				}
			}
		}
	}
	return words
}

// AllWords returns every valid word for the letter combination,
// longest first, alphabetical within the same length.
func (wl *WordList) AllWords(atama string, oshiri string) []string {
	words := make([]string, 0)
	for word := range wl.Words {
		if strings.HasPrefix(word, atama) && strings.HasSuffix(word, oshiri) {
			words = append(words, word)
		}
	}
	sort.Slice(words, func(i, j int) bool {
		li, lj := len([]rune(words[i])), len([]rune(words[j]))
		if li != lj {
			return li > lj
		}
		return words[i] < words[j]
	})
	return words
}

func (wl *WordList) WordCount(atama string, oshiri string) int {
	count := 0
	for word := range wl.Words {
		if strings.HasPrefix(word, atama) && strings.HasSuffix(word, oshiri) {
			count++
		}
	}
	return count
}

func (wl *WordList) IsValidWord(word string) bool {
	return wl.Words[word]
}

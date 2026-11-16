package oshirigame

import (
	"bufio"
	"embed"
	"fmt"
	"sort"
	"strings"
	"sync"
)

//go:embed wordlists/words_alpha.txt wordlists/words_swedish.txt
var wordFiles embed.FS

type Language string

const (
	English Language = "english"
	Swedish Language = "swedish"
)

var languageFiles = map[Language]string{
	English: "wordlists/words_alpha.txt",
	Swedish: "wordlists/words_swedish.txt",
}

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
	_, ok := languageFiles[Language(language)]
	return ok
}

func Alphabet(language Language) string {
	if alphabet, ok := alphabets[language]; ok {
		return alphabet
	}
	return alphabets[English]
}

// GetWordList returns the shared word list for a language, loading it once.
func GetWordList(language Language) *WordList {
	wordListCacheMu.Lock()
	defer wordListCacheMu.Unlock()
	if wl, ok := wordListCache[language]; ok {
		return wl
	}
	wl := &WordList{
		Words: make(map[string]bool),
	}
	FillWordList(wl, language)
	wordListCache[language] = wl
	return wl
}

func NewWordList() *WordList {
	return GetWordList(English)
}

func FillWordList(wl *WordList, language Language) {
	filename, ok := languageFiles[language]
	if !ok {
		filename = languageFiles[English]
	}

	file, err := wordFiles.Open(filename)
	if err != nil {
		fmt.Println("Error:", err)
		return
	}
	defer file.Close()

	// Create a scanner to read the file line by line
	scanner := bufio.NewScanner(file)

	// Iterate through each line of the file
	for scanner.Scan() {
		// Get the current line
		line := scanner.Text()
		// Process the line (e.g., print it)
		wl.Words[line] = true
	}

	// Check for any errors during scanning
	if err := scanner.Err(); err != nil {
		fmt.Println("Error:", err)
	}
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

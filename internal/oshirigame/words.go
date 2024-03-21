package oshirigame

import (
	"bufio"
	"fmt"
	"os"
	"strings"
)

type WordList struct {
	Words map[string]bool
}

func NewWordList() *WordList {
	wl := &WordList{
		Words: make(map[string]bool),
	}
	FillWordList(wl)
	return wl
}

func FillWordList(wl *WordList) {
	file, err := os.Open("../../assets/wordlists/words_alpha.txt")
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
		return len(word) - 2
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

package oshirigame

// Hunspell dictionary expansion: turns a .dic + .aff pair into a flat set of
// words. Supports the subset of hunspell used by the ONLYOFFICE dictionaries
// this game consumes: SFX and PFX rules with cross-product, and the
// FORBIDDENWORD, NEEDAFFIX and ONLYINCOMPOUND special flags. Compounding is
// not expanded. Words containing characters outside the given alphabet
// (uppercase, digits, punctuation) are dropped.

import (
	"bufio"
	"bytes"
	"fmt"
	"regexp"
	"strings"
)

type affixRule struct {
	strip     string
	append    string
	contFlags string
	cond      *regexp.Regexp
	cross     bool
}

type affData struct {
	sfx            map[rune][]affixRule
	pfx            map[rune][]affixRule
	forbidden      rune
	needAffix      rune
	onlyInCompound rune
}

func parseAff(aff []byte) (*affData, error) {
	data := &affData{
		sfx: make(map[rune][]affixRule),
		pfx: make(map[rune][]affixRule),
	}
	// Cross-product permission comes from the header line (SFX/PFX flag Y/N count).
	cross := make(map[rune]bool)
	scanner := bufio.NewScanner(bytes.NewReader(aff))
	for scanner.Scan() {
		fields := strings.Fields(scanner.Text())
		if len(fields) == 0 {
			continue
		}
		switch fields[0] {
		case "FORBIDDENWORD":
			data.forbidden = firstRune(fields[1])
		case "NEEDAFFIX":
			data.needAffix = firstRune(fields[1])
		case "ONLYINCOMPOUND":
			data.onlyInCompound = firstRune(fields[1])
		case "SFX", "PFX":
			flagRune := firstRune(fields[1])
			if len(fields) == 4 {
				cross[flagRune] = fields[2] == "Y"
				continue
			}
			if len(fields) < 5 {
				continue
			}
			strip, appendStr, cond := fields[2], fields[3], fields[4]
			if strip == "0" {
				strip = ""
			}
			contFlags := ""
			if i := strings.IndexByte(appendStr, '/'); i >= 0 {
				contFlags = appendStr[i+1:]
				appendStr = appendStr[:i]
			}
			if appendStr == "0" {
				appendStr = ""
			}
			var condRe *regexp.Regexp
			if cond != "." {
				anchor := "(?:" + cond + ")$"
				if fields[0] == "PFX" {
					anchor = "^(?:" + cond + ")"
				}
				re, err := regexp.Compile(anchor)
				if err != nil {
					return nil, fmt.Errorf("bad condition %q: %w", cond, err)
				}
				condRe = re
			}
			rule := affixRule{
				strip: strip, append: appendStr, contFlags: contFlags,
				cond: condRe, cross: cross[flagRune],
			}
			if fields[0] == "SFX" {
				data.sfx[flagRune] = append(data.sfx[flagRune], rule)
			} else {
				data.pfx[flagRune] = append(data.pfx[flagRune], rule)
			}
		}
	}
	return data, scanner.Err()
}

func firstRune(s string) rune {
	for _, r := range s {
		return r
	}
	return 0
}

func expandHunspell(dic, aff []byte, alphabet string) (map[string]bool, error) {
	affD, err := parseAff(aff)
	if err != nil {
		return nil, fmt.Errorf("parsing aff: %w", err)
	}

	allowed := make(map[rune]bool)
	for _, r := range alphabet {
		allowed[r] = true
	}
	isClean := func(word string) bool {
		if word == "" {
			return false
		}
		for _, r := range word {
			if !allowed[r] {
				return false
			}
		}
		return true
	}

	words := make(map[string]bool)
	scanner := bufio.NewScanner(bytes.NewReader(dic))
	scanner.Scan() // first line is the entry count
	for scanner.Scan() {
		line := scanner.Text()
		// Morphological fields follow a tab; drop them.
		if i := strings.IndexByte(line, '\t'); i >= 0 {
			line = line[:i]
		}
		word, flags := line, ""
		if i := strings.IndexByte(line, '/'); i >= 0 {
			word, flags = line[:i], line[i+1:]
		}

		if affD.forbidden != 0 && strings.ContainsRune(flags, affD.forbidden) {
			continue
		}
		if affD.onlyInCompound != 0 && strings.ContainsRune(flags, affD.onlyInCompound) {
			continue
		}
		needsAffix := affD.needAffix != 0 && strings.ContainsRune(flags, affD.needAffix)
		if !needsAffix && isClean(word) {
			words[word] = true
		}

		type suffixForm struct {
			word  string
			cross bool
		}
		var suffixForms []suffixForm
		for _, flagRune := range flags {
			for _, rule := range affD.sfx[flagRune] {
				if !strings.HasSuffix(word, rule.strip) {
					continue
				}
				if rule.cond != nil && !rule.cond.MatchString(word) {
					continue
				}
				// A generated form carrying the only-in-compound flag is a
				// linking form, not a standalone word.
				if affD.onlyInCompound != 0 && strings.ContainsRune(rule.contFlags, affD.onlyInCompound) {
					continue
				}
				form := word[:len(word)-len(rule.strip)] + rule.append
				suffixForms = append(suffixForms, suffixForm{form, rule.cross})
				if isClean(form) {
					words[form] = true
				}
			}
		}
		for _, flagRune := range flags {
			for _, rule := range affD.pfx[flagRune] {
				if !strings.HasPrefix(word, rule.strip) {
					continue
				}
				if rule.cond != nil && !rule.cond.MatchString(word) {
					continue
				}
				// An affixed form always stands alone, even under NEEDAFFIX.
				form := rule.append + word[len(rule.strip):]
				if isClean(form) {
					words[form] = true
				}
				if !rule.cross {
					continue
				}
				// Cross product: prefix combined with each cross-allowed suffix form.
				for _, sf := range suffixForms {
					if !sf.cross || !strings.HasPrefix(sf.word, rule.strip) {
						continue
					}
					combined := rule.append + sf.word[len(rule.strip):]
					if isClean(combined) {
						words[combined] = true
					}
				}
			}
		}
	}
	return words, scanner.Err()
}

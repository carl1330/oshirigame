package main

import (
	"fmt"
	"net/http"
	"os"
	"path/filepath"
	"strings"

	"github.com/carl1330/oshirigame/internal/websocket"
	"github.com/go-chi/chi/v5"
	"github.com/go-chi/chi/v5/middleware"
	"github.com/go-chi/cors"
)

func main() {
	r := chi.NewRouter()
	r.Use(middleware.Logger)
	r.Use(cors.Handler(cors.Options{
		AllowedOrigins:   []string{"*"},
		AllowedMethods:   []string{"GET", "POST", "PUT", "DELETE", "OPTIONS"},
		AllowedHeaders:   []string{"Accept", "Authorization", "Content-Type", "X-CSRF-Token"},
		ExposedHeaders:   []string{"Link"},
		AllowCredentials: true,
	}))

	hub := websocket.NewHub()
	handler := websocket.NewHandler(hub)

	go hub.Run()

	// API routes (must be before static file handler)
	r.Get("/creategame", handler.CreateGame)
	r.Get("/ws", handler.ServeWS)

	// Serve static files
	staticDir := "./static"
	if _, err := os.Stat(staticDir); os.IsNotExist(err) {
		// Fallback to view/dist for local development
		staticDir = "./view/dist"
	}

	// Create a file server for static assets
	fileServer := http.FileServer(http.Dir(staticDir))

	// Serve static files and SPA routes
	r.NotFound(func(w http.ResponseWriter, r *http.Request) {
		path := r.URL.Path

		// Check if it's a static file (has extension)
		if strings.Contains(path, ".") {
			// Try to serve the static file
			filePath := filepath.Join(staticDir, path)
			if _, err := os.Stat(filePath); err == nil {
				fileServer.ServeHTTP(w, r)
				return
			}
		}

		// For all other routes (SPA routes), serve index.html
		indexPath := filepath.Join(staticDir, "index.html")
		http.ServeFile(w, r, indexPath)
	})

	fmt.Println("Starting server on :8080")
	http.ListenAndServe(":8080", r)
}

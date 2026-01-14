package main

import (
	"fmt"
	"net/http"
	"os"

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

	// Serve static files for all other routes
	r.Handle("/*", http.StripPrefix("/", http.FileServer(http.Dir(staticDir))))

	fmt.Println("Starting server on :8080")
	http.ListenAndServe(":8080", r)
}

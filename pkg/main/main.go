package main

import (
	"net/http"

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

	r.Get("/creategame", handler.CreateGame)
	r.Get("/ws", handler.ServeWS)

	http.ListenAndServe(":8080", r)
}

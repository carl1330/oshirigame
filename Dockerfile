# Multi-stage Dockerfile for Oshirigame
# Stage 1: Build Go backend
FROM golang:1.22-alpine AS backend-builder

WORKDIR /app

# Copy go mod files
COPY go.mod go.sum ./
RUN go mod download

# Copy source code
COPY . .

# Build the backend
RUN CGO_ENABLED=0 GOOS=linux go build -a -installsuffix cgo -o main ./pkg/main/main.go

# Stage 2: Build React frontend
FROM node:18-alpine AS frontend-builder

WORKDIR /app/view

# Copy package files
COPY view/package*.json ./
RUN npm ci

# Copy source code
COPY view/ .

# Build the frontend
RUN npm run build

# Stage 3: Final runtime image
FROM alpine:latest

RUN apk --no-cache add ca-certificates

WORKDIR /root/

# Copy the backend binary
COPY --from=backend-builder /app/main .

# Copy the built frontend
COPY --from=frontend-builder /app/view/dist ./static

# Expose port 8080
EXPOSE 8080

# Set environment variable for frontend
ENV VITE_BACKEND_URL=localhost

# Run the server
CMD ["./main"]
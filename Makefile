BINARY_NAME=app

build:
	go build -o ${BINARY_NAME} pkg/main/main.go

run: build
	./${BINARY_NAME}

clean:
	go clean
	rm ${BINARY_NAME}

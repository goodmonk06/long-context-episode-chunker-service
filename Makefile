.PHONY: help install dev build start test lint format typecheck clean docker-build docker-up docker-down db-migrate db-push db-seed db-studio db-reset all

# Default target
help:
	@echo "Episode Chunker Service - Available Commands"
	@echo "=============================================="
	@echo ""
	@echo "Setup & Installation:"
	@echo "  make install       - Install dependencies"
	@echo "  make db-setup      - Set up database (migrate + seed)"
	@echo ""
	@echo "Development:"
	@echo "  make dev           - Start development server"
	@echo "  make build         - Build for production"
	@echo "  make start         - Start production server"
	@echo ""
	@echo "Database:"
	@echo "  make db-migrate    - Run database migrations"
	@echo "  make db-push       - Push schema changes (dev)"
	@echo "  make db-seed       - Seed database with demo data"
	@echo "  make db-studio     - Open Prisma Studio"
	@echo "  make db-reset      - Reset database (push + seed)"
	@echo ""
	@echo "Quality:"
	@echo "  make test          - Run tests"
	@echo "  make test-watch    - Run tests in watch mode"
	@echo "  make coverage      - Run tests with coverage"
	@echo "  make lint          - Run linter"
	@echo "  make lint-fix      - Fix linting issues"
	@echo "  make format        - Format code"
	@echo "  make typecheck     - Run TypeScript type checking"
	@echo "  make quality       - Run all quality checks (lint + typecheck + test)"
	@echo ""
	@echo "Docker:"
	@echo "  make docker-build  - Build Docker image"
	@echo "  make docker-up     - Start services with Docker Compose"
	@echo "  make docker-down   - Stop Docker services"
	@echo "  make docker-dev    - Start database only (for local development)"
	@echo ""
	@echo "Utilities:"
	@echo "  make clean         - Clean build artifacts"
	@echo "  make all           - Install + setup + test"

# Setup & Installation
install:
	npm install

db-setup: db-push db-seed

# Development
dev:
	npm run dev

build:
	npm run build

start:
	npm run start

# Database
db-migrate:
	npm run db:migrate

db-push:
	npm run db:push

db-seed:
	npm run db:seed

db-studio:
	npm run db:studio

db-generate:
	npm run db:generate

db-reset: db-push db-seed
	@echo "Database reset complete!"

# Quality
test:
	npm test

test-watch:
	npm run test:watch

coverage:
	npm run test:coverage

lint:
	npm run lint

lint-fix:
	npm run lint:fix

format:
	npm run format

format-check:
	npm run format:check

typecheck:
	npm run typecheck

quality: lint typecheck test
	@echo "All quality checks passed!"

# Docker
docker-build:
	docker build -t episode-chunker:latest .

docker-up:
	docker-compose up -d
	@echo "Services started! App: http://localhost:3000"

docker-down:
	docker-compose down

docker-dev:
	docker-compose -f docker-compose.dev.yml up -d
	@echo "PostgreSQL started on port 5432"

docker-logs:
	docker-compose logs -f

# Utilities
clean:
	rm -rf dist/
	rm -rf node_modules/
	rm -rf coverage/
	rm -rf .cache/

# Complete setup
all: install db-setup quality
	@echo "Setup complete! Ready to develop."

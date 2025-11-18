# Development Setup Guide

This guide will help you get the Episode Chunker Service running locally.

## Prerequisites

- Node.js 18+ ([Download](https://nodejs.org/))
- Docker & Docker Compose ([Download](https://www.docker.com/))
- Git

## Step-by-Step Setup

### 1. Clone and Install

```bash
# Clone the repository
git clone <repository-url>
cd long-context-episode-chunker-service

# Install dependencies
npm install
```

### 2. Start PostgreSQL

```bash
# Start PostgreSQL using Docker Compose
docker-compose up -d

# Wait for database to be ready (check with)
docker-compose ps
```

### 3. Configure Environment

```bash
# Copy the example environment file
cp .env.example .env

# The default values work with docker-compose
# Edit .env if you need to change anything
```

Your `.env` should have:
```env
DATABASE_URL="postgresql://chunker:chunker_password@localhost:5432/episode_chunker?schema=public"
PORT=3000
NODE_ENV=development
```

### 4. Set Up Database

```bash
# Generate Prisma client
npm run db:generate

# Run migrations to create tables
npm run db:migrate

# Seed demo data
npm run db:seed
```

### 5. Start the Server

```bash
# Development mode with hot reload
npm run dev
```

You should see:
```
Server listening on http://0.0.0.0:3000
```

### 6. Test the API

```bash
# Check health
curl http://localhost:3000/health

# List sources
curl http://localhost:3000/api/sources

# Get the demo source episodes
curl http://localhost:3000/api/sources/<source-id>/episodes
```

## Quick Commands

```bash
# View database in browser
npm run db:studio

# Re-seed database
npm run db:seed

# CLI commands
npm run cli -- --help
npm run cli list-sources
npm run cli list-episodes -- -s <source-id>

# Stop database
docker-compose down

# Stop and remove data
docker-compose down -v
```

## Troubleshooting

### Port 5432 already in use

If you have PostgreSQL already running locally:
```bash
# Stop local PostgreSQL
sudo service postgresql stop  # Linux
brew services stop postgresql # macOS

# Or change the port in docker-compose.yml
```

### Database connection failed

```bash
# Check if PostgreSQL is running
docker-compose ps

# Check logs
docker-compose logs postgres

# Restart
docker-compose restart postgres
```

### Prisma client errors

```bash
# Regenerate Prisma client
npm run db:generate

# Reset database
npm run db:push -- --force-reset
npm run db:seed
```

## Testing with Different Data

### Ingest a custom transcript

Create a file `my-transcript.txt`:
```
Speaker 1: Hello, how are you?

Speaker 2: I'm doing well, thanks for asking!

Speaker 1: Great! Let's talk about the project.
```

Then:
```bash
# Create a source
npm run cli create-source -- -n "My Chat" -t CHAT

# Note the source ID from output, then:
npm run cli ingest -- -s <source-id> -f my-transcript.txt -d "\n\n"

# Segment it
npm run cli segment -- -s <source-id> -m heuristic

# View episodes
npm run cli list-episodes -- -s <source-id>
```

## Using LLM Segmentation

To use OpenAI for better segmentation:

1. Get an API key from [OpenAI](https://platform.openai.com/)
2. Add to `.env`:
   ```env
   OPENAI_API_KEY=sk-your-key-here
   DEFAULT_SEGMENTATION_MODE=llm
   ```
3. Segment:
   ```bash
   npm run cli segment -- -s <source-id> -m llm
   ```

## Next Steps

- Read the [README.md](./README.md) for API documentation
- Check out [Integration Examples](./README.md#integration-examples)
- Explore the codebase in `src/`

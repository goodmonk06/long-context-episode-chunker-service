# Long-Context Episode Chunker Service

A service for segmenting long text streams (chat logs, transcripts, meeting notes) into meaningful episodic chunks with metadata. Built with TypeScript, Fastify, Prisma, and PostgreSQL.

## Features

- **Flexible Ingestion**: Upload text as chunks via API or CLI
- **Intelligent Segmentation**: Heuristic-based or LLM-powered episode detection
- **Rich Metadata**: Automatic title and summary generation for each episode
- **RESTful API**: Easy integration with RAG systems, analytics tools, and more
- **CLI Tools**: Command-line interface for quick operations
- **Type-Safe**: Full TypeScript implementation with Prisma ORM

## Architecture

### Domain Model

```
SourceStream
├── id: string
├── name: string
├── type: CHAT | MEETING | LOG | TRANSCRIPT | OTHER
└── metaJson: JSON

RawChunk
├── id: string
├── sourceId: string (FK)
├── index: number
└── text: string

Episode
├── id: string
├── sourceId: string (FK)
├── episodeIndex: number
├── title: string
├── summary: string
├── startChunkIndex: number
└── endChunkIndex: number
```

### Segmentation Modes

1. **Heuristic Mode** (default, no API key needed)
   - Speaker change detection
   - Topic shift markers
   - Length-based boundaries
   - Fast and free

2. **LLM Mode** (requires OpenAI API key)
   - Context-aware segmentation
   - Intelligent title generation
   - Rich summaries
   - Better accuracy for complex texts

## Quick Start

### Prerequisites

- Node.js 18+
- PostgreSQL 14+
- (Optional) OpenAI API key for LLM segmentation

### Installation

```bash
# Clone the repository
git clone <repository-url>
cd long-context-episode-chunker-service

# Install dependencies
npm install

# Set up environment
cp .env.example .env
# Edit .env with your DATABASE_URL and optional OPENAI_API_KEY

# Generate Prisma client
npm run db:generate

# Run migrations
npm run db:migrate

# Seed demo data
npm run db:seed
```

### Running the Server

```bash
# Development mode with hot reload
npm run dev

# Production build
npm run build
npm start
```

The server will start on `http://localhost:3000` by default.

## API Reference

### Sources

#### Create a Source
```http
POST /api/sources
Content-Type: application/json

{
  "name": "My Conversation",
  "type": "CHAT",
  "metaJson": {
    "participants": ["Alice", "Bob"]
  }
}
```

#### List All Sources
```http
GET /api/sources
```

#### Get a Source
```http
GET /api/sources/:id
```

### Chunks

#### Add Chunks to a Source
```http
POST /api/sources/:id/chunks
Content-Type: application/json

{
  "chunks": [
    { "text": "First chunk of text" },
    { "text": "Second chunk of text" },
    { "index": 10, "text": "Chunk with explicit index" }
  ]
}
```

#### Get Chunks
```http
GET /api/sources/:id/chunks?offset=0&limit=100
```

### Segmentation

#### Segment a Source
```http
POST /api/sources/:id/segment
Content-Type: application/json

{
  "mode": "heuristic",
  "minChunks": 3,
  "maxChunks": 50
}
```

### Episodes

#### List Episodes for a Source
```http
GET /api/sources/:id/episodes
```

#### Get Episode Details
```http
GET /api/episodes/:id
```

#### Get Episode with Full Text
```http
GET /api/episodes/:id/chunks
```

Response:
```json
{
  "episode": {
    "id": "...",
    "title": "Introduction to PostgreSQL",
    "summary": "...",
    "startChunkIndex": 0,
    "endChunkIndex": 3
  },
  "chunks": [...],
  "fullText": "Combined text of all chunks..."
}
```

## CLI Usage

### Create a Source
```bash
npm run cli create-source -- -n "My Transcript" -t MEETING
```

### Ingest from File
```bash
npm run cli ingest -- -s <sourceId> -f transcript.txt -d "\n\n"
```

### Segment a Source
```bash
# Heuristic mode
npm run cli segment -- -s <sourceId> -m heuristic

# LLM mode
npm run cli segment -- -s <sourceId> -m llm
```

### List Episodes
```bash
npm run cli list-episodes -- -s <sourceId>
```

### Show Episode Details
```bash
npm run cli show-episode -- -e <episodeId>
```

## Integration Examples

### RAG (Retrieval-Augmented Generation)

```typescript
import fetch from 'node-fetch';

// Fetch episodes for a source
const response = await fetch('http://localhost:3000/api/sources/abc123/episodes');
const episodes = await response.json();

// Use episode summaries for retrieval
episodes.forEach(episode => {
  // Index episode.summary in your vector database
  // Store episode.id as metadata for retrieval
  vectorDB.index({
    text: episode.summary,
    metadata: { episodeId: episode.id, title: episode.title }
  });
});

// When retrieving, fetch full episode text
async function getEpisodeContext(episodeId: string) {
  const response = await fetch(`http://localhost:3000/api/episodes/${episodeId}/chunks`);
  const { fullText } = await response.json();
  return fullText;
}
```

### Analytics Dashboard

```typescript
// Analyze conversation patterns
const sources = await fetch('http://localhost:3000/api/sources').then(r => r.json());

for (const source of sources) {
  const episodes = await fetch(`http://localhost:3000/api/sources/${source.id}/episodes`)
    .then(r => r.json());

  console.log(`Source: ${source.name}`);
  console.log(`Total Episodes: ${episodes.length}`);
  console.log(`Average Episode Length: ${
    episodes.reduce((sum, ep) => sum + (ep.endChunkIndex - ep.startChunkIndex + 1), 0) / episodes.length
  } chunks`);
}
```

### Memory Vault Integration

```typescript
// Export episodes to a memory vault system
async function exportToMemoryVault(sourceId: string) {
  const episodes = await fetch(`http://localhost:3000/api/sources/${sourceId}/episodes`)
    .then(r => r.json());

  const memories = episodes.map(episode => ({
    id: episode.id,
    title: episode.title,
    content: episode.summary,
    metadata: {
      source: sourceId,
      episodeIndex: episode.episodeIndex,
      chunkRange: [episode.startChunkIndex, episode.endChunkIndex],
      createdAt: episode.createdAt
    }
  }));

  // Store in your memory vault
  await memoryVault.bulkInsert(memories);
}
```

## Configuration

Environment variables (see `.env.example`):

| Variable | Description | Default |
|----------|-------------|---------|
| `DATABASE_URL` | PostgreSQL connection string | Required |
| `PORT` | Server port | 3000 |
| `NODE_ENV` | Environment (development/production) | development |
| `OPENAI_API_KEY` | OpenAI API key for LLM mode | Optional |
| `OPENAI_MODEL` | OpenAI model to use | gpt-4o-mini |
| `DEFAULT_SEGMENTATION_MODE` | Default mode (heuristic/llm) | heuristic |
| `MIN_EPISODE_CHUNKS` | Minimum chunks per episode | 3 |
| `MAX_EPISODE_CHUNKS` | Maximum chunks per episode | 50 |

## Development

### Project Structure

```
src/
├── index.ts              # Server entry point
├── server.ts             # Fastify server setup
├── cli.ts                # CLI commands
├── seed.ts               # Demo data seeder
├── lib/
│   ├── db.ts             # Prisma client
│   └── config.ts         # Environment config
├── routes/
│   ├── sources.ts        # Source & chunk endpoints
│   └── episodes.ts       # Episode endpoints
└── services/
    ├── segmentation.ts          # Main orchestrator
    ├── heuristic-segmenter.ts   # Heuristic engine
    └── llm-segmenter.ts         # LLM engine
```

### Extending Segmentation

To add a custom segmentation strategy:

```typescript
// src/services/custom-segmenter.ts
import { RawChunk } from '@prisma/client';
import { EpisodeSegment } from './heuristic-segmenter';

export class CustomSegmenter {
  segment(chunks: RawChunk[]): EpisodeSegment[] {
    // Your custom logic here
    return segments;
  }
}

// Update src/services/segmentation.ts to use your segmenter
```

## Deployment

### Docker (Example)

```dockerfile
FROM node:18-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production
COPY . .
RUN npm run build
CMD ["npm", "start"]
```

### Railway / Render / Heroku

1. Set `DATABASE_URL` environment variable
2. Run `npm run db:migrate` as part of build process
3. Start with `npm start`

## Use Cases

- **Customer Support Analysis**: Segment support chat logs into issue episodes
- **Meeting Transcription**: Break down long meetings into discussion topics
- **Content Moderation**: Identify conversation segments for review
- **Research Analysis**: Chunk interview transcripts by themes
- **RAG Systems**: Create semantically meaningful retrieval units
- **Conversation Analytics**: Track topic flow and speaker dynamics

## Contributing

Contributions welcome! Please open an issue or PR.

## License

MIT

## Support

For issues and questions, please open a GitHub issue or contact the maintainers.

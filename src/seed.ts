import { prisma } from './lib/db';
import { segmentSource } from './services/segmentation';

const DEMO_TRANSCRIPT = [
  `User: Hi! I'm trying to understand how to set up a PostgreSQL database for my new project.`,

  `Assistant: I'd be happy to help you set up PostgreSQL! First, let me ask a few questions to better understand your needs. What operating system are you using, and is this for development or production?`,

  `User: I'm on macOS, and this is just for local development right now. Eventually, I'll deploy to a cloud platform.`,

  `Assistant: Great! For macOS, I recommend using Homebrew to install PostgreSQL. Here's what you need to do:

1. Install PostgreSQL: brew install postgresql@15
2. Start the service: brew services start postgresql@15
3. Create your first database: createdb myproject

Would you like me to explain any of these steps in more detail?`,

  `User: That's helpful! I actually already have Postgres installed. My main question is about database design. I'm building a task management app.`,

  `Assistant: Excellent! Let's talk about database design for a task management app. Here are the core tables you'll likely need:

1. Users - to store user accounts
2. Projects - to group related tasks
3. Tasks - the main entity with fields like title, description, due_date, priority
4. Tags - for categorizing tasks
5. TaskTags - a junction table for many-to-many relationship

Would you like me to show you a sample schema?`,

  `User: Yes, please! Especially the Tasks table with proper foreign keys.`,

  `Assistant: Here's a sample schema for the Tasks table:

CREATE TABLE tasks (
  id SERIAL PRIMARY KEY,
  title VARCHAR(255) NOT NULL,
  description TEXT,
  due_date TIMESTAMP,
  priority INTEGER DEFAULT 0,
  status VARCHAR(50) DEFAULT 'pending',
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  project_id INTEGER REFERENCES projects(id) ON DELETE SET NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

The CASCADE and SET NULL options ensure data integrity when related records are deleted.`,

  `User: Perfect! Now I'm wondering about indexing. What columns should I index?`,

  `Assistant: Great question! Indexes speed up queries but slow down writes, so choose wisely. For a task management app, I recommend indexing:

1. user_id - you'll frequently query tasks by user
2. project_id - for filtering tasks by project
3. status - for queries like "show all pending tasks"
4. due_date - for sorting and filtering by deadline
5. (user_id, status) - composite index for common queries

You can create these with:
CREATE INDEX idx_tasks_user_id ON tasks(user_id);
CREATE INDEX idx_tasks_status ON tasks(status);`,

  `User: Thanks! One more thing - what about handling task assignments? A task might be assigned to multiple people.`,

  `Assistant: For multiple assignees, you'll need a many-to-many relationship. Create a junction table:

CREATE TABLE task_assignments (
  id SERIAL PRIMARY KEY,
  task_id INTEGER NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  assigned_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(task_id, user_id)
);

The UNIQUE constraint prevents duplicate assignments. You can also add fields like 'role' or 'is_primary' if needed.`,

  `User: This is incredibly helpful! Let me switch topics - I'm also curious about API design. Should I use REST or GraphQL?`,

  `Assistant: Both are valid choices! Here's a quick comparison for your task management app:

REST Benefits:
- Simpler to implement and understand
- Better caching with HTTP
- Widely supported tooling

GraphQL Benefits:
- Fetch exactly what you need (no over/under-fetching)
- Single endpoint
- Great for complex, nested data

For a task management app, I'd recommend starting with REST since it's simpler. You can always add GraphQL later if needed.`,

  `User: Makes sense. What would a typical REST API structure look like?`,

  `Assistant: Here's a RESTful structure for your task management app:

GET    /api/tasks           - List all tasks (with filtering)
POST   /api/tasks           - Create a new task
GET    /api/tasks/:id       - Get a specific task
PUT    /api/tasks/:id       - Update a task
DELETE /api/tasks/:id       - Delete a task

GET    /api/projects/:id/tasks  - Get tasks for a project
GET    /api/users/:id/tasks     - Get tasks for a user

POST   /api/tasks/:id/assign    - Assign users to a task

Use query parameters for filtering: /api/tasks?status=pending&priority=high`,

  `User: Great! And what about authentication? JWT or sessions?`,

  `Assistant: For a modern web app, I'd recommend JWT (JSON Web Tokens) because:

1. Stateless - no server-side session storage needed
2. Works well with mobile apps and SPAs
3. Can include user claims/roles in the token
4. Easy to scale horizontally

Basic flow:
1. User logs in with credentials
2. Server validates and returns a JWT
3. Client includes JWT in Authorization header for subsequent requests
4. Server validates JWT on each request

Use a library like jsonwebtoken (Node.js) or passport-jwt for implementation.`,
];

async function seed() {
  console.log('Starting seed process...');

  try {
    // Clean up existing data
    console.log('Cleaning up existing data...');
    await prisma.episode.deleteMany({});
    await prisma.rawChunk.deleteMany({});
    await prisma.sourceStream.deleteMany({});

    // Create demo source
    console.log('Creating demo source...');
    const source = await prisma.sourceStream.create({
      data: {
        name: 'Tech Support Conversation - PostgreSQL & API Design',
        type: 'CHAT',
        metaJson: {
          participants: ['User', 'Assistant'],
          topics: ['PostgreSQL', 'Database Design', 'API Design', 'Authentication'],
        },
      },
    });

    console.log(`Created source: ${source.id}`);

    // Create chunks from transcript
    console.log(`Creating ${DEMO_TRANSCRIPT.length} chunks...`);
    await prisma.$transaction(
      DEMO_TRANSCRIPT.map((text, index) =>
        prisma.rawChunk.create({
          data: {
            sourceId: source.id,
            index,
            text,
          },
        })
      )
    );

    // Fetch source with chunks
    const sourceWithChunks = await prisma.sourceStream.findUnique({
      where: { id: source.id },
      include: {
        chunks: {
          orderBy: { index: 'asc' },
        },
      },
    });

    if (!sourceWithChunks) {
      throw new Error('Failed to fetch source with chunks');
    }

    // Run segmentation
    console.log('Running heuristic segmentation...');
    const episodes = await segmentSource(sourceWithChunks, {
      mode: 'heuristic',
      minChunks: 2,
      maxChunks: 10,
    });

    console.log(`\nCreated ${episodes.length} episodes:\n`);
    episodes.forEach(ep => {
      console.log(`Episode ${ep.episodeIndex}: ${ep.title}`);
      console.log(`  Chunks: ${ep.startChunkIndex} - ${ep.endChunkIndex} (${ep.endChunkIndex - ep.startChunkIndex + 1} chunks)`);
      console.log(`  Summary: ${ep.summary?.slice(0, 100)}...`);
      console.log('');
    });

    console.log('\nSeed completed successfully!');
    console.log(`\nSource ID: ${source.id}`);
    console.log('\nNext steps:');
    console.log(`1. View episodes: npm run cli list-episodes -- -s ${source.id}`);
    console.log(`2. Start the server: npm run dev`);
    console.log(`3. Access API: GET http://localhost:3000/api/sources/${source.id}/episodes`);
  } catch (error) {
    console.error('Seed failed:', error);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

seed();

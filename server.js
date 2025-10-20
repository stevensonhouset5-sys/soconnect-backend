import express from 'express';
import pkg from 'pg';
import cors from 'cors';
import bcrypt from 'bcryptjs';

const { Pool } = pkg;
const app = express();
app.use(cors());
app.use(express.json());

// Connect to Neon PostgreSQL
// Connect to Neon PostgreSQL with better error handling
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
  ssl: {
    rejectUnauthorized: false
  }
});

// Test database connection
@@ -24,10 +25,53 @@ app.get('/', async (req, res) => {
      time: result.rows[0].now 
    });
  } catch (error) {
    res.status(500).json({ error: 'Database connection failed' });
    console.error('Database connection error:', error);
    res.status(500).json({ 
      error: 'Database connection failed',
      details: error.message 
    });
  }
});

// Create tables if they don't exist
async function initializeDatabase() {
  try {
    // Create users table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS users (
        five_digit_code VARCHAR(5) PRIMARY KEY,
        name VARCHAR(100) NOT NULL,
        passcode VARCHAR(255) NOT NULL,
        created_at TIMESTAMP DEFAULT NOW()
      )
    `);

    // Create messages table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS messages (
        id BIGSERIAL PRIMARY KEY,
        from_user VARCHAR(5) NOT NULL,
        to_user VARCHAR(5) NOT NULL,
        text TEXT NOT NULL,
        timestamp TIMESTAMP DEFAULT NOW()
      )
    `);

    // Create indexes
    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_messages_conversation 
      ON messages (from_user, to_user, timestamp)
    `);

    console.log('Database tables initialized successfully');
  } catch (error) {
    console.error('Database initialization error:', error);
  }
}

// Initialize database on startup
initializeDatabase();

// User Registration
app.post('/api/register', async (req, res) => {
  const { name, code, passcode } = req.body;
@@ -51,7 +95,8 @@ app.post('/api/register', async (req, res) => {

    res.json({ success: true, message: 'User registered successfully' });
  } catch (error) {
    res.status(500).json({ error: 'Registration failed' });
    console.error('Registration error:', error);
    res.status(500).json({ error: 'Registration failed: ' + error.message });
  }
});

@@ -71,7 +116,8 @@ app.post('/api/login', async (req, res) => {
      res.status(401).json({ error: 'Invalid credentials' });
    }
  } catch (error) {
    res.status(500).json({ error: 'Login failed' });
    console.error('Login error:', error);
    res.status(500).json({ error: 'Login failed: ' + error.message });
  }
});

@@ -87,7 +133,8 @@ app.post('/api/message', async (req, res) => {

    res.json({ success: true, message: 'Message sent' });
  } catch (error) {
    res.status(500).json({ error: 'Failed to send message' });
    console.error('Send message error:', error);
    res.status(500).json({ error: 'Failed to send message: ' + error.message });
  }
});

@@ -106,7 +153,8 @@ app.get('/api/messages/:user1/:user2', async (req, res) => {

    res.json(result.rows);
  } catch (error) {
    res.status(500).json({ error: 'Failed to load messages' });
    console.error('Get messages error:', error);
    res.status(500).json({ error: 'Failed to load messages: ' + error.message });
  }
});

@@ -131,11 +179,23 @@ app.get('/api/conversations/:userCode', async (req, res) => {

    res.json(result.rows);
  } catch (error) {
    res.status(500).json({ error: 'Failed to load conversations' });
    console.error('Get conversations error:', error);
    res.status(500).json({ error: 'Failed to load conversations: ' + error.message });
  }
});

// Health check endpoint
app.get('/health', async (req, res) => {
  try {
    await pool.query('SELECT 1');
    res.json({ status: 'OK', database: 'Connected' });
  } catch (error) {
    res.status(500).json({ status: 'Error', database: 'Disconnected', error: error.message });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`SoConnect backend running on port ${PORT}`);
  console.log('Database URL:', process.env.DATABASE_URL ? 'Set' : 'Not set');
});

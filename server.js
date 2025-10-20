import express from 'express';
import pkg from 'pg';
import cors from 'cors';

const { Pool } = pkg;
const app = express();
app.use(cors());
app.use(express.json());

// Connect to Neon PostgreSQL with better error handling
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: {
    rejectUnauthorized: false
  }
});

// Test database connection
app.get('/', async (req, res) => {
  try {
    const result = await pool.query('SELECT NOW()');
    res.json({ 
      message: 'SoConnect Backend Running!', 
      database: 'Connected',
      time: result.rows[0].now 
    });
  } catch (error) {
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
  
  try {
    // Check if user already exists
    const existing = await pool.query(
      'SELECT * FROM users WHERE five_digit_code = $1',
      [code]
    );
    
    if (existing.rows.length > 0) {
      return res.status(400).json({ error: '5-digit code already registered' });
    }
    
    // Create new user
    await pool.query(
      'INSERT INTO users (five_digit_code, name, passcode) VALUES ($1, $2, $3)',
      [code, name, passcode]
    );
    
    res.json({ success: true, message: 'User registered successfully' });
  } catch (error) {
    console.error('Registration error:', error);
    res.status(500).json({ error: 'Registration failed: ' + error.message });
  }
});

// User Login
app.post('/api/login', async (req, res) => {
  const { code, passcode } = req.body;
  
  try {
    const result = await pool.query(
      'SELECT * FROM users WHERE five_digit_code = $1 AND passcode = $2',
      [code, passcode]
    );
    
    if (result.rows.length > 0) {
      res.json({ success: true, user: result.rows[0] });
    } else {
      res.status(401).json({ error: 'Invalid credentials' });
    }
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ error: 'Login failed: ' + error.message });
  }
});

// Send Message
app.post('/api/message', async (req, res) => {
  const { from, to, text } = req.body;
  
  try {
    await pool.query(
      'INSERT INTO messages (from_user, to_user, text) VALUES ($1, $2, $3)',
      [from, to, text]
    );
    
    res.json({ success: true, message: 'Message sent' });
  } catch (error) {
    console.error('Send message error:', error);
    res.status(500).json({ error: 'Failed to send message: ' + error.message });
  }
});

// Get Messages between two users
app.get('/api/messages/:user1/:user2', async (req, res) => {
  const { user1, user2 } = req.params;
  
  try {
    const result = await pool.query(
      `SELECT * FROM messages 
       WHERE (from_user = $1 AND to_user = $2) 
          OR (from_user = $2 AND to_user = $1) 
       ORDER BY timestamp ASC`,
      [user1, user2]
    );
    
    res.json(result.rows);
  } catch (error) {
    console.error('Get messages error:', error);
    res.status(500).json({ error: 'Failed to load messages: ' + error.message });
  }
});

// Get user's conversations
app.get('/api/conversations/:userCode', async (req, res) => {
  const { userCode } = req.params;
  
  try {
    const result = await pool.query(
      `SELECT DISTINCT 
        CASE 
          WHEN from_user = $1 THEN to_user 
          ELSE from_user 
        END as contact,
        MAX(timestamp) as last_message
       FROM messages 
       WHERE from_user = $1 OR to_user = $1 
       GROUP BY contact 
       ORDER BY last_message DESC`,
      [userCode]
    );
    
    res.json(result.rows);
  } catch (error) {
    console.error('Get conversations error:', error);
    res.status(500).json({ error: 'Failed to load conversations: ' + error.message });
  }
});

// ==================== ADMIN ENDPOINTS ====================

// Get all users (Admin only)
app.get('/api/admin/users', async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT five_digit_code as code, name, created_at as created FROM users ORDER BY created_at DESC'
    );
    
    // Format the response
    const users = result.rows.map(user => ({
      ...user,
      created: new Date(user.created).toLocaleDateString(),
      status: 'active'
    }));
    
    res.json(users);
  } catch (error) {
    console.error('Admin users error:', error);
    res.status(500).json({ error: 'Failed to load users: ' + error.message });
  }
});

// Get all messages (Admin only)
app.get('/api/admin/messages', async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT m.*, 
             u1.name as from_name,
             u2.name as to_name
      FROM messages m
      LEFT JOIN users u1 ON m.from_user = u1.five_digit_code
      LEFT JOIN users u2 ON m.to_user = u2.five_digit_code
      ORDER BY m.timestamp DESC
    `);
    
    res.json(result.rows);
  } catch (error) {
    console.error('Admin messages error:', error);
    res.status(500).json({ error: 'Failed to load messages: ' + error.message });
  }
});

// Delete user (Admin only)
app.delete('/api/admin/users/:code', async (req, res) => {
  const { code } = req.params;
  
  try {
    // Start a transaction
    const client = await pool.connect();
    
    try {
      await client.query('BEGIN');
      
      // Delete user's messages
      await client.query(
        'DELETE FROM messages WHERE from_user = $1 OR to_user = $1',
        [code]
      );
      
      // Delete user
      await client.query(
        'DELETE FROM users WHERE five_digit_code = $1',
        [code]
      );
      
      await client.query('COMMIT');
      res.json({ success: true, message: `User ${code} deleted successfully` });
      
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
    
  } catch (error) {
    console.error('Delete user error:', error);
    res.status(500).json({ error: 'Failed to delete user: ' + error.message });
  }
});

// Delete message (Admin only)
app.delete('/api/admin/messages/:id', async (req, res) => {
  const { id } = req.params;
  
  try {
    const result = await pool.query(
      'DELETE FROM messages WHERE id = $1 RETURNING *',
      [id]
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Message not found' });
    }
    
    res.json({ success: true, message: 'Message deleted successfully' });
  } catch (error) {
    console.error('Delete message error:', error);
    res.status(500).json({ error: 'Failed to delete message: ' + error.message });
  }
});

// Get system statistics (Admin only)
app.get('/api/admin/stats', async (req, res) => {
  try {
    // Get total users
    const usersResult = await pool.query('SELECT COUNT(*) as count FROM users');
    const totalUsers = parseInt(usersResult.rows[0].count);
    
    // Get total messages
    const messagesResult = await pool.query('SELECT COUNT(*) as count FROM messages');
    const totalMessages = parseInt(messagesResult.rows[0].count);
    
    // Get active chats (unique conversation pairs)
    const chatsResult = await pool.query(`
      SELECT COUNT(DISTINCT 
        CASE 
          WHEN from_user < to_user THEN from_user || '_' || to_user 
          ELSE to_user || '_' || from_user 
        END
      ) as count FROM messages
    `);
    const activeChats = parseInt(chatsResult.rows[0].count);
    
    res.json({
      totalUsers,
      totalMessages,
      activeChats
    });
    
  } catch (error) {
    console.error('Admin stats error:', error);
    res.status(500).json({ error: 'Failed to load stats: ' + error.message });
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
  console.log('Admin endpoints available at:');
  console.log('  GET  /api/admin/users');
  console.log('  GET  /api/admin/messages');
  console.log('  GET  /api/admin/stats');
  console.log('  DELETE /api/admin/users/:code');
  console.log('  DELETE /api/admin/messages/:id');
});

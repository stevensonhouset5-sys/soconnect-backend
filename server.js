import express from 'express';
import pkg from 'pg';
import cors from 'cors';
import bcrypt from 'bcryptjs';

const { Pool } = pkg;
const app = express();
app.use(cors());
app.use(express.json());

// Connect to Neon PostgreSQL
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
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
    res.status(500).json({ error: 'Database connection failed' });
  }
});

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
    res.status(500).json({ error: 'Registration failed' });
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
    res.status(500).json({ error: 'Login failed' });
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
    res.status(500).json({ error: 'Failed to send message' });
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
    res.status(500).json({ error: 'Failed to load messages' });
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
    res.status(500).json({ error: 'Failed to load conversations' });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`SoConnect backend running on port ${PORT}`);
});

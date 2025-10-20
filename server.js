import express from 'express';
import pkg from 'pg';
import cors from 'cors';
import bcrypt from 'bcryptjs';
import multer from 'multer';
import path from 'path';
import { fileURLToPath } from 'url';

const { Pool } = pkg;
const app = express();

// ES module fix for __dirname
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

app.use(cors());
app.use(express.json());
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// Connect to Neon PostgreSQL
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

// Configure multer for file uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, 'uploads/');
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, uniqueSuffix + '-' + file.originalname);
  }
});

const upload = multer({
  storage: storage,
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB limit
  },
  fileFilter: (req, file, cb) => {
    // Allow images and common file types
    const allowedTypes = [
      'image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp',
      'application/pdf', 'text/plain', 'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
    ];
    if (allowedTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('File type not allowed'), false);
    }
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
        text TEXT,
        file_name VARCHAR(255),
        file_url VARCHAR(500),
        file_type VARCHAR(100),
        file_size BIGINT,
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

// File upload endpoint
app.post('/api/upload', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    const { from, to } = req.body;
    
    if (!from || !to) {
      return res.status(400).json({ error: 'Missing from or to user' });
    }

    // Save file info to database
    const result = await pool.query(
      `INSERT INTO messages (from_user, to_user, file_name, file_url, file_type, file_size) 
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
      [
        from,
        to,
        req.file.originalname,
        `/uploads/${req.file.filename}`,
        req.file.mimetype,
        req.file.size
      ]
    );

    res.json({
      success: true,
      message: 'File uploaded successfully',
      file: result.rows[0]
    });
  } catch (error) {
    console.error('File upload error:', error);
    res.status(500).json({ error: 'File upload failed: ' + error.message });
  }
});

// Your existing endpoints remain the same...
app.post('/api/register', async (req, res) => {
  // ... existing code
});

app.post('/api/login', async (req, res) => {
  // ... existing code
});

app.post('/api/message', async (req, res) => {
  // ... existing code
});

app.get('/api/messages/:user1/:user2', async (req, res) => {
  // ... existing code
});

app.get('/api/conversations/:userCode', async (req, res) => {
  // ... existing code
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`SoConnect backend running on port ${PORT}`);
  // Create uploads directory if it doesn't exist
  const fs = require('fs');
  if (!fs.existsSync('uploads')) {
    fs.mkdirSync('uploads');
  }
});

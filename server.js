const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const bcrypt = require('bcrypt');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const axios = require('axios');

const app = express();
const port = 3000;

// Initialize SQLite database
const db = new sqlite3.Database('users.db', (err) => {
  if (err) {
    console.error('Database connection error:', err.message);
    process.exit(1); // Exit if database fails to connect
  } else {
    console.log('Successfully connected to SQLite database.');
    db.run(`
      CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        email TEXT NOT NULL UNIQUE,
        password TEXT,
        profilePicture TEXT
      )
    `);
    db.run(`
      CREATE TABLE IF NOT EXISTS time_off_requests (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        userId INTEGER,
        leaveType TEXT NOT NULL,
        startDate TEXT NOT NULL,
        endDate TEXT NOT NULL,
        reason TEXT,
        approver TEXT,
        createdAt TEXT DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (userId) REFERENCES users(id)
      )
    `);
    db.run(`
      CREATE TABLE IF NOT EXISTS messages (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        userId INTEGER,
        sender TEXT NOT NULL,
        content TEXT NOT NULL,
        createdAt TEXT DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (userId) REFERENCES users(id)
      )
    `);
    db.run(`
      CREATE TABLE IF NOT EXISTS chat_history (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        userId INTEGER,
        prompt TEXT NOT NULL,
        response TEXT,
        createdAt TEXT DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (userId) REFERENCES users(id)
      )
    `);
    db.get(`SELECT id FROM users WHERE id = 1`, (err, row) => {
      if (err) {
        console.error('Error checking default user:', err.message);
      }
      if (!row) {
        const defaultPfp = '/uploads/default.jpg';
        console.log('Creating default user with id=1');
        db.run(
          `INSERT INTO users (id, name, email, password, profilePicture) VALUES (?, ?, ?, ?, ?)`,
          [1, 'John Doe', 'john.doe@example.com', bcrypt.hashSync('defaultpassword', 10), defaultPfp],
          (err) => {
            if (err) {
              console.error('Error inserting default user:', err.message);
            } else {
              console.log('Default user created with id=1');
              const uploadPath = path.join(__dirname, 'uploads');
              if (!fs.existsSync(uploadPath)) {
                console.log('Creating uploads directory');
                fs.mkdirSync(uploadPath, { recursive: true });
              }
              if (!fs.existsSync(path.join(uploadPath, 'default.jpg'))) {
                console.log('Creating default.jpg placeholder');
                fs.writeFileSync(path.join(uploadPath, 'default.jpg'), '');
              }
            }
          }
        );
      }
    });
  }
});

app.use(express.json());
app.use(express.static('public'));
app.use('/uploads', express.static('uploads', {
  setHeaders: (res) => {
    res.set('Cache-Control', 'no-store, no-cache, must-revalidate, private');
    res.set('Pragma', 'no-cache');
    res.set('Expires', '0');
  }
}));

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadPath = path.join(__dirname, 'uploads');
    if (!fs.existsSync(uploadPath)) {
      console.log('Creating uploads directory for file upload');
      fs.mkdirSync(uploadPath, { recursive: true });
    }
    cb(null, uploadPath);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = crypto.randomBytes(16).toString('hex');
    const filename = `pfp-${req.body.userId}-${uniqueSuffix}${path.extname(file.originalname)}`;
    console.log(`Generating filename for upload: ${filename}`);
    cb(null, filename);
  }
});
const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith('image/')) {
      console.log(`Accepted file upload: ${file.originalname}`);
      cb(null, true);
    } else {
      console.log(`Rejected file upload: ${file.originalname} (Only images allowed)`);
      cb(new Error('Only images are allowed'), false);
    }
  }
}).single('profilePicture');

app.post('/api/time-off', (req, res) => {
  console.log('Received time-off request:', req.body);
  const { userId, leaveType, startDate, endDate, reason, approver } = req.body;
  if (!userId || !leaveType || !startDate || !endDate) {
    console.log('Missing required fields for time-off request');
    return res.status(400).json({ error: 'Missing required fields' });
  }
  db.run(
    `INSERT INTO time_off_requests (userId, leaveType, startDate, endDate, reason, approver) VALUES (?, ?, ?, ?, ?, ?)`,
    [userId, leaveType, startDate, endDate, reason, approver],
    (err) => {
      if (err) {
        console.error('Error saving time-off request:', err.message);
        return res.status(500).json({ error: 'Failed to save request' });
      }
      console.log('Time-off request saved successfully for userId:', userId);
      res.json({ message: 'Request saved successfully' });
    }
  );
});

app.get('/api/messages', (req, res) => {
  console.log('Fetching messages for userId:', req.query.userId);
  const { userId } = req.query;
  db.all(
    `SELECT * FROM messages WHERE userId = ? ORDER BY createdAt DESC`,
    [userId],
    (err, rows) => {
      if (err) {
        console.error('Error fetching messages:', err.message);
        return res.status(500).json({ error: 'Failed to fetch messages' });
      }
      console.log('Messages fetched successfully:', rows.length, 'records');
      res.json(rows);
    }
  );
});

app.post('/api/messages', (req, res) => {
  console.log('Received message:', req.body);
  const { userId, content } = req.body;
  if (!userId || !content) {
    console.log('Missing required fields for message');
    return res.status(400).json({ error: 'Missing required fields' });
  }
  db.run(
    `INSERT INTO messages (userId, sender, content) VALUES (?, ?, ?)`,
    [userId, 'You', content],
    (err) => {
      if (err) {
        console.error('Error saving message:', err.message);
        return res.status(500).json({ error: 'Failed to save message' });
      }
      console.log('Message saved successfully for userId:', userId);
      res.json({ message: 'Message saved successfully' });
    }
  );
});

app.get('/api/users/:id', (req, res) => {
  console.log('Fetching user data for id:', req.params.id);
  const { id } = req.params;
  db.get(
    `SELECT name, email, profilePicture FROM users WHERE id = ?`,
    [id],
    (err, row) => {
      if (err) {
        console.error('Error fetching user:', err.message);
        return res.status(500).json({ error: 'Failed to fetch user' });
      }
      if (!row) {
        console.log('User not found for id:', id);
        return res.status(404).json({ error: `User with ID ${id} not found` });
      }
      console.log('User data fetched successfully:', row);
      res.json(row);
    }
  );
});

app.post('/api/settings', (req, res, next) => {
  console.log('Received settings update request:', req.body);
  upload(req, res, async (err) => {
    if (err) {
      console.error('Multer error during settings update:', err.message);
      return res.status(400).json({ error: err.message });
    }

    const { userId, name, email, password } = req.body;
    const profilePicture = req.file ? `/uploads/${req.file.filename}` : null;
    console.log('Processed settings data:', { userId, name, email, password: !!password, profilePicture });

    if (!userId || !name || !email) {
      console.log('Missing required fields for settings update');
      return res.status(400).json({ error: 'Missing required fields' });
    }

    db.get(`SELECT id FROM users WHERE id = ?`, [userId], async (err, row) => {
      if (err) {
        console.error('Error checking user existence:', err.message);
        return res.status(500).json({ error: 'Database error' });
      }
      if (!row) {
        console.log('User not found for settings update:', userId);
        return res.status(404).json({ error: `User with ID ${userId} not found` });
      }

      try {
        let query = `UPDATE users SET name = ?, email = ?`;
        const params = [name, email];

        if (password) {
          const hashedPassword = await bcrypt.hash(password, 10);
          query += `, password = ?`;
          params.push(hashedPassword);
        }
        if (profilePicture) {
          query += `, profilePicture = ?`;
          params.push(profilePicture);
        }
        query += ` WHERE id = ?`;
        params.push(userId);

        db.run(query, params, (err) => {
          if (err) {
            console.error('Error updating user settings:', err.message);
            return res.status(500).json({ error: 'Failed to update settings: ' + err.message });
          }
          console.log('User settings updated successfully for userId:', userId);
          res.json({ message: 'Settings updated successfully', profilePicture });
        });
      } catch (error) {
        console.error('Error processing settings update:', error.message);
        res.status(500).json({ error: 'Error updating settings: ' + error.message });
      }
    });
  });
});

// Graceful shutdown
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);

function shutdown() {
  console.log('Initiating shutdown of Node.js server...');
  process.exit(0);
}

// AI inference endpoint with persistent model
app.post('/api/ai-inference', async (req, res) => {
  console.log('Received AI inference request, raw body:', JSON.stringify(req.body));
  const { prompt, userId } = req.body;
  if (!prompt || !userId) {
    console.log('Validation failed: Missing required fields - prompt:', !!prompt, 'userId:', !!userId);
    return res.status(400).json({ error: 'Prompt and userId are required' });
  }

  try {
    console.log(`Attempting to initialize model for user ${userId}`);
    const initResponse = await axios.post('http://127.0.0.1:5000/init-model/' + userId);
    console.log('Model initialization response received:', JSON.stringify(initResponse.data));
    if (initResponse.data.status !== 'success') {
      throw new Error(`Model initialization failed: ${initResponse.data.message}`);
    }
    console.log(`Model initialized or already loaded for user ${userId}`);

    // Prepare chat messages with system role
    const messages = [
      { "role": "system", "content": "You are an AI HR Agent for DNE AI, a cutting-edge artificial intelligence company dedicated to advancing human potential through innovative AI solutions. Your role is to assist employees, candidates, and stakeholders with HR-related inquiries in a professional, empathetic, and efficient manner. You embody DNE AI’s core values: innovation, integrity, inclusivity, and collaboration." },
      { "role": "user", "content": prompt }
    ];
    console.log('Sending chat messages to LLM server:', JSON.stringify(messages));

    // Generate response
    console.log(`Sending generate request to http://127.0.0.1:5000/generate/${userId}`);
    const genResponse = await axios.post('http://127.0.0.1:5000/generate/' + userId, { messages });
    console.log('Generate response received:', JSON.stringify(genResponse.data));
    if (genResponse.data.status !== 'success') {
      throw new Error(`Generate request failed: ${genResponse.data.message}`);
    }
    const response = genResponse.data.response;
    console.log('AI inference response:', response);

    // Save to chat history
    console.log(`Attempting to save chat history for user ${userId}, prompt: ${prompt}, response: ${response}`);
    db.run(
      `INSERT INTO chat_history (userId, prompt, response) VALUES (?, ?, ?)`,
      [userId, prompt, response],
      (err) => {
        if (err) {
          console.error('Error saving chat history:', err.message);
        } else {
          console.log('Chat history saved successfully for userId:', userId);
        }
      }
    );

    res.json({ response });
  } catch (error) {
    console.error('Error in AI inference process:', {
      message: error.message,
      stack: error.stack,
      code: error.code
    });
    res.status(500).json({ error: 'Failed to generate AI response', details: error.message });
  }
});

// Endpoint to get chat history for a user
app.get('/api/chat-history/:userId', (req, res) => {
  console.log('Fetching chat history for userId:', req.params.userId);
  const { userId } = req.params;
  db.all(
    `SELECT prompt, response, createdAt FROM chat_history WHERE userId = ? ORDER BY createdAt DESC`,
    [userId],
    (err, rows) => {
      if (err) {
        console.error('Error fetching chat history:', err.message);
        return res.status(500).json({ error: 'Failed to fetch chat history' });
      }
      console.log('Chat history fetched successfully:', rows.length, 'records');
      res.json(rows);
    }
  );
});

app.listen(port, () => {
  console.log(`Server started and listening on port ${port}`);
});
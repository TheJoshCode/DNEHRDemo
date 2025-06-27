const express = require('express');
const bcrypt = require('bcrypt');
const sqlite3 = require('sqlite3').verbose();
const multer = require('multer');
const session = require('express-session');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

// Setup SQLite database
const db = new sqlite3.Database('./dne-ai.db', (err) => {
  if (err) console.error('DB connection error:', err);
  else console.log('Connected to SQLite DB');
});

// Middlewares
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Session setup
app.use(session({
  secret: 'your-secret-key', // In prod, use environment variable
  resave: false,
  saveUninitialized: false,
  cookie: { secure: false, maxAge: 1000 * 60 * 60 * 24 } // 1 day
}));

// Serve static files from public folder
app.use(express.static(path.join(__dirname, 'public')));

// Multer setup for file uploads (profile pictures, etc)
const upload = multer({ dest: './uploads/' });

// --- Authentication Middleware ---
function requireAuth(req, res, next) {
  if (!req.session.userId) return res.redirect('/login.html');
  next();
}

// --- Routes ---

// Signup
app.post('/api/signup', (req, res) => {
  const { name, email, password } = req.body;
  if (!name || !email || !password)
    return res.status(400).json({ error: 'Name, email and password required' });

  db.get(`SELECT id FROM users WHERE email = ?`, [email], async (err, user) => {
    if (err) return res.status(500).json({ error: 'Database error' });
    if (user) return res.status(409).json({ error: 'Email already exists' });

    try {
      const hashed = await bcrypt.hash(password, 10);
      db.run(
        `INSERT INTO users (name, email, password, profilePicture) VALUES (?, ?, ?, ?)`,
        [name, email, hashed, '/uploads/default.jpg'],
        function (err) {
          if (err) return res.status(500).json({ error: 'Failed to create user' });
          req.session.userId = this.lastID;
          req.session.userName = name;
          res.json({ message: 'Signup successful' });
        }
      );
    } catch (hashErr) {
      return res.status(500).json({ error: 'Password hashing failed' });
    }
  });
});

// Login
app.post('/api/login', (req, res) => {
  const { email, password } = req.body;
  if (!email || !password)
    return res.status(400).json({ error: 'Email and password required' });

  db.get(`SELECT * FROM users WHERE email = ?`, [email], async (err, user) => {
    if (err) return res.status(500).json({ error: 'Database error' });
    if (!user) return res.status(401).json({ error: 'Invalid credentials' });

    try {
      const match = await bcrypt.compare(password, user.password);
      if (!match) return res.status(401).json({ error: 'Invalid credentials' });

      req.session.userId = user.id;
      req.session.userName = user.name;
      res.json({ message: 'Login successful' });
    } catch (compareErr) {
      return res.status(500).json({ error: 'Authentication error' });
    }
  });
});

// Logout
app.post('/api/logout', (req, res) => {
  req.session.destroy(err => {
    if (err) return res.status(500).json({ error: 'Failed to log out' });
    res.json({ message: 'Logged out successfully' });
  });
});

// Example of a protected route (dashboard)
app.get('/dashboard.html', requireAuth, (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'dashboard.html'));
});

// Example API protected endpoint
app.get('/api/profile', requireAuth, (req, res) => {
  db.get('SELECT id, name, email, profilePicture FROM users WHERE id = ?', [req.session.userId], (err, row) => {
    if (err) return res.status(500).json({ error: 'DB error' });
    res.json(row);
  });
});

// TODO: Other routes for time-off requests, messages, settings, etc.
// Use requireAuth middleware to protect

// Start server
app.listen(PORT, () => {
  console.log(`Server listening on http://localhost:${PORT}`);
});

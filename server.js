const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const fs = require('fs').promises;
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;
const DATA_FILE = path.join(__dirname, 'data.json');

// Security middleware
app.use(helmet({
  contentSecurityPolicy: false, // Allow inline SVGs for GitHub Pages compatibility
  crossOriginEmbedderPolicy: false
}));
app.use(cors({
  origin: process.env.ALLOWED_ORIGINS?.split(',') || ['*'],
  methods: ['GET', 'POST'],
  credentials: false
}));
app.use(express.json({ limit: '10kb' }));

// Rate limiting to prevent abuse
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // Limit each IP to 100 requests per windowMs
  message: { error: 'Too many requests, please try again later' },
  standardHeaders: true,
  legacyHeaders: false
});
app.use('/api/', limiter);

// Serve static files for GitHub Pages compatibility
app.use(express.static('public'));

// Initialize data file if not exists
async function initDataFile() {
  try {
    await fs.access(DATA_FILE);
  } catch {
    const initialData = {
      installs: 0,
      votes: 0,
      totalStars: 0,
      starCount: 0,
      uniqueUsers: [],
      lastUpdated: new Date().toISOString(),
      metadata: {
        appName: "apple mods mc",
        version: "2.0.0",
        supportedLanguages: ["en", "ar", "fr"],
        githubRepo: "https://github.com/ramadhan8767/apple"
      }
    };
    await fs.writeFile(DATA_FILE, JSON.stringify(initialData, null, 2));
    console.log('data.json initialized');
  }
}

// GET: Fetch current data
app.get('/api/data', async (req, res) => {
  try {
    const rawData = await fs.readFile(DATA_FILE, 'utf8');
    const data = JSON.parse(rawData);
    
    // Return sanitized data (hide sensitive info)
    res.json({
      installs: data.installs,
      votes: data.votes,
      averageRating: data.starCount > 0 
        ? (data.totalStars / data.starCount).toFixed(1) 
        : '0.0',
      totalRatings: data.starCount,
      lastUpdated: data.lastUpdated,
      metadata: data.metadata
    });
  } catch (error) {
    console.error('Read error:', error);
    res.status(500).json({ error: 'Failed to fetch data' });
  }
});

// POST: Update data with validation
app.post('/api/update', async (req, res) => {
  try {
    const { action, value, userId } = req.body;
    
    // Basic validation
    if (!['install', 'vote', 'rating'].includes(action)) {
      return res.status(400).json({ error: 'Invalid action type' });
    }
    
    // Read current data
    const rawData = await fs.readFile(DATA_FILE, 'utf8');
    const data = JSON.parse(rawData);
    
    // Prevent duplicate actions from same user (basic)
    const userKey = userId || req.ip;
    const actionKey = `${action}_${userKey}`;
    
    if (data.uniqueUsers?.includes(actionKey)) {
      return res.status(409).json({ 
        error: 'Action already recorded for this session',
        message: 'You have already performed this action'
      });
    }
    
    // Process action
    switch(action) {
      case 'install':
        data.installs = (data.installs || 0) + 1;
        break;
        
      case 'vote':
        data.votes = (data.votes || 0) + 1;
        break;
        
      case 'rating':
        const rating = parseInt(value);
        if (isNaN(rating) || rating < 1 || rating > 5) {
          return res.status(400).json({ error: 'Rating must be 1-5' });
        }
        data.totalStars = (data.totalStars || 0) + rating;
        data.starCount = (data.starCount || 0) + 1;
        break;
    }
    
    // Track user action (prevent duplicates)
    if (!data.uniqueUsers) data.uniqueUsers = [];
    data.uniqueUsers.push(actionKey);
    
    // Keep only last 10000 user actions to prevent file bloat
    if (data.uniqueUsers.length > 10000) {
      data.uniqueUsers = data.uniqueUsers.slice(-10000);
    }
    
    data.lastUpdated = new Date().toISOString();
    
    // Write updated data
    await fs.writeFile(DATA_FILE, JSON.stringify(data, null, 2));
    
    // Return updated public stats
    res.json({
      success: true,
      data: {
        installs: data.installs,
        votes: data.votes,
        averageRating: data.starCount > 0 
          ? (data.totalStars / data.starCount).toFixed(1) 
          : '0.0',
        totalRatings: data.starCount
      }
    });
    
  } catch (error) {
    console.error('Update error:', error);
    res.status(500).json({ error: 'Failed to update data' });
  }
});

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Fallback for SPA routing (GitHub Pages compatibility)
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error('Server error:', err);
  res.status(500).json({ error: 'Internal server error' });
});

// Start server
async function start() {
  await initDataFile();
  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on port ${PORT}`);
    console.log(`API endpoints: http://localhost:${PORT}/api`);
  });
}

start().catch(console.error);
const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);

// Render-specific CORS configuration
const allowedOrigins = [
  'http://localhost:3000',
  'https://localhost:3000',
  process.env.RENDER_EXTERNAL_URL,
  process.env.FRONTEND_URL
].filter(Boolean);

const io = socketIo(server, {
  cors: {
    origin: function(origin, callback) {
      // Allow requests with no origin (mobile apps, Postman, etc.)
      if (!origin) return callback(null, true);
      
      // Check if origin is in allowed list or matches Render patterns
      if (allowedOrigins.includes(origin) || 
          origin.includes('onrender.com') ||
          origin.includes('render.com')) {
        return callback(null, true);
      }
      
      // For development
      if (process.env.NODE_ENV !== 'production') {
        return callback(null, true);
      }
      
      callback(new Error('Not allowed by CORS'));
    },
    methods: ["GET", "POST"],
    credentials: true
  },
  // Render-optimized settings
  pingTimeout: 30000,  // Reduced for better connection handling
  pingInterval: 15000, // More frequent pings for stability
  upgradeTimeout: 10000,
  maxHttpBufferSize: 1e6,
  compression: true,
  transports: ['polling', 'websocket'], // Allow both for better compatibility
  allowEIO3: true, // Backward compatibility
  cookie: {
    name: "tetris-session",
    httpOnly: true,
    sameSite: process.env.NODE_ENV === 'production' ? "none" : "strict",
    secure: process.env.NODE_ENV === 'production'
  }
});

// Trust proxy for Render
app.set('trust proxy', 1);

// Security headers for production
app.use((req, res, next) => {
  if (process.env.NODE_ENV === 'production') {
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    res.setHeader('X-XSS-Protection', '1; mode=block');
  }
  next();
});

// Serve static files with production-optimized caching
app.use(express.static(path.join(__dirname, 'public'), {
  maxAge: process.env.NODE_ENV === 'production' ? '7d' : '1d',
  etag: true,
  lastModified: true,
  setHeaders: (res, filePath) => {
    // Cache CSS and JS files longer
    if (filePath.endsWith('.css') || filePath.endsWith('.js')) {
      res.setHeader('Cache-Control', 'public, max-age=31536000'); // 1 year
    }
  }
}));

// Fallback to serve index.html for SPA routing
app.get('*', (req, res, next) => {
  // Skip API routes
  if (req.path.startsWith('/health') || req.path.startsWith('/metrics')) {
    return next();
  }
  
  // Serve index.html for all other routes
  res.sendFile(path.join(__dirname, 'public', 'index.html'), (err) => {
    if (err) {
      res.status(404).send('Page not found');
    }
  });
});

// Enhanced performance monitoring for production
class PerformanceMonitor {
  constructor() {
    this.metrics = {
      activeConnections: 0,
      totalRooms: 0,
      messagesPerSecond: 0,
      averageResponseTime: 0,
      memoryUsage: 0,
      cpuUsage: 0,
      uptime: 0
    };
    this.messageCount = 0;
    this.responseTimeSamples = [];
    this.maxSamples = 100;
    
    // Monitor every 30 seconds in production, 10 seconds in development
    const interval = process.env.NODE_ENV === 'production' ? 30000 : 10000;
    setInterval(() => this.updateMetrics(), interval);
  }
  
  recordMessage() {
    this.messageCount++;
  }
  
  recordResponseTime(time) {
    this.responseTimeSamples.push(time);
    if (this.responseTimeSamples.length > this.maxSamples) {
      this.responseTimeSamples.shift();
    }
  }
  
  updateMetrics() {
    const timeWindow = process.env.NODE_ENV === 'production' ? 30 : 10;
    this.metrics.messagesPerSecond = this.messageCount / timeWindow;
    this.messageCount = 0;
    
    if (this.responseTimeSamples.length > 0) {
      this.metrics.averageResponseTime = 
        this.responseTimeSamples.reduce((a, b) => a + b, 0) / this.responseTimeSamples.length;
    }
    
    const memUsage = process.memoryUsage();
    this.metrics.memoryUsage = memUsage.heapUsed / 1024 / 1024; // MB
    this.metrics.totalRooms = rooms.size;
    this.metrics.uptime = process.uptime();
    
    // Log only in development or when there are issues
    if (process.env.NODE_ENV !== 'production' || this.metrics.memoryUsage > 400) {
      console.log(`📊 Performance Metrics:`, {
        ...this.metrics,
        memoryUsage: `${Math.round(this.metrics.memoryUsage)}MB`,
        uptime: `${Math.round(this.metrics.uptime / 60)}min`
      });
    }
  }
  
  getMetrics() {
    return { 
      ...this.metrics,
      timestamp: new Date().toISOString(),
      nodeVersion: process.version,
      platform: process.platform,
      environment: process.env.NODE_ENV || 'development'
    };
  }
}

const monitor = new PerformanceMonitor();

// Production-optimized rate limiting
class RateLimiter {
  constructor() {
    this.limits = new Map();
    this.actionLimits = {
      'game-action': { maxRequests: 30, windowMs: 1000 },   // More lenient for production
      'join-room': { maxRequests: 10, windowMs: 60000 },   // Allow more room joins
      'create-room': { maxRequests: 5, windowMs: 60000 },
      'chat-message': { maxRequests: 15, windowMs: 10000 }
    };
  }
  
  isAllowed(socketId, action) {
    // Be more lenient in development
    if (process.env.NODE_ENV !== 'production') {
      return true;
    }
    
    const limit = this.actionLimits[action];
    if (!limit) return true;
    
    const key = `${socketId}:${action}`;
    const now = Date.now();
    
    if (!this.limits.has(key)) {
      this.limits.set(key, { count: 1, resetTime: now + limit.windowMs });
      return true;
    }
    
    const userLimit = this.limits.get(key);
    
    if (now > userLimit.resetTime) {
      userLimit.count = 1;
      userLimit.resetTime = now + limit.windowMs;
      return true;
    }
    
    if (userLimit.count < limit.maxRequests) {
      userLimit.count++;
      return true;
    }
    
    return false;
  }
  
  cleanup() {
    const now = Date.now();
    for (const [key, data] of this.limits.entries()) {
      if (now > data.resetTime + 60000) {
        this.limits.delete(key);
      }
    }
  }
}

const rateLimiter = new RateLimiter();

// Cleanup rate limiter every 5 minutes
setInterval(() => rateLimiter.cleanup(), 300000);

// Game state with Render optimizations
const rooms = new Map();
const players = new Map();

// Optimized piece pool
class PiecePool {
  constructor() {
    this.pool = [];
    this.poolSize = 50; // Reduced for better memory usage on Render
    this.initializePool();
  }
  
  initializePool() {
    for (let i = 0; i < this.poolSize; i++) {
      this.pool.push(this.createFreshPiece());
    }
  }
  
  createFreshPiece() {
    const pieces = Object.keys(TETROMINOS);
    const randomPiece = pieces[Math.floor(Math.random() * pieces.length)];
    return JSON.parse(JSON.stringify(TETROMINOS[randomPiece]));
  }
  
  getPiece() {
    if (this.pool.length > 0) {
      return this.pool.pop();
    }
    return this.createFreshPiece();
  }
  
  returnPiece(piece) {
    if (this.pool.length < this.poolSize) {
      this.pool.push(this.createFreshPiece());
    }
  }
}

const piecePool = new PiecePool();

class OptimizedGameRoom {
  constructor(roomId) {
    this.id = roomId;
    this.players = [];
    this.gameState = {
      player1: this.createInitialPlayerState(),
      player2: this.createInitialPlayerState(),
      gameStarted: false,
      winner: null,
      lastUpdate: Date.now()
    };
    this.lastBroadcast = 0;
    this.broadcastThrottle = 33; // ~30 FPS for production stability
    this.stateChanged = false;
    this.scheduledBroadcast = null;
    this.createdAt = Date.now();
  }

  createInitialPlayerState() {
    return {
      grid: Array(20).fill().map(() => Array(10).fill(0)),
      currentPiece: null,
      nextPiece: null,
      currentX: 4,
      currentY: 0,
      score: 0,
      lines: 0,
      level: 1,
      alive: true,
      ready: false,
      lastActionTime: 0
    };
  }

  addPlayer(socketId, playerName) {
    if (this.players.length >= 2) return false;
    
    const playerNumber = this.players.length + 1;
    this.players.push({
      socketId,
      playerName: playerName || `Player ${playerNumber}`,
      playerNumber,
      joinTime: Date.now()
    });
    
    return playerNumber;
  }

  removePlayer(socketId) {
    this.players = this.players.filter(p => p.socketId !== socketId);
    if (this.players.length === 0) {
      if (this.scheduledBroadcast) {
        clearTimeout(this.scheduledBroadcast);
        this.scheduledBroadcast = null;
      }
      return true;
    }
    return false;
  }

  getPlayer(socketId) {
    return this.players.find(p => p.socketId === socketId);
  }

  isFull() {
    return this.players.length >= 2;
  }

  bothPlayersReady() {
    return this.players.length === 2 && 
           this.gameState.player1.ready && 
           this.gameState.player2.ready;
  }

  markStateChanged() {
    this.stateChanged = true;
    this.gameState.lastUpdate = Date.now();
    this.scheduleBroadcast();
  }

  scheduleBroadcast() {
    if (this.scheduledBroadcast) return;
    
    const now = Date.now();
    const timeSinceLastBroadcast = now - this.lastBroadcast;
    
    if (timeSinceLastBroadcast >= this.broadcastThrottle) {
      this.broadcast();
    } else {
      const delay = this.broadcastThrottle - timeSinceLastBroadcast;
      this.scheduledBroadcast = setTimeout(() => {
        this.broadcast();
      }, delay);
    }
  }

  broadcast() {
    if (this.stateChanged && this.players.length > 0) {
      io.to(this.id).emit('game-update', this.gameState);
      this.lastBroadcast = Date.now();
      this.stateChanged = false;
    }
    this.scheduledBroadcast = null;
  }

  resetGame() {
    // Clean up pieces
    ['player1', 'player2'].forEach(playerKey => {
      const player = this.gameState[playerKey];
      if (player.currentPiece) {
        piecePool.returnPiece(player.currentPiece);
      }
      if (player.nextPiece) {
        piecePool.returnPiece(player.nextPiece);
      }
    });

    this.gameState = {
      player1: this.createInitialPlayerState(),
      player2: this.createInitialPlayerState(),
      gameStarted: false,
      winner: null,
      lastUpdate: Date.now()
    };
    this.stateChanged = true;
  }

  isValidAction(playerNumber, action, currentTime) {
    const playerState = this.gameState[`player${playerNumber}`];
    if (!playerState || !playerState.alive) return false;
    
    const timeSinceLastAction = currentTime - playerState.lastActionTime;
    const minActionInterval = action.type === 'hard-drop' ? 50 : 16;
    
    return timeSinceLastAction >= minActionInterval;
  }

  // Check if room is stale and should be cleaned up
  isStale() {
    const maxAge = 4 * 60 * 60 * 1000; // 4 hours
    return (Date.now() - this.createdAt) > maxAge && this.players.length === 0;
  }
}

// Tetris pieces
const TETROMINOS = {
  I: { shape: [[0,0,0,0],[1,1,1,1],[0,0,0,0],[0,0,0,0]], color: 'block-i' },
  O: { shape: [[1,1],[1,1]], color: 'block-o' },
  T: { shape: [[0,1,0],[1,1,1],[0,0,0]], color: 'block-t' },
  S: { shape: [[0,1,1],[1,1,0],[0,0,0]], color: 'block-s' },
  Z: { shape: [[1,1,0],[0,1,1],[0,0,0]], color: 'block-z' },
  J: { shape: [[1,0,0],[1,1,1],[0,0,0]], color: 'block-j' },
  L: { shape: [[0,0,1],[1,1,1],[0,0,0]], color: 'block-l' }
};

// Game logic with limited caching for memory efficiency
const gameLogicCache = new Map();
const maxCacheSize = 500; // Reduced cache size for Render

function createRandomPiece() {
  return piecePool.getPiece();
}

function canMove(grid, piece, newX, newY) {
  // Skip caching in production to save memory
  if (process.env.NODE_ENV === 'production') {
    return checkCollision(grid, piece, newX, newY);
  }
  
  const cacheKey = `${JSON.stringify(grid)}-${JSON.stringify(piece.shape)}-${newX}-${newY}`;
  
  if (gameLogicCache.has(cacheKey)) {
    return gameLogicCache.get(cacheKey);
  }
  
  const result = checkCollision(grid, piece, newX, newY);
  
  if (gameLogicCache.size < maxCacheSize) {
    gameLogicCache.set(cacheKey, result);
  }
  
  return result;
}

function checkCollision(grid, piece, newX, newY) {
  for (let y = 0; y < piece.shape.length; y++) {
    for (let x = 0; x < piece.shape[y].length; x++) {
      if (piece.shape[y][x]) {
        const gridX = newX + x;
        const gridY = newY + y;
        
        if (gridX < 0 || gridX >= 10 || gridY >= 20) {
          return false;
        }
        if (gridY >= 0 && grid[gridY][gridX] !== 0) {
          return false;
        }
      }
    }
  }
  return true;
}

function placePiece(grid, piece, x, y) {
  const newGrid = grid.map(row => row.slice());
  
  for (let py = 0; py < piece.shape.length; py++) {
    for (let px = 0; px < piece.shape[py].length; px++) {
      if (piece.shape[py][px]) {
        const gridY = y + py;
        const gridX = x + px;
        if (gridY >= 0 && gridY < 20 && gridX >= 0 && gridX < 10) {
          newGrid[gridY][gridX] = piece.color;
        }
      }
    }
  }
  return newGrid;
}

function clearLines(grid) {
  let linesCleared = 0;
  const newGrid = [];
  
  for (let row = 0; row < 20; row++) {
    if (!grid[row].every(cell => cell !== 0)) {
      newGrid.push(grid[row].slice());
    } else {
      linesCleared++;
    }
  }
  
  while (newGrid.length < 20) {
    newGrid.unshift(Array(10).fill(0));
  }
  
  return { grid: newGrid, linesCleared };
}

function rotateMatrix(matrix) {
  const rows = matrix.length;
  const cols = matrix[0].length;
  const rotated = [];
  
  for (let i = 0; i < cols; i++) {
    rotated[i] = [];
    for (let j = 0; j < rows; j++) {
      rotated[i][j] = matrix[rows - 1 - j][i];
    }
  }
  
  return rotated;
}

// Periodic cleanup for production stability
setInterval(() => {
  // Clean up stale rooms
  let staleFooms = 0;
  for (const [roomId, room] of rooms.entries()) {
    if (room.isStale()) {
      rooms.delete(roomId);
      staleRooms++;
    }
  }
  
  // Clean up cache
  if (gameLogicCache.size > maxCacheSize) {
    gameLogicCache.clear();
  }
  
  if (staleRooms > 0) {
    console.log(`🧹 Cleaned up ${staleRooms} stale rooms`);
  }
}, 300000); // Every 5 minutes

// Socket connections with enhanced error handling
io.on('connection', (socket) => {
  const startTime = Date.now();
  monitor.metrics.activeConnections++;
  
  if (process.env.NODE_ENV !== 'production') {
    console.log(`🔌 Player connected: ${socket.id} (Total: ${monitor.metrics.activeConnections})`);
  }

  // Enhanced error handling
  socket.on('error', (error) => {
    console.error('Socket error:', error);
  });

  socket.on('join-room', ({ roomId, playerName }) => {
    const actionStartTime = Date.now();
    
    if (!rateLimiter.isAllowed(socket.id, 'join-room')) {
      socket.emit('error', 'คุณพยายามเข้าร่วมห้องบ่อยเกินไป กรุณารอสักครู่');
      return;
    }
    
    monitor.recordMessage();
    
    try {
      // Clean up previous room
      if (players.has(socket.id)) {
        const oldRoomId = players.get(socket.id).roomId;
        socket.leave(oldRoomId);
        if (rooms.has(oldRoomId)) {
          const shouldDelete = rooms.get(oldRoomId).removePlayer(socket.id);
          if (shouldDelete) {
            rooms.delete(oldRoomId);
          } else {
            io.to(oldRoomId).emit('player-left');
          }
        }
      }

      // Validate room ID
      if (!roomId || roomId.length > 50) {
        socket.emit('error', 'รหัสห้องไม่ถูกต้อง');
        return;
      }

      // Create or join room
      if (!rooms.has(roomId)) {
        rooms.set(roomId, new OptimizedGameRoom(roomId));
      }

      const room = rooms.get(roomId);
      
      if (room.isFull()) {
        socket.emit('room-full');
        return;
      }

      const playerNumber = room.addPlayer(socket.id, playerName);
      socket.join(roomId);
      
      socket.roomId = roomId;
      players.set(socket.id, { roomId, playerNumber });
      
      socket.emit('joined-room', { 
        roomId, 
        playerNumber,
        playerName: playerName || `Player ${playerNumber}`,
        roomPlayers: room.players 
      });
      
      socket.to(roomId).emit('player-joined', { 
        playerName: playerName || `Player ${playerNumber}`, 
        playerNumber,
        roomPlayers: room.players 
      });

      if (process.env.NODE_ENV !== 'production') {
        console.log(`✅ Player ${playerName || 'Unknown'} joined room ${roomId} as Player ${playerNumber}`);
      }
      
      monitor.recordResponseTime(Date.now() - actionStartTime);
      
    } catch (error) {
      console.error('❌ Error joining room:', error);
      socket.emit('error', 'เกิดข้อผิดพลาดในการเข้าร่วมห้อง');
    }
  });

  // ... (rest of the socket event handlers remain the same but with better error handling)
  
  socket.on('player-ready', () => {
    const actionStartTime = Date.now();
    monitor.recordMessage();
    
    try {
      const playerInfo = players.get(socket.id);
      if (!playerInfo) return;

      const room = rooms.get(playerInfo.roomId);
      if (!room) return;

      const playerKey = `player${playerInfo.playerNumber}`;
      room.gameState[playerKey].ready = true;
      
      room.gameState[playerKey].currentPiece = createRandomPiece();
      room.gameState[playerKey].nextPiece = createRandomPiece();
      room.gameState[playerKey].currentX = 4;
      room.gameState[playerKey].currentY = 0;

      io.to(playerInfo.roomId).emit('player-ready', { 
        playerNumber: playerInfo.playerNumber 
      });

      if (room.bothPlayersReady()) {
        room.gameState.gameStarted = true;
        io.to(playerInfo.roomId).emit('game-start', room.gameState);
        
        if (process.env.NODE_ENV !== 'production') {
          console.log(`🎮 Game started in room ${playerInfo.roomId}`);
        }
      }
      
      monitor.recordResponseTime(Date.now() - actionStartTime);
    } catch (error) {
      console.error('Error in player-ready:', error);
    }
  });

  // ... (continue with other socket handlers with similar error handling patterns)

  socket.on('disconnect', () => {
    monitor.metrics.activeConnections--;
    
    if (process.env.NODE_ENV !== 'production') {
      console.log(`🔌 Player disconnected: ${socket.id} (Total: ${monitor.metrics.activeConnections})`);
    }
    
    try {
      if (players.has(socket.id)) {
        const playerInfo = players.get(socket.id);
        const room = rooms.get(playerInfo.roomId);
        
        if (room) {
          const shouldDelete = room.removePlayer(socket.id);
          if (shouldDelete) {
            rooms.delete(playerInfo.roomId);
          } else {
            io.to(playerInfo.roomId).emit('player-disconnected', {
              playerNumber: playerInfo.playerNumber
            });
          }
        }
        
        players.delete(socket.id);
      }
    } catch (error) {
      console.error('Error handling disconnect:', error);
    }
    
    socket.roomId = null;
  });

  monitor.recordResponseTime(Date.now() - startTime);
});

// Health check endpoint for Render
app.get('/health', (req, res) => {
  const health = {
    status: 'healthy',
    uptime: process.uptime(),
    connections: monitor.metrics.activeConnections,
    rooms: rooms.size,
    memory: `${Math.round(monitor.metrics.memoryUsage)}MB`,
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV || 'development'
  };
  
  // Return unhealthy if memory usage is too high
  if (monitor.metrics.memoryUsage > 450) { // MB
    health.status = 'unhealthy';
    health.reason = 'High memory usage';
  }
  
  res.status(health.status === 'healthy' ? 200 : 503).json(health);
});

// Metrics endpoint
app.get('/metrics', (req, res) => {
  res.json(monitor.getMetrics());
});

// Root endpoint
app.get('/', (req, res) => {
  res.json({
    message: 'TwoBob Tactics Server is running!',
    version: '2.0.0',
    environment: process.env.NODE_ENV || 'development'
  });
});

// Graceful shutdown for Render
const gracefulShutdown = (signal) => {
  console.log(`🔄 ${signal} received, shutting down gracefully...`);
  
  // Stop accepting new connections
  server.close(() => {
    console.log('✅ HTTP server closed');
    
    // Close all socket connections
    io.close(() => {
      console.log('✅ All socket connections closed');
      process.exit(0);
    });
  });
  
  // Force close after 30 seconds
  setTimeout(() => {
    console.log('❌ Forcing shutdown after timeout');
    process.exit(1);
  }, 30000);
};

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

// Handle uncaught exceptions
process.on('uncaughtException', (error) => {
  console.error('Uncaught Exception:', error);
  gracefulShutdown('UNCAUGHT_EXCEPTION');
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
});

// Memory management for Render's limited resources
if (process.env.NODE_ENV === 'production') {
  setInterval(() => {
    if (global.gc) {
      global.gc();
    }
  }, 600000); // Every 10 minutes in production
}

const PORT = process.env.PORT || 3000;
server.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 TwoBob Tactics Server running on port ${PORT}`);
  console.log(`🌐 Environment: ${process.env.NODE_ENV || 'development'}`);
  
  if (process.env.RENDER_EXTERNAL_URL) {
    console.log(`🔗 External URL: ${process.env.RENDER_EXTERNAL_URL}`);
  }
  
  console.log(`💡 Health Check: /health`);
  console.log(`📊 Metrics: /metrics`);
  console.log(`⚡ Production optimizations enabled`);
});

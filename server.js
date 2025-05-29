const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  },
  // Socket.IO optimizations
  pingTimeout: 60000,
  pingInterval: 25000,
  upgradeTimeout: 10000,
  maxHttpBufferSize: 1e6,
  // Compression for better performance
  compression: true,
  // Cookie settings for session persistence
  cookie: {
    name: "tetris-session",
    httpOnly: true,
    sameSite: "strict"
  }
});

// Serve static files with caching
app.use(express.static(path.join(__dirname), {
  maxAge: '1d',
  etag: true,
  lastModified: true
}));

// Global performance monitoring
class PerformanceMonitor {
  constructor() {
    this.metrics = {
      activeConnections: 0,
      totalRooms: 0,
      messagesPerSecond: 0,
      averageResponseTime: 0,
      memoryUsage: 0
    };
    this.messageCount = 0;
    this.responseTimeSamples = [];
    this.maxSamples = 100;
    
    // Monitor every 30 seconds
    setInterval(() => this.updateMetrics(), 30000);
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
    this.metrics.messagesPerSecond = this.messageCount / 30;
    this.messageCount = 0;
    
    if (this.responseTimeSamples.length > 0) {
      this.metrics.averageResponseTime = 
        this.responseTimeSamples.reduce((a, b) => a + b, 0) / this.responseTimeSamples.length;
    }
    
    this.metrics.memoryUsage = process.memoryUsage().heapUsed / 1024 / 1024; // MB
    this.metrics.totalRooms = rooms.size;
    
    console.log(`📊 Performance Metrics:`, {
      ...this.metrics,
      memoryUsage: `${Math.round(this.metrics.memoryUsage)}MB`
    });
  }
  
  getMetrics() {
    return { ...this.metrics };
  }
}

const monitor = new PerformanceMonitor();

// Rate limiting for different actions
class RateLimiter {
  constructor() {
    this.limits = new Map();
    this.actionLimits = {
      'game-action': { maxRequests: 20, windowMs: 1000 }, // 20 actions per second
      'join-room': { maxRequests: 5, windowMs: 60000 },   // 5 joins per minute
      'create-room': { maxRequests: 3, windowMs: 60000 }, // 3 creates per minute
      'chat-message': { maxRequests: 10, windowMs: 10000 } // 10 messages per 10 seconds
    };
  }
  
  isAllowed(socketId, action) {
    const limit = this.actionLimits[action];
    if (!limit) return true;
    
    const key = `${socketId}:${action}`;
    const now = Date.now();
    
    if (!this.limits.has(key)) {
      this.limits.set(key, { count: 1, resetTime: now + limit.windowMs });
      return true;
    }
    
    const userLimit = this.limits.get(key);
    
    // Reset if window expired
    if (now > userLimit.resetTime) {
      userLimit.count = 1;
      userLimit.resetTime = now + limit.windowMs;
      return true;
    }
    
    // Check if under limit
    if (userLimit.count < limit.maxRequests) {
      userLimit.count++;
      return true;
    }
    
    return false;
  }
  
  // Cleanup old entries periodically
  cleanup() {
    const now = Date.now();
    for (const [key, data] of this.limits.entries()) {
      if (now > data.resetTime + 60000) { // Extra 1 minute buffer
        this.limits.delete(key);
      }
    }
  }
}

const rateLimiter = new RateLimiter();

// Cleanup rate limiter every 5 minutes
setInterval(() => rateLimiter.cleanup(), 300000);

// Game state with optimizations
const rooms = new Map();
const players = new Map();

// Object pool for game pieces to reduce garbage collection
class PiecePool {
  constructor() {
    this.pool = [];
    this.poolSize = 100;
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
    // Pool exhausted, create new piece
    return this.createFreshPiece();
  }
  
  returnPiece(piece) {
    if (this.pool.length < this.poolSize) {
      // Reset piece state before returning to pool
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
    this.broadcastThrottle = 16; // ~60 FPS limit
    this.stateChanged = false;
    this.scheduledBroadcast = null;
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
      playerName,
      playerNumber,
      joinTime: Date.now()
    });
    
    return playerNumber;
  }

  removePlayer(socketId) {
    this.players = this.players.filter(p => p.socketId !== socketId);
    if (this.players.length === 0) {
      // Cleanup any scheduled broadcasts
      if (this.scheduledBroadcast) {
        clearTimeout(this.scheduledBroadcast);
        this.scheduledBroadcast = null;
      }
      return true; // Room should be deleted
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

  // Optimized state change detection
  markStateChanged() {
    this.stateChanged = true;
    this.gameState.lastUpdate = Date.now();
    this.scheduleBroadcast();
  }

  // Throttled broadcasting to prevent spam
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
    if (this.stateChanged) {
      io.to(this.id).emit('game-update', this.gameState);
      this.lastBroadcast = Date.now();
      this.stateChanged = false;
    }
    this.scheduledBroadcast = null;
  }

  // Reset game with memory cleanup
  resetGame() {
    // Return pieces to pool
    if (this.gameState.player1.currentPiece) {
      piecePool.returnPiece(this.gameState.player1.currentPiece);
    }
    if (this.gameState.player1.nextPiece) {
      piecePool.returnPiece(this.gameState.player1.nextPiece);
    }
    if (this.gameState.player2.currentPiece) {
      piecePool.returnPiece(this.gameState.player2.currentPiece);
    }
    if (this.gameState.player2.nextPiece) {
      piecePool.returnPiece(this.gameState.player2.nextPiece);
    }

    this.gameState = {
      player1: this.createInitialPlayerState(),
      player2: this.createInitialPlayerState(),
      gameStarted: false,
      winner: null,
      lastUpdate: Date.now()
    };
    this.stateChanged = true;
  }

  // Validate player action to prevent cheating
  isValidAction(playerNumber, action, currentTime) {
    const playerState = this.gameState[`player${playerNumber}`];
    if (!playerState || !playerState.alive) return false;
    
    // Prevent action spam
    const timeSinceLastAction = currentTime - playerState.lastActionTime;
    const minActionInterval = action.type === 'hard-drop' ? 100 : 16; // Minimum ms between actions
    
    if (timeSinceLastAction < minActionInterval) {
      return false;
    }
    
    return true;
  }
}

// Tetris pieces (unchanged but with better memory management)
const TETROMINOS = {
  I: { shape: [[0,0,0,0],[1,1,1,1],[0,0,0,0],[0,0,0,0]], color: 'block-i' },
  O: { shape: [[1,1],[1,1]], color: 'block-o' },
  T: { shape: [[0,1,0],[1,1,1],[0,0,0]], color: 'block-t' },
  S: { shape: [[0,1,1],[1,1,0],[0,0,0]], color: 'block-s' },
  Z: { shape: [[1,1,0],[0,1,1],[0,0,0]], color: 'block-z' },
  J: { shape: [[1,0,0],[1,1,1],[0,0,0]], color: 'block-j' },
  L: { shape: [[0,0,1],[1,1,1],[0,0,0]], color: 'block-l' }
};

// Optimized helper functions with caching
const gameLogicCache = new Map();

function createRandomPiece() {
  return piecePool.getPiece();
}

// Cached collision detection
function canMove(grid, piece, newX, newY) {
  const cacheKey = `${JSON.stringify(grid)}-${JSON.stringify(piece.shape)}-${newX}-${newY}`;
  
  if (gameLogicCache.has(cacheKey)) {
    return gameLogicCache.get(cacheKey);
  }
  
  for (let y = 0; y < piece.shape.length; y++) {
    for (let x = 0; x < piece.shape[y].length; x++) {
      if (piece.shape[y][x]) {
        const gridX = newX + x;
        const gridY = newY + y;
        
        if (gridX < 0 || gridX >= 10 || gridY >= 20) {
          gameLogicCache.set(cacheKey, false);
          return false;
        }
        if (gridY >= 0 && grid[gridY][gridX] !== 0) {
          gameLogicCache.set(cacheKey, false);
          return false;
        }
      }
    }
  }
  
  gameLogicCache.set(cacheKey, true);
  return true;
}

// Cleanup cache periodically to prevent memory leaks
setInterval(() => {
  if (gameLogicCache.size > 1000) {
    gameLogicCache.clear();
  }
}, 60000);

function placePiece(grid, piece, x, y) {
  // Use more efficient array copying
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
  
  // Add empty lines at top
  while (newGrid.length < 20) {
    newGrid.unshift(Array(10).fill(0));
  }
  
  return { grid: newGrid, linesCleared };
}

// Optimized matrix rotation with memoization
const rotationCache = new Map();

function rotateMatrix(matrix) {
  const matrixStr = JSON.stringify(matrix);
  
  if (rotationCache.has(matrixStr)) {
    return rotationCache.get(matrixStr);
  }
  
  const rows = matrix.length;
  const cols = matrix[0].length;
  const rotated = [];
  
  for (let i = 0; i < cols; i++) {
    rotated[i] = [];
    for (let j = 0; j < rows; j++) {
      rotated[i][j] = matrix[rows - 1 - j][i];
    }
  }
  
  // Limit cache size
  if (rotationCache.size > 100) {
    const firstKey = rotationCache.keys().next().value;
    rotationCache.delete(firstKey);
  }
  
  rotationCache.set(matrixStr, rotated);
  return rotated;
}

// Enhanced socket connections with performance monitoring
io.on('connection', (socket) => {
  const startTime = Date.now();
  monitor.metrics.activeConnections++;
  
  console.log(`🔌 Player connected: ${socket.id} (Total: ${monitor.metrics.activeConnections})`);

  socket.on('join-room', ({ roomId, playerName }) => {
    const actionStartTime = Date.now();
    
    // Rate limiting
    if (!rateLimiter.isAllowed(socket.id, 'join-room')) {
      socket.emit('error', 'คุณพยายามเข้าร่วมห้องบ่อยเกินไป กรุณารอสักครู่');
      return;
    }
    
    monitor.recordMessage();
    
    try {
      // Leave any existing room
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
        playerName,
        roomPlayers: room.players 
      });
      
      socket.to(roomId).emit('player-joined', { 
        playerName, 
        playerNumber,
        roomPlayers: room.players 
      });

      console.log(`✅ Player ${playerName} joined room ${roomId} as Player ${playerNumber}`);
      
      // Record performance
      monitor.recordResponseTime(Date.now() - actionStartTime);
      
    } catch (error) {
      console.error('❌ Error joining room:', error);
      socket.emit('error', 'เกิดข้อผิดพลาดในการเข้าร่วมห้อง');
    }
  });

  socket.on('player-ready', () => {
    const actionStartTime = Date.now();
    monitor.recordMessage();
    
    const playerInfo = players.get(socket.id);
    if (!playerInfo) return;

    const room = rooms.get(playerInfo.roomId);
    if (!room) return;

    const playerKey = `player${playerInfo.playerNumber}`;
    room.gameState[playerKey].ready = true;
    
    // Initialize pieces for ready player
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
      
      console.log(`🎮 Game started in room ${playerInfo.roomId}`);
    }
    
    monitor.recordResponseTime(Date.now() - actionStartTime);
  });

  socket.on('request-new-game', () => {
    monitor.recordMessage();
    console.log('🔄 Player requested new game');
    
    const playerInfo = players.get(socket.id);
    if (!playerInfo) {
      socket.emit('error', 'คุณไม่ได้อยู่ในห้องใดๆ');
      return;
    }

    const roomId = playerInfo.roomId;
    const room = rooms.get(roomId);
    
    if (!room) {
      socket.emit('error', 'ห้องไม่มีอยู่แล้ว');
      return;
    }

    // Reset game state
    room.resetGame();
    
    // Broadcast reset to all players in room
    io.to(roomId).emit('game-reset');
    
    console.log(`🔄 Game reset for room ${roomId}`);
  });

  socket.on('leave-room', () => {
    monitor.recordMessage();
    
    const playerInfo = players.get(socket.id);
    if (!playerInfo) return;

    const room = rooms.get(playerInfo.roomId);
    if (room) {
      const shouldDelete = room.removePlayer(socket.id);
      socket.leave(playerInfo.roomId);
      
      if (shouldDelete) {
        rooms.delete(playerInfo.roomId);
        console.log(`🗑️ Room ${playerInfo.roomId} deleted`);
      } else {
        io.to(playerInfo.roomId).emit('player-left');
      }
    }
    
    socket.roomId = null;
    players.delete(socket.id);
  });

  socket.on('game-action', (action) => {
    const actionStartTime = Date.now();
    
    // Rate limiting for game actions
    if (!rateLimiter.isAllowed(socket.id, 'game-action')) {
      return; // Silently ignore spam actions
    }
    
    monitor.recordMessage();
    
    const playerInfo = players.get(socket.id);
    if (!playerInfo) return;

    const room = rooms.get(playerInfo.roomId);
    if (!room || !room.gameState.gameStarted) return;

    const playerKey = `player${playerInfo.playerNumber}`;
    const playerState = room.gameState[playerKey];
    
    if (!playerState.alive) return;

    // Validate action timing
    if (!room.isValidAction(playerInfo.playerNumber, action, actionStartTime)) {
      return;
    }

    let updated = false;

    switch (action.type) {
      case 'move-left':
        if (canMove(playerState.grid, playerState.currentPiece, playerState.currentX - 1, playerState.currentY)) {
          playerState.currentX--;
          updated = true;
        }
        break;

      case 'move-right':
        if (canMove(playerState.grid, playerState.currentPiece, playerState.currentX + 1, playerState.currentY)) {
          playerState.currentX++;
          updated = true;
        }
        break;

      case 'move-down':
        if (canMove(playerState.grid, playerState.currentPiece, playerState.currentX, playerState.currentY + 1)) {
          playerState.currentY++;
          updated = true;
        } else {
          // Place piece
          playerState.grid = placePiece(playerState.grid, playerState.currentPiece, playerState.currentX, playerState.currentY);
          
          // Clear lines
          const { grid: newGrid, linesCleared } = clearLines(playerState.grid);
          playerState.grid = newGrid;
          playerState.lines += linesCleared;
          
          // Calculate score
          const lineScore = { 1: 100, 2: 300, 3: 500, 4: 800 };
          playerState.score += (lineScore[linesCleared] || 0) * playerState.level;
          playerState.level = Math.floor(playerState.lines / 10) + 1;
          
          // Check game over
          if (playerState.grid[0].some(cell => cell !== 0)) {
            playerState.alive = false;
            const otherPlayerKey = playerInfo.playerNumber === 1 ? 'player2' : 'player1';
            room.gameState.winner = room.gameState[otherPlayerKey].alive ? 
              (playerInfo.playerNumber === 1 ? 2 : 1) : 'draw';
            
            io.to(playerInfo.roomId).emit('game-over', {
              winner: room.gameState.winner,
              finalScores: {
                player1: room.gameState.player1.score,
                player2: room.gameState.player2.score
              }
            });
            
            console.log(`🏁 Game over in room ${playerInfo.roomId}, winner: ${room.gameState.winner}`);
            return;
          }
          
          // Return old pieces to pool and get new ones
          if (playerState.currentPiece) {
            piecePool.returnPiece(playerState.currentPiece);
          }
          
          playerState.currentPiece = playerState.nextPiece;
          playerState.nextPiece = createRandomPiece();
          playerState.currentX = 4;
          playerState.currentY = 0;
          
          updated = true;
        }
        break;

      case 'rotate':
        const rotated = {
          shape: rotateMatrix(playerState.currentPiece.shape),
          color: playerState.currentPiece.color
        };
        if (canMove(playerState.grid, rotated, playerState.currentX, playerState.currentY)) {
          playerState.currentPiece.shape = rotated.shape;
          updated = true;
        }
        break;

      case 'hard-drop':
        let dropDistance = 0;
        while (canMove(playerState.grid, playerState.currentPiece, playerState.currentX, playerState.currentY + 1)) {
          playerState.currentY++;
          dropDistance++;
        }
        if (dropDistance > 0) {
          playerState.score += dropDistance * 2;
          updated = true;
        }
        break;
    }

    if (updated) {
      playerState.lastActionTime = actionStartTime;
      room.markStateChanged();
    }
    
    monitor.recordResponseTime(Date.now() - actionStartTime);
  });

  socket.on('disconnect', () => {
    monitor.metrics.activeConnections--;
    console.log(`🔌 Player disconnected: ${socket.id} (Total: ${monitor.metrics.activeConnections})`);
    
    if (players.has(socket.id)) {
      const playerInfo = players.get(socket.id);
      const room = rooms.get(playerInfo.roomId);
      
      if (room) {
        const shouldDelete = room.removePlayer(socket.id);
        if (shouldDelete) {
          rooms.delete(playerInfo.roomId);
          console.log(`🗑️ Room ${playerInfo.roomId} deleted due to disconnect`);
        } else {
          io.to(playerInfo.roomId).emit('player-disconnected', {
            playerNumber: playerInfo.playerNumber
          });
        }
      }
      
      players.delete(socket.id);
    }
    
    socket.roomId = null;
  });

  // Record connection time
  monitor.recordResponseTime(Date.now() - startTime);
});

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({
    status: 'healthy',
    uptime: process.uptime(),
    connections: monitor.metrics.activeConnections,
    rooms: monitor.metrics.totalRooms,
    memory: `${Math.round(monitor.metrics.memoryUsage)}MB`,
    timestamp: new Date().toISOString()
  });
});

// Performance metrics endpoint
app.get('/metrics', (req, res) => {
  res.json(monitor.getMetrics());
});

// Graceful shutdown handling
process.on('SIGTERM', () => {
  console.log('🔄 SIGTERM received, shutting down gracefully...');
  
  // Close all socket connections
  io.close(() => {
    console.log('✅ All socket connections closed');
    
    // Close HTTP server
    server.close(() => {
      console.log('✅ HTTP server closed');
      process.exit(0);
    });
  });
});

process.on('SIGINT', () => {
  console.log('🔄 SIGINT received, shutting down gracefully...');
  process.emit('SIGTERM');
});

// Memory leak prevention
setInterval(() => {
  if (global.gc) {
    global.gc();
  }
}, 300000); // Every 5 minutes

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`🚀 Optimized TwoBob Tactics Server running on port ${PORT}`);
  console.log(`📱 Game URL: http://localhost:${PORT}`);
  console.log(`💡 Health Check: http://localhost:${PORT}/health`);
  console.log(`📊 Metrics: http://localhost:${PORT}/metrics`);
  console.log(`⚡ Performance optimizations enabled`);
});

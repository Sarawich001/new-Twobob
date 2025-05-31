const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);

// Socket.IO configuration for production
const io = socketIo(server, {
  cors: {
    origin: process.env.NODE_ENV === 'production' 
      ? ["https://your-app-name.onrender.com"] // Replace with your actual Render URL
      : ["http://localhost:3000"],
    methods: ["GET", "POST"],
    credentials: true
  },
  transports: ['websocket', 'polling'],
  allowEIO3: true
});

// Security and performance middleware
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Trust proxy for Render
app.set('trust proxy', 1);

// CORS headers for production
app.use((req, res, next) => {
  const allowedOrigins = process.env.NODE_ENV === 'production' 
    ? ['https://your-app-name.onrender.com'] // Replace with your actual Render URL
    : ['http://localhost:3000'];
  
  const origin = req.headers.origin;
  if (allowedOrigins.includes(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
  }
  
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.setHeader('Access-Control-Allow-Credentials', true);
  next();
});

// Serve static files
app.use(express.static(path.join(__dirname, 'public'), {
  maxAge: process.env.NODE_ENV === 'production' ? '24h' : '0'
}));

// Game rooms storage with cleanup
const gameRooms = {};
const ROOM_CLEANUP_INTERVAL = 30 * 60 * 1000; // 30 minutes
const MAX_ROOMS = 1000; // Limit concurrent rooms

// Tetris piece definitions
const PIECES = {
  I: {
    shape: [
      [1, 1, 1, 1]
    ],
    color: 'block-i'
  },
  O: {
    shape: [
      [1, 1],
      [1, 1]
    ],
    color: 'block-o'
  },
  T: {
    shape: [
      [0, 1, 0],
      [1, 1, 1]
    ],
    color: 'block-t'
  },
  S: {
    shape: [
      [0, 1, 1],
      [1, 1, 0]
    ],
    color: 'block-s'
  },
  Z: {
    shape: [
      [1, 1, 0],
      [0, 1, 1]
    ],
    color: 'block-z'
  },
  J: {
    shape: [
      [1, 0, 0],
      [1, 1, 1]
    ],
    color: 'block-j'
  },
  L: {
    shape: [
      [0, 0, 1],
      [1, 1, 1]
    ],
    color: 'block-l'
  }
};

const PIECE_TYPES = Object.keys(PIECES);

class TetrisGame {
  constructor(roomId) {
    this.roomId = roomId;
    this.players = {};
    this.gameStarted = false;
    this.lastActivity = Date.now();
    this.gameState = {
      gameStarted: false,
      player1: null,
      player2: null
    };
  }

  updateActivity() {
    this.lastActivity = Date.now();
  }

  addPlayer(socket, playerName) {
    this.updateActivity();
    const playerNumber = Object.keys(this.players).length + 1;
    
    if (playerNumber > 2) {
      return false; // Room is full
    }

    this.players[socket.id] = {
      socket: socket,
      playerNumber: playerNumber,
      playerName: playerName,
      ready: false
    };

    // Initialize player game state
    this.gameState[`player${playerNumber}`] = this.createPlayerState();

    return playerNumber;
  }

  removePlayer(socketId) {
    this.updateActivity();
    delete this.players[socketId];
    
    // Reset game if it was started
    if (this.gameStarted) {
      this.gameStarted = false;
      this.gameState.gameStarted = false;
      // Notify remaining players
      this.broadcastToRoom('game-reset');
    }
  }

  createPlayerState() {
    return {
      grid: Array(20).fill().map(() => Array(10).fill(0)),
      currentPiece: null,
      currentX: 0,
      currentY: 0,
      score: 0,
      lines: 0,
      level: 1,
      alive: true,
      nextPiece: this.generateRandomPiece()
    };
  }

  generateRandomPiece() {
    const pieceType = PIECE_TYPES[Math.floor(Math.random() * PIECE_TYPES.length)];
    return {
      type: pieceType,
      shape: PIECES[pieceType].shape,
      color: PIECES[pieceType].color
    };
  }

  setPlayerReady(socketId) {
    this.updateActivity();
    if (this.players[socketId]) {
      this.players[socketId].ready = true;
      
      const playerNumber = this.players[socketId].playerNumber;
      this.broadcastToRoom('player-ready', { playerNumber });

      // Check if both players are ready
      const allReady = Object.values(this.players).every(player => player.ready);
      if (allReady && Object.keys(this.players).length === 2) {
        this.startGame();
      }
    }
  }

  startGame() {
    this.updateActivity();
    this.gameStarted = true;
    this.gameState.gameStarted = true;

    // Initialize both players
    for (let i = 1; i <= 2; i++) {
      const playerState = this.gameState[`player${i}`];
      playerState.currentPiece = playerState.nextPiece;
      playerState.nextPiece = this.generateRandomPiece();
      playerState.currentX = 3;
      playerState.currentY = 0;
      playerState.alive = true;
    }

    this.broadcastToRoom('game-start', this.gameState);
  }

  handlePlayerAction(socketId, action) {
    this.updateActivity();
    const player = this.players[socketId];
    if (!player || !this.gameStarted) return;

    const playerNumber = player.playerNumber;
    const playerState = this.gameState[`player${playerNumber}`];
    
    if (!playerState || !playerState.alive) return;

    switch (action.type) {
      case 'move-left':
        this.movePiece(playerState, -1, 0);
        break;
      case 'move-right':
        this.movePiece(playerState, 1, 0);
        break;
      case 'move-down':
        if (!this.movePiece(playerState, 0, 1)) {
          this.placePiece(playerState);
        }
        break;
      case 'rotate':
        this.rotatePiece(playerState);
        break;
      case 'hard-drop':
        this.hardDrop(playerState);
        break;
    }

    // Check for game over
    this.checkGameOver();
    
    // Send updated game state
    this.broadcastToRoom('game-update', this.gameState);
  }

  movePiece(playerState, deltaX, deltaY) {
    const newX = playerState.currentX + deltaX;
    const newY = playerState.currentY + deltaY;

    if (this.isValidPosition(playerState, newX, newY, playerState.currentPiece.shape)) {
      playerState.currentX = newX;
      playerState.currentY = newY;
      return true;
    }
    return false;
  }

  rotatePiece(playerState) {
    if (!playerState.currentPiece) return;

    const rotatedShape = this.rotateMatrix(playerState.currentPiece.shape);
    
    if (this.isValidPosition(playerState, playerState.currentX, playerState.currentY, rotatedShape)) {
      playerState.currentPiece.shape = rotatedShape;
    }
  }

  rotateMatrix(matrix) {
    const rows = matrix.length;
    const cols = matrix[0].length;
    const rotated = Array(cols).fill().map(() => Array(rows).fill(0));
    
    for (let i = 0; i < rows; i++) {
      for (let j = 0; j < cols; j++) {
        rotated[j][rows - 1 - i] = matrix[i][j];
      }
    }
    
    return rotated;
  }

  hardDrop(playerState) {
    while (this.movePiece(playerState, 0, 1)) {
      playerState.score += 2; // Bonus points for hard drop
    }
    this.placePiece(playerState);
  }

  isValidPosition(playerState, x, y, shape) {
    for (let row = 0; row < shape.length; row++) {
      for (let col = 0; col < shape[row].length; col++) {
        if (shape[row][col]) {
          const newX = x + col;
          const newY = y + row;
          
          // Check boundaries
          if (newX < 0 || newX >= 10 || newY >= 20) {
            return false;
          }
          
          // Check collision with existing blocks
          if (newY >= 0 && playerState.grid[newY][newX]) {
            return false;
          }
        }
      }
    }
    return true;
  }

  placePiece(playerState) {
    if (!playerState.currentPiece) return;

    // Place the piece on the grid
    for (let row = 0; row < playerState.currentPiece.shape.length; row++) {
      for (let col = 0; col < playerState.currentPiece.shape[row].length; col++) {
        if (playerState.currentPiece.shape[row][col]) {
          const gridX = playerState.currentX + col;
          const gridY = playerState.currentY + row;
          
          if (gridY >= 0) {
            playerState.grid[gridY][gridX] = playerState.currentPiece.color;
          }
        }
      }
    }

    // Clear completed lines
    const linesCleared = this.clearLines(playerState);
    if (linesCleared > 0) {
      playerState.lines += linesCleared;
      playerState.score += this.calculateScore(linesCleared, playerState.level);
      playerState.level = Math.floor(playerState.lines / 10) + 1;
    }

    // Spawn new piece
    playerState.currentPiece = playerState.nextPiece;
    playerState.nextPiece = this.generateRandomPiece();
    playerState.currentX = 3;
    playerState.currentY = 0;

    // Check if new piece can be placed (game over condition)
    if (!this.isValidPosition(playerState, playerState.currentX, playerState.currentY, playerState.currentPiece.shape)) {
      playerState.alive = false;
    }
  }

  clearLines(playerState) {
    let linesCleared = 0;
    
    for (let row = 19; row >= 0; row--) {
      if (playerState.grid[row].every(cell => cell !== 0)) {
        // Remove the completed line
        playerState.grid.splice(row, 1);
        // Add new empty line at top
        playerState.grid.unshift(Array(10).fill(0));
        linesCleared++;
        row++; // Check the same row again
      }
    }
    
    return linesCleared;
  }

  calculateScore(linesCleared, level) {
    const baseScores = [0, 40, 100, 300, 1200];
    return baseScores[linesCleared] * level;
  }

  checkGameOver() {
    const player1Alive = this.gameState.player1.alive;
    const player2Alive = this.gameState.player2.alive;

    if (!player1Alive || !player2Alive) {
      this.endGame();
    }
  }

  endGame() {
    this.updateActivity();
    this.gameStarted = false;
    this.gameState.gameStarted = false;

    const player1Score = this.gameState.player1.score;
    const player2Score = this.gameState.player2.score;
    
    let winner;
    if (player1Score > player2Score) {
      winner = 1;
    } else if (player2Score > player1Score) {
      winner = 2;
    } else {
      winner = 'draw';
    }

    const gameOverData = {
      winner: winner,
      finalScores: {
        player1: player1Score,
        player2: player2Score
      }
    };

    this.broadcastToRoom('game-over', gameOverData);
    
    // Reset ready states
    Object.values(this.players).forEach(player => {
      player.ready = false;
    });
  }

  resetForNewGame() {
    this.updateActivity();
    this.gameStarted = false;
    this.gameState.gameStarted = false;
    
    // Reset player states
    for (let i = 1; i <= 2; i++) {
      this.gameState[`player${i}`] = this.createPlayerState();
    }
    
    // Reset ready states
    Object.values(this.players).forEach(player => {
      player.ready = false;
    });
  }

  getRoomPlayers() {
    return Object.values(this.players).map(player => ({
      playerNumber: player.playerNumber,
      playerName: player.playerName,
      ready: player.ready
    }));
  }

  broadcastToRoom(event, data) {
    Object.values(this.players).forEach(player => {
      try {
        player.socket.emit(event, data);
      } catch (error) {
        console.error(`Error broadcasting to socket ${player.socket.id}:`, error);
      }
    });
  }

  broadcastToOthers(socketId, event, data) {
    Object.values(this.players).forEach(player => {
      if (player.socket.id !== socketId) {
        try {
          player.socket.emit(event, data);
        } catch (error) {
          console.error(`Error broadcasting to socket ${player.socket.id}:`, error);
        }
      }
    });
  }
}

// Room cleanup function
function cleanupInactiveRooms() {
  const now = Date.now();
  const roomsToDelete = [];
  
  for (const [roomId, room] of Object.entries(gameRooms)) {
    // Remove rooms that have been inactive for more than 30 minutes
    if (now - room.lastActivity > ROOM_CLEANUP_INTERVAL) {
      roomsToDelete.push(roomId);
    }
  }
  
  roomsToDelete.forEach(roomId => {
    console.log(`Cleaning up inactive room: ${roomId}`);
    delete gameRooms[roomId];
  });
  
  if (roomsToDelete.length > 0) {
    console.log(`Cleaned up ${roomsToDelete.length} inactive rooms`);
  }
}

// Run cleanup every 10 minutes
setInterval(cleanupInactiveRooms, 10 * 60 * 1000);

// Socket.IO connection handling with error handling
io.on('connection', (socket) => {
  console.log('New client connected:', socket.id);

  // Connection timeout handling
  socket.setTimeout(5000);

  socket.on('join-room', (data) => {
    try {
      const { roomId, playerName } = data;
      
      // Validate input
      if (!roomId || !playerName || typeof roomId !== 'string' || typeof playerName !== 'string') {
        socket.emit('error', { message: 'Invalid room ID or player name' });
        return;
      }

      // Check room limit
      if (Object.keys(gameRooms).length >= MAX_ROOMS) {
        socket.emit('error', { message: 'Server is at capacity. Please try again later.' });
        return;
      }
      
      // Create room if it doesn't exist
      if (!gameRooms[roomId]) {
        gameRooms[roomId] = new TetrisGame(roomId);
      }

      const room = gameRooms[roomId];
      
      // Check if room is full
      if (Object.keys(room.players).length >= 2) {
        socket.emit('room-full');
        return;
      }

      // Add player to room
      const playerNumber = room.addPlayer(socket, playerName);
      if (playerNumber) {
        socket.join(roomId);
        socket.roomId = roomId;
        
        socket.emit('joined-room', {
          roomId: roomId,
          playerNumber: playerNumber,
          playerName: playerName,
          roomPlayers: room.getRoomPlayers()
        });

        // Notify other players
        room.broadcastToOthers(socket.id, 'player-joined', {
          roomPlayers: room.getRoomPlayers()
        });

        console.log(`Player ${playerName} joined room ${roomId} as Player ${playerNumber}`);
      }
    } catch (error) {
      console.error('Error in join-room:', error);
      socket.emit('error', { message: 'Failed to join room' });
    }
  });

  socket.on('leave-room', () => {
    try {
      if (socket.roomId && gameRooms[socket.roomId]) {
        const room = gameRooms[socket.roomId];
        room.removePlayer(socket.id);
        
        // Notify remaining players
        room.broadcastToOthers(socket.id, 'player-left');
        
        socket.leave(socket.roomId);
        
        // Clean up empty rooms
        if (Object.keys(room.players).length === 0) {
          delete gameRooms[socket.roomId];
        }
        
        socket.roomId = null;
      }
    } catch (error) {
      console.error('Error in leave-room:', error);
    }
  });

  socket.on('player-ready', () => {
    try {
      if (socket.roomId && gameRooms[socket.roomId]) {
        const room = gameRooms[socket.roomId];
        room.setPlayerReady(socket.id);
      }
    } catch (error) {
      console.error('Error in player-ready:', error);
    }
  });

  socket.on('game-action', (action) => {
    try {
      if (socket.roomId && gameRooms[socket.roomId] && action && action.type) {
        const room = gameRooms[socket.roomId];
        room.handlePlayerAction(socket.id, action);
      }
    } catch (error) {
      console.error('Error in game-action:', error);
    }
  });

  socket.on('request-new-game', () => {
    try {
      if (socket.roomId && gameRooms[socket.roomId]) {
        const room = gameRooms[socket.roomId];
        room.resetForNewGame();
        room.broadcastToRoom('game-reset');
      }
    } catch (error) {
      console.error('Error in request-new-game:', error);
    }
  });

  socket.on('disconnect', (reason) => {
    console.log('Client disconnected:', socket.id, 'Reason:', reason);
    
    try {
      if (socket.roomId && gameRooms[socket.roomId]) {
        const room = gameRooms[socket.roomId];
        const player = room.players[socket.id];
        
        if (player) {
          // Notify other players about disconnection
          room.broadcastToOthers(socket.id, 'player-disconnected', {
            playerNumber: player.playerNumber
          });
        }
        
        room.removePlayer(socket.id);
        
        // Clean up empty rooms
        if (Object.keys(room.players).length === 0) {
          delete gameRooms[socket.roomId];
          console.log(`Room ${socket.roomId} deleted (empty)`);
        }
      }
    } catch (error) {
      console.error('Error in disconnect handler:', error);
    }
  });

  socket.on('error', (error) => {
    console.error('Socket error:', error);
  });
});

// Routes
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Health check endpoint for Render
app.get('/health', (req, res) => {
  const healthStatus = {
    status: 'OK',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    environment: process.env.NODE_ENV || 'development',
    rooms: Object.keys(gameRooms).length,
    totalPlayers: Object.values(gameRooms).reduce((total, room) => total + Object.keys(room.players).length, 0),
    memory: process.memoryUsage(),
    version: process.version
  };
  
  res.json(healthStatus);
});

// 404 handler
app.use((req, res) => {
  res.status(404).sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Error handler
app.use((err, req, res, next) => {
  console.error('Express error:', err.stack);
  res.status(500).json({ error: 'Something went wrong!' });
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('SIGTERM received, shutting down gracefully');
  server.close(() => {
    console.log('Process terminated');
  });
});

process.on('SIGINT', () => {
  console.log('SIGINT received, shutting down gracefully');
  server.close(() => {
    console.log('Process terminated');
  });
});

// Start server
const PORT = process.env.PORT || 3000;
server.listen(PORT, '0.0.0.0', () => {
  console.log(`🎮 TwoBob Tactics Tetris Server running on port ${PORT}`);
  console.log(`📁 Serving static files from 'public' directory`);
  console.log(`🌐 Environment: ${process.env.NODE_ENV || 'development'}`);
  if (process.env.NODE_ENV !== 'production') {
    console.log(`🔗 Local: http://localhost:${PORT}`);
  }
});

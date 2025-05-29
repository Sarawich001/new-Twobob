const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);


// ✅ เสิร์ฟไฟล์ static (จาก root directory)
app.use(express.static(__dirname)); // <== สำคัญ

// ✅ เสิร์ฟ index.html เมื่อเข้า root path "/"
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

// ✅ Fallback สำหรับเส้นทางอื่น (optional)
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});
// CORS configuration for production and development
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
  // Optimized settings
  pingTimeout: 30000,
  pingInterval: 15000,
  upgradeTimeout: 10000,
  maxHttpBufferSize: 1e6,
  transports: ['polling', 'websocket'],
  allowEIO3: true,
  cookie: {
    name: "tetris-session",
    httpOnly: true,
    sameSite: process.env.NODE_ENV === 'production' ? "none" : "strict",
    secure: process.env.NODE_ENV === 'production'
  }
});

// Trust proxy for production
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

// Serve static files with caching
app.use(express.static(path.join(__dirname, 'public'), {
  maxAge: process.env.NODE_ENV === 'production' ? '7d' : '1d',
  etag: true,
  lastModified: true,
  setHeaders: (res, filePath) => {
    if (filePath.endsWith('.css') || filePath.endsWith('.js')) {
      res.setHeader('Cache-Control', 'public, max-age=31536000');
    }
  }
}));

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

// Game state management
const rooms = new Map();
const players = new Map();

class GameRoom {
  constructor(roomId) {
    this.id = roomId;
    this.players = [];
    this.gameState = {
      player1: this.createInitialPlayerState(),
      player2: this.createInitialPlayerState(),
      gameStarted: false,
      gamePaused: false,
      winner: null,
      createdAt: Date.now()
    };
    this.dropInterval = 1000;
    this.gameTimer = null;
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
      lastDropTime: Date.now()
    };
  }

  addPlayer(socketId, playerName) {
    if (this.players.length >= 2) return false;
    
    const playerNumber = this.players.length + 1;
    this.players.push({
      socketId,
      playerName: playerName || `Player ${playerNumber}`,
      playerNumber,
      joinedAt: Date.now()
    });
    
    return playerNumber;
  }

  removePlayer(socketId) {
    const playerIndex = this.players.findIndex(p => p.socketId === socketId);
    if (playerIndex !== -1) {
      this.players.splice(playerIndex, 1);
      if (this.gameState.gameStarted) {
        this.stopGame();
      }
    }
    return this.players.length === 0;
  }

  startGame() {
    if (!this.bothPlayersReady()) return false;
    
    this.gameState.gameStarted = true;
    this.gameState.gamePaused = false;
    this.gameState.winner = null;
    
    ['player1', 'player2'].forEach(playerKey => {
      const state = this.gameState[playerKey];
      state.currentPiece = this.createRandomPiece();
      state.nextPiece = this.createRandomPiece();
      state.currentX = 4;
      state.currentY = 0;
      state.lastDropTime = Date.now();
      state.alive = true;
    });
    
    this.startGameLoop();
    return true;
  }

  stopGame() {
    this.gameState.gameStarted = false;
    if (this.gameTimer) {
      clearInterval(this.gameTimer);
      this.gameTimer = null;
    }
  }

  pauseGame() {
    this.gameState.gamePaused = true;
  }

  resumeGame() {
    this.gameState.gamePaused = false;
  }

  resetGame() {
    this.stopGame();
    this.gameState = {
      player1: this.createInitialPlayerState(),
      player2: this.createInitialPlayerState(),
      gameStarted: false,
      gamePaused: false,
      winner: null,
      createdAt: this.gameState.createdAt
    };
  }

  createRandomPiece() {
    const pieces = Object.keys(TETROMINOS);
    const randomPiece = pieces[Math.floor(Math.random() * pieces.length)];
    return JSON.parse(JSON.stringify(TETROMINOS[randomPiece]));
  }

  startGameLoop() {
    if (this.gameTimer) clearInterval(this.gameTimer);
    
    this.gameTimer = setInterval(() => {
      if (!this.gameState.gameStarted || this.gameState.gamePaused) return;

      let gameUpdated = false;
      const currentTime = Date.now();

      ['player1', 'player2'].forEach((playerKey) => {
        const playerState = this.gameState[playerKey];
        if (!playerState.alive) return;

        const dropTime = Math.max(100, 1000 - (playerState.level - 1) * 50);
        
        if (currentTime - playerState.lastDropTime >= dropTime) {
          if (this.movePlayerPiece(playerKey, 'move-down')) {
            gameUpdated = true;
          }
          playerState.lastDropTime = currentTime;
        }
      });

      if (gameUpdated) {
        io.to(this.id).emit('game-update', this.gameState);
      }
    }, 50);
  }

  movePlayerPiece(playerKey, action) {
    const playerState = this.gameState[playerKey];
    if (!playerState.alive) return false;

    let updated = false;

    switch (action) {
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
          playerState.score += 1;
          updated = true;
        } else {
          return this.placePieceAndContinue(playerKey);
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
        playerState.score += dropDistance * 2;
        return this.placePieceAndContinue(playerKey);
    }

    return updated;
  }

  placePieceAndContinue(playerKey) {
    const playerState = this.gameState[playerKey];
    
    playerState.grid = placePiece(
      playerState.grid,
      playerState.currentPiece,
      playerState.currentX,
      playerState.currentY
    );
    
    const { grid: newGrid, linesCleared } = clearLines(playerState.grid);
    playerState.grid = newGrid;
    playerState.lines += linesCleared;
    
    if (linesCleared > 0) {
      const lineScore = { 1: 100, 2: 300, 3: 500, 4: 800 };
      playerState.score += (lineScore[linesCleared] || 0) * playerState.level;
      
      if (linesCleared > 1) {
        this.sendAttackLines(playerKey, linesCleared - 1);
      }
    }
    
    playerState.level = Math.floor(playerState.lines / 10) + 1;
    
    if (playerState.grid[0].some(cell => cell !== 0) || playerState.grid[1].some(cell => cell !== 0)) {
      playerState.alive = false;
      this.checkGameEnd();
      return true;
    }
    
    playerState.currentPiece = playerState.nextPiece;
    playerState.nextPiece = this.createRandomPiece();
    playerState.currentX = 4;
    playerState.currentY = 0;
    
    if (!canMove(playerState.grid, playerState.currentPiece, playerState.currentX, playerState.currentY)) {
      playerState.alive = false;
      this.checkGameEnd();
    }
    
    return true;
  }

  sendAttackLines(attackerKey, numLines) {
    const defenderKey = attackerKey === 'player1' ? 'player2' : 'player1';
    const defenderState = this.gameState[defenderKey];
    
    if (!defenderState.alive) return;
    
    defenderState.grid.splice(0, numLines);
    
    for (let i = 0; i < numLines; i++) {
      const garbageLine = Array(10).fill('block-garbage');
      const holePosition = Math.floor(Math.random() * 10);
      garbageLine[holePosition] = 0;
      defenderState.grid.push(garbageLine);
    }
  }

  checkGameEnd() {
    const player1Alive = this.gameState.player1.alive;
    const player2Alive = this.gameState.player2.alive;
    
    if (!player1Alive && !player2Alive) {
      this.gameState.winner = this.gameState.player1.score >= this.gameState.player2.score ? 1 : 2;
    } else if (!player1Alive) {
      this.gameState.winner = 2;
    } else if (!player2Alive) {
      this.gameState.winner = 1;
    } else {
      return;
    }
    
    this.stopGame();
    io.to(this.id).emit('game-over', {
      winner: this.gameState.winner,
      finalScores: {
        player1: this.gameState.player1.score,
        player2: this.gameState.player2.score
      }
    });
  }

  bothPlayersReady() {
    return this.players.length === 2 && 
           this.gameState.player1.ready && 
           this.gameState.player2.ready;
  }

  isFull() {
    return this.players.length >= 2;
  }

  isStale() {
    const maxAge = 4 * 60 * 60 * 1000; // 4 hours
    return (Date.now() - this.gameState.createdAt) > maxAge && this.players.length === 0;
  }
}

// Game utility functions
function canMove(grid, piece, newX, newY) {
  for (let y = 0; y < piece.shape.length; y++) {
    for (let x = 0; x < piece.shape[y].length; x++) {
      if (piece.shape[y][x]) {
        const gridX = newX + x;
        const gridY = newY + y;
        
        if (gridX < 0 || gridX >= 10 || gridY >= 20) return false;
        if (gridY >= 0 && grid[gridY][gridX] !== 0) return false;
      }
    }
  }
  return true;
}

function placePiece(grid, piece, x, y) {
  const newGrid = grid.map(row => [...row]);
  
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
      newGrid.push([...grid[row]]);
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

function generateRoomId() {
  return Math.random().toString(36).substring(2, 8).toUpperCase();
}

// Cleanup old rooms periodically
setInterval(() => {
  const now = Date.now();
  const maxAge = 4 * 60 * 60 * 1000; // 4 hours
  
  for (const [roomId, room] of rooms.entries()) {
    if (now - room.gameState.createdAt > maxAge && room.players.length === 0) {
      rooms.delete(roomId);
    }
  }
}, 60 * 60 * 1000); // Every hour

// Socket.IO connection handling
io.on('connection', (socket) => {
  console.log(`Player connected: ${socket.id}`);

  socket.on('create-room', ({ playerName }) => {
    try {
      const roomId = generateRoomId();
      const room = new GameRoom(roomId);
      rooms.set(roomId, room);
      
      const playerNumber = room.addPlayer(socket.id, playerName);
      socket.join(roomId);
      
      players.set(socket.id, { roomId, playerNumber, playerName });
      
      socket.emit('room-created', { 
        roomId, 
        playerNumber,
        playerName
      });
    } catch (error) {
      console.error('Error creating room:', error);
      socket.emit('error', 'Failed to create room');
    }
  });

  socket.on('join-room', ({ roomId, playerName }) => {
    try {
      // Leave any existing room first
      if (players.has(socket.id)) {
        const oldRoomId = players.get(socket.id).roomId;
        if (oldRoomId && oldRoomId !== roomId) {
          socket.leave(oldRoomId);
          if (rooms.has(oldRoomId)) {
            const shouldDelete = rooms.get(oldRoomId).removePlayer(socket.id);
            if (shouldDelete) {
              rooms.delete(oldRoomId);
            }
          }
        }
      }

      if (!rooms.has(roomId)) {
        socket.emit('room-not-found');
        return;
      }

      const room = rooms.get(roomId);
      
      if (room.isFull()) {
        socket.emit('room-full');
        return;
      }

      const playerNumber = room.addPlayer(socket.id, playerName);
      socket.join(roomId);
      
      players.set(socket.id, { roomId, playerNumber, playerName });
      
      socket.emit('joined-room', { 
        roomId, 
        playerNumber,
        playerName
      });
      
      socket.to(roomId).emit('player-joined', { 
        playerName, 
        playerNumber
      });
    } catch (error) {
      console.error('Error joining room:', error);
      socket.emit('error', 'Failed to join room');
    }
  });

  socket.on('player-ready', () => {
    const playerInfo = players.get(socket.id);
    if (!playerInfo) return;

    const room = rooms.get(playerInfo.roomId);
    if (!room) return;

    const playerKey = `player${playerInfo.playerNumber}`;
    room.gameState[playerKey].ready = true;

    io.to(playerInfo.roomId).emit('player-ready', { 
      playerNumber: playerInfo.playerNumber
    });

    if (room.bothPlayersReady()) {
      if (room.startGame()) {
        io.to(playerInfo.roomId).emit('game-start', room.gameState);
      }
    }
  });

  socket.on('game-action', (action) => {
    const playerInfo = players.get(socket.id);
    if (!playerInfo) return;

    const room = rooms.get(playerInfo.roomId);
    if (!room || !room.gameState.gameStarted || room.gameState.gamePaused) return;

    const playerKey = `player${playerInfo.playerNumber}`;
    
    if (room.movePlayerPiece(playerKey, action.type)) {
      io.to(playerInfo.roomId).emit('game-update', room.gameState);
    }
  });

  socket.on('pause-game', () => {
    const playerInfo = players.get(socket.id);
    if (!playerInfo) return;

    const room = rooms.get(playerInfo.roomId);
    if (!room || !room.gameState.gameStarted) return;

    room.pauseGame();
    io.to(playerInfo.roomId).emit('game-paused');
  });

  socket.on('resume-game', () => {
    const playerInfo = players.get(socket.id);
    if (!playerInfo) return;

    const room = rooms.get(playerInfo.roomId);
    if (!room || !room.gameState.gameStarted) return;

    room.resumeGame();
    io.to(playerInfo.roomId).emit('game-resumed');
  });

  socket.on('reset-game', () => {
    const playerInfo = players.get(socket.id);
    if (!playerInfo) return;

    const room = rooms.get(playerInfo.roomId);
    if (!room) return;

    room.resetGame();
    io.to(playerInfo.roomId).emit('game-reset');
  });

  socket.on('leave-room', () => {
    const playerInfo = players.get(socket.id);
    if (!playerInfo) return;

    const room = rooms.get(playerInfo.roomId);
    if (room) {
      const shouldDelete = room.removePlayer(socket.id);
      socket.leave(playerInfo.roomId);
      
      if (shouldDelete) {
        rooms.delete(playerInfo.roomId);
      } else {
        io.to(playerInfo.roomId).emit('player-left', { 
          playerNumber: playerInfo.playerNumber
        });
      }
    }
    
    players.delete(socket.id);
  });

  socket.on('disconnect', () => {
    console.log(`Player disconnected: ${socket.id}`);
    
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
  });
});

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    activeRooms: rooms.size,
    activePlayers: players.size
  });
});

// Start server
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});

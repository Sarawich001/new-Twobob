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
  }
});

// Serve static files
app.use(express.static(path.join(__dirname, 'public')));

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
    this.gameTimer = null;
    this.dropInterval = 1000; // 1 second initially
  }

  createInitialPlayerState() {
    return {
      grid: Array(20).fill().map(() => Array(10).fill(0)),
      currentPiece: null,
      nextPiece: null,
      currentX: 0,
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
    const player = {
      socketId,
      playerName: playerName || `Player ${playerNumber}`,
      playerNumber,
      joinedAt: Date.now()
    };
    
    this.players.push(player);
    return playerNumber;
  }

  removePlayer(socketId) {
    const playerIndex = this.players.findIndex(p => p.socketId === socketId);
    if (playerIndex !== -1) {
      this.players.splice(playerIndex, 1);
      
      // Stop game if in progress
      if (this.gameState.gameStarted) {
        this.stopGame();
      }
    }
    
    return this.players.length === 0; // Return true if room should be deleted
  }

  getPlayer(socketId) {
    return this.players.find(p => p.socketId === socketId);
  }

  getPlayerByNumber(playerNumber) {
    return this.players.find(p => p.playerNumber === playerNumber);
  }

  isFull() {
    return this.players.length >= 2;
  }

  bothPlayersReady() {
    return this.players.length === 2 && 
           this.gameState.player1.ready && 
           this.gameState.player2.ready;
  }

  startGame() {
    if (!this.bothPlayersReady()) return false;
    
    this.gameState.gameStarted = true;
    this.gameState.gamePaused = false;
    this.gameState.winner = null;
    
    // Initialize both players
    ['player1', 'player2'].forEach(playerKey => {
      const state = this.gameState[playerKey];
      state.currentPiece = createRandomPiece();
      state.nextPiece = createRandomPiece();
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
    this.gameState.gamePaused = false;
    
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

  startGameLoop() {
    if (this.gameTimer) {
      clearInterval(this.gameTimer);
    }

    this.gameTimer = setInterval(() => {
      if (!this.gameState.gameStarted || this.gameState.gamePaused) {
        return;
      }

      let gameUpdated = false;
      const currentTime = Date.now();

      // Auto-drop pieces for both players
      ['player1', 'player2'].forEach((playerKey, index) => {
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
    }, 50); // Check every 50ms for smooth gameplay
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
          playerState.score += 1; // Bonus for soft drop
          updated = true;
        } else {
          // Place piece and handle line clearing
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
    
    // Place the piece
    playerState.grid = placePiece(
      playerState.grid,
      playerState.currentPiece,
      playerState.currentX,
      playerState.currentY
    );
    
    // Clear completed lines
    const { grid: newGrid, linesCleared } = clearLines(playerState.grid);
    playerState.grid = newGrid;
    playerState.lines += linesCleared;
    
    // Calculate score based on lines cleared
    if (linesCleared > 0) {
      const lineScore = { 1: 100, 2: 300, 3: 500, 4: 800 };
      const baseScore = lineScore[linesCleared] || 0;
      playerState.score += baseScore * playerState.level;
      
      // Send attack lines to opponent if multiplayer
      if (linesCleared > 1) {
        this.sendAttackLines(playerKey, linesCleared - 1);
      }
    }
    
    // Update level
    playerState.level = Math.floor(playerState.lines / 10) + 1;
    
    // Check for game over
    if (playerState.grid[0].some(cell => cell !== 0) || playerState.grid[1].some(cell => cell !== 0)) {
      playerState.alive = false;
      this.checkGameEnd();
      return true;
    }
    
    // Spawn new piece
    playerState.currentPiece = playerState.nextPiece;
    playerState.nextPiece = createRandomPiece();
    playerState.currentX = 4;
    playerState.currentY = 0;
    
    // Check if new piece can be placed
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
    
    // Remove lines from top and add garbage lines at bottom
    defenderState.grid.splice(0, numLines);
    
    for (let i = 0; i < numLines; i++) {
      const garbageLine = Array(10).fill('block-garbage');
      // Add one random hole in the garbage line
      const holePosition = Math.floor(Math.random() * 10);
      garbageLine[holePosition] = 0;
      defenderState.grid.push(garbageLine);
    }
  }

  checkGameEnd() {
    const player1Alive = this.gameState.player1.alive;
    const player2Alive = this.gameState.player2.alive;
    
    if (!player1Alive && !player2Alive) {
      // Both players died - highest score wins
      this.gameState.winner = this.gameState.player1.score >= this.gameState.player2.score ? 1 : 2;
    } else if (!player1Alive) {
      this.gameState.winner = 2;
    } else if (!player2Alive) {
      this.gameState.winner = 1;
    } else {
      return; // Game continues
    }
    
    this.stopGame();
    
    io.to(this.id).emit('game-over', {
      winner: this.gameState.winner,
      finalScores: {
        player1: this.gameState.player1.score,
        player2: this.gameState.player2.score
      },
      finalStats: {
        player1: {
          score: this.gameState.player1.score,
          lines: this.gameState.player1.lines,
          level: this.gameState.player1.level
        },
        player2: {
          score: this.gameState.player2.score,
          lines: this.gameState.player2.lines,
          level: this.gameState.player2.level
        }
      }
    });
  }

  getRoomInfo() {
    return {
      id: this.id,
      players: this.players,
      gameStarted: this.gameState.gameStarted,
      gamePaused: this.gameState.gamePaused,
      playersReady: this.players.filter((_, index) => 
        this.gameState[`player${index + 1}`]?.ready
      ).length,
      createdAt: this.gameState.createdAt
    };
  }
}

// Tetris pieces with updated colors
const TETROMINOS = {
  I: { shape: [[0,0,0,0],[1,1,1,1],[0,0,0,0],[0,0,0,0]], color: 'block-i' },
  O: { shape: [[1,1],[1,1]], color: 'block-o' },
  T: { shape: [[0,1,0],[1,1,1],[0,0,0]], color: 'block-t' },
  S: { shape: [[0,1,1],[1,1,0],[0,0,0]], color: 'block-s' },
  Z: { shape: [[1,1,0],[0,1,1],[0,0,0]], color: 'block-z' },
  J: { shape: [[1,0,0],[1,1,1],[0,0,0]], color: 'block-j' },
  L: { shape: [[0,0,1],[1,1,1],[0,0,0]], color: 'block-l' }
};

function createRandomPiece() {
  const pieces = Object.keys(TETROMINOS);
  const randomPiece = pieces[Math.floor(Math.random() * pieces.length)];
  return JSON.parse(JSON.stringify(TETROMINOS[randomPiece]));
}

function canMove(grid, piece, newX, newY) {
  if (!piece || !piece.shape) return false;
  
  for (let y = 0; y < piece.shape.length; y++) {
    for (let x = 0; x < piece.shape[y].length; x++) {
      if (piece.shape[y][x]) {
        const gridX = newX + x;
        const gridY = newY + y;
        
        // Check boundaries
        if (gridX < 0 || gridX >= 10 || gridY >= 20) return false;
        
        // Check collision with existing pieces (only if within grid)
        if (gridY >= 0 && grid[gridY] && grid[gridY][gridX] !== 0) return false;
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
  
  // Add empty lines at top
  while (newGrid.length < 20) {
    newGrid.unshift(Array(10).fill(0));
  }
  
  return { grid: newGrid, linesCleared };
}

function rotateMatrix(matrix) {
  if (!matrix || matrix.length === 0) return matrix;
  
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

// Utility functions
function generateRoomId() {
  return Math.random().toString(36).substring(2, 8).toUpperCase();
}

function cleanupOldRooms() {
  const now = Date.now();
  const maxAge = 24 * 60 * 60 * 1000; // 24 hours
  
  for (const [roomId, room] of rooms.entries()) {
    if (now - room.gameState.createdAt > maxAge && room.players.length === 0) {
      rooms.delete(roomId);
      console.log(`Cleaned up old room: ${roomId}`);
    }
  }
}

// Run cleanup every hour
setInterval(cleanupOldRooms, 60 * 60 * 1000);

// Socket.IO connection handling
io.on('connection', (socket) => {
  console.log(`Player connected: ${socket.id}`);

  // Send connection confirmation
  socket.emit('connected', { socketId: socket.id });

  socket.on('create-room', ({ playerName }) => {
    try {
      const roomId = generateRoomId();
      const room = new GameRoom(roomId);
      rooms.set(roomId, room);
      
      const playerNumber = room.addPlayer(socket.id, playerName);
      socket.join(roomId);
      socket.roomId = roomId;
      
      players.set(socket.id, { roomId, playerNumber, playerName });
      
      socket.emit('room-created', { 
        roomId, 
        playerNumber,
        playerName,
        roomInfo: room.getRoomInfo()
      });
      
      console.log(`Room ${roomId} created by ${playerName}`);
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
            } else {
              io.to(oldRoomId).emit('player-left', { 
                playerNumber: players.get(socket.id).playerNumber 
              });
            }
          }
        }
      }

      // Check if room exists
      if (!rooms.has(roomId)) {
        socket.emit('room-not-found');
        return;
      }

      const room = rooms.get(roomId);
      
      // Check if room is full
      if (room.isFull()) {
        socket.emit('room-full');
        return;
      }

      const playerNumber = room.addPlayer(socket.id, playerName);
      socket.join(roomId);
      socket.roomId = roomId;
      
      players.set(socket.id, { roomId, playerNumber, playerName });
      
      socket.emit('joined-room', { 
        roomId, 
        playerNumber,
        playerName,
        roomInfo: room.getRoomInfo()
      });
      
      socket.to(roomId).emit('player-joined', { 
        playerName, 
        playerNumber,
        roomInfo: room.getRoomInfo()
      });

      console.log(`Player ${playerName} joined room ${roomId} as Player ${playerNumber}`);
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
      playerNumber: playerInfo.playerNumber,
      roomInfo: room.getRoomInfo()
    });

    if (room.bothPlayersReady()) {
      if (room.startGame()) {
        io.to(playerInfo.roomId).emit('game-start', room.gameState);
      }
    }
  });

  socket.on('player-not-ready', () => {
    const playerInfo = players.get(socket.id);
    if (!playerInfo) return;

    const room = rooms.get(playerInfo.roomId);
    if (!room) return;

    const playerKey = `player${playerInfo.playerNumber}`;
    room.gameState[playerKey].ready = false;

    io.to(playerInfo.roomId).emit('player-not-ready', { 
      playerNumber: playerInfo.playerNumber,
      roomInfo: room.getRoomInfo()
    });
  });

  socket.on('request-new-game', () => {
    const playerInfo = players.get(socket.id);
    if (!playerInfo) {
      socket.emit('error', 'You are not in any room');
      return;
    }

    const room = rooms.get(playerInfo.roomId);
    if (!room) {
      socket.emit('error', 'Room does not exist');
      return;
    }

    room.resetGame();
    io.to(playerInfo.roomId).emit('game-reset', {
      roomInfo: room.getRoomInfo()
    });
    
    console.log(`Game reset for room ${playerInfo.roomId}`);
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

  socket.on('leave-room', () => {
    const playerInfo = players.get(socket.id);
    if (!playerInfo) return;

    const room = rooms.get(playerInfo.roomId);
    if (room) {
      const shouldDelete = room.removePlayer(socket.id);
      socket.leave(playerInfo.roomId);
      
      if (shouldDelete) {
        rooms.delete(playerInfo.roomId);
        console.log(`Room ${playerInfo.roomId} deleted`);
      } else {
        io.to(playerInfo.roomId).emit('player-left', { 
          playerNumber: playerInfo.playerNumber,
          roomInfo: room.getRoomInfo()
        });
      }
    }
    
    socket.roomId = null;
    players.delete(socket.id);
    console.log(`Player left room: ${playerInfo.playerName}`);
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

  socket.on('get-room-list', () => {
    const roomList = Array.from(rooms.values())
      .filter(room => !room.isFull())
      .map(room => room.getRoomInfo())
      .slice(0, 20); // Limit to 20 rooms
    
    socket.emit('room-list', roomList);
  });

  socket.on('get-room-info', ({ roomId }) => {
    const room = rooms.get(roomId);
    if (room) {
      socket.emit('room-info', room.getRoomInfo());
    } else {
      socket.emit('room-not-found');
    }
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
          console.log(`Room ${playerInfo.roomId} deleted due to disconnect`);
        } else {
          io.to(playerInfo.roomId).emit('player-disconnected', {
            playerNumber: playerInfo.playerNumber,
            playerName: playerInfo.playerName,
            roomInfo: room.getRoomInfo()
          });
        }
      }
      
      players.delete(socket.id);
    }
    
    socket.roomId = null;
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

// Server info endpoint
app.get('/api/stats', (req, res) => {
  const roomStats = Array.from(rooms.values()).map(room => ({
    id: room.id,
    players: room.players.length,
    gameStarted: room.gameState.gameStarted,
    createdAt: room.gameState.createdAt
  }));

  res.json({
    totalRooms: rooms.size,
    totalPlayers: players.size,
    rooms: roomStats
  });
});

// Start server
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`🚀 TwoBob Tactics Server running on port ${PORT}`);
  console.log(`📱 Game URL: http://localhost:${PORT}`);
  console.log(`📊 Health Check: http://localhost:${PORT}/health`);
  console.log(`📈 Stats: http://localhost:${PORT}/api/stats`);
});

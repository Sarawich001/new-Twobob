const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const path = require('path');
const cluster = require('cluster');
const os = require('os');

const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  },
  // Performance optimizations
  pingTimeout: 60000,
  pingInterval: 25000,
  transports: ['websocket', 'polling'],
  allowEIO3: true,
  compression: true,
  httpCompression: true
});

// Serve static files with caching
app.use(express.static(path.join(__dirname), {
  maxAge: '1d', // Cache static files for 1 day
  etag: true
}));

// Enhanced game state management
const rooms = new Map();
const players = new Map();
const roomStats = new Map();

// Performance monitoring
const performanceMetrics = {
  totalConnections: 0,
  activeRooms: 0,
  messagesPerSecond: 0,
  averageLatency: 0,
  startTime: Date.now()
};

// Network optimization
const BATCH_SIZE = 10;
const UPDATE_INTERVAL = 16; // ~60 FPS
const networkBatches = new Map();

class OptimizedGameRoom {
  constructor(roomId) {
    this.id = roomId;
    this.players = [];
    this.gameState = {
      player1: this.createInitialPlayerState(),
      player2: this.createInitialPlayerState(),
      gameStarted: false,
      winner: null,
      roomId: roomId,
      timestamp: Date.now()
    };
    
    // Performance optimizations
    this.lastUpdate = Date.now();
    this.updateQueue = [];
    this.stateHistory = [];
    this.maxHistory = 100;
    
    // Network optimization
    this.lastNetworkState = null;
    this.compressionEnabled = true;
    
    // Statistics
    this.stats = {
      gamesPlayed: 0,
      totalMoves: 0,
      averageGameDuration: 0,
      lastGameStart: null
    };
    
    // Initialize room stats
    roomStats.set(roomId, this.stats);
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
      inputBuffer: [],
      lastInputTime: 0,
      predictionBuffer: [],
      lagCompensation: 0
    };
  }

  addPlayer(socketId, playerName) {
    if (this.players.length >= 2) return false;
    
    const playerNumber = this.players.length + 1;
    const player = {
      socketId,
      playerName,
      playerNumber,
      joinTime: Date.now(),
      latency: 0,
      inputHistory: [],
      lastPingTime: 0
    };
    
    this.players.push(player);
    return playerNumber;
  }

  removePlayer(socketId) {
    this.players = this.players.filter(p => p.socketId !== socketId);
    return this.players.length === 0;
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

  // Advanced state management with compression
  createStateSnapshot() {
    const snapshot = {
      ...this.gameState,
      timestamp: Date.now()
    };
    
    this.stateHistory.push(snapshot);
    if (this.stateHistory.length > this.maxHistory) {
      this.stateHistory.shift();
    }
    
    return snapshot;
  }

  // Delta compression for network optimization
  createDeltaUpdate(newState) {
    if (!this.lastNetworkState) {
      this.lastNetworkState = newState;
      return newState;
    }
    
    const delta = {};
    const keys = ['player1', 'player2', 'gameStarted', 'winner'];
    
    keys.forEach(key => {
      if (JSON.stringify(this.lastNetworkState[key]) !== JSON.stringify(newState[key])) {
        delta[key] = newState[key];
      }
    });
    
    if (Object.keys(delta).length > 0) {
      delta.timestamp = newState.timestamp;
      delta.roomId = this.id;
      this.lastNetworkState = newState;
      return delta;
    }
    
    return null;
  }

  // Input prediction and lag compensation
  addInputToBuffer(playerNumber, input, timestamp) {
    const playerKey = `player${playerNumber}`;
    const playerState = this.gameState[playerKey];
    
    if (!playerState) return;
    
    playerState.inputBuffer.push({
      input,
      timestamp,
      processed: false
    });
    
    // Keep buffer size manageable
    if (playerState.inputBuffer.length > 50) {
      playerState.inputBuffer.shift();
    }
  }

  processInputBuffer(playerNumber) {
    const playerKey = `player${playerNumber}`;
    const playerState = this.gameState[playerKey];
    
    if (!playerState || !playerState.inputBuffer.length) return false;
    
    let processed = false;
    const now = Date.now();
    
    playerState.inputBuffer.forEach(bufferedInput => {
      if (!bufferedInput.processed && (now - bufferedInput.timestamp) < 1000) {
        // Process the input
        this.processGameAction(playerNumber, bufferedInput.input);
        bufferedInput.processed = true;
        processed = true;
      }
    });
    
    // Clean up processed inputs
    playerState.inputBuffer = playerState.inputBuffer.filter(input => !input.processed);
    
    return processed;
  }

  // Game action processing with optimizations
  processGameAction(playerNumber, action) {
    const playerKey = `player${playerNumber}`;
    const playerState = this.gameState[playerKey];
    
    if (!playerState || !playerState.alive || !this.gameState.gameStarted) {
      return false;
    }

    let updated = false;
    let shouldCheckGameOver = false;

    // Record move for statistics
    this.stats.totalMoves++;

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
          playerState.score += 1;
          updated = true;
        } else {
          shouldCheckGameOver = true;
          updated = true;
        }
        break;

      case 'rotate':
        const rotated = {
          shape: rotateMatrix(playerState.currentPiece.shape),
          color: playerState.currentPiece.color
        };
        
        const wallKicks = [
          [0, 0], [-1, 0], [1, 0], [0, -1], [-1, -1], [1, -1]
        ];
        
        for (const [kickX, kickY] of wallKicks) {
          if (canMove(playerState.grid, rotated, playerState.currentX + kickX, playerState.currentY + kickY)) {
            playerState.currentPiece.shape = rotated.shape;
            playerState.currentX += kickX;
            playerState.currentY += kickY;
            updated = true;
            break;
          }
        }
        break;

      case 'hard-drop':
        let dropDistance = 0;
        while (canMove(playerState.grid, playerState.currentPiece, playerState.currentX, playerState.currentY + 1)) {
          playerState.currentY++;
          dropDistance++;
        }
        playerState.score += dropDistance * 2;
        shouldCheckGameOver = true;
        updated = true;
        break;
    }

    // Handle piece placement
    if (shouldCheckGameOver) {
      updated = this.handlePiecePlacement(playerNumber) || updated;
    }

    return updated;
  }

  handlePiecePlacement(playerNumber) {
    const playerKey = `player${playerNumber}`;
    const playerState = this.gameState[playerKey];
    
    // Place the piece
    playerState.grid = placePiece(playerState.grid, playerState.currentPiece, playerState.currentX, playerState.currentY);
    
    // Clear completed lines
    const { grid: newGrid, linesCleared } = clearLines(playerState.grid);
    playerState.grid = newGrid;
    playerState.lines += linesCleared;
    
    // Calculate score
    if (linesCleared > 0) {
      const lineScores = { 1: 100, 2: 300, 3: 500, 4: 800 };
      const baseScore = lineScores[linesCleared] || 0;
      playerState.score += baseScore * playerState.level;
    }
    
    // Update level
    playerState.level = Math.floor(playerState.lines / 10) + 1;
    
    // Check for game over
    if (this.checkGameOver(playerNumber)) {
      return true;
    }
    
    // Spawn new piece
    playerState.currentPiece = playerState.nextPiece;
    playerState.nextPiece = createRandomPiece();
    playerState.currentX = 4;
    playerState.currentY = 0;
    
    // Check if new piece can be placed
    if (!canMove(playerState.grid, playerState.currentPiece, playerState.currentX, playerState.currentY)) {
      this.checkGameOver(playerNumber);
    }
    
    return true;
  }

  checkGameOver(playerNumber) {
    const playerKey = `player${playerNumber}`;
    const playerState = this.gameState[playerKey];
    
    if (playerState.grid[0].some(cell => cell !== 0) || playerState.grid[1].some(cell => cell !== 0)) {
      playerState.alive = false;
      
      const otherPlayerNumber = playerNumber === 1 ? 2 : 1;
      const otherPlayerKey = `player${otherPlayerNumber}`;
      const otherPlayerState = this.gameState[otherPlayerKey];
      
      let winner = otherPlayerState.alive ? otherPlayerNumber : 'draw';
      this.gameState.winner = winner;
      
      // Update statistics
      this.stats.gamesPlayed++;
      if (this.stats.lastGameStart) {
        const gameDuration = Date.now() - this.stats.lastGameStart;
        this.stats.averageGameDuration = (this.stats.averageGameDuration + gameDuration) / 2;
      }
      
      return true;
    }
    
    return false;
  }

  resetGame() {
    this.gameState = {
      player1: this.createInitialPlayerState(),
      player2: this.createInitialPlayerState(),
      gameStarted: false,
      winner: null,
      roomId: this.id,
      timestamp: Date.now()
    };
    
    this.lastNetworkState = null;
    this.stateHistory = [];
    this.stats.lastGameStart = Date.now();
  }
}

// Enhanced Tetris pieces with additional properties
const TETROMINOS = {
  I: { shape: [[0,0,0,0],[1,1,1,1],[0,0,0,0],[0,0,0,0]], color: 'cyan' },
  O: { shape: [[1,1],[1,1]], color: 'yellow' },
  T: { shape: [[0,1,0],[1,1,1],[0,0,0]], color: 'purple' },
  S: { shape: [[0,1,1],[1,1,0],[0,0,0]], color: 'green' },
  Z: { shape: [[1,1,0],[0,1,1],[0,0,0]], color: 'red' },
  J: { shape: [[1,0,0],[1,1,1],[0,0,0]], color: 'blue' },
  L: { shape: [[0,0,1],[1,1,1],[0,0,0]], color: 'orange' }
};

function createRandomPiece() {
  const pieces = Object.keys(TETROMINOS);
  const randomPiece = pieces[Math.floor(Math.random() * pieces.length)];
  return JSON.parse(JSON.stringify(TETROMINOS[randomPiece]));
}

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

// Network optimization functions
function batchNetworkUpdates(roomId, data) {
  if (!networkBatches.has(roomId)) {
    networkBatches.set(roomId, []);
  }
  
  networkBatches.get(roomId).push(data);
  
  if (networkBatches.get(roomId).length >= BATCH_SIZE) {
    flushBatch(roomId);
  }
}

function flushBatch(roomId) {
  const batch = networkBatches.get(roomId);
  if (batch && batch.length > 0) {
    io.to(roomId).emit('batch-update', batch);
    networkBatches.set(roomId, []);
  }
}

// Flush all batches periodically
setInterval(() => {
  for (const roomId of networkBatches.keys()) {
    flushBatch(roomId);
  }
}, UPDATE_INTERVAL);

// Socket connection handling with optimizations
io.on('connection', (socket) => {
  console.log(`Player connected: ${socket.id}`);
  performanceMetrics.totalConnections++;
  
  // Set up lag compensation
  socket.lagCompensation = 0;
  socket.lastPingTime = Date.now();
  
  // Ping-pong for latency measurement
  socket.on('ping', (timestamp) => {
    socket.emit('pong', timestamp);
  });
  
  socket.on('pong', (timestamp) => {
    const latency = Date.now() - timestamp;
    socket.lagCompensation = latency / 2;
    
    const playerInfo = players.get(socket.id);
    if (playerInfo) {
      const room = rooms.get(playerInfo.roomId);
      if (room) {
        const player = room.getPlayer(socket.id);
        if (player) {
          player.latency = latency;
        }
      }
    }
  });

  socket.on('join-room', ({ roomId, playerName }) => {
    try {
      // Leave existing room
      const existingPlayerInfo = players.get(socket.id);
      if (existingPlayerInfo) {
        handlePlayerLeave(socket.id);
      }

      // Create or join room
      if (!rooms.has(roomId)) {
        rooms.set(roomId, new OptimizedGameRoom(roomId));
        performanceMetrics.activeRooms++;
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
        playerName,
        roomPlayers: room.players,
        serverTime: Date.now()
      });
      
      socket.to(roomId).emit('player-joined', { 
        playerName, 
        playerNumber,
        roomPlayers: room.players 
      });

      console.log(`Player ${playerName} joined room ${roomId} as Player ${playerNumber}`);
      
      // Start regular ping for latency measurement
      const pingInterval = setInterval(() => {
        if (socket.connected) {
          socket.emit('ping', Date.now());
        } else {
          clearInterval(pingInterval);
        }
      }, 5000);
      
    } catch (error) {
      console.error('Error joining room:', error);
      socket.emit('error', 'ไม่สามารถเข้าร่วมห้องได้');
    }
  });

  socket.on('player-ready', () => {
    const playerInfo = players.get(socket.id);
    if (!playerInfo) {
      socket.emit('error', 'คุณไม่ได้อยู่ในห้องใดๆ');
      return;
    }

    const room = rooms.get(playerInfo.roomId);
    if (!room) {
      socket.emit('error', 'ห้องไม่มีอยู่แล้ว');
      return;
    }

    const playerKey = `player${playerInfo.playerNumber}`;
    const playerState = room.gameState[playerKey];
    
    playerState.ready = true;
    playerState.currentPiece = createRandomPiece();
    playerState.nextPiece = createRandomPiece();
    playerState.currentX = 4;
    playerState.currentY = 0;

    io.to(playerInfo.roomId).emit('player-ready', { 
      playerNumber: playerInfo.playerNumber 
    });

    if (room.bothPlayersReady()) {
      room.gameState.gameStarted = true;
      room.stats.lastGameStart = Date.now();
      
      const gameStartData = {
        ...room.gameState,
        serverTime: Date.now()
      };
      
      io.to(playerInfo.roomId).emit('game-start', gameStartData);
      console.log(`Game started in room ${playerInfo.roomId}`);
    }
  });

  // Enhanced game action handling with batching
  socket.on('game-action', (action) => {
    const playerInfo = players.get(socket.id);
    if (!playerInfo) return;

    const room = rooms.get(playerInfo.roomId);
    if (!room || !room.gameState.gameStarted) return;

    // Add timestamp for lag compensation
    action.timestamp = Date.now();
    action.clientTime = action.clientTime || Date.now();
    
    // Add to input buffer for processing
    room.addInputToBuffer(playerInfo.playerNumber, action, action.timestamp);
    
    // Process buffered inputs
    const updated = room.processInputBuffer(playerInfo.playerNumber);
    
    if (updated) {
      const deltaUpdate = room.createDeltaUpdate(room.gameState);
      if (deltaUpdate) {
        batchNetworkUpdates(playerInfo.roomId, deltaUpdate);
      }
      
      // Check for game over
      if (room.gameState.winner) {
        io.to(playerInfo.roomId).emit('game-over', {
          winner: room.gameState.winner,
          finalScores: {
            player1: room.gameState.player1.score,
            player2: room.gameState.player2.score
          },
          gameStats: room.stats
        });
      }
    }
  });

  // Handle batch updates from client
  socket.on('batch-update', (batch) => {
    const playerInfo = players.get(socket.id);
    if (!playerInfo) return;

    const room = rooms.get(playerInfo.roomId);
    if (!room) return;

    let anyUpdated = false;
    
    batch.forEach(action => {
      const updated = room.processGameAction(playerInfo.playerNumber, action);
      anyUpdated = anyUpdated || updated;
    });
    
    if (anyUpdated) {
      const deltaUpdate = room.createDeltaUpdate(room.gameState);
      if (deltaUpdate) {
        batchNetworkUpdates(playerInfo.roomId, deltaUpdate);
      }
    }
  });

  socket.on('request-new-game', () => {
    const playerInfo = players.get(socket.id);
    if (!playerInfo) return;

    const room = rooms.get(playerInfo.roomId);
    if (!room) return;

    room.resetGame();
    io.to(playerInfo.roomId).emit('game-reset', { serverTime: Date.now() });
    
    console.log(`Game reset requested for room ${playerInfo.roomId}`);
  });

  socket.on('leave-room', () => {
    handlePlayerLeave(socket.id);
  });

  socket.on('disconnect', () => {
    console.log(`Player disconnected: ${socket.id}`);
    handlePlayerLeave(socket.id);
  });

  // Performance monitoring endpoint
  socket.on('get-performance-stats', () => {
    const stats = {
      ...performanceMetrics,
      activeRooms: rooms.size,
      totalPlayers: players.size,
      uptime: Date.now() - performanceMetrics.startTime
    };
    
    socket.emit('performance-stats', stats);
  });
});

function handlePlayerLeave(socketId) {
  const playerInfo = players.get(socketId);
  if (!playerInfo) return;

  const room = rooms.get(playerInfo.roomId);
  if (room) {
    const shouldDelete = room.removePlayer(socketId);
    
    if (shouldDelete) {
      rooms.delete(playerInfo.roomId);
      roomStats.delete(playerInfo.roomId);
      performanceMetrics.activeRooms--;
      console.log(`Room ${playerInfo.roomId} deleted`);
    } else {
      io.to(playerInfo.roomId).emit('player-left', {
        playerNumber: playerInfo.playerNumber
      });
    }
  }
  
  players.delete(socketId);
}

// Server monitoring and optimization
setInterval(() => {
  // Clean up empty rooms
  const emptyRooms = [];
  for (const [roomId, room] of rooms.entries()) {
    if (room.players.length === 0) {
      emptyRooms.push(roomId);
    }
  }
  
  emptyRooms.forEach(roomId => {
    rooms.delete(roomId);
    roomStats.delete(roomId);
    performanceMetrics.activeRooms--;
  });
  
  if (emptyRooms.length > 0) {
    console.log(`Cleaned up ${emptyRooms.length} empty rooms`);
  }
  
  // Update performance metrics
  performanceMetrics.activeRooms = rooms.size;
  
}, 60000);

// Performance monitoring
setInterval(() => {
  console.log(`🎮 Server Status: ${rooms.size} rooms, ${players.size} players`);
  console.log(`📊 Performance: ${performanceMetrics.totalConnections} total connections`);
}, 300000); // Log every 5 minutes

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`🚀 Ultra-Optimized Tetris Server running on port ${PORT}`);
  console.log(`🌐 Game URL: http://localhost:${PORT}`);
  console.log(`⚡ Optimizations: Batching, Compression, Lag Compensation enabled`);
  console.log(`📊 Active rooms: ${rooms.size}`);
});

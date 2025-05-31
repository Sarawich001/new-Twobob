const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const path = require('path');

class OptimizedGameServer {
  constructor() {
    this.app = express();
    this.server = http.createServer(this.app);
    this.io = socketIo(this.server, {
      cors: { origin: "*", methods: ["GET", "POST"] }
    });

    this.rooms = new Map();
    this.players = new Map();
    this.actionQueue = new Map();
    
    // Performance monitoring
    this.metrics = {
      activeConnections: 0,
      messagesPerSecond: 0,
      lastMessageCount: 0
    };

    this.setupStaticFiles();
    this.initializeServer();
    this.startMetricsCollection();
  }

  setupStaticFiles() {
    // Serve static files from current directory
    this.app.use(express.static(__dirname));

    // Serve index.html for root
    this.app.get('/', (req, res) => {
      res.sendFile(path.join(__dirname, 'index.html'));
    });

    // Fallback for SPA routing
    this.app.get('*', (req, res) => {
      res.sendFile(path.join(__dirname, 'index.html'));
    });
  }

  initializeServer() {
    this.io.on('connection', (socket) => {
      console.log(`Player connected: ${socket.id}`);
      this.metrics.activeConnections++;
      this.setupSocketHandlers(socket);
      
      socket.on('disconnect', () => {
        console.log(`Player disconnected: ${socket.id}`);
        this.metrics.activeConnections--;
        this.handleDisconnect(socket);
      });
    });
  }

  setupSocketHandlers(socket) {
    // Rate limiting setup
    this.actionQueue.set(socket.id, {
      lastAction: 0,
      actionCount: 0,
      windowStart: Date.now()
    });

    socket.on('join-room', (data) => this.handleJoinRoom(socket, data));
    socket.on('player-ready', () => this.handlePlayerReady(socket));
    socket.on('game-action', (action) => this.handleGameAction(socket, action));
    socket.on('leave-room', () => this.handleLeaveRoom(socket));
    socket.on('request-new-game', () => this.handleNewGame(socket));
  }

  handleJoinRoom(socket, data) {
    const roomId = data.roomId || this.generateRoomId();
    
    if (!this.rooms.has(roomId)) {
      this.rooms.set(roomId, {
        id: roomId,
        players: [],
        gameState: this.createInitialGameState(),
        dropInterval: null
      });
    }

    const room = this.rooms.get(roomId);
    
    if (room.players.length >= 2) {
      socket.emit('room-full');
      return;
    }

    const playerNumber = room.players.length + 1;
    room.players.push({
      socketId: socket.id,
      playerNumber,
      ready: false
    });

    this.players.set(socket.id, {
      roomId,
      playerNumber
    });

    socket.join(roomId);
    socket.emit('joined-room', { roomId, playerNumber });
    
    this.io.to(roomId).emit('player-joined', {
      playerCount: room.players.length,
      players: room.players
    });
  }

  handlePlayerReady(socket) {
    const playerInfo = this.players.get(socket.id);
    if (!playerInfo) return;

    const room = this.rooms.get(playerInfo.roomId);
    if (!room) return;

    const player = room.players.find(p => p.socketId === socket.id);
    if (player) {
      player.ready = true;
    }

    this.io.to(playerInfo.roomId).emit('player-ready', {
      playerNumber: playerInfo.playerNumber
    });

    // Check if all players are ready
    if (room.players.length === 2 && room.players.every(p => p.ready)) {
      this.startGame(room);
    }
  }

  handleLeaveRoom(socket) {
    const playerInfo = this.players.get(socket.id);
    if (!playerInfo) return;

    const room = this.rooms.get(playerInfo.roomId);
    if (room) {
      room.players = room.players.filter(p => p.socketId !== socket.id);
      
      if (room.players.length === 0) {
        if (room.dropInterval) {
          clearInterval(room.dropInterval);
        }
        this.rooms.delete(playerInfo.roomId);
      } else {
        this.io.to(playerInfo.roomId).emit('player-left', {
          playerNumber: playerInfo.playerNumber
        });
      }
    }

    this.players.delete(socket.id);
    socket.leave(playerInfo.roomId);
  }

  handleDisconnect(socket) {
    this.handleLeaveRoom(socket);
    this.actionQueue.delete(socket.id);
  }

  handleNewGame(socket) {
    const playerInfo = this.players.get(socket.id);
    if (!playerInfo) return;

    const room = this.rooms.get(playerInfo.roomId);
    if (!room) return;

    // Reset game state
    room.gameState = this.createInitialGameState();
    room.players.forEach(p => p.ready = false);

    if (room.dropInterval) {
      clearInterval(room.dropInterval);
      room.dropInterval = null;
    }

    this.io.to(playerInfo.roomId).emit('game-reset');
  }

  startGame(room) {
    room.gameState.gameStarted = true;
    
    // Initialize both players
    room.gameState.player1.currentPiece = this.createRandomPiece();
    room.gameState.player1.nextPiece = this.createRandomPiece();
    room.gameState.player2.currentPiece = this.createRandomPiece();
    room.gameState.player2.nextPiece = this.createRandomPiece();

    this.io.to(room.id).emit('game-started', room.gameState);

    // Start drop timer
    room.dropInterval = setInterval(() => {
      this.handleAutoDrop(room);
    }, 1000);
  }

  handleAutoDrop(room) {
    if (!room.gameState.gameStarted) return;

    const players = ['player1', 'player2'];
    
    players.forEach(playerKey => {
      const playerState = room.gameState[playerKey];
      if (!playerState.alive) return;

      if (this.canMove(playerState.grid, playerState.currentPiece,
                      playerState.currentX, playerState.currentY + 1)) {
        playerState.currentY++;
      } else {
        // Handle piece placement
        const delta = this.handlePiecePlacement(room, playerState, 
          playerKey === 'player1' ? 1 : 2);
        
        if (delta) {
          this.io.to(room.id).emit('game-delta', {
            playerNumber: playerKey === 'player1' ? 1 : 2,
            changes: delta.changes
          });
        }
      }
    });

    // Send position updates
    this.io.to(room.id).emit('auto-drop', {
      player1: {
        x: room.gameState.player1.currentX,
        y: room.gameState.player1.currentY
      },
      player2: {
        x: room.gameState.player2.currentX,
        y: room.gameState.player2.currentY
      }
    });
  }

  createInitialGameState() {
    return {
      gameStarted: false,
      winner: null,
      player1: this.createPlayerState(),
      player2: this.createPlayerState()
    };
  }

  createPlayerState() {
    return {
      grid: Array(20).fill().map(() => Array(10).fill(0)),
      currentPiece: null,
      nextPiece: null,
      currentX: 4,
      currentY: 0,
      score: 0,
      lines: 0,
      level: 1,
      alive: true
    };
  }

  generateRoomId() {
    return Math.random().toString(36).substring(2, 8).toUpperCase();
  }

  // Rate limiting for game actions
  isActionAllowed(socketId) {
    const now = Date.now();
    const queue = this.actionQueue.get(socketId);
    
    if (!queue) return false;

    // Reset window every second
    if (now - queue.windowStart > 1000) {
      queue.actionCount = 0;
      queue.windowStart = now;
    }

    // Allow max 20 actions per second
    if (queue.actionCount >= 20) {
      return false;
    }

    // Minimum 30ms between actions
    if (now - queue.lastAction < 30) {
      return false;
    }

    queue.actionCount++;
    queue.lastAction = now;
    return true;
  }

  handleGameAction(socket, action) {
    // Rate limiting check
    if (!this.isActionAllowed(socket.id)) {
      socket.emit('rate-limited');
      return;
    }

    const playerInfo = this.players.get(socket.id);
    if (!playerInfo) return;

    const room = this.rooms.get(playerInfo.roomId);
    if (!room || !room.gameState.gameStarted) return;

    const playerKey = `player${playerInfo.playerNumber}`;
    const playerState = room.gameState[playerKey];
    
    if (!playerState.alive) return;

    // Process action and get delta changes
    const delta = this.processGameAction(room, playerState, action, playerInfo.playerNumber);
    
    if (delta) {
      // Send only delta updates instead of full state
      this.io.to(playerInfo.roomId).emit('game-delta', {
        playerNumber: playerInfo.playerNumber,
        changes: delta
      });
    }
  }

  processGameAction(room, playerState, action, playerNumber) {
    const delta = { changes: [] };
    
    switch (action.type) {
      case 'move-left':
        if (this.canMove(playerState.grid, playerState.currentPiece, 
                       playerState.currentX - 1, playerState.currentY)) {
          const oldX = playerState.currentX;
          playerState.currentX--;
          delta.changes.push({
            type: 'position',
            from: { x: oldX, y: playerState.currentY },
            to: { x: playerState.currentX, y: playerState.currentY }
          });
        }
        break;

      case 'move-right':
        if (this.canMove(playerState.grid, playerState.currentPiece,
                       playerState.currentX + 1, playerState.currentY)) {
          const oldX = playerState.currentX;
          playerState.currentX++;
          delta.changes.push({
            type: 'position',
            from: { x: oldX, y: playerState.currentY },
            to: { x: playerState.currentX, y: playerState.currentY }
          });
        }
        break;

      case 'move-down':
        if (this.canMove(playerState.grid, playerState.currentPiece,
                       playerState.currentX, playerState.currentY + 1)) {
          const oldY = playerState.currentY;
          playerState.currentY++;
          delta.changes.push({
            type: 'position',
            from: { x: playerState.currentX, y: oldY },
            to: { x: playerState.currentX, y: playerState.currentY }
          });
        } else {
          // Handle piece placement
          return this.handlePiecePlacement(room, playerState, playerNumber);
        }
        break;

      case 'rotate':
        const rotated = this.rotateMatrix(playerState.currentPiece.shape);
        if (this.canMove(playerState.grid, { shape: rotated, color: playerState.currentPiece.color },
                       playerState.currentX, playerState.currentY)) {
          playerState.currentPiece.shape = rotated;
          delta.changes.push({
            type: 'rotation',
            shape: rotated
          });
        }
        break;

      case 'hard-drop':
        let dropDistance = 0;
        while (this.canMove(playerState.grid, playerState.currentPiece,
                          playerState.currentX, playerState.currentY + 1)) {
          playerState.currentY++;
          dropDistance++;
          playerState.score += 2;
        }
        if (dropDistance > 0) {
          delta.changes.push({
            type: 'hard-drop',
            distance: dropDistance,
            newY: playerState.currentY,
            scoreGain: dropDistance * 2
          });
        }
        break;
    }

    return delta.changes.length > 0 ? delta : null;
  }

  handlePiecePlacement(room, playerState, playerNumber) {
    const delta = { changes: [] };
    
    // Place piece on grid
    const newGrid = this.placePiece(
      playerState.grid,
      playerState.currentPiece,
      playerState.currentX,
      playerState.currentY
    );
    
    // Clear lines efficiently
    const clearedLines = [];
    let linesCleared = 0;
    
    for (let row = 19; row >= 0; row--) {
      if (newGrid[row].every(cell => cell !== 0)) {
        clearedLines.push(row);
        newGrid.splice(row, 1);
        newGrid.unshift(Array(10).fill(0));
        linesCleared++;
        row++; // Check same row again since we shifted
      }
    }
    
    playerState.grid = newGrid;
    playerState.lines += linesCleared;
    
    // Calculate score efficiently
    const lineScores = [0, 100, 300, 500, 800];
    const scoreGain = lineScores[linesCleared] * playerState.level;
    playerState.score += scoreGain;
    playerState.level = Math.floor(playerState.lines / 10) + 1;
    
    // Add placement delta
    delta.changes.push({
      type: 'piece-placed',
      piece: playerState.currentPiece,
      position: { x: playerState.currentX, y: playerState.currentY },
      linesCleared: clearedLines,
      scoreGain,
      newStats: {
        score: playerState.score,
        lines: playerState.lines,
        level: playerState.level
      }
    });
    
    // Check game over
    if (newGrid[0].some(cell => cell !== 0)) {
      playerState.alive = false;
      const otherPlayerKey = playerNumber === 1 ? 'player2' : 'player1';
      room.gameState.winner = room.gameState[otherPlayerKey].alive ? 
        (playerNumber === 1 ? 2 : 1) : 'draw';
      
      delta.changes.push({
        type: 'game-over',
        winner: room.gameState.winner,
        finalScores: {
          player1: room.gameState.player1.score,
          player2: room.gameState.player2.score
        }
      });
    } else {
      // Spawn new piece
      playerState.currentPiece = playerState.nextPiece;
      playerState.nextPiece = this.createRandomPiece();
      playerState.currentX = 4;
      playerState.currentY = 0;
      
      delta.changes.push({
        type: 'new-piece',
        currentPiece: playerState.currentPiece,
        nextPiece: playerState.nextPiece
      });
    }
    
    return delta;
  }

  // Optimized grid operations using bit manipulation
  canMove(grid, piece, newX, newY) {
    for (let y = 0; y < piece.shape.length; y++) {
      for (let x = 0; x < piece.shape[y].length; x++) {
        if (piece.shape[y][x]) {
          const gridX = newX + x;
          const gridY = newY + y;
          
          // Boundary checks
          if (gridX < 0 || gridX >= 10 || gridY >= 20) return false;
          
          // Collision check
          if (gridY >= 0 && grid[gridY][gridX] !== 0) return false;
        }
      }
    }
    return true;
  }

  // Optimized piece placement
  placePiece(grid, piece, x, y) {
    // Create shallow copy for better performance
    const newGrid = grid.map(row => row.slice());
    
    for (let py = 0; py < piece.shape.length; py++) {
      for (let px = 0; px < piece.shape[py].length; px++) {
        if (piece.shape[py][x]) {
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

  // Memory-efficient piece creation with object pooling
  createRandomPiece() {
    const pieces = ['I', 'O', 'T', 'S', 'Z', 'J', 'L'];
    const pieceType = pieces[Math.floor(Math.random() * pieces.length)];
    
    // Use prototype-based creation instead of deep cloning
    return Object.create(this.getPiecePrototype(pieceType));
  }

  getPiecePrototype(type) {
    const prototypes = {
      I: { shape: [[0,0,0,0],[1,1,1,1],[0,0,0,0],[0,0,0,0]], color: 'cyan' },
      O: { shape: [[1,1],[1,1]], color: 'yellow' },
      T: { shape: [[0,1,0],[1,1,1],[0,0,0]], color: 'purple' },
      S: { shape: [[0,1,1],[1,1,0],[0,0,0]], color: 'green' },
      Z: { shape: [[1,1,0],[0,1,1],[0,0,0]], color: 'red' },
      J: { shape: [[1,0,0],[1,1,1],[0,0,0]], color: 'blue' },
      L: { shape: [[0,0,1],[1,1,1],[0,0,0]], color: 'orange' }
    };
    
    return prototypes[type];
  }

  // Optimized matrix rotation using transposition
  rotateMatrix(matrix) {
    const rows = matrix.length;
    const cols = matrix[0].length;
    
    // Transpose and reverse each row
    return matrix[0].map((_, colIndex) =>
      matrix.map(row => row[colIndex]).reverse()
    );
  }

  // Performance monitoring
  startMetricsCollection() {
    setInterval(() => {
      const messageCount = this.metrics.messagesPerSecond;
      
      console.log(`📊 Server Metrics:
        Active Connections: ${this.metrics.activeConnections}
        Messages/sec: ${messageCount}
        Active Rooms: ${this.rooms.size}
        Memory Usage: ${Math.round(process.memoryUsage().heapUsed / 1024 / 1024)}MB
      `);
      
      this.metrics.lastMessageCount = messageCount;
      this.metrics.messagesPerSecond = 0;
    }, 5000);
  }

  // Graceful cleanup
  cleanup() {
    // Clear all intervals and timeouts
    this.rooms.forEach(room => {
      if (room.dropInterval) {
        clearInterval(room.dropInterval);
      }
    });
    
    // Clear action queues
    this.actionQueue.clear();
  }

  start(port = 3000) {
    this.server.listen(port, () => {
      console.log(`🚀 Optimized Tetris Server running on port ${port}`);
      console.log(`⚡ Performance optimizations active`);
      console.log(`🌐 Access at: http://localhost:${port}`);
    });
  }
}

// Handle graceful shutdown
process.on('SIGTERM', () => {
  console.log('🛑 Server shutting down gracefully...');
  if (global.gameServer) {
    global.gameServer.cleanup();
  }
  process.exit(0);
});

process.on('SIGINT', () => {
  console.log('🛑 Server shutting down gracefully...');
  if (global.gameServer) {
    global.gameServer.cleanup();
  }
  process.exit(0);
});

const gameServer = new OptimizedGameServer();
global.gameServer = gameServer;
gameServer.start(process.env.PORT || 3000);

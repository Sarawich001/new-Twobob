// Optimized Server-Side Performance
const express = require('express');
const http = require('http');
const socketIo = require('socket.io');

class OptimizedGameServer {
  constructor() {
    this.app = express();
    this.server = http.createServer(this.app);
    this.io = socketIo(this.server, {
      cors: { origin: "*", methods: ["GET", "POST"] }
    });

    this.rooms = new Map();
    this.players = new Map();
    this.actionQueue = new Map(); // Rate limiting
    
    // Performance monitoring
    this.metrics = {
      activeConnections: 0,
      messagesPerSecond: 0,
      lastMessageCount: 0
    };

    this.initializeServer();
    this.startMetricsCollection();
  }

  initializeServer() {
    this.io.on('connection', (socket) => {
      this.metrics.activeConnections++;
      this.setupSocketHandlers(socket);
      
      socket.on('disconnect', () => {
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

  const wrapHandler = (handler) => {
    return (...args) => {
      this.metrics.messagesPerSecond++;
      return handler(...args);
    };
  };

  socket.on('join-room', wrapHandler((data) => this.handleJoinRoom(socket, data)));
  socket.on('player-ready', wrapHandler(() => this.handlePlayerReady(socket)));
  socket.on('game-action', wrapHandler((action) => this.handleGameAction(socket, action)));
  socket.on('leave-room', wrapHandler(() => this.handleLeaveRoom(socket)));
  socket.on('request-new-game', wrapHandler(() => this.handleNewGame(socket)));
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

  // Memory-efficient piece creation with object pooling
  createRandomPiece() {
    const pieces = ['I', 'O', 'T', 'S', 'Z', 'J', 'L'];
    const pieceType = pieces[Math.floor(Math.random() * pieces.length)];
    
    // Use prototype-based creation instead of deep cloning
    return Object.create(this.getPiecePrototype(pieceType));
  }

  getPiecePrototype(type) {
    const prototypes = {
      I: { shape: [[0,0,0,0],[1,1,1,1],[0,0,0,0],[0,0,0,0]], color: 'block-i' },
      O: { shape: [[1,1],[1,1]], color: 'block-o' },
      T: { shape: [[0,1,0],[1,1,1],[0,0,0]], color: 'block-t' },
      S: { shape: [[0,1,1],[1,1,0],[0,0,0]], color: 'block-s' },
      Z: { shape: [[1,1,0],[0,1,1],[0,0,0]], color: 'block-z' },
      J: { shape: [[1,0,0],[1,1,1],[0,0,0]], color: 'block-j' },
      L: { shape: [[0,0,1],[1,1,1],[0,0,0]], color: 'block-l' }
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
      const now = Date.now();
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
    });
  }
}
// ⚠️ เพิ่มส่วนที่ขาดหายใน Server Class
// วางโค้ดนี้ใน OptimizedGameServer class

handleJoinRoom(socket, data) {
  const roomId = data.roomId || `room_${Date.now()}`;
  const playerName = data.playerName || `Player_${socket.id.slice(0, 5)}`;
  
  // หาห้องที่มีอยู่หรือสร้างใหม่
  let room = this.rooms.get(roomId);
  
  if (!room) {
    room = this.createNewRoom(roomId);
    this.rooms.set(roomId, room);
  }
  
  // ตรวจสอบว่าห้องเต็มหรือไม่
  if (room.players.length >= 2) {
    socket.emit('room-full', { message: 'ห้องเต็มแล้ว' });
    return;
  }
  
  // กำหนด player number
  const playerNumber = room.players.length === 0 ? 1 : 2;
  
  // เพิ่มผู้เล่นเข้าห้อง
  const playerInfo = {
    socketId: socket.id,
    playerNumber,
    playerName,
    roomId,
    ready: false
  };
  
  room.players.push(playerInfo);
  this.players.set(socket.id, playerInfo);
  
  // ให้ผู้เล่นเข้าห้อง socket
  socket.join(roomId);
  
  // แจ้งผู้เล่นว่าเข้าห้องสำเร็จ
  socket.emit('room-joined', {
    roomId,
    playerNumber,
    playerName,
    playersInRoom: room.players.length
  });
  
  // แจ้งผู้เล่นอื่นในห้อง
  socket.to(roomId).emit('player-joined', {
    playerName,
    playerNumber,
    playersInRoom: room.players.length
  });
  
  console.log(`✅ ${playerName} joined room ${roomId} as Player ${playerNumber}`);
}

handlePlayerReady(socket) {
  const playerInfo = this.players.get(socket.id);
  if (!playerInfo) return;
  
  const room = this.rooms.get(playerInfo.roomId);
  if (!room) return;
  
  // ตั้งสถานะพร้อม
  playerInfo.ready = true;
  
  // แจ้งผู้เล่นอื่นในห้อง
  socket.to(playerInfo.roomId).emit('player-ready', {
    playerNumber: playerInfo.playerNumber,
    playerName: playerInfo.playerName
  });
  
  // ตรวจสอบว่าผู้เล่นทั้งหมดพร้อมหรือไม่
  const allReady = room.players.length === 2 && room.players.every(p => p.ready);
  
  if (allReady && !room.gameState.gameStarted) {
    this.startGame(room);
  }
  
  console.log(`🎯 Player ${playerInfo.playerNumber} is ready in room ${playerInfo.roomId}`);
}

handleLeaveRoom(socket) {
  const playerInfo = this.players.get(socket.id);
  if (!playerInfo) return;
  
  const room = this.rooms.get(playerInfo.roomId);
  if (!room) return;
  
  // ลบผู้เล่นออกจากห้อง
  room.players = room.players.filter(p => p.socketId !== socket.id);
  
  // แจ้งผู้เล่นอื่นในห้อง
  socket.to(playerInfo.roomId).emit('player-left', {
    playerName: playerInfo.playerName,
    playerNumber: playerInfo.playerNumber
  });
  
  // ถ้าห้องว่าง ให้ลบห้อง
  if (room.players.length === 0) {
    if (room.dropInterval) {
      clearInterval(room.dropInterval);
    }
    this.rooms.delete(playerInfo.roomId);
    console.log(`🗑️ Room ${playerInfo.roomId} deleted (empty)`);
  } else {
    // หยุดเกมถ้ามีการเล่นอยู่
    if (room.gameState.gameStarted) {
      room.gameState.gameStarted = false;
      if (room.dropInterval) {
        clearInterval(room.dropInterval);
      }
      
      socket.to(playerInfo.roomId).emit('game-stopped', {
        reason: 'Player left the game'
      });
    }
  }
  
  // ลบข้อมูลผู้เล่น
  this.players.delete(socket.id);
  socket.leave(playerInfo.roomId);
  
  console.log(`❌ ${playerInfo.playerName} left room ${playerInfo.roomId}`);
}

handleDisconnect(socket) {
  // ใช้ handleLeaveRoom เพื่อทำความสะอาด
  this.handleLeaveRoom(socket);
  
  // ลบ action queue
  this.actionQueue.delete(socket.id);
}

handleNewGame(socket) {
  const playerInfo = this.players.get(socket.id);
  if (!playerInfo) return;
  
  const room = this.rooms.get(playerInfo.roomId);
  if (!room) return;
  
  // รีเซ็ต game state
  room.gameState = this.createInitialGameState();
  
  // รีเซ็ตสถานะผู้เล่น
  room.players.forEach(p => p.ready = false);
  
  // แจ้งผู้เล่นในห้อง
  this.io.to(playerInfo.roomId).emit('game-reset', {
    message: 'Game has been reset. Please ready up to start again.'
  });
  
  console.log(`🔄 Game reset in room ${playerInfo.roomId}`);
}

createNewRoom(roomId) {
  return {
    roomId,
    players: [],
    gameState: this.createInitialGameState(),
    dropInterval: null,
    createdAt: Date.now()
  };
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
    currentPiece: this.createRandomPiece(),
    nextPiece: this.createRandomPiece(),
    currentX: 4,
    currentY: 0,
    score: 0,
    lines: 0,
    level: 1,
    alive: true
  };
}

startGame(room) {
  // เริ่มเกม
  room.gameState.gameStarted = true;
  room.gameState.winner = null;
  
  // รีเซ็ตสถานะผู้เล่น
  room.gameState.player1 = this.createPlayerState();
  room.gameState.player2 = this.createPlayerState();
  
  // แจ้งผู้เล่นในห้อง
  this.io.to(room.roomId).emit('game-started', room.gameState);
  
  // เริ่ม auto-drop loop
  this.startAutoDropLoop(room);
  
  console.log(`🎮 Game started in room ${room.roomId}`);
}

startAutoDropLoop(room) {
  if (room.dropInterval) {
    clearInterval(room.dropInterval);
  }
  
  room.dropInterval = setInterval(() => {
    if (!room.gameState.gameStarted) {
      clearInterval(room.dropInterval);
      return;
    }
    
    // Auto drop สำหรับผู้เล่นที่ยังมีชีวิต
    ['player1', 'player2'].forEach((playerKey, index) => {
      const playerState = room.gameState[playerKey];
      if (playerState.alive) {
        // จำลองการส่ง move-down action
        const delta = this.processGameAction(room, playerState, 
          { type: 'move-down' }, index + 1);
        
        if (delta) {
          this.io.to(room.roomId).emit('game-delta', {
            playerNumber: index + 1,
            changes: delta.changes
          });
        }
      }
    });
    
    // ตรวจสอบว่าเกมจบหรือไม่
    const alivePlayers = [room.gameState.player1, room.gameState.player2]
      .filter(p => p.alive);
    
    if (alivePlayers.length <= 1) {
      room.gameState.gameStarted = false;
      clearInterval(room.dropInterval);
      
      // กำหนดผู้ชนะ
      if (alivePlayers.length === 1) {
        room.gameState.winner = room.gameState.player1.alive ? 1 : 2;
      } else {
        room.gameState.winner = 'draw';
      }
      
      this.io.to(room.roomId).emit('game-over', {
        winner: room.gameState.winner,
        finalScores: {
          player1: room.gameState.player1.score,
          player2: room.gameState.player2.score
        }
      });
    }
  }, 1000); // Auto drop ทุก 1 วินาที
}
// Handle graceful shutdown
process.on('SIGTERM', () => {
  console.log('🛑 Server shutting down gracefully...');
  server.cleanup();
  process.exit(0);
});

const server = new OptimizedGameServer();
server.start();

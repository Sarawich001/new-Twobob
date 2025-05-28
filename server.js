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
app.use(express.static(path.join(__dirname)));

// Game state
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
      winner: null
    };
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
      ready: false
    };
  }

  addPlayer(socketId, playerName) {
    if (this.players.length >= 2) return false;
    
    const playerNumber = this.players.length + 1;
    this.players.push({
      socketId,
      playerName,
      playerNumber
    });
    
    return playerNumber;
  }

  removePlayer(socketId) {
    this.players = this.players.filter(p => p.socketId !== socketId);
    if (this.players.length === 0) {
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

  // เพิ่มฟังก์ชันสำหรับรีเซ็ตเกม
  resetGame() {
    this.gameState = {
      player1: this.createInitialPlayerState(),
      player2: this.createInitialPlayerState(),
      gameStarted: false,
      winner: null
    };
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
  
  // Add empty lines at top
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

// Socket connections
io.on('connection', (socket) => {
  console.log(`Player connected: ${socket.id}`);

  socket.on('join-room', ({ roomId, playerName }) => {
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
        rooms.set(roomId, new GameRoom(roomId));
      }

      const room = rooms.get(roomId);
      
      if (room.isFull()) {
        socket.emit('room-full');
        return;
      }

      const playerNumber = room.addPlayer(socket.id, playerName);
      socket.join(roomId);
      
      // เก็บ roomId ใน socket เพื่อใช้ในภายหลัง
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
    }
  });

  // แก้ไข request-new-game handler
  socket.on('request-new-game', () => {
    console.log('Player requested new game');
    
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

    // รีเซ็ตเกมสถานะ
    room.resetGame();
    
    // ส่งสัญญาณ reset ไปยังผู้เล่นทั้งหมดในห้อง
    io.to(roomId).emit('game-reset');
    
    console.log(`Game reset for room ${roomId}`);
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
        io.to(playerInfo.roomId).emit('player-left');
      }
    }
    
    // ล้าง roomId จาก socket
    socket.roomId = null;
    players.delete(socket.id);
  });

  socket.on('game-action', (action) => {
    const playerInfo = players.get(socket.id);
    if (!playerInfo) return;

    const room = rooms.get(playerInfo.roomId);
    if (!room || !room.gameState.gameStarted) return;

    const playerKey = `player${playerInfo.playerNumber}`;
    const playerState = room.gameState[playerKey];
    
    if (!playerState.alive) return;

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
            return;
          }
          
          // Spawn new piece
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
        while (canMove(playerState.grid, playerState.currentPiece, playerState.currentX, playerState.currentY + 1)) {
          playerState.currentY++;
          playerState.score += 2;
        }
        updated = true;
        break;
    }

    if (updated) {
      io.to(playerInfo.roomId).emit('game-update', room.gameState);
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
        } else {
          io.to(playerInfo.roomId).emit('player-disconnected', {
            playerNumber: playerInfo.playerNumber
          });
        }
      }
      
      players.delete(socket.id);
    }
    
    // ล้าง roomId จาก socket
    socket.roomId = null;
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`🚀 TwoBob Tactics Server running on port ${PORT}`);
  console.log(`📱 Game URL: http://localhost:${PORT}`);
});
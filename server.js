const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = socketIo(server);

// Serve static files from the public directory
app.use(express.static(path.join(__dirname, 'public')));

// Handle all routes by serving index.html
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Game server logic
const rooms = new Map();
const players = new Map();

io.on('connection', (socket) => {
  console.log('New client connected:', socket.id);

  socket.on('create-room', ({ playerName }) => {
    const roomId = generateRoomId();
    rooms.set(roomId, {
      players: [{
        id: socket.id,
        name: playerName,
        ready: false
      }],
      gameState: null
    });
    
    players.set(socket.id, {
      roomId,
      playerNumber: 1
    });
    
    socket.join(roomId);
    socket.emit('room-joined', { roomId, playerNumber: 1 });
    updateRoomPlayers(roomId);
  });

  socket.on('join-room', ({ roomId, playerName }) => {
    if (!rooms.has(roomId)) {
      return socket.emit('error', 'ห้องไม่พบ');
    }
    
    const room = rooms.get(roomId);
    if (room.players.length >= 2) {
      return socket.emit('error', 'ห้องเต็มแล้ว');
    }
    
    const playerNumber = room.players.length + 1;
    room.players.push({
      id: socket.id,
      name: playerName,
      ready: false
    });
    
    players.set(socket.id, {
      roomId,
      playerNumber
    });
    
    socket.join(roomId);
    socket.emit('room-joined', { roomId, playerNumber });
    updateRoomPlayers(roomId);
    
    // Notify other player
    socket.to(roomId).emit('player-joined');
  });

  socket.on('player-ready', () => {
    const playerInfo = players.get(socket.id);
    if (!playerInfo) return;
    
    const room = rooms.get(playerInfo.roomId);
    const player = room.players.find(p => p.id === socket.id);
    player.ready = true;
    
    socket.emit('player-ready-update', playerInfo.playerNumber);
    socket.to(playerInfo.roomId).emit('player-ready-update', playerInfo.playerNumber);
    
    // Check if both players are ready
    if (room.players.length === 2 && room.players.every(p => p.ready)) {
      startGame(playerInfo.roomId);
    }
  });

  socket.on('disconnect', () => {
    console.log('Client disconnected:', socket.id);
    const playerInfo = players.get(socket.id);
    if (!playerInfo) return;
    
    const roomId = playerInfo.roomId;
    players.delete(socket.id);
    
    if (rooms.has(roomId)) {
      const room = rooms.get(roomId);
      room.players = room.players.filter(p => p.id !== socket.id);
      
      if (room.players.length === 0) {
        rooms.delete(roomId);
      } else {
        // Notify remaining player
        io.to(roomId).emit('player-left');
      }
    }
  });

  // Gameplay events
  socket.on('game-action', (action) => {
    const playerInfo = players.get(socket.id);
    if (!playerInfo || !playerInfo.roomId) return;
    
    const room = rooms.get(playerInfo.roomId);
    if (!room || !room.gameState) return;
    
    // Process game action and update state
    processGameAction(room, playerInfo.playerNumber, action);
    
    // Broadcast updated state
    io.to(playerInfo.roomId).emit('game-state-update', room.gameState);
  });

  function generateRoomId() {
    return Math.random().toString(36).substr(2, 5).toUpperCase();
  }

  function updateRoomPlayers(roomId) {
    const room = rooms.get(roomId);
    io.to(roomId).emit('room-players-update', room.players);
  }

  function startGame(roomId) {
    const room = rooms.get(roomId);
    
    // Initialize game state
    room.gameState = {
      player1: createPlayerState(),
      player2: createPlayerState(),
      gameStarted: true,
      winner: null
    };
    
    io.to(roomId).emit('game-started', room.gameState);
  }

  function createPlayerState() {
    return {
      grid: Array(20).fill().map(() => Array(10).fill(null)),
      currentPiece: generateRandomPiece(),
      nextPiece: generateRandomPiece(),
      currentX: 4,
      currentY: 0,
      score: 0,
      lines: 0,
      level: 1,
      alive: true
    };
  }

  function generateRandomPiece() {
    const pieces = ['i', 'o', 't', 's', 'z', 'j', 'l'];
    const type = pieces[Math.floor(Math.random() * pieces.length)];
    return {
      type,
      shape: getPieceShape(type),
      color: getPieceColor(type)
    };
  }

  function getPieceShape(type) {
    const shapes = {
      i: [[1,1,1,1]],
      o: [[1,1],[1,1]],
      t: [[0,1,0],[1,1,1]],
      s: [[0,1,1],[1,1,0]],
      z: [[1,1,0],[0,1,1]],
      j: [[1,0,0],[1,1,1]],
      l: [[0,0,1],[1,1,1]]
    };
    return shapes[type];
  }

  function getPieceColor(type) {
    const colors = {
      i: 'cyan',
      o: 'yellow',
      t: 'purple',
      s: 'green',
      z: 'red',
      j: 'blue',
      l: 'orange'
    };
    return colors[type];
  }

  function processGameAction(room, playerNumber, action) {
    // Implement game logic here
    // This is a simplified version - actual implementation would be more complex
    const playerKey = `player${playerNumber}`;
    const playerState = room.gameState[playerKey];
    
    if (!playerState || !playerState.alive) return;
    
    switch (action.type) {
      case 'move-left':
        if (isValidMove(playerState, -1, 0)) {
          playerState.currentX--;
        }
        break;
      case 'move-right':
        if (isValidMove(playerState, 1, 0)) {
          playerState.currentX++;
        }
        break;
      case 'move-down':
        if (isValidMove(playerState, 0, 1)) {
          playerState.currentY++;
        } else {
          lockPiece(room, playerNumber);
        }
        break;
      case 'rotate':
        rotatePiece(playerState);
        break;
      case 'hard-drop':
        while (isValidMove(playerState, 0, 1)) {
          playerState.currentY++;
        }
        lockPiece(room, playerNumber);
        break;
    }
  }

  function isValidMove(playerState, deltaX, deltaY) {
    // Simplified collision detection
    const newX = playerState.currentX + deltaX;
    const newY = playerState.currentY + deltaY;
    
    for (let y = 0; y < playerState.currentPiece.shape.length; y++) {
      for (let x = 0; x < playerState.currentPiece.shape[y].length; x++) {
        if (playerState.currentPiece.shape[y][x]) {
          const boardX = newX + x;
          const boardY = newY + y;
          
          if (boardX < 0 || boardX >= 10 || boardY >= 20) {
            return false;
          }
          
          if (boardY >= 0 && playerState.grid[boardY][boardX]) {
            return false;
          }
        }
      }
    }
    
    return true;
  }

  function rotatePiece(playerState) {
    const newShape = [];
    for (let x = 0; x < playerState.currentPiece.shape[0].length; x++) {
      newShape.push([]);
      for (let y = playerState.currentPiece.shape.length - 1; y >= 0; y--) {
        newShape[x].push(playerState.currentPiece.shape[y][x]);
      }
    }
    
    const oldShape = playerState.currentPiece.shape;
    playerState.currentPiece.shape = newShape;
    
    // If rotation causes collision, revert
    if (!isValidMove(playerState, 0, 0)) {
      playerState.currentPiece.shape = oldShape;
    }
  }

  function lockPiece(room, playerNumber) {
    const playerKey = `player${playerNumber}`;
    const playerState = room.gameState[playerKey];
    
    // Add piece to grid
    for (let y = 0; y < playerState.currentPiece.shape.length; y++) {
      for (let x = 0; x < playerState.currentPiece.shape[y].length; x++) {
        if (playerState.currentPiece.shape[y][x]) {
          const boardY = playerState.currentY + y;
          const boardX = playerState.currentX + x;
          
          if (boardY >= 0) {
            playerState.grid[boardY][boardX] = `block-${playerState.currentPiece.type}`;
          }
        }
      }
    }
    
    // Check for completed lines
    const linesCleared = checkLines(playerState);
    if (linesCleared > 0) {
      playerState.score += calculateScore(linesCleared, playerState.level);
      playerState.lines += linesCleared;
      playerState.level = Math.floor(playerState.lines / 10) + 1;
    }
    
    // Check for game over
    if (playerState.currentY <= 0) {
      playerState.alive = false;
      checkGameOver(room);
    }
    
    // Get new piece
    playerState.currentPiece = playerState.nextPiece;
    playerState.nextPiece = generateRandomPiece();
    playerState.currentX = 4;
    playerState.currentY = 0;
  }

  function checkLines(playerState) {
    let linesCleared = 0;
    
    for (let y = playerState.grid.length - 1; y >= 0; y--) {
      if (playerState.grid[y].every(cell => cell)) {
        // Remove line
        playerState.grid.splice(y, 1);
        playerState.grid.unshift(Array(10).fill(null));
        linesCleared++;
        y++; // Check same row again
      }
    }
    
    return linesCleared;
  }

  function calculateScore(lines, level) {
    const points = [0, 40, 100, 300, 1200];
    return points[lines] * level;
  }

  function checkGameOver(room) {
    if (!room.gameState.player1.alive || !room.gameState.player2.alive) {
      room.gameState.gameStarted = false;
      
      let winner = null;
      if (!room.gameState.player1.alive && !room.gameState.player2.alive) {
        winner = 0; // Draw
      } else if (!room.gameState.player1.alive) {
        winner = 2;
      } else {
        winner = 1;
      }
      
      room.gameState.winner = winner;
      io.to(room.id).emit('game-over', {
        winner,
        finalScores: {
          player1: room.gameState.player1.score,
          player2: room.gameState.player2.score
        }
      });
    }
  }
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});

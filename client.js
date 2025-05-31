class OptimizedTetrisClient {
  constructor() {
    this.socket = null;
    this.roomId = null;
    this.playerNumber = null;
    this.gameStarted = false;
    this.gameState = null;
    
    // Canvas contexts
    this.player1Canvas = null;
    this.player2Canvas = null;
    this.player1Ctx = null;
    this.player2Ctx = null;
    
    // Game constants
    this.CELL_SIZE = 20;
    this.GRID_WIDTH = 10;
    this.GRID_HEIGHT = 20;
    
    // Colors
    this.COLORS = {
      'cyan': '#00ffff',
      'yellow': '#ffff00', 
      'purple': '#800080',
      'green': '#00ff00',
      'red': '#ff0000',
      'blue': '#0000ff',
      'orange': '#ffa500'
    };
    
    this.initializeSocket();
    this.setupCanvases();
    this.setupKeyboardHandlers();
  }

  initializeSocket() {
    try {
      // Connect to server
      this.socket = io();
      
      this.socket.on('connect', () => {
        console.log('🟢 Connected to server');
        updateConnectionStatus(true);
        showNotification('เชื่อมต่อเซิร์ฟเวอร์สำเร็จ!', 'success');
      });

      this.socket.on('disconnect', (reason) => {
        console.log('🔴 Disconnected from server:', reason);
        updateConnectionStatus(false);
        showNotification('การเชื่อมต่อขาดหาย', 'error');
      });

      this.socket.on('connect_error', (error) => {
        console.error('❌ Connection error:', error);
        updateConnectionStatus(false);
        showNotification('ไม่สามารถเชื่อมต่อเซิร์ฟเวอร์ได้', 'error');
      });

      // Room events
      this.socket.on('joined-room', (data) => {
        this.roomId = data.roomId;
        this.playerNumber = data.playerNumber;
        document.getElementById('room-id-display').textContent = data.roomId;
        document.getElementById('btn-ready').disabled = false;
        showNotification(`เข้าร่วมห้อง ${data.roomId} สำเร็จ!`, 'success');
      });

      this.socket.on('room-full', () => {
        showNotification('ห้องเต็มแล้ว!', 'error');
        showScreen('menu-screen');
      });

      this.socket.on('player-joined', (data) => {
        this.updatePlayersList(data.players);
      });

      this.socket.on('player-left', (data) => {
        showNotification(`ผู้เล่น ${data.playerNumber} ออกจากห้อง`, 'warning');
      });

      this.socket.on('player-ready', (data) => {
        document.getElementById(`ready-indicator-${data.playerNumber}`).textContent = 
          `Player ${data.playerNumber}: พร้อมเล่น! ✅`;
      });

      // Game events
      this.socket.on('game-started', (gameState) => {
        this.gameState = gameState;
        this.gameStarted = true;
        showScreen('game-screen');
        this.renderGame();
        showNotification('เกมเริ่มแล้ว!', 'success');
      });

      this.socket.on('game-delta', (data) => {
        this.handleGameDelta(data);
      });

      this.socket.on('auto-drop', (data) => {
        this.handleAutoDrop(data);
      });

      this.socket.on('game-reset', () => {
        this.gameStarted = false;
        showScreen('waiting-screen');
        document.getElementById('btn-ready').disabled = false;
        showNotification('เกมถูกรีเซ็ตแล้ว', 'info');
      });

      this.socket.on('rate-limited', () => {
        console.warn('⚠️ Rate limited');
      });

      this.socket.on('room-closed', (data) => {
        showNotification(`ห้องถูกปิด: ${data.reason}`, 'warning');
        showScreen('menu-screen');
      });

      // Health check
      this.socket.on('pong', () => {
        // Connection is alive
      });

      // Send ping every 30 seconds
      setInterval(() => {
        if (this.socket && this.socket.connected) {
          this.socket.emit('ping');
        }
      }, 30000);

    } catch (error) {
      console.error('❌ Socket initialization failed:', error);
      updateConnectionStatus(false);
    }
  }

  setupCanvases() {
    this.player1Canvas = document.getElementById('player1-board');
    this.player2Canvas = document.getElementById('player2-board');
    
    if (this.player1Canvas && this.player2Canvas) {
      this.player1Ctx = this.player1Canvas.getContext('2d');
      this.player2Ctx = this.player2Canvas.getContext('2d');
      
      // Set canvas styles
      this.player1Ctx.imageSmoothingEnabled = false;
      this.player2Ctx.imageSmoothingEnabled = false;
    }
  }

  setupKeyboardHandlers() {
    document.addEventListener('keydown', (e) => {
      this.handleKeyPress(e);
    });
  }

  handleKeyPress(e) {
    if (!this.gameStarted || !this.socket || !this.socket.connected) return;
    
    const keyActions = {
      'ArrowLeft': 'move-left',
      'ArrowRight': 'move-right', 
      'ArrowDown': 'move-down',
      'ArrowUp': 'rotate',
      ' ': 'hard-drop' // Spacebar
    };
    
    const action = keyActions[e.key];
    if (action) {
      e.preventDefault();
      this.socket.emit('game-action', { type: action });
    }
  }

  joinRoom(roomId = null) {
    if (!this.socket || !this.socket.connected) {
      showNotification('ไม่ได้เชื่อมต่อกับเซิร์ฟเวอร์', 'error');
      return;
    }
    
    this.socket.emit('join-room', { roomId });
  }

  playerReady() {
    if (!this.socket || !this.socket.connected) {
      showNotification('ไม่ได้เชื่อมต่อกับเซิร์ฟเวอร์', 'error');
      return;
    }
    
    this.socket.emit('player-ready');
  }

  updatePlayersList(players) {
    const playersList = document.getElementById('players-list');
    playersList.innerHTML = '';
    
    players.forEach(player => {
      const li = document.createElement('li');
      li.textContent = `Player ${player.playerNumber}`;
      if (player.playerNumber === this.playerNumber) {
        li.classList.add('current-player');
        li.textContent += ' (คุณ)';
      }
      if (player.ready) {
        li.textContent += ' - พร้อมเล่น ✅';
      }
      playersList.appendChild(li);
    });
  }

  handleGameDelta(data) {
    if (!this.gameState) return;
    
    const playerKey = `player${data.playerNumber}`;
    const playerState = this.gameState[playerKey];
    
    data.changes.forEach(change => {
      switch (change.type) {
        case 'position':
          // Update piece position
          if (data.playerNumber === 1) {
            this.gameState.player1.currentX = change.to.x;
            this.gameState.player1.currentY = change.to.y;
          } else {
            this.gameState.player2.currentX = change.to.x;
            this.gameState.player2.currentY = change.to.y;
          }
          break;
          
        case 'rotation':
          playerState.currentPiece.shape = change.shape;
          break;
          
        case 'hard-drop':
          if (data.playerNumber === 1) {
            this.gameState.player1.currentY = change.newY;
            this.gameState.player1.score += change.scoreGain;
          } else {
            this.gameState.player2.currentY = change.newY;
            this.gameState.player2.score += change.scoreGain;
          }
          break;
          
        case 'piece-placed':
          // Update grid and stats
          if (change.linesCleared && change.linesCleared.length > 0) {
            // Handle line clearing animation
            this.animateLineClearing(data.playerNumber, change.linesCleared);
          }
          
          playerState.score = change.newStats.score;
          playerState.lines = change.newStats.lines;
          playerState.level = change.newStats.level;
          
          this.updatePlayerStats(data.playerNumber, change.newStats);
          break;
          
        case 'new-piece':
          playerState.currentPiece = change.currentPiece;
          playerState.nextPiece = change.nextPiece;
          if (data.playerNumber === 1) {
            this.gameState.player1.currentX = 4;
            this.gameState.player1.currentY = 0;
          } else {
            this.gameState.player2.currentX = 4;
            this.gameState.player2.currentY = 0;
          }
          this.updateNextPiecePreview(data.playerNumber, change.nextPiece);
          break;
          
        case 'game-over':
          this.handleGameOver(change);
          return;
      }
    });
    
    this.renderGame();
  }

  handleAutoDrop(data) {
    if (!this.gameState) return;
    
    this.gameState.player1.currentX = data.player1.x;
    this.gameState.player1.currentY = data.player1.y;
    this.gameState.player2.currentX = data.player2.x;
    this.gameState.player2.currentY = data.player2.y;
    
    this.renderGame();
  }

  renderGame() {
    if (!this.gameState || !this.player1Ctx || !this.player2Ctx) return;
    
    // Clear canvases
    this.player1Ctx.clearRect(0, 0, this.player1Canvas.width, this.player1Canvas.height);
    this.player2Ctx.clearRect(0, 0, this.player2Canvas.width, this.player2Canvas.height);
    
    // Render grids
    this.renderGrid(this.player1Ctx, this.gameState.player1);
    this.renderGrid(this.player2Ctx, this.gameState.player2);
    
    // Highlight current player
    if (this.playerNumber === 1) {
      this.player1Canvas.classList.add('current-player');
      this.player2Canvas.classList.remove('current-player');
    } else {
      this.player2Canvas.classList.add('current-player');
      this.player1Canvas.classList.remove('current-player');
    }
  }

  renderGrid(ctx, playerState) {
    const cellSize = this.CELL_SIZE;
    
    // Draw grid background
    ctx.strokeStyle = '#333';
    for (let x = 0; x <= this.GRID_WIDTH; x++) {
      ctx.beginPath();
      ctx.moveTo(x * cellSize, 0);
      ctx.lineTo(x * cellSize, this.GRID_HEIGHT * cellSize);
      ctx.stroke();
    }
    for (let y = 0; y <= this.GRID_HEIGHT; y++) {
      ctx.beginPath();
      ctx.moveTo(0, y * cellSize);
      ctx.lineTo(this.GRID_WIDTH * cellSize, y * cellSize);
      ctx.stroke();
    }
    
    // Draw placed pieces
    for (let y = 0; y < this.GRID_HEIGHT; y++) {
      for (let x = 0; x < this.GRID_WIDTH; x++) {
        if (playerState.grid[y][x] !== 0) {
          const color = this.getColorFromValue(playerState.grid[y][x]);
          this.drawCell(ctx, x, y, color, cellSize);
        }
      }
    }
    
    // Draw current piece
    if (playerState.currentPiece && playerState.alive) {
      this.drawPiece(
        ctx, 
        playerState.currentPiece,
        playerState.currentX,
        playerState.currentY,
        cellSize
      );
    }
  }

  drawCell(ctx, x, y, color, cellSize) {
    ctx.fillStyle = color;
    ctx.fillRect(x * cellSize, y * cellSize, cellSize, cellSize);
    
    // Add border
    ctx.strokeStyle = '#000';
    ctx.strokeRect(x * cellSize, y * cellSize, cellSize, cellSize);
  }

  drawPiece(ctx, piece, startX, startY, cellSize) {
    if (!piece || !piece.shape) return;
    
    const color = this.COLORS[piece.color] || '#fff';
    
    for (let y = 0; y < piece.shape.length; y++) {
      for (let x = 0; x < piece.shape[y].length; x++) {
        if (piece.shape[y][x]) {
          this.drawCell(ctx, startX + x, startY + y, color, cellSize);
        }
      }
    }
  }

  getColorFromValue(value) {
    const colorMap = {
      'cyan': '#00ffff',
      'yellow': '#ffff00',
      'purple': '#800080', 
      'green': '#00ff00',
      'red': '#ff0000',
      'blue': '#0000ff',
      'orange': '#ffa500'
    };
    
    return colorMap[value] || '#ffffff';
  }

  updatePlayerStats(playerNumber, stats) {
    const statsElement = document.getElementById(`player${playerNumber}-stats`);
    if (!statsElement) return;
    
    statsElement.querySelector('.score-value').textContent = stats.score;
    statsElement.querySelector('.lines-value').textContent = stats.lines;
    statsElement.querySelector('.level-value').textContent = stats.level;
  }

  updateNextPiecePreview(playerNumber, nextPiece) {
    const previewElement = document.getElementById(`player${playerNumber}-next`);
    if (!previewElement || !nextPiece) return;
    
    previewElement.innerHTML = '';
    
    // Create 4x4 grid for preview
    for (let y = 0; y < 4; y++) {
      for (let x = 0; x < 4; x++) {
        const cell = document.createElement('div');
        cell.className = 'preview-cell';
        
        if (nextPiece.shape[y] && nextPiece.shape[y][x]) {
          cell.style.backgroundColor = this.COLORS[nextPiece.color] || '#fff';
        }
        
        previewElement.appendChild(cell);
      }
    }
  }

  animateLineClearing(playerNumber, clearedLines) {
    // Simple line clearing animation
    const canvas = playerNumber === 1 ? this.player1Canvas : this.player2Canvas;
    const ctx = playerNumber === 1 ? this.player1Ctx : this.player2Ctx;
    
    // Flash effect
    canvas.style.filter = 'brightness(1.5)';
    setTimeout(() => {
      canvas.style.filter = 'brightness(1)';
    }, 200);
  }

  handleGameOver(gameOverData) {
    this.gameStarted = false;
    
    // Update final scores
    document.getElementById('final-score-p1').textContent = gameOverData.finalScores.player1;
    document.getElementById('final-score-p2').textContent = gameOverData.finalScores.player2;
    
    // Update winner message
    const winnerMessage = document.getElementById('winner-message');
    if (gameOverData.winner === 'draw') {
      winnerMessage.textContent = '🤝 เสมอกัน!';
    } else if (gameOverData.winner === this.playerNumber) {
      winnerMessage.textContent = '🎉 คุณชนะ!';
    } else {
      winnerMessage.textContent = '😢 คุณแพ้!';
    }
    
    showScreen('game-over-screen');
    showNotification('เกมจบแล้ว!', 'info');
  }

  // Cleanup
  disconnect() {
    if (this.socket) {
      this.socket.disconnect();
    }
  }
}

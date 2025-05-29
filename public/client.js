// Optimized Tetris Client with Performance Improvements
class OptimizedTetrisClient {
  constructor() {
    this.socket = null;
    this.roomId = null;
    this.playerNumber = null;
    this.playerName = '';
    this.gameState = null;
    this.dropInterval = null;
    this.connected = false;
    
    this.TILE_SIZE = 28;
    
    // Performance optimizations
    this.lastFrameTime = 0;
    this.targetFPS = 60;
    this.frameTime = 1000 / this.targetFPS;
    this.animationFrameId = null;
    
    // Input optimization
    this.keyStates = {};
    this.lastKeyTime = {};
    this.keyRepeatDelay = 150; // ms before key repeat starts
    this.keyRepeatRate = 50;   // ms between key repeats
    
    // Rendering optimization
    this.canvasCache = new Map();
    this.needsRedraw = { player1: true, player2: true };
    this.previousGameState = null;
    
    // DOM element cache
    this.cachedElements = {};
    
    this.initializeSocket();
    this.setupEventListeners();
    this.createNotificationSystem();
    this.initializeRenderingOptimizations();
    
    // Show connection status
    this.updateConnectionStatus(false);
  }

  // Cache frequently accessed DOM elements
  cacheElement(id) {
    if (!this.cachedElements[id]) {
      this.cachedElements[id] = document.getElementById(id);
    }
    return this.cachedElements[id];
  }

  // Initialize rendering optimizations
  initializeRenderingOptimizations() {
    // Pre-create block elements for object pooling
    this.blockPool = [];
    this.poolSize = 200; // Adjust based on needs
    
    for (let i = 0; i < this.poolSize; i++) {
      const block = document.createElement('div');
      block.className = 'tetris-block';
      block.style.position = 'absolute';
      block.style.width = this.TILE_SIZE + 'px';
      block.style.height = this.TILE_SIZE + 'px';
      block.style.display = 'none';
      this.blockPool.push(block);
    }
  }

  // Object pooling for blocks
  getBlockFromPool() {
    for (let block of this.blockPool) {
      if (block.style.display === 'none') {
        return block;
      }
    }
    // If pool is exhausted, create new block
    const block = document.createElement('div');
    block.className = 'tetris-block';
    block.style.position = 'absolute';
    block.style.width = this.TILE_SIZE + 'px';
    block.style.height = this.TILE_SIZE + 'px';
    this.blockPool.push(block);
    return block;
  }

  // Return block to pool
  returnBlockToPool(block) {
    block.style.display = 'none';
    block.className = 'tetris-block';
    if (block.parentNode) {
      block.parentNode.removeChild(block);
    }
  }

  createNotificationSystem() {
    if (!document.getElementById('notification-container')) {
      const container = document.createElement('div');
      container.id = 'notification-container';
      container.style.cssText = `
        position: fixed;
        top: 20px;
        right: 20px;
        z-index: 1000;
        display: flex;
        flex-direction: column;
        gap: 10px;
      `;
      document.body.appendChild(container);
    }
  }

  // Optimized notification with reduced DOM manipulation
  showNotification(message, type = 'info') {
    const notification = document.createElement('div');
    notification.style.cssText = `
      background: ${type === 'error' ? 'rgba(244, 67, 54, 0.9)' : 'rgba(76, 175, 80, 0.9)'};
      color: white;
      padding: 15px 20px;
      border-radius: 10px;
      backdrop-filter: blur(10px);
      box-shadow: 0 4px 15px rgba(0,0,0,0.2);
      font-weight: bold;
      max-width: 300px;
      word-wrap: break-word;
      transform: translateX(100%);
      transition: transform 0.3s ease;
      will-change: transform;
    `;
    notification.textContent = message;
    
    const container = this.cacheElement('notification-container');
    container.appendChild(notification);
    
    // Use requestAnimationFrame for smooth animations
    requestAnimationFrame(() => {
      notification.style.transform = 'translateX(0)';
    });
    
    // Auto remove with cleanup
    setTimeout(() => {
      notification.style.transform = 'translateX(100%)';
      setTimeout(() => {
        if (notification.parentNode) {
          notification.parentNode.removeChild(notification);
        }
      }, 300);
    }, 3000);
  }

  initializeSocket() {
    this.socket = io();
    
    this.socket.on('connect', () => {
      console.log('Connected to server');
      this.connected = true;
      this.updateConnectionStatus(true);
      this.showNotification('เชื่อมต่อเซิร์ฟเวอร์สำเร็จ');
    });

    this.socket.on('disconnect', () => {
      console.log('Disconnected from server');
      this.connected = false;
      this.updateConnectionStatus(false);
      this.showScreen('connection-screen');
      this.showNotification('การเชื่อมต่อขาดหาย', 'error');
    });

    // ... (other socket events remain the same but with optimized calls)
    
    this.socket.on('game-update', (gameState) => {
      // Only update if game state actually changed
      if (this.hasGameStateChanged(gameState)) {
        this.gameState = gameState;
        this.scheduleRender();
      }
    });
  }

  // Check if game state has meaningful changes
  hasGameStateChanged(newState) {
    if (!this.previousGameState) return true;
    
    // Deep comparison of relevant game state parts
    const player1Changed = this.hasPlayerStateChanged(
      this.previousGameState.player1, 
      newState.player1
    );
    const player2Changed = this.hasPlayerStateChanged(
      this.previousGameState.player2, 
      newState.player2
    );
    
    if (player1Changed) this.needsRedraw.player1 = true;
    if (player2Changed) this.needsRedraw.player2 = true;
    
    return player1Changed || player2Changed;
  }

  hasPlayerStateChanged(oldState, newState) {
    if (!oldState || !newState) return true;
    
    return oldState.score !== newState.score ||
           oldState.lines !== newState.lines ||
           oldState.level !== newState.level ||
           oldState.alive !== newState.alive ||
           oldState.currentX !== newState.currentX ||
           oldState.currentY !== newState.currentY ||
           JSON.stringify(oldState.grid) !== JSON.stringify(newState.grid) ||
           JSON.stringify(oldState.currentPiece) !== JSON.stringify(newState.currentPiece);
  }

  // Optimized input handling with key states
  setupEventListeners() {
    // Menu buttons (unchanged)
    this.cacheElement('btn-create-room').addEventListener('click', () => {
      this.showScreen('create-room-screen');
    });

    this.cacheElement('btn-join-room').addEventListener('click', () => {
      this.showScreen('join-room-screen');
    });

    // Optimized keyboard controls with key state tracking
    document.addEventListener('keydown', (e) => {
      this.handleKeyDown(e);
    });

    document.addEventListener('keyup', (e) => {
      this.handleKeyUp(e);
    });

    // ... (other event listeners)
  }

  handleKeyDown(event) {
    const key = event.key;
    const now = Date.now();
    
    // Prevent default for game keys
    if (['ArrowLeft', 'ArrowRight', 'ArrowDown', 'ArrowUp', ' '].includes(key)) {
      event.preventDefault();
    }
    
    if (!this.gameState || !this.gameState.gameStarted) return;
    
    const playerState = this.gameState[`player${this.playerNumber}`];
    if (!playerState || !playerState.alive) return;

    // Handle key repeat logic
    if (this.keyStates[key]) {
      if (now - this.lastKeyTime[key] < this.keyRepeatRate) {
        return; // Too soon for repeat
      }
    } else {
      this.keyStates[key] = true;
      this.lastKeyTime[key] = now;
    }

    this.processKeyAction(key);
    this.lastKeyTime[key] = now;
  }

  handleKeyUp(event) {
    this.keyStates[event.key] = false;
  }

  processKeyAction(key) {
    const actionMap = {
      'ArrowLeft': 'move-left',
      'ArrowRight': 'move-right',
      'ArrowDown': 'move-down',
      'ArrowUp': 'rotate',
      ' ': 'hard-drop'
    };

    if (actionMap[key]) {
      this.socket.emit('game-action', { type: actionMap[key] });
    }
  }

  // Optimized game loop with requestAnimationFrame
  startGameLoop() {
    if (this.dropInterval) {
      clearInterval(this.dropInterval);
    }
    
    if (this.animationFrameId) {
      cancelAnimationFrame(this.animationFrameId);
    }
    
    // Separate drop logic from rendering
    this.dropInterval = setInterval(() => {
      if (this.gameState && this.gameState.gameStarted) {
        const playerState = this.gameState[`player${this.playerNumber}`];
        if (playerState && playerState.alive) {
          this.socket.emit('game-action', { type: 'move-down' });
        }
      }
    }, 1000);
    
    // Start render loop
    this.renderLoop();
  }

  renderLoop(currentTime = 0) {
    const deltaTime = currentTime - this.lastFrameTime;
    
    if (deltaTime >= this.frameTime) {
      this.updateGameDisplay();
      this.lastFrameTime = currentTime - (deltaTime % this.frameTime);
    }
    
    this.animationFrameId = requestAnimationFrame((time) => this.renderLoop(time));
  }

  scheduleRender() {
    if (!this.animationFrameId) {
      this.animationFrameId = requestAnimationFrame(() => this.renderLoop());
    }
  }

  // Optimized game display update with selective rendering
  updateGameDisplay() {
    if (!this.gameState) return;

    // Only redraw what needs to be redrawn
    if (this.needsRedraw.player1) {
      this.drawPlayerBoard('player1-board', this.gameState.player1, 1);
      this.updatePlayerStats('player1-stats', this.gameState.player1);
      this.needsRedraw.player1 = false;
    }

    if (this.needsRedraw.player2) {
      this.drawPlayerBoard('player2-board', this.gameState.player2, 2);
      this.updatePlayerStats('player2-stats', this.gameState.player2);
      this.needsRedraw.player2 = false;
    }

    // Update current player highlight (less frequent)
    this.updateCurrentPlayerHighlight();
    
    // Store previous state for comparison
    this.previousGameState = JSON.parse(JSON.stringify(this.gameState));
  }

  // Optimized board drawing with object pooling
  drawPlayerBoard(boardId, playerState, playerNumber) {
    const boardElement = this.cacheElement(boardId);
    if (!boardElement) return;

    // Return all current blocks to pool
    const currentBlocks = boardElement.querySelectorAll('.tetris-block');
    currentBlocks.forEach(block => this.returnBlockToPool(block));

    // Draw placed blocks
    for (let row = 0; row < 20; row++) {
      for (let col = 0; col < 10; col++) {
        if (playerState.grid[row][col]) {
          const block = this.getBlockFromPool();
          block.className = `tetris-block ${playerState.grid[row][col]}`;
          block.style.left = (col * this.TILE_SIZE) + 'px';
          block.style.top = (row * this.TILE_SIZE) + 'px';
          block.style.display = 'block';
          block.style.opacity = '1';
          block.style.boxShadow = '';
          boardElement.appendChild(block);
        }
      }
    }

    // Draw current falling piece
    if (playerState.currentPiece && playerState.alive) {
      for (let row = 0; row < playerState.currentPiece.shape.length; row++) {
        for (let col = 0; col < playerState.currentPiece.shape[row].length; col++) {
          if (playerState.currentPiece.shape[row][col]) {
            const block = this.getBlockFromPool();
            block.className = `tetris-block ${playerState.currentPiece.color}`;
            block.style.left = ((playerState.currentX + col) * this.TILE_SIZE) + 'px';
            block.style.top = ((playerState.currentY + row) * this.TILE_SIZE) + 'px';
            block.style.display = 'block';
            block.style.opacity = '0.9';
            block.style.boxShadow = '0 0 10px rgba(255, 255, 255, 0.5)';
            boardElement.appendChild(block);
          }
        }
      }
    }

    // Show "GAME OVER" overlay if player is dead
    if (!playerState.alive) {
      const overlay = document.createElement('div');
      overlay.className = 'game-over-overlay';
      overlay.innerHTML = '<div class="game-over-text">GAME OVER</div>';
      boardElement.appendChild(overlay);
    }
  }

  // Cached stats update to avoid unnecessary DOM queries
  updatePlayerStats(statsId, playerState) {
    const statsElement = this.cacheElement(statsId);
    if (!statsElement) return;

    // Cache stat elements
    if (!statsElement._scoreElement) {
      statsElement._scoreElement = statsElement.querySelector('.score-value');
      statsElement._linesElement = statsElement.querySelector('.lines-value');
      statsElement._levelElement = statsElement.querySelector('.level-value');
    }

    statsElement._scoreElement.textContent = playerState.score;
    statsElement._linesElement.textContent = playerState.lines;
    statsElement._levelElement.textContent = playerState.level;
  }

  updateCurrentPlayerHighlight() {
    // Use cached class list manipulation
    const boards = document.querySelectorAll('.player-board');
    boards.forEach(board => {
      board.classList.remove('current-player');
    });
    
    if (this.playerNumber) {
      const currentBoard = this.cacheElement(`player${this.playerNumber}-board`);
      if (currentBoard) {
        currentBoard.classList.add('current-player');
      }
    }
  }

  // Cleanup method for memory management
  cleanup() {
    // Clear intervals and animation frames
    if (this.dropInterval) {
      clearInterval(this.dropInterval);
      this.dropInterval = null;
    }
    
    if (this.animationFrameId) {
      cancelAnimationFrame(this.animationFrameId);
      this.animationFrameId = null;
    }
    
    // Return all blocks to pool
    this.blockPool.forEach(block => this.returnBlockToPool(block));
    
    // Clear caches
    this.cachedElements = {};
    this.canvasCache.clear();
  }

  // ... (rest of the methods remain similar but with optimizations applied)
  
  endGame(data) {
    this.cleanup();
    
    let message = '';
    if (data.winner === 'draw') {
      message = '🤝 เสมอกัน!';
    } else if (data.winner === this.playerNumber) {
      message = '🎉 คุณชนะ!';
    } else {
      message = '😔 คุณแพ้';
    }

    this.cacheElement('winner-message').textContent = message;
    this.cacheElement('final-score-p1').textContent = data.finalScores.player1;
    this.cacheElement('final-score-p2').textContent = data.finalScores.player2;
    
    const playAgainBtn = this.cacheElement('btn-play-again');
    if (playAgainBtn) {
      playAgainBtn.disabled = false;
      playAgainBtn.textContent = '🔄 เล่นอีกครั้ง';
    }
    
    this.showScreen('game-over-screen');
    this.showNotification(message);
  }
}

// Initialize optimized client when page loads
document.addEventListener('DOMContentLoaded', () => {
  new OptimizedTetrisClient();
});

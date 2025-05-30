// Optimized Client-side game logic
class TetrisClient {
  constructor() {
    this.socket = null;
    this.roomId = null;
    this.playerNumber = null;
    this.playerName = '';
    this.gameState = null;
    this.dropInterval = null;
    this.connected = false;
    
    // Performance optimizations
    this.TILE_SIZE = 28;
    this.renderRequestId = null;
    this.lastRenderTime = 0;
    this.FPS_LIMIT = 60;
    this.FRAME_TIME = 1000 / this.FPS_LIMIT;
    
    // Input throttling
    this.lastInputTime = 0;
    this.INPUT_THROTTLE = 50; // 20 inputs per second max
    this.inputBuffer = [];
    
    // Cache DOM elements
    this.cachedElements = new Map();
    this.boardCache = new Map();
    
    // Pre-create block elements pool
    this.blockPool = [];
    this.MAX_POOL_SIZE = 200;
    this.initializeBlockPool();
    
    // Connection retry logic
    this.reconnectAttempts = 0;
    this.maxReconnectAttempts = 5;
    this.reconnectDelay = 1000;
    
    this.initializeSocket();
    this.setupEventListeners();
    this.createNotificationSystem();
    this.cacheCommonElements();
    
    // Show connection status
    this.updateConnectionStatus(false);
    
    // Start render loop
    this.startRenderLoop();
  }

  // Pre-create block elements for better performance
  initializeBlockPool() {
    for (let i = 0; i < this.MAX_POOL_SIZE; i++) {
      const block = document.createElement('div');
      block.className = 'tetris-block';
      block.style.position = 'absolute';
      block.style.width = this.TILE_SIZE + 'px';
      block.style.height = this.TILE_SIZE + 'px';
      block.style.display = 'none';
      this.blockPool.push(block);
    }
  }

  getBlockFromPool() {
    if (this.blockPool.length > 0) {
      const block = this.blockPool.pop();
      block.style.display = 'block';
      return block;
    }
    
    // Create new block if pool is empty
    const block = document.createElement('div');
    block.className = 'tetris-block';
    block.style.position = 'absolute';
    block.style.width = this.TILE_SIZE + 'px';
    block.style.height = this.TILE_SIZE + 'px';
    return block;
  }

  returnBlockToPool(block) {
    if (this.blockPool.length < this.MAX_POOL_SIZE) {
      block.style.display = 'none';
      block.className = 'tetris-block';
      block.style.opacity = '';
      block.style.boxShadow = '';
      this.blockPool.push(block);
    }
  }

  // Cache frequently accessed DOM elements
  cacheCommonElements() {
    const elementsToCache = [
      'player1-board', 'player2-board',
      'player1-stats', 'player2-stats',
      'connection-status', 'notification-container',
      'btn-ready', 'room-id-display', 'players-list'
    ];
    
    elementsToCache.forEach(id => {
      const element = document.getElementById(id);
      if (element) {
        this.cachedElements.set(id, element);
      }
    });
  }

  getCachedElement(id) {
    if (this.cachedElements.has(id)) {
      return this.cachedElements.get(id);
    }
    
    const element = document.getElementById(id);
    if (element) {
      this.cachedElements.set(id, element);
    }
    return element;
  }

  // Optimized render loop with frame limiting
  startRenderLoop() {
    const render = (currentTime) => {
      if (currentTime - this.lastRenderTime >= this.FRAME_TIME) {
        this.processInputBuffer();
        if (this.gameState) {
          this.updateGameDisplay();
        }
        this.lastRenderTime = currentTime;
      }
      this.renderRequestId = requestAnimationFrame(render);
    };
    
    this.renderRequestId = requestAnimationFrame(render);
  }

  // Input buffering and throttling
  processInputBuffer() {
    const now = Date.now();
    if (now - this.lastInputTime < this.INPUT_THROTTLE) {
      return;
    }
    
    if (this.inputBuffer.length > 0) {
      // Process only the latest input of each type
      const latestInputs = new Map();
      
      this.inputBuffer.forEach(input => {
        latestInputs.set(input.type, input);
      });
      
      latestInputs.forEach(input => {
        if (this.socket && this.connected) {
          this.socket.emit('game-action', input);
        }
      });
      
      this.inputBuffer = [];
      this.lastInputTime = now;
    }
  }

  queueInput(actionType) {
    // Don't queue duplicate actions
    const existingIndex = this.inputBuffer.findIndex(input => input.type === actionType);
    if (existingIndex !== -1) {
      return; // Input already queued
    }
    
    this.inputBuffer.push({ type: actionType });
  }

  createNotificationSystem() {
    // Create notification container if it doesn't exist
    if (!this.getCachedElement('notification-container')) {
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
        pointer-events: none;
      `;
      document.body.appendChild(container);
      this.cachedElements.set('notification-container', container);
    }
  }

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
      pointer-events: auto;
    `;
    notification.textContent = message;
    
    const container = this.getCachedElement('notification-container');
    if (container) {
      container.appendChild(notification);
      
      // Animate in
      requestAnimationFrame(() => {
        notification.style.transform = 'translateX(0)';
      });
      
      // Auto remove after 3 seconds
      setTimeout(() => {
        notification.style.transform = 'translateX(100%)';
        setTimeout(() => {
          if (notification.parentNode) {
            notification.parentNode.removeChild(notification);
          }
        }, 300);
      }, 3000);
    }
  }

  initializeSocket() {
    this.socket = io({
      transports: ['websocket', 'polling'],
      upgrade: true,
      rememberUpgrade: true,
      timeout: 5000,
      forceNew: false
    });
    
    this.setupSocketHandlers();
  }

  setupSocketHandlers() {
    this.socket.on('connect', () => {
      console.log('Connected to server');
      this.connected = true;
      this.reconnectAttempts = 0;
      this.updateConnectionStatus(true);
      this.showNotification('เชื่อมต่อเซิร์ฟเวอร์สำเร็จ');
    });

    this.socket.on('disconnect', (reason) => {
      console.log('Disconnected from server:', reason);
      this.connected = false;
      this.updateConnectionStatus(false);
      this.showScreen('connection-screen');
      this.showNotification('การเชื่อมต่อขาดหาย', 'error');
      
      // Auto-reconnect logic
      if (reason === 'io server disconnect') {
        // Server disconnected the client, don't auto-reconnect
        return;
      }
      
      this.attemptReconnect();
    });

    this.socket.on('connect_error', (error) => {
      console.error('Connection error:', error);
      this.connected = false;
      this.updateConnectionStatus(false);
      this.attemptReconnect();
    });

    // Game event handlers with error handling
    this.socket.on('joined-room', (data) => {
      try {
        this.roomId = data.roomId;
        this.playerNumber = data.playerNumber;
        this.playerName = data.playerName;
        this.updateRoomInfo(data.roomPlayers);
        this.showScreen('waiting-screen');
        this.showNotification(`เข้าร่วมห้อง ${data.roomId} สำเร็จ`);
      } catch (error) {
        console.error('Error handling joined-room:', error);
      }
    });

    this.socket.on('player-joined', (data) => {
      try {
        this.updateRoomInfo(data.roomPlayers);
        this.showNotification('ผู้เล่นใหม่เข้าร่วม');
      } catch (error) {
        console.error('Error handling player-joined:', error);
      }
    });

    this.socket.on('player-left', () => {
      this.showNotification('ผู้เล่นอีกคนออกจากห้อง', 'error');
      this.showScreen('waiting-screen');
      this.resetReadyState();
    });

    this.socket.on('player-disconnected', (data) => {
      this.showNotification(`ผู้เล่น ${data.playerNumber} หลุดการเชื่อมต่อ`, 'error');
      this.resetReadyState();
    });

    this.socket.on('room-full', () => {
      this.showNotification('ห้องเต็มแล้ว กรุณาลองใหม่อีกครั้ง', 'error');
      this.showScreen('menu-screen');
    });

    this.socket.on('player-ready', (data) => {
      this.updatePlayerReady(data.playerNumber);
    });

    this.socket.on('game-start', (gameState) => {
      this.gameState = gameState;
      this.startGameLoop();
      this.showScreen('game-screen');
      this.showNotification('เกมเริ่มแล้ว!');
    });

    // Optimized game-update handler
    this.socket.on('game-update', (gameState) => {
      // Update state immediately, rendering will be handled by the render loop
      this.gameState = gameState;
    });

    this.socket.on('game-over', (data) => {
      this.endGame(data);
    });

    this.socket.on('game-reset', () => {
      this.gameState = null;
      this.resetReadyState();
      this.showScreen('waiting-screen');
      this.showNotification('🔄 เตรียมตัวสำหรับรอบใหม่!');
    });

    this.socket.on('error', (message) => {
      this.showNotification(message, 'error');
    });
  }

  attemptReconnect() {
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      this.showNotification('ไม่สามารถเชื่อมต่อได้ กรุณารีเฟรชหน้า', 'error');
      return;
    }
    
    this.reconnectAttempts++;
    const delay = this.reconnectDelay * Math.pow(2, this.reconnectAttempts - 1); // Exponential backoff
    
    this.showNotification(`กำลังลองเชื่อมต่อใหม่... (${this.reconnectAttempts}/${this.maxReconnectAttempts})`, 'error');
    
    setTimeout(() => {
      if (!this.connected) {
        this.socket.connect();
      }
    }, delay);
  }

  setupEventListeners() {
    // Menu buttons with debouncing
    this.addClickListener('btn-create-room', () => {
      this.showScreen('create-room-screen');
    });

    this.addClickListener('btn-join-room', () => {
      this.showScreen('join-room-screen');
    });

    // Room creation
    this.addClickListener('btn-confirm-create', () => {
      this.createRoom();
    });

    this.addClickListener('btn-confirm-join', () => {
      this.joinRoom();
    });

    // Game controls
    this.addClickListener('btn-ready', () => {
      this.setReady();
    });

    this.addClickListener('btn-leave-room', () => {
      this.leaveRoom();
    });

    this.addClickListener('btn-play-again', () => {
      this.playAgain();
    });

    // Optimized keyboard controls
    this.setupKeyboardControls();

    // Touch controls for mobile
    this.setupTouchControls();

    // Mobile control buttons
    this.setupMobileButtons();

    // Handle page visibility changes
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) {
        // Pause input processing when tab is not visible
        this.inputBuffer = [];
      }
    });
  }

  addClickListener(elementId, handler, debounceMs = 200) {
    const element = document.getElementById(elementId);
    if (element) {
      let lastClick = 0;
      element.addEventListener('click', (e) => {
        const now = Date.now();
        if (now - lastClick > debounceMs) {
          handler(e);
          lastClick = now;
        }
      });
    }
  }

  setupKeyboardControls() {
    let keysPressed = new Set();
    
    document.addEventListener('keydown', (e) => {
      if (keysPressed.has(e.key)) return; // Prevent key repeat
      keysPressed.add(e.key);
      this.handleKeyPress(e);
    });
    
    document.addEventListener('keyup', (e) => {
      keysPressed.delete(e.key);
    });
  }

  setupMobileButtons() {
    const buttons = document.querySelectorAll('.control-button');
    buttons.forEach((button, index) => {
      // Add touch events for better mobile responsiveness
      ['touchstart', 'click'].forEach(eventType => {
        button.addEventListener(eventType, (e) => {
          e.preventDefault();
          
          if (!this.gameState || !this.gameState.gameStarted) return;
          
          const playerState = this.gameState[`player${this.playerNumber}`];
          if (!playerState || !playerState.alive) return;

          const actions = ['rotate', 'rotate', 'hard-drop', 'move-left', 'move-down', 'move-right'];
          if (actions[index]) {
            this.queueInput(actions[index]);
          }
        }, { passive: false });
      });
    });
  }

  // Generate 5-digit random room code
  generateRoomCode() {
    return Math.floor(10000 + Math.random() * 90000).toString();
  }

  createRoom() {
    const playerName = document.getElementById('create-player-name')?.value.trim();
    if (!playerName) {
      this.showNotification('กรุณาใส่ชื่อผู้เล่น', 'error');
      return;
    }
    
    if (playerName.length > 50) {
      this.showNotification('ชื่อผู้เล่นยาวเกินไป', 'error');
      return;
    }
    
    const roomId = this.generateRoomCode();
    this.joinGameRoom(roomId, playerName);
  }

  joinRoom() {
    const playerName = document.getElementById('join-player-name')?.value.trim();
    const roomId = document.getElementById('join-room-id')?.value.trim();
    
    if (!playerName || !roomId) {
      this.showNotification('กรุณาใส่ข้อมูลให้ครบถ้วน', 'error');
      return;
    }
    
    if (playerName.length > 50) {
      this.showNotification('ชื่อผู้เล่นยาวเกินไป', 'error');
      return;
    }
    
    // Validate room code format (5 digits)
    if (!/^\d{5}$/.test(roomId)) {
      this.showNotification('รหัสห้องต้องเป็นตัวเลข 5 หลัก', 'error');
      return;
    }
    
    this.joinGameRoom(roomId, playerName);
  }

  joinGameRoom(roomId, playerName) {
    if (!this.connected) {
      this.showNotification('ไม่สามารถเชื่อมต่อเซิร์ฟเวอร์ได้', 'error');
      return;
    }
    
    // Sanitize inputs
    const sanitizedRoomId = roomId.replace(/[^0-9]/g, '').substring(0, 5);
    const sanitizedPlayerName = playerName.substring(0, 50);
    
    this.socket.emit('join-room', { 
      roomId: sanitizedRoomId, 
      playerName: sanitizedPlayerName 
    });
  }

  setReady() {
    if (!this.connected) {
      this.showNotification('ไม่ได้เชื่อมต่อเซิร์ฟเวอร์', 'error');
      return;
    }
    
    this.socket.emit('player-ready');
    const readyBtn = this.getCachedElement('btn-ready');
    if (readyBtn) {
      readyBtn.disabled = true;
      readyBtn.textContent = '✅ พร้อมแล้ว';
    }
    this.showNotification('คุณพร้อมเล่นแล้ว');
  }

  resetReadyState() {
    const readyBtn = this.getCachedElement('btn-ready');
    if (readyBtn) {
      readyBtn.disabled = false;
      readyBtn.textContent = '🎮 พร้อมเล่น';
    }
    
    // Reset ready indicators
    for (let i = 1; i <= 2; i++) {
      const indicator = document.getElementById(`ready-indicator-${i}`);
      if (indicator) {
        indicator.textContent = `Player ${i}: รอ...`;
        indicator.style.color = '#666';
        indicator.style.fontWeight = 'normal';
      }
    }
  }

  leaveRoom() {
    // Improved modal with better performance
    this.showConfirmDialog(
      '🚪 ออกจากห้อง',
      'คุณต้องการออกจากห้องหรือไม่?',
      () => {
        if (this.socket && this.connected) {
          this.socket.emit('leave-room');
        }
        this.roomId = null;
        this.playerNumber = null;
        this.gameState = null;
        this.showScreen('menu-screen');
        this.showNotification('ออกจากห้องแล้ว');
      }
    );
  }

  showConfirmDialog(title, message, onConfirm) {
    const modal = document.createElement('div');
    modal.style.cssText = `
      position: fixed;
      top: 0;
      left: 0;
      right: 0;
      bottom: 0;
      background: rgba(0,0,0,0.7);
      display: flex;
      align-items: center;
      justify-content: center;
      z-index: 2000;
      backdrop-filter: blur(5px);
    `;
    
    const dialog = document.createElement('div');
    dialog.style.cssText = `
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      border-radius: 15px;
      padding: 30px;
      text-align: center;
      color: white;
      box-shadow: 0 10px 30px rgba(0,0,0,0.3);
      max-width: 400px;
      margin: 20px;
    `;
    
    dialog.innerHTML = `
      <h3 style="margin-bottom: 20px;">${title}</h3>
      <p style="margin-bottom: 30px;">${message}</p>
      <div style="display: flex; gap: 15px; justify-content: center;">
        <button class="confirm-btn" style="
          padding: 12px 25px;
          background: #f44336;
          color: white;
          border: none;
          border-radius: 10px;
          cursor: pointer;
          font-weight: bold;
          transition: all 0.3s ease;
        ">ยืนยัน</button>
        <button class="cancel-btn" style="
          padding: 12px 25px;
          background: rgba(255,255,255,0.2);
          color: white;
          border: none;
          border-radius: 10px;
          cursor: pointer;
          font-weight: bold;
          transition: all 0.3s ease;
        ">ยกเลิก</button>
      </div>
    `;
    
    modal.appendChild(dialog);
    document.body.appendChild(modal);
    
    // Event handlers
    const closeModal = () => {
      if (modal.parentNode) {
        document.body.removeChild(modal);
      }
    };
    
    dialog.querySelector('.confirm-btn').addEventListener('click', () => {
      onConfirm();
      closeModal();
    });
    
    dialog.querySelector('.cancel-btn').addEventListener('click', closeModal);
    
    modal.addEventListener('click', (e) => {
      if (e.target === modal) {
        closeModal();
      }
    });
  }

  playAgain() {
    // Clear current game state
    if (this.dropInterval) {
      clearInterval(this.dropInterval);
      this.dropInterval = null;
    }
    this.gameState = null;
    this.inputBuffer = [];
    
    // Reset ready state and go back to waiting screen
    this.resetReadyState();
    this.showScreen('waiting-screen');
    
    // Request new game from server
    if (this.socket && this.connected) {
      this.socket.emit('request-new-game');
    }
    
    this.showNotification('🎮 เตรียมตัวสำหรับเกมใหม่!');
  }

  startGameLoop() {
    // Clear any existing interval
    if (this.dropInterval) {
      clearInterval(this.dropInterval);
    }
    
    // Adaptive drop speed based on level
    const getDropSpeed = (level) => {
      return Math.max(100, 1000 - (level - 1) * 50);
    };
    
    const gameLoop = () => {
      if (this.gameState && this.gameState.gameStarted) {
        const playerState = this.gameState[`player${this.playerNumber}`];
        if (playerState && playerState.alive) {
          this.queueInput('move-down');
          // Schedule next drop based on current level
          const dropSpeed = getDropSpeed(playerState.level);
          this.dropInterval = setTimeout(gameLoop, dropSpeed);
        }
      }
    };
    
    // Start the game loop
    this.dropInterval = setTimeout(gameLoop, 1000);
  }

  // Optimized game display with object pooling and caching
  updateGameDisplay() {
    if (!this.gameState) return;

    // Update both players' boards
    this.drawPlayerBoard('player1-board', this.gameState.player1, 1);
    this.updatePlayerStats('player1-stats', this.gameState.player1);
    this.drawPlayerBoard('player2-board', this.gameState.player2, 2);
    this.updatePlayerStats('player2-stats', this.gameState.player2);

    // Highlight current player (cached)
    this.highlightCurrentPlayer();
  }

  highlightCurrentPlayer() {
    const boards = document.querySelectorAll('.player-board');
    boards.forEach(board => board.classList.remove('current-player'));
    
    if (this.playerNumber) {
      const currentBoard = this.getCachedElement(`player${this.playerNumber}-board`);
      if (currentBoard) {
        currentBoard.classList.add('current-player');
      }
    }
  }

  // Highly optimized board drawing with object pooling
  drawPlayerBoard(boardId, playerState, playerNumber) {
    const boardElement = this.getCachedElement(boardId);
    if (!boardElement) return;

    // Generate cache key for this board state
    const cacheKey = this.generateBoardCacheKey(playerState);
    const lastCacheKey = this.boardCache.get(boardId);
    
    // Skip rendering if board hasn't changed
    if (cacheKey === lastCacheKey) {
      return;
    }
    
    this.boardCache.set(boardId, cacheKey);
    
    // Return all current blocks to pool
    const currentBlocks = Array.from(boardElement.children);
    currentBlocks.forEach(block => {
      if (block.classList.contains('tetris-block')) {
        boardElement.removeChild(block);
        this.returnBlockToPool(block);
      }
    });

    // Draw placed blocks efficiently
    this.drawStaticBlocks(boardElement, playerState.grid);
    
    // Draw current falling piece
    if (playerState.currentPiece && playerState.alive) {
      this.drawFallingPiece(boardElement, playerState);
    }

    // Show game over overlay if needed
    if (!playerState.alive) {
      this.showGameOverOverlay(boardElement);
    }
  }

  generateBoardCacheKey(playerState) {
    // Create a simple hash of the board state
    const gridHash = playerState.grid.map(row => row.join('')).join('');
    const pieceHash = playerState.currentPiece ? 
      `${playerState.currentX}-${playerState.currentY}-${JSON.stringify(playerState.currentPiece.shape)}` : 
      '';
    return `${gridHash}-${pieceHash}-${playerState.alive}`;
  }

  drawStaticBlocks(boardElement, grid) {
    for (let row = 0; row < 20; row++) {
      for (let col = 0; col < 10; col++) {
        if (grid[row][col]) {
          const block = this.getBlockFromPool();
          block.className = `tetris-block ${grid[row][col]}`;
          block.style.left = (col * this.TILE_SIZE) + 'px';
          block.style.top = (row * this.TILE_SIZE) + 'px';
          boardElement.appendChild(block);
        }
      }
    }
  }

  drawFallingPiece(boardElement, playerState) {
    const piece = playerState.currentPiece;
    for (let row = 0; row < piece.shape.length; row++) {
      for (let col = 0; col < piece.shape[row].length; col++) {
        if (piece.shape[row][col]) {
          const block = this.getBlockFromPool();
          block.className = `tetris-block ${piece.color}`;
          block.style.left = ((playerState.currentX + col) * this.TILE_SIZE) + 'px';
          block.style.top = ((playerState.currentY + row) * this.TILE_SIZE) + 'px';
          block.style.opacity = '0.9';
          block.style.boxShadow = '0 0 10px rgba(255, 255, 255, 0.5)';
          boardElement.appendChild(block);
        }
      }
    }
  }

  showGameOverOverlay(boardElement) {
    let overlay = boardElement.querySelector('.game-over-overlay');
    if (!overlay) {
      overlay = document.createElement('div');
      overlay.className = 'game-over-overlay';
      overlay.innerHTML = '<div class="game-over-text">GAME OVER</div>';
      boardElement.appendChild(overlay);
    }
  }

  // Cached stats update
  updatePlayerStats(statsId, playerState) {
    const statsElement = this.getCachedElement(statsId);
    if (!statsElement) return;

    const scoreElement = statsElement.querySelector('.score-value');
    const linesElement = statsElement.querySelector('.lines-value');
    const levelElement = statsElement.querySelector('.level-value');
    
    if (scoreElement) scoreElement.textContent = playerState.score;
    if (linesElement) linesElement.textContent = playerState.lines;
    if (levelElement) levelElement.textContent = playerState.level;
  }

  handleKeyPress(event) {
    if (!this.gameState || !this.gameState.gameStarted) return;
    
    const playerState = this.gameState[`player${this.playerNumber}`];
    if (!playerState || !playerState.alive) return;

    // Map keys to actions
    const keyActions = {
      'ArrowLeft': 'move-left',
      'ArrowRight': 'move-right',
      'ArrowDown': 'move-down',
      'ArrowUp': 'rotate',
      ' ': 'hard-drop',
      'a': 'move-left',
      'd': 'move-right',
      's': 'move-down',
      'w': 'rotate'
    };

    const action = keyActions[event.key];
    if (action) {
      event.preventDefault();
      this.queueInput(action);
    }
  }

  // Touch controls for mobile devices
  setupTouchControls() {
    const gameScreen = document.getElementById('game-screen');
    if (!gameScreen) return;

    let startX = 0;
    let startY = 0;
    let endX = 0;
    let endY = 0;

    gameScreen.addEventListener('touchstart', (e) => {
      if (!this.gameState || !this.gameState.gameStarted) return;
      
      const touch = e.touches[0];
      startX = touch.clientX;
      startY = touch.clientY;
    }, { passive: true });

    gameScreen.addEventListener('touchend', (e) => {
      if (!this.gameState || !this.gameState.gameStarted) return;
      
      const touch = e.changedTouches[0];
      endX = touch.clientX;
      endY = touch.clientY;

      const deltaX = endX - startX;
      const deltaY = endY - startY;
      const threshold = 50;

      // Determine swipe direction
      if (Math.abs(deltaX) > Math.abs(deltaY)) {
        // Horizontal swipe
        if (Math.abs(deltaX) > threshold) {
          if (deltaX > 0) {
            this.queueInput('move-right');
          } else {
            this.queueInput('move-left');
          }
        }
      } else {
        // Vertical swipe
        if (Math.abs(deltaY) > threshold) {
          if (deltaY > 0) {
            this.queueInput('hard-drop');
          } else {
            this.queueInput('rotate');
          }
        }
      }
    }, { passive: true });

    // Tap to rotate
    gameScreen.addEventListener('touchstart', (e) => {
      if (e.touches.length === 2) {
        // Two finger tap to rotate
        e.preventDefault();
        this.queueInput('rotate');
      }
    });
  }

  // Screen management functions
  showScreen(screenId) {
    // Hide all screens first
    const screens = document.querySelectorAll('.screen');
    screens.forEach(screen => {
      screen.style.display = 'none';
    });

    // Show target screen with animation
    const targetScreen = document.getElementById(screenId);
    if (targetScreen) {
      targetScreen.style.display = 'flex';
      targetScreen.style.opacity = '0';
      targetScreen.style.transform = 'translateY(20px)';
      
      requestAnimationFrame(() => {
        targetScreen.style.transition = 'all 0.3s ease';
        targetScreen.style.opacity = '1';
        targetScreen.style.transform = 'translateY(0)';
      });
    }
  }

  // Update room information display
  updateRoomInfo(roomPlayers) {
    const roomIdDisplay = this.getCachedElement('room-id-display');
    if (roomIdDisplay) {
      roomIdDisplay.textContent = `ห้อง: ${this.roomId}`;
    }

    const playersList = this.getCachedElement('players-list');
    if (playersList) {
      playersList.innerHTML = '';
      
      roomPlayers.forEach((player, index) => {
        const playerDiv = document.createElement('div');
        playerDiv.className = 'player-info';
        playerDiv.style.cssText = `
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 15px;
          margin: 10px 0;
          background: rgba(255, 255, 255, 0.1);
          border-radius: 10px;
          backdrop-filter: blur(10px);
        `;
        
        const isCurrentPlayer = player.playerNumber === this.playerNumber;
        const nameSpan = document.createElement('span');
        nameSpan.textContent = `${player.name} ${isCurrentPlayer ? '(คุณ)' : ''}`;
        nameSpan.style.fontWeight = isCurrentPlayer ? 'bold' : 'normal';
        nameSpan.style.color = isCurrentPlayer ? '#4CAF50' : 'white';
        
        const statusSpan = document.createElement('span');
        statusSpan.id = `ready-indicator-${player.playerNumber}`;
        statusSpan.textContent = `Player ${player.playerNumber}: รอ...`;
        statusSpan.style.color = '#666';
        
        playerDiv.appendChild(nameSpan);
        playerDiv.appendChild(statusSpan);
        playersList.appendChild(playerDiv);
      });
    }
  }

  // Update player ready status
  updatePlayerReady(playerNumber) {
    const indicator = document.getElementById(`ready-indicator-${playerNumber}`);
    if (indicator) {
      indicator.textContent = `Player ${playerNumber}: ✅ พร้อม`;
      indicator.style.color = '#4CAF50';
      indicator.style.fontWeight = 'bold';
    }
  }

  // Connection status indicator
  updateConnectionStatus(connected) {
    const statusElement = this.getCachedElement('connection-status');
    if (statusElement) {
      statusElement.textContent = connected ? '🟢 เชื่อมต่อแล้ว' : '🔴 ไม่ได้เชื่อมต่อ';
      statusElement.style.color = connected ? '#4CAF50' : '#f44336';
      statusElement.style.fontWeight = 'bold';
    }

    // Update global connection indicator
    const globalIndicator = document.querySelector('.connection-indicator');
    if (globalIndicator) {
      globalIndicator.className = `connection-indicator ${connected ? 'connected' : 'disconnected'}`;
    }
  }

  // Game over handling
  endGame(data) {
    // Clear game loop
    if (this.dropInterval) {
      clearInterval(this.dropInterval);
      this.dropInterval = null;
    }

    // Clear input buffer
    this.inputBuffer = [];

    // Show game over screen
    this.showScreen('game-over-screen');

    // Update winner display
    const winnerElement = document.getElementById('winner-display');
    if (winnerElement) {
      if (data.winner === this.playerNumber) {
        winnerElement.innerHTML = '🎉 คุณชนะ! 🎉';
        winnerElement.style.color = '#4CAF50';
        this.showNotification('🎉 ยินดีด้วย! คุณชนะ!');
        
        // Celebration effect
        this.createCelebrationEffect();
      } else if (data.winner === 0) {
        winnerElement.innerHTML = '🤝 เสมอ';
        winnerElement.style.color = '#FF9800';
        this.showNotification('🤝 เกมเสมอ!');
      } else {
        winnerElement.innerHTML = '😔 คุณแพ้';
        winnerElement.style.color = '#f44336';
        this.showNotification('😔 เสียใจด้วย คุณแพ้');
      }
    }

    // Update final scores
    const finalScoreElement = document.getElementById('final-scores');
    if (finalScoreElement && this.gameState) {
      finalScoreElement.innerHTML = `
        <div class="score-comparison">
          <div class="player-final-score">
            <h4>Player 1: ${this.gameState.player1.name}</h4>
            <p>คะแนน: ${this.gameState.player1.score}</p>
            <p>เส้น: ${this.gameState.player1.lines}</p>
            <p>เลเวล: ${this.gameState.player1.level}</p>
          </div>
          <div class="player-final-score">
            <h4>Player 2: ${this.gameState.player2.name}</h4>
            <p>คะแนน: ${this.gameState.player2.score}</p>
            <p>เส้น: ${this.gameState.player2.lines}</p>
            <p>เลเวล: ${this.gameState.player2.level}</p>
          </div>
        </div>
      `;
    }
  }

  // Celebration effect for winner
  createCelebrationEffect() {
    const colors = ['#FF6B6B', '#4ECDC4', '#45B7D1', '#96CEB4', '#FFEAA7', '#DDA0DD'];
    
    for (let i = 0; i < 50; i++) {
      setTimeout(() => {
        const confetti = document.createElement('div');
        confetti.style.cssText = `
          position: fixed;
          width: 10px;
          height: 10px;
          background: ${colors[Math.floor(Math.random() * colors.length)]};
          left: ${Math.random() * window.innerWidth}px;
          top: -10px;
          z-index: 9999;
          border-radius: 50%;
          pointer-events: none;
          animation: confetti-fall 3s linear forwards;
        `;
        
        document.body.appendChild(confetti);
        
        setTimeout(() => {
          if (confetti.parentNode) {
            confetti.parentNode.removeChild(confetti);
          }
        }, 3000);
      }, i * 100);
    }
  }

  // Performance monitoring
  startPerformanceMonitoring() {
    let frameCount = 0;
    let lastTime = performance.now();
    
    const monitor = () => {
      frameCount++;
      const currentTime = performance.now();
      
      if (currentTime - lastTime >= 1000) {
        const fps = Math.round((frameCount * 1000) / (currentTime - lastTime));
        
        // Log performance if FPS drops below 30
        if (fps < 30) {
          console.warn(`Low FPS detected: ${fps}`);
          this.optimizePerformance();
        }
        
        frameCount = 0;
        lastTime = currentTime;
      }
      
      if (this.gameState) {
        requestAnimationFrame(monitor);
      }
    };
    
    requestAnimationFrame(monitor);
  }

  // Performance optimization when FPS drops
  optimizePerformance() {
    // Reduce visual effects
    const blocks = document.querySelectorAll('.tetris-block');
    blocks.forEach(block => {
      block.style.transition = 'none';
      block.style.boxShadow = 'none';
    });
    
    // Increase input throttle
    this.INPUT_THROTTLE = Math.min(100, this.INPUT_THROTTLE * 1.5);
    
    // Clear some caches if they're too large
    if (this.boardCache.size > 100) {
      this.boardCache.clear();
    }
    
    console.log('Performance optimizations applied');
  }

  // Cleanup function
  cleanup() {
    // Cancel render loop
    if (this.renderRequestId) {
      cancelAnimationFrame(this.renderRequestId);
      this.renderRequestId = null;
    }
    
    // Clear intervals
    if (this.dropInterval) {
      clearInterval(this.dropInterval);
      this.dropInterval = null;
    }
    
    // Disconnect socket
    if (this.socket) {
      this.socket.disconnect();
      this.socket = null;
    }
    
    // Clear caches
    this.cachedElements.clear();
    this.boardCache.clear();
    
    // Return all blocks to pool
    this.blockPool.forEach(block => {
      if (block.parentNode) {
        block.parentNode.removeChild(block);
      }
    });
    this.blockPool = [];
    
    // Clear input buffer
    this.inputBuffer = [];
    
    console.log('TetrisClient cleaned up');
  }

  // Add error boundary for better error handling
  handleError(error, context = 'Unknown') {
    console.error(`Error in ${context}:`, error);
    this.showNotification(`เกิดข้อผิดพลาด: ${context}`, 'error');
    
    // Try to recover from certain errors
    if (context.includes('render') || context.includes('display')) {
      // Clear board cache and force re-render
      this.boardCache.clear();
      if (this.gameState) {
        this.updateGameDisplay();
      }
    }
  }

  // Mobile responsiveness adjustments
  adjustForMobile() {
    const isMobile = window.innerWidth < 768;
    
    if (isMobile) {
      // Adjust tile size for mobile
      this.TILE_SIZE = Math.max(20, Math.min(25, window.innerWidth / 16));
      
      // Show mobile controls
      const mobileControls = document.querySelector('.mobile-controls');
      if (mobileControls) {
        mobileControls.style.display = 'flex';
      }
      
      // Adjust input throttle for touch devices
      this.INPUT_THROTTLE = 100;
    } else {
      // Hide mobile controls on desktop
      const mobileControls = document.querySelector('.mobile-controls');
      if (mobileControls) {
        mobileControls.style.display = 'none';
      }
    }
    
    // Recreate block pool with new tile size
    this.blockPool.forEach(block => {
      block.style.width = this.TILE_SIZE + 'px';
      block.style.height = this.TILE_SIZE + 'px';
    });
  }

  // Initialize responsive design
  initializeResponsiveDesign() {
    // Initial adjustment
    this.adjustForMobile();
    
    // Listen for resize events
    let resizeTimeout;
    window.addEventListener('resize', () => {
      clearTimeout(resizeTimeout);
      resizeTimeout = setTimeout(() => {
        this.adjustForMobile();
        this.boardCache.clear(); // Force re-render with new size
      }, 250);
    });
    
    // Listen for orientation changes on mobile
    window.addEventListener('orientationchange', () => {
      setTimeout(() => {
        this.adjustForMobile();
        this.boardCache.clear();
      }, 500);
    });
  }
}

// Add CSS animations for confetti effect
const style = document.createElement('style');
style.textContent = `
  @keyframes confetti-fall {
    0% {
      transform: translateY(-10px) rotateZ(0deg);
      opacity: 1;
    }
    100% {
      transform: translateY(100vh) rotateZ(720deg);
      opacity: 0;
    }
  }
  
  .tetris-block {
    transition: all 0.1s ease;
  }
  
  .current-player {
    box-shadow: 0 0 20px rgba(76, 175, 80, 0.5);
    border: 2px solid #4CAF50;
  }
  
  .game-over-overlay {
    position: absolute;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    background: rgba(0, 0, 0, 0.8);
    display: flex;
    align-items: center;
    justify-content: center;
    color: #f44336;
    font-size: 24px;
    font-weight: bold;
    z-index: 100;
  }
  
  .connection-indicator {
    position: fixed;
    top: 10px;
    right: 10px;
    padding: 5px 10px;
    border-radius: 15px;
    font-size: 12px;
    font-weight: bold;
    z-index: 1001;
  }
  
  .connection-indicator.connected {
    background: rgba(76, 175, 80, 0.8);
    color: white;
  }
  
  .connection-indicator.disconnected {
    background: rgba(244, 67, 54, 0.8);
    color: white;
  }
  
  @media (max-width: 768px) {
    .tetris-block {
      border-width: 1px;
    }
    
    .player-board {
      transform: scale(0.8);
    }
    
    .mobile-controls {
      display: flex !important;
      flex-wrap: wrap;
      justify-content: center;
      gap: 10px;
      padding: 20px;
    }
    
    .control-button {
      width: 60px;
      height: 60px;
      border-radius: 50%;
      border: none;
      font-size: 20px;
      font-weight: bold;
      color: white;
      cursor: pointer;
      transition: all 0.2s ease;
      user-select: none;
      -webkit-tap-highlight-color: transparent;
    }
    
    .control-button:active {
      transform: scale(0.9);
    }
  }
`;
document.head.appendChild(style);

// Initialize the game when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
  window.tetrisClient = new TetrisClient();
  
  // Initialize responsive design
  window.tetrisClient.initializeResponsiveDesign();
  
  // Start performance monitoring
  window.tetrisClient.startPerformanceMonitoring();
  
  // Cleanup on page unload
  window.addEventListener('beforeunload', () => {
    if (window.tetrisClient) {
      window.tetrisClient.cleanup();
    }
  });
});

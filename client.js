// OptimizedTetrisClient ที่ปรับปรุงให้ทำงานร่วมกับ HTML
class OptimizedTetrisClient {
  constructor() {
    this.socket = null;
    this.gameState = null;
    this.prevGameState = null;
    this.dropInterval = null;
    this.animationFrame = null;
    this.playerNumber = null;
    this.roomId = null;
    this.TILE_SIZE = 20; // ลดขนาดให้เหมาะกับ canvas ใน HTML
    
    // Canvas elements from HTML
    this.player1Canvas = null;
    this.player2Canvas = null;
    this.player1Ctx = null;
    this.player2Ctx = null;
    
    // Game state
    this.isReady = false;
    this.gameStarted = false;
    this.connected = false;
    
    // Object pooling for DOM elements
    this.blockPool = [];
    this.activeBlocks = new Set();
    
    // Performance monitoring
    this.performanceMetrics = {
      frameCount: 0,
      lastTime: performance.now(),
      fps: 60
    };
    
    // เริ่มต้นเมื่อ DOM พร้อม
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', () => this.initialize());
    } else {
      this.initialize();
    }
  }

  initialize() {
    console.log('🎮 Initializing Tetris Client...');
    
    // Setup canvas elements
    this.setupCanvas();
    
    // เริ่มการเชื่อมต่อ Socket.io
    this.initializeSocket();
    
    // Setup event listeners (แต่ไม่ override ของ HTML)
    this.setupGameEventListeners();
    
    // Start render loop
    this.startRenderLoop();
  }

  // ✅ Setup Canvas Elements
  setupCanvas() {
    this.player1Canvas = document.getElementById('player1-board');
    this.player2Canvas = document.getElementById('player2-board');
    
    if (this.player1Canvas) {
      this.player1Canvas.width = 200; // 10 blocks * 20px
      this.player1Canvas.height = 400; // 20 blocks * 20px
      this.player1Ctx = this.player1Canvas.getContext('2d');
      this.player1Ctx.imageSmoothingEnabled = false;
    }
    
    if (this.player2Canvas) {
      this.player2Canvas.width = 200;
      this.player2Canvas.height = 400;
      this.player2Ctx = this.player2Canvas.getContext('2d');
      this.player2Ctx.imageSmoothingEnabled = false;
    }
    
    // Pre-render block textures
    this.blockTextures = this.createBlockTextures();
    
    console.log('🎨 Canvas setup complete');
  }

  // ✅ เพิ่มการเชื่อมต่อ Socket.io
  initializeSocket() {
    // เชื่อมต่อกับ server (ปรับ URL ตามความเหมาะสม)
    this.socket = io(window.location.origin, {
      transports: ['websocket', 'polling']
    });

    // ตั้งค่า event handlers
    this.setupSocketHandlers();
  }

  // ✅ เพิ่ม Socket Event Handlers
  setupSocketHandlers() {
    // เมื่อเชื่อมต่อสำเร็จ
    this.socket.on('connect', () => {
      console.log('🔌 Connected to server:', this.socket.id);
      this.connected = true;
      
      // อัพเดทสถานะการเชื่อมต่อใน HTML
      if (window.updateConnectionStatus) {
        window.updateConnectionStatus(true);
      }
    });

    // เมื่อขาดการเชื่อมต่อ
    this.socket.on('disconnect', (reason) => {
      console.log('🔌 Disconnected:', reason);
      this.connected = false;
      
      if (window.updateConnectionStatus) {
        window.updateConnectionStatus(false);
      }
    });

    // เมื่อเข้าห้องสำเร็จ
    this.socket.on('room-joined', (data) => {
      console.log('🏠 Joined room:', data.roomId);
      this.roomId = data.roomId;
      this.playerNumber = data.playerNumber;
      
      // แสดงข้อมูลห้องใน HTML
      const roomDisplay = document.getElementById('room-id-display');
      if (roomDisplay) {
        roomDisplay.textContent = data.roomId;
      }
      
      this.updatePlayersList(data.players || []);
      
      // เปิดใช้ปุ่มพร้อมเล่น
      const readyBtn = document.getElementById('btn-ready');
      if (readyBtn) {
        readyBtn.disabled = false;
      }
    });

    // เมื่อมีผู้เล่นใหม่เข้าห้อง
    this.socket.on('players-updated', (players) => {
      this.updatePlayersList(players);
    });

    // เมื่อมีการอัพเดท game state
    this.socket.on('game-state-update', (gameState) => {
      this.gameState = gameState;
      this.updateGameUI();
    });

    // ✅ รับ delta updates จาก server
    this.socket.on('game-delta', (delta) => {
      this.applyDelta(delta);
    });

    // เมื่อเกมเริ่ม
    this.socket.on('game-started', (gameState) => {
      console.log('🎮 Game started!');
      this.gameState = gameState;
      this.gameStarted = true;
      
      // แสดงหน้าจอเกม
      if (window.showScreen) {
        window.showScreen('game-screen');
      }
      
      this.startGameLoop();
    });

    // เมื่อเกมจบ
    this.socket.on('game-over', (result) => {
      console.log('🏆 Game over:', result);
      this.gameStarted = false;
      this.handleGameOver(result);
    });

    // เมื่อถูก rate limit
    this.socket.on('rate-limited', () => {
      console.warn('⚠️ Rate limited - slow down!');
      if (window.showNotification) {
        window.showNotification('การกดปุ่มเร็วเกินไป กรุณาช้าลง', 'warning');
      }
    });

    // เมื่อเกิดข้อผิดพลาด
    this.socket.on('error', (error) => {
      console.error('❌ Socket error:', error);
      if (window.showNotification) {
        window.showNotification('เกิดข้อผิดพลาด: ' + error.message, 'error');
      }
    });
  }

  // ✅ อัพเดทรายชื่อผู้เล่น
  updatePlayersList(players) {
    const list = document.getElementById('players-list');
    if (!list) return;
    
    list.innerHTML = '';
    
    players.forEach(player => {
      const li = document.createElement('li');
      li.textContent = `${player.name || `Player ${player.playerNumber}`}${player.ready ? ' (พร้อม)' : ''}`;
      if (player.playerNumber === this.playerNumber) {
        li.classList.add('current-player');
      }
      list.appendChild(li);
    });

    // อัพเดท ready indicators
    for (let i = 1; i <= 2; i++) {
      const indicator = document.getElementById(`ready-indicator-${i}`);
      if (indicator) {
        const player = players.find(p => p.playerNumber === i);
        if (player) {
          indicator.textContent = `${player.name || `Player ${i}`}: ${player.ready ? 'พร้อมแล้ว ✅' : 'รอ...'}`;
        }
      }
    }
  }

  // ✅ เพิ่มฟังก์ชันสำหรับการเข้าห้อง (ใช้จาก HTML)
  joinRoom(roomId) {
    if (!this.socket || !this.socket.connected) {
      if (window.showNotification) {
        window.showNotification('ไม่ได้เชื่อมต่อกับเซิร์ฟเวอร์', 'error');
      }
      return;
    }

    const playerName = document.getElementById('create-player-name')?.value || 
                      document.getElementById('join-player-name')?.value || 
                      `Player_${Math.random().toString(36).substr(2, 5)}`;

    this.socket.emit('join-room', { 
      roomId: roomId || `room_${Date.now()}`,
      playerName: playerName.trim()
    });
  }

  // ✅ เพิ่มฟังก์ชันสำหรับการพร้อมเล่น
  playerReady() {
    if (!this.socket || !this.socket.connected) {
      if (window.showNotification) {
        window.showNotification('ไม่ได้เชื่อมต่อกับเซิร์ฟเวอร์', 'error');
      }
      return;
    }

    this.isReady = true;
    this.socket.emit('player-ready');
    
    if (window.showNotification) {
      window.showNotification('คุณพร้อมเล่นแล้ว!', 'success');
    }
  }

  // ✅ ปรับปรุงการจัดการ input (ใช้ร่วมกับ HTML)
  setupGameEventListeners() {
    // เพิ่ม keyboard listener สำหรับเกม (ไม่ทับซ้อนกับ HTML)
    document.addEventListener('keydown', (e) => {
      if (this.gameStarted) {
        this.handleKeyPress(e);
      }
    });
  }

  // ✅ ปรับปรุงการส่งคำสั่งเกม
  handleKeyPress(e) {
    if (!this.gameStarted || !this.gameState?.gameStarted) return;
    if (!this.socket?.connected) return;

    const actions = {
      'ArrowLeft': { type: 'move-left' },
      'ArrowRight': { type: 'move-right' },
      'ArrowDown': { type: 'move-down' },
      'ArrowUp': { type: 'rotate' },
      ' ': { type: 'hard-drop' }
    };

    if (actions[e.key]) {
      e.preventDefault();
      // ส่งคำสั่งไปยัง server
      this.socket.emit('game-action', actions[e.key]);
    }
  }

  // ✅ เพิ่มฟังก์ชันจัดการ delta updates
  applyDelta(delta) {
    if (!this.gameState) return;

    const playerKey = `player${delta.playerNumber}`;
    const playerState = this.gameState[playerKey];

    if (!playerState) return;

    delta.changes.forEach(change => {
      switch (change.type) {
        case 'position':
          playerState.currentX = change.to.x;
          playerState.currentY = change.to.y;
          break;

        case 'rotation':
          if (playerState.currentPiece) {
            playerState.currentPiece.shape = change.shape;
          }
          break;

        case 'hard-drop':
          playerState.currentY = change.newY;
          playerState.score += change.scoreGain;
          this.updatePlayerStats(delta.playerNumber, playerState);
          break;

        case 'piece-placed':
          // อัพเดท grid และสถิติ
          Object.assign(playerState, change.newStats);
          this.updatePlayerStats(delta.playerNumber, playerState);
          break;

        case 'new-piece':
          playerState.currentPiece = change.currentPiece;
          playerState.nextPiece = change.nextPiece;
          playerState.currentX = 4;
          playerState.currentY = 0;
          this.updateNextPiece(delta.playerNumber, change.nextPiece);
          break;

        case 'game-over':
          this.handleGameOver({
            winner: change.winner,
            finalScores: change.finalScores
          });
          break;
      }
    });
  }

  // ✅ อัพเดท UI สถิติผู้เล่น
  updatePlayerStats(playerNumber, stats) {
    const statsEl = document.getElementById(`player${playerNumber}-stats`);
    if (!statsEl) return;

    const scoreEl = statsEl.querySelector('.score-value');
    const linesEl = statsEl.querySelector('.lines-value');
    const levelEl = statsEl.querySelector('.level-value');

    if (scoreEl) scoreEl.textContent = stats.score || 0;
    if (linesEl) linesEl.textContent = stats.linesCleared || 0;
    if (levelEl) levelEl.textContent = stats.level || 1;
  }

  // ✅ อัพเดท next piece preview
  updateNextPiece(playerNumber, nextPiece) {
    const nextEl = document.getElementById(`player${playerNumber}-next`);
    if (!nextEl || !nextPiece) return;

    nextEl.innerHTML = '';
    
    // สร้าง grid 4x4 สำหรับแสดง next piece
    for (let row = 0; row < 4; row++) {
      for (let col = 0; col < 4; col++) {
        const cell = document.createElement('div');
        cell.className = 'preview-cell';
        
        if (nextPiece.shape[row] && nextPiece.shape[row][col]) {
          cell.style.backgroundColor = this.getPieceColor(nextPiece.color);
        }
        
        nextEl.appendChild(cell);
      }
    }
  }

  // ✅ อัพเดท Game UI
  updateGameUI() {
    if (!this.gameState) return;

    // อัพเดทสถิติทั้งสองผู้เล่น
    if (this.gameState.player1) {
      this.updatePlayerStats(1, this.gameState.player1);
    }
    if (this.gameState.player2) {
      this.updatePlayerStats(2, this.gameState.player2);
    }

    // เพิ่ม highlight สำหรับผู้เล่นปัจจุบัน
    const p1Board = document.getElementById('player1-board');
    const p2Board = document.getElementById('player2-board');
    
    if (p1Board) {
      p1Board.classList.toggle('current-player', this.playerNumber === 1);
    }
    if (p2Board) {
      p2Board.classList.toggle('current-player', this.playerNumber === 2);
    }
  }

  // ✅ เพิ่มฟังก์ชันจัดการเกมจบ
  handleGameOver(result) {
    this.gameStarted = false;
    
    if (window.showScreen) {
      // อัพเดทข้อมูลในหน้าจอ Game Over
      const winnerMessage = document.getElementById('winner-message');
      if (winnerMessage) {
        if (result.winner === 'draw') {
          winnerMessage.textContent = '🤝 เสมอ!';
          winnerMessage.style.color = '#ffd700';
        } else if (result.winner === this.playerNumber) {
          winnerMessage.textContent = '🎉 คุณชนะ!';
          winnerMessage.style.color = '#4CAF50';
        } else {
          winnerMessage.textContent = '😢 คุณแพ้';
          winnerMessage.style.color = '#f44336';
        }
      }
      
      // อัพเดทคะแนนสุดท้าย
      const p1Score = document.getElementById('final-score-p1');
      const p2Score = document.getElementById('final-score-p2');
      if (p1Score) p1Score.textContent = result.finalScores?.player1 || 0;
      if (p2Score) p2Score.textContent = result.finalScores?.player2 || 0;
      
      window.showScreen('game-over-screen');
    }
  }

  // ✅ เริ่ม Game Loop
  startGameLoop() {
    // เริ่ม game loop สำหรับการตกของชิ้นส่วน
    if (this.dropInterval) {
      clearInterval(this.dropInterval);
    }

    // ปรับความเร็วตาม level
    const getDropInterval = () => {
      const level = this.gameState?.[`player${this.playerNumber}`]?.level || 1;
      return Math.max(100, 1000 - (level - 1) * 50); // เร็วขึ้นตาม level
    };

    const dropLoop = () => {
      if (this.gameStarted && this.gameState?.gameStarted && this.socket?.connected) {
        this.socket.emit('game-action', { type: 'move-down' });
      }
      
      if (this.gameStarted) {
        setTimeout(dropLoop, getDropInterval());
      }
    };

    // เริ่ม drop loop
    setTimeout(dropLoop, getDropInterval());
  }

  // ✅ Create Block Textures
  createBlockTextures() {
    const textures = {};
    const colors = {
      'I': '#00f0f0', // Cyan
      'O': '#f0f000', // Yellow
      'T': '#a000f0', // Purple
      'S': '#00f000', // Green
      'Z': '#f00000', // Red
      'J': '#0000f0', // Blue
      'L': '#f0a000'  // Orange
    };

    Object.entries(colors).forEach(([type, color]) => {
      const canvas = document.createElement('canvas');
      canvas.width = canvas.height = this.TILE_SIZE;
      const ctx = canvas.getContext('2d');
      
      // Draw gradient block
      const gradient = ctx.createLinearGradient(0, 0, this.TILE_SIZE, this.TILE_SIZE);
      gradient.addColorStop(0, color);
      gradient.addColorStop(1, this.darkenColor(color, 0.3));
      
      ctx.fillStyle = gradient;
      ctx.fillRect(0, 0, this.TILE_SIZE, this.TILE_SIZE);
      
      // Add border
      ctx.strokeStyle = this.lightenColor(color, 0.2);
      ctx.lineWidth = 1;
      ctx.strokeRect(0.5, 0.5, this.TILE_SIZE-1, this.TILE_SIZE-1);
      
      textures[type] = canvas;
    });

    return textures;
  }

  // ✅ Get Piece Color
  getPieceColor(pieceType) {
    const colors = {
      'I': '#00f0f0',
      'O': '#f0f000',
      'T': '#a000f0',
      'S': '#00f000',
      'Z': '#f00000',
      'J': '#0000f0',
      'L': '#f0a000'
    };
    return colors[pieceType] || '#ffffff';
  }

  // ✅ Start Render Loop
  startRenderLoop() {
    const render = (currentTime) => {
      this.performanceMetrics.frameCount++;
      if (currentTime - this.performanceMetrics.lastTime >= 1000) {
        this.performanceMetrics.fps = this.performanceMetrics.frameCount;
        this.performanceMetrics.frameCount = 0;
        this.performanceMetrics.lastTime = currentTime;
      }

      if (this.hasStateChanged()) {
        this.renderGame();
        this.prevGameState = this.deepCloneState(this.gameState);
      }

      this.animationFrame = requestAnimationFrame(render);
    };

    this.animationFrame = requestAnimationFrame(render);
  }

  // ✅ Check State Changes
  hasStateChanged() {
    if (!this.gameState || !this.prevGameState) return true;
    
    const current = this.gameState;
    const prev = this.prevGameState;
    
    return (
      current.player1?.currentX !== prev.player1?.currentX ||
      current.player1?.currentY !== prev.player1?.currentY ||
      current.player1?.score !== prev.player1?.score ||
      current.player2?.currentX !== prev.player2?.currentX ||
      current.player2?.currentY !== prev.player2?.currentY ||
      current.player2?.score !== prev.player2?.score ||
      this.hasGridChanged(current.player1?.grid, prev.player1?.grid) ||
      this.hasGridChanged(current.player2?.grid, prev.player2?.grid)
    );
  }

  hasGridChanged(grid1, grid2) {
    if (!grid1 || !grid2) return true;
    
    for (let row = 0; row < grid1.length; row++) {
      for (let col = 0; col < grid1[row].length; col++) {
        if (grid1[row][col] !== grid2[row][col]) {
          return true;
        }
      }
    }
    return false;
  }

  // ✅ Render Game
  renderGame() {
    if (!this.gameState) return;
    
    // Render Player 1 board
    if (this.player1Ctx && this.gameState.player1) {
      this.renderPlayerBoard(this.player1Ctx, this.gameState.player1, 1);
    }
    
    // Render Player 2 board  
    if (this.player2Ctx && this.gameState.player2) {
      this.renderPlayerBoard(this.player2Ctx, this.gameState.player2, 2);
    }
  }

  // ✅ Render Player Board
  renderPlayerBoard(ctx, playerState, playerNumber) {
    if (!ctx || !playerState) return;
    
    const tileSize = this.TILE_SIZE;
    const width = 10 * tileSize;
    const height = 20 * tileSize;
    
    // Clear canvas
    ctx.clearRect(0, 0, width, height);
    
    // Background
    ctx.fillStyle = '#111';
    ctx.fillRect(0, 0, width, height);
    
    // Draw grid lines
    ctx.strokeStyle = '#333';
    ctx.lineWidth = 0.5;
    for (let i = 0; i <= 10; i++) {
      ctx.beginPath();
      ctx.moveTo(i * tileSize, 0);
      ctx.lineTo(i * tileSize, height);
      ctx.stroke();
    }
    for (let i = 0; i <= 20; i++) {
      ctx.beginPath();
      ctx.moveTo(0, i * tileSize);
      ctx.lineTo(width, i * tileSize);
      ctx.stroke();
    }

    // Draw placed blocks
    if (playerState.grid) {
      for (let row = 0; row < 20; row++) {
        for (let col = 0; col < 10; col++) {
          const blockType = playerState.grid[row]?.[col];
          if (blockType && this.blockTextures[blockType]) {
            ctx.drawImage(
              this.blockTextures[blockType],
              col * tileSize,
              row * tileSize
            );
          }
        }
      }
    }

    // Draw current piece
    if (playerState.currentPiece && playerState.alive && playerState.currentPiece.shape) {
      ctx.save();
      ctx.shadowColor = '#ffffff';
      ctx.shadowBlur = 5;
      
      const piece = playerState.currentPiece;
      const pieceColor = piece.color || piece.type;
      
      for (let row = 0; row < piece.shape.length; row++) {
        for (let col = 0; col < piece.shape[row].length; col++) {
          if (piece.shape[row][col] && this.blockTextures[pieceColor]) {
            const x = (playerState.currentX + col) * tileSize;
            const y = (playerState.currentY + row) * tileSize;
            
            // Only draw if within bounds
            if (x >= 0 && x < width && y >= 0 && y < height) {
              ctx.drawImage(this.blockTextures[pieceColor], x, y);
            }
          }
        }
      }
      ctx.restore();
    }

    // Draw game over overlay
    if (!playerState.alive) {
      ctx.fillStyle = 'rgba(255, 0, 0, 0.7)';
      ctx.fillRect(0, 0, width, height);
      
      ctx.fillStyle = 'white';
      ctx.font = 'bold 16px Arial';
      ctx.textAlign = 'center';
      ctx.fillText('GAME OVER', width / 2, height / 2);
    }
  }

  // ✅ Utility Functions
  deepCloneState(state) {
    if (!state) return null;
    return {
      player1: state.player1 ? { 
        ...state.player1, 
        grid: state.player1.grid?.map(row => [...row]) 
      } : null,
      player2: state.player2 ? { 
        ...state.player2, 
        grid: state.player2.grid?.map(row => [...row]) 
      } : null,
      gameStarted: state.gameStarted,
      winner: state.winner
    };
  }

  darkenColor(color, factor) {
    const num = parseInt(color.slice(1), 16);
    const amt = Math.round(2.55 * factor * 100);
    const R = Math.max(0, (num >> 16) - amt);
    const G = Math.max(0, (num >> 8 & 0x00FF) - amt);
    const B = Math.max(0, (num & 0x0000FF) - amt);
    return `#${(0x1000000 + R * 0x10000 + G * 0x100 + B).toString(16).slice(1)}`;
  }

  lightenColor(color, factor) {
    const num = parseInt(color.slice(1), 16);
    const amt = Math.round(2.55 * factor * 100);
    const R = Math.min(255, (num >> 16) + amt);
    const G = Math.min(255, (num >> 8 & 0x00FF) + amt);
    const B = Math.min(255, (num & 0x0000FF) + amt);
    return `#${(0x1000000 + R * 0x10000 + G * 0x100 + B).toString(16).slice(1)}`;
  }

  // ✅ Cleanup
  cleanup() {
    if (this.animationFrame) {
      cancelAnimationFrame(this.animationFrame);
    }
    
    if (this.dropInterval) {
      clearInterval(this.dropInterval);
    }
    
    if (this.socket) {
      this.socket.disconnect();
    }
    
    this.blockPool = [];
    this.activeBlocks.clear();
  }
}

// ⚠️ ไม่สร้าง instance ที่นี่ เพราะ HTML จะสร้างเอง
// const game = new OptimizedTetrisClient();

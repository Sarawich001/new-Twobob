// เพิ่มส่วนที่ขาดหายในฝั่ง Client
class OptimizedTetrisClient {
  constructor() {
    this.socket = null;
    this.gameState = null;
    this.prevGameState = null;
    this.dropInterval = null;
    this.animationFrame = null;
    this.playerNumber = null;
    this.roomId = null;
    this.TILE_SIZE = 30;
    
    // Canvas setup for better performance
    this.setupCanvas();
    
    // Object pooling for DOM elements
    this.blockPool = [];
    this.activeBlocks = new Set();
    
    // Performance monitoring
    this.performanceMetrics = {
      frameCount: 0,
      lastTime: performance.now(),
      fps: 60
    };
    
    // เริ่มการเชื่อมต่อ Socket.io
    this.initializeSocket();
    this.setupEventListeners();
    this.startRenderLoop();
  }

  // ✅ เพิ่มการเชื่อมต่อ Socket.io
  initializeSocket() {
    // เชื่อมต่อกับ server
    this.socket = io('http://localhost:3000', {
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
    });

    // เมื่อเข้าห้องสำเร็จ
    this.socket.on('room-joined', (data) => {
      console.log('🏠 Joined room:', data.roomId);
      this.roomId = data.roomId;
      this.playerNumber = data.playerNumber;
      this.updateUI(`Player ${data.playerNumber} - Room: ${data.roomId}`);
    });

    // เมื่อมีการอัพเดท game state
    this.socket.on('game-state-update', (gameState) => {
      this.gameState = gameState;
    });

    // ✅ รับ delta updates จาก server (ตรงกับการ emit 'game-delta' ใน server)
    this.socket.on('game-delta', (delta) => {
      this.applyDelta(delta);
    });

    // เมื่อเกมเริ่ม
    this.socket.on('game-started', (gameState) => {
      console.log('🎮 Game started!');
      this.gameState = gameState;
      this.startGameLoop();
    });

    // เมื่อเกมจบ
    this.socket.on('game-over', (result) => {
      console.log('🏆 Game over:', result);
      this.handleGameOver(result);
    });

    // เมื่อถูก rate limit
    this.socket.on('rate-limited', () => {
      console.warn('⚠️ Rate limited - slow down!');
    });

    // เมื่อเกิดข้อผิดพลาด
    this.socket.on('error', (error) => {
      console.error('❌ Socket error:', error);
    });

    // เมื่อขาดการเชื่อมต่อ
    this.socket.on('disconnect', (reason) => {
      console.log('🔌 Disconnected:', reason);
    });
  }

  // ✅ เพิ่มฟังก์ชันสำหรับการเข้าห้อง
  joinRoom(roomId) {
    if (this.socket && this.socket.connected) {
      this.socket.emit('join-room', { 
        roomId: roomId || `room_${Date.now()}`,
        playerName: `Player_${Math.random().toString(36).substr(2, 5)}`
      });
    }
  }

  // ✅ เพิ่มฟังก์ชันสำหรับการพร้อมเล่น
  playerReady() {
    if (this.socket && this.socket.connected) {
      this.socket.emit('player-ready');
    }
  }

  // ✅ ปรับปรุงการจัดการ input เพื่อส่งไปยัง server
  setupEventListeners() {
    document.addEventListener('keydown', (e) => {
      this.handleKeyPress(e);
    });

    // เพิ่ม UI controls
    this.setupUIControls();
  }

  setupUIControls() {
    // ปุ่มเข้าห้อง
    const joinBtn = document.getElementById('join-room-btn');
    if (joinBtn) {
      joinBtn.addEventListener('click', () => {
        const roomInput = document.getElementById('room-input');
        const roomId = roomInput ? roomInput.value : '';
        this.joinRoom(roomId);
      });
    }

    // ปุ่มพร้อมเล่น
    const readyBtn = document.getElementById('ready-btn');
    if (readyBtn) {
      readyBtn.addEventListener('click', () => {
        this.playerReady();
      });
    }
  }

  // ✅ ปรับปรุงการส่งคำสั่งเกม
  handleKeyPress(e) {
    if (!this.gameState?.gameStarted) return;
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
      // ส่งคำสั่งไปยัง server (ตรงกับ 'game-action' ใน server)
      this.socket.emit('game-action', actions[e.key]);
    }
  }

  // ✅ เพิ่มฟังก์ชันจัดการ delta updates
  applyDelta(delta) {
    if (!this.gameState) return;

    const playerKey = `player${delta.playerNumber}`;
    const playerState = this.gameState[playerKey];

    delta.changes.forEach(change => {
      switch (change.type) {
        case 'position':
          playerState.currentX = change.to.x;
          playerState.currentY = change.to.y;
          break;

        case 'rotation':
          playerState.currentPiece.shape = change.shape;
          break;

        case 'hard-drop':
          playerState.currentY = change.newY;
          playerState.score += change.scoreGain;
          break;

        case 'piece-placed':
          // อัพเดท grid และสถิติ
          Object.assign(playerState, change.newStats);
          break;

        case 'new-piece':
          playerState.currentPiece = change.currentPiece;
          playerState.nextPiece = change.nextPiece;
          playerState.currentX = 4;
          playerState.currentY = 0;
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

  // ✅ เพิ่มฟังก์ชันจัดการเกมจบ
  handleGameOver(result) {
    this.gameState.winner = result.winner;
    
    // แสดงผลลัพธ์
    const message = result.winner === 'draw' 
      ? 'เสมอ!' 
      : `ผู้เล่น ${result.winner} ชนะ!`;
    
    this.showGameOverModal(message, result.finalScores);
  }

  showGameOverModal(message, scores) {
    // สร้าง modal แสดงผล
    const modal = document.createElement('div');
    modal.className = 'game-over-modal';
    modal.innerHTML = `
      <div class="modal-content">
        <h2>${message}</h2>
        <div class="scores">
          <p>ผู้เล่น 1: ${scores.player1}</p>
          <p>ผู้เล่น 2: ${scores.player2}</p>
        </div>
        <button onclick="this.parentElement.parentElement.remove()">ปิด</button>
      </div>
    `;
    document.body.appendChild(modal);
  }

  // ✅ เพิ่มฟังก์ชัน utility
  updateUI(message) {
    const statusEl = document.getElementById('status');
    if (statusEl) {
      statusEl.textContent = message;
    }
  }

  startGameLoop() {
    // เริ่ม game loop สำหรับการตกของชิ้นส่วน
    if (this.dropInterval) {
      clearInterval(this.dropInterval);
    }

    this.dropInterval = setInterval(() => {
      if (this.gameState?.gameStarted && this.socket?.connected) {
        this.socket.emit('game-action', { type: 'move-down' });
      }
    }, 1000); // ตกทุก 1 วินาที
  }

  // Canvas setup และ rendering methods (เหมือนเดิม)
  setupCanvas() {
    this.canvas = document.getElementById('game-canvas');
    if (!this.canvas) return;
    
    this.ctx = this.canvas.getContext('2d');
    this.canvas.width = 800;
    this.canvas.height = 600;
    
    // Enable hardware acceleration
    this.ctx.imageSmoothingEnabled = false;
    
    // Pre-render block textures
    this.blockTextures = this.createBlockTextures();
  }

  createBlockTextures() {
    const textures = {};
    const colors = {
      'block-i': '#00f0f0',
      'block-o': '#f0f000', 
      'block-t': '#a000f0',
      'block-s': '#00f000',
      'block-z': '#f00000',
      'block-j': '#0000f0',
      'block-l': '#f0a000'
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
      ctx.lineWidth = 2;
      ctx.strokeRect(1, 1, this.TILE_SIZE-2, this.TILE_SIZE-2);
      
      textures[type] = canvas;
    });

    return textures;
  }

  // ส่วนที่เหลือของ rendering methods...
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

  // เพิ่ม methods ที่เหลือตามต้นฉบับ...
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

  renderGame() {
    if (!this.ctx || !this.gameState) return;
    
    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    
    this.renderPlayerBoard(50, 50, this.gameState.player1, 1);
    this.renderPlayerBoard(450, 50, this.gameState.player2, 2);
    
    this.renderUI();
  }

  renderPlayerBoard(offsetX, offsetY, playerState, playerNumber) {
    if (!playerState) return;
    
    const tileSize = this.TILE_SIZE;
    
    this.ctx.fillStyle = 'rgba(0, 0, 0, 0.8)';
    this.ctx.fillRect(offsetX, offsetY, 10 * tileSize, 20 * tileSize);
    
    // Draw placed blocks
    for (let row = 0; row < 20; row++) {
      for (let col = 0; col < 10; col++) {
        const blockType = playerState.grid?.[row]?.[col];
        if (blockType && this.blockTextures[blockType]) {
          this.ctx.drawImage(
            this.blockTextures[blockType],
            offsetX + col * tileSize,
            offsetY + row * tileSize
          );
        }
      }
    }

    // Draw current piece
    if (playerState.currentPiece && playerState.alive) {
      this.ctx.save();
      this.ctx.shadowColor = '#ffffff';
      this.ctx.shadowBlur = 10;
      
      const piece = playerState.currentPiece;
      for (let row = 0; row < piece.shape.length; row++) {
        for (let col = 0; col < piece.shape[row].length; col++) {
          if (piece.shape[row][col] && this.blockTextures[piece.color]) {
            this.ctx.drawImage(
              this.blockTextures[piece.color],
              offsetX + (playerState.currentX + col) * tileSize,
              offsetY + (playerState.currentY + row) * tileSize
            );
          }
        }
      }
      this.ctx.restore();
    }

    if (!playerState.alive) {
      this.ctx.fillStyle = 'rgba(255, 0, 0, 0.7)';
      this.ctx.fillRect(offsetX, offsetY, 10 * tileSize, 20 * tileSize);
      
      this.ctx.fillStyle = 'white';
      this.ctx.font = 'bold 24px Arial';
      this.ctx.textAlign = 'center';
      this.ctx.fillText(
        'GAME OVER',
        offsetX + 5 * tileSize,
        offsetY + 10 * tileSize
      );
    }

    if (playerNumber === this.playerNumber) {
      this.ctx.strokeStyle = '#00ff00';
      this.ctx.lineWidth = 3;
      this.ctx.strokeRect(offsetX - 2, offsetY - 2, 10 * tileSize + 4, 20 * tileSize + 4);
    }
  }

  renderUI() {
    this.ctx.fillStyle = 'white';
    this.ctx.font = '14px Arial';
    this.ctx.textAlign = 'left';
    this.ctx.fillText(`FPS: ${this.performanceMetrics.fps}`, 10, 20);
    
    if (this.gameState) {
      this.ctx.textAlign = 'center';
      this.ctx.font = 'bold 18px Arial';
      
      this.ctx.fillText(
        `P1: ${this.gameState.player1?.score || 0}`,
        125, 30
      );
      
      this.ctx.fillText(
        `P2: ${this.gameState.player2?.score || 0}`,
        525, 30
      );
    }
  }

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

  deepCloneState(state) {
    if (!state) return null;
    return {
      player1: { 
        ...state.player1, 
        grid: state.player1.grid?.map(row => [...row]) 
      },
      player2: { 
        ...state.player2, 
        grid: state.player2.grid?.map(row => [...row]) 
      },
      gameStarted: state.gameStarted,
      winner: state.winner
    };
  }

  darkenColor(color, factor) {
    const num = parseInt(color.slice(1), 16);
    const amt = Math.round(2.55 * factor * 100);
    const R = (num >> 16) - amt;
    const G = (num >> 8 & 0x00FF) - amt;
    const B = (num & 0x0000FF) - amt;
    return `#${(0x1000000 + (R < 255 ? R < 1 ? 0 : R : 255) * 0x10000 +
      (G < 255 ? G < 1 ? 0 : G : 255) * 0x100 +
      (B < 255 ? B < 1 ? 0 : B : 255)).toString(16).slice(1)}`;
  }

  lightenColor(color, factor) {
    const num = parseInt(color.slice(1), 16);
    const amt = Math.round(2.55 * factor * 100);
    const R = (num >> 16) + amt;
    const G = (num >> 8 & 0x00FF) + amt;
    const B = (num & 0x0000FF) + amt;
    return `#${(0x1000000 + (R > 255 ? 255 : R) * 0x10000 +
      (G > 255 ? 255 : G) * 0x100 +
      (B > 255 ? 255 : B)).toString(16).slice(1)}`;
  }
}

// เริ่มต้น client
const game = new OptimizedTetrisClient();

// Client-side game logic
class TetrisClient {
  constructor() {
    this.socket = null;
    this.roomId = null;
    this.playerNumber = null;
    this.playerName = '';
    this.gameState = null;
    this.dropInterval = null;
    this.connected = false;
    
    this.TILE_SIZE = 28;
    this.initializeSocket();
    this.setupEventListeners();
    this.createNotificationSystem();
    
    // Show connection status
    this.updateConnectionStatus(false);
  }

  createNotificationSystem() {
    // Create notification container if it doesn't exist
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
    `;
    notification.textContent = message;
    
    const container = document.getElementById('notification-container');
    container.appendChild(notification);
    
    // Animate in
    setTimeout(() => {
      notification.style.transform = 'translateX(0)';
    }, 10);
    
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

    this.socket.on('joined-room', (data) => {
      this.roomId = data.roomId;
      this.playerNumber = data.playerNumber;
      this.playerName = data.playerName;
      this.updateRoomInfo(data.roomPlayers);
      this.showScreen('waiting-screen');
      this.showNotification(`เข้าร่วมห้อง ${data.roomId} สำเร็จ`);
    });

    this.socket.on('player-joined', (data) => {
      this.updateRoomInfo(data.roomPlayers);
      this.showNotification('ผู้เล่นใหม่เข้าร่วม');
    });

    this.socket.on('player-left', () => {
      this.showNotification('ผู้เล่นอีกคนออกจากห้อง', 'error');
      this.showScreen('waiting-screen');
      // Reset ready status when player leaves
      this.resetReadyState();
    });

    this.socket.on('player-disconnected', (data) => {
      this.showNotification(`ผู้เล่น ${data.playerNumber} หลุดการเชื่อมต่อ`, 'error');
      // Reset ready status when player disconnects
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

    this.socket.on('game-update', (gameState) => {
      this.gameState = gameState;
      this.updateGameDisplay();
    });

    this.socket.on('game-over', (data) => {
      this.endGame(data);
    });

    this.socket.on('game-reset', () => {
      // Reset game state for new round
      this.gameState = null;
      this.resetReadyState();
      this.showScreen('waiting-screen');
      this.showNotification('🔄 เตรียมตัวสำหรับรอบใหม่!');
    });

    this.socket.on('error', (message) => {
      this.showNotification(message, 'error');
    });
  }

  setupEventListeners() {
    // Menu buttons
    document.getElementById('btn-create-room').addEventListener('click', () => {
      this.showScreen('create-room-screen');
    });

    document.getElementById('btn-join-room').addEventListener('click', () => {
      this.showScreen('join-room-screen');
    });

    // Room creation
    document.getElementById('btn-confirm-create').addEventListener('click', () => {
      this.createRoom();
    });

    document.getElementById('btn-confirm-join').addEventListener('click', () => {
      this.joinRoom();
    });

    // Game controls
    document.getElementById('btn-ready').addEventListener('click', () => {
      this.setReady();
    });

    document.getElementById('btn-leave-room').addEventListener('click', () => {
      this.leaveRoom();
    });

    document.getElementById('btn-play-again').addEventListener('click', () => {
      this.playAgain();
    });

    // Keyboard controls
    document.addEventListener('keydown', (e) => {
      this.handleKeyPress(e);
    });

    // Touch controls for mobile
    this.setupTouchControls();

    // Mobile control buttons
    this.setupMobileButtons();
  }
// แก้ไขส่วน Socket event handlers

    this.socket.on('player-ready', (data) => {
      console.log('Player ready event:', data);
      this.updatePlayerReady(data.playerNumber);
      
      // อัพเดทข้อมูลผู้เล่นถ้ามี
      if (data.roomPlayers) {
        this.updateRoomInfo(data.roomPlayers);
      }
      
      // ตรวจสอบว่าผู้เล่นทั้งคู่พร้อมหรือไม่
      this.checkAllPlayersReady(data.roomPlayers);
    });

    this.socket.on('game-start', (data) => {
      console.log('Game start event:', data);
      this.gameState = data.gameState || data; // รองรับทั้งสองรูปแบบ
      this.startGameLoop();
      this.showScreen('game-screen');
      this.showNotification('เกมเริ่มแล้ว! 🎮');
    });

  // เพิ่มฟังก์ชันตรวจสอบผู้เล่นพร้อม
  checkAllPlayersReady(players) {
    if (!players || players.length !== 2) return;
    
    const allReady = players.every(player => player.ready);
    if (allReady) {
      this.showNotification('ผู้เล่นทั้งคู่พร้อมแล้ว! กำลังเริ่มเกม...', 'info');
      
      // แสดง countdown (ถ้าต้องการ)
      let countdown = 3;
      const countdownInterval = setInterval(() => {
        if (countdown > 0) {
          this.showNotification(`เริ่มเกมใน ${countdown} วินาที...`, 'info');
          countdown--;
        } else {
          clearInterval(countdownInterval);
        }
      }, 1000);
    }
  }

  setReady() {
    console.log('Setting player ready...');
    if (!this.socket || !this.roomId) {
      this.showNotification('ไม่สามารถเชื่อมต่อได้', 'error');
      return;
    }
    
    this.socket.emit('player-ready');
    
    const readyBtn = document.getElementById('btn-ready');
    if (readyBtn) {
      readyBtn.disabled = true;
      readyBtn.textContent = '✅ พร้อมแล้ว';
      readyBtn.style.background = '#4CAF50';
    }
    
    this.showNotification('คุณพร้อมเล่นแล้ว! รอผู้เล่นอีกคน...');
  }

  updateRoomInfo(players) {
    console.log('Updating room info:', players);
    
    const roomIdElement = document.getElementById('room-id-display');
    const playersListElement = document.getElementById('players-list');
    
    if (roomIdElement) {
      roomIdElement.textContent = this.roomId;
    }
    
    if (playersListElement) {
      playersListElement.innerHTML = '';
      players.forEach(player => {
        const li = document.createElement('li');
        li.style.cssText = `
          padding: 10px;
          margin: 5px 0;
          border-radius: 8px;
          background: rgba(255,255,255,0.1);
          list-style: none;
        `;
        
        const statusIcon = player.ready ? '✅' : '⏳';
        const statusText = player.ready ? 'พร้อม' : 'รอ...';
        
        li.innerHTML = `
          <strong>${player.playerName}</strong> (Player ${player.playerNumber})
          <br><small>${statusIcon} ${statusText}</small>
        `;
        
        if (player.playerNumber === this.playerNumber) {
          li.style.border = '2px solid #FFD700';
          li.style.background = 'rgba(255, 215, 0, 0.2)';
        }
        
        playersListElement.appendChild(li);
      });
    }

    // เปิดใช้งานปุ่ม Ready เมื่อมีผู้เล่น 2 คน
    const readyBtn = document.getElementById('btn-ready');
    if (readyBtn && players.length === 2 && !readyBtn.disabled) {
      readyBtn.disabled = false;
      readyBtn.style.background = '#2196F3';
    }
    
    // แสดงสถานะห้อง
    const statusMsg = players.length === 1 ? 
      'รอผู้เล่นคนที่ 2...' : 
      'ห้องเต็มแล้ว! คลิกพร้อมเล่นเพื่อเริ่มเกม';
    
    const statusElement = document.getElementById('room-status');
    if (statusElement) {
      statusElement.textContent = statusMsg;
      statusElement.style.color = players.length === 2 ? '#4CAF50' : '#FFA726';
    }
  }

  // เพิ่มการแสดงสถานะการเชื่อมต่อ
  showConnectionStatus() {
    const status = this.socket?.connected ? 'เชื่อมต่อแล้ว' : 'ไม่ได้เชื่อมต่อ';
    const color = this.socket?.connected ? '#4CAF50' : '#f44336';
    
    console.log(`Connection status: ${status}`);
    this.updateConnectionStatus(this.socket?.connected || false);
  }
  setupMobileButtons() {
    const buttons = document.querySelectorAll('.control-button');
    buttons.forEach((button, index) => {
      button.addEventListener('click', () => {
        if (!this.gameState || !this.gameState.gameStarted) return;
        
        const playerState = this.gameState[`player${this.playerNumber}`];
        if (!playerState || !playerState.alive) return;

        switch (index) {
          case 0: // Rotate
            this.socket.emit('game-action', { type: 'rotate' });
            break;
          case 1: // Up/Rotate
            this.socket.emit('game-action', { type: 'rotate' });
            break;
          case 2: // Hard drop
            this.socket.emit('game-action', { type: 'hard-drop' });
            break;
          case 3: // Left
            this.socket.emit('game-action', { type: 'move-left' });
            break;
          case 4: // Down
            this.socket.emit('game-action', { type: 'move-down' });
            break;
          case 5: // Right
            this.socket.emit('game-action', { type: 'move-right' });
            break;
        }
      });
    });
  }

  // Generate 5-digit random room code
  generateRoomCode() {
    return Math.floor(10000 + Math.random() * 90000).toString();
  }

  createRoom() {
    const playerName = document.getElementById('create-player-name').value.trim();
    if (!playerName) {
      this.showNotification('กรุณาใส่ชื่อผู้เล่น', 'error');
      return;
    }
    const roomId = this.generateRoomCode();
    this.joinGameRoom(roomId, playerName);
  }

  joinRoom() {
    const playerName = document.getElementById('join-player-name').value.trim();
    const roomId = document.getElementById('join-room-id').value.trim();
    
    if (!playerName || !roomId) {
      this.showNotification('กรุณาใส่ข้อมูลให้ครบถ้วน', 'error');
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
    
    this.socket.emit('join-room', { roomId, playerName });
  }

  setReady() {
    this.socket.emit('player-ready');
    document.getElementById('btn-ready').disabled = true;
    document.getElementById('btn-ready').textContent = '✅ พร้อมแล้ว';
    this.showNotification('คุณพร้อมเล่นแล้ว');
  }

  resetReadyState() {
    const readyBtn = document.getElementById('btn-ready');
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
    // Create confirmation modal
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
      <h3 style="margin-bottom: 20px;">🚪 ออกจากห้อง</h3>
      <p style="margin-bottom: 30px;">คุณต้องการออกจากห้องหรือไม่?</p>
      <div style="display: flex; gap: 15px; justify-content: center;">
        <button id="confirm-leave" style="
          padding: 12px 25px;
          background: #f44336;
          color: white;
          border: none;
          border-radius: 10px;
          cursor: pointer;
          font-weight: bold;
          transition: all 0.3s ease;
        ">ออกจากห้อง</button>
        <button id="cancel-leave" style="
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
    
    // Add hover effects
    const buttons = dialog.querySelectorAll('button');
    buttons.forEach(btn => {
      btn.addEventListener('mouseenter', () => {
        btn.style.transform = 'translateY(-2px)';
        btn.style.boxShadow = '0 5px 15px rgba(0,0,0,0.3)';
      });
      btn.addEventListener('mouseleave', () => {
        btn.style.transform = 'translateY(0)';
        btn.style.boxShadow = 'none';
      });
    });
    
    dialog.querySelector('#confirm-leave').addEventListener('click', () => {
      this.socket.emit('leave-room');
      this.roomId = null;
      this.playerNumber = null;
      this.gameState = null;
      this.showScreen('menu-screen');
      document.body.removeChild(modal);
      this.showNotification('ออกจากห้องแล้ว');
    });
    
    dialog.querySelector('#cancel-leave').addEventListener('click', () => {
      document.body.removeChild(modal);
    });
    
    // Close on backdrop click
    modal.addEventListener('click', (e) => {
      if (e.target === modal) {
        document.body.removeChild(modal);
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
    
    // Reset ready state and go back to waiting screen
    this.resetReadyState();
    this.showScreen('waiting-screen');
    
    // Request new game from server (if needed)
    this.socket.emit('request-new-game');
    
    // Show notification
    this.showNotification('🎮 เตรียมตัวสำหรับเกมใหม่!');
  }

  startGameLoop() {
    // Clear any existing interval
    if (this.dropInterval) {
      clearInterval(this.dropInterval);
    }
    
    this.dropInterval = setInterval(() => {
      if (this.gameState && this.gameState.gameStarted) {
        const playerState = this.gameState[`player${this.playerNumber}`];
        if (playerState && playerState.alive) {
          this.socket.emit('game-action', { type: 'move-down' });
        }
      }
    }, 1000);
  }

  updateGameDisplay() {
    if (!this.gameState) return;

    // Update player 1 board (left side)
    this.drawPlayerBoard('player1-board', this.gameState.player1, 1);
    this.updatePlayerStats('player1-stats', this.gameState.player1);

    // Update player 2 board (right side)  
    this.drawPlayerBoard('player2-board', this.gameState.player2, 2);
    this.updatePlayerStats('player2-stats', this.gameState.player2);

    // Highlight current player
    document.querySelectorAll('.player-board').forEach(board => {
      board.classList.remove('current-player');
    });
    if (this.playerNumber) {
      const currentBoard = document.getElementById(`player${this.playerNumber}-board`);
      if (currentBoard) {
        currentBoard.classList.add('current-player');
      }
    }
  }

  drawPlayerBoard(boardId, playerState, playerNumber) {
    const boardElement = document.getElementById(boardId);
    if (!boardElement) return;

    boardElement.innerHTML = '';

    // Draw placed blocks
    for (let row = 0; row < 20; row++) {
      for (let col = 0; col < 10; col++) {
        if (playerState.grid[row][col]) {
          const block = document.createElement('div');
          block.className = `tetris-block ${playerState.grid[row][col]}`;
          block.style.left = (col * this.TILE_SIZE) + 'px';
          block.style.top = (row * this.TILE_SIZE) + 'px';
          block.style.width = this.TILE_SIZE + 'px';
          block.style.height = this.TILE_SIZE + 'px';
          boardElement.appendChild(block);
        }
      }
    }

    // Draw current falling piece
    if (playerState.currentPiece && playerState.alive) {
      for (let row = 0; row < playerState.currentPiece.shape.length; row++) {
        for (let col = 0; col < playerState.currentPiece.shape[row].length; col++) {
          if (playerState.currentPiece.shape[row][col]) {
            const block = document.createElement('div');
            block.className = `tetris-block ${playerState.currentPiece.color}`;
            block.style.left = ((playerState.currentX + col) * this.TILE_SIZE) + 'px';
            block.style.top = ((playerState.currentY + row) * this.TILE_SIZE) + 'px';
            block.style.width = this.TILE_SIZE + 'px';
            block.style.height = this.TILE_SIZE + 'px';
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

  updatePlayerStats(statsId, playerState) {
    const statsElement = document.getElementById(statsId);
    if (!statsElement) return;

    statsElement.querySelector('.score-value').textContent = playerState.score;
    statsElement.querySelector('.lines-value').textContent = playerState.lines;
    statsElement.querySelector('.level-value').textContent = playerState.level;
  }

  handleKeyPress(event) {
    if (!this.gameState || !this.gameState.gameStarted) return;
    
    const playerState = this.gameState[`player${this.playerNumber}`];
    if (!playerState || !playerState.alive) return;

    switch (event.key) {
      case 'ArrowLeft':
        event.preventDefault();
        this.socket.emit('game-action', { type: 'move-left' });
        break;
      case 'ArrowRight':
        event.preventDefault();
        this.socket.emit('game-action', { type: 'move-right' });
        break;
      case 'ArrowDown':
        event.preventDefault();
        this.socket.emit('game-action', { type: 'move-down' });
        break;
      case 'ArrowUp':
        event.preventDefault();
        this.socket.emit('game-action', { type: 'rotate' });
        break;
      case ' ':
        event.preventDefault();
        this.socket.emit('game-action', { type: 'hard-drop' });
        break;
    }
  }

  setupTouchControls() {
    let touchStartX = 0;
    let touchStartY = 0;

    document.addEventListener('touchstart', (e) => {
      touchStartX = e.touches[0].clientX;
      touchStartY = e.touches[0].clientY;
    });

    document.addEventListener('touchend', (e) => {
      if (!this.gameState || !this.gameState.gameStarted) return;

      const deltaX = e.changedTouches[0].clientX - touchStartX;
      const deltaY = e.changedTouches[0].clientY - touchStartY;
      const threshold = 30;

      if (Math.abs(deltaX) > Math.abs(deltaY)) {
        if (deltaX > threshold) {
          this.socket.emit('game-action', { type: 'move-right' });
        } else if (deltaX < -threshold) {
          this.socket.emit('game-action', { type: 'move-left' });
        }
      } else {
        if (deltaY > threshold) {
          this.socket.emit('game-action', { type: 'hard-drop' });
        } else if (deltaY < -threshold) {
          this.socket.emit('game-action', { type: 'rotate' });
        }
      }
    });
  }

  endGame(data) {
    // Clear game loop
    if (this.dropInterval) {
      clearInterval(this.dropInterval);
      this.dropInterval = null;
    }
    
    let message = '';
    if (data.winner === 'draw') {
      message = '🤝 เสมอกัน!';
    } else if (data.winner === this.playerNumber) {
      message = '🎉 คุณชนะ!';
    } else {
      message = '😔 คุณแพ้';
    }

    document.getElementById('winner-message').textContent = message;
    document.getElementById('final-score-p1').textContent = data.finalScores.player1;
    document.getElementById('final-score-p2').textContent = data.finalScores.player2;
    
    // Reset play again button
    const playAgainBtn = document.getElementById('btn-play-again');
    if (playAgainBtn) {
      playAgainBtn.disabled = false;
      playAgainBtn.textContent = '🔄 เล่นอีกครั้ง';
    }
    
    this.showScreen('game-over-screen');
    this.showNotification(message);
  }

  updateRoomInfo(players) {
    const roomIdElement = document.getElementById('room-id-display');
    const playersListElement = document.getElementById('players-list');
    
    if (roomIdElement) {
      roomIdElement.textContent = this.roomId;
    }
    
    if (playersListElement) {
      playersListElement.innerHTML = '';
      players.forEach(player => {
        const li = document.createElement('li');
        li.textContent = `${player.playerName} (Player ${player.playerNumber})`;
        if (player.playerNumber === this.playerNumber) {
          li.classList.add('current-player');
        }
        playersListElement.appendChild(li);
      });
    }

    // Enable ready button if room has 2 players
    const readyBtn = document.getElementById('btn-ready');
    if (readyBtn && players.length === 2) {
      readyBtn.disabled = false;
    }
  }

  updatePlayerReady(playerNumber) {
    const indicator = document.getElementById(`ready-indicator-${playerNumber}`);
    if (indicator) {
      indicator.textContent = `Player ${playerNumber}: ✅ พร้อม`;
      indicator.style.color = '#4CAF50';
      indicator.style.fontWeight = 'bold';
    }
  }

  updateConnectionStatus(connected) {
    const statusElement = document.getElementById('connection-status');
    if (statusElement) {
      statusElement.textContent = connected ? '🟢 เชื่อมต่อแล้ว' : '🔴 ไม่ได้เชื่อมต่อ';
      statusElement.className = `connection-status ${connected ? 'connected' : 'disconnected'}`;
    }
  }

  showScreen(screenId) {
    // Hide all screens
    document.querySelectorAll('.screen').forEach(screen => {
      screen.style.display = 'none';
    });
    
    // Show target screen
    const targetScreen = document.getElementById(screenId);
    if (targetScreen) {
      targetScreen.style.display = 'block';
    }

    // Reset ready button and state when going back to waiting
    if (screenId === 'waiting-screen') {
      this.resetReadyState();
    }
  }

  showMessage(message) {
    this.showNotification(message);
  }
}

// Initialize client when page loads
document.addEventListener('DOMContentLoaded', () => {
  new TetrisClient();
});

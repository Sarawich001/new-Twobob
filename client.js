// Enhanced Client-side Tetris Multiplayer Game Logic
class TetrisClient {
    constructor() {
        this.socket = null;
        this.roomId = null;
        this.playerNumber = null;
        this.playerName = '';
        this.gameState = null;
        this.dropInterval = null;
        this.connected = false;
        this.reconnectAttempts = 0;
        this.maxReconnectAttempts = 5;
        this.gameStartTime = null;
        this.animationFrame = null;
        
        this.TILE_SIZE = 28;
        this.RECONNECT_DELAY = 3000;
        
        this.initializeSocket();
        this.setupEventListeners();
        this.createNotificationSystem();
        this.initializeResponsiveness();
        
        // Show initial connection status
        this.updateConnectionStatus(false);
        
        // Preload audio (if needed)
        this.initializeAudio();
    }

    // === UTILITY FUNCTIONS ===
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
                pointer-events: none;
            `;
            document.body.appendChild(container);
        }
    }

    showNotification(message, type = 'info', duration = 3000) {
        const notification = document.createElement('div');
        const colors = {
            error: 'rgba(244, 67, 54, 0.95)',
            success: 'rgba(76, 175, 80, 0.95)',
            warning: 'rgba(255, 193, 7, 0.95)',
            info: 'rgba(33, 150, 243, 0.95)'
        };

        notification.style.cssText = `
            background: ${colors[type] || colors.info};
            color: white;
            padding: 12px 18px;
            border-radius: 8px;
            backdrop-filter: blur(10px);
            box-shadow: 0 4px 20px rgba(0,0,0,0.15);
            font-weight: 500;
            font-size: 14px;
            max-width: 320px;
            word-wrap: break-word;
            transform: translateX(100%);
            transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
            border-left: 4px solid rgba(255,255,255,0.3);
            pointer-events: auto;
        `;
        notification.textContent = message;
        
        const container = document.getElementById('notification-container');
        container.appendChild(notification);
        
        // Animate in
        requestAnimationFrame(() => {
            notification.style.transform = 'translateX(0)';
        });
        
        // Auto remove
        setTimeout(() => {
            notification.style.transform = 'translateX(100%)';
            notification.style.opacity = '0';
            setTimeout(() => {
                if (notification.parentNode) {
                    notification.parentNode.removeChild(notification);
                }
            }, 300);
        }, duration);

        // Click to dismiss
        notification.addEventListener('click', () => {
            notification.style.transform = 'translateX(100%)';
            notification.style.opacity = '0';
        });
    }

    showScreen(screenId) {
        // Hide all screens with fade effect
        document.querySelectorAll('.screen').forEach(screen => {
            screen.style.opacity = '0';
            setTimeout(() => {
                screen.style.display = 'none';
            }, 200);
        });

        // Show target screen with fade in
        setTimeout(() => {
            const targetScreen = document.getElementById(screenId);
            if (targetScreen) {
                targetScreen.style.display = 'block';
                requestAnimationFrame(() => {
                    targetScreen.style.opacity = '1';
                });
            }
        }, 200);
    }

    generateRoomCode() {
        return Math.floor(10000 + Math.random() * 90000).toString();
    }

    initializeAudio() {
        // Initialize audio context for sound effects (optional)
        this.audioContext = null;
        this.sounds = {};
        
        try {
            this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
        } catch (e) {
            console.log('Audio context not available');
        }
    }

    // === SOCKET CONNECTION ===
    initializeSocket() {
        this.socket = io({
            timeout: 10000,
            forceNew: true,
            transports: ['websocket', 'polling']
        });
        
        this.socket.on('connect', () => {
            console.log('Connected to server');
            this.connected = true;
            this.reconnectAttempts = 0;
            this.updateConnectionStatus(true);
            this.showNotification('เชื่อมต่อเซิร์ฟเวอร์สำเร็จ', 'success');
        });

        this.socket.on('disconnect', (reason) => {
            console.log('Disconnected from server:', reason);
            this.connected = false;
            this.updateConnectionStatus(false);
            
            if (reason === 'io server disconnect') {
                // Server initiated disconnect
                this.socket.connect();
            }
            
            this.showScreen('connection-screen');
            this.showNotification('การเชื่อมต่อขาดหาย กำลังลองเชื่อมต่อใหม่...', 'warning');
            this.attemptReconnect();
        });

        this.socket.on('connect_error', (error) => {
            console.error('Connection error:', error);
            this.connected = false;
            this.updateConnectionStatus(false);
            this.attemptReconnect();
        });

        this.socket.on('joined-room', (data) => {
            this.roomId = data.roomId;
            this.playerNumber = data.playerNumber;
            this.playerName = data.playerName;
            this.updateRoomInfo(data.roomPlayers);
            this.showScreen('waiting-screen');
            this.showNotification(`เข้าร่วมห้อง ${data.roomId} สำเร็จ`, 'success');
        });

        this.socket.on('player-joined', (data) => {
            this.updateRoomInfo(data.roomPlayers);
            this.showNotification('ผู้เล่นใหม่เข้าร่วม', 'info');
        });

        this.socket.on('player-left', () => {
            this.showNotification('ผู้เล่นอีกคนออกจากห้อง', 'warning');
            this.showScreen('waiting-screen');
            this.resetReadyState();
        });

        this.socket.on('player-disconnected', (data) => {
            this.showNotification(`ผู้เล่น ${data.playerNumber} หลุดการเชื่อมต่อ`, 'warning');
            this.pauseGame();
        });

        this.socket.on('player-reconnected', (data) => {
            this.showNotification(`ผู้เล่น ${data.playerNumber} เชื่อมต่อกลับมาแล้ว`, 'success');
            this.resumeGame();
        });

        this.socket.on('room-full', () => {
            this.showNotification('ห้องเต็มแล้ว กรุณาลองใหม่อีกครั้ง', 'error');
            this.showScreen('menu-screen');
        });

        this.socket.on('room-not-found', () => {
            this.showNotification('ไม่พบห้องนี้ กรุณาตรวจสอบรหัสห้อง', 'error');
        });

        this.socket.on('player-ready', (data) => {
            this.updatePlayerReady(data.playerNumber);
        });

        this.socket.on('game-start', (gameState) => {
            this.gameState = gameState;
            this.gameStartTime = Date.now();
            this.startGameLoop();
            this.showScreen('game-screen');
            this.showNotification('เกมเริ่มแล้ว!', 'success');
        });

        this.socket.on('game-update', (gameState) => {
            this.gameState = gameState;
            this.updateGameDisplay();
        });

        this.socket.on('game-paused', () => {
            this.pauseGame();
            this.showNotification('เกมหยุดชั่วคราว - รอผู้เล่นเชื่อมต่อกลับ', 'warning', 5000);
        });

        this.socket.on('game-resumed', () => {
            this.resumeGame();
            this.showNotification('เกมดำเนินต่อ', 'success');
        });

        this.socket.on('game-over', (data) => {
            this.endGame(data);
        });

        this.socket.on('game-reset', () => {
            this.gameState = null;
            this.resetReadyState();
            this.showScreen('waiting-screen');
            this.showNotification('🔄 เตรียมตัวสำหรับรอบใหม่!', 'info');
        });

        this.socket.on('error', (message) => {
            this.showNotification(message, 'error');
        });
    }

    attemptReconnect() {
        if (this.reconnectAttempts >= this.maxReconnectAttempts) {
            this.showNotification('ไม่สามารถเชื่อมต่อได้ กรุณาโหลดหน้าใหม่', 'error', 10000);
            return;
        }

        this.reconnectAttempts++;
        const delay = Math.min(this.RECONNECT_DELAY * this.reconnectAttempts, 10000);
        
        setTimeout(() => {
            if (!this.connected) {
                this.showNotification(`กำลังลองเชื่อมต่อครั้งที่ ${this.reconnectAttempts}...`, 'info');
                this.socket.connect();
            }
        }, delay);
    }

    // === EVENT LISTENERS ===
    setupEventListeners() {
        // Menu buttons
        const createRoomBtn = document.getElementById('btn-create-room');
        const joinRoomBtn = document.getElementById('btn-join-room');
        
        if (createRoomBtn) {
            createRoomBtn.addEventListener('click', () => {
                this.showScreen('create-room-screen');
            });
        }

        if (joinRoomBtn) {
            joinRoomBtn.addEventListener('click', () => {
                this.showScreen('join-room-screen');
            });
        }

        // Room creation/joining
        const confirmCreateBtn = document.getElementById('btn-confirm-create');
        const confirmJoinBtn = document.getElementById('btn-confirm-join');
        
        if (confirmCreateBtn) {
            confirmCreateBtn.addEventListener('click', () => {
                this.createRoom();
            });
        }

        if (confirmJoinBtn) {
            confirmJoinBtn.addEventListener('click', () => {
                this.joinRoom();
            });
        }

        // Game controls
        const readyBtn = document.getElementById('btn-ready');
        const leaveRoomBtn = document.getElementById('btn-leave-room');
        const playAgainBtn = document.getElementById('btn-play-again');
        
        if (readyBtn) {
            readyBtn.addEventListener('click', () => {
                this.setReady();
            });
        }

        if (leaveRoomBtn) {
            leaveRoomBtn.addEventListener('click', () => {
                this.leaveRoom();
            });
        }

        if (playAgainBtn) {
            playAgainBtn.addEventListener('click', () => {
                this.playAgain();
            });
        }

        // Keyboard controls
        document.addEventListener('keydown', (e) => {
            this.handleKeyPress(e);
        });

        // Prevent context menu on game area
        const gameContainer = document.querySelector('.game-container');
        if (gameContainer) {
            gameContainer.addEventListener('contextmenu', (e) => {
                e.preventDefault();
            });
        }

        // Touch controls for mobile
        this.setupTouchControls();
        this.setupMobileButtons();

        // Enter key for forms
        const createPlayerNameInput = document.getElementById('create-player-name');
        const joinRoomIdInput = document.getElementById('join-room-id');
        const joinPlayerNameInput = document.getElementById('join-player-name');
        
        if (createPlayerNameInput) {
            createPlayerNameInput.addEventListener('keypress', (e) => {
                if (e.key === 'Enter') this.createRoom();
            });
        }

        if (joinRoomIdInput) {
            joinRoomIdInput.addEventListener('keypress', (e) => {
                if (e.key === 'Enter') this.joinRoom();
            });
            
            // Room ID input validation
            joinRoomIdInput.addEventListener('input', (e) => {
                e.target.value = e.target.value.replace(/[^0-9]/g, '').substring(0, 5);
            });
        }

        if (joinPlayerNameInput) {
            joinPlayerNameInput.addEventListener('keypress', (e) => {
                if (e.key === 'Enter') this.joinRoom();
            });
        }

        // Focus management
        this.setupFocusManagement();
    }

    setupFocusManagement() {
        // Auto-focus first input when screens change
        const observer = new MutationObserver((mutations) => {
            mutations.forEach((mutation) => {
                if (mutation.type === 'attributes' && mutation.attributeName === 'style') {
                    const target = mutation.target;
                    if (target.style.display === 'block' && target.classList.contains('screen')) {
                        const firstInput = target.querySelector('input[type="text"]');
                        if (firstInput) {
                            setTimeout(() => firstInput.focus(), 100);
                        }
                    }
                }
            });
        });

        document.querySelectorAll('.screen').forEach(screen => {
            observer.observe(screen, { attributes: true });
        });
    }

    // === ROOM MANAGEMENT ===
    createRoom() {
        const playerNameInput = document.getElementById('create-player-name');
        if (!playerNameInput) return;
        
        const playerName = playerNameInput.value.trim();
        if (!playerName) {
            this.showNotification('กรุณาใส่ชื่อผู้เล่น', 'error');
            playerNameInput.focus();
            return;
        }

        if (playerName.length > 20) {
            this.showNotification('ชื่อผู้เล่นยาวเกินไป (สูงสุด 20 ตัวอักษร)', 'error');
            return;
        }

        const roomId = this.generateRoomCode();
        this.joinGameRoom(roomId, playerName);
    }

    joinRoom() {
        const playerNameInput = document.getElementById('join-player-name');
        const roomIdInput = document.getElementById('join-room-id');
        
        if (!playerNameInput || !roomIdInput) return;
        
        const playerName = playerNameInput.value.trim();
        const roomId = roomIdInput.value.trim();
        
        if (!playerName || !roomId) {
            this.showNotification('กรุณาใส่ชื่อผู้เล่นและรหัสห้อง', 'error');
            if (!playerName) playerNameInput.focus();
            else roomIdInput.focus();
            return;
        }

        if (playerName.length > 20) {
            this.showNotification('ชื่อผู้เล่นยาวเกินไป (สูงสุด 20 ตัวอักษร)', 'error');
            return;
        }

        if (roomId.length !== 5 || !/^\d+$/.test(roomId)) {
            this.showNotification('รหัสห้องต้องเป็นตัวเลข 5 หลัก', 'error');
            roomIdInput.focus();
            return;
        }

        this.joinGameRoom(roomId, playerName);
    }

    joinGameRoom(roomId, playerName) {
        if (!this.connected) {
            this.showNotification('ไม่ได้เชื่อมต่อกับเซิร์ฟเวอร์', 'error');
            return;
        }

        // Disable button to prevent double-clicking
        const buttons = document.querySelectorAll('button');
        buttons.forEach(btn => btn.disabled = true);
        
        this.socket.emit('join-room', { roomId, playerName });
        
        // Re-enable buttons after a short delay
        setTimeout(() => {
            buttons.forEach(btn => btn.disabled = false);
        }, 2000);
    }

    setReady() {
        if (!this.roomId) return;
        
        const readyBtn = document.getElementById('btn-ready');
        if (readyBtn) {
            readyBtn.disabled = true;
            readyBtn.textContent = '⏳ กำลังส่ง...';
        }
        
        this.socket.emit('player-ready');
    }

    leaveRoom() {
        if (this.roomId) {
            this.socket.emit('leave-room');
        }
        this.resetGame();
        this.showScreen('menu-screen');
    }

    playAgain() {
        if (this.roomId) {
            const playAgainBtn = document.getElementById('btn-play-again');
            if (playAgainBtn) {
                playAgainBtn.disabled = true;
                playAgainBtn.textContent = '⏳ กำลังรอ...';
            }
            this.socket.emit('play-again');
        }
    }

    // === UI UPDATES ===
    updateConnectionStatus(connected) {
        const statusEl = document.getElementById('connection-status');
        if (!statusEl) return;
        
        if (connected) {
            statusEl.className = 'connection-status connected';
            statusEl.innerHTML = '<span class="status-dot connected"></span>เชื่อมต่อแล้ว';
        } else {
            statusEl.className = 'connection-status disconnected';
            statusEl.innerHTML = '<span class="status-dot disconnected"></span>ไม่ได้เชื่อมต่อ';
        }
        
        // Disable/enable buttons based on connection
        const buttons = ['btn-create-room', 'btn-join-room'];
        buttons.forEach(btnId => {
            const btn = document.getElementById(btnId);
            if (btn) {
                btn.disabled = !connected;
                if (!connected) {
                    btn.classList.add('disabled');
                } else {
                    btn.classList.remove('disabled');
                }
            }
        });
    }

    updateRoomInfo(players) {
        const roomIdDisplay = document.getElementById('room-id-display');
        if (roomIdDisplay) {
            roomIdDisplay.textContent = this.roomId;
        }
        
        const playersList = document.getElementById('players-list');
        if (playersList) {
            playersList.innerHTML = '';
            
            players.forEach((player, index) => {
                const li = document.createElement('li');
                li.className = 'player-item';
                
                const playerIcon = player.name === this.playerName ? '👤' : '👥';
                li.innerHTML = `
                    <span class="player-icon">${playerIcon}</span>
                    <span class="player-name">Player ${index + 1}: ${player.name}</span>
                    <span class="player-status" id="player-${index + 1}-status">รอ...</span>
                `;
                
                if (player.name === this.playerName) {
                    li.classList.add('current-player');
                }
                playersList.appendChild(li);
            });
        }
        
        // Update ready button state
        const readyBtn = document.getElementById('btn-ready');
        if (readyBtn) {
            readyBtn.disabled = players.length !== 2;
        }
    }

    updatePlayerReady(playerNumber) {
        const statusEl = document.getElementById(`player-${playerNumber}-status`);
        if (statusEl) {
            statusEl.textContent = '✅ พร้อมแล้ว!';
            statusEl.classList.add('ready');
        }
    }

    resetReadyState() {
        const readyBtn = document.getElementById('btn-ready');
        if (readyBtn) {
            readyBtn.disabled = false;
            readyBtn.textContent = '🎮 พร้อมเล่น';
        }
        
        // Reset ready indicators
        [1, 2].forEach(playerNum => {
            const statusEl = document.getElementById(`player-${playerNum}-status`);
            if (statusEl) {
                statusEl.textContent = 'รอ...';
                statusEl.classList.remove('ready');
            }
        });

        // Reset play again button
        const playAgainBtn = document.getElementById('btn-play-again');
        if (playAgainBtn) {
            playAgainBtn.disabled = false;
            playAgainBtn.textContent = '🔄 เล่นอีกครั้ง';
        }
    }

    resetGame() {
        this.roomId = null;
        this.playerNumber = null;
        this.playerName = '';
        this.gameState = null;
        this.gameStartTime = null;
        this.resetReadyState();
        
        if (this.dropInterval) {
            clearInterval(this.dropInterval);
            this.dropInterval = null;
        }
        
        if (this.animationFrame) {
            cancelAnimationFrame(this.animationFrame);
            this.animationFrame = null;
        }

        // Reset game boards
        [1, 2].forEach(playerNum => {
            const board = document.getElementById(`player${playerNum}-board`);
            if (board) {
                board.classList.remove('current-player', 'paused');
                board.innerHTML = '';
            }
        });
    }

    // === GAME CONTROLS ===
    handleKeyPress(e) {
        if (!this.gameState || !this.gameState.gameStarted) return;
        
        const playerState = this.gameState[`player${this.playerNumber}`];
        if (!playerState || !playerState.alive) return;

        // Prevent default for game keys
        const gameKeys = ['ArrowLeft', 'ArrowRight', 'ArrowDown', 'ArrowUp', ' ', 'a', 'd', 's', 'w'];
        if (gameKeys.includes(e.key)) {
            e.preventDefault();
        }

        let action = null;
        switch (e.key.toLowerCase()) {
            case 'arrowleft':
            case 'a':
                action = 'move-left';
                break;
            case 'arrowright':
            case 'd':
                action = 'move-right';
                break;
            case 'arrowdown':
            case 's':
                action = 'move-down';
                break;
            case 'arrowup':
            case 'w':
                action = 'rotate';
                break;
            case ' ':
                action = 'hard-drop';
                break;
            case 'p':
            case 'pause':
                this.togglePause();
                return;
        }

        if (action) {
            this.sendGameAction(action);
        }
    }

    sendGameAction(action) {
        if (this.socket && this.connected) {
            this.socket.emit('game-action', { type: action });
        }
    }

    togglePause() {
        if (this.socket && this.connected && this.gameState) {
            this.socket.emit('toggle-pause');
        }
    }

    setupMobileButtons() {
        const buttons = document.querySelectorAll('.control-button');
        buttons.forEach(button => {
            const action = button.dataset.action;
            if (action) {
                // Remove existing listeners
                button.replaceWith(button.cloneNode(true));
                const newButton = document.querySelector(`[data-action="${action}"]`);
                
                newButton.addEventListener('touchstart', (e) => {
                    e.preventDefault();
                    newButton.classList.add('pressed');
                    this.handleMobileAction(action);
                });

                newButton.addEventListener('touchend', (e) => {
                    e.preventDefault();
                    newButton.classList.remove('pressed');
                });

                newButton.addEventListener('click', (e) => {
                    e.preventDefault();
                    this.handleMobileAction(action);
                });
            }
        });
    }

    handleMobileAction(action) {
        if (!this.gameState || !this.gameState.gameStarted) return;
        
        const playerState = this.gameState[`player${this.playerNumber}`];
        if (!playerState || !playerState.alive) return;

        this.sendGameAction(action);
    }

    setupTouchControls() {
        let touchStartX = 0;
        let touchStartY = 0;
        let touchStartTime = 0;
        let touchMoved = false;

        const gameContainer = document.querySelector('.game-container');
        if (!gameContainer) return;

        gameContainer.addEventListener('touchstart', (e) => {
            if (e.touches.length === 1) {
                const touch = e.touches[0];
                touchStartX = touch.clientX;
                touchStartY = touch.clientY;
                touchStartTime = Date.now();
                touchMoved = false;
            }
        }, { passive: true });

        gameContainer.addEventListener('touchmove', (e) => {
            touchMoved = true;
        }, { passive: true });

        gameContainer.addEventListener('touchend', (e) => {
            if (!this.gameState || !this.gameState.gameStarted) return;
            
            const playerState = this.gameState[`player${this.playerNumber}`];
            if (!playerState || !playerState.alive) return;

            if (e.changedTouches.length === 1) {
                const touch = e.changedTouches[0];
                const touchEndX = touch.clientX;
                const touchEndY = touch.clientY;
                const touchEndTime = Date.now();

                const deltaX = touchEndX - touchStartX;
                const deltaY = touchEndY - touchStartY;
                const deltaTime = touchEndTime - touchStartTime;

                // Quick tap for rotate (if not moved much)
                if (!touchMoved && Math.abs(deltaX) < 20 && Math.abs(deltaY) < 20 && deltaTime < 300) {
                    this.sendGameAction('rotate');
                    return;
                }

                // Swipe gestures
                const minSwipeDistance = 40;
                if (Math.abs(deltaX) > minSwipeDistance || Math.abs(deltaY) > minSwipeDistance) {
                    if (Math.abs(deltaX) > Math.abs(deltaY)) {
                        // Horizontal swipe
                        const action = deltaX > 0 ? 'move-right' : 'move-left';
                        this.sendGameAction(action);
                    } else {
                        // Vertical swipe
                        const action = deltaY > 0 ? 'hard-drop' : 'move-down';
                        this.sendGameAction(action);
                    }
                }
            }
        }, { passive: true });
    }

    // === GAME DISPLAY ===
    startGameLoop() {
        // Add current player indicator
        const currentBoard = document.getElementById(`player${this.playerNumber}-board`);
        if (currentBoard) {
            currentBoard.classList.add('current-player');
        }

        // Start render loop
        this.gameLoop();
    }

    gameLoop() {
        if (this.gameState && this.gameState.gameStarted) {
            this.updateGameDisplay();
            this.animationFrame = requestAnimationFrame(() => this.gameLoop());
        }
    }

    pauseGame() {
        [1, 2].forEach(playerNum => {
            const board = document.getElementById(`player${playerNum}-board`);
            if (board) {
                board.classList.add('paused');
            }
        });
        
        if (this.animationFrame) {
            cancelAnimationFrame(this.animationFrame);
            this.animationFrame = null;
        }
    }

    resumeGame() {
        [1, 2].forEach(playerNum => {
            const board = document.getElementById(`player${playerNum}-board`);
            if (board) {
                board.classList.remove('paused');
            }
        });
        
        this.gameLoop();
    }

    updateGameDisplay() {
        if (!this.gameState) return;

        // Update both players
        [1, 2].forEach(playerNum => {
            const playerState = this.gameState[`player${playerNum}`];
            if (playerState) {
                this.updatePlayerBoard(playerNum, playerState);
                this.updatePlayerStats(playerNum, playerState);
            }
        });
    }

    updatePlayerBoard(playerNum, playerState) {
        const board = document.getElementById(`player${playerNum}-board`);
        if (!board) return;

        // Use document fragment for better performance
        const fragment = document.createDocumentFragment();

        // Add game over overlay if player is dead
        if (!playerState.alive) {
            const overlay = document.createElement('div');
            overlay.className = 'game-over-overlay';
            overlay.innerHTML = '<div class="game-over-text">เกมจบ</div>';
            fragment.appendChild(overlay);
        }

        // Draw placed blocks
        for (let y = 0; y < playerState.board.length; y++) {
            for (let x = 0; x < playerState.board[y].length; x++) {
                if (playerState.board[y][x]) {
                    const block = this.createBlock(x, y, playerState.board[y][x]);
                    fragment.appendChild(block);
                }
            }
        }

        // Draw current piece if player is alive
       // Draw current piece if player is alive
        if (playerState.alive && playerState.currentPiece) {
            const piece = playerState.currentPiece;
            piece.shape.forEach((row, dy) => {
                row.forEach((cell, dx) => {
                    if (cell) {
                        const x = piece.x + dx;
                        const y = piece.y + dy;
                        if (y >= 0) { // Only draw visible blocks
                            const block = this.createBlock(x, y, piece.type);
                            block.classList.add('current-piece');
                            fragment.appendChild(block);
                        }
                    }
                });
            });
        }

        // Draw ghost piece if player is alive and has a current piece
        if (playerState.alive && playerState.currentPiece && playerState.ghostPiece) {
            const ghost = playerState.ghostPiece;
            ghost.shape.forEach((row, dy) => {
                row.forEach((cell, dx) => {
                    if (cell) {
                        const x = ghost.x + dx;
                        const y = ghost.y + dy;
                        if (y >= 0) {
                            const block = this.createBlock(x, y, ghost.type);
                            block.classList.add('ghost-piece');
                            fragment.appendChild(block);
                        }
                    }
                });
            });
        }

        // Clear and update board
        board.innerHTML = '';
        board.appendChild(fragment);
    }

    createBlock(x, y, type) {
        const block = document.createElement('div');
        block.className = `tetris-block tetris-block-${type}`;
        block.style.left = `${x * this.TILE_SIZE}px`;
        block.style.top = `${y * this.TILE_SIZE}px`;
        block.style.width = `${this.TILE_SIZE}px`;
        block.style.height = `${this.TILE_SIZE}px`;
        return block;
    }

    updatePlayerStats(playerNum, playerState) {
        const scoreEl = document.getElementById(`player${playerNum}-score`);
        const levelEl = document.getElementById(`player${playerNum}-level`);
        const linesEl = document.getElementById(`player${playerNum}-lines`);
        const nextPieceEl = document.getElementById(`player${playerNum}-next`);

        if (scoreEl) scoreEl.textContent = playerState.score || 0;
        if (levelEl) levelEl.textContent = playerState.level || 1;
        if (linesEl) linesEl.textContent = playerState.lines || 0;

        // Update next piece preview
        if (nextPieceEl && playerState.nextPiece) {
            this.drawNextPiece(nextPieceEl, playerState.nextPiece);
        }
    }

    drawNextPiece(container, piece) {
        container.innerHTML = '';
        
        if (!piece) return;

        const fragment = document.createDocumentFragment();
        const shape = piece.shape;
        
        // Find bounds of the piece
        let minX = shape[0].length, maxX = 0, minY = shape.length, maxY = 0;
        for (let y = 0; y < shape.length; y++) {
            for (let x = 0; x < shape[y].length; x++) {
                if (shape[y][x]) {
                    minX = Math.min(minX, x);
                    maxX = Math.max(maxX, x);
                    minY = Math.min(minY, y);
                    maxY = Math.max(maxY, y);
                }
            }
        }

        // Draw the piece centered
        const offsetX = Math.floor((4 - (maxX - minX + 1)) / 2);
        const offsetY = Math.floor((4 - (maxY - minY + 1)) / 2);

        for (let y = minY; y <= maxY; y++) {
            for (let x = minX; x <= maxX; x++) {
                if (shape[y][x]) {
                    const block = this.createBlock(
                        x - minX + offsetX,
                        y - minY + offsetY,
                        piece.type
                    );
                    block.style.width = '20px';
                    block.style.height = '20px';
                    block.style.left = `${(x - minX + offsetX) * 20}px`;
                    block.style.top = `${(y - minY + offsetY) * 20}px`;
                    fragment.appendChild(block);
                }
            }
        }

        container.appendChild(fragment);
    }

    endGame(data) {
        // Stop game loop
        if (this.animationFrame) {
            cancelAnimationFrame(this.animationFrame);
            this.animationFrame = null;
        }

        // Update final scores
        const player1Score = document.getElementById('final-player1-score');
        const player2Score = document.getElementById('final-player2-score');
        const winnerText = document.getElementById('winner-text');
        const gameTimeEl = document.getElementById('game-time');

        if (player1Score) player1Score.textContent = data.scores.player1 || 0;
        if (player2Score) player2Score.textContent = data.scores.player2 || 0;

        if (winnerText) {
            if (data.winner) {
                if (data.winner === this.playerNumber) {
                    winnerText.textContent = '🎉 คุณชนะ!';
                    winnerText.className = 'winner-text win';
                } else {
                    winnerText.textContent = '😞 คุณแพ้';
                    winnerText.className = 'winner-text lose';
                }
            } else {
                winnerText.textContent = '🤝 เสมอ!';
                winnerText.className = 'winner-text tie';
            }
        }

        // Calculate and display game time
        if (gameTimeEl && this.gameStartTime) {
            const gameTime = Math.floor((Date.now() - this.gameStartTime) / 1000);
            const minutes = Math.floor(gameTime / 60);
            const seconds = gameTime % 60;
            gameTimeEl.textContent = `${minutes}:${seconds.toString().padStart(2, '0')}`;
        }

        // Show game over screen
        this.showScreen('game-over-screen');
        
        // Play sound effect
        this.playSound(data.winner === this.playerNumber ? 'win' : 'lose');
        
        // Show notification
        const message = data.winner === this.playerNumber ? 
            '🎉 ยินดีด้วย! คุณชนะ!' : 
            data.winner ? '😞 เสียใจด้วย คุณแพ้' : '🤝 เสมอกัน!';
        this.showNotification(message, data.winner === this.playerNumber ? 'success' : 'info', 5000);
    }

    playSound(soundType) {
        // Simple sound generation using Web Audio API
        if (!this.audioContext) return;

        try {
            const oscillator = this.audioContext.createOscillator();
            const gainNode = this.audioContext.createGain();
            
            oscillator.connect(gainNode);
            gainNode.connect(this.audioContext.destination);
            
            switch (soundType) {
                case 'win':
                    oscillator.frequency.setValueAtTime(523.25, this.audioContext.currentTime); // C5
                    oscillator.frequency.setValueAtTime(659.25, this.audioContext.currentTime + 0.1); // E5
                    oscillator.frequency.setValueAtTime(783.99, this.audioContext.currentTime + 0.2); // G5
                    break;
                case 'lose':
                    oscillator.frequency.setValueAtTime(329.63, this.audioContext.currentTime); // E4
                    oscillator.frequency.setValueAtTime(293.66, this.audioContext.currentTime + 0.1); // D4
                    oscillator.frequency.setValueAtTime(261.63, this.audioContext.currentTime + 0.2); // C4
                    break;
                default:
                    oscillator.frequency.setValueAtTime(440, this.audioContext.currentTime); // A4
            }
            
            gainNode.gain.setValueAtTime(0.1, this.audioContext.currentTime);
            gainNode.gain.exponentialRampToValueAtTime(0.01, this.audioContext.currentTime + 0.3);
            
            oscillator.start(this.audioContext.currentTime);
            oscillator.stop(this.audioContext.currentTime + 0.3);
        } catch (e) {
            console.log('Sound playback failed:', e);
        }
    }

    // === RESPONSIVE DESIGN ===
    initializeResponsiveness() {
        // Handle window resize
        window.addEventListener('resize', () => {
            this.handleResize();
        });

        // Initial resize
        this.handleResize();

        // Handle orientation change on mobile
        window.addEventListener('orientationchange', () => {
            setTimeout(() => {
                this.handleResize();
            }, 100);
        });
    }

    handleResize() {
        const gameContainer = document.querySelector('.game-container');
        const mobileControls = document.querySelector('.mobile-controls');
        
        if (window.innerWidth <= 768) {
            // Mobile layout
            document.body.classList.add('mobile');
            if (mobileControls) {
                mobileControls.style.display = 'flex';
            }
        } else {
            // Desktop layout
            document.body.classList.remove('mobile');
            if (mobileControls) {
                mobileControls.style.display = 'none';
            }
        }

        // Adjust tile size for smaller screens
        if (window.innerWidth <= 480) {
            this.TILE_SIZE = 20;
        } else if (window.innerWidth <= 768) {
            this.TILE_SIZE = 24;
        } else {
            this.TILE_SIZE = 28;
        }

        // Update CSS custom property for tile size
        document.documentElement.style.setProperty('--tile-size', `${this.TILE_SIZE}px`);
    }

    // === UTILITY METHODS ===
    formatTime(seconds) {
        const mins = Math.floor(seconds / 60);
        const secs = seconds % 60;
        return `${mins}:${secs.toString().padStart(2, '0')}`;
    }

    debounce(func, wait) {
        let timeout;
        return function executedFunction(...args) {
            const later = () => {
                clearTimeout(timeout);
                func(...args);
            };
            clearTimeout(timeout);
            timeout = setTimeout(later, wait);
        };
    }

    // === CLEANUP ===
    destroy() {
        // Clean up event listeners and intervals
        if (this.socket) {
            this.socket.disconnect();
        }
        
        if (this.dropInterval) {
            clearInterval(this.dropInterval);
        }
        
        if (this.animationFrame) {
            cancelAnimationFrame(this.animationFrame);
        }

        // Clean up audio context
        if (this.audioContext) {
            this.audioContext.close();
        }

        // Remove notification container
        const notificationContainer = document.getElementById('notification-container');
        if (notificationContainer) {
            notificationContainer.remove();
        }
    }
}

// Initialize the game when the page loads
document.addEventListener('DOMContentLoaded', () => {
    // Check if the page is being loaded in a supported browser
    if (!window.io) {
        console.error('Socket.IO not loaded');
        document.body.innerHTML = '<div style="text-align:center;padding:50px;"><h2>Error: Socket.IO library not found</h2><p>Please make sure all required libraries are loaded.</p></div>';
        return;
    }

    // Initialize the game client
    window.tetrisClient = new TetrisClient();
    
    // Handle page unload
    window.addEventListener('beforeunload', () => {
        if (window.tetrisClient) {
            window.tetrisClient.destroy();
        }
    });
});

// Export for module use (if needed)
if (typeof module !== 'undefined' && module.exports) {
    module.exports = TetrisClient;
}

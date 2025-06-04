// TwoBob Tactics - Tetris Multiplayer Game Class (Fixed)
class TetrisMultiplayer {
    constructor() {
        this.socket = null;
        this.gameState = {
            board: [],
            currentPiece: null,
            nextPiece: null,
            score: 0,
            lines: 0,
            level: 1,
            gameOver: false
        };
        this.opponentState = {
            board: [],
            score: 0,
            lines: 0,
            level: 1,
            gameOver: false
        };
        this.playerId = null;
        this.roomId = null;
        this.playerName = '';
        this.opponentName = '';
        this.isReady = false;
        this.gameStarted = false;
        
        // Tetris constants
        this.BOARD_WIDTH = 10;
        this.BOARD_HEIGHT = 20;
        this.BLOCK_SIZE = 28;
        this.SMALL_BLOCK_SIZE = 14; // For opponent board
        
        // Piece templates
        this.pieces = {
            I: { shape: [[1,1,1,1]], color: '#00f0f0' },
            O: { shape: [[1,1],[1,1]], color: '#f0f000' },
            T: { shape: [[0,1,0],[1,1,1]], color: '#a000f0' },
            S: { shape: [[0,1,1],[1,1,0]], color: '#00f000' },
            Z: { shape: [[1,1,0],[0,1,1]], color: '#f00000' },
            J: { shape: [[1,0,0],[1,1,1]], color: '#0000f0' },
            L: { shape: [[0,0,1],[1,1,1]], color: '#f0a000' }
        };
        
        this.pieceTypes = Object.keys(this.pieces);
        
        // Touch/swipe handling
        this.touchStartX = 0;
        this.touchStartY = 0;
        this.lastMoveTime = 0;
        this.moveInterval = 500; // 500ms drop interval
        
        // Viewport properties
        this.viewport = {
            width: window.innerWidth,
            height: window.innerHeight,
            isMobile: window.innerWidth <= 768,
            isTablet: window.innerWidth <= 1024 && window.innerWidth > 768
        };
        
        this.init();
    }

    init() {
        this.calculateBlockSizes();
        this.initializeBoard();
        this.setupEventListeners();
        this.setupResizeHandler();
        this.connectToServer();
        this.setupMobileControls();
    }

    calculateBlockSizes() {
        const { width, height, isMobile, isTablet } = this.viewport;
        
        if (isMobile) {
            // Mobile: ใช้ 80% ของความกว้างหน้าจอ
            const availableWidth = width * 0.8;
            this.BLOCK_SIZE = Math.floor(availableWidth / this.BOARD_WIDTH);
            this.BLOCK_SIZE = Math.max(20, Math.min(35, this.BLOCK_SIZE));
            this.SMALL_BLOCK_SIZE = Math.floor(this.BLOCK_SIZE * 0.4);
            
        } else if (isTablet) {
            // Tablet: ใช้ 60% ของความกว้าง
            const availableWidth = width * 0.6;
            this.BLOCK_SIZE = Math.floor(availableWidth / (this.BOARD_WIDTH * 2));
            this.BLOCK_SIZE = Math.max(25, Math.min(40, this.BLOCK_SIZE));
            this.SMALL_BLOCK_SIZE = Math.floor(this.BLOCK_SIZE * 0.7);
            
        } else {
            // Desktop: ใช้ขนาดคงที่หรือคำนวณจากความสูง
            const availableHeight = height * 0.8;
            this.BLOCK_SIZE = Math.floor(availableHeight / this.BOARD_HEIGHT);
            this.BLOCK_SIZE = Math.max(25, Math.min(35, this.BLOCK_SIZE));
            this.SMALL_BLOCK_SIZE = Math.floor(this.BLOCK_SIZE * 0.5);
        }
        
        console.log(`Block sizes: Main=${this.BLOCK_SIZE}, Small=${this.SMALL_BLOCK_SIZE}`);
    }

    setupResizeHandler() {
        let resizeTimeout;
        window.addEventListener('resize', () => {
            clearTimeout(resizeTimeout);
            resizeTimeout = setTimeout(() => {
                this.handleResize();
            }, 100);
        });
    }

    handleResize() {
        this.viewport = {
            width: window.innerWidth,
            height: window.innerHeight,
            isMobile: window.innerWidth <= 768,
            isTablet: window.innerWidth <= 1024 && window.innerWidth > 768
        };
        
        this.calculateBlockSizes();
        this.updateBoardDimensions();
    }

    updateBoardDimensions() {
        if (this.gameStarted) {
            this.updateBoard();
            
            // อัพเดท opponent board ด้วย
            const opponentBoardEl = document.getElementById('opponent-board');
            if (opponentBoardEl && this.opponentState.board.length > 0) {
                this.updateOpponentBoard({
                    board: this.opponentState.board,
                    score: this.opponentState.score,
                    lines: this.opponentState.lines,
                    level: this.opponentState.level
                });
            }
        }
    }

    connectToServer() {
        // เชื่อมต่อกับ server (Render จะใช้ WSS โดยอัตโนมัติ)
        this.socket = io();
        
        this.socket.on('connect', () => {
            console.log('Connected to server');
            this.updateConnectionStatus(true);
        });

        this.socket.on('disconnect', () => {
            console.log('Disconnected from server');
            this.updateConnectionStatus(false);
            this.showScreen('connection-screen');
        });

        this.socket.on('roomCreated', (data) => {
            this.roomId = data.roomId;
            this.playerId = data.playerId;
            console.log('Room created, I am player:', this.playerId);
            this.showWaitingScreen();
        });

        this.socket.on('roomJoined', (data) => {
            this.roomId = data.roomId;
            this.playerId = data.playerId;
            console.log('Room joined, I am player:', this.playerId);
            this.showWaitingScreen();
        });

        this.socket.on('roomError', (data) => {
            alert(data.message);
            this.showScreen('menu-screen');
        });

        this.socket.on('roomUpdate', (data) => {
            this.updatePlayersDisplay(data.players);
            this.updateReadyStatus(data.players);
            
            // Store opponent name
            const opponent = data.players.find(p => p.id !== this.playerId);
            if (opponent) {
                this.opponentName = opponent.name;
            }
        });

        this.socket.on('gameStart', (data) => {
            this.startGame(data);
        });

        this.socket.on('gameUpdate', (data) => {
            if (data.playerId !== this.playerId) {
                this.updateOpponentBoard(data);
            }
        });

        this.socket.on('gameOver', (data) => {
            this.endGame(data);
        });

        this.socket.on('playerLeft', () => {
            alert('ผู้เล่นคนอื่นออกจากห้อง');
            this.showScreen('menu-screen');
        });
    }

    updateConnectionStatus(connected) {
        const statusEl = document.getElementById('connection-status');
        if (!statusEl) return;
        
        if (connected) {
            statusEl.className = 'connection-status connected';
            statusEl.innerHTML = '🟢 เชื่อมต่อแล้ว';
            const createBtn = document.getElementById('btn-create-room');
            const joinBtn = document.getElementById('btn-join-room');
            if (createBtn) createBtn.disabled = false;
            if (joinBtn) joinBtn.disabled = false;
        } else {
            statusEl.className = 'connection-status disconnected';
            statusEl.innerHTML = '🔴 ไม่ได้เชื่อมต่อ';
            const createBtn = document.getElementById('btn-create-room');
            const joinBtn = document.getElementById('btn-join-room');
            if (createBtn) createBtn.disabled = true;
            if (joinBtn) joinBtn.disabled = true;
        }
    }

    setupEventListeners() {
        // Create room
        const btnConfirmCreate = document.getElementById('btn-confirm-create');
        if (btnConfirmCreate) {
            btnConfirmCreate.addEventListener('click', () => {
                const nameInput = document.getElementById('create-player-name');
                const name = nameInput ? nameInput.value.trim() : '';
                if (!name) {
                    alert('กรุณาใส่ชื่อผู้เล่น');
                    return;
                }
                this.playerName = name;
                this.socket.emit('createRoom', { playerName: name });
            });
        }

        // Join room
        const btnConfirmJoin = document.getElementById('btn-confirm-join');
        if (btnConfirmJoin) {
            btnConfirmJoin.addEventListener('click', () => {
                const nameInput = document.getElementById('join-player-name');
                const roomInput = document.getElementById('join-room-id');
                const name = nameInput ? nameInput.value.trim() : '';
                const roomId = roomInput ? roomInput.value.trim() : '';
                
                if (!name || !roomId) {
                    alert('กรุณาใส่ชื่อผู้เล่นและรหัสห้อง');
                    return;
                }
                this.playerName = name;
                this.socket.emit('joinRoom', { playerName: name, roomId: roomId });
            });
        }

        // Ready button
        const btnReady = document.getElementById('btn-ready');
        if (btnReady) {
            btnReady.addEventListener('click', () => {
                this.socket.emit('playerReady', { roomId: this.roomId });
            });
        }

        // Leave room
        const btnLeaveRoom = document.getElementById('btn-leave-room');
        if (btnLeaveRoom) {
            btnLeaveRoom.addEventListener('click', () => {
                this.socket.emit('leaveRoom', { roomId: this.roomId });
                this.showScreen('menu-screen');
            });
        }

        // Play again
        const btnPlayAgain = document.getElementById('btn-play-again');
        if (btnPlayAgain) {
            btnPlayAgain.addEventListener('click', () => {
                this.socket.emit('playAgain', { roomId: this.roomId });
            });
        }

        // Keyboard controls
        document.addEventListener('keydown', (e) => {
            if (this.gameStarted && !this.gameState.gameOver) {
                this.handleKeyPress(e.key);
                e.preventDefault(); // Prevent scrolling
            }
        });

        // Touch controls for mobile
        const gameScreen = document.getElementById('game-screen');
        if (gameScreen) {
            gameScreen.addEventListener('touchstart', this.handleTouchStart.bind(this));
            gameScreen.addEventListener('touchmove', this.handleTouchMove.bind(this));
            gameScreen.addEventListener('touchend', this.handleTouchEnd.bind(this));
        }
    }

    setupMobileControls() {
        const buttons = document.querySelectorAll('.control-button');
        buttons.forEach((btn, index) => {
            btn.addEventListener('click', () => {
                if (!this.gameStarted || this.gameState.gameOver) return;
                
                switch(index) {
                    case 0: this.rotatePiece(); break;        // ↶
                    case 1: this.rotatePiece(); break;        // ↑
                    case 2: this.hardDrop(); break;           // 💧
                    case 3: this.movePiece(-1, 0); break;     // ←
                    case 4: this.movePiece(0, 1); break;      // ↓
                    case 5: this.movePiece(1, 0); break;      // →
                }
            });
        });
    }

    handleTouchStart(e) {
        if (e.touches && e.touches.length > 0) {
            this.touchStartX = e.touches[0].clientX;
            this.touchStartY = e.touches[0].clientY;
        }
    }

    handleTouchMove(e) {
        e.preventDefault();
    }

    handleTouchEnd(e) {
        if (!this.gameStarted || this.gameState.gameOver) return;
        if (!e.changedTouches || e.changedTouches.length === 0) return;
        
        const touchEndX = e.changedTouches[0].clientX;
        const touchEndY = e.changedTouches[0].clientY;
        const deltaX = touchEndX - this.touchStartX;
        const deltaY = touchEndY - this.touchStartY;
        const absX = Math.abs(deltaX);
        const absY = Math.abs(deltaY);

        if (absX > 30 || absY > 30) {
            if (absX > absY) {
                if (deltaX > 0) {
                    this.movePiece(1, 0); // Right
                } else {
                    this.movePiece(-1, 0); // Left
                }
            } else {
                if (deltaY > 0) {
                    this.movePiece(0, 1); // Down
                } else {
                    this.rotatePiece(); // Up - rotate
                }
            }
        }
    }

    handleKeyPress(key) {
        switch(key) {
            case 'ArrowLeft':
                this.movePiece(-1, 0);
                break;
            case 'ArrowRight':
                this.movePiece(1, 0);
                break;
            case 'ArrowDown':
                this.movePiece(0, 1);
                break;
            case 'ArrowUp':
                this.rotatePiece();
                break;
            case ' ':
                this.hardDrop();
                break;
        }
    }

    initializeBoard() {
        this.gameState.board = Array(this.BOARD_HEIGHT).fill().map(() => Array(this.BOARD_WIDTH).fill(0));
        this.opponentState.board = Array(this.BOARD_HEIGHT).fill().map(() => Array(this.BOARD_WIDTH).fill(0));
    }

    generatePiece() {
        const type = this.pieceTypes[Math.floor(Math.random() * this.pieceTypes.length)];
        return {
            type: type,
            shape: this.pieces[type].shape,
            color: this.pieces[type].color,
            x: Math.floor(this.BOARD_WIDTH / 2) - 1,
            y: 0
        };
    }

    startGame(data) {
        this.gameStarted = true;
        this.initializeBoard();
        this.gameState.currentPiece = this.generatePiece();
        this.gameState.nextPiece = this.generatePiece();
        this.gameState.score = 0;
        this.gameState.lines = 0;
        this.gameState.level = 1;
        this.gameState.gameOver = false;
        
        this.showScreen('game-screen');
        this.setupGameLayout();
        this.updateBoard();
        this.updateStats();
        this.gameLoop();
    }

    setupGameLayout() {
        // Update player names in the UI
        const myPlayerName = document.getElementById('my-player-name');
        const opponentPlayerName = document.getElementById('opponent-player-name');
        
        if (myPlayerName) {
            myPlayerName.textContent = this.playerName + ' (คุณ)';
        }
        if (opponentPlayerName) {
            opponentPlayerName.textContent = this.opponentName || 'ฝ่ายตรงข้าม';
        }
    }

    gameLoop() {
        if (!this.gameStarted || this.gameState.gameOver) return;
        
        const now = Date.now();
        if (now - this.lastMoveTime > this.moveInterval) {
            if (!this.movePiece(0, 1)) {
                this.placePiece();
                this.clearLines();
                this.spawnNewPiece();
                this.sendGameUpdate();
            }
            this.lastMoveTime = now;
        }
        
        requestAnimationFrame(() => this.gameLoop());
    }

    movePiece(dx, dy) {
        if (!this.gameState.currentPiece) return false;
        
        const newX = this.gameState.currentPiece.x + dx;
        const newY = this.gameState.currentPiece.y + dy;
        
        if (this.isValidPosition(this.gameState.currentPiece.shape, newX, newY)) {
            this.gameState.currentPiece.x = newX;
            this.gameState.currentPiece.y = newY;
            this.updateBoard();
            return true;
        }
        return false;
    }

    rotatePiece() {
        if (!this.gameState.currentPiece) return;
        
        const rotated = this.rotateMatrix(this.gameState.currentPiece.shape);
        if (this.isValidPosition(rotated, this.gameState.currentPiece.x, this.gameState.currentPiece.y)) {
            this.gameState.currentPiece.shape = rotated;
            this.updateBoard();
        }
    }

    hardDrop() {
        if (!this.gameState.currentPiece) return;
        
        while (this.movePiece(0, 1)) {
            // Keep dropping
        }
    }

    rotateMatrix(matrix) {
        const rows = matrix.length;
        const cols = matrix[0].length;
        const rotated = Array(cols).fill().map(() => Array(rows).fill(0));
        
        for (let i = 0; i < rows; i++) {
            for (let j = 0; j < cols; j++) {
                rotated[j][rows - 1 - i] = matrix[i][j];
            }
        }
        return rotated;
    }

    isValidPosition(shape, x, y) {
        for (let i = 0; i < shape.length; i++) {
            for (let j = 0; j < shape[i].length; j++) {
                if (shape[i][j]) {
                    const newX = x + j;
                    const newY = y + i;
                    
                    if (newX < 0 || newX >= this.BOARD_WIDTH || 
                        newY >= this.BOARD_HEIGHT || 
                        (newY >= 0 && this.gameState.board[newY][newX])) {
                        return false;
                    }
                }
            }
        }
        return true;
    }

    placePiece() {
        if (!this.gameState.currentPiece) return;
        
        const { shape, x, y, color } = this.gameState.currentPiece;
        for (let i = 0; i < shape.length; i++) {
            for (let j = 0; j < shape[i].length; j++) {
                if (shape[i][j] && y + i >= 0) {
                    this.gameState.board[y + i][x + j] = color;
                }
            }
        }
    }

    clearLines() {
        let linesCleared = 0;
        for (let i = this.BOARD_HEIGHT - 1; i >= 0; i--) {
            if (this.gameState.board[i].every(cell => cell !== 0)) {
                this.gameState.board.splice(i, 1);
                this.gameState.board.unshift(Array(this.BOARD_WIDTH).fill(0));
                linesCleared++;
                i++; // Check same line again
            }
        }
        
        if (linesCleared > 0) {
            this.gameState.lines += linesCleared;
            this.gameState.score += linesCleared * 100 * this.gameState.level;
            this.gameState.level = Math.floor(this.gameState.lines / 10) + 1;
            this.moveInterval = Math.max(50, 500 - (this.gameState.level - 1) * 50);
            this.updateStats();
        }
    }

    spawnNewPiece() {
        this.gameState.currentPiece = this.gameState.nextPiece;
        this.gameState.nextPiece = this.generatePiece();
        
        if (!this.isValidPosition(this.gameState.currentPiece.shape, 
                                  this.gameState.currentPiece.x, 
                                  this.gameState.currentPiece.y)) {
            this.gameState.gameOver = true;
            this.socket.emit('gameOver', { 
                roomId: this.roomId, 
                playerId: this.playerId,
                score: this.gameState.score 
            });
        }
    }

    sendGameUpdate() {
        if (this.socket) {
            this.socket.emit('gameUpdate', {
                roomId: this.roomId,
                playerId: this.playerId,
                board: this.gameState.board,
                score: this.gameState.score,
                lines: this.gameState.lines,
                level: this.gameState.level
            });
        }
    }

    // ฟังก์ชันช่วยสร้าง block
    createBlock(x, y, size, color, isCurrent = false) {
        const block = document.createElement('div');
        block.className = isCurrent ? 'tetris-block current-piece' : 'tetris-block';
        block.style.position = 'absolute';
        block.style.left = x * size + 'px';
        block.style.top = y * size + 'px';
        block.style.width = size + 'px';
        block.style.height = size + 'px';
        block.style.background = color;
        block.style.boxSizing = 'border-box';
        
        if (isCurrent) {
            block.style.border = '2px solid rgba(255,255,255,0.8)';
            block.style.boxShadow = '0 0 5px rgba(255,255,255,0.5)';
        } else {
            block.style.border = '1px solid rgba(255,255,255,0.3)';
        }
        
        return block;
    }

    // ฟังก์ชันกำหนดขนาด board
    setBoardDimensions(boardEl, blockSize) {
        const width = this.BOARD_WIDTH * blockSize;
        const height = this.BOARD_HEIGHT * blockSize;
        
        boardEl.style.width = width + 'px';
        boardEl.style.height = height + 'px';
        boardEl.style.position = 'relative';
        boardEl.style.border = '2px solid #333';
        boardEl.style.background = 'rgba(0,0,0,0.8)';
    }

    // ฟังก์ชันสร้าง game over overlay
    createGameOverOverlay() {
        const overlay = document.createElement('div');
        overlay.className = 'game-over-overlay';
        overlay.style.position = 'absolute';
        overlay.style.top = '0';
        overlay.style.left = '0';
        overlay.style.width = '100%';
        overlay.style.height = '100%';
        overlay.style.background = 'rgba(0,0,0,0.8)';
        overlay.style.display = 'flex';
        overlay.style.alignItems = 'center';
        overlay.style.justifyContent = 'center';
        overlay.style.color = '#fff';
        overlay.style.fontSize = Math.max(16, this.BLOCK_SIZE * 0.8) + 'px';
        overlay.style.fontWeight = 'bold';
        overlay.style.textAlign = 'center';
        overlay.innerHTML = '<div class="game-over-text">GAME OVER</div>';
        return overlay;
    }

    // Update MY board (main board)
    updateBoard() {
        const boardEl = document.getElementById('my-board');
        if (!boardEl) return;
        
        // ปรับขนาดของ board container
        this.setBoardDimensions(boardEl, this.BLOCK_SIZE);
        
        boardEl.innerHTML = '';
        
        // Draw placed blocks
        for (let i = 0; i < this.BOARD_HEIGHT; i++) {
            for (let j = 0; j < this.BOARD_WIDTH; j++) {
                if (this.gameState.board[i][j]) {
                    const block = this.createBlock(j, i, this.BLOCK_SIZE, this.gameState.board[i][j]);
                    boardEl.appendChild(block);
                }
            }
        }
        
        // Draw current piece
        if (this.gameState.currentPiece) {
            const { shape, x, y, color } = this.gameState.currentPiece;
            for (let i = 0; i < shape.length; i++) {
                for (let j = 0; j < shape[i].length; j++) {
                    if (shape[i][j]) {
                        const block = this.createBlock(x + j, y + i, this.BLOCK_SIZE, color, true);
                        boardEl.appendChild(block);
                    }
                }
            }
        }
        
        // Show game over overlay
        if (this.gameState.gameOver) {
            const overlay = this.createGameOverOverlay();
            boardEl.appendChild(overlay);
        }
    }

    // Update opponent board (smaller board)
    updateOpponentBoard(data) {
        console.log('Updating opponent board with data:', data);
        
        this.opponentState.board = data.board || [];
        this.opponentState.score = data.score || 0;
        this.opponentState.lines = data.lines || 0;
        this.opponentState.level = data.level || 1;
        
        const boardEl = document.getElementById('opponent-board');
        if (!boardEl) return;
        
        // ปรับขนาดของ opponent board
        this.setBoardDimensions(boardEl, this.SMALL_BLOCK_SIZE);
        
        boardEl.innerHTML = '';
        
        // Draw opponent's board with smaller blocks
        for (let i = 0; i < this.BOARD_HEIGHT; i++) {
            for (let j = 0; j < this.BOARD_WIDTH; j++) {
                if (data.board[i] && data.board[i][j]) {
                    const block = this.createBlock(j, i, this.SMALL_BLOCK_SIZE, data.board[i][j]);
                    boardEl.appendChild(block);
                }
            }
        }
        
        this.updateOpponentStats();
    }

    updateStats() {
        const scoreEl = document.getElementById('my-score');
        const linesEl = document.getElementById('my-lines');
        const levelEl = document.getElementById('my-level');
        
        if (scoreEl) scoreEl.textContent = this.gameState.score;
        if (linesEl) linesEl.textContent = this.gameState.lines;
        if (levelEl) levelEl.textContent = this.gameState.level;
    }

    updateOpponentStats() {
        const scoreEl = document.getElementById('opponent-score');
        const linesEl = document.getElementById('opponent-lines');
        const levelEl = document.getElementById('opponent-level');
        
        if (scoreEl) scoreEl.textContent = this.opponentState.score;
        if (linesEl) linesEl.textContent = this.opponentState.lines;
        if (levelEl) levelEl.textContent = this.opponentState.level;
    }

    showScreen(screenId) {
        document.querySelectorAll('.screen').forEach(screen => {
            screen.style.display = 'none';
        });
        const targetScreen = document.getElementById(screenId);
        if (targetScreen) {
            targetScreen.style.display = 'block';
        }
    }

    showWaitingScreen() {
        const roomIdDisplay = document.getElementById('room-id-display');
        if (roomIdDisplay) {
            roomIdDisplay.textContent = this.roomId;
        }
        this.showScreen('waiting-screen');
        
        const btnReady = document.getElementById('btn-ready');
        if (btnReady) {
            btnReady.disabled = false;
        }
    }

    updatePlayersDisplay(players) {
        const playersList = document.getElementById('players-list');
        if (!playersList) return;
        
        playersList.innerHTML = '';
        
        players.forEach((player, index) => {
            const li = document.createElement('li');
            li.textContent = `${player.name}`;
            if (player.id === this.playerId) {
                li.classList.add('current-player');
                li.textContent += ' (คุณ)';
            }
            playersList.appendChild(li);
        });
    }

    updateReadyStatus(players) {
        players.forEach((player, index) => {
            const indicator = document.getElementById(`ready-indicator-${index + 1}`);
            if (indicator) {
                indicator.textContent = `${player.name}: ${player.ready ? '✅ พร้อม' : '⏳ รอ...'}`;
            }
        });
    }
    endGame(data) {
        this.gameStarted = false;
        this.gameState.gameOver = true;
        
        const winnerMsg = document.getElementById('winner-message');
        if (winnerMsg) {
            winnerMsg.textContent = data.winner === this.playerId ? '🎉 คุณชนะ!' : '😢 คุณแพ้';
        }
        
        const finalScoreP1 = document.getElementById('final-score-p1');
        const finalScoreP2 = document.getElementById('final-score-p2');
        if (finalScoreP1) finalScoreP1.textContent = data.scores.player1 || 0;
        if (finalScoreP2) finalScoreP2.textContent = data.scores.player2 || 0;
        
        this.showScreen('game-over-screen');
    }
}

// Export for use in other files
if (typeof module !== 'undefined' && module.exports) {
    module.exports = TetrisMultiplayer;
}

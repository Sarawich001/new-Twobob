// TwoBob Tactics - Tetris Multiplayer Client (Improved)
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
        this.playerId = null;
        this.roomId = null;
        this.playerName = '';
        this.isReady = false;
        this.gameStarted = false;
        this.opponentData = null;
        
        // Tetris constants
        this.BOARD_WIDTH = 10;
        this.BOARD_HEIGHT = 20;
        this.BLOCK_SIZE = 28;
        
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
        this.dropTimer = null;
        
        this.init();
    }

    init() {
        this.initializeBoard();
        this.setupEventListeners();
        this.connectToServer();
        this.setupMobileControls();
        this.setupNavigationButtons();
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
            this.showConnectionError();
        });

        this.socket.on('roomCreated', (data) => {
            this.roomId = data.roomId;
            this.playerId = data.playerId;
            this.showWaitingScreen();
        });

        this.socket.on('roomJoined', (data) => {
            this.roomId = data.roomId;
            this.playerId = data.playerId;
            this.showWaitingScreen();
        });

        this.socket.on('roomError', (data) => {
            this.showError(data.message);
            this.showScreen('menu-screen');
        });

        this.socket.on('roomUpdate', (data) => {
            this.updatePlayersDisplay(data.players);
            this.updateReadyStatus(data.players);
        });

        this.socket.on('gameStart', (data) => {
            this.startGame(data);
        });

        this.socket.on('gameUpdate', (data) => {
            this.updateOpponentBoard(data);
        });

        this.socket.on('gameOver', (data) => {
            this.endGame(data);
        });

        this.socket.on('playerLeft', () => {
            this.showError('ผู้เล่นคนอื่นออกจากห้อง');
            setTimeout(() => {
                this.showScreen('menu-screen');
            }, 2000);
        });
    }

    updateConnectionStatus(connected) {
        const statusEl = document.getElementById('connection-status');
        if (connected) {
            statusEl.className = 'connection-status connected';
            statusEl.innerHTML = '🟢 เชื่อมต่อแล้ว';
            this.enableMenuButtons(true);
        } else {
            statusEl.className = 'connection-status disconnected';
            statusEl.innerHTML = '🔴 ไม่ได้เชื่อมต่อ';
            this.enableMenuButtons(false);
        }
    }

    enableMenuButtons(enabled) {
        const buttons = ['btn-create-room', 'btn-join-room'];
        buttons.forEach(id => {
            const btn = document.getElementById(id);
            if (btn) btn.disabled = !enabled;
        });
    }

    showConnectionError() {
        this.showError('การเชื่อมต่อขาดหาย กำลังพยายามเชื่อมต่อใหม่...');
        this.showScreen('menu-screen');
    }

    showError(message) {
        const errorEl = document.getElementById('error-message');
        if (errorEl) {
            errorEl.textContent = message;
            errorEl.style.display = 'block';
            setTimeout(() => {
                errorEl.style.display = 'none';
            }, 3000);
        } else {
            alert(message);
        }
    }

    setupNavigationButtons() {
        // Navigation between screens
        document.getElementById('btn-create-room').addEventListener('click', () => {
            this.showScreen('create-room-screen');
        });

        document.getElementById('btn-join-room').addEventListener('click', () => {
            this.showScreen('join-room-screen');
        });

        // Back buttons
        document.querySelectorAll('.btn-back').forEach(btn => {
            btn.addEventListener('click', () => {
                this.showScreen('menu-screen');
            });
        });
    }

    setupEventListeners() {
        // Create room
        document.getElementById('btn-confirm-create').addEventListener('click', () => {
            const name = document.getElementById('create-player-name').value.trim();
            if (!name) {
                this.showError('กรุณาใส่ชื่อผู้เล่น');
                return;
            }
            if (name.length > 20) {
                this.showError('ชื่อผู้เล่นยาวเกินไป (สูงสุด 20 ตัวอักษร)');
                return;
            }
            this.playerName = name;
            this.socket.emit('createRoom', { playerName: name });
        });

        // Join room
        document.getElementById('btn-confirm-join').addEventListener('click', () => {
            const name = document.getElementById('join-player-name').value.trim();
            const roomId = document.getElementById('join-room-id').value.trim().toUpperCase();
            
            if (!name) {
                this.showError('กรุณาใส่ชื่อผู้เล่น');
                return;
            }
            if (name.length > 20) {
                this.showError('ชื่อผู้เล่นยาวเกินไป (สูงสุด 20 ตัวอักษร)');
                return;
            }
            if (!roomId) {
                this.showError('กรุณาใส่รหัสห้อง');
                return;
            }
            if (roomId.length !== 5) {
                this.showError('รหัสห้องต้องเป็นตัวเลข 5 หลัก');
                return;
            }

            this.playerName = name;
            this.socket.emit('joinRoom', { playerName: name, roomId: roomId });
        });

        // Ready button
        document.getElementById('btn-ready').addEventListener('click', () => {
            if (!this.isReady) {
                this.socket.emit('playerReady', { roomId: this.roomId });
                this.isReady = true;
                document.getElementById('btn-ready').disabled = true;
                document.getElementById('btn-ready').textContent = 'รอผู้เล่นอีกคน...';
            }
        });

        // Leave room
        document.getElementById('btn-leave-room').addEventListener('click', () => {
            if (confirm('คุณต้องการออกจากห้องใช่หรือไม่?')) {
                this.socket.emit('leaveRoom', { roomId: this.roomId });
                this.resetGameState();
                this.showScreen('menu-screen');
            }
        });

        // Play again
        document.getElementById('btn-play-again').addEventListener('click', () => {
            this.socket.emit('playAgain', { roomId: this.roomId });
            this.resetGameState();
        });

        // Room ID input formatting
        const roomIdInput = document.getElementById('join-room-id');
        roomIdInput.addEventListener('input', (e) => {
            e.target.value = e.target.value.replace(/\D/g, '').substring(0, 5);
        });

        // Keyboard controls
        document.addEventListener('keydown', (e) => {
            if (this.gameStarted && !this.gameState.gameOver) {
                this.handleKeyPress(e.key);
                e.preventDefault();
            }
        });

        // Touch controls for mobile
        const gameScreen = document.getElementById('game-screen');
        if (gameScreen) {
            gameScreen.addEventListener('touchstart', this.handleTouchStart.bind(this), { passive: false });
            gameScreen.addEventListener('touchmove', this.handleTouchMove.bind(this), { passive: false });
            gameScreen.addEventListener('touchend', this.handleTouchEnd.bind(this), { passive: false });
        }
    }

    setupMobileControls() {
        const buttons = document.querySelectorAll('.control-button');
        buttons.forEach((btn, index) => {
            btn.addEventListener('click', (e) => {
                e.preventDefault();
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

            // Add button feedback
            btn.addEventListener('touchstart', () => {
                btn.style.transform = 'scale(0.95)';
            });
            btn.addEventListener('touchend', () => {
                btn.style.transform = 'scale(1)';
            });
        });
    }

    handleTouchStart(e) {
        this.touchStartX = e.touches[0].clientX;
        this.touchStartY = e.touches[0].clientY;
    }

    handleTouchMove(e) {
        e.preventDefault();
    }

    handleTouchEnd(e) {
        if (!this.gameStarted || this.gameState.gameOver) return;
        
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
            case 'a':
            case 'A':
                this.movePiece(-1, 0);
                break;
            case 'ArrowRight':
            case 'd':
            case 'D':
                this.movePiece(1, 0);
                break;
            case 'ArrowDown':
            case 's':
            case 'S':
                this.movePiece(0, 1);
                break;
            case 'ArrowUp':
            case 'w':
            case 'W':
                this.rotatePiece();
                break;
            case ' ':
                this.hardDrop();
                break;
        }
    }

    resetGameState() {
        this.gameStarted = false;
        this.isReady = false;
        this.gameState.gameOver = false;
        this.opponentData = null;
        
        if (this.dropTimer) {
            clearInterval(this.dropTimer);
            this.dropTimer = null;
        }

        // Reset UI elements
        const readyBtn = document.getElementById('btn-ready');
        if (readyBtn) {
            readyBtn.disabled = false;
            readyBtn.textContent = 'พร้อม';
        }
    }

    initializeBoard() {
        this.gameState.board = Array(this.BOARD_HEIGHT).fill().map(() => Array(this.BOARD_WIDTH).fill(0));
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
        this.playerId = data.playerId;
        this.initializeBoard();
        this.gameState.currentPiece = this.generatePiece();
        this.gameState.nextPiece = this.generatePiece();
        this.gameState.score = 0;
        this.gameState.lines = 0;
        this.gameState.level = 1;
        this.gameState.gameOver = false;
        
        this.showScreen('game-screen');
        this.updateBoard();
        this.updateStats();
        this.startDropTimer();
        
        // Highlight current player's board
        const myBoard = document.getElementById(`player${this.playerId}-board`);
        if (myBoard) {
            myBoard.classList.add('current-player');
        }

        // Initialize opponent board
        this.initializeOpponentBoard();
    }

    startDropTimer() {
        if (this.dropTimer) {
            clearInterval(this.dropTimer);
        }
        
        this.dropTimer = setInterval(() => {
            if (this.gameStarted && !this.gameState.gameOver) {
                this.dropPiece();
            }
        }, this.moveInterval);
    }

    dropPiece() {
        if (!this.movePiece(0, 1)) {
            this.placePiece();
            this.clearLines();
            this.spawnNewPiece();
            this.sendGameUpdate();
        }
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
        
        // Try different positions for wall kicks
        const kicks = [
            [0, 0],   // Original position
            [-1, 0],  // Left
            [1, 0],   // Right
            [0, -1],  // Up
            [-1, -1], // Left-Up
            [1, -1]   // Right-Up
        ];
        
        for (const [dx, dy] of kicks) {
            if (this.isValidPosition(rotated, this.gameState.currentPiece.x + dx, this.gameState.currentPiece.y + dy)) {
                this.gameState.currentPiece.shape = rotated;
                this.gameState.currentPiece.x += dx;
                this.gameState.currentPiece.y += dy;
                this.updateBoard();
                break;
            }
        }
    }

    hardDrop() {
        if (!this.gameState.currentPiece) return;
        
        let dropDistance = 0;
        while (this.movePiece(0, 1)) {
            dropDistance++;
        }
        
        // Add bonus points for hard drop
        this.gameState.score += dropDistance * 2;
        this.updateStats();
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
            
            // Score calculation based on lines cleared
            const baseScore = [0, 40, 100, 300, 1200][linesCleared] || 0;
            this.gameState.score += baseScore * this.gameState.level;
            
            // Level up every 10 lines
            const newLevel = Math.floor(this.gameState.lines / 10) + 1;
            if (newLevel > this.gameState.level) {
                this.gameState.level = newLevel;
                this.moveInterval = Math.max(50, 500 - (this.gameState.level - 1) * 40);
                this.startDropTimer(); // Restart timer with new interval
            }
            
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
            if (this.dropTimer) {
                clearInterval(this.dropTimer);
                this.dropTimer = null;
            }
            this.socket.emit('gameOver', { 
                roomId: this.roomId, 
                playerId: this.playerId,
                score: this.gameState.score 
            });
        }
    }

    sendGameUpdate() {
        if (this.socket && this.roomId && this.playerId) {
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

    initializeOpponentBoard() {
        const opponentId = this.playerId === 1 ? 2 : 1;
        const boardEl = document.getElementById(`player${opponentId}-board`);
        if (boardEl) {
            boardEl.innerHTML = '';
            boardEl.classList.remove('current-player');
        }
    }

    updateBoard() {
        const boardEl = document.getElementById(`player${this.playerId}-board`);
        if (!boardEl) return;
        
        boardEl.innerHTML = '';
        
        // Draw placed blocks
        for (let i = 0; i < this.BOARD_HEIGHT; i++) {
            for (let j = 0; j < this.BOARD_WIDTH; j++) {
                if (this.gameState.board[i][j]) {
                    const block = document.createElement('div');
                    block.className = 'tetris-block';
                    block.style.left = j * this.BLOCK_SIZE + 'px';
                    block.style.top = i * this.BLOCK_SIZE + 'px';
                    block.style.width = this.BLOCK_SIZE + 'px';
                    block.style.height = this.BLOCK_SIZE + 'px';
                    block.style.background = this.gameState.board[i][j];
                    block.style.border = '1px solid rgba(255,255,255,0.3)';
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
                        const block = document.createElement('div');
                        block.className = 'tetris-block current-piece';
                        block.style.left = (x + j) * this.BLOCK_SIZE + 'px';
                        block.style.top = (y + i) * this.BLOCK_SIZE + 'px';
                        block.style.width = this.BLOCK_SIZE + 'px';
                        block.style.height = this.BLOCK_SIZE + 'px';
                        block.style.background = color;
                        block.style.border = '2px solid rgba(255,255,255,0.8)';
                        block.style.boxShadow = '0 0 10px rgba(255,255,255,0.5)';
                        boardEl.appendChild(block);
                    }
                }
            }
        }
        
        // Show game over overlay
        if (this.gameState.gameOver) {
            const overlay = document.createElement('div');
            overlay.className = 'game-over-overlay';
            overlay.innerHTML = '<div class="game-over-text">GAME OVER</div>';
            boardEl.appendChild(overlay);
        }
    }

    updateOpponentBoard(data) {
        const opponentId = data.playerId === 1 ? 2 : 1;
        const boardEl = document.getElementById(`player${opponentId}-board`);
        if (!boardEl || !data.board) return;
        
        boardEl.innerHTML = '';
        
        // Draw opponent's board
        for (let i = 0; i < this.BOARD_HEIGHT; i++) {
            for (let j = 0; j < this.BOARD_WIDTH; j++) {
                if (data.board[i] && data.board[i][j]) {
                    const block = document.createElement('div');
                    block.className = 'tetris-block opponent-block';
                    block.style.left = j * this.BLOCK_SIZE + 'px';
                    block.style.top = i * this.BLOCK_SIZE + 'px';
                    block.style.width = this.BLOCK_SIZE + 'px';
                    block.style.height = this.BLOCK_SIZE + 'px';
                    block.style.background = data.board[i][j];
                    block.style.border = '1px solid rgba(255,255,255,0.2)';
                    block.style.opacity = '0.8';
                    boardEl.appendChild(block);
                }
            }
        }
        
        // Update opponent stats
        const statsEl = document.getElementById(`player${opponentId}-stats`);
        if (statsEl) {
            const scoreEl = statsEl.querySelector('.score-value');
            const linesEl = statsEl.querySelector('.lines-value');
            const levelEl = statsEl.querySelector('.level-value');
            
            if (scoreEl) scoreEl.textContent = data.score || 0;
            if (linesEl) linesEl.textContent = data.lines || 0;
            if (levelEl) levelEl.textContent = data.level || 1;
        }
    }

    updateStats() {
        const statsEl = document.getElementById(`player${this.playerId}-stats`);
        if (statsEl) {
            const scoreEl = statsEl.querySelector('.score-value');
            const linesEl = statsEl.querySelector('.lines-value');
            const levelEl = statsEl.querySelector('.level-value');
            
            if (scoreEl) scoreEl.textContent = this.gameState.score;
            if (linesEl) linesEl.textContent = this.gameState.lines;
            if (levelEl) levelEl.textContent = this.gameState.level;
        }

        // Update next piece display
        this.updateNextPieceDisplay();
    }

    updateNextPieceDisplay() {
        const nextPieceEl = document.getElementById('next-piece');
        if (!nextPieceEl || !this.gameState.nextPiece) return;
        
        nextPieceEl.innerHTML = '';
        const { shape, color } = this.gameState.nextPiece;
        
        for (let i = 0; i < shape.length; i++) {
            for (let j = 0; j < shape[i].length; j++) {
                if (shape[i][j]) {
                    const block = document.createElement('div');
                    block.className = 'mini-block';
                    block.style.left = j * 15 + 'px';
                    block.style.top = i * 15 + 'px';
                    block.style.width = '15px';
                    block.style.height = '15px';
                    block.style.background = color;
                    block.style.border = '1px solid rgba(255,255,255,0.3)';
                    block.style.position = 'absolute';
                    nextPieceEl.appendChild(block);
                }
            }
        }
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
        document.getElementById('room-id-display').textContent = this.roomId;
        this.showScreen('waiting-screen');
        this.resetGameState();
    }

    updatePlayersDisplay(players) {
        const playersList = document.getElementById('players-list');
        if (playersList) {
            playersList.innerHTML = '';
            
            players.forEach((player, index) => {
                const li = document.createElement('li');
                li.textContent = `${player.name}`;
                if (player.id === this.playerId) {
                    li.classList.add('current-player');
                    li.textContent += ' (คุณ)';
                }
                if (player.ready) {
                    li.classList.add('ready');
                    li.textContent += ' ✅';
                }
                playersList.appendChild(li);
            });
        }
    }

    updateReadyStatus(players) {
        players.forEach((player, index) => {
            const indicator = document.getElementById(`ready-indicator-${index + 1}`);
            if (indicator) {
                indicator.textContent = `${player.name}: ${player.ready ? '✅ พร้อม' : '⏳ รอ...'}`;
                indicator.className = player.ready ? 'ready' : 'waiting';
            }
        });
    }

    endGame(data) {
        this.gameStarted = false;
        this.gameState.gameOver = true;
    
        if (this.dropTimer) {
            clearInterval(this.dropTimer);
            this.dropTimer = null;
        }
        
        this.updateBoard();
        
        // แสดงหน้าผลลัพธ์
        this.showGameResult(data);
    }

    showGameResult(data) {
        const resultEl = document.getElementById('game-result');
        const winnerEl = document.getElementById('winner-message');
        const scoresEl = document.getElementById('final-scores');
        
        if (data.winner === this.playerId) {
            winnerEl.textContent = '🎉 คุณชนะ!';
            winnerEl.className = 'winner-message win';
        } else {
            winnerEl.textContent = '😢 คุณแพ้';
            winnerEl.className = 'winner-message lose';
        }
        
        // แสดงคะแนนทั้งสองฝ่าย
        const myScore = data.scores[`player${this.playerId}`] || 0;
        const opponentScore = data.scores[`player${this.playerId === 1 ? 2 : 1}`] || 0;
        
        scoresEl.innerHTML = `
            <div class="score-row">
                <span class="player-label">คุณ:</span>
                <span class="score-value">${myScore.toLocaleString()}</span>
            </div>
            <div class="score-row">
                <span class="player-label">คู่แข่ง:</span>
                <span class="score-value">${opponentScore.toLocaleString()}</span>
            </div>
        `;
        
        this.showScreen('result-screen');
    }

    copyRoomId() {
        const roomId = this.roomId;
        if (roomId) {
            // สำหรับ mobile devices
            if (navigator.share) {
                navigator.share({
                    title: 'Tetris Multiplayer',
                    text: `เข้าร่วมเกม Tetris กับฉัน! รหัสห้อง: ${roomId}`,
                    url: window.location.href
                }).catch(() => {
                    // Fallback to clipboard
                    this.fallbackCopyToClipboard(roomId);
                });
            } else if (navigator.clipboard) {
                navigator.clipboard.writeText(roomId).then(() => {
                    this.showMessage('คัดลอกรหัสห้องแล้ว!');
                }).catch(() => {
                    this.fallbackCopyToClipboard(roomId);
                });
            } else {
                this.fallbackCopyToClipboard(roomId);
            }
        }
    }

    fallbackCopyToClipboard(text) {
        const textArea = document.createElement('textarea');
        textArea.value = text;
        textArea.style.position = 'fixed';
        textArea.style.left = '-999999px';
        textArea.style.top = '-999999px';
        document.body.appendChild(textArea);
        textArea.focus();
        textArea.select();
        
        try {
            document.execCommand('copy');
            this.showMessage('คัดลอกรหัสห้องแล้ว!');
        } catch (err) {
            this.showMessage(`รหัสห้อง: ${text}`);
        }
        
        document.body.removeChild(textArea);
    }

    showMessage(message) {
        const messageEl = document.createElement('div');
        messageEl.className = 'toast-message';
        messageEl.textContent = message;
        messageEl.style.cssText = `
            position: fixed;
            top: 20px;
            left: 50%;
            transform: translateX(-50%);
            background: rgba(0, 0, 0, 0.8);
            color: white;
            padding: 12px 24px;
            border-radius: 8px;
            z-index: 10000;
            animation: fadeInOut 2s ease-in-out forwards;
        `;
        
        // เพิ่ม CSS animation ถ้ายังไม่มี
        if (!document.getElementById('toast-styles')) {
            const style = document.createElement('style');
            style.id = 'toast-styles';
            style.textContent = `
                @keyframes fadeInOut {
                    0% { opacity: 0; transform: translateX(-50%) translateY(-20px); }
                    20%, 80% { opacity: 1; transform: translateX(-50%) translateY(0); }
                    100% { opacity: 0; transform: translateX(-50%) translateY(-20px); }
                }
            `;
            document.head.appendChild(style);
        }
        
        document.body.appendChild(messageEl);
        setTimeout(() => {
            if (messageEl.parentNode) {
                messageEl.parentNode.removeChild(messageEl);
            }
        }, 2000);
    }

    // เพิ่มฟังก์ชัน utility สำหรับการจัดการ DOM
    createElement(tag, className, innerHTML) {
        const element = document.createElement(tag);
        if (className) element.className = className;
        if (innerHTML) element.innerHTML = innerHTML;
        return element;
    }

    // ปรับปรุงการสร้างบอร์ดให้มี performance ดีขึ้น
    createBoardElement(playerId) {
        const boardEl = document.getElementById(`player${playerId}-board`);
        if (!boardEl) return null;
        
        // ล้าง DOM ทั้งหมด
        boardEl.innerHTML = '';
        
        // สร้าง fragment เพื่อ performance ที่ดีขึ้น
        const fragment = document.createDocumentFragment();
        
        return { boardEl, fragment };
    }

    // ปรับปรุงการอัพเดตบอร์ดให้ smooth ขึ้น
    updateBoardOptimized() {
        const result = this.createBoardElement(this.playerId);
        if (!result) return;
        
        const { boardEl, fragment } = result;
        
        // วาดบล็อคที่วางแล้ว
        this.renderPlacedBlocks(fragment);
        
        // วาดชิ้นปัจจุบัน
        this.renderCurrentPiece(fragment);
        
        // วาดเงา (shadow piece)
        this.renderShadowPiece(fragment);
        
        // วาด game over overlay
        if (this.gameState.gameOver) {
            this.renderGameOverOverlay(fragment);
        }
        
        boardEl.appendChild(fragment);
    }

    renderPlacedBlocks(fragment) {
        for (let i = 0; i < this.BOARD_HEIGHT; i++) {
            for (let j = 0; j < this.BOARD_WIDTH; j++) {
                if (this.gameState.board[i][j]) {
                    const block = this.createBlockElement(j, i, this.gameState.board[i][j], 'placed-block');
                    fragment.appendChild(block);
                }
            }
        }
    }

    renderCurrentPiece(fragment) {
        if (!this.gameState.currentPiece) return;
        
        const { shape, x, y, color } = this.gameState.currentPiece;
        for (let i = 0; i < shape.length; i++) {
            for (let j = 0; j < shape[i].length; j++) {
                if (shape[i][j]) {
                    const block = this.createBlockElement(x + j, y + i, color, 'current-piece');
                    fragment.appendChild(block);
                }
            }
        }
    }

    renderShadowPiece(fragment) {
        if (!this.gameState.currentPiece) return;
        
        // หาตำแหน่งที่ชิ้นจะตกลงไป
        const shadowY = this.getShadowPosition();
        if (shadowY === this.gameState.currentPiece.y) return; // ไม่แสดงเงาถ้าอยู่ที่เดียวกัน
        
        const { shape, x, color } = this.gameState.currentPiece;
        for (let i = 0; i < shape.length; i++) {
            for (let j = 0; j < shape[i].length; j++) {
                if (shape[i][j]) {
                    const block = this.createBlockElement(x + j, shadowY + i, color, 'shadow-piece');
                    fragment.appendChild(block);
                }
            }
        }
    }

    getShadowPosition() {
        if (!this.gameState.currentPiece) return 0;
        
        let shadowY = this.gameState.currentPiece.y;
        const { shape, x } = this.gameState.currentPiece;
        
        while (this.isValidPosition(shape, x, shadowY + 1)) {
            shadowY++;
        }
        
        return shadowY;
    }

    createBlockElement(x, y, color, className) {
        const block = document.createElement('div');
        block.className = `tetris-block ${className}`;
        block.style.cssText = `
            left: ${x * this.BLOCK_SIZE}px;
            top: ${y * this.BLOCK_SIZE}px;
            width: ${this.BLOCK_SIZE}px;
            height: ${this.BLOCK_SIZE}px;
            background: ${color};
            position: absolute;
            box-sizing: border-box;
        `;
        
        // เพิ่ม style ตาม class
        switch (className) {
            case 'current-piece':
                block.style.border = '2px solid rgba(255,255,255,0.8)';
                block.style.boxShadow = '0 0 10px rgba(255,255,255,0.5)';
                break;
            case 'shadow-piece':
                block.style.opacity = '0.3';
                block.style.border = '1px dashed rgba(255,255,255,0.5)';
                block.style.background = 'transparent';
                block.style.borderColor = color;
                break;
            case 'placed-block':
                block.style.border = '1px solid rgba(255,255,255,0.3)';
                break;
            default:
                block.style.border = '1px solid rgba(255,255,255,0.2)';
                block.style.opacity = '0.8';
        }
        
        return block;
    }

    renderGameOverOverlay(fragment) {
        const overlay = document.createElement('div');
        overlay.className = 'game-over-overlay';
        overlay.style.cssText = `
            position: absolute;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            background: rgba(0, 0, 0, 0.8);
            display: flex;
            align-items: center;
            justify-content: center;
            z-index: 1000;
        `;
        
        const text = document.createElement('div');
        text.className = 'game-over-text';
        text.textContent = 'GAME OVER';
        text.style.cssText = `
            color: #ff4444;
            font-size: 24px;
            font-weight: bold;
            text-shadow: 2px 2px 4px rgba(0,0,0,0.8);
            animation: pulse 1s infinite;
        `;
        
        overlay.appendChild(text);
        fragment.appendChild(overlay);
    }

    // เพิ่มการจัดการ responsive design
    handleResize() {
        const gameContainer = document.querySelector('.game-container');
        if (!gameContainer) return;
        
        const containerWidth = gameContainer.offsetWidth;
        const maxBoardWidth = Math.floor(containerWidth / 2) - 40; // 40px for margins
        
        if (maxBoardWidth < this.BOARD_WIDTH * this.BLOCK_SIZE) {
            // ปรับขนาดบล็อค
            const newBlockSize = Math.floor(maxBoardWidth / this.BOARD_WIDTH);
            this.BLOCK_SIZE = Math.max(20, newBlockSize); // ขั้นต่ำ 20px
            
            // อัพเดตบอร์ด
            this.updateBoard();
        }
    }

    // เพิ่มการจัดการ pause game
    pauseGame() {
        if (this.dropTimer) {
            clearInterval(this.dropTimer);
            this.dropTimer = null;
        }
        this.gamePaused = true;
    }

    resumeGame() {
        if (this.gamePaused && this.gameStarted && !this.gameState.gameOver) {
            this.startDropTimer();
            this.gamePaused = false;
        }
    }

    // เพิ่มการจัดการ visibility change (เมื่อ tab ไม่ active)
    handleVisibilityChange() {
        if (document.hidden) {
            this.pauseGame();
        } else {
            this.resumeGame();
        }
    }

    // เพิ่ม event listeners สำหรับ responsive และ pause
    setupAdditionalListeners() {
        window.addEventListener('resize', this.handleResize.bind(this));
        document.addEventListener('visibilitychange', this.handleVisibilityChange.bind(this));
        
        // เพิ่ม copy button event
        const copyButton = document.getElementById('btn-copy-room');
        if (copyButton) {
            copyButton.addEventListener('click', () => {
                this.copyRoomId();
            });
        }
    }

    // ปรับปรุง init method
    initEnhanced() {
        this.init();
        this.setupAdditionalListeners();
        this.gamePaused = false;
        
        // แทนที่ updateBoard ด้วย updateBoardOptimized
        this.updateBoard = this.updateBoardOptimized;
    }
}

// เพิ่ม CSS styles ที่จำเป็น
const additionalStyles = `
    .shadow-piece {
        pointer-events: none;
    }
    
    .game-over-overlay {
        animation: fadeIn 0.5s ease-in;
    }
    
    @keyframes fadeIn {
        from { opacity: 0; }
        to { opacity: 1; }
    }
    
    @keyframes pulse {
        0%, 100% { transform: scale(1); }
        50% { transform: scale(1.05); }
    }
    
    .winner-message.win {
        color: #4CAF50;
        text-shadow: 0 0 10px rgba(76, 175, 80, 0.5);
    }
    
    .winner-message.lose {
        color: #f44336;
        text-shadow: 0 0 10px rgba(244, 67, 54, 0.5);
    }
    
    .score-row {
        display: flex;
        justify-content: space-between;
        margin: 8px 0;
        padding: 8px;
        background: rgba(255, 255, 255, 0.1);
        border-radius: 4px;
    }
    
    .connection-status {
        position: fixed;
        top: 10px;
        right: 10px;
        padding: 8px 16px;
        border-radius: 20px;
        font-size: 14px;
        font-weight: bold;
        z-index: 1000;
    }
    
    .connection-status.connected {
        background: rgba(76, 175, 80, 0.9);
        color: white;
    }
    
    .connection-status.disconnected {
        background: rgba(244, 67, 54, 0.9);
        color: white;
    }
    
    @media (max-width: 768px) {
        .tetris-block {
            border-width: 1px;
        }
        
        .control-button {
            touch-action: manipulation;
            user-select: none;
        }
    }
`;

// เพิ่ม styles ลงใน document
if (!document.getElementById('additional-styles')) {
    const styleSheet = document.createElement('style');
    styleSheet.id = 'additional-styles';
    styleSheet.textContent = additionalStyles;
    document.head.appendChild(styleSheet);
}

// สร้าง instance ใหม่ด้วยการปรับปรุง
const tetrisGame = new TetrisMultiplayer();
tetrisGame.initEnhanced();

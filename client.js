// TwoBob Tactics - Tetris Multiplayer Client (Fixed Version)
// =========================================

// Global Variables
let socket; // ตัวแปรสำหรับจัดการการเชื่อมต่อ Socket.IO กับเซิร์ฟเวอร์
let gameState = { // สถานะปัจจุบันของเกมและผู้เล่น
    currentPlayer: null, // ข้อมูลของผู้เล่นปัจจุบัน
    room: null, // รหัสห้องที่ผู้เล่นอยู่
    isReady: false, // สถานะว่าผู้เล่นพร้อมเล่นหรือไม่
    inGame: false // สถานะว่าเกมกำลังดำเนินอยู่หรือไม่
};

// =========================================
// Socket Connection Management
// =========================================

// ฟังก์ชันสำหรับเริ่มต้นการเชื่อมต่อ Socket
function initSocket() {
    socket = io();
    
    // เหตุการณ์เมื่อเชื่อมต่อกับเซิร์ฟเวอร์สำเร็จ
    socket.on('connect', () => {
        console.log('Connected to server');
        updateConnectionStatus(true); // อัปเดตสถานะการเชื่อมต่อบน UI
        enableButtons(); // เปิดใช้งานปุ่มต่างๆ
    });

    // เหตุการณ์เมื่อการเชื่อมต่อกับเซิร์ฟเวอร์ขาดหาย
    socket.on('disconnect', () => {
        console.log('Disconnected from server');
        updateConnectionStatus(false); // อัปเดตสถานะการเชื่อมต่อบน UI
        disableButtons(); // ปิดใช้งานปุ่มต่างๆ
        showScreen('connection-screen'); // แสดงหน้าจอแจ้งเตือนการเชื่อมต่อขาดหาย
    });

    // Room Events
    socket.on('room-created', (data) => {
        gameState.room = data.roomId;
        gameState.currentPlayer = data.player;
        showScreen('waiting-screen'); // แสดงหน้าจอรอผู้เล่น
        updateRoomDisplay(); // อัปเดต UI ด้วยรหัสห้อง
    });

    // เหตุการณ์เมื่อเข้าร่วมห้องสำเร็จ
    socket.on('room-joined', (data) => {
        gameState.room = data.roomId;
        gameState.currentPlayer = data.player;
        showScreen('waiting-screen'); // แสดงหน้าจอรอผู้เล่น
        updateRoomDisplay(); // อัปเดต UI ด้วยรหัสห้อง
    });

    // เหตุการณ์เมื่อห้องเต็ม
    socket.on('room-full', () => {
        alert('ห้องเต็มแล้ว!');
        showScreen('menu-screen'); // กลับไปหน้าเมนู
    });

    // เหตุการณ์เมื่อไม่พบห้อง
    socket.on('room-not-found', () => {
        alert('ไม่พบห้องดังกล่าว!');
        showScreen('menu-screen'); // กลับไปหน้าเมนู
    });

    // เหตุการณ์เมื่อรายชื่อผู้เล่นในห้องมีการอัปเดต
    socket.on('players-updated', (players) => {
        updatePlayersList(players); // อัปเดตรายชื่อผู้เล่นบนหน้าจอรอ
    });
    // เหตุการณ์เมื่อผู้เล่นคนอื่นเปลี่ยนสถานะพร้อมเล่น
    socket.on('player-ready', (data) => {
        updateReadyStatus(data); // อัปเดตสถานะพร้อมเล่นบนหน้าจอรอ
    });

    // Game Events
    // เหตุการณ์เมื่อเกมเริ่มต้น
    socket.on('game-start', (data) => {
        gameState.inGame = true;
        showScreen('game-screen'); // เปลี่ยนไปหน้าจอเกม
        initGame(data); // เริ่มต้นการตั้งค่าเกม
    });

    // เหตุการณ์เมื่อสถานะเกมมีการอัปเดตจากเซิร์ฟเวอร์
    socket.on('game-state', (data) => {
        updateGameDisplay(data); // อัปเดตกระดานและสถิติเกม
    });

    // เหตุการณ์เมื่อเกมจบ
    socket.on('game-over', (data) => {
        gameState.inGame = false;
        showGameOver(data); // แสดงหน้าจอเกมโอเวอร์
    });

    // เหตุการณ์เมื่อมีข้อผิดพลาดจากเซิร์ฟเวอร์
    socket.on('error', (message) => {
        console.error('Socket error:', message);
        alert('Error: ' + message);
    });
}

// =========================================
// UI Management Functions (with null checks)
// =========================================

// ฟังก์ชันสำหรับเปลี่ยนหน้าจอที่แสดงผล
function showScreen(screenId) {
    try {
        // ซ่อนทุกหน้าจอ
        document.querySelectorAll('.screen').forEach(screen => {
            screen.style.display = 'none';
        });
        
        // แสดงหน้าจอที่ระบุ
        const targetScreen = document.getElementById(screenId);
        if (targetScreen) {
            targetScreen.style.display = 'block';
        } else {
            console.error(`Screen not found: ${screenId}`);
        }
    } catch (error) {
        console.error('Error showing screen:', error);
    }
}

// ฟังก์ชันสำหรับอัปเดตสถานะการเชื่อมต่อบนหน้า UI
function updateConnectionStatus(connected) {
    try {
        const statusElement = document.getElementById('connection-status');
        if (statusElement) {
            if (connected) {
                statusElement.className = 'connection-status connected';
                statusElement.innerHTML = '🟢 เชื่อมต่อแล้ว';
            } else {
                statusElement.className = 'connection-status disconnected';
                statusElement.innerHTML = '🔴 ไม่ได้เชื่อมต่อ';
            }
        }
    } catch (error) {
        console.error('Error updating connection status:', error);
    }
}
// ฟังก์ชันสำหรับเปิดใช้งานปุ่มสร้างและเข้าร่วมห้อง
function enableButtons() {
    try {
        const createBtn = document.getElementById('btn-create-room');
        const joinBtn = document.getElementById('btn-join-room');
        
        if (createBtn) createBtn.disabled = false;
        if (joinBtn) joinBtn.disabled = false;
    } catch (error) {
        console.error('Error enabling buttons:', error);
    }
}
// ฟังก์ชันสำหรับปิดใช้งานปุ่มสร้างและเข้าร่วมห้อง
function disableButtons() {
    try {
        const createBtn = document.getElementById('btn-create-room');
        const joinBtn = document.getElementById('btn-join-room');
        
        if (createBtn) createBtn.disabled = true;
        if (joinBtn) joinBtn.disabled = true;
    } catch (error) {
        console.error('Error disabling buttons:', error);
    }
}

// =========================================
// Room Management Functions (with null checks)
// =========================================
// ฟังก์ชันสำหรับอัปเดตการแสดงรหัสห้อง
function updateRoomDisplay() {
    try {
        const roomDisplay = document.getElementById('room-id-display');
        if (roomDisplay) {
            roomDisplay.textContent = gameState.room || '-';
        }
    } catch (error) {
        console.error('Error updating room display:', error);
    }
}
// ฟังก์ชันสำหรับอัปเดตรายชื่อผู้เล่นในห้อง
function updatePlayersList(players) {
    try {
        const playersList = document.getElementById('players-list');
        if (!playersList) return;
        
        playersList.innerHTML = '';
        
        if (Array.isArray(players)) {
            players.forEach((player, index) => {
                const li = document.createElement('li');
                li.textContent = `${player.name || 'Unknown'} ${player.ready ? '✅' : '⏳'}`;
                if (gameState.currentPlayer && player.id === gameState.currentPlayer.id) {
                    li.classList.add('current-player');
                }
                playersList.appendChild(li);
            });
        }

       // เปิดใช้งานปุ่มพร้อมเล่นเมื่อมีชื่อผู้เล่นแล้ว
        const readyBtn = document.getElementById('btn-ready');
        if (readyBtn) {
            readyBtn.disabled = false;
        }
    } catch (error) {
        console.error('Error updating players list:', error);
    }
}

// =========================================
// Game Functions (with error handling)
// =========================================

// ฟังก์ชันสำหรับวาดกระดานเกมเปล่า
function initGameBoard(boardId, rows, cols) {
    try {
        const board = document.getElementById(boardId);
        if (!board) {
            console.error(`Game board not found: ${boardId}`);
            return;
        }
        
        board.innerHTML = '';
        board.style.position = 'relative';
        
        // สร้างตารางสำหรับพื้นหลังกระดาน
        const cellSize = boardId === 'my-board' ? 32 : 16;
        
        for (let r = 0; r < rows; r++) {
            for (let c = 0; c < cols; c++) {
                const cell = document.createElement('div');
                cell.className = 'tetris-block grid-cell';
                cell.style.width = cellSize + 'px';
                cell.style.height = cellSize + 'px';
                cell.style.left = (c * cellSize) + 'px';
                cell.style.top = (r * cellSize) + 'px';
                cell.style.position = 'absolute';
                cell.style.background = 'rgba(255,255,255,0.05)';
                cell.style.border = '1px solid rgba(255,255,255,0.1)';
                board.appendChild(cell);
            }
        }
    } catch (error) {
        console.error('Error initializing game board:', error);
    }
}

// ฟังก์ชันสำหรับวาดชิ้นส่วนปัจจุบันที่กำลังเคลื่อนที่
function drawCurrentPiece(boardId, pieceData, cellSize) {
    try {
        const board = document.getElementById(boardId);
        if (!board || !pieceData) return;
        
        if (pieceData.shape && pieceData.position && Array.isArray(pieceData.shape)) {
            const { x, y } = pieceData.position;
            
            pieceData.shape.forEach((row, r) => {
                if (Array.isArray(row)) {
                    row.forEach((cell, c) => {
                        if (cell) {
                            const block = document.createElement('div');
                            block.className = `tetris-block block-${pieceData.type} current-piece`;
                            block.style.width = cellSize + 'px';
                            block.style.height = cellSize + 'px';
                            block.style.left = ((x + c) * cellSize) + 'px';
                            block.style.top = ((y + r) * cellSize) + 'px';
                            block.style.position = 'absolute';
                            block.style.opacity = '0.8';
                            board.appendChild(block);
                        }
                    });
                }
            });
        }
    } catch (error) {
        console.error('Error drawing current piece:', error);
    }
}


// =========================================
// Game Controls (with error handling)
// =========================================
// ฟังก์ชันสำหรับตั้งค่าการควบคุมเกมทั้งหมด
function initGameControls() {
    try {
        // ลบ event listener ที่เคยมีอยู่เพื่อป้องกันการซ้ำซ้อน
        document.removeEventListener('keydown', handleKeyPress);
        
        // ตั้งค่าการควบคุมด้วยคีย์บอร์ด
        document.addEventListener('keydown', handleKeyPress);
        
        // ตั้งค่าการควบคุมด้วยปุ่มบนหน้าจอสำหรับมือถือ
        const buttons = {
            'btn-left': 'left',
            'btn-right': 'right',
            'btn-rotate': 'rotate',
            'btn-drop': 'drop'
        };
        
        Object.entries(buttons).forEach(([btnId, action]) => {
            const btn = document.getElementById(btnId);
            if (btn) {
                // ลบและสร้างปุ่มใหม่เพื่อล้าง event listener เดิม
                btn.replaceWith(btn.cloneNode(true));
                const newBtn = document.getElementById(btnId);
                newBtn.addEventListener('click', () => sendGameInput(action));
            }
        });
        
        // ตั้งค่าการควบคุมด้วยการสัมผัส (swipe)
        initTouchControls();
    } catch (error) {
        console.error('Error initializing game controls:', error);
    }
}
// ฟังก์ชันสำหรับตั้งค่าการควบคุมด้วยการสัมผัส (Touch/Swipe)
function initTouchControls() {
    try {
        let touchStartX = 0;
        let touchStartY = 0;
        let touchStartTime = 0;
        const QUICK_TAP_THRESHOLD = 200; // 200ms สำหรับแยก tap กับ hold
        
        const gameBoard = document.getElementById('my-board');
        if (!gameBoard) return;
        
        // ลบและสร้างกระดานใหม่เพื่อล้าง event listener เดิม
        const newBoard = gameBoard.cloneNode(true);
        gameBoard.parentNode.replaceChild(newBoard, gameBoard);
        const freshBoard = document.getElementById('my-board');
        
        freshBoard.addEventListener('touchstart', (e) => {
            e.preventDefault();
            if (e.touches && e.touches[0]) {
                touchStartX = e.touches[0].clientX;
                touchStartY = e.touches[0].clientY;
                touchStartTime = Date.now(); // บันทึกเวลาที่เริ่มสัมผัส
            }
        });
        
        freshBoard.addEventListener('touchend', (e) => {
            e.preventDefault();
            if (!e.changedTouches || !e.changedTouches[0]) return;
            
            const touchEndX = e.changedTouches[0].clientX;
            const touchEndY = e.changedTouches[0].clientY;
            const touchDuration = Date.now() - touchStartTime; // คำนวณระยะเวลาที่สัมผัส
            const deltaX = touchEndX - touchStartX;
            const deltaY = touchEndY - touchStartY;
            
            const minSwipeDistance = 30;
            
            // ตรวจสอบ swipe ก่อน (การเลื่อนนิ้วระยะไกล)
            if (Math.abs(deltaX) > Math.abs(deltaY) && Math.abs(deltaX) > minSwipeDistance) {
                // Horizontal swipe - เลื่อนซ้าย/ขวา
                if (deltaX > 0) {
                    sendGameInput('right');
                } else {
                    sendGameInput('left');
                }
            } else if (Math.abs(deltaY) > minSwipeDistance && deltaY > 0) {
                // Vertical swipe down - Soft drop (ลงช้าๆ)
                sendGameInput('down');
            } else {
                // ไม่ใช่ swipe = เป็น tap หรือ hold
                if (touchDuration > QUICK_TAP_THRESHOLD) {
                    // Hold นาน = Hard Drop (ปล่อยลงเลย)
                    sendGameInput('drop');
                } else {
                    // Tap เร็ว = หมุนบล็อค
                    sendGameInput('rotate');
                }
            }
        });
    } catch (error) {
        console.error('Error initializing touch controls:', error);
    }
}
// ฟังก์ชันสำหรับจัดการการกดปุ่มบนคีย์บอร์ด
function handleKeyPress(event) {
    try {
        if (!gameState.inGame) return;
        
        switch(event.key) {
            case 'ArrowLeft':
                event.preventDefault();
                sendGameInput('left');
                break;
            case 'ArrowRight':
                event.preventDefault();
                sendGameInput('right');
                break;
            case 'ArrowUp':
                event.preventDefault();
                sendGameInput('rotate');
                break;
            case 'ArrowDown':
                event.preventDefault();
                sendGameInput('down');
                break;
            case ' ':
                event.preventDefault();
                sendGameInput('drop');
                break;
            case 'Escape':
                event.preventDefault();
                togglePause();
                break;
        }
    } catch (error) {
        console.error('Error handling key press:', error);
    }
}
// ฟังก์ชันสำหรับส่งคำสั่งการเล่นเกมไปยังเซิร์ฟเวอร์
function sendGameInput(action) {
    try {
        if (socket && gameState.inGame) {
            socket.emit('game-input', { action: action });
        }
    } catch (error) {
        console.error('Error sending game input:', error);
    }
}
// ฟังก์ชันสำหรับส่งคำสั่งหยุดเกมชั่วคราวไปยังเซิร์ฟเวอร์
function togglePause() {
    try {
        if (socket && gameState.inGame) {
            socket.emit('pause-game');
        }
    } catch (error) {
        console.error('Error toggling pause:', error);
    }
}

// =========================================
// UI Controls (with error handling)
// =========================================
// =========================================
// Event Listeners Setup (with error handling)
// =========================================
// ฟังก์ชันสำหรับตั้งค่า Event Listener ทั้งหมดของหน้าเว็บ
function setupEventListeners() {
    try {
        // Menu buttons
        const createBtn = document.getElementById('btn-create-room');
        const joinBtn = document.getElementById('btn-join-room');
        
        if (createBtn) {
            createBtn.addEventListener('click', () => {
                showScreen('create-room-screen');
            });
        }

        if (joinBtn) {
            joinBtn.addEventListener('click', () => {
                showScreen('join-room-screen');
            });
        }

        // ปุ่มสร้างห้อง
        const confirmCreateBtn = document.getElementById('btn-confirm-create');
        if (confirmCreateBtn) {
            confirmCreateBtn.addEventListener('click', () => {
                const playerNameInput = document.getElementById('create-player-name');
                const playerName = playerNameInput ? playerNameInput.value.trim() : '';
                
                if (!playerName) {
                    alert('กรุณากรอกชื่อผู้เล่น');
                    return;
                }
                if (socket) {
                    socket.emit('create-room', { playerName: playerName });
                }
            });
        }

        // ปุ่มเข้าร่วมห้อง
        const confirmJoinBtn = document.getElementById('btn-confirm-join');
        if (confirmJoinBtn) {
            confirmJoinBtn.addEventListener('click', () => {
                const playerNameInput = document.getElementById('join-player-name');
                const roomIdInput = document.getElementById('join-room-id');
                
                const playerName = playerNameInput ? playerNameInput.value.trim() : '';
                const roomId = roomIdInput ? roomIdInput.value.trim() : '';
                
                if (!playerName || !roomId) {
                    alert('กรุณากรอกชื่อผู้เล่นและรหัสห้อง');
                    return;
                }
                if (socket) {
                    socket.emit('join-room', { playerName: playerName, roomId: roomId });
                }
            });
        }

        // Ready button
        const readyBtn = document.getElementById('btn-ready');
        if (readyBtn) {
            readyBtn.addEventListener('click', () => {
                gameState.isReady = !gameState.isReady;
                if (socket) {
                    socket.emit('player-ready', { ready: gameState.isReady });
                }
                readyBtn.textContent = gameState.isReady ? '⏳ ยกเลิกพร้อม' : '🎮 พร้อมเล่น';
            });
        }

        // Leave room
        const leaveBtn = document.getElementById('btn-leave-room');
        if (leaveBtn) {
            leaveBtn.addEventListener('click', () => {
                if (socket) {
                    socket.emit('leave-room');
                }
                gameState.room = null;
                gameState.currentPlayer = null;
                gameState.isReady = false;
                showScreen('menu-screen');
            });
        }

        // Play again
        const playAgainBtn = document.getElementById('btn-play-again');
        if (playAgainBtn) {
            playAgainBtn.addEventListener('click', () => {
                if (socket) {
                    socket.emit('play-again');
                }
                showScreen('waiting-screen');
            });
        }

        // ตั้งค่าการตรวจสอบข้อมูลที่ป้อนเข้ามา
        setupInputValidation();
    } catch (error) {
        console.error('Error setting up event listeners:', error);
    }
}
// ฟังก์ชันสำหรับตรวจสอบและกรองข้อมูลที่ผู้ใช้ป้อนเข้ามา
function setupInputValidation() {
    try {
        // อนุญาตเฉพาะตัวอักษรและตัวเลขสำหรับชื่อผู้เล่น
        const playerNameInputs = document.querySelectorAll('#create-player-name, #join-player-name');
        playerNameInputs.forEach(input => {
            if (input) {
                input.addEventListener('input', (e) => {
                     // อนุญาตตัวอักษรไทย, อังกฤษ, ตัวเลข, และช่องว่าง
                    e.target.value = e.target.value.replace(/[^\u0E00-\u0E7Fa-zA-Z0-9\s]/g, '');
                });
            }
        });

        // อนุญาตเฉพาะตัวอักษรและตัวเลขสำหรับรหัสห้อง
        const roomIdInput = document.getElementById('join-room-id');
        if (roomIdInput) {
            roomIdInput.addEventListener('input', (e) => {
                e.target.value = e.target.value.replace(/[^a-zA-Z0-9]/g, '').toUpperCase();
            });
        }

        // จัดการเหตุการณ์ Enter
        const createNameInput = document.getElementById('create-player-name');
        const joinRoomInput = document.getElementById('join-room-id');
        
        if (createNameInput) {
            createNameInput.addEventListener('keypress', (e) => {
                if (e.key === 'Enter') {
                    const createBtn = document.getElementById('btn-confirm-create');
                    if (createBtn) createBtn.click();
                }
            });
        }

        if (joinRoomInput) {
            joinRoomInput.addEventListener('keypress', (e) => {
                if (e.key === 'Enter') {
                    const joinBtn = document.getElementById('btn-confirm-join');
                    if (joinBtn) joinBtn.click();
                }
            });
        }
    } catch (error) {
        console.error('Error setting up input validation:', error);
    }
}

// =========================================
// Initialization (with error handling)
// =========================================
// ฟังก์ชันเริ่มต้นการทำงานทั้งหมดของ Client
function init() {
    try {
        console.log('Initializing TwoBob Tactics Client...');
        
         // เริ่มต้นการเชื่อมต่อ Socket
        initSocket();
        
        // ตั้งค่า Event Listener ทั้งหมด
        setupEventListeners();
        
        // เริ่มต้นเมนูยืดหด (Accordion)
        initControlsAccordion();
        
        // แสดงหน้าจอแรก
        showScreen('menu-screen');
        
        console.log('TwoBob Tactics Client initialized successfully');
    } catch (error) {
        console.error('Error during initialization:', error);
        alert('เกิดข้อผิดพลาดในการเริ่มต้นเกม กรุณาโหลดหน้าใหม่');
    }
}

// เริ่มต้นโปรแกรมเมื่อ DOM โหลดเสร็จสิ้น
document.addEventListener('DOMContentLoaded', () => {
    try {
        init();
    } catch (error) {
        console.error('Failed to initialize on DOM loaded:', error);
    }
});

// ส่งออกฟังก์ชันสำหรับการทดสอบ (ถ้าใช้ใน Node.js)
if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        showScreen,
        updateConnectionStatus,
        sendGameInput,
        gameState
    };
}

// ตัวจัดการข้อผิดพลาดส่วนกลาง
window.addEventListener('error', (event) => {
    console.error('Global JavaScript error:', event.error);
    console.error('Error details:', {
        message: event.message,
        filename: event.filename,
        lineno: event.lineno,
        colno: event.colno
    });
});

// จัดการข้อผิดพลาดจาก Promise ที่ไม่มีตัวจัดการ
window.addEventListener('unhandledrejection', (event) => {
    console.error('Unhandled promise rejection:', event.reason);
});










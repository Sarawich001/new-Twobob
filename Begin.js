// ฟังก์ชันสำหรับอัปเดตสถานะพร้อมเล่นของผู้เล่นทั้งสองคน
function updateReadyStatus(data) {
    try {
        const indicator1 = document.getElementById('ready-indicator-1');
        const indicator2 = document.getElementById('ready-indicator-2');
        
        if (indicator1 && data.player1) {
            indicator1.textContent = `${data.player1.name}: ${data.player1.ready ? 'พร้อม ✅' : 'รอ... ⏳'}`;
        }
        if (indicator2 && data.player2) {
            indicator2.textContent = `${data.player2.name}: ${data.player2.ready ? 'พร้อม ✅' : 'รอ... ⏳'}`;
        }
    } catch (error) {
        console.error('Error updating ready status:', error);
    }
}

// ฟังก์ชันสำหรับตั้งค่าเริ่มต้นเมื่อเกมเริ่ม
function initGame(gameData) {
    try {
        // สร้างกระดานเกมสำหรับผู้เล่นทั้งสองคน
        initGameBoard('my-board', 20, 10);
        initGameBoard('opponent-board', 20, 10);
        
        // Set player names
        const myNameEl = document.getElementById('my-player-name');
        const oppNameEl = document.getElementById('opponent-player-name');
        
        if (myNameEl && gameState.currentPlayer) {
            myNameEl.textContent = gameState.currentPlayer.name || 'YOU';
        }
        if (oppNameEl) {
            oppNameEl.textContent = 'กำลังรอ...';
        }
        
        // Reset scores
        resetGameStats();
        
        // ตั้งค่าการควบคุมเกม
        initGameControls();
    } catch (error) {
        console.error('Error initializing game:', error);
    }
}

// ฟังก์ชันสำหรับรีเซ็ตสถิติเกมทั้งหมดกลับเป็นค่าเริ่มต้น
function resetGameStats() {
    try {
        const elements = {
            'my-score': '0',
            'my-lines': '0',
            'my-level': '1',
            'opponent-score': '0',
            'opponent-lines': '0',
            'opponent-level': '1'
        };
        
        Object.entries(elements).forEach(([id, value]) => {
            const el = document.getElementById(id);
            if (el) {
                el.textContent = value;
            }
        });
    } catch (error) {
        console.error('Error resetting game stats:', error);
    }
}
// ฟังก์ชันสำหรับอัปเดตการแสดงผลของเกมทั้งหมด
function updateGameDisplay(gameData) {
    try {
        // อัปเดตคะแนนและสถิติของผู้เล่น
        if (gameData.players && gameState.currentPlayer) {
            const myData = gameData.players[gameState.currentPlayer.id];
            const opponentData = Object.values(gameData.players).find(p => p.id !== gameState.currentPlayer.id);
            
            if (myData) {
                const myScore = document.getElementById('my-score');
                const myLines = document.getElementById('my-lines');
                const myLevel = document.getElementById('my-level');
                
                if (myScore) myScore.textContent = myData.score || 0;
                if (myLines) myLines.textContent = myData.lines || 0;
                if (myLevel) myLevel.textContent = myData.level || 1;
                
            }
            
            if (opponentData) {
                const oppName = document.getElementById('opponent-player-name');
                const oppScore = document.getElementById('opponent-score');
                const oppLines = document.getElementById('opponent-lines');
                const oppLevel = document.getElementById('opponent-level');
                
                if (oppName) oppName.textContent = opponentData.name || 'ฝ่ายตรงข้าม';
                if (oppScore) oppScore.textContent = opponentData.score || 0;
                if (oppLines) oppLines.textContent = opponentData.lines || 0;
                if (oppLevel) oppLevel.textContent = opponentData.level || 1;
            }
        }
        
        // อัปเดตกระดานเกมของผู้เล่นทั้งสองคน
        if (gameData.boards && gameState.currentPlayer) {
            updateBoard('my-board', gameData.boards[gameState.currentPlayer.id]);
            const opponentId = Object.keys(gameData.boards).find(id => id !== gameState.currentPlayer.id);
            if (opponentId) {
                updateBoard('opponent-board', gameData.boards[opponentId]);
            }
        }
        
        // อัปเดตการแสดงผลของชิ้นส่วนต่อไป
        if (gameData.nextPieces && gameState.currentPlayer && gameData.nextPieces[gameState.currentPlayer.id]) {
            updateNextPiece(gameData.nextPieces[gameState.currentPlayer.id]);
        }
    } catch (error) {
        console.error('Error updating game display:', error);
    }
}
// ฟังก์ชันสำหรับวาดบล็อกบนกระดาน
function updateBoard(boardId, boardData) {
    try {
        if (!boardData) return;
        
        const board = document.getElementById(boardId);
        if (!board) return;
        
        const cellSize = boardId === 'my-board' ? 32 : 16;
        
        // ลบชิ้นส่วนเกมที่มีอยู่เดิม (ยกเว้นเซลล์พื้นหลัง)
        const gamePieces = board.querySelectorAll('.tetris-block:not(.grid-cell)');
        gamePieces.forEach(piece => piece.remove());
        
        // วาดสถานะของบล็อกที่วางอยู่แล้ว
        if (boardData.grid && Array.isArray(boardData.grid)) {
            boardData.grid.forEach((row, r) => {
                if (Array.isArray(row)) {
                    row.forEach((cell, c) => {
                        if (cell) {
                            const block = document.createElement('div');
                            block.className = `tetris-block block-${cell}`;
                            block.style.width = cellSize + 'px';
                            block.style.height = cellSize + 'px';
                            block.style.left = (c * cellSize) + 'px';
                            block.style.top = (r * cellSize) + 'px';
                            block.style.position = 'absolute';
                            board.appendChild(block);
                        }
                    });
                }
            });
        }
        
        // วาดชิ้นส่วนปัจจุบันที่กำลังเคลื่อนที่อยู่
        if (boardData.currentPiece) {
            drawCurrentPiece(boardId, boardData.currentPiece, cellSize);
        }
    } catch (error) {
        console.error('Error updating board:', error);
    }
}
// ฟังก์ชันสำหรับอัปเดตการแสดงผลของชิ้นส่วนต่อไป
function updateNextPiece(nextPieceData) {
    try {
        const nextPieceContainer = document.getElementById('next-piece-preview');
        if (!nextPieceContainer) return;
        
        nextPieceContainer.innerHTML = '';
        
        if (nextPieceData && nextPieceData.shape && Array.isArray(nextPieceData.shape)) {
            const blockSize = 20;
            
            nextPieceData.shape.forEach((row, r) => {
                if (Array.isArray(row)) {
                    row.forEach((cell, c) => {
                        if (cell) {
                            const block = document.createElement('div');
                            block.className = `tetris-block block-${nextPieceData.type}`;
                            block.style.width = blockSize + 'px';
                            block.style.height = blockSize + 'px';
                            block.style.left = (c * blockSize) + 'px';
                            block.style.top = (r * blockSize) + 'px';
                            block.style.position = 'absolute';
                            nextPieceContainer.appendChild(block);
                        }
                    });
                }
            });
        }
    } catch (error) {
        console.error('Error updating next piece:', error);
    }
}
// ฟังก์ชันสำหรับแสดงหน้าจอเกมโอเวอร์
// ฟังก์ชันสำหรับแสดงหน้าจอเกมโอเวอร์ (แก้ไขแล้ว)
function showGameOver(data) {
    try {
        const winnerMessage = document.getElementById('winner-message');
        const finalScoreP1 = document.getElementById('final-score-p1');
        const finalScoreP2 = document.getElementById('final-score-p2');
        const finalNameP1 = document.getElementById('final-name-p1');
        const finalNameP2 = document.getElementById('final-name-p2');
        
        // ตรวจสอบว่ามี data และ gameState.currentPlayer
        if (!data || !gameState.currentPlayer) {
            console.error('Missing game over data or current player');
            return;
        }
        
        if (winnerMessage) {
            if (data.winner === gameState.currentPlayer.id) {
                winnerMessage.textContent = '🎉 คุณชนะ!';
                winnerMessage.style.color = '#4CAF50';
            } else {
                winnerMessage.textContent = '😢 คุณแพ้!';
                winnerMessage.style.color = '#f44336';
            }
        }
        
        // ดึงชื่อจากหน้าจอเกมที่กำลังแสดงอยู่
        const myPlayerNameEl = document.getElementById('my-player-name');
        const opponentPlayerNameEl = document.getElementById('opponent-player-name');
        
        const myDisplayName = myPlayerNameEl ? myPlayerNameEl.textContent : 'คุณ';
        const opponentDisplayName = opponentPlayerNameEl ? opponentPlayerNameEl.textContent : 'ฝ่ายตรงข้าม';
        
        // แสดงชื่อที่ดึงมาจากหน้าจอเกม
        if (finalNameP1) {
            finalNameP1.textContent = myDisplayName;
        }
        if (finalNameP2) {
            finalNameP2.textContent = opponentDisplayName;
        }
        
        // แสดงคะแนนจาก data ที่ได้รับ
        if (data.finalScores && data.players) {
            const currentPlayerId = gameState.currentPlayer.id.toString();
            const opponentId = Object.keys(data.players).find(id => id !== currentPlayerId);
            
            if (finalScoreP1) {
                finalScoreP1.textContent = data.finalScores[currentPlayerId] || 0;
            }
            if (finalScoreP2) {
                finalScoreP2.textContent = data.finalScores[opponentId] || 0;
            }
        } else {
            // ใช้คะแนนจากหน้าจอเกมถ้าไม่มีข้อมูลจาก server
            const myScoreEl = document.getElementById('my-score');
            const opponentScoreEl = document.getElementById('opponent-score');
            
            if (finalScoreP1) {
                finalScoreP1.textContent = myScoreEl ? myScoreEl.textContent : '0';
            }
            if (finalScoreP2) {
                finalScoreP2.textContent = opponentScoreEl ? opponentScoreEl.textContent : '0';
            }
        }
        
        showScreen('game-over-screen');
    } catch (error) {
        console.error('Error showing game over:', error);
    }
}

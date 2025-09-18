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

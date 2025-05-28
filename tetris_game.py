import pygame
import random
import sys
import json
import os

# Initialize Pygame
pygame.init()

# Game Configuration
GRID_WIDTH = 10
GRID_HEIGHT = 20
TILE_SIZE = 28
WINDOW_WIDTH = 1200
WINDOW_HEIGHT = 800

# Modern Colors (Dark theme with neon accents)
COLORS = {
    'background': (15, 25, 35),
    'grid': (45, 65, 85, 80),
    'ui_bg': (25, 35, 50, 220),
    'panel_bg': (30, 45, 65, 200),
    'border': (0, 255, 255),
    'text': (255, 255, 255),
    'text_secondary': (180, 200, 220),
    'neon_cyan': (0, 255, 255),
    'neon_magenta': (255, 100, 255),
    'neon_green': (100, 255, 100),
    'neon_orange': (255, 165, 0),
    'neon_yellow': (255, 255, 100),
    'accent_blue': (100, 150, 255),
    'I': (0, 255, 255),
    'O': (255, 255, 100),
    'T': (255, 100, 255),
    'S': (100, 255, 100),
    'Z': (255, 100, 100),
    'J': (100, 100, 255),
    'L': (255, 165, 100)
}

# Tetris Pieces
TETROMINOS = {
    'I': {
        'shape': [
            [0, 0, 0, 0],
            [1, 1, 1, 1],
            [0, 0, 0, 0],
            [0, 0, 0, 0]
        ],
        'color': 'I'
    },
    'O': {
        'shape': [
            [1, 1],
            [1, 1]
        ],
        'color': 'O'
    },
    'T': {
        'shape': [
            [0, 1, 0],
            [1, 1, 1],
            [0, 0, 0]
        ],
        'color': 'T'
    },
    'S': {
        'shape': [
            [0, 1, 1],
            [1, 1, 0],
            [0, 0, 0]
        ],
        'color': 'S'
    },
    'Z': {
        'shape': [
            [1, 1, 0],
            [0, 1, 1],
            [0, 0, 0]
        ],
        'color': 'Z'
    },
    'J': {
        'shape': [
            [1, 0, 0],
            [1, 1, 1],
            [0, 0, 0]
        ],
        'color': 'J'
    },
    'L': {
        'shape': [
            [0, 0, 1],
            [1, 1, 1],
            [0, 0, 0]
        ],
        'color': 'L'
    }
}

class ModernTetrisGame:
    def __init__(self):
        self.screen = pygame.display.set_mode((WINDOW_WIDTH, WINDOW_HEIGHT))
        pygame.display.set_caption('TwoBob Tactics - Tetris')
        self.clock = pygame.time.Clock()
        
        # Game state
        self.grid = [[None for _ in range(GRID_WIDTH)] for _ in range(GRID_HEIGHT)]
        self.current_piece = None
        self.next_piece = None
        self.current_x = 0
        self.current_y = 0
        self.score = 0
        self.lines = 0
        self.level = 1
        self.game_running = False
        self.game_paused = False
        self.drop_time = 0
        self.drop_speed = 1000
        self.high_score = self.load_high_score()
        
        # Thai fonts (fallback to system fonts if Thai not available)
        try:
            self.font_large = pygame.font.Font(None, 48)
            self.font_medium = pygame.font.Font(None, 32)
            self.font_small = pygame.font.Font(None, 24)
            self.font_title = pygame.font.Font(None, 36)
        except:
            self.font_large = pygame.font.Font(None, 48)
            self.font_medium = pygame.font.Font(None, 32)
            self.font_small = pygame.font.Font(None, 24)
            self.font_title = pygame.font.Font(None, 36)
        
        # UI positions - centered layout
        self.board_x = WINDOW_WIDTH // 2 - (GRID_WIDTH * TILE_SIZE) // 2
        self.board_y = 100
        
        # Panel positions
        self.left_panel_x = 50
        self.right_panel_x = self.board_x + GRID_WIDTH * TILE_SIZE + 50
        self.panel_width = 200
        
    def load_high_score(self):
        try:
            if os.path.exists('tetris_score.json'):
                with open('tetris_score.json', 'r') as f:
                    data = json.load(f)
                    return data.get('high_score', 0)
        except:
            pass
        return 0
    
    def save_high_score(self):
        try:
            with open('tetris_score.json', 'w') as f:
                json.dump({'high_score': self.high_score}, f)
        except:
            pass
    
    def create_random_piece(self):
        piece_type = random.choice(list(TETROMINOS.keys()))
        piece = TETROMINOS[piece_type].copy()
        piece['shape'] = [row[:] for row in piece['shape']]
        return piece
    
    def can_move(self, piece, new_x, new_y):
        for y, row in enumerate(piece['shape']):
            for x, cell in enumerate(row):
                if cell:
                    grid_x = new_x + x
                    grid_y = new_y + y
                    
                    if grid_x < 0 or grid_x >= GRID_WIDTH or grid_y >= GRID_HEIGHT:
                        return False
                    
                    if grid_y >= 0 and self.grid[grid_y][grid_x] is not None:
                        return False
        return True
    
    def rotate_matrix(self, matrix):
        rows = len(matrix)
        cols = len(matrix[0]) if rows > 0 else 0
        rotated = [[0 for _ in range(rows)] for _ in range(cols)]
        
        for i in range(cols):
            for j in range(rows):
                rotated[i][j] = matrix[rows - 1 - j][i]
        
        return rotated
    
    def place_piece(self):
        for y, row in enumerate(self.current_piece['shape']):
            for x, cell in enumerate(row):
                if cell:
                    grid_y = self.current_y + y
                    grid_x = self.current_x + x
                    if 0 <= grid_y < GRID_HEIGHT and 0 <= grid_x < GRID_WIDTH:
                        self.grid[grid_y][grid_x] = self.current_piece['color']
        
        self.check_lines()
        
        if self.is_game_over():
            self.end_game()
            return
        
        self.spawn_new_piece()
    
    def check_lines(self):
        lines_cleared = 0
        row = GRID_HEIGHT - 1
        
        while row >= 0:
            if all(cell is not None for cell in self.grid[row]):
                del self.grid[row]
                self.grid.insert(0, [None for _ in range(GRID_WIDTH)])
                lines_cleared += 1
            else:
                row -= 1
        
        if lines_cleared > 0:
            self.lines += lines_cleared
            line_score = {1: 100, 2: 300, 3: 500, 4: 800}
            self.score += line_score.get(lines_cleared, 0) * self.level
            self.level = self.lines // 10 + 1
            self.drop_speed = max(100, 1000 - (self.level - 1) * 100)
    
    def is_game_over(self):
        return any(cell is not None for cell in self.grid[0])
    
    def spawn_new_piece(self):
        self.current_piece = self.next_piece or self.create_random_piece()
        self.next_piece = self.create_random_piece()
        self.current_x = GRID_WIDTH // 2 - len(self.current_piece['shape'][0]) // 2
        self.current_y = -1
        
        if not self.can_move(self.current_piece, self.current_x, self.current_y):
            self.end_game()
    
    def move_down(self):
        if not self.game_running or self.game_paused:
            return
        
        if self.can_move(self.current_piece, self.current_x, self.current_y + 1):
            self.current_y += 1
        else:
            self.place_piece()
    
    def hard_drop(self):
        if not self.game_running or self.game_paused:
            return
        
        while self.can_move(self.current_piece, self.current_x, self.current_y + 1):
            self.current_y += 1
            self.score += 2
        
        self.place_piece()
    
    def start_game(self):
        if self.game_running:
            return
        
        self.grid = [[None for _ in range(GRID_WIDTH)] for _ in range(GRID_HEIGHT)]
        self.score = 0
        self.lines = 0
        self.level = 1
        self.drop_speed = 1000
        self.game_running = True
        self.game_paused = False
        self.drop_time = 0
        
        self.spawn_new_piece()
    
    def pause_game(self):
        if not self.game_running:
            return
        self.game_paused = not self.game_paused
    
    def end_game(self):
        if self.score > self.high_score:
            self.high_score = self.score
            self.save_high_score()
        
        self.game_running = False
        self.game_paused = False
    
    def restart_game(self):
        self.game_running = False
        self.start_game()
    
    def handle_input(self, event):
        if event.type == pygame.KEYDOWN:
            if not self.game_running or self.game_paused:
                if event.key == pygame.K_SPACE:
                    if not self.game_running:
                        self.start_game()
                    else:
                        self.pause_game()
                return
            
            if event.key == pygame.K_LEFT:
                if self.can_move(self.current_piece, self.current_x - 1, self.current_y):
                    self.current_x -= 1
            
            elif event.key == pygame.K_RIGHT:
                if self.can_move(self.current_piece, self.current_x + 1, self.current_y):
                    self.current_x += 1
            
            elif event.key == pygame.K_DOWN:
                self.move_down()
            
            elif event.key == pygame.K_UP:
                rotated_shape = self.rotate_matrix(self.current_piece['shape'])
                rotated_piece = {'shape': rotated_shape, 'color': self.current_piece['color']}
                if self.can_move(rotated_piece, self.current_x, self.current_y):
                    self.current_piece['shape'] = rotated_shape
            
            elif event.key == pygame.K_SPACE:
                self.hard_drop()
            
            elif event.key == pygame.K_p:
                self.pause_game()
            
            elif event.key == pygame.K_r:
                self.restart_game()
    
    def draw_rounded_rect(self, surface, color, rect, radius=10):
        """Draw rounded rectangle"""
        pygame.draw.rect(surface, color, rect, border_radius=radius)
    
    def draw_modern_block(self, x, y, color, alpha=255):
        """Draw modern styled block with gradient effect"""
        rect = pygame.Rect(x, y, TILE_SIZE, TILE_SIZE)
        
        # Create surface with alpha
        surf = pygame.Surface((TILE_SIZE, TILE_SIZE))
        surf.set_alpha(alpha)
        
        # Main color
        pygame.draw.rect(surf, COLORS[color], surf.get_rect(), border_radius=4)
        
        # Highlight effect
        highlight_color = tuple(min(255, c + 30) for c in COLORS[color][:3])
        highlight_rect = pygame.Rect(2, 2, TILE_SIZE-4, TILE_SIZE-4)
        pygame.draw.rect(surf, highlight_color, highlight_rect, 2, border_radius=3)
        
        self.screen.blit(surf, rect)
    
    def draw_grid(self):
        """Draw modern game board with rounded corners"""
        # Board background with rounded corners
        board_rect = pygame.Rect(
            self.board_x - 10, self.board_y - 10,
            GRID_WIDTH * TILE_SIZE + 20, GRID_HEIGHT * TILE_SIZE + 20
        )
        self.draw_rounded_rect(self.screen, COLORS['panel_bg'], board_rect, 15)
        
        # Border with glow effect
        pygame.draw.rect(self.screen, COLORS['neon_cyan'], board_rect, 3, border_radius=15)
        
        # Grid lines with subtle styling
        for x in range(GRID_WIDTH + 1):
            start_pos = (self.board_x + x * TILE_SIZE, self.board_y)
            end_pos = (self.board_x + x * TILE_SIZE, self.board_y + GRID_HEIGHT * TILE_SIZE)
            pygame.draw.line(self.screen, COLORS['grid'], start_pos, end_pos, 1)
        
        for y in range(GRID_HEIGHT + 1):
            start_pos = (self.board_x, self.board_y + y * TILE_SIZE)
            end_pos = (self.board_x + GRID_WIDTH * TILE_SIZE, self.board_y + y * TILE_SIZE)
            pygame.draw.line(self.screen, COLORS['grid'], start_pos, end_pos, 1)
    
    def draw_board(self):
        """Draw the game board with pieces"""
        # Draw placed blocks
        for row in range(GRID_HEIGHT):
            for col in range(GRID_WIDTH):
                if self.grid[row][col] is not None:
                    x = self.board_x + col * TILE_SIZE
                    y = self.board_y + row * TILE_SIZE
                    self.draw_modern_block(x, y, self.grid[row][col])
        
        # Draw current falling piece
        if self.current_piece:
            for row, line in enumerate(self.current_piece['shape']):
                for col, cell in enumerate(line):
                    if cell:
                        x = self.board_x + (self.current_x + col) * TILE_SIZE
                        y = self.board_y + (self.current_y + row) * TILE_SIZE
                        if y >= self.board_y:
                            self.draw_modern_block(x, y, self.current_piece['color'], 230)
    
    def draw_player_panel(self):
        """Draw left panel with player info (Thai style)"""
        panel_rect = pygame.Rect(self.left_panel_x, 50, self.panel_width, 150)
        self.draw_rounded_rect(self.screen, COLORS['panel_bg'], panel_rect, 12)
        pygame.draw.rect(self.screen, COLORS['neon_cyan'], panel_rect, 2, border_radius=12)
        
        # Player title
        title = self.font_title.render('ผู้เล่น', True, COLORS['neon_cyan'])
        self.screen.blit(title, (self.left_panel_x + 20, 70))
        
        # Player name
        name = self.font_medium.render('You', True, COLORS['text'])
        self.screen.blit(name, (self.left_panel_x + 20, 105))
        
        # Level
        level_label = self.font_small.render('เลเวล', True, COLORS['text_secondary'])
        level_value = self.font_medium.render(str(self.level), True, COLORS['neon_yellow'])
        self.screen.blit(level_label, (self.left_panel_x + 20, 140))
        self.screen.blit(level_value, (self.left_panel_x + 20, 160))
    
    def draw_next_piece_panel(self):
        """Draw next piece panel"""
        panel_rect = pygame.Rect(self.left_panel_x, 220, self.panel_width, 180)
        self.draw_rounded_rect(self.screen, COLORS['panel_bg'], panel_rect, 12)
        pygame.draw.rect(self.screen, COLORS['neon_magenta'], panel_rect, 2, border_radius=12)
        
        # Title
        title = self.font_title.render('NEXT PIECE', True, COLORS['neon_magenta'])
        self.screen.blit(title, (self.left_panel_x + 20, 240))
        
        # Draw next piece
        if self.next_piece:
            shape = self.next_piece['shape']
            color = self.next_piece['color']
            
            # Center the piece in panel
            piece_width = len(shape[0]) * 24
            piece_height = len(shape) * 24
            start_x = self.left_panel_x + (self.panel_width - piece_width) // 2
            start_y = 280
            
            for row, line in enumerate(shape):
                for col, cell in enumerate(line):
                    if cell:
                        x = start_x + col * 24
                        y = start_y + row * 24
                        rect = pygame.Rect(x, y, 24, 24)
                        pygame.draw.rect(self.screen, COLORS[color], rect, border_radius=4)
                        # Highlight
                        highlight_rect = pygame.Rect(x+2, y+2, 20, 20)
                        highlight_color = tuple(min(255, c + 30) for c in COLORS[color][:3])
                        pygame.draw.rect(self.screen, highlight_color, highlight_rect, 2, border_radius=3)
    
    def draw_score_panel(self):
        """Draw right panel with score info (Thai style)"""
        panel_rect = pygame.Rect(self.right_panel_x, 50, self.panel_width, 200)
        self.draw_rounded_rect(self.screen, COLORS['panel_bg'], panel_rect, 12)
        pygame.draw.rect(self.screen, COLORS['accent_blue'], panel_rect, 2, border_radius=12)
        
        # Title
        title = self.font_title.render('คะแนน', True, COLORS['accent_blue'])
        self.screen.blit(title, (self.right_panel_x + 20, 70))
        
        # Score
        score_value = self.font_large.render(str(self.score), True, COLORS['neon_cyan'])
        self.screen.blit(score_value, (self.right_panel_x + 20, 105))
        
        # Lines
        lines_label = self.font_small.render('เส้น', True, COLORS['text_secondary'])
        lines_value = self.font_medium.render(str(self.lines), True, COLORS['text'])
        self.screen.blit(lines_label, (self.right_panel_x + 20, 160))
        self.screen.blit(lines_value, (self.right_panel_x + 20, 180))
        
        # High Score
        high_label = self.font_small.render('คะแนนสูงสุด', True, COLORS['text_secondary'])
        high_value = self.font_medium.render(str(self.high_score), True, COLORS['neon_orange'])
        self.screen.blit(high_label, (self.right_panel_x + 20, 210))
        self.screen.blit(high_value, (self.right_panel_x + 20, 225))
    
    def draw_controls_panel(self):
        """Draw controls panel (Thai style)"""
        panel_rect = pygame.Rect(self.right_panel_x, 270, self.panel_width, 200)
        self.draw_rounded_rect(self.screen, COLORS['panel_bg'], panel_rect, 12)
        pygame.draw.rect(self.screen, COLORS['neon_yellow'], panel_rect, 2, border_radius=12)
        
        # Title
        title = self.font_small.render('การควบคุม', True, COLORS['neon_yellow'])
        self.screen.blit(title, (self.right_panel_x + 20, 290))
        
        # Controls in Thai
        controls = [
            ('เลื่อนซ้าย', '←'),
            ('เลื่อนขวา', '→'),
            ('หมุน', '↑'),
            ('ตกเร็ว', '↓'),
            ('ดรอป', 'Space')
        ]
        
        y_offset = 315
        for thai, key in controls:
            thai_text = self.font_small.render(thai, True, COLORS['text_secondary'])
            key_text = self.font_small.render(key, True, COLORS['text'])
            
            self.screen.blit(thai_text, (self.right_panel_x + 20, y_offset))
            self.screen.blit(key_text, (self.right_panel_x + 120, y_offset))
            y_offset += 25
    
    def draw_pause_screen(self):
        """Draw modern pause overlay"""
        # Semi-transparent overlay
        overlay = pygame.Surface((WINDOW_WIDTH, WINDOW_HEIGHT))
        overlay.set_alpha(180)
        overlay.fill((0, 0, 0))
        self.screen.blit(overlay, (0, 0))
        
        # Pause panel
        panel_rect = pygame.Rect(WINDOW_WIDTH//2 - 150, WINDOW_HEIGHT//2 - 80, 300, 160)
        self.draw_rounded_rect(self.screen, COLORS['panel_bg'], panel_rect, 20)
        pygame.draw.rect(self.screen, COLORS['neon_cyan'], panel_rect, 3, border_radius=20)
        
        # Pause text
        pause_text = self.font_large.render('หยุดชั่วคราว', True, COLORS['neon_cyan'])
        text_rect = pause_text.get_rect(center=(WINDOW_WIDTH//2, WINDOW_HEIGHT//2 - 20))
        self.screen.blit(pause_text, text_rect)
        
        continue_text = self.font_small.render('กด P เพื่อเล่นต่อ', True, COLORS['text_secondary'])
        text_rect = continue_text.get_rect(center=(WINDOW_WIDTH//2, WINDOW_HEIGHT//2 + 20))
        self.screen.blit(continue_text, text_rect)
    
    def draw_game_over_screen(self):
        """Draw modern game over screen"""
        overlay = pygame.Surface((WINDOW_WIDTH, WINDOW_HEIGHT))
        overlay.set_alpha(200)
        overlay.fill((0, 0, 0))
        self.screen.blit(overlay, (0, 0))
        
        # Game over panel
        panel_rect = pygame.Rect(WINDOW_WIDTH//2 - 200, WINDOW_HEIGHT//2 - 120, 400, 240)
        self.draw_rounded_rect(self.screen, COLORS['panel_bg'], panel_rect, 20)
        pygame.draw.rect(self.screen, (255, 100, 100), panel_rect, 3, border_radius=20)
        
        # Game over text
        game_over_text = self.font_large.render('เกมจบแล้ว', True, (255, 100, 100))
        text_rect = game_over_text.get_rect(center=(WINDOW_WIDTH//2, WINDOW_HEIGHT//2 - 60))
        self.screen.blit(game_over_text, text_rect)
        
        final_score_text = self.font_medium.render(f'คะแนนสุดท้าย: {self.score}', True, COLORS['neon_cyan'])
        text_rect = final_score_text.get_rect(center=(WINDOW_WIDTH//2, WINDOW_HEIGHT//2 - 10))
        self.screen.blit(final_score_text, text_rect)
        
        restart_text = self.font_small.render('กด SPACE เพื่อเริ่มใหม่', True, COLORS['text_secondary'])
        text_rect = restart_text.get_rect(center=(WINDOW_WIDTH//2, WINDOW_HEIGHT//2 + 40))
        self.screen.blit(restart_text, text_rect)
    
    def draw_start_screen(self):
        """Draw modern start screen"""
        # Title
        title_text = self.font_large.render('TwoBob Tactics - TETRIS', True, COLORS['neon_cyan'])
        text_rect = title_text.get_rect(center=(WINDOW_WIDTH//2, WINDOW_HEIGHT//2 - 100))
        self.screen.blit(title_text, text_rect)
        
        # Subtitle
        subtitle_text = self.font_medium.render('เกมเทตริสสไตล์ไทย', True, COLORS['neon_magenta'])
        text_rect = subtitle_text.get_rect(center=(WINDOW_WIDTH//2, WINDOW_HEIGHT//2 - 50))
        self.screen.blit(subtitle_text, text_rect)
        
        # Start instruction
        start_text = self.font_title.render('กด SPACE เพื่อเริ่มเล่น', True, COLORS['text'])
        text_rect = start_text.get_rect(center=(WINDOW_WIDTH//2, WINDOW_HEIGHT//2 + 20))
        self.screen.blit(start_text, text_rect)
    
    def update(self, dt):
        if self.game_running and not self.game_paused:
            self.drop_time += dt
            if self.drop_time >= self.drop_speed:
                self.move_down()
                self.drop_time = 0
    
    def draw(self):
        self.screen.fill(COLORS['background'])
        
        if not self.game_running:
            self.draw_start_screen()
        else:
            # Draw game elements
            self.draw_grid()
            self.draw_board()
            
            # Draw UI panels
            self.draw_player_panel()
            self.draw_next_piece_panel()
            self.draw_score_panel()
            self.draw_controls_panel()
            
            # Draw overlays
            if self.game_paused:
                self.draw_pause_screen()
            elif self.is_game_over():
                self.draw_game_over_screen()
        
        pygame.display.flip()
    
    def run(self):
        running = True
        
        while running:
            dt = self.clock.tick(60)
            
            for event in pygame.event.get():
                if event.type == pygame.QUIT:
                    running = False
                else:
                    self.handle_input(event)
            
            self.update(dt)
            self.draw()
        
        pygame.quit()
        sys.exit()

if __name__ == '__main__':
    game = ModernTetrisGame()
    game.run()
import React, { useEffect, useRef, useState, useCallback } from 'react';
import { GameState, Fighter, ActionState, Direction, Box, Particle, FighterStats, HitEffect, Difficulty } from '../types';
import { getSenseiFeedback } from '../services/geminiService';
import { RefreshCw, Play, Trophy, Home, BookOpen, X, Zap } from 'lucide-react';

// --- Constants ---
const CANVAS_WIDTH = 800;
const CANVAS_HEIGHT = 450;
const GRAVITY = 0.8;
const FRICTION = 0.85;
const FLOOR_Y = 380;
const BACKGROUND_IMAGE_URL = './background.png'; // Make sure your image is named 'background.png'

// Stats Definitions - INCREASED HP for longer fights
const TAI_CHI_STATS: FighterStats = {
  hp: 300, maxHp: 300, energy: 0, maxEnergy: 100, speed: 4, jumpForce: 15, damageLight: 8, damageHeavy: 20, defense: 0.6, 
  name: 'Master Li', style: 'Tai Chi', color: '#111827' // Deep Black
};
const WING_CHUN_STATS: FighterStats = {
  hp: 250, maxHp: 250, energy: 0, maxEnergy: 100, speed: 8, jumpForce: 13, damageLight: 6, damageHeavy: 18, defense: 0.3, 
  name: 'Sifu Ip', style: 'Wing Chun', color: '#dc2626' // Vivid Red
};

// --- Helper Functions ---
const createFighter = (id: number, x: number, isAi: boolean, stats: FighterStats): Fighter => ({
  id, x, y: FLOOR_Y, vx: 0, vy: 0, facing: id === 1 ? 1 : -1,
  state: 'IDLE', frameTimer: 0, comboIndex: 0, stats: { ...stats },
  hurtbox: { x: 0, y: 0, w: 50, h: 100 },
  cooldown: 0, isAi
});

const checkCollision = (r1: Box, r2: Box) => {
  return r1.x < r2.x + r2.w && r1.x + r1.w > r2.x && r1.y < r2.y + r2.h && r1.y + r1.h > r2.y;
};

const FightingGame: React.FC = () => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const requestRef = useRef<number | null>(null);
  const bgImageRef = useRef<HTMLImageElement | null>(null);
  
  // UI State
  const [gameStatus, setGameStatus] = useState<'MENU' | 'PLAYING' | 'GAMEOVER'>('MENU');
  const [showTutorial, setShowTutorial] = useState(false);
  const [winnerMessage, setWinnerMessage] = useState<string | null>(null);
  const [senseiWisdom, setSenseiWisdom] = useState<string | null>(null);
  const [gameTime, setGameTime] = useState(60);
  const [selectedDifficulty, setSelectedDifficulty] = useState<Difficulty>('Medium');
  
  // Player Selection
  const [playerChar, setPlayerChar] = useState<'Tai Chi' | 'Wing Chun'>('Tai Chi');

  // Game State Ref
  const gameState = useRef<GameState>({
    p1: createFighter(1, 100, false, TAI_CHI_STATS),
    p2: createFighter(2, 600, true, WING_CHUN_STATS),
    particles: [],
    hitEffects: [],
    timer: 60,
    gameOver: false,
    winner: null,
    paused: false,
    shake: 0,
    difficulty: 'Medium'
  });

  const keys = useRef<{ [key: string]: boolean }>({});

  // Load background image
  useEffect(() => {
      const img = new Image();
      img.src = BACKGROUND_IMAGE_URL;
      img.onload = () => { 
        console.log("Background loaded successfully");
        bgImageRef.current = img; 
      };
      img.onerror = () => {
        console.warn("Could not load background.png, using fallback vector art.");
      };
  }, []);

  const startGame = useCallback(() => {
    const p1Stats = playerChar === 'Tai Chi' ? TAI_CHI_STATS : WING_CHUN_STATS;
    const p2Stats = playerChar === 'Tai Chi' ? WING_CHUN_STATS : TAI_CHI_STATS;

    gameState.current = {
      p1: createFighter(1, 100, false, p1Stats),
      p2: createFighter(2, 600, true, p2Stats),
      particles: [],
      hitEffects: [],
      timer: 60,
      gameOver: false,
      winner: null,
      paused: false,
      shake: 0,
      difficulty: selectedDifficulty
    };
    setWinnerMessage(null);
    setSenseiWisdom(null);
    setGameTime(60);
    setGameStatus('PLAYING');
  }, [playerChar, selectedDifficulty]);

  const goHome = () => {
    setGameStatus('MENU');
    setWinnerMessage(null);
    setShowTutorial(false);
  };

  const spawnParticles = (x: number, y: number, color: string, count: number, style: 'Tai Chi' | 'Wing Chun', type?: 'star' | 'line' | 'ink') => {
    for (let i = 0; i < count; i++) {
      let shape: 'circle' | 'line' | 'ink' | 'star' = 'circle';
      let vx = (Math.random() - 0.5) * 10;
      let vy = (Math.random() - 0.5) * 10;
      let size = Math.random() * 5 + 2;

      if (style === 'Wing Chun') {
        shape = type || (Math.random() > 0.3 ? 'line' : 'star');
        vx = (Math.random() - 0.5) * 25; 
        vy = (Math.random() - 0.5) * 25;
        size = Math.random() * 3 + 1; 
      } else {
        shape = 'ink';
        vx = (Math.random() - 0.5) * 4;
        vy = (Math.random() * -3) - 0.5;
        size = Math.random() * 10 + 5; 
      }

      gameState.current.particles.push({
        x, y, vx, vy, life: 1.0, color, size, shape
      });
    }
  };

  const spawnHitEffect = (x: number, y: number, type: 'impact' | 'block', style: 'Tai Chi' | 'Wing Chun') => {
    gameState.current.hitEffects.push({
      id: Math.random(),
      x, y, life: 1.0, type, style
    });
    gameState.current.shake = type === 'impact' ? (style === 'Wing Chun' ? 10 : 5) : 3;
  };

  const updateFighter = (f: Fighter, opponent: Fighter, input: { left: boolean, right: boolean, up: boolean, down: boolean, atk1: boolean, atk2: boolean, ultimate: boolean }) => {
    if (gameState.current.gameOver) return;
    if (f.stats.hp <= 0) {
      f.state = 'DEAD';
      return;
    }

    if (f.cooldown > 0) f.cooldown--;

    // --- Special States (Ult, Counter) ---
    if (f.state === 'ULTIMATE') {
        f.frameTimer--;
        f.vx = 0;
        f.vy = 0;
        
        // Ultimate Visuals
        if (f.frameTimer % 5 === 0) {
            gameState.current.shake = 5;
            spawnParticles(f.x + 25, f.y - 50, f.stats.style === 'Tai Chi' ? '#000' : '#dc2626', 5, f.stats.style, 'star');
        }

        // Damage phase (Mid animation)
        if (f.frameTimer === 20) {
             // Screen-wide hit check
             if (checkCollision({ x: 0, y: 0, w: CANVAS_WIDTH, h: CANVAS_HEIGHT }, { x: opponent.x, y: opponent.y - opponent.hurtbox.h, w: opponent.hurtbox.w, h: opponent.hurtbox.h })) {
                 opponent.stats.hp -= 80;
                 opponent.state = 'HIT';
                 opponent.frameTimer = 60;
                 opponent.vx = f.facing * 30;
                 spawnHitEffect(opponent.x, opponent.y - 50, 'impact', f.stats.style);
             }
        }

        if (f.frameTimer <= 0) {
            f.state = 'IDLE';
        }
        return;
    }

    if (f.state === 'COUNTER') {
        f.frameTimer--;
        // Dash through
        f.vx = f.facing * 15;
        
        if (f.hitbox && checkCollision(f.hitbox, { x: opponent.x, y: opponent.y - opponent.hurtbox.h, w: opponent.hurtbox.w, h: opponent.hurtbox.h })) {
             if (opponent.state !== 'HIT' && opponent.state !== 'DEAD') {
                 opponent.stats.hp -= 25;
                 opponent.state = 'HIT';
                 opponent.frameTimer = 30;
                 opponent.vx = f.facing * 15;
                 spawnHitEffect(opponent.x + 25, opponent.y - 50, 'impact', f.stats.style);
                 f.hitbox = undefined;
             }
        }
        
        if (f.frameTimer <= 0) {
            f.state = 'IDLE';
            f.hitbox = undefined;
        }
        return;
    }


    // --- Attack State Logic ---
    if (f.state === 'ATTACK_LIGHT' || f.state === 'ATTACK_HEAVY') {
        f.frameTimer--;
        
        // Procedural Trails
        if (f.frameTimer > 0 && f.hitbox) {
             const tipX = f.hitbox.x + (f.facing === 1 ? f.hitbox.w : 0);
             const tipY = f.hitbox.y + f.hitbox.h / 2;
             if (Math.random() > 0.5) {
                 const color = f.stats.style === 'Wing Chun' ? '#ffffff' : 'rgba(0,0,0,0.6)';
                 spawnParticles(tipX, tipY, color, 1, f.stats.style, f.stats.style === 'Wing Chun' ? 'line' : 'ink');
             }
        }

        // COMBO TRANSITION
        if (f.state === 'ATTACK_LIGHT' && input.atk1 && f.frameTimer < 10 && f.comboIndex < 2 && f.cooldown <= 0) {
            f.comboIndex++;
            f.frameTimer = f.stats.style === 'Wing Chun' ? 12 : 18; 
            f.cooldown = 5; 
            
            // Re-define hitbox if missing
            if (!f.hitbox) f.hitbox = { x: f.x, y: f.y - 70, w: 80, h: 60 };

            if (f.stats.style === 'Wing Chun') {
                f.hitbox.w = f.comboIndex === 1 ? 90 : 80;
            } else {
                f.hitbox.w = f.comboIndex === 2 ? 100 : 80;
            }
            return;
        }

        if (f.frameTimer <= 0) {
            f.state = 'IDLE';
            f.hitbox = undefined;
            f.comboIndex = 0; 
        } else if (f.hitbox) {
            // Update Hitbox Position
            f.hitbox.x = f.x + (f.facing === 1 ? f.hurtbox.w : -f.hitbox.w);
            f.hitbox.y = f.y - 70;
            if (f.stats.style === 'Tai Chi' && f.comboIndex === 2) f.hitbox.y = f.y - 80;

            // Collision Check
            if (checkCollision(f.hitbox, { x: opponent.x, y: opponent.y - opponent.hurtbox.h, w: opponent.hurtbox.w, h: opponent.hurtbox.h })) {
                let damage = f.state === 'ATTACK_HEAVY' ? f.stats.damageHeavy : f.stats.damageLight;
                if (f.state === 'ATTACK_LIGHT' && f.comboIndex === 2) damage *= 1.5; 

                const impactX = f.facing === 1 ? f.hitbox.x + f.hitbox.w : f.hitbox.x;
                const impactY = f.hitbox.y + f.hitbox.h / 2;

                if (opponent.state !== 'BLOCK' && opponent.state !== 'HIT' && opponent.state !== 'DEAD' && opponent.state !== 'COUNTER' && opponent.state !== 'ULTIMATE') {
                    // HIT
                    opponent.stats.hp -= damage;
                    opponent.state = 'HIT';
                    opponent.frameTimer = 12; 
                    let knockback = 8;
                    if (f.stats.style === 'Wing Chun' && f.state === 'ATTACK_HEAVY') knockback = 25; 
                    if (f.stats.style === 'Tai Chi' && f.comboIndex === 2) knockback = 20; 
                    opponent.vx = f.facing * knockback;
                    
                    f.stats.energy = Math.min(f.stats.maxEnergy, f.stats.energy + 10);
                    opponent.stats.energy = Math.min(opponent.stats.maxEnergy, opponent.stats.energy + 15);

                    spawnHitEffect(impactX, impactY, 'impact', f.stats.style);
                    spawnParticles(impactX, impactY, f.stats.style === 'Wing Chun' ? '#ef4444' : '#111827', 15, f.stats.style);
                    f.hitbox = undefined; 
                } else if (opponent.state === 'BLOCK') {
                    // BLOCKED
                    opponent.stats.hp -= damage * 0.1;
                    opponent.vx = f.facing * 5;
                    f.stats.energy = Math.min(f.stats.maxEnergy, f.stats.energy + 5); 
                    opponent.stats.energy = Math.min(opponent.stats.maxEnergy, opponent.stats.energy + 5);
                    
                    spawnHitEffect(impactX, impactY, 'block', opponent.stats.style);
                    spawnParticles(impactX, impactY, '#fbbf24', 5, opponent.stats.style);
                    f.hitbox = undefined;
                }
            }
        }
        
        f.x += f.vx; f.vx *= 0.7;
        if (f.y < FLOOR_Y) { f.vy += GRAVITY; f.y += f.vy; }
        return;
    }

    if (f.state === 'HIT' || f.state === 'WIN' || f.state === 'DEAD') {
        if (f.state === 'HIT') {
             f.frameTimer--;
             if (f.frameTimer <= 0) f.state = 'IDLE';
        }
        if (f.y < FLOOR_Y) { f.vy += GRAVITY; f.y += f.vy; }
        f.x += f.vx; f.vx *= FRICTION;
        return;
    }

    // --- Inputs for Idle/Moving ---
    
    // ULTIMATE
    if (input.ultimate && f.stats.energy >= 100 && f.cooldown <= 0) {
        f.state = 'ULTIMATE';
        f.frameTimer = 90; // 1.5 second Cinematic
        f.stats.energy = 0;
        f.hitbox = { x: 0, y: 0, w: 0, h: 0 }; // Initial trigger, damage comes later
        return;
    }
    
    // MOVEMENT
    if (input.left) {
      f.vx -= f.stats.speed * 0.2;
      if (f.vx < -f.stats.speed) f.vx = -f.stats.speed;
      f.facing = -1; f.state = 'WALK';
    } else if (input.right) {
      f.vx += f.stats.speed * 0.2;
      if (f.vx > f.stats.speed) f.vx = f.stats.speed;
      f.facing = 1; f.state = 'WALK';
    } else {
      f.vx *= FRICTION; f.state = 'IDLE';
    }

    if (input.up && f.y >= FLOOR_Y) { f.vy = -f.stats.jumpForce; f.state = 'JUMP'; }
    if (input.down) { f.state = 'BLOCK'; f.vx = 0; }

    // COUNTER (While blocking + Attack)
    if (input.down && (input.atk1 || input.atk2) && f.stats.energy >= 30) {
        f.state = 'COUNTER';
        f.stats.energy -= 30;
        f.frameTimer = 20;
        f.hitbox = { x: 0, y: 0, w: 100, h: 60 };
        return;
    }

    // ATTACKS
    if (input.atk1 && f.cooldown <= 0) {
      f.state = 'ATTACK_LIGHT';
      f.comboIndex = 0; 
      f.frameTimer = f.stats.style === 'Wing Chun' ? 12 : 20; 
      f.cooldown = 10;
      f.hitbox = { x: 0, y: 0, w: 80, h: 60 };
    } else if (input.atk2 && f.cooldown <= 0) {
      f.state = 'ATTACK_HEAVY';
      f.frameTimer = 30;
      f.cooldown = 40;
      f.hitbox = { x: 0, y: 0, w: 100, h: 80 };
      if (f.stats.style === 'Wing Chun') f.vx = f.facing * 10;
    }

    f.vy += GRAVITY; f.x += f.vx; f.y += f.vy;
    if (f.y > FLOOR_Y) { f.y = FLOOR_Y; f.vy = 0; }
    if (f.x < 0) f.x = 0; if (f.x > CANVAS_WIDTH - f.hurtbox.w) f.x = CANVAS_WIDTH - f.hurtbox.w;
  };

  const updateAI = (ai: Fighter, player: Fighter, difficulty: Difficulty) => {
    const dist = Math.abs(ai.x - player.x);
    const directionToPlayer = player.x < ai.x ? -1 : 1;
    const inputs = { left: false, right: false, up: false, down: false, atk1: false, atk2: false, ultimate: false };
    
    if (ai.state === 'HIT' || ai.state === 'DEAD' || ai.state === 'WIN') return inputs;
    if (ai.state === 'ULTIMATE') return inputs;

    let aggression = 0.1, reactionSpeed = 0.1, blockChance = 0.2;
    if (difficulty === 'Easy') { aggression = 0.05; reactionSpeed = 0.05; blockChance = 0.1; }
    else if (difficulty === 'Medium') { aggression = 0.1; reactionSpeed = 0.5; blockChance = 0.4; }
    else if (difficulty === 'Hard') { aggression = 0.35; reactionSpeed = 0.9; blockChance = 0.8; }

    // Use Ultimate
    if (ai.stats.energy >= 100 && dist < 200 && Math.random() < 0.05) {
        inputs.ultimate = true;
        return inputs;
    }

    if (dist < 100 && (player.state === 'ATTACK_LIGHT' || player.state === 'ATTACK_HEAVY')) {
        if (Math.random() < blockChance) { 
            inputs.down = true; 
            // Counter AI
            if (ai.stats.energy >= 30 && difficulty !== 'Easy' && Math.random() < 0.3) {
                inputs.atk1 = true;
            }
            return inputs; 
        }
    }

    if (dist > 300) {
        if (Math.random() > (1 - reactionSpeed)) {
            if (directionToPlayer === -1) inputs.left = true; else inputs.right = true;
        }
    } else if (dist < 90) {
        if (Math.random() < aggression) {
            if (ai.state === 'ATTACK_LIGHT' && ai.comboIndex < 2) {
                inputs.atk1 = true; 
            } else {
                if (Math.random() > 0.4) inputs.atk1 = true; else inputs.atk2 = true;
            }
        } 
    } else {
        if (directionToPlayer === -1) inputs.left = true; else inputs.right = true;
        if (Math.random() > 0.98) inputs.up = true;
    }
    return inputs;
  };

  // --- Draw Functions ---

  const drawTempleBackground = (ctx: CanvasRenderingContext2D) => {
      // Fallback Drawing if image fails
      const skyGrad = ctx.createLinearGradient(0, 0, 0, CANVAS_HEIGHT / 2);
      skyGrad.addColorStop(0, '#60a5fa'); skyGrad.addColorStop(1, '#93c5fd');
      ctx.fillStyle = skyGrad; ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
      ctx.fillStyle = '#166534';
      ctx.beginPath();
      ctx.moveTo(0, 380); ctx.lineTo(150, 150); ctx.lineTo(300, 380);
      ctx.lineTo(450, 180); ctx.lineTo(600, 380); ctx.lineTo(750, 100);
      ctx.lineTo(CANVAS_WIDTH, 380); ctx.lineTo(CANVAS_WIDTH, CANVAS_HEIGHT); ctx.lineTo(0, CANVAS_HEIGHT);
      ctx.fill();
      const tx = CANVAS_WIDTH / 2, ty = 320;
      ctx.fillStyle = '#991b1b'; ctx.fillRect(tx - 150, ty - 150, 20, 150); ctx.fillRect(tx + 130, ty - 150, 20, 150);
      ctx.fillStyle = '#1f2937'; ctx.fillRect(tx - 130, ty - 150, 260, 150);
      ctx.fillStyle = '#450a0a'; ctx.fillRect(tx - 40, ty - 120, 80, 120);
      ctx.fillStyle = '#e5e7eb'; ctx.fillRect(tx - 200, ty, 400, 20); ctx.fillRect(tx - 220, ty + 20, 440, 20);
      ctx.fillStyle = '#b45309';
      ctx.beginPath(); ctx.moveTo(tx - 180, ty - 150); ctx.lineTo(tx + 180, ty - 150);
      ctx.lineTo(tx + 140, ty - 220); ctx.lineTo(tx - 140, ty - 220); ctx.fill();
      ctx.fillStyle = '#111827'; ctx.fillRect(tx - 50, ty - 190, 100, 30);
      ctx.fillStyle = '#facc15'; ctx.font = '16px serif'; ctx.fillText('天后古廟', tx - 35, ty - 170);
      ctx.fillStyle = '#e5e5e5'; ctx.fillRect(0, FLOOR_Y, CANVAS_WIDTH, CANVAS_HEIGHT - FLOOR_Y);
      ctx.strokeStyle = '#d4d4d4'; ctx.lineWidth = 2; ctx.beginPath();
      for (let i = 0; i < CANVAS_WIDTH; i += 60) { ctx.moveTo(i, FLOOR_Y); ctx.lineTo(i - (i - CANVAS_WIDTH/2) * 0.5, CANVAS_HEIGHT); }
      ctx.stroke();
  };

  const drawTaiChiSkin = (ctx: CanvasRenderingContext2D, f: Fighter, bodyLean: number, armOffset: number, legOffset: number) => {
      const time = Date.now();
      if (f.state === 'BLOCK') { legOffset = 0; }
      else if (f.state === 'IDLE') { armOffset += Math.sin(time / 800) * 5; }

      ctx.fillStyle = '#111827'; 
      ctx.beginPath();
      ctx.moveTo(-15, -40); ctx.lineTo(-20 - legOffset * 0.5, 0); ctx.lineTo(-5 - legOffset * 0.5, 0); ctx.lineTo(0, -30);
      if (f.state === 'BLOCK') { ctx.lineTo(15, -25); ctx.lineTo(25, -15); ctx.lineTo(20, -5); } 
      else { ctx.lineTo(5 + legOffset, 0); ctx.lineTo(20 + legOffset, 0); }
      ctx.lineTo(15, -40); ctx.fill();
      
      ctx.fillStyle = '#000';
      if (f.state !== 'BLOCK') ctx.fillRect(-22 - legOffset * 0.5, -5, 18, 5); 
      if (f.state !== 'BLOCK') ctx.fillRect(3 + legOffset, -5, 18, 5);

      ctx.fillStyle = '#111827';
      ctx.beginPath(); ctx.moveTo(-20, -90); ctx.lineTo(20, -90); ctx.lineTo(28, -30); ctx.lineTo(-28, -30); ctx.fill();
      ctx.strokeStyle = '#f3f4f6'; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(-22, -50); ctx.lineTo(22, -50); ctx.stroke();

      ctx.fillStyle = '#fca5a5'; ctx.beginPath(); ctx.arc(0, -100, 13, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#e5e7eb'; ctx.beginPath(); ctx.moveTo(-3, -92); ctx.lineTo(3, -92); ctx.lineTo(0, -80); ctx.fill(); 
      ctx.fillStyle = '#000'; ctx.beginPath(); ctx.arc(-5, -112, 5, 0, Math.PI * 2); ctx.fill(); 

      // Ultimate Aura
      if (f.state === 'ULTIMATE') {
          ctx.strokeStyle = '#000'; ctx.lineWidth = 2;
          ctx.beginPath(); ctx.arc(0, -50, 60 + Math.sin(time/50)*10, 0, Math.PI*2); ctx.stroke();
      }

      ctx.strokeStyle = '#111827'; ctx.lineWidth = 14; ctx.lineCap = 'round';
      
      let bx = 30, by = -60, fx = 30, fy = -60;
      
      if (f.state === 'ATTACK_LIGHT') {
          if (f.comboIndex === 0) { fx = 40; fy = -70; bx = 20; by = -50; }
          else if (f.comboIndex === 1) { fx = 50; fy = -80; bx = 30; by = -80; }
          else { fx = 60; fy = -75; bx = 55; by = -70; }
      } else if (f.state === 'ATTACK_HEAVY' || f.state === 'ULTIMATE') {
          fx = 55; fy = -80; bx = 50; by = -75;
      } else if (f.state === 'BLOCK') {
          bx = 0; by = -110; fx = 35; fy = -50; 
      } else {
          fx = 30 + Math.sin(time/500)*5; fy = -60 + Math.cos(time/500)*5;
          bx = 20 + Math.cos(time/500)*5; by = -60 + Math.sin(time/500)*5;
      }

      ctx.beginPath(); ctx.moveTo(15, -85); ctx.bezierCurveTo(20, -85, bx-10, by-10, bx, by); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(-15, -85); ctx.bezierCurveTo(-10, -85, fx-10, fy-10, fx, fy); ctx.stroke();
      
      ctx.fillStyle = '#fca5a5';
      ctx.beginPath(); ctx.arc(fx + 2, fy, 5, 0, Math.PI*2); ctx.fill();
      ctx.beginPath(); ctx.arc(bx + 2, by, 5, 0, Math.PI*2); ctx.fill();
  };

  const drawWingChunSkin = (ctx: CanvasRenderingContext2D, f: Fighter, bodyLean: number, legOffset: number) => {
      const time = Date.now();
      ctx.strokeStyle = '#1f2937'; ctx.lineWidth = 10; ctx.lineCap = 'butt';
      ctx.beginPath(); 
      if (f.state === 'WALK') legOffset = Math.sin(time / 50) * 10; 
      
      ctx.moveTo(-10, -50); ctx.lineTo(-15 - legOffset, 0); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(10, -50); ctx.lineTo(15 + legOffset, 0); ctx.stroke();
      
      ctx.fillStyle = '#dc2626'; 
      ctx.fillRect(-18, -95, 36, 50); 
      ctx.fillStyle = '#fff'; ctx.fillRect(-18, -95, 36, 6); 
      ctx.fillRect(-2, -95, 4, 50); 

      // Ultimate Glow
      if (f.state === 'ULTIMATE') {
           ctx.shadowBlur = 20; ctx.shadowColor = 'yellow';
      }

      ctx.fillStyle = '#fca5a5'; ctx.beginPath(); ctx.arc(0, -105, 12, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#1f2937'; ctx.beginPath(); ctx.arc(0, -108, 13, Math.PI, 0); ctx.fill(); 

      ctx.shadowBlur = 0; // Reset

      ctx.strokeStyle = '#dc2626'; ctx.lineWidth = 12; ctx.lineJoin = 'miter';
      
      let bx = 20, by = -60, fx = 20, fy = -70; 

      if (f.state === 'ATTACK_LIGHT' || f.state === 'ULTIMATE') {
          if (f.comboIndex === 0) { fx = 45; fy = -85; }
          else if (f.comboIndex === 1) { fx = 55; fy = -80; }
          else { 
              fx = 45 + Math.random() * 20; fy = -85 + (Math.random()-0.5)*10;
              bx = 40 + Math.random() * 20; by = -85 + (Math.random()-0.5)*10;
          }
          if (f.state === 'ULTIMATE') {
               fx = 55 + Math.random() * 30;
               bx = 55 + Math.random() * 30;
          }
      } else if (f.state === 'ATTACK_HEAVY' || f.state === 'COUNTER') {
          fx = 55; fy = -80;
      } else if (f.state === 'BLOCK') {
          bx = 10; by = -100; fx = 25; fy = -60; 
      }

      ctx.beginPath(); ctx.moveTo(15, -85); ctx.lineTo(bx, by); ctx.stroke();
      ctx.fillStyle = '#fff'; ctx.fillRect(bx-4, by-4, 8, 8);

      ctx.beginPath(); ctx.moveTo(-15, -85); ctx.lineTo(fx, fy); ctx.stroke();
      ctx.fillStyle = '#fff'; ctx.fillRect(fx-4, fy-4, 8, 8);
      
      ctx.fillStyle = '#fca5a5';
      if ((f.state === 'ATTACK_LIGHT' && f.comboIndex < 2)) {
          ctx.beginPath(); ctx.ellipse(fx+5, fy, 6, 3, 0, 0, Math.PI*2); ctx.fill();
      } else {
          ctx.beginPath(); ctx.arc(fx, fy, 5, 0, Math.PI*2); ctx.fill();
      }
  };

  const drawFighter = (ctx: CanvasRenderingContext2D, f: Fighter) => {
    ctx.save();
    ctx.translate(f.x + f.hurtbox.w / 2, f.y);
    ctx.scale(f.facing, 1);

    let legOffset = 0, armOffset = 0, bodyLean = 0;
    const time = Date.now();
    
    if (f.state === 'WALK') legOffset = Math.sin(time / 100) * 15;
    if (f.state === 'ATTACK_HEAVY') { bodyLean = 15 * (Math.PI / 180); legOffset = 20; }
    if (f.state === 'HIT') bodyLean = -20 * (Math.PI / 180);
    if (f.state === 'DEAD') bodyLean = -90 * (Math.PI / 180);
    if (f.state === 'ULTIMATE') { bodyLean = -5 * (Math.PI / 180); }

    ctx.rotate(bodyLean);

    // Counter Flash
    if (f.state === 'COUNTER') {
        ctx.shadowBlur = 30; ctx.shadowColor = '#3b82f6';
    }

    if (f.stats.style === 'Tai Chi') {
        drawTaiChiSkin(ctx, f, bodyLean, armOffset, legOffset);
    } else {
        drawWingChunSkin(ctx, f, bodyLean, legOffset);
    }
    
    ctx.restore();
  };

  const drawHitEffects = (ctx: CanvasRenderingContext2D) => {
    gameState.current.hitEffects.forEach(effect => {
        ctx.save(); ctx.translate(effect.x, effect.y);
        const scale = 1 + (1 - effect.life) * 1.5; ctx.scale(scale, scale);
        
        if (effect.type === 'impact') {
            if (effect.style === 'Wing Chun') {
                ctx.rotate(Math.random());
                ctx.fillStyle = '#fff';
                ctx.beginPath(); ctx.moveTo(-20,0); ctx.lineTo(20,0); ctx.stroke();
                ctx.beginPath(); ctx.moveTo(0,-20); ctx.lineTo(0,20); ctx.stroke();
                ctx.fillStyle = `rgba(220, 38, 38, ${effect.life})`; 
                for(let i=0; i<8; i++) {
                    ctx.rotate(Math.PI / 4);
                    ctx.beginPath(); ctx.moveTo(0,0); ctx.lineTo(30, 0); ctx.lineTo(5, 2); ctx.fill();
                }
            } else {
                ctx.globalAlpha = effect.life;
                ctx.fillStyle = '#111827'; 
                ctx.beginPath(); ctx.arc(0,0, 20 * scale, 0, Math.PI*2); ctx.fill();
                ctx.strokeStyle = '#fff'; ctx.lineWidth = 2;
                ctx.beginPath(); ctx.arc(0,0, 40 * scale, 0, Math.PI*2); ctx.stroke();
                ctx.globalAlpha = 1.0;
            }
        } else {
            ctx.strokeStyle = `rgba(255, 255, 255, ${effect.life})`; ctx.lineWidth = 3;
            ctx.beginPath(); ctx.arc(0,0, 30 * scale, 0, Math.PI*2); ctx.stroke();
        }
        ctx.restore();
    });
  };

  const draw = (ctx: CanvasRenderingContext2D) => {
    const { p1, p2, particles, shake } = gameState.current;
    ctx.clearRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
    ctx.save();
    
    // ULT DARKENING
    if (p1.state === 'ULTIMATE' || p2.state === 'ULTIMATE') {
        ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
        ctx.fillRect(0,0, CANVAS_WIDTH, CANVAS_HEIGHT);
        gameState.current.shake = 2; 
    }

    if (shake > 0) {
        const dx = (Math.random() - 0.5) * shake * 2;
        const dy = (Math.random() - 0.5) * shake * 2;
        ctx.translate(dx, dy);
        gameState.current.shake = Math.max(0, shake - 1);
    }

    // DRAW BACKGROUND
    if (bgImageRef.current) {
        // Draw image scaled to cover canvas
        ctx.drawImage(bgImageRef.current, 0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
        // Draw Floor overlay
        ctx.fillStyle = '#e5e5e5'; 
        ctx.fillRect(0, FLOOR_Y, CANVAS_WIDTH, CANVAS_HEIGHT - FLOOR_Y);
        ctx.strokeStyle = '#d4d4d4'; ctx.lineWidth = 2; ctx.beginPath();
        for (let i = 0; i < CANVAS_WIDTH; i += 60) { ctx.moveTo(i, FLOOR_Y); ctx.lineTo(i - (i - CANVAS_WIDTH/2) * 0.5, CANVAS_HEIGHT); }
        ctx.stroke();
    } else {
        drawTempleBackground(ctx);
    }

    drawFighter(ctx, p1);
    drawFighter(ctx, p2);

    // Particles logic...
    for (const p of particles) {
      ctx.fillStyle = p.color; ctx.globalAlpha = p.life;
      ctx.beginPath(); 
      if (p.shape === 'line') {
          ctx.moveTo(p.x, p.y); ctx.lineTo(p.x - p.vx * 4, p.y - p.vy * 4);
          ctx.lineWidth = 2; ctx.strokeStyle = p.color; ctx.stroke();
      } else if (p.shape === 'ink') {
          ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2); ctx.fill();
          ctx.arc(p.x + 2, p.y + 2, p.size * 0.7, 0, Math.PI * 2); ctx.fill();
      } else if (p.shape === 'star') {
          ctx.moveTo(p.x - p.size, p.y); ctx.lineTo(p.x + p.size, p.y);
          ctx.moveTo(p.x, p.y - p.size); ctx.lineTo(p.x, p.y + p.size);
          ctx.strokeStyle = p.color; ctx.lineWidth = 2; ctx.stroke();
      } else {
          ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2); ctx.fill();
      }
      ctx.globalAlpha = 1;
    }
    drawHitEffects(ctx);
    ctx.restore();
  };

  const gameLoop = () => {
    if (gameState.current.paused || gameStatus !== 'PLAYING') {
         requestRef.current = requestAnimationFrame(gameLoop);
         return;
    }

    try {
        const st = gameState.current;

        if (!st.gameOver) {
            const p1Input = {
                left: keys.current['a'] || keys.current['ArrowLeft'],
                right: keys.current['d'] || keys.current['ArrowRight'],
                up: keys.current['w'] || keys.current['ArrowUp'],
                down: keys.current['s'] || keys.current['ArrowDown'],
                atk1: keys.current['j'] || keys.current['z'],
                atk2: keys.current['k'] || keys.current['x'],
                ultimate: (keys.current['j'] && keys.current['k']) || (keys.current['z'] && keys.current['x']) || keys.current[' '] || keys.current['u']
            };
            
            const p2Input = updateAI(st.p2, st.p1, st.difficulty);
            updateFighter(st.p1, st.p2, p1Input);
            updateFighter(st.p2, st.p1, p2Input);

            if (st.timer > 0 && Math.random() < (1/60)) {
                st.timer -= 1;
                setGameTime(Math.floor(st.timer));
            }

            for (let i = st.particles.length - 1; i >= 0; i--) {
                const p = st.particles[i];
                p.x += p.vx; p.y += p.vy;
                if (p.shape === 'ink') { p.vx *= 0.9; p.vy *= 0.95; p.size += 0.2; p.life -= 0.02; } 
                else { p.life -= 0.08; }
                if (p.life <= 0) st.particles.splice(i, 1);
            }
            
            for (let i = st.hitEffects.length - 1; i >= 0; i--) {
                st.hitEffects[i].life -= 0.1;
                if (st.hitEffects[i].life <= 0) st.hitEffects.splice(i, 1);
            }

            if (st.p1.stats.hp <= 0 || st.p2.stats.hp <= 0 || st.timer <= 0) {
                st.gameOver = true;
                let winner: Fighter | null = null;
                let loser: Fighter | null = null;

                if (st.p1.stats.hp <= 0 && st.p2.stats.hp > 0) {
                    st.winner = 2; st.p2.state = 'WIN'; winner = st.p2; loser = st.p1;
                    setWinnerMessage("YOU LOSE");
                } else if (st.p2.stats.hp <= 0 && st.p1.stats.hp > 0) {
                    st.winner = 1; st.p1.state = 'WIN'; winner = st.p1; loser = st.p2;
                    setWinnerMessage("YOU WIN");
                } else {
                    if (st.p1.stats.hp > st.p2.stats.hp) {
                        st.winner = 1; st.p1.state = 'WIN'; winner = st.p1; loser = st.p2;
                        setWinnerMessage("TIME OUT - YOU WIN");
                    } else if (st.p2.stats.hp > st.p1.stats.hp) {
                        st.winner = 2; st.p2.state = 'WIN'; winner = st.p2; loser = st.p1;
                        setWinnerMessage("TIME OUT - YOU LOSE");
                    } else {
                        setWinnerMessage("DRAW");
                    }
                }
                setGameStatus('GAMEOVER');

                if (winner && loser) {
                setSenseiWisdom("Thinking...");
                getSenseiFeedback(winner, loser, st.timer).then(setSenseiWisdom);
                }
            }
        }

        const ctx = canvasRef.current?.getContext('2d');
        if (ctx) draw(ctx);

    } catch (e) {
        console.error("Game Loop Crash:", e);
    }
    
    requestRef.current = requestAnimationFrame(gameLoop);
  };

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => { 
        keys.current[e.key] = true; 
        keys.current[e.key.toLowerCase()] = true; 
    };
    const handleKeyUp = (e: KeyboardEvent) => { 
        keys.current[e.key] = false; 
        keys.current[e.key.toLowerCase()] = false;
    };
    window.addEventListener('keydown', handleKeyDown); window.addEventListener('keyup', handleKeyUp);
    requestRef.current = requestAnimationFrame(gameLoop);
    return () => {
      window.removeEventListener('keydown', handleKeyDown); window.removeEventListener('keyup', handleKeyUp);
      if (requestRef.current) cancelAnimationFrame(requestRef.current);
    };
  }, [gameStatus]);

  return (
    <div className="relative w-full max-w-4xl mx-auto border-4 border-gray-700 rounded-lg overflow-hidden shadow-2xl bg-gray-900 min-h-[450px]">
      
      {/* HUD */}
      {gameStatus !== 'MENU' && (
        <div className="absolute top-0 left-0 w-full p-4 flex justify-between items-start z-10 font-arcade">
            {/* Player 1 Health */}
            <div className="w-1/3">
                <div className="flex justify-between text-blue-300 mb-1 text-sm">
                    <span>{gameState.current.p1.stats.name} (P1)</span>
                </div>
                <div className="h-6 w-full bg-gray-800 border-2 border-white skew-x-[-10deg] mb-1">
                    <div 
                        className="h-full bg-blue-500 transition-all duration-200"
                        style={{ width: `${Math.max(0, (gameState.current.p1.stats.hp / gameState.current.p1.stats.maxHp) * 100)}%` }}
                    ></div>
                </div>
                <div className="h-2 w-3/4 bg-gray-800 border border-gray-500 skew-x-[-10deg]">
                     <div 
                        className={`h-full transition-all duration-100 ${gameState.current.p1.stats.energy >= 100 ? 'bg-purple-400 shadow-[0_0_10px_#c084fc] animate-pulse' : 'bg-yellow-400 shadow-[0_0_10px_#facc15]'}`}
                        style={{ width: `${(gameState.current.p1.stats.energy / gameState.current.p1.stats.maxEnergy) * 100}%` }}
                    ></div>
                </div>
            </div>

            {/* Timer */}
            <div className="w-16 h-16 bg-yellow-500 border-4 border-white rounded-full flex items-center justify-center text-2xl text-black font-bold shadow-lg z-20">
                {gameTime}
            </div>

            {/* Player 2 Health */}
            <div className="w-1/3">
                <div className="flex justify-between text-red-300 mb-1 text-sm">
                    <span className="ml-auto">{gameState.current.p2.stats.name} (CPU)</span>
                </div>
                <div className="h-6 w-full bg-gray-800 border-2 border-white skew-x-[10deg] mb-1">
                    <div 
                        className="h-full bg-red-500 transition-all duration-200 ml-auto"
                        style={{ width: `${Math.max(0, (gameState.current.p2.stats.hp / gameState.current.p2.stats.maxHp) * 100)}%` }}
                    ></div>
                </div>
                <div className="h-2 w-3/4 ml-auto bg-gray-800 border border-gray-500 skew-x-[10deg]">
                     <div 
                        className={`h-full transition-all duration-100 ml-auto ${gameState.current.p2.stats.energy >= 100 ? 'bg-purple-400 shadow-[0_0_10px_#c084fc] animate-pulse' : 'bg-yellow-400 shadow-[0_0_10px_#facc15]'}`}
                        style={{ width: `${(gameState.current.p2.stats.energy / gameState.current.p2.stats.maxEnergy) * 100}%` }}
                    ></div>
                </div>
            </div>
        </div>
      )}

      {/* Main Canvas */}
      <canvas 
        ref={canvasRef} 
        width={CANVAS_WIDTH} 
        height={CANVAS_HEIGHT} 
        className="w-full h-auto block bg-black"
      />

      {/* Menu Screen */}
      {gameStatus === 'MENU' && (
        <div className="absolute inset-0 bg-black/80 flex flex-col items-center justify-center text-white z-20">
            <h1 className="text-5xl font-arcade text-yellow-400 mb-2 tracking-widest text-center">ZEN STRIKE</h1>
            <p className="mb-6 text-gray-300 text-sm">Select Your Master</p>
            
            {/* Character Select */}
            <div className="flex gap-8 mb-8">
                 <button 
                    onClick={() => setPlayerChar('Tai Chi')}
                    className={`flex flex-col items-center p-4 border-4 rounded-lg transition-all ${playerChar === 'Tai Chi' ? 'border-gray-500 bg-gray-900/50 scale-105' : 'border-gray-600 hover:border-gray-400'}`}
                 >
                    <div className="w-16 h-16 bg-black border-2 border-white rounded-full mb-2 flex items-center justify-center text-2xl">☯️</div>
                    <span className="font-bold text-lg">Tai Chi</span>
                    <span className="text-xs text-gray-400">Master Li</span>
                 </button>

                 <button 
                    onClick={() => setPlayerChar('Wing Chun')}
                    className={`flex flex-col items-center p-4 border-4 rounded-lg transition-all ${playerChar === 'Wing Chun' ? 'border-red-500 bg-red-900/50 scale-105' : 'border-gray-600 hover:border-gray-400'}`}
                 >
                    <div className="w-16 h-16 bg-red-600 border-2 border-white rounded-full mb-2 flex items-center justify-center text-2xl">👊</div>
                    <span className="font-bold text-lg">Wing Chun</span>
                    <span className="text-xs text-gray-400">Sifu Ip</span>
                 </button>
            </div>

            {/* Difficulty */}
            <div className="flex gap-4 mb-6">
                {(['Easy', 'Medium', 'Hard'] as Difficulty[]).map((level) => (
                    <button
                        key={level}
                        onClick={() => setSelectedDifficulty(level)}
                        className={`px-3 py-1 rounded text-sm font-bold border-2 transition-all ${
                            selectedDifficulty === level 
                            ? 'bg-yellow-500 text-black border-yellow-500' 
                            : 'bg-transparent text-gray-400 border-gray-600'
                        }`}
                    >
                        {level}
                    </button>
                ))}
            </div>

            <div className="flex gap-4">
                 <button 
                    onClick={startGame}
                    className="group flex items-center gap-2 bg-yellow-500 hover:bg-yellow-400 text-black font-bold py-3 px-12 rounded-full text-xl transition-transform hover:scale-105 shadow-[0_0_20px_rgba(234,179,8,0.5)]"
                >
                    <Play className="w-6 h-6" /> FIGHT
                </button>
                <button
                    onClick={() => setShowTutorial(true)}
                    className="flex items-center gap-2 bg-gray-700 hover:bg-gray-600 text-white font-bold py-3 px-6 rounded-full transition-transform hover:scale-105"
                >
                     <BookOpen className="w-6 h-6" /> How to Play
                </button>
            </div>
        </div>
      )}

      {/* Tutorial Overlay */}
      {showTutorial && gameStatus === 'MENU' && (
          <div className="absolute inset-0 bg-black/95 flex flex-col items-center justify-center text-white z-30 p-8 animate-in fade-in">
              <div className="bg-gray-800 p-8 rounded-lg max-w-2xl w-full border-2 border-gray-600 relative shadow-2xl">
                   <button 
                        onClick={() => setShowTutorial(false)}
                        className="absolute top-4 right-4 text-gray-400 hover:text-white"
                   >
                        <X className="w-8 h-8" />
                   </button>
                   
                   <h2 className="text-3xl font-arcade text-yellow-400 mb-6 text-center border-b border-gray-700 pb-4">TRAINING SCROLL</h2>
                   
                   <div className="grid grid-cols-2 gap-8 mb-8">
                       <div>
                           <h3 className="text-xl font-bold text-blue-400 mb-4">Controls</h3>
                           <ul className="space-y-3 text-sm text-gray-300">
                               <li className="flex items-center gap-2"><span className="bg-gray-700 px-2 py-1 rounded border border-gray-500">W</span> Jump</li>
                               <li className="flex items-center gap-2"><span className="bg-gray-700 px-2 py-1 rounded border border-gray-500">A</span> / <span className="bg-gray-700 px-2 py-1 rounded border border-gray-500">D</span> Move</li>
                               <li className="flex items-center gap-2"><span className="bg-gray-700 px-2 py-1 rounded border border-gray-500">S</span> Block</li>
                           </ul>
                       </div>
                       <div>
                           <h3 className="text-xl font-bold text-red-400 mb-4">Combat</h3>
                           <ul className="space-y-3 text-sm text-gray-300">
                               <li className="flex items-center gap-2"><span className="bg-gray-700 px-2 py-1 rounded border border-gray-500">J</span> / <span className="bg-gray-700 px-2 py-1 rounded border border-gray-500">Z</span> Light (Combo)</li>
                               <li className="flex items-center gap-2"><span className="bg-gray-700 px-2 py-1 rounded border border-gray-500">K</span> / <span className="bg-gray-700 px-2 py-1 rounded border border-gray-500">X</span> Heavy Attack</li>
                               <li className="flex items-center gap-2 text-yellow-400"><span className="bg-yellow-700 px-2 py-1 rounded border border-yellow-500">SPACE</span> Ultimate (Full Energy)</li>
                               <li className="flex items-center gap-2 text-blue-400"><span className="bg-gray-700 px-2 py-1 rounded border border-gray-500">S</span> + <span className="bg-gray-700 px-2 py-1 rounded border border-gray-500">J</span> Counter (Hold Block)</li>
                           </ul>
                       </div>
                   </div>

                   <div className="bg-gray-900 p-4 rounded border border-gray-700">
                       <h3 className="text-lg font-bold text-yellow-500 mb-2">Advanced Techniques</h3>
                       <p className="text-sm text-gray-400 mb-2">
                           <strong>Counter Strike:</strong> While holding BLOCK (S), press LIGHT ATTACK (J/Z) to dash through an enemy attack. Costs 30 Energy.
                       </p>
                       <p className="text-sm text-gray-400">
                           <strong>Ultimate:</strong> Fill your energy bar to 100% and press SPACE to unleash a devastating screen-clearing attack.
                       </p>
                   </div>
              </div>
          </div>
      )}

      {/* Game Over Screen */}
      {gameStatus === 'GAMEOVER' && (
        <div className="absolute inset-0 bg-black/90 flex flex-col items-center justify-center text-white z-30 animate-in fade-in duration-500">
             <Trophy className="w-16 h-16 text-yellow-400 mb-4" />
             <h2 className="text-5xl font-arcade text-yellow-400 mb-6 text-center px-4">{winnerMessage}</h2>
             
             <div className="max-w-md bg-gray-800 p-6 rounded-lg border-l-4 border-yellow-500 mb-8 min-h-[100px] flex items-center justify-center">
                {senseiWisdom === "Thinking..." ? (
                    <span className="animate-pulse text-gray-400 italic">The Sensei is meditating on the outcome...</span>
                ) : (
                    <p className="text-lg italic font-serif text-gray-200">"{senseiWisdom}"</p>
                )}
             </div>

             <div className="flex gap-4">
                 <button 
                    onClick={startGame}
                    className="flex items-center gap-2 bg-white hover:bg-gray-200 text-black font-bold py-3 px-6 rounded-full transition-transform hover:scale-105"
                >
                    <RefreshCw className="w-5 h-5" /> Rematch
                </button>
                
                <button 
                    onClick={goHome}
                    className="flex items-center gap-2 bg-gray-700 hover:bg-gray-600 text-white font-bold py-3 px-6 rounded-full transition-transform hover:scale-105"
                >
                    <Home className="w-5 h-5" /> Dojo (Home)
                </button>
             </div>
        </div>
      )}
    </div>
  );
};

export default FightingGame;
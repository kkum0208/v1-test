export type Direction = 1 | -1; // 1 = right, -1 = left

export type ActionState = 
  | 'IDLE' 
  | 'WALK' 
  | 'JUMP' 
  | 'CROUCH' 
  | 'BLOCK' 
  | 'ATTACK_LIGHT' 
  | 'ATTACK_HEAVY' 
  | 'COUNTER'
  | 'ULTIMATE'
  | 'HIT' 
  | 'DEAD'
  | 'WIN';

export interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface FighterStats {
  hp: number;
  maxHp: number;
  energy: number;
  maxEnergy: number;
  speed: number;
  jumpForce: number;
  damageLight: number;
  damageHeavy: number;
  defense: number; // 0-1, damage reduction
  name: string;
  style: 'Tai Chi' | 'Wing Chun';
  color: string;
}

export interface Fighter {
  id: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
  facing: Direction;
  state: ActionState;
  frameTimer: number; // For animation timing
  comboIndex: number; // 0, 1, 2 for 3-hit combo
  stats: FighterStats;
  hitbox?: Box; // Active damage area
  hurtbox: Box; // Body area
  cooldown: number;
  isAi: boolean;
}

export interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  color: string;
  size: number;
  shape: 'circle' | 'line' | 'ink' | 'star'; // Added 'star' for Wing Chun impacts
}

export interface HitEffect {
  id: number;
  x: number;
  y: number;
  life: number;
  type: 'impact' | 'block';
  style: 'Tai Chi' | 'Wing Chun'; // To determine visual style
}

export type Difficulty = 'Easy' | 'Medium' | 'Hard';

export interface GameState {
  p1: Fighter;
  p2: Fighter;
  particles: Particle[];
  hitEffects: HitEffect[];
  timer: number;
  gameOver: boolean;
  winner: number | null; // 1 or 2
  paused: boolean;
  shake: number; // Screen shake intensity
  difficulty: Difficulty;
}

export interface SenseiFeedback {
  text: string;
  loading: boolean;
}
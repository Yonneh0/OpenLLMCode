// ─── Pingu Automation Engine (Phase N) ──────────────
// UI grey-out overlay, animated avatar, drag-to-pause interaction with QEMU VMs.
// Per plan: "Grey out UI elements", "Start animated Pingu walking around", "User can drag Pingu back to corner"

import type { ArchitectureType } from '../qemu/types';

// ─── Control mode state ──────────────

export interface ControlModeState {
  active: boolean;
  actionCount: number; // How many actions Pingu has performed while in control mode
}

let _controlMode: ControlModeState = { active: false, actionCount: 0 };

// ─── Avatar position state ──────────────

export interface AvatarPosition {
  x: number;     // Position relative to viewport (pixels)
  y: number;
  isDragging: boolean;
}

let _avatarPos: AvatarPosition = { x: window.innerWidth - 120, y: window.innerHeight - 120, isDragging: false };
let _wasPausedOnEnter = false; // Track whether VMs were paused when avatar entered the corner zone
let _dragOffsetX = 0;
let _dragOffsetY = 0;

// ─── Animation state ──────────────

export interface AnimationState {
  phase: 'idle' | 'walking' | 'working' | 'returning' | 'paused';
  targetX?: number;
  targetY?: number;
  speed: number; // pixels per frame
}

let _animation: AnimationState = { phase: 'idle', speed: 2 };

// ─── Check if avatar is in the corner (drag-to-pause zone) ──────────────

function isInCorner(pos: AvatarPosition): boolean {
  const margin = 60; // pixels from edge to count as "corner"
  return pos.x < margin && pos.y < margin;
}

// ─── Get all running VMs via IPC ──────────────

async function getRunningVMs(): Promise<Array<{ id: string; architecture: ArchitectureType }>> {
  try {
    const result = await (window as any).openllmcode?.api?.qemuVmList?.();
    if (!result || !result.running) return [];
    
    // Get detailed info for each running VM
    const vms: Array<{ id: string; architecture: ArchitectureType }> = [];
    for (const vm of result.running) {
      try {
        const status = await (window as any).openllmcode?.api?.getVMStatus?.(vm.id);
        if (status && status.architecture) {
          vms.push({ id: vm.id, architecture: status.architecture });
        }
      } catch {} // Ignore individual VM status errors
    }
    return vms;
  } catch {
    console.warn('Failed to get running QEMU VMs');
    return [];
  }
}

// ─── Pause all running QEMU VMs when avatar is dragged to corner ──────────────

export async function pauseAllVMs(): Promise<boolean> {
  const vms = await getRunningVMs();
  
  if (vms.length === 0) return false;
  
  for (const vm of vms) {
    try {
      await (window as any).openllmcode?.api?.qemuVmPause?.(vm.id);
    } catch {
      console.warn(`Failed to pause VM ${vm.id}`);
    }
  }
  
  return true;
}

// ─── Resume all paused QEMU VMs when avatar is dragged away from corner ──────────────

export async function resumeAllVMs(): Promise<boolean> {
  const vms = await getRunningVMs();
  
  if (vms.length === 0) return false;
  
  for (const vm of vms) {
    try {
      await (window as any).openllmcode?.api?.qemuVmResume?.(vm.id);
    } catch {
      console.warn(`Failed to resume VM ${vm.id}`);
    }
  }
  
  return true;
}

// ─── Enter System AI Control Mode — grey out UI ──────────────

export function enterControlMode(): void {
  _controlMode.active = true;
  _controlMode.actionCount = 0;
  
  // Add the grey-out overlay to the DOM if not already present
  ensureOverlay();
}

// ─── Exit System AI Control Mode — restore UI ──────────────

export function exitControlMode(): void {
  _controlMode.active = false;
  _animation.phase = 'idle';
  
  // Remove the grey-out overlay
  removeOverlay();
}

// ─── Toggle Control Mode (on/off) ──────────────

function toggleControlMode(): boolean {
  if (_controlMode.active) {
    exitControlMode();
    return false;
  } else {
    enterControlMode();
    return true;
  }
}

// ─── Ensure the overlay element exists in the DOM ──────────────

function ensureOverlay(): void {
  let overlay = document.getElementById('openllmcode-pingu-overlay');
  
  if (!overlay) {
    // Create the overlay — semi-transparent grey-out layer over the app UI
    overlay = document.createElement('div');
    overlay.id = 'openllmcode-pingu-overlay';
    
    const style = document.createElement('style');
    style.textContent = `
      #openllmcode-pingu-overlay {
        position: fixed;
        top: 0; left: 0; right: 0; bottom: 0;
        background: rgba(30, 30, 46, 0.7); /* #1e1e2e with opacity — semi-transparent grey-out */
        z-index: 9998;
        pointer-events: none; /* Let clicks through to underlying UI */
      }
      
      .pingu-avatar {
        position: fixed;
        width: 60px;
        height: 60px;
        border-radius: 50%;
        background: linear-gradient(135deg, #89b4fa 0%, #cba6f7 100%);
        z-index: 9999;
        cursor: grab;
        display: flex;
        align-items: center;
        justify-content: center;
        font-size: 28px;
        user-select: none;
        transition: transform 0.3s ease, box-shadow 0.3s ease;
      }
      
      .pingu-avatar.dragging {
        cursor: grabbing;
        transform: scale(1.15);
        box-shadow: 0 4px 24px rgba(137, 180, 250, 0.6);
      }
      
      .pingu-avatar.in-corner {
        animation: pulse-corner 1s ease-in-out infinite;
      }
      
      @keyframes pulse-corner {
        0%, 100% { transform: scale(1); box-shadow: 0 0 0 rgba(220, 220, 170, 0.4); }
        50% { transform: scale(1.08); box-shadow: 0 0 16px rgba(220, 220, 170, 0.6); }
      }
      
      .pingu-avatar.working {
        animation: working-bounce 0.5s ease-in-out infinite;
      }
      
      @keyframes working-bounce {
        0%, 100% { transform: translateY(0) scale(1); }
        50% { transform: translateY(-4px) scale(1.02); }
      }
    `;
    
    document.head.appendChild(style);
    overlay.style.pointerEvents = 'none';
    document.body.appendChild(overlay);
    
    // Create the avatar element
    const avatarEl = document.createElement('div');
    avatarEl.className = 'pingu-avatar';
    avatarEl.id = 'openllmcode-pingu-avatar';
    avatarEl.textContent = '🐧';
    avatarEl.style.left = `${_avatarPos.x}px`;
    avatarEl.style.top = `${_avatarPos.y}px`;
    
    // Mouse events — drag-to-pause interaction
    let mouseDownX = 0;
    let mouseDownY = 0;
    let wasDragged = false;
    
    avatarEl.addEventListener('mousedown', (e) => {
      e.preventDefault();
      _avatarPos.isDragging = true;
      wasDragged = false;
      
      // Calculate offset from center of avatar to mouse position
      const rect = avatarEl.getBoundingClientRect();
      mouseDownX = e.clientX - rect.left - rect.width / 2;
      mouseDownY = e.clientY - rect.top - rect.height / 2;
      
      _dragOffsetX = e.clientX - _avatarPos.x;
      _dragOffsetY = e.clientY - _avatarPos.y;
      
      avatarEl.classList.add('dragging');
    });
    
    window.addEventListener('mousemove', (e) => {
      if (!_avatarPos.isDragging) return;
      
      wasDragged = true;
      
      // Update avatar position
      const newX = e.clientX - _dragOffsetX;
      const newY = e.clientY - _dragOffsetY;
      
      // Clamp to viewport bounds
      const clampedX = Math.max(0, Math.min(window.innerWidth - 60, newX));
      const clampedY = Math.max(0, Math.min(window.innerHeight - 60, newY));
      
      _avatarPos.x = clampedX;
      _avatarPos.y = clampedY;
      avatarEl.style.left = `${clampedX}px`;
      avatarEl.style.top = `${clampedY}px`;
      
      // Check if in corner — trigger pause-all-VMs
      const nowInCorner = isInCorner(_avatarPos);
      if (nowInCorner) {
        avatarEl.classList.add('in-corner');
        
        // Pause all VMs on first enter into corner zone
        if (!_wasPausedOnEnter) {
          _wasPausedOnEnter = true;
          pauseAllVMs().catch(() => {});
        }
      } else {
        avatarEl.classList.remove('in-corner');
        
        // Resume all VMs when leaving corner zone (only if previously paused by us)
        if (_wasPausedOnEnter) {
          _wasPausedOnEnter = false;
          resumeAllVMs().catch(() => {});
        }
      }
    });
    
    window.addEventListener('mouseup', () => {
      _avatarPos.isDragging = false;
      avatarEl.classList.remove('dragging');
      
      // If the mouse was NOT dragged, toggle control mode instead of dragging
      if (!wasDragged) {
        const wasInCorner = isInCorner(_avatarPos);
        
        if (wasInCorner) {
          exitControlMode();
          returnPinguToCorner();
        } else {
          enterControlMode();
        }
      }
    });
    
    // Touch events for mobile
    avatarEl.addEventListener('touchstart', (e) => {
      const touch = e.touches[0];
      _avatarPos.isDragging = true;
      wasDragged = false;
      _dragOffsetX = touch.clientX - _avatarPos.x;
      _dragOffsetY = touch.clientY - _avatarPos.y;
    });
    
    window.addEventListener('touchmove', (e) => {
      if (!_avatarPos.isDragging) return;
      const touch = e.touches[0];
      
      wasDragged = true;
      
      const newX = touch.clientX - _dragOffsetX;
      const newY = touch.clientY - _dragOffsetY;
      
      const clampedX = Math.max(0, Math.min(window.innerWidth - 60, newX));
      const clampedY = Math.max(0, Math.min(window.innerHeight - 60, newY));
      
      _avatarPos.x = clampedX;
      _avatarPos.y = clampedY;
      avatarEl.style.left = `${clampedX}px`;
      avatarEl.style.top = `${clampedY}px`;
    });
    
    window.addEventListener('touchend', () => {
      _avatarPos.isDragging = false;
      
      if (!wasDragged) {
        const wasInCorner = isInCorner(_avatarPos);
        
        if (wasInCorner) {
          exitControlMode();
          returnPinguToCorner();
        } else {
          enterControlMode();
        }
      }
    });
    
    document.body.appendChild(avatarEl);
  }
}

// ─── Remove the overlay and avatar from the DOM ──────────────

function removeOverlay(): void {
  const overlay = document.getElementById('openllmcode-pingu-overlay');
  if (overlay) overlay.remove();
  
  const avatar = document.getElementById('openllmcode-pingu-avatar');
  if (avatar) avatar.remove();
}

// ─── Return Pingu to the corner after control mode is exited ──────────────

function returnPinguToCorner(): void {
  const avatarEl = document.getElementById('openllmcode-pingu-avatar');
  if (!avatarEl) return;
  
  _animation.phase = 'returning';
  _avatarPos.x = window.innerWidth - 120; // Default: bottom-right corner
  _avatarPos.y = window.innerHeight - 120;
  avatarEl.style.left = `${_avatarPos.x}px`;
  avatarEl.style.top = `${_avatarPos.y}px`;
  
  setTimeout(() => {
    _animation.phase = 'idle';
  }, 500);
}

// ─── Start Pingu walking animation (when in control mode) ──────────────

function startWalkingAnimation(): void {
  if (_controlMode.active && !_avatarPos.isDragging) {
    _animation.phase = 'walking';
    
    // Set a random target position on the screen
    const margin = 100; // Keep away from edges
    _animation.targetX = margin + Math.random() * (window.innerWidth - margin * 2);
    _animation.targetY = margin + Math.random() * (window.innerHeight - margin * 2);
    
    // Update avatar position
    const avatarEl = document.getElementById('openllmcode-pingu-avatar');
    if (avatarEl && !_avatarPos.isDragging) {
      avatarEl.classList.add('working');
      
      setTimeout(() => {
        if (avatarEl) avatarEl.classList.remove('working');
      }, 1000);
    }
    
    // After reaching target, pick a new one
    const moveInterval = setInterval(() => {
      if (!_animation.targetX || !_animation.targetY) {
        clearInterval(moveInterval);
        return;
      }
      
      _avatarPos.x += Math.sign(_animation.targetX - _avatarPos.x) * _animation.speed;
      _avatarPos.y += Math.sign(_animation.targetY - _avatarPos.y) * _animation.speed;
      
      const avatarEl2 = document.getElementById('openllmcode-pingu-avatar');
      if (avatarEl2 && !_avatarPos.isDragging) {
        avatarEl2.style.left = `${_avatarPos.x}px`;
        avatarEl2.style.top = `${_avatarPos.y}px`;
        
        // Check if reached target
        const dx = _animation.targetX - _avatarPos.x;
        const dy = _animation.targetY - _avatarPos.y;
        if (Math.abs(dx) < 5 && Math.abs(dy) < 5) {
          clearInterval(moveInterval);
          startWalkingAnimation(); // Pick a new target
        }
      }
    }, 30);
  }
}

// ─── Perform an action — animate Pingu moving toward the target element ──────────────

export async function performAction(action: string, target?: HTMLElement): Promise<void> {
  if (!_controlMode.active) return;
  
  const avatarEl = document.getElementById('openllmcode-pingu-avatar');
  if (!avatarEl) return;
  
  // Animate Pingu to the target element
  _animation.phase = 'working';
  
  let targetX = _avatarPos.x + (Math.random() > 0.5 ? -1 : 1) * 300;
  let targetY = _avatarPos.y + (Math.random() > 0.5 ? -1 : 1) * 200;
  
  // Clamp to viewport bounds
  targetX = Math.max(0, Math.min(window.innerWidth - 60, targetX));
  targetY = Math.max(0, Math.min(window.innerHeight - 60, targetY));
  
  avatarEl.style.transition = 'left 1s ease-in-out, top 1s ease-in-out';
  avatarEl.style.left = `${targetX}px`;
  avatarEl.style.top = `${targetY}px`;
  avatarEl.classList.add('working');
  
  setTimeout(() => {
    avatarEl.classList.remove('working');
    avatarEl.style.transition = ''; // Remove transition for next movement
  }, 1000);
  
  _animation.phase = 'idle';
}

// ─── Highlight a target element — when Pingu is manipulating it ──────────────

export async function highlightTarget(target: Element): Promise<void> {
  if (!_controlMode.active) return;
  
  // Add a glow effect to the target element
  const originalBoxShadow = (target as HTMLElement).style.boxShadow || '';
  (target as HTMLElement).style.boxShadow = '0 0 20px rgba(137, 180, 250, 0.6)';
  
  setTimeout(() => {
    (target as HTMLElement).style.boxShadow = originalBoxShadow;
  }, 2000);
}

// ─── Get control mode state — used by UI components to check if Pingu is in charge ──────────────

export function getControlMode(): ControlModeState {
  return _controlMode;
}

export default {
  enterControlMode,
  exitControlMode,
  toggleControlMode,
  startWalkingAnimation,
  pauseAllVMs,
  resumeAllVMs,
  performAction,
  highlightTarget,
  getControlMode,
};
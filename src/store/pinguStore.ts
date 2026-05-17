// Pingu Store — Zustand store for System AI avatar state and animations (Phase G-2)
import { create } from 'zustand';

export type PinguMood = 'idle' | 'thinking' | 'speaking' | 'happy' | 'error' | 'working';

/** Types of panels that can be shown in the Pingu menu overlay (P1-B: Added 'about') */
export type PinguPanelType = 'skills' | 'settings' | 'models' | 'compile' | 'logs' | 'about' | null;

interface PinguState {
  // Current mood — drives all visual behavior
  mood: PinguMood;
  
  // Whether the avatar is visible and clickable (always on, but can be hidden in compact mode)
  isVisible: boolean;
  
  // Whether the menu panel is open when clicking Pingu
  isMenuOpen: boolean;
  
  // Which panel is currently active inside the Pingu overlay (null = no panel shown)
  activePanel: PinguPanelType;
  
  // Cursor position for eye-following animation (in component-relative coordinates, -1 to 1)
  mouseX: number;
  mouseY: number;
  
  // Current animation frame index (for mouth movement during speaking)
  mouthFrame: number;
  
  // Blink state — whether currently blinking
  isBlinking: boolean;
  
  // Animation speed multiplier for body bob
  bobSpeed: number;
  
  // ─── Phase 1-2: Home tile / Awakening states ──────────────
  
  // Whether Pingu has been awakened (model + llama.cpp both present)
  isAwake: boolean;
  
  // Whether Pingu has a GGUF model loaded
  hasGguf: boolean;
  
  // Whether Pingu has a compatible llama.cpp binary
  hasLlamaCpp: boolean;
  
  // Whether Pingu is "violently pinned" by user click (pauses all behavior)
  isPinned: boolean;
  
  // Position where Pingu was pinned (for dragging during pin state)
  pinnedPosition?: { x: number; y: number };
  
  // Current animation phase for awakening sequence
  awakeningPhase: 'none' | 'shake' | 'stretch' | 'glow';
  
  // Whether Pingu is currently loading a GGUF model (shows progress)
  isLoadingModel: boolean;
  
  // Progress percentage of model download/loading
  loadProgress: number;
  
  // ─── Actions — mood transitions ──────────────
  setMood: (mood: PinguMood) => void;
  resetMood: () => void;
  
  // ─── Actions — menu toggle ──────────────
  toggleMenu: () => void;
  closeMenu: () => void;
  
  // ─── Actions — panel management ──────────────
  openPanel: (panel: PinguPanelType) => void;
  togglePanel: (panel: PinguPanelType) => void;
  closePanel: () => void;
  
  // ─── Actions — visibility control ──────────────
  showPingu: () => void;
  hidePingu: () => void;
  
  // ─── Actions — cursor tracking (used by PinguAvatar component) ──────────────
  setCursorPos: (x: number, y: number) => void;
  
  // ─── Actions — animation frame updates (used by requestAnimationFrame loop in PinguAvatar) ──────────────
  advanceMouthFrame: () => void;
  triggerBlink: () => void;
  updateBobSpeed: (speedMultiplier: number) => void;
  
  // ─── Phase 1-2 actions: awakening ──────────────
  setAwake: (awake: boolean) => void;
  setHasGguf: (hasGguf: boolean) => void;
  setHasLlamaCpp: (hasLlamaCpp: boolean) => void;
  
  // Pin Pingu by clicking (violently pins in place, opens chat dialog)
  pinAndOpenChat: () => void;
  unpinPingu: () => void;
  
  // Start awakening sequence when both model and llama.cpp present
  startAwakeningSequence: () => void;
  
  // Progress update for model loading
  setLoadProgress: (progress: number) => void;
}

export const usePinguStore = create<PinguState>((set, get) => ({
  mood: 'idle',
  isVisible: true,
  isMenuOpen: false,
  activePanel: null as PinguPanelType,
  mouseX: 0,
  mouseY: 0,
  mouthFrame: 0,
  isBlinking: false,
  bobSpeed: 1,
  
  // Phase 1-2 defaults — Pingu starts "asleep" until model + llama.cpp are ready
  isAwake: false,
  hasGguf: false,
  hasLlamaCpp: false,
  isPinned: false,
  awakeningPhase: 'none',
  isLoadingModel: false,
  loadProgress: 0,
  
  setMood: (mood) => {
    // When transitioning to 'speaking', reset mouth frame so animation starts fresh
    if (mood === 'speaking') {
      set({ mood, mouthFrame: 0 });
    } else {
      set({ mood });
    }
  },
  
  resetMood: () => {
    // When a task completes — transition to happy briefly then back to idle
    const currentMood = get().mood;
    if (currentMood !== 'happy') {
      set({ mood: 'happy' });
      setTimeout(() => set({ mood: 'idle' }), 2000); // Happy for 2 seconds, then back to idle
    } else {
      set({ mood: 'idle' });
    }
  },
  
  toggleMenu: () => {
    const isOpen = get().isMenuOpen;
    if (isOpen) {
      set({ isMenuOpen: false });
    } else {
      set({ isMenuOpen: true, mouseX: 0.5, mouseY: -1 }); // Position menu above Pingu
    }
  },
  
   closeMenu: () => {
     set({ isMenuOpen: false, activePanel: null });
   },
   
   // Panel management actions
   openPanel: (panel) => {
     set({ activePanel: panel, isMenuOpen: true });
   },
   
   togglePanel: (panel) => {
     const current = get().activePanel;
     if (current === panel) {
       set({ activePanel: null });
     } else {
       set({ activePanel: panel, isMenuOpen: true });
     }
   },
   
   closePanel: () => {
     set({ activePanel: null });
   },
  
  showPingu: () => set({ isVisible: true }),
  hidePingu: () => {
    set({ isVisible: false, isMenuOpen: false });
  },
  
  setCursorPos: (x: number, y: number) => {
    // Clamp to -1..1 range for eye animation
    const clampedX = Math.max(-1, Math.min(1, x));
    const clampedY = Math.max(-1, Math.min(1, y));
    set({ mouseX: clampedX, mouseY: clampedY });
  },
  
  advanceMouthFrame: () => {
    // Mouth animation during speaking — cycles through frames at ~8Hz (50ms per frame)
    const current = get().mouthFrame;
    set({ mouthFrame: (current + 1) % 6 });
  },
  
  triggerBlink: () => {
    if (!get().isBlinking) {
      // Blink for ~200ms then reopen eyes
      set({ isBlinking: true });
      setTimeout(() => set({ isBlinking: false }), 200);
    }
  },
  
  updateBobSpeed: (speedMultiplier) => {
    set({ bobSpeed: Math.max(0.5, Math.min(3, speedMultiplier)) });
  },
  
  // Phase 1-2: Awakening actions
  
  setAwake: (awake) => {
    if (!get().isAwake && awake) {
      // Transitioning to awake — start awakening sequence
      get().startAwakeningSequence();
    }
    set({ isAwake: awake });
  },
  
  setHasGguf: (hasGguf) => {
    set({ hasGguf, isLoadingModel: false, loadProgress: 0 });
    // If also has llama.cpp and not already awake — auto-awaken!
    if (hasGguf && get().hasLlamaCpp && !get().isAwake) {
      setTimeout(() => set({ isAwake: true }), 500);
    }
  },
  
  setHasLlamaCpp: (hasLlamaCpp) => {
    set({ hasLlamaCpp });
    // If also has GGUF and not already awake — auto-awaken!
    if (hasLlamaCpp && get().hasGguf && !get().isAwake) {
      setTimeout(() => set({ isAwake: true }), 500);
    }
  },
  
  pinAndOpenChat: () => {
    const pos = get().pinnedPosition || { x: 0, y: 0 };
    set({ isPinned: true, pinnedPosition: pos });
    // TODO: Open chat dialog — handled by App.tsx via store state change
    window.dispatchEvent(new CustomEvent('pingu-chat-open'));
  },
  
  unpinPingu: () => {
    set({ isPinned: false });
    window.dispatchEvent(new CustomEvent('pingu-chat-close'));
  },
  
  startAwakeningSequence: () => {
    // Phase 1: Shake for 0.5s, Phase 2: Stretch for 2s, Phase 3: Eyes glow
    set({ awakeningPhase: 'shake' });
    
    setTimeout(() => {
      if (!get().isAwake) return; // User may have toggled off during sequence
      set({ awakeningPhase: 'stretch' });
      
      setTimeout(() => {
        if (!get().isAwake) return;
        set({ awakeningPhase: 'glow' });
        
        setTimeout(() => {
          if (!get().isAwake) return;
          // Sequence complete — trigger first interaction
          window.dispatchEvent(new CustomEvent('pingu-awakened'));
        }, 2000);
      }, 2000);
    }, 500);
  },
  
  setLoadProgress: (progress) => {
    set({ loadProgress: Math.max(0, Math.min(100, progress)), isLoadingModel: true });
  },
}));

// ─── Convenience functions for mood transitions from other stores ──────────────

/** Called when the agent starts generating a response */
export function startSpeaking(): void {
  usePinguStore.getState().setMood('speaking');
  
  // Start mouth animation loop — run at ~8Hz during speaking
  let frameInterval: ReturnType<typeof setInterval>;
  const startAnimation = () => {
    frameInterval = setInterval(() => {
      usePinguStore.getState().advanceMouthFrame();
      // Also update bob speed while speaking (faster body bob)
      usePinguStore.getState().updateBobSpeed(2);
    }, 125); // ~8Hz
  };
  
  startAnimation();
  
  // Stop animation when mood changes away from 'speaking'
  const stopCheck = setInterval(() => {
    if (usePinguStore.getState().mood !== 'speaking') {
      clearInterval(frameInterval);
      usePinguStore.getState().updateBobSpeed(1);
      clearInterval(stopCheck);
    }
  }, 500);
}

/** Called when the agent is thinking but hasn't started speaking yet */
export function startThinking(): void {
  usePinguStore.getState().setMood('thinking');
}

/** Called when a task completes successfully */
export function completeTask(): void {
  // Happy for 2 seconds, then back to idle (handled by resetMood)
  usePinguStore.getState().resetMood();
  
  // Play "Noot noot!" sound effect if enabled — handled by PinguAvatar component
  try {
    const audio = new Audio('data:audio/wav;base64,UklGRnoGAABXQVZFZm10IBAAAAABAAEAQB8AAIA+AAACABAAZGF0YQoGAAD/f39/+fj4/3l5eHd3dnV1dXRzc3JxcXFwcHBvb29vbm1tbGxra2pqaGhoaGdnZmZlZWVkZGRkY2NiYmFhYGBfX15eXFxYWFlYWFhWVlVUVEpLSkpKSkpKSUpKTExLTExLS0tLSEtLS0tLS0tLbCwsLCwsLCwMDAwLy8vLi4uLCwsKCgoJycmJiYmJiUlJSQkIyMjIyMjIyMiIiEhISAgHx8fHx8fHx8fHx4eHR0dHRwdHR0cHBvb29vbm1tbGxra2lpaWlsbCwsLCwqKioqKikpKSgoJycnJiYmJiYmJSUlJCQjIyMjIyMjIyIhISEgIB8fHx8fHx8eHh0dHRwcHBwcHBsbGxsbGRkZGRkZGRcXFxcXFRUVFRUVFBUVFBQUExMTExMTExMTExISEREQEA8PDw8PDw8PFhYWFhQUGRkZGRkZFhcXFxcVFhUWFRUVFBQUFBMTExMTExMTExISEhISEhMSEhISEhISEhISEhMTEhISEhISEhISEhMTEhISEhISEhISEhI=');
    audio.volume = 0.3;
    audio.play().catch(() => {}); // Silently ignore if autoplay blocked
  } catch {
    // Audio not available — skip
  }
}

/** Called when an error occurs during task execution */
export function handleTaskError(): void {
  usePinguStore.getState().setMood('error');
  
  // Stay in error mood for ~5 seconds, then back to idle
  setTimeout(() => usePinguStore.getState().resetMood(), 5000);
}

/** Called when the agent is executing a plan step (working state) */
export function startWorking(): void {
  usePinguStore.getState().setMood('working');
  
  // Update bob speed for working state (faster than idle but slower than speaking)
  usePinguStore.getState().updateBobSpeed(1.5);
  
  // Transition back to idle after task completes — checked periodically by PinguAvatar
}

/** Called when the agent is idle and waiting */
export function idle(): void {
  const currentMood = usePinguStore.getState().mood;
  if (currentMood === 'working' || currentMood === 'thinking') {
    // Don't immediately transition — let natural transitions happen based on agent state
    return;
  }
  
  usePinguStore.getState().setMood('idle');
}

// ─── Periodic blink timer ──────────────
let blinkInterval: ReturnType<typeof setInterval> | null = null;

/** Start the periodic blink timer — call once during app initialization */
export function startBlinkTimer(): void {
  // Random interval between blinks — anywhere from 2 to 5 seconds
  const scheduleNextBlink = () => {
    const nextBlinkIn = Math.random() * (3000 - 1500) + 1500; // 1.5s to 3s after last blink
    
    blinkInterval = setTimeout(() => {
      usePinguStore.getState().triggerBlink();
      scheduleNextBlink();
    }, nextBlinkIn);
  };
  
  scheduleNextBlink();
}

/** Stop the periodic blink timer — call on app shutdown */
export function stopBlinkTimer(): void {
  if (blinkInterval) {
    clearTimeout(blinkInterval);
    blinkInterval = null;
  }
}

// ─── Convenience function for panel toggling from other components ──────────────

/** Called when a Pingu menu item is clicked to toggle the appropriate overlay */
export function togglePanel(panel: PinguPanelType): void {
  usePinguStore.getState().togglePanel(panel);
}
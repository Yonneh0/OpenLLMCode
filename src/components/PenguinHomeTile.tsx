// Penguin Home Tile — Pingu's home base in the bottom-left corner of the UI (Phase 1)

import React, { useEffect, useRef, useCallback } from 'react';
import { usePinguStore } from '../store/pinguStore';

// Sleeping mat SVG — woven texture with a slight depression in the center
const SLEEPING_MAT_SVG = `data:image/svg+xml,${encodeURIComponent(`<svg width="96" height="48" viewBox="0 0 96 48" xmlns="http://www.w3.org/2000/svg">
<rect x="2" y="2" width="92" height="44" rx="8" ry="6" fill="#5B7C6A" stroke="#3D5A4A" stroke-width="1"/>
<line x1="0" y1="12" x2="96" y2="12" stroke="#4E6B5B" stroke-width="1.5" opacity="0.5"/>
<line x1="0" y1="24" x2="96" y2="24" stroke="#4E6B5B" stroke-width="1.5" opacity="0.5"/>
<line x1="0" y1="36" x2="96" y2="36" stroke="#4E6B5B" stroke-width="1.5" opacity="0.5"/>
<line x1="16" y1="0" x2="16" y2="48" stroke="#4E6B5B" stroke-width="1.5" opacity="0.3"/>
<line x1="32" y1="0" x2="32" y2="48" stroke="#4E6B5B" stroke-width="1.5" opacity="0.3"/>
<line x1="48" y1="0" x2="48" y2="48" stroke="#4E6B5B" stroke-width="1.5" opacity="0.3"/>
<line x1="64" y1="0" x2="64" y2="48" stroke="#4E6B5B" stroke-width="1.5" opacity="0.3"/>
<line x1="80" y1="0" x2="80" y2="48" stroke="#4E6B5B" stroke-width="1.5" opacity="0.3"/>
<ellipse cx="48" cy="26" rx="30" ry="10" fill="#4A6354" opacity="0.4"/>

</svg>`)}`;



// Water sink SVG — simple fountain with animated water drops
const SINK_SVG = `data:image/svg+xml,${encodeURIComponent(`
<svg width="28" height="40" viewBox="0 0 28 40" xmlns="http://www.w3.org/2000/svg">
  <!-- Basin -->
  <ellipse cx="14" cy="36" rx="12" ry="4" fill="#7A9B8E" stroke="#5C7A6C" stroke-width="1"/>
  <ellipse cx="14" cy="34" rx="10" ry="3" fill="#6B8D80" opacity="0.6"/>
  <!-- Water in basin -->
  <ellipse cx="14" cy="35" rx="9" ry="2.5" fill="#4A8FBF" opacity="0.4">
    <animate attributeName="opacity" values="0.4;0.6;0.4" dur="3s" repeatCount="indefinite"/>
  </ellipse>
  <!-- Faucet -->
  <rect x="12" y="8" width="4" height="14" rx="1" fill="#9CA5A0"/>
  <circle cx="14" cy="6" r="3" fill="#B0B8B3"/>
</svg>`)}`;


// Small puddle for when Pingu spills water
const PUDDLE_SVG = `data:image/svg+xml,${encodeURIComponent(`
<svg width="20" height="12" viewBox="0 0 20 12" xmlns="http://www.w3.org/2000/svg">
  <ellipse cx="10" cy="6" rx="9" ry="5" fill="#4A8FBF" opacity="0.3">
    <animate attributeName="opacity" values="0.3;0.15;0.3" dur="4s" repeatCount="indefinite"/>
  </ellipse>
</svg>
`)}`;

// ─── Pingu Animation SVGs (claymation style) ──────────────

const IDLE_SVG = `data:image/svg+xml,${encodeURIComponent(`
<svg width="48" height="56" viewBox="0 0 48 56" xmlns="http://www.w3.org/2000/svg">
  <ellipse cx="24" cy="48" rx="18" ry="8" fill="#F9E2AF"/>
  <circle cx="24" cy="36" r="16" fill="#8B5E3C"/>
  <circle cx="18" cy="28" r="5" fill="#5C2716"/>
  <circle cx="30" cy="28" r="5" fill="#5C2716"/>
  <circle cx="19.5" cy="26.5" r="1.5" fill="white"/>
  <circle cx="31.5" cy="26.5" r="1.5" fill="white"/>
  <ellipse cx="24" cy="33" rx="3" ry="2" fill="#D97B3A"/>
  <ellipse cx="24" cy="40" rx="10" ry="6" fill="#F9E2AF"/>
  <ellipse cx="16" cy="54" rx="6" ry="3" fill="#D97B3A"/>
  <ellipse cx="32" cy="54" rx="6" ry="3" fill="#D97B3A"/>
</svg>
`)}`;

const SCRATCH_SVG = `data:image/svg+xml,${encodeURIComponent(`
<svg width="48" height="56" viewBox="0 0 48 56" xmlns="http://www.w3.org/2000/svg">
  <ellipse cx="24" cy="48" rx="18" ry="8" fill="#F9E2AF"/>
  <circle cx="24" cy="36" r="16" fill="#8B5E3C"/>
  <path d="M13 27 Q18 24 23 27" stroke="#5C2716" stroke-width="2.5" fill="none"/>
  <path d="M25 27 Q30 24 35 27" stroke="#5C2716" stroke-width="2.5" fill="none"/>
  <ellipse cx="24" cy="33" rx="3" ry="2" fill="#D97B3A"/>
  <ellipse cx="24" cy="40" rx="10" ry="6" fill="#F9E2AF"/>
  <path d="M38 35 L42 28 L40 26" stroke="#8B5E3C" stroke-width="4" stroke-linecap="round" fill="none">
    <animate attributeName="d" values="M38 35 L42 28 L40 26; M38 35 L43 27 L41 25; M38 35 L42 28 L40 26" dur="0.3s" repeatCount="indefinite"/>
  </path>
  <line x1="36" y1="30" x2="39" y2="33" stroke="#F9E2AF" stroke-width="1" opacity="0.5">
    <animate attributeName="opacity" values="0.5;0;0.5" dur="0.3s" repeatCount="indefinite"/>
  </line>
  <ellipse cx="16" cy="54" rx="6" ry="3" fill="#D97B3A"/>
  <ellipse cx="32" cy="54" rx="6" ry="3" fill="#D97B3A"/>
</svg>
`)}`;

const STRETCH_SVG = `data:image/svg+xml,${encodeURIComponent(`
<svg width="48" height="56" viewBox="0 0 48 56" xmlns="http://www.w3.org/2000/svg">
  <ellipse cx="24" cy="52" rx="16" ry="6" fill="#F9E2AF"/>
  <circle cx="24" cy="38" r="17" fill="#8B5E3C"/>
  <path d="M16 30 Q20 34 24 30" stroke="#5C2716" stroke-width="2.5" fill="none"/>
  <path d="M24 30 Q28 34 32 30" stroke="#5C2716" stroke-width="2.5" fill="none"/>
  <ellipse cx="24" cy="34" rx="3" ry="2" fill="#D97B3A"/>
  <ellipse cx="24" cy="46" rx="8" ry="5" fill="#F9E2AF"/>
  <path d="M10 30 L6 20" stroke="#8B5E3C" stroke-width="4" stroke-linecap="round" fill="none">
    <animate attributeName="d" values="M10 30 L6 20; M9 30 L5 19; M10 30 L6 20" dur="2s" repeatCount="indefinite"/>
  </path>
  <path d="M38 30 L42 20" stroke="#8B5E3C" stroke-width="4" stroke-linecap="round" fill="none">
    <animate attributeName="d" values="M38 30 L42 20; M39 30 L43 19; M38 30 L42 20" dur="2s" repeatCount="indefinite"/>
  </path>
  <ellipse cx="16" cy="57" rx="6" ry="3" fill="#D97B3A"/>
  <ellipse cx="32" cy="57" rx="6" ry="3" fill="#D97B3A"/>
</svg>
`)}`;

const YAWN_SVG = `data:image/svg+xml,${encodeURIComponent(`
<svg width="48" height="56" viewBox="0 0 48 56" xmlns="http://www.w3.org/2000/svg">
  <ellipse cx="24" cy="48" rx="19" ry="7" fill="#F9E2AF"/>
  <circle cx="24" cy="36" r="16.5" fill="#8B5E3C"/>
  <path d="M14 28 Q19 27 24 28" stroke="#5C2716" stroke-width="2.5" fill="none"/>
  <path d="M24 28 Q29 27 34 28" stroke="#5C2716" stroke-width="2.5" fill="none"/>
  <ellipse cx="24" cy="34" rx="4" ry="3" fill="#D97B3A">
    <animate attributeName="ry" values="3;5;3" dur="1.5s" repeatCount="indefinite"/>
  </ellipse>
  <ellipse cx="24" cy="40" rx="10" ry="6" fill="#F9E2AF"/>
  <text x="38" y="26" font-size="8" fill="#5C7A6C" opacity="0.6">z</text>
  <text x="41" y="22" font-size="10" fill="#5C7A6C" opacity="0.4">z</text>
  <ellipse cx="16" cy="54" rx="6" ry="3" fill="#D97B3A"/>
  <ellipse cx="32" cy="54" rx="6" ry="3" fill="#D97B3A"/>
</svg>
`)}`;

const SLEEPING_SVG = `data:image/svg+xml,${encodeURIComponent(`
<svg width="48" height="56" viewBox="0 0 48 56" xmlns="http://www.w3.org/2000/svg">
  <ellipse cx="24" cy="50" rx="17" ry="6" fill="#F9E2AF"/>
  <circle cx="24" cy="38" r="15.5" fill="#8B5E3C"/>
  <path d="M14 30 Q19 28 24 30" stroke="#5C2716" stroke-width="2" fill="none"/>
  <path d="M24 30 Q29 28 34 30" stroke="#5C2716" stroke-width="2" fill="none"/>
  <path d="M20 34 Q24 36 28 34" stroke="#D97B3A" stroke-width="1.5" fill="none"/>
  <ellipse cx="24" cy="44" rx="8" ry="4" fill="#F9E2AF"/>
  <text x="36" y="24" font-size="10" fill="#5C7A6C" opacity="0.7">Z</text>
  <text x="41" y="18" font-size="13" fill="#5C7A6C" opacity="0.5">z</text>
  <ellipse cx="24" cy="42" rx="9" ry="5" fill="#F9E2AF">
    <animate attributeName="rx" values="9;10;9" dur="3s" repeatCount="indefinite"/>
    <animate attributeName="ry" values="5;6;5" dur="3s" repeatCount="indefinite"/>
  </ellipse>
  <ellipse cx="20" cy="54" rx="5" ry="2.5" fill="#D97B3A"/>
</svg>
`)}`;

const WAKING_SVG = `data:image/svg+xml,${encodeURIComponent(`
<svg width="48" height="56" viewBox="0 0 48 56" xmlns="http://www.w3.org/2000/svg">
  <ellipse cx="24" cy="46" rx="17" ry="7" fill="#F9E2AF"/>
  <circle cx="24" cy="35" r="16.5" fill="#8B5E3C">
    <animate attributeName="cy" values="35;33;35" dur="0.8s" repeatCount="indefinite"/>
  </circle>
  <circle cx="17" cy="28" r="6" fill="#F9E2AF" stroke="#5C2716" stroke-width="2"/>
  <circle cx="31" cy="28" r="6" fill="#F9E2AF" stroke="#5C2716" stroke-width="2"/>
  <circle cx="18.5" cy="27" r="2.5" fill="#5C2716"/>
  <circle cx="32.5" cy="27" r="2.5" fill="#5C2716"/>
  <circle cx="19" cy="26.5" r="0.8" fill="white"/>
  <circle cx="33" cy="26.5" r="0.8" fill="white"/>
  <ellipse cx="24" cy="33" rx="4" ry="2.5" fill="#D97B3A">
    <animate attributeName="ry" values="2;3;2" dur="0.8s" repeatCount="indefinite"/>
  </ellipse>
  <ellipse cx="24" cy="39" rx="10" ry="5.5" fill="#F9E2AF">
    <animate attributeName="cy" values="39;38;39" dur="0.8s" repeatCount="indefinite"/>
  </ellipse>
  <text x="36" y="24" font-size="8" fill="#D97B3A">?</text>
  <ellipse cx="15" cy="53" rx="6" ry="3" fill="#D97B3A">
    <animate attributeName="cx" values="15;14;15;16;15" dur="0.8s" repeatCount="indefinite"/>
  </ellipse>
  <ellipse cx="33" cy="53" rx="6" ry="3" fill="#D97B3A">
    <animate attributeName="cx" values="33;34;33;32;33" dur="0.8s" repeatCount="indefinite"/>
  </ellipse>
</svg>
`)}`;

const POUNCE_SVG = `data:image/svg+xml,${encodeURIComponent(`
<svg width="48" height="56" viewBox="0 0 48 56" xmlns="http://www.w3.org/2000/svg">
  <ellipse cx="24" cy="52" rx="17" ry="5" fill="#F9E2AF"/>
  <circle cx="24" cy="36" r="15.5" fill="#8B5E3C">
    <animate attributeName="cy" values="36;34;36" dur="0.6s" repeatCount="indefinite"/>
  </circle>
  <path d="M15 29 Q19 33 23 29" stroke="#5C2716" stroke-width="2.5" fill="none"/>
  <path d="M25 29 Q29 33 33 29" stroke="#5C2716" stroke-width="2.5" fill="none"/>
  <ellipse cx="24" cy="33" rx="3" ry="2.5" fill="#D97B3A"/>
  <ellipse cx="24" cy="40" rx="10" ry="5" fill="#F9E2AF">
    <animate attributeName="cy" values="40;39;40" dur="0.6s" repeatCount="indefinite"/>
  </ellipse>
  <path d="M10 35 L2 32" stroke="#8B5E3C" stroke-width="4" stroke-linecap="round" fill="none">
    <animate attributeName="d" values="M10 35 L2 32; M9 35 L0 30; M10 35 L2 32" dur="0.6s" repeatCount="indefinite"/>
  </path>
  <path d="M38 35 L46 32" stroke="#8B5E3C" stroke-width="4" stroke-linecap="round" fill="none">
    <animate attributeName="d" values="M38 35 L46 32; M39 35 L48 30; M38 35 L46 32" dur="0.6s" repeatCount="indefinite"/>
  </path>
  <line x1="16" y1="48" x2="10" y2="54" stroke="#F9E2AF" stroke-width="1.5" opacity="0.7">
    <animate attributeName="x2" values="10;8;10" dur="0.6s" repeatCount="indefinite"/>
  </line>
  <ellipse cx="16" cy="54" rx="6" ry="3" fill="#D97B3A">
    <animate attributeName="cy" values="54;52;54" dur="0.6s" repeatCount="indefinite"/>
  </ellipse>
  <ellipse cx="32" cy="54" rx="6" ry="3" fill="#D97B3A">
    <animate attributeName="cy" values="54;52;54" dur="0.6s" repeatCount="indefinite"/>
  </ellipse>
</svg>
`)}`;

const DRINKING_SVG = `data:image/svg+xml,${encodeURIComponent(`
<svg width="48" height="56" viewBox="0 0 48 56" xmlns="http://www.w3.org/2000/svg">
  <ellipse cx="28" cy="50" rx="17" ry="6.5" fill="#F9E2AF"/>
  <circle cx="28" cy="36" r="16" fill="#8B5E3C"/>
  <path d="M21 28 Q25 27 29 28" stroke="#5C2716" stroke-width="2.5" fill="none"/>
  <path d="M29 28 Q33 27 37 28" stroke="#5C2716" stroke-width="2.5" fill="none"/>
  <ellipse cx="28" cy="34" rx="3" ry="2" fill="#D97B3A">
    <animate attributeName="cy" values="34;36;34" dur="1.5s" repeatCount="indefinite"/>
  </ellipse>
  <ellipse cx="28" cy="40" rx="9" ry="5.5" fill="#F9E2AF"/>
  <path d="M14 36 L8 30 L7 28" stroke="#8B5E3C" stroke-width="4" stroke-linecap="round" fill="none">
    <animate attributeName="d" values="M14 36 L8 30 L7 28; M14 36 L7 29 L6 27; M14 36 L8 30 L7 28" dur="1.5s" repeatCount="indefinite"/>
  </path>
  <circle cx="28" cy="38" r="1" fill="#4A8FBF" opacity="0.6">
    <animate attributeName="cy" values="38;42;38" dur="1.5s" repeatCount="indefinite"/>
    <animate attributeName="opacity" values="0.6;0;0.6" dur="1.5s" repeatCount="indefinite"/>
  </circle>
  <ellipse cx="20" cy="54" rx="6" ry="3" fill="#D97B3A"/>
  <ellipse cx="36" cy="54" rx="6" ry="3" fill="#D97B3A"/>
</svg>
`)}`;

const CHECK_WATCH_SVG = `data:image/svg+xml,${encodeURIComponent(`
<svg width="48" height="56" viewBox="0 0 48 56" xmlns="http://www.w3.org/2000/svg">
  <ellipse cx="24" cy="48" rx="17" ry="6.5" fill="#F9E2AF"/>
  <circle cx="24" cy="36" r="16" fill="#8B5E3C"/>
  <path d="M15 29 Q19 27.5 23 29" stroke="#5C2716" stroke-width="2" fill="none"/>
  <path d="M25 29 Q29 27.5 33 29" stroke="#5C2716" stroke-width="2" fill="none"/>
  <ellipse cx="24" cy="34" rx="3" ry="2" fill="#D97B3A"/>
  <ellipse cx="24" cy="40" rx="10" ry="5.5" fill="#F9E2AF"/>
  <path d="M12 36 L6 38 L5 37" stroke="#8B5E3C" stroke-width="4" stroke-linecap="round" fill="none">
    <animate attributeName="d" values="M12 36 L6 38 L5 37; M12 36 L5 39 L4 38; M12 36 L6 38 L5 37" dur="2s" repeatCount="indefinite"/>
  </path>
  <circle cx="5" cy="36" r="3" fill="#B0A090" stroke="#8B7060" stroke-width="1">
    <animate attributeName="r" values="3;3.2;3" dur="2s" repeatCount="indefinite"/>
  </circle>
  <line x1="5" y1="36" x2="4.5" y2="34" stroke="#8B7060" stroke-width="0.5">
    <animate attributeName="x2" values="4.5;5.5;4.5" dur="2s" repeatCount="indefinite"/>
  </line>
  <ellipse cx="16" cy="53" rx="6" ry="3" fill="#D97B3A"/>
  <ellipse cx="32" cy="53" rx="6" ry="3" fill="#D97B3A"/>
</svg>
`)}`;

// ─── No-Model Pingu SVG (dangling - lifeless) ──────────────

const NOMODEL_SVG = `data:image/svg+xml,${encodeURIComponent(`
<svg width="48" height="60" viewBox="0 0 48 60" xmlns="http://www.w3.org/2000/svg">
  <!-- Limp body hanging -->
  <ellipse cx="24" cy="56" rx="14" ry="4.5" fill="#F9E2AF"/>
  <circle cx="24" cy="36" r="16.5" fill="#8B5E3C">
    <animate attributeName="cy" values="36;38;36" dur="5s" repeatCount="indefinite"/>
    <animate attributeName="r" values="16.5;16;16.5" dur="5s" repeatCount="indefinite"/>
  </circle>
  
  <!-- Closed eyes (lifeless) -->
  <path d="M13 28 Q18 27 23 28" stroke="#5C2716" stroke-width="2" fill="none"/>
  <path d="M23 28 Q28 27 33 28" stroke="#5C2716" stroke-width="2" fill="none"/>
  
  <!-- Slight droop -->
  <ellipse cx="24" cy="33" rx="3.5" ry="2.5" fill="#D97B3A">
    <animate attributeName="cy" values="33;35;33" dur="5s" repeatCount="indefinite"/>
  </ellipse>
  
  <!-- Limp belly patch -->
  <ellipse cx="24" cy="42" rx="10" ry="5.5" fill="#F9E2AF">
    <animate attributeName="cy" values="42;44;42" dur="5s" repeatCount="indefinite"/>
  </ellipse>
  
  <!-- Limp feet -->
  <ellipse cx="18" cy="53" rx="5" ry="2.5" fill="#D97B3A">
    <animate attributeName="cx" values="18;20;18" dur="5s" repeatCount="indefinite"/>
  </ellipse>
  <ellipse cx="30" cy="53" rx="5" ry="2.5" fill="#D97B3A">
    <animate attributeName="cx" values="30;28;30" dur="5s" repeatCount="indefinite"/>
  </ellipse>
</svg>
`)}`;

// ─── Pinned Pingu SVG (violently pinned by user) ──────────────

const PINNED_SVG = `data:image/svg+xml,${encodeURIComponent(`
<svg width="48" height="56" viewBox="0 0 48 56" xmlns="http://www.w3.org/2000/svg">
  <!-- Body — slightly squished -->
  <ellipse cx="24" cy="48" rx="17" ry="7.5" fill="#F9E2AF"/>
  <circle cx="24" cy="36" r="16" fill="#8B5E3C"/>
  
  <!-- Eyes — wide, staring at user -->
  <circle cx="17" cy="28" r="5.5" fill="#F9E2AF" stroke="#5C2716" stroke-width="2"/>
  <circle cx="31" cy="28" r="5.5" fill="#F9E2AF" stroke="#5C2716" stroke-width="2"/>
  <circle cx="18.5" cy="27" r="2.5" fill="#5C2716"/>
  <circle cx="32.5" cy="27" r="2.5" fill="#5C2716"/>
  
  <!-- Beak — slightly open (surprised) -->
  <ellipse cx="24" cy="33" rx="3.5" ry="2.5" fill="#D97B3A">
    <animate attributeName="ry" values="2;3;2" dur="1s" repeatCount="indefinite"/>
  </ellipse>
  
  <!-- Belly patch -->
  <ellipse cx="24" cy="40" rx="10" ry="6" fill="#F9E2AF"/>
  
  <!-- Feet — slightly spread apart (startled) -->
  <ellipse cx="15" cy="54" rx="6" ry="3" fill="#D97B3A">
    <animate attributeName="cx" values="15;14;15;16;15" dur="0.8s" repeatCount="indefinite"/>
  </ellipse>
  <ellipse cx="33" cy="54" rx="6" ry="3" fill="#D97B3A">
    <animate attributeName="cx" values="33;34;33;32;33" dur="0.8s" repeatCount="indefinite"/>
  </ellipse>
</svg>
`)}`;

// ─── Pingu Awakening Sequence SVGs (Phase 4) ──────────────

const AWAKENING1_SVG = `data:image/svg+xml,${encodeURIComponent(`
<svg width="48" height="56" viewBox="0 0 48 56" xmlns="http://www.w3.org/2000/svg">
  <!-- Shaking body -->
  <ellipse cx="24" cy="48" rx="17" ry="6" fill="#F9E2AF">
    <animate attributeName="cx" values="24;22;26;24" dur="0.5s" repeatCount="indefinite"/>
  </ellipse>
  <circle cx="24" cy="36" r="15.5" fill="#8B5E3C">
    <animate attributeName="cx" values="24;22;26;24" dur="0.5s" repeatCount="indefinite"/>
  </circle>
  <!-- Eyes half-open -->
  <path d="M15 29 Q19 27 23 29" stroke="#5C2716" stroke-width="2.5" fill="none"/>
  <path d="M25 29 Q29 27 33 29" stroke="#5C2716" stroke-width="2.5" fill="none"/>
  <ellipse cx="24" cy="34" rx="3" ry="2" fill="#D97B3A">
    <animate attributeName="cy" values="34;35;34" dur="0.5s" repeatCount="indefinite"/>
  </ellipse>
  <!-- Belly -->
  <ellipse cx="24" cy="40" rx="10" ry="5.5" fill="#F9E2AF">
    <animate attributeName="cx" values="24;22;26;24" dur="0.5s" repeatCount="indefinite"/>
  </ellipse>
  <!-- Feet -->
  <ellipse cx="16" cy="53" rx="6" ry="3" fill="#D97B3A">
    <animate attributeName="cx" values="16;14;18;16" dur="0.5s" repeatCount="indefinite"/>
  </ellipse>
  <ellipse cx="32" cy="53" rx="6" ry="3" fill="#D97B3A">
    <animate attributeName="cx" values="32;34;30;32" dur="0.5s" repeatCount="indefinite"/>
  </ellipse>
</svg>
`)}`;

const AWAKENING2_SVG = `data:image/svg+xml,${encodeURIComponent(`
<svg width="48" height="64" viewBox="0 0 48 64" xmlns="http://www.w3.org/2000/svg">
  <!-- Body stretching upward -->
  <ellipse cx="24" cy="58" rx="14" ry="5" fill="#F9E2AF"/>
  <circle cx="24" cy="36" r="17.5" fill="#8B5E3C">
    <animate attributeName="cy" values="36;34;36" dur="2s" repeatCount="indefinite"/>
  </circle>
  <!-- Eyes opening (wide) -->
  <circle cx="17" cy="28" r="5.5" fill="#F9E2AF" stroke="#5C2716" stroke-width="2"/>
  <circle cx="31" cy="28" r="5.5" fill="#F9E2AF" stroke="#5C2716" stroke-width="2"/>
  <circle cx="18.5" cy="27" r="2.5" fill="#FFD93D"/>
  <circle cx="32.5" cy="27" r="2.5" fill="#FFD93D"/>
  <!-- Glowing pupils -->
  <circle cx="18.5" cy="27" r="1.5" fill="#5C2716">
    <animate attributeName="r" values="1;2;1" dur="1s" repeatCount="indefinite"/>
  </circle>
  <circle cx="32.5" cy="27" r="1.5" fill="#5C2716">
    <animate attributeName="r" values="1;2;1" dur="1s" repeatCount="indefinite"/>
  </circle>
  <!-- Beak -->
  <ellipse cx="24" cy="34" rx="3.5" ry="2.5" fill="#D97B3A">
    <animate attributeName="cy" values="34;33;34" dur="2s" repeatCount="indefinite"/>
  </ellipse>
  <!-- Belly -->
  <ellipse cx="24" cy="42" rx="8" ry="5.5" fill="#F9E2AF">
    <animate attributeName="cy" values="42;40;42" dur="2s" repeatCount="indefinite"/>
  </ellipse>
  <!-- Arms raised -->
  <path d="M10 34 L4 26" stroke="#8B5E3C" stroke-width="4" stroke-linecap="round" fill="none">
    <animate attributeName="d" values="M10 34 L4 26; M9 33 L3 25; M10 34 L4 26" dur="2s" repeatCount="indefinite"/>
  </path>
  <path d="M38 34 L44 26" stroke="#8B5E3C" stroke-width="4" stroke-linecap="round" fill="none">
    <animate attributeName="d" values="M38 34 L44 26; M39 33 L45 25; M38 34 L44 26" dur="2s" repeatCount="indefinite"/>
  </path>
  <!-- Feet -->
  <ellipse cx="16" cy="60" rx="6" ry="3" fill="#D97B3A">
    <animate attributeName="cy" values="60;58;60" dur="2s" repeatCount="indefinite"/>
  </ellipse>
  <ellipse cx="32" cy="60" rx="6" ry="3" fill="#D97B3A">
    <animate attributeName="cy" values="60;58;60" dur="2s" repeatCount="indefinite"/>
  </ellipse>
</svg>
`)}`;

const AWAKENING3_SVG = `data:image/svg+xml,${encodeURIComponent(`
<svg width="48" height="56" viewBox="0 0 48 56" xmlns="http://www.w3.org/2000/svg">
  <!-- Eyes glow yellow -->
  <circle cx="17" cy="28" r="6" fill="#FFD93D" stroke="#5C2716" stroke-width="2"/>
  <circle cx="31" cy="28" r="6" fill="#FFD93D" stroke="#5C2716" stroke-width="2"/>
  <!-- Glow effect -->
  <circle cx="17" cy="28" r="4" fill="#FFF9E0">
    <animate attributeName="r" values="4;5;4" dur="0.8s" repeatCount="indefinite"/>
    <animate attributeName="opacity" values="0.6;0.3;0.6" dur="0.8s" repeatCount="indefinite"/>
  </circle>
  <circle cx="31" cy="28" r="4" fill="#FFF9E0">
    <animate attributeName="r" values="4;5;4" dur="0.8s" repeatCount="indefinite"/>
    <animate attributeName="opacity" values="0.6;0.3;0.6" dur="0.8s" repeatCount="indefinite"/>
  </circle>
</svg>
`)}`;

// ─── Pingu Awakening Dialog (when model + llama.cpp ready but not yet loaded) ──────────────

const AWAKENING_DIALOG_SVG = `data:image/svg+xml,${encodeURIComponent(`
<svg width="48" height="56" viewBox="0 0 48 56" xmlns="http://www.w3.org/2000/svg">
  <!-- Eyes — wide open, alert -->
  <circle cx="17" cy="28" r="5.5" fill="#FFD93D" stroke="#5C2716" stroke-width="2"/>
  <circle cx="31" cy="28" r="5.5" fill="#FFD93D" stroke="#5C2716" stroke-width="2"/>
  <!-- Glowing pupils -->
  <circle cx="18.5" cy="27" r="2" fill="#5C2716">
    <animate attributeName="r" values="2;3;2" dur="1s" repeatCount="indefinite"/>
  </circle>
  <circle cx="32.5" cy="27" r="2" fill="#5C2716">
    <animate attributeName="r" values="2;3;2" dur="1s" repeatCount="indefinite"/>
  </circle>
  <!-- Body — standing upright -->
  <ellipse cx="24" cy="48" rx="18" ry="8" fill="#F9E2AF"/>
  <circle cx="24" cy="36" r="16" fill="#8B5E3C"/>
  <!-- Beak — slightly open (talking) -->
  <ellipse cx="24" cy="33" rx="3.5" ry="2.5" fill="#D97B3A">
    <animate attributeName="ry" values="2;3;2" dur="1s" repeatCount="indefinite"/>
  </ellipse>
  <!-- Belly patch -->
  <ellipse cx="24" cy="40" rx="10" ry="6" fill="#F9E2AF"/>
  <!-- Feet — planted firmly -->
  <ellipse cx="16" cy="54" rx="6" ry="3" fill="#D97B3A"/>
  <ellipse cx="32" cy="54" rx="6" ry="3" fill="#D97B3A"/>
</svg>
`)}`;

// ─── Types and helpers ──────────────

type AnimState = 'idle' | 'scratch' | 'stretch' | 'yawn' | 'sleeping' | 'waking' | 'pouncing' | 'drinking' | 'checkingWatch';

function getRandomBehavior(): AnimState {
  const r = Math.random();
  
  // Weighted random — more common behaviors have higher probability
  if (r < 0.25) return 'idle';          // 25% idle
  if (r < 0.35) return 'scratch';       // 10% scratch
  if (r < 0.42) return 'stretch';       // 7% stretch
  if (r < 0.48) return 'yawn';          // 6% yawn
  if (r < 0.53) return 'sleeping';      // 5% sleeping (from boredom after idle)
  if (r < 0.57) return 'waking';        // 4% waking up suddenly
  if (r < 0.62) return 'pouncing';      // 5% pounce on nothing
  if (r < 0.68) return 'drinking';      // 6% drinking from sink
  if (r < 0.73) return 'checkingWatch'; // 5% check watch
  
  // Remaining probability — return idle or yawn as fallback
  return Math.random() > 0.5 ? 'idle' : 'yawn';
}

// ─── Pingu Sprite Component ──────────────

interface PinguSpriteProps {
  isAwake: boolean;
  isPinned: boolean;
  pinnedPosition?: { x: number; y: number };
  awakeningPhase: 'none' | 'shake' | 'stretch' | 'glow';
  hasGguf: boolean;
  hasLlamaCpp: boolean;
  isLoadingModel: boolean;
  loadProgress: number;
}

function PinguSprite({ isAwake, isPinned, pinnedPosition, awakeningPhase, hasGguf, hasLlamaCpp, isLoadingModel, loadProgress }: PinguSpriteProps) {
  const [animState, setAnimState] = React.useState<AnimState>('idle');
  const intervalRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  
  // No-Model state: dangling lifeless (no GGUF loaded and not pinned)
  if (!hasGguf && !isAwake && !isPinned) {
    return (
      <div className="absolute cursor-pointer" style={{ left: '-10px', top: '-20px' }}>
        <img src={NOMODEL_SVG} alt="Pingu - lifeless, no model loaded" className="w-[48px] h-[60px]" />
      </div>
    );
  }
  
  // Pinned state: staring at user
  if (isPinned) {
    return (
      <div 
        className="absolute cursor-pointer transition-transform duration-200"
        style={{ left: pinnedPosition ? `${pinnedPosition.x}px` : '-10px', top: '-10px' }}
      >
        <img src={PINNED_SVG} alt="Pingu - pinned, staring at user" className="w-[48px] h-[56px]" />
      </div>
    );
  }
  
  // Awakening sequence: show phase-specific SVG
  if (awakeningPhase !== 'none') {
    const svg = awakeningPhase === 'shake' ? AWAKENING1_SVG : 
                awakeningPhase === 'stretch' ? AWAKENING2_SVG : 
                AWAKENING3_SVG;
    
    return (
      <div className="absolute cursor-pointer" style={{ left: '-10px', top: '-15px' }}>
        <img src={svg} alt={`Pingu awakening — ${awakeningPhase}`} className="w-[48px] h-[56px]" />
      </div>
    );
  }
  
  // Loading model state: loading indicator
  if (isLoadingModel) {
    return (
      <div className="absolute cursor-pointer" style={{ left: '-10px', top: '-10px' }}>
        <img src={AWAKENING_DIALOG_SVG} alt="Pingu - loading model" className="w-[48px] h-[56px]" />
        {/* Progress bar overlay */}
        <div className="mt-1 w-[48px] h-[4px] rounded bg-[#313244] overflow-hidden">
          <div 
            className="h-full bg-green-300 transition-all duration-300"
            style={{ width: `${loadProgress}%` }}
          />
        </div>
      </div>
    );
  }
  
  // Awake and not pinned: show random animation state
  useEffect(() => {
    if (!isAwake || isPinned) return;
    
    const startRandomAnimations = () => {
      const randomBehavior = getRandomBehavior();
      setAnimState(randomBehavior);
      
      // Schedule next behavior change after current one completes
      let duration = 3000; // default idle
      switch (randomBehavior) {
        case 'scratch': duration = 4000; break;
        case 'stretch': duration = 2500; break;
        case 'yawn': duration = 5000; break;
        case 'pouncing': duration = 1500; break;
        case 'drinking': duration = 4000; break;
        case 'checkingWatch': duration = 3000; break;
      }
      
      intervalRef.current = setTimeout(() => {
        setAnimState('idle');
        scheduleNextBehavior(duration);
      }, duration);
    };
    
    const scheduleNextBehavior = (delay: number) => {
      // Random delay before next behavior — 5-15 seconds
      const nextDelay = Math.random() * (10000 - 5000) + 5000;
      setTimeout(() => startRandomAnimations(), nextDelay);
    };
    
    // Initial random animation after a short delay
    const initialTimeout = setTimeout(startRandomAnimations, Math.random() * 8000 + 4000);
    
    return () => {
      clearTimeout(initialTimeout);
      if (intervalRef.current) clearTimeout(intervalRef.current);
    };
  }, [isAwake, isPinned]);
  
  // Get the SVG for current animation state
  const getPinguSVG = useCallback(() => {
    switch (animState) {
      case 'scratch': return SCRATCH_SVG;
      case 'stretch': return STRETCH_SVG;
      case 'yawn': return YAWN_SVG;
      case 'sleeping': return SLEEPING_SVG;
      case 'waking': return WAKING_SVG;
      case 'pouncing': return POUNCE_SVG;
      case 'drinking': return DRINKING_SVG;
      case 'checkingWatch': return CHECK_WATCH_SVG;
      default: return IDLE_SVG;
    }
  }, [animState]);
  
  // Position calculation — pinned Pingu stays fixed, otherwise moves around home tile area
  const positionRef = useRef<{ x: number; y: number }>({ x: -10, y: -10 });
  
  useEffect(() => {
    if (isPinned && pinnedPosition) {
      // Stay pinned to the user's position
      return;
    }
    
    // If not idle — don't move (stays where it was during last animation)
    if (animState !== 'idle') return;
    
    // Only reposition on state changes, not every render
    // Rare random shift while idle — only when not pinned and animState is idle.
    const shouldShift = !pinnedPosition && animState === 'idle' && Math.random() > 0.95;
    if (shouldShift) {
        // Random shift offset for idle movement around home tile area.
      const offsetX = Math.random() * 4 - 2;
      const offsetY = Math.random() * 3 - 1.5;
      
      positionRef.current = { x: offsetX, y: offsetY };
    }
  }, [isPinned, pinnedPosition, animState]);

  const getPosition = useCallback(() => {
    if (isPinned && pinnedPosition) {
      return `${pinnedPosition.x}px ${pinnedPosition.y}px`;
    }
    
    const pos = positionRef.current;
    return `${pos.x}px ${pos.y}px`;
  }, [isPinned, pinnedPosition]);

  return (
    <div 
      className="absolute cursor-pointer transition-transform duration-200"
      style={{ 
        left: getPosition(),
        top: '-10px',
        animationDuration: animState === 'waking' ? '0.8s' : undefined,
      }}
      onClick={() => {
        // When awake and has model — pin and open chat dialog (Phase 5)
        if (isAwake && hasGguf && hasLlamaCpp) {
          usePinguStore.getState().pinAndOpenChat();
        } else if (!hasGguf) {
          // No-Model state: open NoModelDialog (handled by App.tsx via isPinned check)
          usePinguStore.getState().pinAndOpenChat();
        }
      }}
    >
      <img 
        src={getPinguSVG()} 
        alt={`Pingu ${animState}`}
        className="w-[48px] h-[56px]"
      />
    </div>
  );
}

// ─── Ambient Ripple Effect from Sink ──────────────

function RippleEffect() {
  const [ripples, setRipples] = React.useState<Array<{ id: number; x: number; y: number }>>([]);
  
  useEffect(() => {
    // Randomly add ripples every few seconds
    const interval = setInterval(() => {
      const newRipple = {
        id: Date.now(),
        x: Math.random() * 10 - 5,
        y: Math.random() * 4 - 2,
      };
      setRipples(prev => [...prev.slice(-3), newRipple]); // Keep last 3 ripples
      
      // Remove ripple after animation completes
      setTimeout(() => {
        setRipples(prev => prev.filter(r => r.id !== newRipple.id));
      }, 3000);
    }, Math.random() * 4000 + 2000);
    
    return () => clearInterval(interval);
  }, []);
  
  return (
    <div className="relative w-[16px] h-[16px]">
      {ripples.map(ripple => (
        <div
          key={ripple.id}
          className="absolute rounded-full animate-ripple"
          style={{
            left: `${ripple.x}px`,
            top: `${ripple.y}px`,
            width: '8px',
            height: '4px',
            border: '1px solid rgba(74, 143, 191, 0.6)',
          }}
        />
      ))}
    </div>
  );
}

// ─── Penguin Home Tile Component ──────────────

export function PenguinHomeTile() {
  const isAwake = usePinguStore(s => s.isAwake);
  const isPinned = usePinguStore(s => s.isPinned);
  const pinnedPosition = usePinguStore(s => s.pinnedPosition);
  const awakeningPhase = usePinguStore(s => s.awakeningPhase);
  const hasGguf = usePinguStore(s => s.hasGguf);
  const hasLlamaCpp = usePinguStore(s => s.hasLlamaCpp);
  const isLoadingModel = usePinguStore(s => s.isLoadingModel);
  const loadProgress = usePinguStore(s => s.loadProgress);
  
  // Puddle visibility state (local to this component, randomly toggled)
  const [puddleVisible, setPuddleVisible] = React.useState(false);
  
  useEffect(() => {
    const interval = setInterval(() => {
      setPuddleVisible(Math.random() > 0.7);
    }, 8000);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="fixed bottom-2 left-2 z-50">
      {/* Home tile container — slightly elevated from corner */}
      <div className="relative">
        {/* Sleeping mat */}
        <img 
          src={SLEEPING_MAT_SVG} 
          alt="Pingu's sleeping mat"
          className="w-[96px] h-[48px]"
        />
        
        {/* Sink next to the mat */}
        <div className="absolute -right-2 bottom-1">
          <img src={SINK_SVG} alt="Water sink" className="w-[28px] h-[40px]" />
        </div>
        
        {/* Occasional puddle effect (randomly shown when Pingu spills) */}
        {puddleVisible && !isPinned && (
          <div className="absolute -bottom-1 right-6">
            <img src={PUDDLE_SVG} alt="Water puddle" className="w-[20px] h-[12px]" />
          </div>
        )}
        
        {/* Pingu sprite — position changes based on state */}
        <PinguSprite 
          isAwake={isAwake}
          isPinned={isPinned}
          pinnedPosition={pinnedPosition}
          awakeningPhase={awakeningPhase}
          hasGguf={hasGguf}
          hasLlamaCpp={hasLlamaCpp}
          isLoadingModel={isLoadingModel}
          loadProgress={loadProgress}
        />
      </div>
      
      {/* Ambient effects — water ripples from sink */}
      {!isPinned && (
        <div className="absolute -right-4 bottom-2 opacity-30">
          <RippleEffect />
        </div>
      )}
    </div>
  );
}

// ─── CSS Animations ──────────────

const styleTag = document.createElement('style');
styleTag.textContent = `
@keyframes ripple {
  0% { transform: scale(1); opacity: 0.6; }
  100% { transform: scale(2.5); opacity: 0; }
}
.animate-ripple {
  animation: ripple 3s ease-out forwards;
}
`;
document.head.appendChild(styleTag);
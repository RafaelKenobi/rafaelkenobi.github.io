import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';

// THREE Scene
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x000000);

// Camera setup
const camera = new THREE.PerspectiveCamera(
  75,
  window.innerWidth / window.innerHeight,
  0.1,
  1000
);
camera.position.set(0, 1.6, 2.8);

// Store initial camera state and show hint after 3 seconds
window.addEventListener('load', () => {
  originalCameraRotation = {
    x: camera.rotation.x,
    y: camera.rotation.y,
    z: camera.rotation.z
  };
  
  // Show hint after HINT_DELAY milliseconds if user hasn't interacted
  hintTimeout = setTimeout(() => {
    if (!hasUserInteracted && DOM.pressHint) {
      DOM.pressHint.classList.add('show');
    }
  }, CONFIG.HINT_DELAY);
});

// WebGL Renderer
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(window.devicePixelRatio);
document.body.appendChild(renderer.domElement);

// Chromatic Aberration Shader
const chromaticAberrationShader = {
  uniforms: {
    'tDiffuse': { value: null },
    'aberration': { value: 0.004 }
  },
  vertexShader: `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  fragmentShader: `
    uniform sampler2D tDiffuse;
    uniform float aberration;
    varying vec2 vUv;
    
    void main() {
      vec2 offset = aberration * (vUv - 0.5);
      float r = texture2D(tDiffuse, vUv + offset).r;
      float g = texture2D(tDiffuse, vUv).g;
      float b = texture2D(tDiffuse, vUv - offset).b;
      gl_FragColor = vec4(r, g, b, 1.0);
    }
  `
};

// Post-Processing Setup
const composer = new EffectComposer(renderer);
const renderPass = new RenderPass(scene, camera);
composer.addPass(renderPass);

// Unreal Bloom Pass
const bloomPass = new UnrealBloomPass(
  new THREE.Vector2(window.innerWidth, window.innerHeight),
  0.2,   // strength
  0.9,   // radius
  0.85   // threshold
);
composer.addPass(bloomPass);

// Chromatic Aberration Pass
const chromaticPass = new ShaderPass(chromaticAberrationShader);
composer.addPass(chromaticPass);

// Post-Processing Configuration (easy to adjust)
const postProcessing = {
  bloom: {
    strength: 1.5,
    radius: 0.4,
    threshold: 0.85
  },
  chromatic: {
    aberration: 0.003
  }
};

// Function to update bloom strength
function setBloomStrength(strength) {
  postProcessing.bloom.strength = strength;
  bloomPass.strength = strength;
}

// Function to update chromatic aberration
function setChromaticAberration(value) {
  postProcessing.chromatic.aberration = value;
  chromaticPass.uniforms.aberration.value = value;
}

// Lighting setup
const ambientLight = new THREE.AmbientLight(0xffffff, 0.8);
scene.add(ambientLight);

const directionalLight = new THREE.DirectionalLight(0xffffff, 1);
directionalLight.position.set(5, 10, 5);
scene.add(directionalLight);

// Animation mixer
let mixer = null;
const clock = new THREE.Clock();

// Mouse position and game objects
const mouse = { x: 0, y: 0 };
let planetas = [];
let isZooming = false;
let zoomTarget = null;
let originalCameraPos = { x: 0, y: 1.6, z: 2.8 };
let originalCameraRotation = { x: 0, y: 0, z: 0 }; // Store initial camera rotation

// Map short planet names to display labels
const planetNameMap = {
  Cent: 'Portfolio',
  fiz_1: 'Disasterpiece',
  Uran_1: 'About',
  Fum: 'CV',
  Aros: 'Contacts',
  Nept: 'Bio'
};

// CONFIG
const CONFIG = {
  HINT_DELAY: 3000,
  ZOOM_DURATION: 1000,
  RESET_DURATION: 800,
  CAMERA_EASING: 3,
  CAMERA_FOLLOW_SPEED: 0.05
};

// Estado
let hasUserInteracted = false;
let hintTimeout = null;
let hasMouseMoved = false; // Only raycasting after first mouse move

// Cached DOM elements
const DOM = {
  tooltip: document.getElementById('planetaTooltip'),
  pressHint: document.getElementById('pressHint'),
  menuDropdown: document.getElementById('menuDropdown'),
  menuToggle: document.getElementById('menuToggle'),
  audio: document.getElementById('audioPlayer'),
  playPauseBtn: document.getElementById('playPauseBtn'),
  nextBtn: document.getElementById('nextBtn'),
  trackName: document.getElementById('trackName'),
  modals: {
    portfolio: document.getElementById('portfolioModal'),
    disasterpiece: document.getElementById('disasterpieceModal'),
    about: document.getElementById('aboutModal'),
    cv: document.getElementById('cvModal'),
    contacts: document.getElementById('contactsModal'),
    bio: document.getElementById('bioModal')
  },
  closeButtons: {
    portfolio: document.getElementById('closePortfolio'),
    disasterpiece: document.getElementById('closeDisasterpiece'),
    about: document.getElementById('closeAbout'),
    cv: document.getElementById('closeCV'),
    contacts: document.getElementById('closeContacts'),
    bio: document.getElementById('closeBio')
  },
  links: {
    portfolio: document.querySelector('a[href="#portfolio"]'),
    disasterpiece: document.querySelector('a[href="#disasterpiece"]'),
    about: document.querySelector('a[href="#about"]'),
    cv: document.querySelector('a[href="#cv"]'),
    contacts: document.querySelector('a[href="#contacts"]'),
    bio: document.querySelector('a[href="#bio"]')
  }
};

// Raycasting
const raycaster = new THREE.Raycaster();

// Convert 3D object position to screen coordinates (pixels)
function toScreenPosition(obj, camera) {
  const vector = new THREE.Vector3();
  const widthHalf = 0.5 * renderer.domElement.clientWidth;
  const heightHalf = 0.5 * renderer.domElement.clientHeight;

  obj.getWorldPosition(vector);
  vector.project(camera);
  vector.x = (vector.x * widthHalf) + widthHalf;
  vector.y = -(vector.y * heightHalf) + heightHalf;
  return { x: vector.x, y: vector.y };
}

// Mouse movement listener
document.addEventListener('mousemove', (event) => {
  hasMouseMoved = true;
  mouse.x = (event.clientX / window.innerWidth) * 2 - 1;
  mouse.y = -(event.clientY / window.innerHeight) * 2 + 1;
});

// Mobile touch support - update coordinates like mouse movement
document.addEventListener('touchmove', (event) => {
  hasMouseMoved = true;
  if (event.touches && event.touches[0]) {
    const touch = event.touches[0];
    mouse.x = (touch.clientX / window.innerWidth) * 2 - 1;
    mouse.y = -(touch.clientY / window.innerHeight) * 2 + 1;
  }
});

// Update coordinates on touch start for immediate tooltip display
document.addEventListener('touchstart', (event) => {
  hasMouseMoved = true;
  if (event.touches && event.touches[0]) {
    const touch = event.touches[0];
    mouse.x = (touch.clientX / window.innerWidth) * 2 - 1;
    mouse.y = -(touch.clientY / window.innerHeight) * 2 + 1;
  }
});

// Click listener for planet interaction
document.addEventListener('click', (event) => {
  // Skip if already zooming
  if (isZooming) return;
  
  // Ignore clicks on UI elements
  if (event.target.closest('.header') || event.target.closest('.music-player') || event.target.closest('.portfolio-modal') || event.target.closest('.disasterpiece-modal') || event.target.closest('.about-modal') || event.target.closest('.cv-modal') || event.target.closest('.contacts-modal') || event.target.closest('.interests-modal')) return;
  
  raycaster.setFromCamera(mouse, camera);
  const intersects = raycaster.intersectObjects(planetas, true);
  
  if (intersects.length > 0) {
    // Mark user interaction
    hasUserInteracted = true;
    if (hintTimeout) clearTimeout(hintTimeout);
    const pressHint = document.getElementById('pressHint');
    if (pressHint) pressHint.classList.remove('show');
    
    let clickedPlaneta = intersects[0].object;
    // Find the actual planet object in the hierarchy
    while (clickedPlaneta && !planetas.includes(clickedPlaneta)) {
      clickedPlaneta = clickedPlaneta.parent;
    }
    
    if (clickedPlaneta) {
      if (clickedPlaneta.name === 'Cent') {
        zoomToPlaneta(clickedPlaneta, DOM.modals.portfolio);
      } else if (clickedPlaneta.name === 'fiz_1') {
        zoomToPlaneta(clickedPlaneta, DOM.modals.disasterpiece);
      } else if (clickedPlaneta.name === 'Uran_1') {
        zoomToPlaneta(clickedPlaneta, DOM.modals.about);
      } else if (clickedPlaneta.name === 'Fum') {
        zoomToPlaneta(clickedPlaneta, DOM.modals.cv);
      } else if (clickedPlaneta.name === 'Aros') {
        zoomToPlaneta(clickedPlaneta, DOM.modals.contacts);
      } else if (clickedPlaneta.name === 'Nept') {
        zoomToPlaneta(clickedPlaneta, DOM.modals.bio);
      }
    }
  }
});

// Zoom camera to a planet and open its modal
function zoomToPlaneta(planeta, modalElement = null) {
  const menuDropdown = document.getElementById('menuDropdown');
  
  isZooming = true;
  zoomTarget = planeta;
  
  // Close menu if open
  DOM.menuDropdown.classList.remove('active');
  
  const duration = CONFIG.ZOOM_DURATION;
  const startTime = Date.now();
  const startPos = {
    x: camera.position.x,
    y: camera.position.y,
    z: camera.position.z
  };
  
  const animateZoom = () => {
    const elapsed = Date.now() - startTime;
    const progress = Math.min(elapsed / duration, 1);
    
    // Ease-out function for smooth animation
    const easeProgress = 1 - Math.pow(1 - progress, 3);
    
    // Get current planet position (updates each frame with animations)
    const currentPlanetaPos = new THREE.Vector3();
    planeta.getWorldPosition(currentPlanetaPos);
    
    // Calculate target position relative to planet
    const targetPos = new THREE.Vector3();
    targetPos.copy(currentPlanetaPos);
    targetPos.z += 0.3;
    targetPos.y += 0.0;
    
    // Interpolate between start and target position
    camera.position.x = startPos.x + (targetPos.x - startPos.x) * easeProgress;
    camera.position.y = startPos.y + (targetPos.y - startPos.y) * easeProgress;
    camera.position.z = startPos.z + (targetPos.z - startPos.z) * easeProgress;
    
    // Make camera look at the planet
    camera.lookAt(currentPlanetaPos);
    
    if (progress < 1) {
      requestAnimationFrame(animateZoom);
    } else {
      // Open modal after animation completes
      if (modalElement) {
        modalElement.classList.add('active');
      }
      isZooming = false;
    }
  };
  
  animateZoom();
}

// Reset camera to original position
function resetCamera() {
  isZooming = true;
  const duration = CONFIG.RESET_DURATION;
  const startTime = Date.now();
  const startPos = {
    x: camera.position.x,
    y: camera.position.y,
    z: camera.position.z
  };
  const startRot = {
    x: camera.rotation.x,
    y: camera.rotation.y,
    z: camera.rotation.z
  };
  
  const targetPos = originalCameraPos;
  const targetRot = originalCameraRotation;
  
  const animateReset = () => {
    const elapsed = Date.now() - startTime;
    const progress = Math.min(elapsed / duration, 1);
    
    const easeProgress = 1 - Math.pow(1 - progress, 3);
    
    // Animate position
    camera.position.x = startPos.x + (targetPos.x - startPos.x) * easeProgress;
    camera.position.y = startPos.y + (targetPos.y - startPos.y) * easeProgress;
    camera.position.z = startPos.z + (targetPos.z - startPos.z) * easeProgress;
    
    // Animate rotation
    camera.rotation.x = startRot.x + (targetRot.x - startRot.x) * easeProgress;
    camera.rotation.y = startRot.y + (targetRot.y - startRot.y) * easeProgress;
    camera.rotation.z = startRot.z + (targetRot.z - startRot.z) * easeProgress;
    
    if (progress < 1) {
      requestAnimationFrame(animateReset);
    } else {
      isZooming = false;
      zoomTarget = null; // Clear zoom target so camera returns to normal
    }
  };
  
  animateReset();
}

// GLTF Model Loader
const loader = new GLTFLoader();

loader.load('meuAmbiente.glb', (gltf) => {
  const model = gltf.scene;
  scene.add(model);
  
  // Find all planet objects in the model
  model.traverse((child) => {
    const planetasNomes = ['Aros', 'Cent', 'fiz_1', 'Fum', 'Nept', 'Uran_1'];
    if (planetasNomes.includes(child.name)) {
      planetas.push(child);
    }
  });
  
  // Start animations
  if (gltf.animations && gltf.animations.length > 0) {
    mixer = new THREE.AnimationMixer(model);
    gltf.animations.forEach((clip) => {
      mixer.clipAction(clip).play();
    });
  }
});

// Main animation loop
function animate() {
  requestAnimationFrame(animate);
  
  if (mixer) {
    mixer.update(clock.getDelta());
  }
  
  // Raycasting to detect which planet is under the cursor
  if (planetas.length > 0 && hasMouseMoved) {
    raycaster.setFromCamera(mouse, camera);
    const intersects = raycaster.intersectObjects(planetas, true);
    
    if (intersects.length > 0) {
      // Find which planet was intersected
      let hoveredPlaneta = intersects[0].object;
      while (hoveredPlaneta && !planetas.includes(hoveredPlaneta)) {
        hoveredPlaneta = hoveredPlaneta.parent;
      }
      
      // Update tooltip display
      const isMenuOpen = DOM.menuDropdown.classList.contains('active');
      const modals = Object.values(DOM.modals);
      const isAnyModalOpen = modals.some(m => m && m.classList.contains('active'));
      
      if (DOM.tooltip && hoveredPlaneta && !isMenuOpen && !isAnyModalOpen) {
        const pos = toScreenPosition(hoveredPlaneta, camera);
        DOM.tooltip.style.display = 'block';
        DOM.tooltip.classList.add('visible');
        DOM.tooltip.style.left = `${pos.x}px`;
        DOM.tooltip.style.top = `${pos.y}px`;
        DOM.tooltip.textContent = planetNameMap[hoveredPlaneta.name] || hoveredPlaneta.name;
      } else if (DOM.tooltip) {
        DOM.tooltip.classList.remove('visible');
      }
    } else {
      if (DOM.tooltip) {
        DOM.tooltip.classList.remove('visible');
      }
    }
  }
  
  // Keep camera focused on planet while modal is active
  if (!isZooming && zoomTarget) {
    const isAnyModalActive = Object.values(DOM.modals).some(m => m && m.classList.contains('active'));
    
    if (isAnyModalActive) {
      // Keep camera following the planet
      const targetPlanetaPos = new THREE.Vector3();
      zoomTarget.getWorldPosition(targetPlanetaPos);
      
      const cameraTarget = new THREE.Vector3();
      cameraTarget.copy(targetPlanetaPos);
      cameraTarget.z += 0.3;
      cameraTarget.y += 0.0;
      
      // Smooth interpolation keeping camera close to planet
      camera.position.x += (cameraTarget.x - camera.position.x) * CONFIG.CAMERA_FOLLOW_SPEED;
      camera.position.y += (cameraTarget.y - camera.position.y) * CONFIG.CAMERA_FOLLOW_SPEED;
      camera.position.z += (cameraTarget.z - camera.position.z) * CONFIG.CAMERA_FOLLOW_SPEED;
      
      // Make camera look at the planet
      camera.lookAt(targetPlanetaPos);
    }
  }
  
  // Render with post-processing effects
  composer.render();
}

// Window resize handler
window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
  composer.setSize(window.innerWidth, window.innerHeight);
});

// Music Player Variables
let musicList = [];
let currentTrackIndex = 0;
let isPlaying = false;

// Load music list from playlist.json
async function loadMusicList() {
  try {
    // Fetch playlist.json file
    const response = await fetch('musica/playlist.json');
    
    if (response.ok) {
      const data = await response.json();
      musicList = data.playlist || [];
    }
  } catch (error) {
    // Silent fail - no playlist loaded
  }
}

// Variable to track if autoplay has been attempted
let autoplayAttempted = false;

// Initialize music player
async function initMusicPlayer() {
  await loadMusicList();
  
  if (musicList.length > 0) {
    currentTrackIndex = Math.floor(Math.random() * musicList.length);
    loadTrack(currentTrackIndex);
    attemptAutoplay();
  } else {
    DOM.trackName.textContent = 'No music found in musica/ folder';
  }
}

// Attempt autoplay on page load
function attemptAutoplay() {
  if (autoplayAttempted) return;
  
  DOM.audio.play()
    .then(() => {
      autoplayAttempted = true;
      updatePlayPauseIcon();
    })
    .catch(() => {
      // Autoplay blocked - wait for first user interaction
      document.addEventListener('click', resumeAudio, { once: true });
      document.addEventListener('touchstart', resumeAudio, { once: true });
    });
}

// Resume audio on first user interaction
function resumeAudio() {
  if (!autoplayAttempted) {
    DOM.audio.play()
      .then(() => {
        autoplayAttempted = true;
        updatePlayPauseIcon();
      })
      .catch(() => {});
  }
}

// Load track by index
function loadTrack(index) {
  if (musicList.length === 0) return;
  
  currentTrackIndex = index % musicList.length;
  DOM.audio.src = musicList[currentTrackIndex];
  
  const trackNameDisplay = musicList[currentTrackIndex]
    .split('/')
    .pop()
    .replace(/\.[^/.]+$/, ''); // Remove file extension
  
  DOM.trackName.textContent = '' + trackNameDisplay;
  updatePlayPauseIcon();
}

// Toggle play/pause
function togglePlayPause() {
  if (musicList.length === 0) return;
  
  if (DOM.audio.paused) {
    DOM.audio.play();
    isPlaying = true;
  } else {
    DOM.audio.pause();
    isPlaying = false;
  }
  
  updatePlayPauseIcon();
}

// Load next track and auto-play
function playNext() {
  if (musicList.length === 0) return;
  
  currentTrackIndex = (currentTrackIndex + 1) % musicList.length;
  loadTrack(currentTrackIndex);
  
  // Always play next track
  DOM.audio.play()
    .then(() => {
      isPlaying = true;
      updatePlayPauseIcon();
    })
    .catch(() => {
      // If auto-play fails, wait for user interaction
      document.addEventListener('click', resumeAudio, { once: true });
      document.addEventListener('touchstart', resumeAudio, { once: true });
    });
}

// Update play/pause button icon
function updatePlayPauseIcon() {
  if (DOM.audio.paused) {
    DOM.playPauseBtn.querySelector('.icon').textContent = '▶️';
    isPlaying = false;
  } else {
    DOM.playPauseBtn.querySelector('.icon').textContent = '⏸️';
    isPlaying = true;
  }
}

// Auto-play next track when current finishes
DOM.audio.addEventListener('ended', () => {
  playNext();
  setTimeout(() => DOM.audio.play(), 100);
});

DOM.playPauseBtn.addEventListener('click', togglePlayPause);
DOM.nextBtn.addEventListener('click', playNext);

// Initialize music player on page load
document.addEventListener('DOMContentLoaded', () => {
  initMusicPlayer();
});

// ============================================
// MENU HEADER
// ============================================

// Toggle menu on button click
DOM.menuToggle.addEventListener('click', () => {
  // Mark user interaction
  hasUserInteracted = true;
  if (hintTimeout) clearTimeout(hintTimeout);
  if (DOM.pressHint) DOM.pressHint.classList.remove('show');
  
  DOM.menuDropdown.classList.toggle('active');
});

// Close menu when clicking menu item
document.querySelectorAll('.menu-item').forEach(item => {
  item.addEventListener('click', () => {
    DOM.menuDropdown.classList.remove('active');
  });
});

// Close menu when clicking outside
document.addEventListener('click', (event) => {
  if (!event.target.closest('.header')) {
    DOM.menuDropdown.classList.remove('active');
  }
});

// ============================================
// PORTFOLIO MODAL
// ============================================

// Open portfolio modal
DOM.links.portfolio.addEventListener('click', (event) => {
  event.preventDefault();
  
  // Find planet "Cent"
  const centPlaneta = planetas.find(p => p.name === 'Cent');
  if (centPlaneta) {
    zoomToPlaneta(centPlaneta, DOM.modals.portfolio);
  } else {
    // If not found, just open portfolio
    DOM.modals.portfolio.classList.add('active');
    DOM.menuDropdown.classList.remove('active');
  }
});

// Close portfolio modal
DOM.closeButtons.portfolio.addEventListener('click', () => {
  DOM.modals.portfolio.classList.remove('active');
  resetCamera();
});

// ============================================
// DISASTERPIECE MODAL
// ============================================

// Open disasterpiece modal
DOM.links.disasterpiece.addEventListener('click', (event) => {
  event.preventDefault();
  
  // Find planet "fiz_1"
  const fiz1Planeta = planetas.find(p => p.name === 'fiz_1');
  if (fiz1Planeta) {
    zoomToPlaneta(fiz1Planeta, DOM.modals.disasterpiece);
  } else {
    // If not found, just open modal
    DOM.modals.disasterpiece.classList.add('active');
    DOM.menuDropdown.classList.remove('active');
  }
});

// Close disasterpiece modal
DOM.closeButtons.disasterpiece.addEventListener('click', () => {
  DOM.modals.disasterpiece.classList.remove('active');
  resetCamera();
});

// ============================================
// ABOUT MODAL
// ============================================

// Open about modal
DOM.links.about.addEventListener('click', (event) => {
  event.preventDefault();
  
  // Find planet "Uran_1"
  const uran1Planeta = planetas.find(p => p.name === 'Uran_1');
  if (uran1Planeta) {
    zoomToPlaneta(uran1Planeta, DOM.modals.about);
  } else {
    DOM.modals.about.classList.add('active');
    DOM.menuDropdown.classList.remove('active');
  }
});

// Close about modal
DOM.closeButtons.about.addEventListener('click', () => {
  DOM.modals.about.classList.remove('active');
  resetCamera();
});

// ============================================
// CV MODAL
// ============================================

// Open CV modal
DOM.links.cv.addEventListener('click', (event) => {
  event.preventDefault();
  
  // Find planet "Fum"
  const fumPlaneta = planetas.find(p => p.name === 'Fum');
  if (fumPlaneta) {
    zoomToPlaneta(fumPlaneta, DOM.modals.cv);
  } else {
    DOM.modals.cv.classList.add('active');
    DOM.menuDropdown.classList.remove('active');
  }
});

// Close CV modal
DOM.closeButtons.cv.addEventListener('click', () => {
  DOM.modals.cv.classList.remove('active');
  resetCamera();
});

// ============================================
// CONTACTS MODAL
// ============================================

// Open contacts modal
DOM.links.contacts.addEventListener('click', (event) => {
  event.preventDefault();
  
  // Find planet "Aros"
  const arosPlaneta = planetas.find(p => p.name === 'Aros');
  if (arosPlaneta) {
    zoomToPlaneta(arosPlaneta, DOM.modals.contacts);
  } else {
    DOM.modals.contacts.classList.add('active');
    DOM.menuDropdown.classList.remove('active');
  }
});

// Close contacts modal
DOM.closeButtons.contacts.addEventListener('click', () => {
  DOM.modals.contacts.classList.remove('active');
  resetCamera();
});

// ============================================
// BIO MODAL
// ============================================

// Open bio modal
DOM.links.bio.addEventListener('click', (event) => {
  event.preventDefault();
  
  // Find planet "Nept"
  const neptPlaneta = planetas.find(p => p.name === 'Nept');
  if (neptPlaneta) {
    zoomToPlaneta(neptPlaneta, DOM.modals.bio);
  } else {
    DOM.modals.bio.classList.add('active');
    DOM.menuDropdown.classList.remove('active');
  }
});

// Close bio modal
DOM.closeButtons.bio.addEventListener('click', () => {
  DOM.modals.bio.classList.remove('active');
  resetCamera();
});


animate();
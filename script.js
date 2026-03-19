import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

// Cena
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x000000);

// Câmara
const camera = new THREE.PerspectiveCamera(
  75,
  window.innerWidth / window.innerHeight,
  0.1,
  1000
);
camera.position.set(0, 1.6, 2.8);

// Guardar estado inicial da câmara
window.addEventListener('load', () => {
  originalCameraRotation = {
    x: camera.rotation.x,
    y: camera.rotation.y,
    z: camera.rotation.z
  };
  
  // Iniciar timer para mostrar "Press any planet" hint após 3 segundos
  hintTimeout = setTimeout(() => {
    if (!hasUserInteracted && DOM.pressHint) {
      DOM.pressHint.classList.add('show');
    }
  }, CONFIG.HINT_DELAY);
});

// Renderer
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(window.devicePixelRatio);
document.body.appendChild(renderer.domElement);

// Luzes
const ambientLight = new THREE.AmbientLight(0xffffff, 0.8);
scene.add(ambientLight);

const directionalLight = new THREE.DirectionalLight(0xffffff, 1);
directionalLight.position.set(5, 10, 5);
scene.add(directionalLight);

// Animações
let mixer = null;
const clock = new THREE.Clock();

// Posição do rato e controles
const mouse = { x: 0, y: 0 };
let neckBone = null;
let planetas = [];
let planetasWorldPos = {}; // Para armazenar posições do mundo dos planetas
let hoveredPlaneta = null;
let isZooming = false;
let zoomTarget = null;
let originalCameraPos = { x: 0, y: 1.6, z: 2.8 };
let originalCameraRotation = { x: 0, y: 0, z: 0 }; // Guardar rotação inicial

// Mapa de nomes visíveis para cada planeta
const planetNameMap = {
  Cent: 'Portfolio',
  fiz_1: 'Disasterpiece',
  Uran_1: 'About',
  Fum: 'CV',
  Aros: 'Contacts',
  Nept: 'My Interests'
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
let hasMouseMoved = false; // Flag para só fazer raycasting após movimento de rato

// Elementos DOM cacheados
const DOM = {
  tooltip: document.getElementById('planetaTooltip'),
  tooltipLine: document.getElementById('tooltipLine'),
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
    interests: document.getElementById('interestsModal')
  },
  closeButtons: {
    portfolio: document.getElementById('closePortfolio'),
    disasterpiece: document.getElementById('closeDisasterpiece'),
    about: document.getElementById('closeAbout'),
    cv: document.getElementById('closeCV'),
    contacts: document.getElementById('closeContacts'),
    interests: document.getElementById('closeInterests')
  },
  links: {
    portfolio: document.querySelector('a[href="#portfolio"]'),
    disasterpiece: document.querySelector('a[href="#disasterpiece"]'),
    about: document.querySelector('a[href="#about"]'),
    cv: document.querySelector('a[href="#cv"]'),
    contacts: document.querySelector('a[href="#contacts"]'),
    interests: document.querySelector('a[href="#interests"]')
  }
};

// Raycasting
const raycaster = new THREE.Raycaster();

// Converte a posição de um objeto 3D para coordenadas de ecrã (pixels)
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

// Listener do rato - movimento
document.addEventListener('mousemove', (event) => {
  hasMouseMoved = true;
  mouse.x = (event.clientX / window.innerWidth) * 2 - 1;
  mouse.y = -(event.clientY / window.innerHeight) * 2 + 1;
});

// Suporte a toque para mobile (atualiza as coordenadas como se fosse o rato)
document.addEventListener('touchmove', (event) => {
  hasMouseMoved = true;
  if (event.touches && event.touches[0]) {
    const touch = event.touches[0];
    mouse.x = (touch.clientX / window.innerWidth) * 2 - 1;
    mouse.y = -(touch.clientY / window.innerHeight) * 2 + 1;
  }
});

// opcional: também atualiza no touchstart para mostrar tooltip imediatamente
document.addEventListener('touchstart', (event) => {
  hasMouseMoved = true;
  if (event.touches && event.touches[0]) {
    const touch = event.touches[0];
    mouse.x = (touch.clientX / window.innerWidth) * 2 - 1;
    mouse.y = -(touch.clientY / window.innerHeight) * 2 + 1;
  }
});

// Listener do rato - click
document.addEventListener('click', (event) => {
  // Se estiver a fazer zoom, não fazer nada
  if (isZooming) return;
  
  // Ignorar clicks em elementos UI
  if (event.target.closest('.header') || event.target.closest('.music-player') || event.target.closest('.portfolio-modal') || event.target.closest('.disasterpiece-modal') || event.target.closest('.about-modal') || event.target.closest('.cv-modal') || event.target.closest('.contacts-modal') || event.target.closest('.interests-modal')) return;
  
  raycaster.setFromCamera(mouse, camera);
  const intersects = raycaster.intersectObjects(planetas, true);
  
  if (intersects.length > 0) {
    // Marcar interação do utilizador
    hasUserInteracted = true;
    if (hintTimeout) clearTimeout(hintTimeout);
    const pressHint = document.getElementById('pressHint');
    if (pressHint) pressHint.classList.remove('show');
    
    let clickedPlaneta = intersects[0].object;
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
        zoomToPlaneta(clickedPlaneta, DOM.modals.interests);
      }
    }
  }
});

// Função para fazer zoom a um planeta
function zoomToPlaneta(planeta, modalElement = null) {
  const menuDropdown = document.getElementById('menuDropdown');
  
  isZooming = true;
  zoomTarget = planeta;
  
  // Fechar menu se estiver aberto
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
    
    // Easing function (ease-out)
    const easeProgress = 1 - Math.pow(1 - progress, 3);
    
    // Calcular posição atual do planeta (atualizado em cada frame)
    const currentPlanetaPos = new THREE.Vector3();
    planeta.getWorldPosition(currentPlanetaPos);
    
    // Calcular posição-alvo relativa ao planeta
    const targetPos = new THREE.Vector3();
    targetPos.copy(currentPlanetaPos);
    targetPos.z += 0.3;
    targetPos.y += 0.0;
    
    // Interpolar entre a posição inicial e a posição-alvo do planeta
    camera.position.x = startPos.x + (targetPos.x - startPos.x) * easeProgress;
    camera.position.y = startPos.y + (targetPos.y - startPos.y) * easeProgress;
    camera.position.z = startPos.z + (targetPos.z - startPos.z) * easeProgress;
    
    // Fazer a câmara olhar para o planeta
    camera.lookAt(currentPlanetaPos);
    
    if (progress < 1) {
      requestAnimationFrame(animateZoom);
    } else {
      // Abrir modal após a animação estar completa
      if (modalElement) {
        modalElement.classList.add('active');
      }
      isZooming = false;
    }
  };
  
  animateZoom();
}

// Função para voltar à câmara original
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
    
    // Animar posição
    camera.position.x = startPos.x + (targetPos.x - startPos.x) * easeProgress;
    camera.position.y = startPos.y + (targetPos.y - startPos.y) * easeProgress;
    camera.position.z = startPos.z + (targetPos.z - startPos.z) * easeProgress;
    
    // Animar rotação
    camera.rotation.x = startRot.x + (targetRot.x - startRot.x) * easeProgress;
    camera.rotation.y = startRot.y + (targetRot.y - startRot.y) * easeProgress;
    camera.rotation.z = startRot.z + (targetRot.z - startRot.z) * easeProgress;
    
    if (progress < 1) {
      requestAnimationFrame(animateReset);
    } else {
      isZooming = false;
      zoomTarget = null; // Limpar zoom target para que a câmara volte ao normal
    }
  };
  
  animateReset();
}

// Loader
const loader = new GLTFLoader();

loader.load('meuAmbiente.glb', (gltf) => {
  const model = gltf.scene;
  scene.add(model);
  
  // Encontrar o Neck e os planetas
  model.traverse((child) => {
    // Encontrar Neck
    if (child.name === 'Neck' || child.name === 'neck') {
      neckBone = child;
    }
    
    // Encontrar planetas
    const planetasNomes = ['Aros', 'Cent', 'fiz_1', 'Fum', 'Nept', 'Uran_1'];
    if (planetasNomes.includes(child.name)) {
      planetas.push(child);
    }
  });
  
  // Iniciar animações
  if (gltf.animations && gltf.animations.length > 0) {
    mixer = new THREE.AnimationMixer(model);
    gltf.animations.forEach((clip) => {
      mixer.clipAction(clip).play();
    });
  }
});

// Animação
function animate() {
  requestAnimationFrame(animate);
  
  if (mixer) {
    mixer.update(clock.getDelta());
  }
  
  // Atualizar posições dos planetas em tempo real (para seguir as animações)
  planetas.forEach((planeta) => {
    planetasWorldPos[planeta.name] = planeta.getWorldPosition(new THREE.Vector3());
  });
  
  // Fazer raycasting para detectar qual planeta está sob o rato
  if (planetas.length > 0 && hasMouseMoved) {
    raycaster.setFromCamera(mouse, camera);
    const intersects = raycaster.intersectObjects(planetas, true);
    
    if (intersects.length > 0) {
      // Encontra qual planeta foi intersectado
      hoveredPlaneta = intersects[0].object;
      while (hoveredPlaneta && !planetas.includes(hoveredPlaneta)) {
        hoveredPlaneta = hoveredPlaneta.parent;
      }
    } else {
      hoveredPlaneta = null;
    }
  }

  // Atualizar o tooltip HTML se existir
  // Verificar se o menu está aberto
  const isMenuOpen = DOM.menuDropdown.classList.contains('active');
  
  // Verificar se algum modal está aberto - usando função helper
  const modals = Object.values(DOM.modals);
  const isAnyModalOpen = modals.some(m => m && m.classList.contains('active'));
  
  if (DOM.tooltip) {
    // Mostrar tooltip se:
    // Tiver planeta hovereado E o menu estiver fechado E nenhum modal aberto
    if (hoveredPlaneta && !isMenuOpen && !isAnyModalOpen) {
      const pos = toScreenPosition(hoveredPlaneta, camera);
      DOM.tooltip.style.display = 'block';
      DOM.tooltip.classList.add('visible');
      DOM.tooltip.style.left = `${pos.x}px`;
      DOM.tooltip.style.top = `${pos.y}px`;
      DOM.tooltip.textContent = planetNameMap[hoveredPlaneta.name] || hoveredPlaneta.name;
    } else {
      DOM.tooltip.classList.remove('visible');
      DOM.tooltipLine.style.display = 'none';
    }
  }
  
  // Manter câmara focada no planeta quando modal está ativo
  if (!isZooming && zoomTarget) {
    const isAnyModalActive = Object.values(DOM.modals).some(m => m && m.classList.contains('active'));
    
    if (isAnyModalActive) {
      // Manter câmara a seguir o planeta
      const targetPlanetaPos = new THREE.Vector3();
      zoomTarget.getWorldPosition(targetPlanetaPos);
      
      const cameraTarget = new THREE.Vector3();
      cameraTarget.copy(targetPlanetaPos);
      cameraTarget.z += 0.3;
      cameraTarget.y += 0.0;
      
      // Interpolação suave mantendo a câmara próxima ao planeta
      camera.position.x += (cameraTarget.x - camera.position.x) * CONFIG.CAMERA_FOLLOW_SPEED;
      camera.position.y += (cameraTarget.y - camera.position.y) * CONFIG.CAMERA_FOLLOW_SPEED;
      camera.position.z += (cameraTarget.z - camera.position.z) * CONFIG.CAMERA_FOLLOW_SPEED;
      
      // Fazer câmara olhar para o planeta
      camera.lookAt(targetPlanetaPos);
    }
  }
  
  renderer.render(scene, camera);
}

// Resize
window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

// Enviar email via EmailJS
// Aguarda o DOM estar pronto e EmailJS estar disponível
function initContactForm() {
  const contactForm = document.getElementById('contactForm');
  console.log('ContactForm found:', contactForm);
  console.log('EmailJS available:', typeof emailjs !== 'undefined');

  if (contactForm && typeof emailjs !== 'undefined') {
    contactForm.addEventListener('submit', function(event) {
      event.preventDefault();
      console.log('Form submitted!');
      
      const visitorEmail = document.getElementById('visitor_email').value;
      const subject = document.getElementById('subject').value;
      const message = document.getElementById('message').value;
      
      console.log('Form data:', { visitorEmail, subject, message });
      console.log('Sending email...');
      
      emailjs.send('service_4a0kqfj', 'template_v4tsvqo', {
        visitor_email: visitorEmail,
        subject: subject,
        message: message,
        to_email: 'kan_sk8r@hotmail.com'
      }).then(function(response) {
        console.log('✅ Email sent! Response:', response);
        alert('✅ Email sent successfully!');
        contactForm.reset();
      }, function(error) {
        console.log('❌ FAILED... Error:', error);
        alert('❌ Failed to send email. Please try again.\nError: ' + (error.text || error.message || JSON.stringify(error)));
      });
    });
  } else if (contactForm && typeof emailjs === 'undefined') {
    console.error('EmailJS not available yet. Retrying...');
    setTimeout(initContactForm, 100);
  } else {
    console.error('ContactForm element not found!');
  }
}

// Inicializa quando o DOM está pronto
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initContactForm);
} else {
  initContactForm();
}

// Animações

let musicList = [];
let currentTrackIndex = 0;
let isPlaying = false;

// Carregar lista de músicas da pasta musica
async function loadMusicList() {
  try {
    // Carrega o ficheiro playlist.json
    const response = await fetch('musica/playlist.json');
    
    if (response.ok) {
      const data = await response.json();
      musicList = data.playlist || [];
    }
  } catch (error) {
    // Erro silencioso - não carregar playlist
  }
}

// Variável para verificar se autoplay já foi iniciado
let autoplayAttempted = false;

// Inicializar player
async function initMusicPlayer() {
  await loadMusicList();
  
  if (musicList.length > 0) {
    // Começar com uma música aleatória
    currentTrackIndex = Math.floor(Math.random() * musicList.length);
    loadTrack(currentTrackIndex);
    
    // Tentar autoplay
    attemptAutoplay();
  } else {
    DOM.trackName.textContent = 'Nenhuma música encontrada na pasta musica/';
  }
}

// Função para tentar autoplay com fallback
function attemptAutoplay() {
  if (autoplayAttempted) return;
  
  setTimeout(() => {
    DOM.audio.play()
      .then(() => {
        autoplayAttempted = true;
        updatePlayPauseIcon();
      })
      .catch(err => {
        // Retry após 2 segundos
        setTimeout(() => {
          if (!autoplayAttempted) {
            DOM.audio.play()
              .then(() => {
                autoplayAttempted = true;
                updatePlayPauseIcon();
              })
              .catch(retryErr => {
                // Erro silencioso
              });
          }
        }, 2000);
      });
  }, 300);
}

// Se autoplay falhar, iniciar ao primeira interação do utilizador
function initAutoplayOnInteraction() {
  const startAutoplay = () => {
    if (!autoplayAttempted) {
      DOM.audio.play()
        .then(() => {
          autoplayAttempted = true;
          updatePlayPauseIcon();
        })
        .catch(err => {
          // Erro silencioso
        });
    }
    // Remove listeners após primeira interação
    document.removeEventListener('click', startAutoplay);
    document.removeEventListener('touchstart', startAutoplay);
  };
  
  // Esperar pela primeira interação
  document.addEventListener('click', startAutoplay);
  document.addEventListener('touchstart', startAutoplay);
}

// Carregar faixa
function loadTrack(index) {
  if (musicList.length === 0) return;
  
  currentTrackIndex = index % musicList.length;
  DOM.audio.src = musicList[currentTrackIndex];
  
  const trackNameDisplay = musicList[currentTrackIndex]
    .split('/')
    .pop()
    .replace(/\.[^/.]+$/, ''); // Remove extensão
  
  DOM.trackName.textContent = '' + trackNameDisplay;
  updatePlayPauseIcon();
}

// Play/Pause
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

// Próxima música
function playNext() {
  if (musicList.length === 0) return;
  
  currentTrackIndex = (currentTrackIndex + 1) % musicList.length;
  loadTrack(currentTrackIndex);
  
  if (isPlaying) {
    DOM.audio.play();
  }
}

// Atualizar ícone play/pause
function updatePlayPauseIcon() {
  if (DOM.audio.paused) {
    DOM.playPauseBtn.querySelector('.icon').textContent = '▶️';
    isPlaying = false;
  } else {
    DOM.playPauseBtn.querySelector('.icon').textContent = '⏸️';
    isPlaying = true;
  }
}

// Auto-play quando acaba a música
DOM.audio.addEventListener('ended', () => {
  playNext();
  setTimeout(() => DOM.audio.play(), 100);
});

// Fallback: tentar autoplay quando o áudio está pronto para tocar
DOM.audio.addEventListener('canplay', () => {
  if (!autoplayAttempted && DOM.audio.paused && musicList.length > 0) {
    DOM.audio.play()
      .then(() => {
        autoplayAttempted = true;
        updatePlayPauseIcon();
      })
      .catch(err => {
        // Erro silencioso
      });
  }
});
DOM.playPauseBtn.addEventListener('click', togglePlayPause);
DOM.nextBtn.addEventListener('click', playNext);

// Iniciar player quando o documento carrega
document.addEventListener('DOMContentLoaded', () => {
  initMusicPlayer();
  initAutoplayOnInteraction(); // Fallback para autoplay bloqueado
});

// Fallback adicional: tentar autoplay quando a página ganha foco
window.addEventListener('focus', () => {
  if (!autoplayAttempted && DOM.audio.paused && musicList.length > 0) {
    DOM.audio.play()
      .then(() => {
        autoplayAttempted = true;
        updatePlayPauseIcon();
      })
      .catch(err => {
        // Erro silencioso
      });
  }
});

// ============================================
// MENU HEADER
// ============================================

// Toggle menu ao clicar no botão
DOM.menuToggle.addEventListener('click', () => {
  // Marcar interação do utilizador
  hasUserInteracted = true;
  if (hintTimeout) clearTimeout(hintTimeout);
  if (DOM.pressHint) DOM.pressHint.classList.remove('show');
  
  DOM.menuDropdown.classList.toggle('active');
});

// Fechar menu ao clicar num item
document.querySelectorAll('.menu-item').forEach(item => {
  item.addEventListener('click', () => {
    DOM.menuDropdown.classList.remove('active');
  });
});

// Fechar menu ao clicar fora
document.addEventListener('click', (event) => {
  if (!event.target.closest('.header')) {
    DOM.menuDropdown.classList.remove('active');
  }
});

// ============================================
// PORTFOLIO MODAL
// ============================================

// Abrir portfolio ao clicar no link
DOM.links.portfolio.addEventListener('click', (event) => {
  event.preventDefault();
  
  // Encontrar o planeta "Cent"
  const centPlaneta = planetas.find(p => p.name === 'Cent');
  if (centPlaneta) {
    zoomToPlaneta(centPlaneta, DOM.modals.portfolio);
  } else {
    // Se não encontrar, apenas abrir o portfolio
    DOM.modals.portfolio.classList.add('active');
    DOM.menuDropdown.classList.remove('active');
  }
});

// Fechar portfolio ao clicar no botão X
DOM.closeButtons.portfolio.addEventListener('click', () => {
  DOM.modals.portfolio.classList.remove('active');
  resetCamera();
});

// ============================================
// DISASTERPIECE MODAL
// ============================================

// Abrir disasterpiece ao clicar no link
DOM.links.disasterpiece.addEventListener('click', (event) => {
  event.preventDefault();
  
  // Encontrar o planeta "fiz_1"
  const fiz1Planeta = planetas.find(p => p.name === 'fiz_1');
  if (fiz1Planeta) {
    zoomToPlaneta(fiz1Planeta, DOM.modals.disasterpiece);
  } else {
    // Se não encontrar, apenas abrir o modal
    DOM.modals.disasterpiece.classList.add('active');
    DOM.menuDropdown.classList.remove('active');
  }
});

// Fechar disasterpiece ao clicar no botão X
DOM.closeButtons.disasterpiece.addEventListener('click', () => {
  DOM.modals.disasterpiece.classList.remove('active');
  resetCamera();
});

// ============================================
// ABOUT MODAL
// ============================================

// Abrir about ao clicar no link
DOM.links.about.addEventListener('click', (event) => {
  event.preventDefault();
  
  // Encontrar o planeta "Uran_1"
  const uran1Planeta = planetas.find(p => p.name === 'Uran_1');
  if (uran1Planeta) {
    zoomToPlaneta(uran1Planeta, DOM.modals.about);
  } else {
    DOM.modals.about.classList.add('active');
    DOM.menuDropdown.classList.remove('active');
  }
});

// Fechar about ao clicar no botão X
DOM.closeButtons.about.addEventListener('click', () => {
  DOM.modals.about.classList.remove('active');
  resetCamera();
});

// ============================================
// CV MODAL
// ============================================

// Abrir CV ao clicar no link
DOM.links.cv.addEventListener('click', (event) => {
  event.preventDefault();
  
  // Encontrar o planeta "Fum"
  const fumPlaneta = planetas.find(p => p.name === 'Fum');
  if (fumPlaneta) {
    zoomToPlaneta(fumPlaneta, DOM.modals.cv);
  } else {
    DOM.modals.cv.classList.add('active');
    DOM.menuDropdown.classList.remove('active');
  }
});

// Fechar CV ao clicar no botão X
DOM.closeButtons.cv.addEventListener('click', () => {
  DOM.modals.cv.classList.remove('active');
  resetCamera();
});

// ============================================
// CONTACTS MODAL
// ============================================

// Abrir contacts ao clicar no link
DOM.links.contacts.addEventListener('click', (event) => {
  event.preventDefault();
  
  // Encontrar o planeta "Aros"
  const arosPlaneta = planetas.find(p => p.name === 'Aros');
  if (arosPlaneta) {
    zoomToPlaneta(arosPlaneta, DOM.modals.contacts);
  } else {
    DOM.modals.contacts.classList.add('active');
    DOM.menuDropdown.classList.remove('active');
  }
});

// Fechar contacts ao clicar no botão X
DOM.closeButtons.contacts.addEventListener('click', () => {
  DOM.modals.contacts.classList.remove('active');
  resetCamera();
});

// ============================================
// INTERESTS MODAL
// ============================================

// Abrir interests ao clicar no link
DOM.links.interests.addEventListener('click', (event) => {
  event.preventDefault();
  
  // Encontrar o planeta "Nept"
  const neptPlaneta = planetas.find(p => p.name === 'Nept');
  if (neptPlaneta) {
    zoomToPlaneta(neptPlaneta, DOM.modals.interests);
  } else {
    DOM.modals.interests.classList.add('active');
    DOM.menuDropdown.classList.remove('active');
  }
});

// Fechar interests ao clicar no botão X
DOM.closeButtons.interests.addEventListener('click', () => {
  DOM.modals.interests.classList.remove('active');
  resetCamera();
});

animate();
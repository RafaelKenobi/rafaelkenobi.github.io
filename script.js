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

// Variáveis para observação aleatória de planetas
let lastMouseMoveTime = Date.now();
let isObservingRandomPlaneta = false;
let randomPlanetaObserving = null;
let observationStartTime = 0;
let isInPauseMode = false; // Flag para indicar se está em pausa (olhando para câmera)
const MOUSE_IDLE_TIME = 3000; // 3 segundos
const OBSERVATION_DURATION = 4000; // 4 segundos observando planeta
const PAUSE_DURATION = 4000; // 4 segundos em pausa olhando para câmera

// Mapa de nomes visíveis para cada planeta
const planetNameMap = {
  Cent: 'Portfolio',
  fiz_1: 'Spaceship Game',
  Uran_1: 'About',
  Fum: 'CV',
  Aros: 'Contacts',
  Nept: 'My Interests'
};

// Tooltip HTML element (criado no index.html)
const tooltip = document.getElementById('planetaTooltip');
const tooltipLine = document.getElementById('tooltipLine');

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

// Desenha uma linha do planeta até à primeira letra do tooltip
function updateTooltipLine(planetPos, tooltipElement, lineElement) {
  if (!tooltipElement.offsetHeight) return; // Se o tooltip não tem altura, não desenhar
  
  // Posição do tooltip (já está em x, y)
  const tooltipX = parseFloat(tooltipElement.style.left);
  const tooltipY = parseFloat(tooltipElement.style.top);
  
  // A primeira letra está a 4px (padding) do início do tooltip
  const firstLetterX = tooltipX + 4;
  const firstLetterY = tooltipY;
  
  // Ponto de partida: planeta
  const startX = planetPos.x;
  const startY = planetPos.y;
  
  // Calcular a linha do planeta até à primeira letra
  const dx = firstLetterX - startX;
  const dy = firstLetterY - startY;
  const distance = Math.sqrt(dx * dx + dy * dy);
  const angle = Math.atan2(dy, dx) * (180 / Math.PI);
  
  // Atualizar a linha
  lineElement.style.display = 'block';
  lineElement.style.left = `${startX}px`;
  lineElement.style.top = `${startY}px`;
  lineElement.style.width = `${distance}px`;
  lineElement.style.transform = `rotate(${angle}deg)`;
}

// Listener do rato - movimento
document.addEventListener('mousemove', (event) => {
  mouse.x = (event.clientX / window.innerWidth) * 2 - 1;
  mouse.y = -(event.clientY / window.innerHeight) * 2 + 1;
  lastMouseMoveTime = Date.now(); // Reset do tempo de inatividade
  isObservingRandomPlaneta = false; // Interromper observação aleatória
  isInPauseMode = false; // Reset modo pausa
});

// Suporte a toque para mobile (atualiza as coordenadas como se fosse o rato)
document.addEventListener('touchmove', (event) => {
  if (event.touches && event.touches[0]) {
    const touch = event.touches[0];
    mouse.x = (touch.clientX / window.innerWidth) * 2 - 1;
    mouse.y = -(touch.clientY / window.innerHeight) * 2 + 1;
    lastMouseMoveTime = Date.now(); // Reset do tempo de inatividade
    isObservingRandomPlaneta = false; // Interromper observação aleatória
    isInPauseMode = false; // Reset modo pausa
  }
});

// opcional: também atualiza no touchstart para mostrar tooltip imediatamente
document.addEventListener('touchstart', (event) => {
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
  if (event.target.closest('.header') || event.target.closest('.music-player') || event.target.closest('.portfolio-modal') || event.target.closest('.spaceship-modal') || event.target.closest('.about-modal') || event.target.closest('.cv-modal') || event.target.closest('.contacts-modal') || event.target.closest('.interests-modal')) return;
  
  raycaster.setFromCamera(mouse, camera);
  const intersects = raycaster.intersectObjects(planetas, true);
  
  if (intersects.length > 0) {
    let clickedPlaneta = intersects[0].object;
    while (clickedPlaneta && !planetas.includes(clickedPlaneta)) {
      clickedPlaneta = clickedPlaneta.parent;
    }
    
    if (clickedPlaneta) {
      const portfolioModal = document.getElementById('portfolioModal');
      const spaceshipModal = document.getElementById('spaceshipModal');
      const aboutModal = document.getElementById('aboutModal');
      const cvModal = document.getElementById('cvModal');
      const contactsModal = document.getElementById('contactsModal');
      const interestsModal = document.getElementById('interestsModal');
      
      if (clickedPlaneta.name === 'Cent') {
        zoomToPlaneta(clickedPlaneta, portfolioModal);
      } else if (clickedPlaneta.name === 'fiz_1') {
        zoomToPlaneta(clickedPlaneta, spaceshipModal);
      } else if (clickedPlaneta.name === 'Uran_1') {
        zoomToPlaneta(clickedPlaneta, aboutModal);
      } else if (clickedPlaneta.name === 'Fum') {
        zoomToPlaneta(clickedPlaneta, cvModal);
      } else if (clickedPlaneta.name === 'Aros') {
        zoomToPlaneta(clickedPlaneta, contactsModal);
      } else if (clickedPlaneta.name === 'Nept') {
        zoomToPlaneta(clickedPlaneta, interestsModal);
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
  menuDropdown.classList.remove('active');
  
  const duration = 1000; // 1 segundo
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
  const duration = 800; // 0.8 segundos
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
      console.log('Neck encontrado!');
    }
    
    // Encontrar planetas
    const planetasNomes = ['Aros', 'Cent', 'fiz_1', 'Fum', 'Nept', 'Uran_1'];
    if (planetasNomes.includes(child.name)) {
      planetas.push(child);
      console.log('Planeta encontrado:', child.name);
    }
  });
  
  console.log('Total de planetas:', planetas.length);
  
  // Iniciar animações
  if (gltf.animations && gltf.animations.length > 0) {
    mixer = new THREE.AnimationMixer(model);
    gltf.animations.forEach((clip) => {
      mixer.clipAction(clip).play();
    });
    console.log('Animações iniciadas:', gltf.animations.length);
  }
  
  console.log('Modelo carregado!');
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
  if (planetas.length > 0) {
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
  const menuDropdown = document.getElementById('menuDropdown');
  const isMenuOpen = menuDropdown.classList.contains('active');
  
  // Verificar se algum modal está aberto
  const portfolioModal = document.getElementById('portfolioModal');
  const spaceshipModal = document.getElementById('spaceshipModal');
  const aboutModal = document.getElementById('aboutModal');
  const cvModal = document.getElementById('cvModal');
  const contactsModal = document.getElementById('contactsModal');
  const interestsModal = document.getElementById('interestsModal');
  
  const isAnyModalOpen = 
    portfolioModal.classList.contains('active') ||
    spaceshipModal.classList.contains('active') ||
    aboutModal.classList.contains('active') ||
    cvModal.classList.contains('active') ||
    contactsModal.classList.contains('active') ||
    interestsModal.classList.contains('active');
  
  // Se algum modal está aberto, cancelar observação aleatória
  if (isAnyModalOpen) {
    isObservingRandomPlaneta = false;
    isInPauseMode = false;
  }
  
  if (tooltip) {
    // Mostrar tooltip se:
    // 1. Tiver planeta hovereado E o menu estiver fechado E nenhum modal aberto
    // OU
    // 2. Estiver observando um planeta aleatório E não estiver em pausa
    if ((hoveredPlaneta && !isMenuOpen && !isAnyModalOpen) || (isObservingRandomPlaneta && randomPlanetaObserving && !isInPauseMode)) {
      const planetaToShow = isObservingRandomPlaneta ? randomPlanetaObserving : hoveredPlaneta;
      const pos = toScreenPosition(planetaToShow, camera);
      tooltip.style.display = 'block';
      tooltip.style.left = `${pos.x}px`;
      tooltip.style.top = `${pos.y}px`;
      tooltip.textContent = planetNameMap[planetaToShow.name] || planetaToShow.name;
      
      // Atualizar a linha - DESATIVADO
      // updateTooltipLine(pos, tooltip, tooltipLine);
    } else {
      tooltip.style.display = 'none';
      tooltipLine.style.display = 'none';
    }
  }
  
  // Verificar se o mouse está inactivo por 3 segundos
  const currentTime = Date.now();
  const timeSinceLastMove = currentTime - lastMouseMoveTime;
  
  if (timeSinceLastMove > MOUSE_IDLE_TIME && !isObservingRandomPlaneta && planetas.length > 0 && !isAnyModalOpen) {
    // Iniciar observação de um planeta aleatório
    isObservingRandomPlaneta = true;
    isInPauseMode = false;
    observationStartTime = currentTime;
    const randomIndex = Math.floor(Math.random() * planetas.length);
    randomPlanetaObserving = planetas[randomIndex];
  }
  
  // Se estiver observando um planeta aleatório, verificar ciclo de observação e pausa
  if (isObservingRandomPlaneta) {
    const elapsedTime = currentTime - observationStartTime;
    
    // Alternar entre observação e pausa a cada 4 segundos
    const cycleTime = elapsedTime % (OBSERVATION_DURATION + PAUSE_DURATION);
    
    if (cycleTime < OBSERVATION_DURATION) {
      // Fase de observação de planeta
      isInPauseMode = false;
    } else {
      // Fase de pausa (olhando para câmera)
      isInPauseMode = true;
    }
    
    // Se completou um ciclo completo (observação + pausa) e está entrando num novo ciclo de observação
    if (elapsedTime % (OBSERVATION_DURATION + PAUSE_DURATION) < 100) { // 100ms de margem para novo ciclo
      if (cycleTime < OBSERVATION_DURATION && isInPauseMode === false) {
        // Escolher novo planeta aleatório para próximo ciclo
        const randomIndex = Math.floor(Math.random() * planetas.length);
        randomPlanetaObserving = planetas[randomIndex];
      }
    }
  }
  
  // Fazer o Neck virar para o planeta ou seguir o rato
  if (neckBone) {
    let targetRotX = 0;
    let targetRotY = 0;
    
    // Se está observando um planeta aleatório E não está em pausa, olhar para esse
    if (isObservingRandomPlaneta && randomPlanetaObserving && !isInPauseMode) {
      const neckPos = neckBone.getWorldPosition(new THREE.Vector3());
      const planetaPos = planetasWorldPos[randomPlanetaObserving.name];
      
      if (planetaPos) {
        const direction = new THREE.Vector3();
        direction.subVectors(planetaPos, neckPos);
        
        const horizontalDistance = Math.sqrt(direction.x ** 2 + direction.z ** 2);
        targetRotY = Math.atan2(direction.x, direction.z);
        targetRotX = -Math.atan2(direction.y, horizontalDistance);
        
        const maxRot = 75 * Math.PI / 180;
        targetRotX = Math.max(-maxRot, Math.min(maxRot, targetRotX));
        targetRotY = Math.max(-maxRot, Math.min(maxRot, targetRotY));
      }
    } else if (hoveredPlaneta) {
      // Virar para o planeta usando a posição atualizada
      const neckPos = neckBone.getWorldPosition(new THREE.Vector3());
      const planetaPos = planetasWorldPos[hoveredPlaneta.name];
      
      const direction = new THREE.Vector3();
      direction.subVectors(planetaPos, neckPos);
      
      // Calcular rotações
      const horizontalDistance = Math.sqrt(direction.x ** 2 + direction.z ** 2);
      targetRotY = Math.atan2(direction.x, direction.z);
      targetRotX = -Math.atan2(direction.y, horizontalDistance); // Invertido para olhar para cima
      
      // Limitar a 150 graus (5π/6 radianos ~ 2.6, ou seja 75 graus em cada direção)
      const maxRot = 75 * Math.PI / 180; // 75 graus
      targetRotX = Math.max(-maxRot, Math.min(maxRot, targetRotX));
      targetRotY = Math.max(-maxRot, Math.min(maxRot, targetRotY));
    } else {
      // Seguir o rato quando não há planeta
      targetRotY = Math.max(-0.5, Math.min(0.5, mouse.x * 0.5));
      targetRotX = Math.max(-0.4, Math.min(0.4, -mouse.y * 0.4));
    }
    
    // Interpolação suave (lerp)
    neckBone.rotation.x += (targetRotX - neckBone.rotation.x) * 0.1;
    neckBone.rotation.y += (targetRotY - neckBone.rotation.y) * 0.1;
  }
  
  // Manter câmara focada no planeta quando modal está ativo
  if (!isZooming && zoomTarget) {
    const portfolioModal = document.getElementById('portfolioModal');
    const spaceshipModal = document.getElementById('spaceshipModal');
    const aboutModal = document.getElementById('aboutModal');
    const cvModal = document.getElementById('cvModal');
    const contactsModal = document.getElementById('contactsModal');
    const interestsModal = document.getElementById('interestsModal');
    
    const isAnyModalActive = 
      portfolioModal.classList.contains('active') ||
      spaceshipModal.classList.contains('active') ||
      aboutModal.classList.contains('active') ||
      cvModal.classList.contains('active') ||
      contactsModal.classList.contains('active') ||
      interestsModal.classList.contains('active');
    
    if (isAnyModalActive) {
      // Manter câmara a seguir o planeta
      const targetPlanetaPos = new THREE.Vector3();
      zoomTarget.getWorldPosition(targetPlanetaPos);
      
      const cameraTarget = new THREE.Vector3();
      cameraTarget.copy(targetPlanetaPos);
      cameraTarget.z += 0.3;
      cameraTarget.y += 0.0;
      
      // Interpolação suave mantendo a câmara próxima ao planeta
      camera.position.x += (cameraTarget.x - camera.position.x) * 0.05;
      camera.position.y += (cameraTarget.y - camera.position.y) * 0.05;
      camera.position.z += (cameraTarget.z - camera.position.z) * 0.05;
      
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

// ============================================
// PLAYER DE MÚSICA
// ============================================

const audio = document.getElementById('audioPlayer');
const playPauseBtn = document.getElementById('playPauseBtn');
const nextBtn = document.getElementById('nextBtn');
const trackName = document.getElementById('trackName');

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
      console.log('Playlist carregada:', musicList.length, 'músicas');
    } else {
      console.log('Ficheiro playlist.json não encontrado');
    }
  } catch (error) {
    console.log('Erro ao carregar playlist:', error);
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
    console.log('Player inicializado com:', musicList[currentTrackIndex]);
    
    // Tentar autoplay
    attemptAutoplay();
  } else {
    trackName.textContent = 'Nenhuma música encontrada na pasta musica/';
    console.log('Nenhuma música carregada');
  }
}

// Função para tentar autoplay com fallback
function attemptAutoplay() {
  if (autoplayAttempted) return;
  
  setTimeout(() => {
    audio.play()
      .then(() => {
        console.log('Autoplay iniciado com sucesso');
        autoplayAttempted = true;
        updatePlayPauseIcon();
      })
      .catch(err => {
        console.log('Autoplay bloqueado, aguardando interação do utilizador:', err);
        // Retry após 2 segundos
        setTimeout(() => {
          if (!autoplayAttempted) {
            audio.play()
              .then(() => {
                console.log('Autoplay iniciado no retry');
                autoplayAttempted = true;
                updatePlayPauseIcon();
              })
              .catch(retryErr => {
                console.log('Autoplay ainda bloqueado, aguardando interação');
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
      audio.play()
        .then(() => {
          console.log('Autoplay iniciado após interação do utilizador');
          autoplayAttempted = true;
          updatePlayPauseIcon();
        })
        .catch(err => {
          console.log('Erro ao iniciar autoplay:', err);
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
  audio.src = musicList[currentTrackIndex];
  
  const trackNameDisplay = musicList[currentTrackIndex]
    .split('/')
    .pop()
    .replace(/\.[^/.]+$/, ''); // Remove extensão
  
  trackName.textContent = '♫ ' + trackNameDisplay;
  updatePlayPauseIcon();
}

// Play/Pause
function togglePlayPause() {
  if (musicList.length === 0) return;
  
  if (audio.paused) {
    audio.play();
    isPlaying = true;
  } else {
    audio.pause();
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
    audio.play();
  }
}

// Atualizar ícone play/pause
function updatePlayPauseIcon() {
  if (audio.paused) {
    playPauseBtn.querySelector('.icon').textContent = '▶️';
    isPlaying = false;
  } else {
    playPauseBtn.querySelector('.icon').textContent = '⏸️';
    isPlaying = true;
  }
}

// Auto-play quando acaba a música
audio.addEventListener('ended', () => {
  playNext();
  setTimeout(() => audio.play(), 100);
});

// Fallback: tentar autoplay quando o áudio está pronto para tocar
audio.addEventListener('canplay', () => {
  if (!autoplayAttempted && audio.paused && musicList.length > 0) {
    audio.play()
      .then(() => {
        console.log('Autoplay iniciado ao áudio estar pronto');
        autoplayAttempted = true;
        updatePlayPauseIcon();
      })
      .catch(err => {
        console.log('Erro ao tentar autoplay no canplay');
      });
  }
});
playPauseBtn.addEventListener('click', togglePlayPause);
nextBtn.addEventListener('click', playNext);

// Iniciar player quando o documento carrega
document.addEventListener('DOMContentLoaded', () => {
  initMusicPlayer();
  initAutoplayOnInteraction(); // Fallback para autoplay bloqueado
});

// Fallback adicional: tentar autoplay quando a página ganha foco
window.addEventListener('focus', () => {
  if (!autoplayAttempted && audio.paused && musicList.length > 0) {
    audio.play()
      .then(() => {
        console.log('Autoplay iniciado ao ganhar foco');
        autoplayAttempted = true;
        updatePlayPauseIcon();
      })
      .catch(err => {
        console.log('Autoplay ainda não disponível ao ganhar foco');
      });
  }
});

// ============================================
// MENU HEADER
// ============================================

const menuToggle = document.getElementById('menuToggle');
const menuDropdown = document.getElementById('menuDropdown');

// Toggle menu ao clicar no botão
menuToggle.addEventListener('click', () => {
  menuDropdown.classList.toggle('active');
});

// Fechar menu ao clicar num item
document.querySelectorAll('.menu-item').forEach(item => {
  item.addEventListener('click', () => {
    menuDropdown.classList.remove('active');
  });
});

// Fechar menu ao clicar fora
document.addEventListener('click', (event) => {
  if (!event.target.closest('.header')) {
    menuDropdown.classList.remove('active');
  }
});

// ============================================
// PORTFOLIO MODAL
// ============================================

const portfolioModal = document.getElementById('portfolioModal');
const closePortfolioBtn = document.getElementById('closePortfolio');
const portfolioLink = document.querySelector('a[href="#portfolio"]');

// Abrir portfolio ao clicar no link
portfolioLink.addEventListener('click', (event) => {
  event.preventDefault();
  
  // Encontrar o planeta "Cent"
  const centPlaneta = planetas.find(p => p.name === 'Cent');
  if (centPlaneta) {
    zoomToPlaneta(centPlaneta, portfolioModal);
  } else {
    // Se não encontrar, apenas abrir o portfolio
    portfolioModal.classList.add('active');
    menuDropdown.classList.remove('active');
  }
});

// Fechar portfolio ao clicar no botão X
closePortfolioBtn.addEventListener('click', () => {
  portfolioModal.classList.remove('active');
  resetCamera();
});

// ============================================
// SPACESHIP GAME MODAL
// ============================================

const spaceshipModal = document.getElementById('spaceshipModal');
const closeSpaceshipBtn = document.getElementById('closeSpaceship');
const spaceshipLink = document.querySelector('a[href="#spaceship-game"]');

// Abrir spaceship game ao clicar no link
spaceshipLink.addEventListener('click', (event) => {
  event.preventDefault();
  
  // Encontrar o planeta "fiz_1"
  const fiz1Planeta = planetas.find(p => p.name === 'fiz_1');
  if (fiz1Planeta) {
    zoomToPlaneta(fiz1Planeta, spaceshipModal);
  } else {
    // Se não encontrar, apenas abrir o modal
    spaceshipModal.classList.add('active');
    menuDropdown.classList.remove('active');
  }
});

// Fechar spaceship game ao clicar no botão X
closeSpaceshipBtn.addEventListener('click', () => {
  spaceshipModal.classList.remove('active');
  resetCamera();
});

// ============================================
// ABOUT MODAL
// ============================================

const aboutModal = document.getElementById('aboutModal');
const closeAboutBtn = document.getElementById('closeAbout');
const aboutLink = document.querySelector('a[href="#about"]');

// Abrir about ao clicar no link
aboutLink.addEventListener('click', (event) => {
  event.preventDefault();
  
  // Encontrar o planeta "Uran_1"
  const uran1Planeta = planetas.find(p => p.name === 'Uran_1');
  if (uran1Planeta) {
    zoomToPlaneta(uran1Planeta, aboutModal);
  } else {
    aboutModal.classList.add('active');
    menuDropdown.classList.remove('active');
  }
});

// Fechar about ao clicar no botão X
closeAboutBtn.addEventListener('click', () => {
  aboutModal.classList.remove('active');
  resetCamera();
});

// ============================================
// CV MODAL
// ============================================

const cvModal = document.getElementById('cvModal');
const closeCVBtn = document.getElementById('closeCV');
const cvLink = document.querySelector('a[href="#cv"]');

// Abrir CV ao clicar no link
cvLink.addEventListener('click', (event) => {
  event.preventDefault();
  
  // Encontrar o planeta "Fum"
  const fumPlaneta = planetas.find(p => p.name === 'Fum');
  if (fumPlaneta) {
    zoomToPlaneta(fumPlaneta, cvModal);
  } else {
    cvModal.classList.add('active');
    menuDropdown.classList.remove('active');
  }
});

// Fechar CV ao clicar no botão X
closeCVBtn.addEventListener('click', () => {
  cvModal.classList.remove('active');
  resetCamera();
});

// ============================================
// CONTACTS MODAL
// ============================================

const contactsModal = document.getElementById('contactsModal');
const closeContactsBtn = document.getElementById('closeContacts');
const contactsLink = document.querySelector('a[href="#contacts"]');

// Abrir contacts ao clicar no link
contactsLink.addEventListener('click', (event) => {
  event.preventDefault();
  
  // Encontrar o planeta "Aros"
  const arosPlaneta = planetas.find(p => p.name === 'Aros');
  if (arosPlaneta) {
    zoomToPlaneta(arosPlaneta, contactsModal);
  } else {
    contactsModal.classList.add('active');
    menuDropdown.classList.remove('active');
  }
});

// Fechar contacts ao clicar no botão X
closeContactsBtn.addEventListener('click', () => {
  contactsModal.classList.remove('active');
  resetCamera();
});

// ============================================
// INTERESTS MODAL
// ============================================

const interestsModal = document.getElementById('interestsModal');
const closeInterestsBtn = document.getElementById('closeInterests');
const interestsLink = document.querySelector('a[href="#interests"]');

// Abrir interests ao clicar no link
interestsLink.addEventListener('click', (event) => {
  event.preventDefault();
  
  // Encontrar o planeta "Nept"
  const neptPlaneta = planetas.find(p => p.name === 'Nept');
  if (neptPlaneta) {
    zoomToPlaneta(neptPlaneta, interestsModal);
  } else {
    interestsModal.classList.add('active');
    menuDropdown.classList.remove('active');
  }
});

// Fechar interests ao clicar no botão X
closeInterestsBtn.addEventListener('click', () => {
  interestsModal.classList.remove('active');
  resetCamera();
});

animate();
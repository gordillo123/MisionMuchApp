// Validar ubicación antes de permitir jugar
(function() {
  // DESACTIVADO TEMPORALMENTE para permitir pruebas y juego remoto
  return;

  const raw = sessionStorage.getItem('much_last_location_verification');
  let valid = false;
  let msg = 'Para jugar necesitas estar en el Museo Chiapas y verificar tu ubicación.';
  if (raw) {
    try {
      const verif = JSON.parse(raw);
      const transcurrido = Date.now() - verif.timestamp;
      const vigenciaMs = 15 * 60 * 1000; // 15 minutos
      if (transcurrido <= vigenciaMs && verif.dentro_del_museo) {
        valid = true;
      } else if (transcurrido > vigenciaMs) {
        msg = 'La verificación de ubicación ha expirado. Por favor, verifícala de nuevo.';
      } else {
        msg = verif.mensaje_resultado || 'No te encuentras en el Museo Chiapas de Ciencia y Tecnología.';
      }
    } catch (e) {}
  }
  if (!valid) {
    alert(msg);
    window.location.href = '../index.html?reason=location_required&msg=' + encodeURIComponent(msg);
    throw new Error('Acceso denegado: ubicación no válida.');
  }
})();

/**
 * Sbeel Dinosaurios - Puzzle Script
 * Rompecabezas 3x3 con imagen aleatoria y arrastre por mouse/touch.
 */

document.addEventListener('DOMContentLoaded', () => {
    const puzzleBoard = document.getElementById('puzzle-board');
    const resetBtn = document.getElementById('reset-btn');
    const countdownEl = document.getElementById('countdown');
    const timerBox = document.getElementById('timer-box');
    const successModal = document.getElementById('success-modal');
    const successHeading = successModal ? successModal.querySelector('h2') : null;
    const successText = successModal ? successModal.querySelector('p') : null;
    const closeModalBtn = document.getElementById('close-modal');
    const backBtn = document.getElementById('btn-back');
    let successMessageHost = null;

    const size = 3;
    const TIME_LIMIT_SECONDS = 120;
    const COMPLETED_STATIONS_KEY = 'much_completed_stations';
    const STATION_ID = '6';
    const DRAG_START_THRESHOLD = 8;
    const PUZZLE_IMAGES = [
        {
            src: 'dino.png',
            label: 'Dinosaurio de Sbeel'
        },
        {
            src: 'sbeel-valle-dinosaurios.png',
            label: 'Valle de dinosaurios de Sbeel'
        },
        {
            src: 'sbeel-triceratops.png',
            label: 'Triceratops de Sbeel'
        },
        {
            src: 'sbeel-sauropodo.png',
            label: 'Sauropodo de Sbeel'
        }
    ];

    let pieces = [];
    let selectedPuzzleImage = PUZZLE_IMAGES[0];
    let pointerState = null;
    let currentDropTarget = null;
    let firstSelection = null;
    let timeRemaining = TIME_LIMIT_SECONDS;
    let timerInterval = null;
    let solvedOnTime = false;
    let completionQueued = false;
    let completionTimeout = null;

    function ensureBgMusic() {
        try {
            if (!window.bgMusic) {
                window.bgMusic = new Audio('../Sonidos/musica fondo.mp3');
                window.bgMusic.loop = true;
                window.bgMusic.volume = 0.18;
                window.bgMusic.preload = 'auto';
            }
        } catch (e) {}
    }

    function playBgMusic() {
        try {
            pauseBgMusic();
        } catch (e) {}
    }

    function pauseBgMusic() {
        try {
            if (window.bgMusic && !window.bgMusic.paused) {
                window.bgMusic.pause();
            }
        } catch (e) {}
    }

    async function inicializarSbeelProgreso() {
        try {
            const progreso = await import('../supabase-utils.js');
            const active = await progreso.comprobarEstacionActiva(6);
            if (!active) {
                alert('Esta estación se encuentra inactiva o cerrada.');
                window.location.href = '../index.html';
                return;
            }
            await progreso.inicializarProgresoUsuario(6);
            
            // Forzar el estado de la estación a Incompleta en localStorage y base de datos
            const completed = JSON.parse(localStorage.getItem(COMPLETED_STATIONS_KEY) || '{}');
            completed[STATION_ID] = false;
            localStorage.setItem(COMPLETED_STATIONS_KEY, JSON.stringify(completed));

            await progreso.guardarProgresoUsuario(STATION_ID, {
                puntaje: 0,
                aciertos: 0,
                errores: 1,
                aprobada: false
            });
            console.log('Progreso de SBEEL inicializado como Incompleto.');
        } catch (error) {
            console.error('Error al inicializar progreso de SBEEL:', error);
        }
    }

    async function initGame() {
        selectedPuzzleImage = selectRandomPuzzleImage();
        applyPuzzleImage(selectedPuzzleImage.src);
        preloadPuzzleImage(selectedPuzzleImage.src);
        createPieces();
        shufflePieces();
        renderBoard();
        resetTimer();
        startTimer();
        inicializarSbeelProgreso();
    }

    function selectRandomPuzzleImage() {
        const imageIndex = Math.floor(Math.random() * PUZZLE_IMAGES.length);
        return PUZZLE_IMAGES[imageIndex] || PUZZLE_IMAGES[0];
    }

    function applyPuzzleImage(src) {
        puzzleBoard.style.setProperty('--puzzle-image', `url("${src}")`);
    }

    function preloadPuzzleImage(src) {
        return new Promise(resolve => {
            const image = new Image();
            image.onload = () => resolve(true);
            image.onerror = () => {
                console.warn('No se pudo cargar la imagen del rompecabezas, se usara dino.png:', src);
                selectedPuzzleImage = PUZZLE_IMAGES[0];
                applyPuzzleImage(selectedPuzzleImage.src);
                resolve(false);
            };
            image.src = src;
        });
    }

    function createPieces() {
        pieces = [];
        for (let i = 0; i < size * size; i++) {
            pieces.push({
                id: i,
                currentPos: i,
                correctPos: i,
                locked: false
            });
        }
    }

    function shufflePieces() {
        completionQueued = false;
        puzzleBoard.classList.remove('is-complete');

        pieces.forEach(piece => {
            piece.currentPos = piece.correctPos;
            piece.locked = false;
        });

        for (let i = pieces.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [pieces[i].currentPos, pieces[j].currentPos] = [pieces[j].currentPos, pieces[i].currentPos];
        }

        if (checkWin()) {
            shufflePieces();
            return;
        }

        updateLockedPieces();
    }

    function renderBoard() {
        clearSelection();
        setDropTarget(null);
        puzzleBoard.innerHTML = '';

        const sortedPieces = [...pieces].sort((a, b) => a.currentPos - b.currentPos);

        sortedPieces.forEach(piece => {
            const pieceEl = document.createElement('div');
            pieceEl.classList.add('puzzle-piece');
            pieceEl.dataset.id = piece.id;
            pieceEl.draggable = false;
            pieceEl.tabIndex = piece.locked ? -1 : 0;
            pieceEl.setAttribute('role', 'button');
            pieceEl.setAttribute('aria-label', `${selectedPuzzleImage.label}, pieza ${piece.id + 1}`);
            pieceEl.setAttribute('aria-disabled', piece.locked ? 'true' : 'false');

            const row = Math.floor(piece.id / size);
            const col = piece.id % size;
            const posX = (col * 100) / (size - 1);
            const posY = (row * 100) / (size - 1);

            pieceEl.style.backgroundPosition = `${posX}% ${posY}%`;

            if (piece.locked) {
                pieceEl.classList.add('is-fixed');
            } else {
                pieceEl.addEventListener('pointerdown', handlePointerDown);
                pieceEl.addEventListener('keydown', handlePieceKeyDown);
            }

            puzzleBoard.appendChild(pieceEl);
        });
    }

    function handlePointerDown(e) {
        const pieceId = parseInt(this.dataset.id, 10);
        const piece = getPieceById(pieceId);

        if (!piece || piece.locked || timeRemaining <= 0 || successModal.classList.contains('show')) {
            return;
        }

        e.preventDefault();
        pointerState = {
            pieceEl: this,
            pieceId,
            pointerId: e.pointerId,
            startX: e.clientX,
            startY: e.clientY,
            dragging: false
        };

        this.classList.add('is-active');
        try { this.setPointerCapture(e.pointerId); } catch (error) {}
        this.addEventListener('pointermove', handlePointerMove);
        this.addEventListener('pointerup', handlePointerUp);
        this.addEventListener('pointercancel', handlePointerCancel);
    }

    function handlePointerMove(e) {
        if (!pointerState || e.pointerId !== pointerState.pointerId) {
            return;
        }

        const dx = e.clientX - pointerState.startX;
        const dy = e.clientY - pointerState.startY;
        const distance = Math.hypot(dx, dy);

        if (distance >= DRAG_START_THRESHOLD) {
            pointerState.dragging = true;
            clearSelection();
            pointerState.pieceEl.classList.add('dragging');
        }

        if (!pointerState.dragging) {
            return;
        }

        pointerState.pieceEl.style.transform = `translate3d(${dx}px, ${dy}px, 0) scale(1.06)`;
        setDropTarget(findPieceUnderPointer(e.clientX, e.clientY, pointerState.pieceEl));
    }

    function handlePointerUp(e) {
        if (!pointerState || e.pointerId !== pointerState.pointerId) {
            return;
        }

        e.preventDefault();
        const targetEl = currentDropTarget;
        const pieceEl = pointerState.pieceEl;
        const pieceId = pointerState.pieceId;
        const wasDragging = pointerState.dragging;

        cleanupPointerState();

        if (wasDragging && targetEl) {
            swapPieces(pieceId, parseInt(targetEl.dataset.id, 10));
            return;
        }

        handleTapSelection(pieceEl);
    }

    function handlePointerCancel(e) {
        if (!pointerState || e.pointerId !== pointerState.pointerId) {
            return;
        }

        cleanupPointerState();
    }

    function cleanupPointerState() {
        if (!pointerState) {
            return;
        }

        const { pieceEl, pointerId } = pointerState;
        try { pieceEl.releasePointerCapture(pointerId); } catch (error) {}
        pieceEl.style.transform = '';
        pieceEl.classList.remove('dragging', 'is-active');
        pieceEl.removeEventListener('pointermove', handlePointerMove);
        pieceEl.removeEventListener('pointerup', handlePointerUp);
        pieceEl.removeEventListener('pointercancel', handlePointerCancel);
        setDropTarget(null);
        pointerState = null;
    }

    function findPieceUnderPointer(x, y, sourceEl) {
        const previousPointerEvents = sourceEl.style.pointerEvents;
        sourceEl.style.pointerEvents = 'none';
        const elementUnderPointer = document.elementFromPoint(x, y);
        sourceEl.style.pointerEvents = previousPointerEvents;

        const targetEl = elementUnderPointer ? elementUnderPointer.closest('.puzzle-piece') : null;
        if (!targetEl || targetEl === sourceEl || targetEl.classList.contains('is-fixed')) {
            return null;
        }

        return targetEl;
    }

    function setDropTarget(targetEl) {
        if (currentDropTarget === targetEl) {
            return;
        }

        if (currentDropTarget) {
            currentDropTarget.classList.remove('over');
        }

        currentDropTarget = targetEl;

        if (currentDropTarget) {
            currentDropTarget.classList.add('over');
        }
    }

    function handleTapSelection(pieceEl) {
        const pieceId = parseInt(pieceEl.dataset.id, 10);
        const piece = getPieceById(pieceId);

        if (!piece || piece.locked) {
            return;
        }

        if (!firstSelection) {
            firstSelection = pieceEl;
            firstSelection.classList.add('is-selected');
            return;
        }

        if (firstSelection === pieceEl) {
            clearSelection();
            return;
        }

        const firstId = parseInt(firstSelection.dataset.id, 10);
        clearSelection();
        swapPieces(firstId, pieceId);
    }

    function handlePieceKeyDown(e) {
        if (e.key !== 'Enter' && e.key !== ' ') {
            return;
        }

        e.preventDefault();
        handleTapSelection(this);
    }

    function clearSelection() {
        if (firstSelection) {
            firstSelection.classList.remove('is-selected');
            firstSelection = null;
        }
    }

    function swapPieces(id1, id2) {
        if (id1 === id2) {
            return;
        }

        const piece1 = getPieceById(id1);
        const piece2 = getPieceById(id2);

        if (!piece1 || !piece2 || piece1.locked || piece2.locked) {
            return;
        }

        const tempPos = piece1.currentPos;
        piece1.currentPos = piece2.currentPos;
        piece2.currentPos = tempPos;

        updateLockedPieces();
        renderBoard();

        if (checkWin()) {
            completePuzzle();
        }
    }

    function completePuzzle() {
        if (completionQueued) {
            return;
        }

        completionQueued = true;
        stopTimer();
        clearSelection();
        setDropTarget(null);
        puzzleBoard.classList.add('is-complete');
        puzzleBoard.setAttribute('aria-label', `${selectedPuzzleImage.label} completado`);

        completionTimeout = setTimeout(() => {
            completionTimeout = null;
            showSuccess();
        }, 900);
    }

    function getPieceById(id) {
        return pieces.find(piece => piece.id === id);
    }

    function updateLockedPieces() {
        pieces.forEach(piece => {
            piece.locked = piece.currentPos === piece.correctPos;
        });
    }

    function checkWin() {
        return pieces.every(piece => piece.currentPos === piece.correctPos);
    }

    function playCompletionSound() {
        try {
            const audio = new Audio('../Sonidos/Estacion completada.mp3');
            audio.play().catch(e => console.warn('No se pudo reproducir audio de completado:', e));
        } catch (e) {
            console.warn('Error al reproducir audio:', e);
        }
    }

    function playIncorrectSound() {
        try {
            const audio = new Audio('../Sonidos/respuesta incorrecta.mp3');
            audio.play().catch(e => console.warn('No se pudo reproducir audio de incorrecto:', e));
        } catch (e) {
            console.warn('Error al reproducir audio:', e);
        }
    }

    function markStationCompleted() {
        try {
            const completed = JSON.parse(localStorage.getItem(COMPLETED_STATIONS_KEY) || '{}');
            completed[STATION_ID] = true;
            localStorage.setItem(COMPLETED_STATIONS_KEY, JSON.stringify(completed));
        } catch (e) {
            console.warn('No se pudo marcar la estación como completa:', e);
        }
    }

    async function guardarSbeelEnSupabase() {
        try {
            const progreso = await import('../supabase-utils.js');
            const finalScore = Math.max(0, timeRemaining);

            await progreso.guardarIntentoEstacion(STATION_ID, {
                aciertos: 1,
                errores: 0,
                puntaje: finalScore,
                aprobado: true
            });

            await progreso.guardarProgresoUsuario(STATION_ID, {
                puntaje: finalScore,
                aciertos: 1,
                errores: 0,
                aprobada: true
            });
        } catch (error) {
            console.error('[Supabase DB] No se pudo guardar SBEEL:', error);
        }
    }

    async function showSuccess() {
        stopTimer();
        const retryModalBtn = document.getElementById('retry-modal-btn');
        const modalContent = successModal ? successModal.querySelector('.modal-content') : null;

        if (timeRemaining > 0) {
            solvedOnTime = true;
            markStationCompleted();
            playCompletionSound();
            await guardarSbeelEnSupabase();
            if (successHeading) successHeading.style.display = 'none';
            if (successText) {
                if (!successMessageHost) {
                    successMessageHost = document.createElement('div');
                    successMessageHost.className = 'result-message';
                    successText.parentNode.insertBefore(successMessageHost, successText);
                }
                successText.style.display = 'none';
                closeModalBtn.style.display = 'none';
                if (retryModalBtn) retryModalBtn.style.display = 'none';

                if (modalContent) {
                    modalContent.classList.add('modal-content--success-card');
                }

                window.MuchStationCompletion?.renderInline(successMessageHost, {
                    stationId: '6',
                    isFinalStation: true,
                    onReturnToMap: () => {
                        window.location.href = '../index.html?view=prep';
                    }
                });
            }
        } else {
            if (modalContent) {
                modalContent.classList.remove('modal-content--success-card');
            }
            if (successMessageHost) {
                window.MuchStationCompletion?.clearInline(successMessageHost);
            }
            if (successHeading) {
                successHeading.style.display = '';
                successHeading.textContent = 'Sigue intentando';
            }
            if (successText) {
                successText.style.display = '';
                successText.textContent = 'Se acabo el tiempo. Mezcla las piezas y vuelve a intentarlo.';
            }
            closeModalBtn.style.display = '';
            if (retryModalBtn) retryModalBtn.style.display = '';
            closeModalBtn.textContent = 'Volver al mapa';
            playIncorrectSound();
        }
        successModal.classList.add('show');
        try { playBgMusic(); } catch (e) {}
    }

    resetBtn.addEventListener('click', () => {
        resetGame();
    });

    async function marcarIncompletoYSalir() {
        if (!solvedOnTime) {
            try {
                // Guardar en local
                const completed = JSON.parse(localStorage.getItem(COMPLETED_STATIONS_KEY) || '{}');
                delete completed[STATION_ID];
                localStorage.setItem(COMPLETED_STATIONS_KEY, JSON.stringify(completed));
                
                // Guardar en Supabase/BD
                const progreso = await import('../supabase-utils.js');
                await progreso.guardarProgresoUsuario(STATION_ID, {
                    puntaje: 0,
                    aciertos: 0,
                    errores: 1,
                    aprobada: false
                });
            } catch (e) {
                console.warn('Error al marcar Sbeel incompleto al salir:', e);
            }
        }
        window.location.href = '../index.html?view=prep';
    }

    closeModalBtn.addEventListener('click', () => {
        try {
            closeModalBtn.style.transform = 'translateY(2px)';
            closeModalBtn.style.opacity = '0.9';
            setTimeout(() => {
                closeModalBtn.style.transform = '';
                closeModalBtn.style.opacity = '';
            }, 160);
        } catch (e) {}
        setTimeout(() => { marcarIncompletoYSalir(); }, 180);
    });

    const retryModalBtn = document.getElementById('retry-modal-btn');
    if (retryModalBtn) {
        retryModalBtn.addEventListener('click', () => {
            successModal.classList.remove('show');
            resetGame();
        });
    }

    backBtn.addEventListener('click', () => {
        try {
            backBtn.style.transform = 'translateX(-6px)';
            backBtn.style.opacity = '0.9';
            setTimeout(() => {
                backBtn.style.transform = '';
                backBtn.style.opacity = '';
            }, 160);
        } catch (e) {}
        setTimeout(() => { marcarIncompletoYSalir(); }, 180);
    });

    function formatTime(seconds) {
        const min = String(Math.floor(seconds / 60)).padStart(2, '0');
        const sec = String(seconds % 60).padStart(2, '0');
        return `${min}:${sec}`;
    }

    function updateTimerDisplay() {
        countdownEl.textContent = formatTime(timeRemaining);
        timerBox.classList.toggle('time-end', timeRemaining <= 10);
    }

    function resetTimer() {
        stopTimer();
        timeRemaining = TIME_LIMIT_SECONDS;
        solvedOnTime = false;
        completionQueued = false;
        updateTimerDisplay();
    }

    function startTimer() {
        stopTimer();
        try { pauseBgMusic(); } catch (e) {}
        timerInterval = setInterval(() => {
            timeRemaining -= 1;
            updateTimerDisplay();

            if (timeRemaining <= 0) {
                stopTimer();
                timerBox.classList.add('time-end');
                setTimeout(() => {
                    window.MuchStationCompletion?.showFloatingNotice({
                        stationId: '6',
                        badge: 'Nuevo intento',
                        title: 'Sigue explorando, vas muy bien',
                        body: 'El tiempo se terminó esta vez, pero ya tienes otra oportunidad para completar el reto. Respira, observa con calma y vuelve a intentarlo.',
                        nextStationName: 'Nuevo intento',
                        detailLabel: 'Tu siguiente paso',
                        detailValue: 'Cierra este mensaje para volver a intentarlo',
                        onDismiss: () => {
                            resetGame();
                        }
                    });
                }, 100);
            }
        }, 1000);
    }

    function stopTimer() {
        if (timerInterval) {
            clearInterval(timerInterval);
            timerInterval = null;
        }
    }

    function resetGame() {
        if (completionTimeout) {
            clearTimeout(completionTimeout);
            completionTimeout = null;
        }
        puzzleBoard.classList.remove('is-complete');
        puzzleBoard.removeAttribute('aria-label');
        shufflePieces();
        renderBoard();
        resetTimer();
        startTimer();
    }

    initGame();
});

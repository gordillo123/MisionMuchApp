/**
 * Sbeel Dinosaurios - Puzzle Script
 * Lógica para un rompecabezas de 3x3 usando Drag and Drop.
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
    let successAutoNote = null;
    let successAutoTimer = null;
    let successAutoInterval = null;

    const size = 3; // 3x3
    const TIME_LIMIT_SECONDS = 120;
    const COMPLETED_STATIONS_KEY = 'much_completed_stations';
    const STATION_ID = '6';

    let pieces = [];
    let draggedPiece = null;
    let timeRemaining = TIME_LIMIT_SECONDS;
    let timerInterval = null;
    let solvedOnTime = false;

    // Background music helpers
    function ensureBgMusic() {
        try {
            if (!window.bgMusic) {
                window.bgMusic = new Audio('../Sonidos/musica fondo.mp3');
                window.bgMusic.loop = true; window.bgMusic.volume = 0.18; window.bgMusic.preload = 'auto';
            }
        } catch (e) { }
    }
    function playBgMusic() { try { ensureBgMusic(); window.bgMusic.play().catch(()=>{}); } catch (e) {} }
    function pauseBgMusic() { try { if (window.bgMusic && !window.bgMusic.paused) window.bgMusic.pause(); } catch (e) {} }

    /**
     * Inicializa el juego
     */
    function initGame() {
        createPieces();
        shufflePieces();
        renderBoard();
        resetTimer();
        startTimer();
    }

    /**
     * Crea los objetos de las piezas con sus posiciones correctas
     */
    function createPieces() {
        pieces = [];
        for (let i = 0; i < size * size; i++) {
            pieces.push({
                id: i,
                currentPos: i,
                correctPos: i
            });
        }
    }

    /**
     * Mezcla las piezas aleatoriamente
     */
    function shufflePieces() {
        // Algoritmo de Fisher-Yates para barajar
        for (let i = pieces.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [pieces[i].currentPos, pieces[j].currentPos] = [pieces[j].currentPos, pieces[i].currentPos];
        }
        
        // Verificar si por casualidad quedó resuelto y volver a barajar si es necesario
        if (checkWin()) {
            shufflePieces();
        }
    }

    /**
     * Dibuja las piezas en el tablero
     */
    function renderBoard() {
        puzzleBoard.innerHTML = '';
        
        // Ordenamos las piezas por su posición actual para renderizarlas en el grid
        const sortedPieces = [...pieces].sort((a, b) => a.currentPos - b.currentPos);

        sortedPieces.forEach(piece => {
            const pieceEl = document.createElement('div');
            pieceEl.classList.add('puzzle-piece');
            pieceEl.setAttribute('draggable', true);
            pieceEl.dataset.id = piece.id;

            // Calcular la posición del fondo (background-position)
            // La imagen se divide en 3x3, cada pieza es 33.33%
            const row = Math.floor(piece.id / size);
            const col = piece.id % size;
            const posX = (col * 100) / (size - 1);
            const posY = (row * 100) / (size - 1);
            
            pieceEl.style.backgroundPosition = `${posX}% ${posY}%`;

            // Eventos de Drag and Drop
            pieceEl.addEventListener('dragstart', handleDragStart);
            pieceEl.addEventListener('dragover', handleDragOver);
            pieceEl.addEventListener('dragenter', handleDragEnter);
            pieceEl.addEventListener('dragleave', handleDragLeave);
            pieceEl.addEventListener('drop', handleDrop);
            pieceEl.addEventListener('dragend', handleDragEnd);

            // Soporte para Touch (Móviles) básico mediante intercambio al hacer clic
            pieceEl.addEventListener('click', handleClick);

            puzzleBoard.appendChild(pieceEl);
        });
    }

    // --- Lógica de Drag and Drop ---

    function handleDragStart(e) {
        draggedPiece = this;
        this.classList.add('dragging');
        e.dataTransfer.effectAllowed = 'move';
        e.dataTransfer.setData('text/plain', this.dataset.id);
    }

    function handleDragOver(e) {
        e.preventDefault();
        return false;
    }

    function handleDragEnter(e) {
        this.classList.add('over');
    }

    function handleDragLeave(e) {
        this.classList.remove('over');
    }

    function handleDrop(e) {
        e.stopPropagation();
        e.preventDefault();

        if (draggedPiece !== this) {
            const draggedId = parseInt(draggedPiece.dataset.id);
            const targetId = parseInt(this.dataset.id);

            swapPieces(draggedId, targetId);
        }
        return false;
    }

    function handleDragEnd(e) {
        this.classList.remove('dragging');
        const items = document.querySelectorAll('.puzzle-piece');
        items.forEach(item => item.classList.remove('over'));
    }

    // --- Lógica de Intercambio ---

    let firstSelection = null;

    function handleClick() {
        if (!firstSelection) {
            firstSelection = this;
            this.style.outline = '4px solid var(--accent-color)';
        } else {
            if (firstSelection !== this) {
                const id1 = parseInt(firstSelection.dataset.id);
                const id2 = parseInt(this.dataset.id);
                swapPieces(id1, id2);
            }
            firstSelection.style.outline = 'none';
            firstSelection = null;
        }
    }

    function swapPieces(id1, id2) {
        const piece1 = pieces.find(p => p.id === id1);
        const piece2 = pieces.find(p => p.id === id2);

        const tempPos = piece1.currentPos;
        piece1.currentPos = piece2.currentPos;
        piece2.currentPos = tempPos;

        renderBoard();

        if (checkWin()) {
            setTimeout(showSuccess, 300);
        }
    }

    /**
     * Comprueba si todas las piezas están en su lugar
     */
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
            console.warn('No se pudo marcar estación completa:', e);
        }
    }

    async function guardarSbeelEnSupabase() {
        try {
            const progreso = await import('../supabase-utils.js');
            const elapsedSeconds = TIME_LIMIT_SECONDS - timeRemaining;

            await progreso.guardarIntentoEstacion(STATION_ID, {
                aciertos: 1,
                errores: 0,
                puntaje: Math.max(0, timeRemaining),
                aprobado: true
            });

            await progreso.guardarProgresoUsuario(STATION_ID, {
                metadata: {
                    estacion: 'sbeel',
                    tiempo_restante: timeRemaining,
                    segundos_usados: elapsedSeconds
                }
            });
        } catch (error) {
            console.error('[Supabase DB] No se pudo guardar SBEEL:', error);
        }
    }

    async function showSuccess() {
        stopTimer();
        if (successAutoTimer) {
            clearTimeout(successAutoTimer);
            successAutoTimer = null;
        }
        if (successAutoInterval) {
            clearInterval(successAutoInterval);
            successAutoInterval = null;
        }

        const retryModalBtn = document.getElementById('retry-modal-btn');
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
                const completionData = window.MuchStationCompletion?.renderInline(successMessageHost, {
                    stationId: '6',
                    isFinalStation: true,
                    badge: 'Estacion completada',
                    title: 'Sbeel Dinosaurios completada',
                    body: 'Completaste <strong>Sbeel Dinosaurios</strong>. Gracias por resolver el rompecabezas y demostrar tu mirada de explorador del pasado.',
                    detailLabel: 'Logro',
                    detailValue: 'Rompecabezas resuelto',
                    ctaLabel: 'Volver al mapa'
                });
                window.MuchStationCompletion?.queueMapNotice({
                    stationId: '6',
                    isFinalStation: true,
                    badge: 'Estacion completada',
                    title: 'Sbeel Dinosaurios completada',
                    body: 'Completaste <strong>Sbeel Dinosaurios</strong>. Gracias por resolver el rompecabezas y demostrar tu mirada de explorador del pasado.',
                    detailLabel: 'Logro',
                    detailValue: 'Rompecabezas resuelto',
                    ctaLabel: 'Volver al mapa'
                });
                closeModalBtn.style.display = 'none';
                if (retryModalBtn) retryModalBtn.style.display = 'none';
                if (!successAutoNote) {
                    successAutoNote = document.createElement('div');
                    successAutoNote.className = 'station-auto-note';
                    successMessageHost.parentNode.insertBefore(successAutoNote, closeModalBtn);
                }

                let remaining = 4;
                const updateLabel = () => {
                    successAutoNote.innerHTML = 'Volviendo al mapa en <strong>' + remaining + 's</strong>';
                };

                updateLabel();
                successAutoInterval = setInterval(() => {
                    remaining -= 1;
                    if (remaining <= 0) {
                        clearInterval(successAutoInterval);
                        successAutoInterval = null;
                        return;
                    }
                    updateLabel();
                }, 1000);

                successAutoTimer = setTimeout(() => {
                    window.location.href = '../index.html?view=prep';
                }, 4000);
            }
        } else {
            if (successMessageHost) {
                successMessageHost.innerHTML = '';
            }
            if (successAutoNote) {
                successAutoNote.remove();
                successAutoNote = null;
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

    // --- Event Listeners ---

    resetBtn.addEventListener('click', () => {
        shufflePieces();
        renderBoard();
        resetTimer();
        startTimer();
    });

    closeModalBtn.addEventListener('click', () => {
        try { closeModalBtn.style.transform = 'translateY(2px)'; closeModalBtn.style.opacity = '0.9'; setTimeout(() => { closeModalBtn.style.transform = ''; closeModalBtn.style.opacity = ''; }, 160); } catch (e) {}
        setTimeout(() => { window.location.href = '../index.html?view=prep'; }, 180);
    });

    const retryModalBtn = document.getElementById('retry-modal-btn');
    if (retryModalBtn) {
        retryModalBtn.addEventListener('click', () => {
            successModal.classList.remove('show');
            shufflePieces();
            renderBoard();
            resetTimer();
            startTimer();
        });
    }

    backBtn.addEventListener('click', () => {
        try { backBtn.style.transform = 'translateX(-6px)'; backBtn.style.opacity = '0.9'; setTimeout(() => { backBtn.style.transform = ''; backBtn.style.opacity = ''; }, 160); } catch (e) {}
        setTimeout(() => { window.location.href = '../index.html?view=prep'; }, 180);
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
                    alert('Se terminó el tiempo. El rompecabezas se reinicia para intentarlo de nuevo.');
                    resetGame();
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
        shufflePieces();
        renderBoard();
        resetTimer();
        startTimer();
    }

    // Iniciar
    initGame();
});

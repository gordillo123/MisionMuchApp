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
    const closeModalBtn = document.getElementById('close-modal');
    const backBtn = document.getElementById('btn-back');

    const size = 3; // 3x3
    const TIME_LIMIT_SECONDS = 120;
    const COMPLETED_STATIONS_KEY = 'much_completed_stations';
    const STATION_ID = '6';

    let pieces = [];
    let draggedPiece = null;
    let timeRemaining = TIME_LIMIT_SECONDS;
    let timerInterval = null;
    let solvedOnTime = false;

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

    function markStationCompleted() {
        try {
            const completed = JSON.parse(localStorage.getItem(COMPLETED_STATIONS_KEY) || '{}');
            completed[STATION_ID] = true;
            localStorage.setItem(COMPLETED_STATIONS_KEY, JSON.stringify(completed));
        } catch (e) {
            console.warn('No se pudo marcar estación completa:', e);
        }
    }

    function showSuccess() {
        stopTimer();
        if (timeRemaining > 0) {
            solvedOnTime = true;
            markStationCompleted();
        }
        successModal.classList.add('show');
    }

    // --- Event Listeners ---

    resetBtn.addEventListener('click', () => {
        shufflePieces();
        renderBoard();
        resetTimer();
        startTimer();
    });

    closeModalBtn.addEventListener('click', () => {
        successModal.classList.remove('show');
        shufflePieces();
        renderBoard();
        resetTimer();
        startTimer();
    });

    backBtn.addEventListener('click', () => {
        window.location.href = '../index.html?view=prep';
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

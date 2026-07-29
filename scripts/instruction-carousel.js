/**
 * InstructionCarousel
 * A modern, AAA-mobile-game-style onboarding carousel component.
 * Reusable across the app and all stations.
 */
class InstructionCarousel {
  /**
   * @param {Object} options
   * @param {HTMLElement|string} options.container - The parent element or selector to render the carousel into.
   * @param {Array<Object>} options.steps - Array of steps: [{ icon: string, title: string, description: string }]
   * @param {string} [options.accentColor] - Accent color (e.g. CSS variable like 'var(--msf-pink)' or hex)
   * @param {Function} [options.onClose] - Callback when the close [X] button is clicked.
   * @param {Function} [options.onFinish] - Callback when the finish "¡Entendido!" button is clicked.
   */
  constructor({ container, steps, accentColor, onClose, onFinish }) {
    this.container = typeof container === 'string' ? document.querySelector(container) : container;
    if (!this.container) {
      console.error('InstructionCarousel: Container element not found.');
      return;
    }
    this.steps = steps || [];
    this.accentColor = accentColor || 'var(--msf-purple)';
    this.onClose = onClose;
    this.onFinish = onFinish;

    this.currentIndex = 0;
    this.trackElement = null;
    this.dotsContainer = null;
    this.prevBtn = null;
    this.nextBtn = null;
    this.finishBtn = null;

    this.handleKeyDown = this.handleKeyDown.bind(this);

    this.init();
  }

  init() {
    this.render();
    this.bindEvents();
    this.updateUI();
  }

  render() {
    // Set custom accent color variable on the container style
    this.container.style.setProperty('--accent-color', this.accentColor);

    // Build the outer HTML skeleton
    this.container.innerHTML = `
      <div class="instruction-carousel">
        <button class="carousel-close-btn" type="button" aria-label="Cerrar instrucciones">&times;</button>
        
        <div class="carousel-slides-wrapper">
          <div class="carousel-slides-track">
            ${this.steps.map(step => this.createSlideMarkup(step)).join('')}
          </div>
        </div>

        <div class="carousel-footer">
          <div class="carousel-dots" role="tablist" aria-label="Progreso de instrucciones">
            ${this.steps.map((_, idx) => `
              <button class="carousel-dot" type="button" role="tab" aria-selected="${idx === 0}" aria-label="Paso ${idx + 1}" data-index="${idx}"></button>
            `).join('')}
          </div>

          <div class="carousel-nav-buttons">
            <button class="carousel-btn btn-prev" type="button">Anterior</button>
            <button class="carousel-btn btn-next" type="button">Siguiente</button>
            <button class="carousel-btn btn-finish" type="button">¡Entendido!</button>
          </div>
        </div>
      </div>
    `;

    // Cache elements
    this.trackElement = this.container.querySelector('.carousel-slides-track');
    this.dotsContainer = this.container.querySelector('.carousel-dots');
    this.prevBtn = this.container.querySelector('.btn-prev');
    this.nextBtn = this.container.querySelector('.btn-next');
    this.finishBtn = this.container.querySelector('.btn-finish');
  }

  createSlideMarkup(step) {
    // Support HTML entities in icon (e.g. &#128247;)
    const iconMarkup = step.icon.includes('&') || step.icon.includes(';') 
      ? step.icon 
      : step.icon;

    return `
      <div class="carousel-slide">
        <h2 class="carousel-slide-title">${step.title}</h2>
        <div class="carousel-slide-icon-container">
          <span class="carousel-slide-icon" aria-hidden="true">${iconMarkup}</span>
        </div>
        <p class="carousel-slide-text">${step.description || step.copy}</p>
      </div>
    `;
  }

  bindEvents() {
    // Close button
    this.container.querySelector('.carousel-close-btn').addEventListener('click', (e) => {
      e.stopPropagation();
      if (typeof this.onClose === 'function') {
        this.onClose();
      }
    });

    // Navigation buttons
    this.prevBtn.addEventListener('click', () => this.prev());
    this.nextBtn.addEventListener('click', () => this.next());
    
    this.finishBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      if (typeof this.onFinish === 'function') {
        this.onFinish();
      }
    });

    // Dots navigation clicking (optional feature, helpful)
    this.dotsContainer.addEventListener('click', (e) => {
      const dot = e.target.closest('.carousel-dot');
      if (dot) {
        const index = parseInt(dot.dataset.index, 10);
        this.goTo(index);
      }
    });

    // Keyboard support
    document.addEventListener('keydown', this.handleKeyDown);
  }

  unbindEvents() {
    document.removeEventListener('keydown', this.handleKeyDown);
  }

  handleKeyDown(e) {
    // Only handle keyboard if the carousel is visible/active
    if (this.container.offsetParent === null) return;

    if (e.key === 'ArrowRight') {
      if (this.currentIndex < this.steps.length - 1) {
        this.next();
      }
    } else if (e.key === 'ArrowLeft') {
      if (this.currentIndex > 0) {
        this.prev();
      }
    } else if (e.key === 'Escape') {
      if (typeof this.onClose === 'function') {
        this.onClose();
      }
    }
  }

  prev() {
    if (this.currentIndex > 0) {
      this.goTo(this.currentIndex - 1);
    }
  }

  next() {
    if (this.currentIndex < this.steps.length - 1) {
      this.goTo(this.currentIndex + 1);
    }
  }

  goTo(index) {
    this.currentIndex = index;
    this.updateUI();
  }

  updateUI() {
    // Translate the track horizontally
    if (this.trackElement) {
      this.trackElement.style.transform = `translateX(-${this.currentIndex * 100}%)`;
    }

    // Update progress dots active state
    const dots = this.dotsContainer.querySelectorAll('.carousel-dot');
    dots.forEach((dot, idx) => {
      if (idx === this.currentIndex) {
        dot.classList.add('active');
        dot.setAttribute('aria-selected', 'true');
      } else {
        dot.classList.remove('active');
        dot.setAttribute('aria-selected', 'false');
      }
    });

    // Handle Button Visibility
    const isFirst = this.currentIndex === 0;
    const isLast = this.currentIndex === this.steps.length - 1;

    // Previous Button (Anterior): Hide on first page, show otherwise
    this.prevBtn.style.display = isFirst ? 'none' : 'flex';

    // Next Button (Siguiente): Show on all pages except the last one
    this.nextBtn.style.display = isLast ? 'none' : 'flex';

    // Finish Button (¡Entendido!): Only show on the last page
    this.finishBtn.style.display = isLast ? 'flex' : 'none';
  }

  /**
   * Cleans up listeners when component is destroyed.
   */
  destroy() {
    this.unbindEvents();
    this.container.innerHTML = '';
  }
}

// Expose on window for easy script imports compatibility
window.InstructionCarousel = InstructionCarousel;

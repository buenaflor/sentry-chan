/**
 * Sentry-chan Content Script
 * Injects a floating, draggable mascot avatar on Sentry pages
 */

import { sentryChanStorage } from '@extension/storage';
import type { SentryChanStateType } from '@extension/storage';

// Constants
const SHADOW_ROOT_ID = 'sentry-chan-shadow-root';
const AVATAR_CONTAINER_ID = 'sentry-chan-container';
const SNAP_THRESHOLD = 24;
const ANIMATION_DURATION = 200;
const DEBOUNCE_DELAY = 150;

// Animation frame utilities
let animationFrame: number | null = null;
let dragAnimationFrame: number | null = null;

class SentryChanAvatar {
  private shadowRoot: ShadowRoot | null = null;
  private container: HTMLElement | null = null;
  private avatar: HTMLElement | null = null;
  private hideButton: HTMLElement | null = null;
  private restoreTab: HTMLElement | null = null;
  
  private isDragging = false;
  private dragOffset = { x: 0, y: 0 };
  private currentState: SentryChanStateType | null = null;
  
  private debounceTimer: NodeJS.Timeout | null = null;
  private unsubscribe: (() => void) | null = null;

  constructor() {
    this.initialize();
  }

  private async initialize(): Promise<void> {
    console.log('[Sentry-chan] Initializing floating mascot...');
    
    // Wait for DOM to be ready
    if (document.readyState === 'loading') {
      await new Promise(resolve => {
        document.addEventListener('DOMContentLoaded', resolve, { once: true });
      });
    }

    // Check if already initialized
    if (document.getElementById(SHADOW_ROOT_ID)) {
      console.log('[Sentry-chan] Already initialized');
      return;
    }

    try {
      // Get initial state from storage
      this.currentState = await sentryChanStorage.get();
      
      // Only initialize if enabled
      if (!this.currentState.enabled || !this.currentState.domainEnabled) {
        console.log('[Sentry-chan] Disabled by settings');
        return;
      }

      // Create shadow DOM and UI
      this.createShadowDOM();
      this.injectStyles();
      this.createAvatarUI();
      this.setupEventListeners();
      this.setupStorageListener();
      this.setupKeyboardShortcuts();
      
      // Update visibility based on state
      this.updateVisibility();
      
      console.log('[Sentry-chan] Successfully initialized');
    } catch (error) {
      console.error('[Sentry-chan] Failed to initialize:', error);
    }
  }

  private createShadowDOM(): void {
    // Create shadow root container
    const shadowContainer = document.createElement('div');
    shadowContainer.id = SHADOW_ROOT_ID;
    shadowContainer.style.cssText = `
      position: fixed !important;
      top: 0 !important;
      left: 0 !important;
      width: 100vw !important;
      height: 100vh !important;
      pointer-events: none !important;
      z-index: 2147483646 !important;
      overflow: hidden !important;
    `;
    
    // Create shadow root with closed mode for better encapsulation
    this.shadowRoot = shadowContainer.attachShadow({ mode: 'closed' });
    document.documentElement.appendChild(shadowContainer);
  }

  private injectStyles(): void {
    if (!this.shadowRoot) return;

    const styles = document.createElement('style');
    styles.textContent = `
      /* Reset styles */
      * {
        box-sizing: border-box;
        margin: 0;
        padding: 0;
      }
      
      /* Avatar container */
      #${AVATAR_CONTAINER_ID} {
        position: absolute;
        width: var(--avatar-size, 80px);
        height: var(--avatar-size, 80px);
        pointer-events: auto;
        user-select: none;
        cursor: pointer;
        transition: transform ${ANIMATION_DURATION}ms ease-out;
        will-change: transform;
        z-index: 1000;
      }
      
      #${AVATAR_CONTAINER_ID}:hover {
        transform: scale(1.05);
      }
      
      #${AVATAR_CONTAINER_ID}.dragging {
        transform: scale(1.1);
        transition: none;
        z-index: 1001;
      }
      
      /* Avatar image */
      .avatar-image {
        width: 100%;
        height: 100%;
        border-radius: 50%;
        background: linear-gradient(135deg, #362D59 0%, #8B5CF6 100%);
        box-shadow: 0 4px 20px rgba(0, 0, 0, 0.25);
        display: flex;
        align-items: center;
        justify-content: center;
        overflow: hidden;
        position: relative;
      }
      
      .avatar-image svg {
        width: 100%;
        height: 100%;
        border-radius: 50%;
      }
      
      /* Hover controls */
      .hover-controls {
        position: absolute;
        top: -8px;
        right: -8px;
        opacity: 0;
        transform: scale(0.8);
        transition: all 0.2s ease;
        pointer-events: none;
      }
      
      #${AVATAR_CONTAINER_ID}:hover .hover-controls {
        opacity: 1;
        transform: scale(1);
        pointer-events: auto;
      }
      
      .hide-button {
        width: 24px;
        height: 24px;
        border-radius: 50%;
        background: #ef4444;
        border: 2px solid white;
        display: flex;
        align-items: center;
        justify-content: center;
        cursor: pointer;
        box-shadow: 0 2px 8px rgba(0, 0, 0, 0.2);
        transition: all 0.2s ease;
      }
      
      .hide-button:hover {
        background: #dc2626;
        transform: scale(1.1);
      }
      
      .hide-button::before {
        content: '✕';
        color: white;
        font-size: 12px;
        font-weight: bold;
        line-height: 1;
      }
      
      /* Restore tab */
      .restore-tab {
        position: absolute;
        width: 32px;
        height: 12px;
        background: linear-gradient(135deg, #362D59 0%, #8B5CF6 100%);
        border-radius: 6px 6px 0 0;
        cursor: pointer;
        display: flex;
        align-items: center;
        justify-content: center;
        box-shadow: 0 2px 8px rgba(0, 0, 0, 0.2);
        transition: all 0.3s ease;
        pointer-events: auto;
        opacity: 0;
        transform: translateY(100%);
      }
      
      .restore-tab.visible {
        opacity: 1;
        transform: translateY(0);
      }
      
      .restore-tab:hover {
        transform: translateY(-2px);
        box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
      }
      
      .restore-tab::before {
        content: '◐';
        color: white;
        font-size: 8px;
        transform: rotate(90deg);
      }
      
      /* Animations */
      @keyframes blink {
        0%, 90%, 100% { opacity: 1; }
        95% { opacity: 0.3; }
      }
      
      @keyframes bounce {
        0%, 100% { transform: translateY(0); }
        50% { transform: translateY(-4px); }
      }
      
      @keyframes sip {
        0%, 100% { transform: rotate(0deg); }
        25% { transform: rotate(-2deg); }
        75% { transform: rotate(2deg); }
      }
      
      .avatar-image.animate-blink {
        animation: blink 4s infinite;
      }
      
      .avatar-image.animate-bounce {
        animation: bounce 2s infinite;
      }
      
      .avatar-image.animate-sip {
        animation: sip 1.5s infinite;
      }
      
      /* Hidden state */
      .hidden {
        opacity: 0 !important;
        pointer-events: none !important;
        transform: scale(0) !important;
      }
      
      /* Accessibility */
      @media (prefers-reduced-motion: reduce) {
        * {
          animation-duration: 0.01ms !important;
          animation-iteration-count: 1 !important;
          transition-duration: 0.01ms !important;
        }
      }
      
      /* Focus styles */
      .hide-button:focus,
      .restore-tab:focus {
        outline: 2px solid #8B5CF6;
        outline-offset: 2px;
      }
    `;
    
    this.shadowRoot.appendChild(styles);
  }

  private async createAvatarUI(): Promise<void> {
    if (!this.shadowRoot || !this.currentState) return;

    // Main container
    this.container = document.createElement('div');
    this.container.id = AVATAR_CONTAINER_ID;
    this.container.style.cssText = `
      left: ${this.currentState.position.x}px;
      top: ${this.currentState.position.y}px;
      --avatar-size: ${this.currentState.size}px;
    `;
    
    // Avatar image container
    const avatarImage = document.createElement('div');
    avatarImage.className = 'avatar-image';
    
    // Load SVG avatar
    try {
      const svgUrl = chrome.runtime.getURL('assets/sentry-chan-idle.svg');
      const response = await fetch(svgUrl);
      const svgText = await response.text();
      avatarImage.innerHTML = svgText;
    } catch (error) {
      console.warn('[Sentry-chan] Failed to load avatar SVG, using fallback');
      avatarImage.innerHTML = `
        <div style="width: 100%; height: 100%; background: linear-gradient(135deg, #362D59 0%, #8B5CF6 100%); border-radius: 50%; display: flex; align-items: center; justify-content: center; color: white; font-size: 24px;">
          🎭
        </div>
      `;
    }
    
    // Hover controls
    const hoverControls = document.createElement('div');
    hoverControls.className = 'hover-controls';
    
    this.hideButton = document.createElement('button');
    this.hideButton.className = 'hide-button';
    this.hideButton.setAttribute('aria-label', 'Hide Sentry-chan avatar');
    this.hideButton.setAttribute('title', 'Hide avatar (Ctrl+Shift+.)');
    
    hoverControls.appendChild(this.hideButton);
    
    // Restore tab (initially hidden)
    this.restoreTab = document.createElement('button');
    this.restoreTab.className = 'restore-tab';
    this.restoreTab.setAttribute('aria-label', 'Show Sentry-chan avatar');
    this.restoreTab.setAttribute('title', 'Show avatar (Ctrl+Shift+.)');
    
    // Assemble UI
    this.container.appendChild(avatarImage);
    this.container.appendChild(hoverControls);
    this.shadowRoot.appendChild(this.container);
    this.shadowRoot.appendChild(this.restoreTab);
    
    this.avatar = avatarImage;
    
    // Start idle animations if enabled
    this.updateAnimations();
  }

  private setupEventListeners(): void {
    if (!this.container || !this.hideButton || !this.restoreTab) return;

    // Hide button click
    this.hideButton.addEventListener('click', (e) => {
      e.stopPropagation();
      this.hideAvatar();
    });
    
    // Restore tab click
    this.restoreTab.addEventListener('click', (e) => {
      e.stopPropagation();
      this.showAvatar();
    });
    
    // Drag and drop
    this.container.addEventListener('mousedown', this.handleMouseDown.bind(this));
    this.container.addEventListener('touchstart', this.handleTouchStart.bind(this), { passive: false });
    
    // Global mouse events
    document.addEventListener('mousemove', this.handleMouseMove.bind(this));
    document.addEventListener('mouseup', this.handleMouseUp.bind(this));
    document.addEventListener('touchmove', this.handleTouchMove.bind(this), { passive: false });
    document.addEventListener('touchend', this.handleTouchEnd.bind(this));
    
    // Prevent context menu on avatar
    this.container.addEventListener('contextmenu', (e) => {
      e.preventDefault();
    });
  }

  private setupStorageListener(): void {
    // Listen for storage changes from other parts of the extension
    this.unsubscribe = sentryChanStorage.subscribe(async () => {
      const newState = await sentryChanStorage.get();
      if (newState) {
        this.currentState = newState;
        this.updateUI();
      }
    });
  }

  private setupKeyboardShortcuts(): void {
    // Listen for keyboard shortcuts
    document.addEventListener('keydown', (e) => {
      // Check for Ctrl+Shift+. (period)
      if (e.ctrlKey && e.shiftKey && e.code === 'Period') {
        // Don't trigger if user is typing in an input field
        const activeElement = document.activeElement;
        if (activeElement && (
          activeElement.tagName === 'INPUT' ||
          activeElement.tagName === 'TEXTAREA' ||
          activeElement.hasAttribute('contenteditable')
        )) {
          return;
        }
        
        e.preventDefault();
        this.toggleVisibility();
      }
    });
  }

  private handleMouseDown(e: MouseEvent): void {
    if (e.button !== 0) return; // Only left mouse button
    
    e.preventDefault();
    e.stopPropagation();
    
    this.startDrag(e.clientX, e.clientY);
  }

  private handleTouchStart(e: TouchEvent): void {
    if (e.touches.length !== 1) return;
    
    e.preventDefault();
    e.stopPropagation();
    
    const touch = e.touches[0];
    this.startDrag(touch.clientX, touch.clientY);
  }

  private startDrag(clientX: number, clientY: number): void {
    if (!this.container || !this.currentState) return;
    
    this.isDragging = true;
    this.container.classList.add('dragging');
    
    // Calculate drag offset
    const rect = this.container.getBoundingClientRect();
    this.dragOffset = {
      x: clientX - rect.left,
      y: clientY - rect.top,
    };
    
    // Update storage state
    sentryChanStorage.setDragging(true);
    
    // Disable text selection
    document.body.style.userSelect = 'none';
  }

  private handleMouseMove(e: MouseEvent): void {
    if (!this.isDragging) return;
    
    e.preventDefault();
    this.updateDragPosition(e.clientX, e.clientY);
  }

  private handleTouchMove(e: TouchEvent): void {
    if (!this.isDragging || e.touches.length !== 1) return;
    
    e.preventDefault();
    const touch = e.touches[0];
    this.updateDragPosition(touch.clientX, touch.clientY);
  }

  private updateDragPosition(clientX: number, clientY: number): void {
    if (!this.container || !this.isDragging) return;
    
    // Cancel previous animation frame
    if (dragAnimationFrame) {
      cancelAnimationFrame(dragAnimationFrame);
    }
    
    dragAnimationFrame = requestAnimationFrame(() => {
      if (!this.container) return;
      
      const x = clientX - this.dragOffset.x;
      const y = clientY - this.dragOffset.y;
      
      // Constrain to viewport
      const maxX = window.innerWidth - this.container.offsetWidth;
      const maxY = window.innerHeight - this.container.offsetHeight;
      
      const constrainedX = Math.max(0, Math.min(x, maxX));
      const constrainedY = Math.max(0, Math.min(y, maxY));
      
      // Update position with transform for better performance
      this.container.style.left = `${constrainedX}px`;
      this.container.style.top = `${constrainedY}px`;
    });
  }

  private handleMouseUp(e: MouseEvent): void {
    if (!this.isDragging) return;
    this.endDrag();
  }

  private handleTouchEnd(e: TouchEvent): void {
    if (!this.isDragging) return;
    this.endDrag();
  }

  private async endDrag(): Promise<void> {
    if (!this.isDragging || !this.container) return;
    
    this.isDragging = false;
    this.container.classList.remove('dragging');
    
    // Re-enable text selection
    document.body.style.userSelect = '';
    
    const rect = this.container.getBoundingClientRect();
    const x = rect.left;
    const y = rect.top;
    
    // Check for corner snapping
    const snapCorner = this.getSnapCorner(x, y);
    if (snapCorner && this.currentState) {
      await sentryChanStorage.snapToCorner(snapCorner, this.currentState.size);
    } else {
      // Update storage with current position
      await this.debouncedUpdatePosition(x, y);
    }
    
    // Update storage state
    await sentryChanStorage.setDragging(false);
  }

  private getSnapCorner(x: number, y: number): SentryChanStateType['corner'] | null {
    if (!this.currentState) return null;
    
    const threshold = SNAP_THRESHOLD;
    const windowWidth = window.innerWidth;
    const windowHeight = window.innerHeight;
    const avatarSize = this.currentState.size;
    
    // Check corners with proper avatar size
    if (x < threshold && y < threshold) return 'top-left';
    if (x > windowWidth - threshold - avatarSize && y < threshold) return 'top-right';
    if (x < threshold && y > windowHeight - threshold - avatarSize) return 'bottom-left';
    if (x > windowWidth - threshold - avatarSize && y > windowHeight - threshold - avatarSize) return 'bottom-right';
    
    return null;
  }

  private debouncedUpdatePosition(x: number, y: number): Promise<void> {
    return new Promise((resolve) => {
      if (this.debounceTimer) {
        clearTimeout(this.debounceTimer);
      }
      
      this.debounceTimer = setTimeout(async () => {
        await sentryChanStorage.updatePosition(x, y);
        resolve();
      }, DEBOUNCE_DELAY);
    });
  }

  private async toggleVisibility(): Promise<void> {
    if (!this.currentState) return;
    
    if (this.currentState.visible) {
      await this.hideAvatar();
    } else {
      await this.showAvatar();
    }
  }

  private async hideAvatar(): Promise<void> {
    if (!this.container || !this.restoreTab) return;
    
    // Animate hide
    this.container.classList.add('hidden');
    
    // Position restore tab at avatar location
    const rect = this.container.getBoundingClientRect();
    this.restoreTab.style.left = `${rect.left + rect.width / 2 - 16}px`;
    this.restoreTab.style.top = `${rect.bottom - 6}px`;
    
    // Show restore tab with delay
    setTimeout(() => {
      if (this.restoreTab) {
        this.restoreTab.classList.add('visible');
      }
    }, ANIMATION_DURATION);
    
    await sentryChanStorage.setVisibility(false);
  }

  private async showAvatar(): Promise<void> {
    if (!this.container || !this.restoreTab) return;
    
    // Hide restore tab
    this.restoreTab.classList.remove('visible');
    
    // Show avatar with delay
    setTimeout(() => {
      if (this.container) {
        this.container.classList.remove('hidden');
      }
    }, 100);
    
    await sentryChanStorage.setVisibility(true);
  }

  private updateVisibility(): void {
    if (!this.container || !this.restoreTab || !this.currentState) return;
    
    if (this.currentState.visible) {
      this.container.classList.remove('hidden');
      this.restoreTab.classList.remove('visible');
    } else {
      this.container.classList.add('hidden');
      // Position and show restore tab
      setTimeout(() => {
        if (this.restoreTab && this.container) {
          const rect = this.container.getBoundingClientRect();
          this.restoreTab.style.left = `${rect.left + rect.width / 2 - 16}px`;
          this.restoreTab.style.top = `${rect.bottom - 6}px`;
          this.restoreTab.classList.add('visible');
        }
      }, ANIMATION_DURATION);
    }
  }

  private updateAnimations(): void {
    if (!this.avatar || !this.currentState) return;
    
    // Remove existing animation classes
    this.avatar.classList.remove('animate-blink', 'animate-bounce', 'animate-sip');
    
    if (!this.currentState.enableAnimations) return;
    
    // Add appropriate animation class
    switch (this.currentState.animationState) {
      case 'blink':
        this.avatar.classList.add('animate-blink');
        break;
      case 'bounce':
        this.avatar.classList.add('animate-bounce');
        break;
      case 'sip':
        this.avatar.classList.add('animate-sip');
        break;
      default:
        // Random idle animation
        if (Math.random() < 0.3) {
          this.avatar.classList.add('animate-blink');
        }
        break;
    }
  }

  private updateUI(): void {
    if (!this.container || !this.currentState) return;
    
    // Update position
    this.container.style.left = `${this.currentState.position.x}px`;
    this.container.style.top = `${this.currentState.position.y}px`;
    
    // Update size
    this.container.style.setProperty('--avatar-size', `${this.currentState.size}px`);
    
    // Update visibility
    this.updateVisibility();
    
    // Update animations
    this.updateAnimations();
  }

  public destroy(): void {
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
    }
    
    if (animationFrame) {
      cancelAnimationFrame(animationFrame);
    }
    
    if (dragAnimationFrame) {
      cancelAnimationFrame(dragAnimationFrame);
    }
    
    if (this.unsubscribe) {
      this.unsubscribe();
    }
    
    const shadowContainer = document.getElementById(SHADOW_ROOT_ID);
    if (shadowContainer) {
      shadowContainer.remove();
    }
  }
}

// Initialize Sentry-chan when content script loads
let sentryChanInstance: SentryChanAvatar | null = null;

function initializeSentryChan() {
  if (!sentryChanInstance) {
    sentryChanInstance = new SentryChanAvatar();
  }
}

function destroySentryChan() {
  if (sentryChanInstance) {
    sentryChanInstance.destroy();
    sentryChanInstance = null;
  }
}

// Initialize when document is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initializeSentryChan, { once: true });
} else {
  initializeSentryChan();
}

// Handle page navigation for SPAs
let lastUrl = location.href;
const observer = new MutationObserver(() => {
  const currentUrl = location.href;
  if (currentUrl !== lastUrl) {
    lastUrl = currentUrl;
    // Reinitialize on navigation
    setTimeout(initializeSentryChan, 100);
  }
});

observer.observe(document, { subtree: true, childList: true });

// Clean up on page unload
window.addEventListener('beforeunload', destroySentryChan);

console.log('[Sentry-chan] Content script loaded and ready!');

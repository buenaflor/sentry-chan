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
const AVATAR_SCALE = 0.25; // Scale factor for the avatar (0.15 = 15% of natural size, giving ~154x230px)

// Animation frame utilities
const animationFrame: number | null = null;
let dragAnimationFrame: number | null = null;

// Chat bubble constants
const TYPEWRITER_SPEED = 40; // ms per character
const PUNCTUATION_PAUSE_LONG = 120; // ms for .?!
const PUNCTUATION_PAUSE_SHORT = 60; // ms for ,;
const BUBBLE_AUTO_DISMISS_DELAY = 3000; // ms after completion
const BUBBLE_FADE_DURATION = 200; // ms for fade animations

// Sample quips for the chat bubble
const CHAT_QUIPS = [
  'Hey there! 👋 Found any bugs today?',
  'Remember to add proper error handling! 🐛',
  'Your code looks great! Keep it up! ✨',
  "Don't forget to test edge cases! 🧪",
  'Time for a coffee break? ☕',
  'Debugging is like being a detective! 🔍',
  'Every error is a learning opportunity! 📚',
  "You're doing amazing work! 🌟",
  'Remember: readable code is maintainable code! 📖',
  'Stay hydrated while coding! 💧',
];

class SentryChanAvatar {
  private shadowRoot: ShadowRoot | null = null;
  private container: HTMLElement | null = null;
  private avatar: HTMLElement | null = null;
  private avatarImg: HTMLImageElement | null = null;
  private hideButton: HTMLElement | null = null;
  private restoreTab: HTMLElement | null = null;

  private isDragging = false;
  private dragOffset = { x: 0, y: 0 };
  private currentState: SentryChanStateType | null = null;
  private dragStartTime = 0;
  private dragStartPos = { x: 0, y: 0 };

  // Image caching for drag states
  private idleImage: HTMLImageElement | null = null;
  private grabImage: HTMLImageElement | null = null;

  private debounceTimer: NodeJS.Timeout | null = null;
  private unsubscribe: (() => void) | null = null;

  // Chat bubble properties
  private chatBubble: HTMLElement | null = null;
  private bubbleText: HTMLElement | null = null;
  private bubbleCloseButton: HTMLElement | null = null;
  private bubbleState: 'idle' | 'appearing' | 'typing' | 'complete' | 'dismissing' = 'idle';
  private typewriterTimer: NodeJS.Timeout | null = null;
  private dismissTimer: NodeJS.Timeout | null = null;
  private currentMessage = '';
  private currentCharIndex = 0;
  private bubbleActive = false;

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
      console.log('[Sentry-chan] Current state:', this.currentState);

      // Only initialize if enabled (temporarily bypassing for debugging)
      if (!this.currentState.enabled || !this.currentState.domainEnabled) {
        console.log(
          '[Sentry-chan] WARNING: Extension disabled but forcing initialization for debugging - enabled:',
          this.currentState.enabled,
          'domainEnabled:',
          this.currentState.domainEnabled,
        );
        // Don't return - continue with initialization for debugging
      }

      // Force visibility for debugging
      console.log('[Sentry-chan] Current visibility state:', this.currentState.visible);
      if (!this.currentState.visible) {
        console.log('[Sentry-chan] Forcing visibility to true for debugging');
        await sentryChanStorage.setVisibility(true);
        this.currentState = await sentryChanStorage.get();
      }

      // Create shadow DOM and UI
      this.createShadowDOM();
      this.injectStyles();
      await this.createAvatarUI();
      this.setupEventListeners();
      this.setupStorageListener();
      this.setupKeyboardShortcuts();

      // Update visibility based on state
      this.updateVisibility();

      console.log('[Sentry-chan] Successfully initialized with visibility:', this.currentState.visible);
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
        width: var(--avatar-width, var(--avatar-size, 80px));
        height: var(--avatar-height, var(--avatar-size, 80px));
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
        display: flex;
        align-items: center;
        justify-content: center;
        position: relative;
        background: transparent;
      }
      
      .avatar-image img {
        width: 100%;
        height: 100%;
        object-fit: contain;
        object-position: center;
        display: block;
        background: transparent;
      }
      
      .avatar-image svg {
        width: 100%;
        height: 100%;
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
      
      /* Chat bubble styles */
      .chat-bubble {
        position: absolute;
        max-width: 280px;
        min-width: 120px;
        padding: 12px 16px;
        background: #1f1f23;
        border: 1px solid #362d59;
        border-radius: 16px;
        color: #e1e5e9;
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
        font-size: 14px;
        line-height: 1.4;
        box-shadow: 0 8px 32px rgba(0, 0, 0, 0.3);
        pointer-events: auto;
        z-index: 1002;
        opacity: 0;
        transform: scale(0.8) translateY(10px);
        transition: all ${BUBBLE_FADE_DURATION}ms ease-out;
        word-wrap: break-word;
        hyphens: auto;
      }
      
      .chat-bubble.visible {
        opacity: 1;
        transform: scale(1) translateY(0);
      }
      
      .chat-bubble.dismissing {
        opacity: 0;
        transform: scale(0.8) translateY(-10px);
        transition: all ${BUBBLE_FADE_DURATION}ms ease-in;
      }
      
      /* Bubble arrow */
      .chat-bubble::before {
        content: '';
        position: absolute;
        width: 0;
        height: 0;
        border: 8px solid transparent;
      }
      
      /* Arrow positions */
      .chat-bubble.arrow-bottom::before {
        bottom: -16px;
        left: 20px;
        border-top-color: #1f1f23;
      }
      
      .chat-bubble.arrow-top::before {
        top: -16px;
        left: 20px;
        border-bottom-color: #1f1f23;
      }
      
      .chat-bubble.arrow-left::before {
        left: -16px;
        top: 20px;
        border-right-color: #1f1f23;
      }
      
      .chat-bubble.arrow-right::before {
        right: -16px;
        top: 20px;
        border-left-color: #1f1f23;
      }
      
      /* Bubble text */
      .bubble-text {
        margin: 0;
        position: relative;
      }
      
      /* Typewriter cursor */
      .bubble-text.typing::after {
        content: '|';
        animation: blink-cursor 1s infinite;
        margin-left: 1px;
      }
      
      @keyframes blink-cursor {
        0%, 50% { opacity: 1; }
        51%, 100% { opacity: 0; }
      }
      
      /* Close button */
      .bubble-close {
        position: absolute;
        top: -6px;
        right: -6px;
        width: 20px;
        height: 20px;
        border-radius: 50%;
        background: #ef4444;
        border: 1px solid #1f1f23;
        color: white;
        font-size: 12px;
        font-weight: bold;
        cursor: pointer;
        display: flex;
        align-items: center;
        justify-content: center;
        opacity: 0;
        transform: scale(0.8);
        transition: all 0.2s ease;
      }
      
      .chat-bubble:hover .bubble-close {
        opacity: 1;
        transform: scale(1);
      }
      
      .bubble-close:hover {
        background: #dc2626;
        transform: scale(1.1);
      }
      
      .bubble-close::before {
        content: '×';
        line-height: 1;
      }
      
      /* Bubble positioning classes */
      .bubble-position-top-left {
        bottom: calc(100% + 16px);
        left: 0;
      }
      
      .bubble-position-top-right {
        bottom: calc(100% + 16px);
        right: 0;
      }
      
      .bubble-position-bottom-left {
        top: calc(100% + 16px);
        left: 0;
      }
      
      .bubble-position-bottom-right {
        top: calc(100% + 16px);
        right: 0;
      }
      
      .bubble-position-left {
        right: calc(100% + 16px);
        top: 50%;
        transform: translateY(-50%);
      }
      
      .bubble-position-left.visible {
        transform: translateY(-50%) scale(1);
      }
      
      .bubble-position-right {
        left: calc(100% + 16px);
        top: 50%;
        transform: translateY(-50%);
      }
      
      .bubble-position-right.visible {
        transform: translateY(-50%) scale(1);
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

    // Preload both avatar images
    await this.preloadAvatarImages();

    // Load PNG avatar
    try {
      console.log('[Sentry-chan] Setting up avatar with idle image');

      // Create img element for PNG using preloaded image
      if (this.idleImage) {
        this.avatarImg = this.idleImage.cloneNode() as HTMLImageElement;
        this.avatarImg.alt = 'Sentry-chan Avatar';
        this.avatarImg.style.cssText = `
          width: 100%;
          height: 100%;
        `;

        // Update container to match image's natural dimensions
        if (this.container && this.currentState) {
          const scale = AVATAR_SCALE;
          const containerWidth = this.idleImage.naturalWidth * scale;
          const containerHeight = this.idleImage.naturalHeight * scale;

          this.container.style.width = `${containerWidth}px`;
          this.container.style.height = `${containerHeight}px`;

          // Update the CSS variable for consistency
          this.container.style.setProperty('--avatar-size', `${containerWidth}px`);

          // Ensure avatar is positioned within viewport bounds
          const windowWidth = window.innerWidth;
          const windowHeight = window.innerHeight;

          let newX = this.currentState.position.x;
          let newY = this.currentState.position.y;

          // Adjust position if avatar would be off-screen
          if (newX + containerWidth > windowWidth) {
            newX = Math.max(0, windowWidth - containerWidth - 20); // 20px padding
          }
          if (newY + containerHeight > windowHeight) {
            newY = Math.max(0, windowHeight - containerHeight - 20); // 20px padding
          }

          // Update position if needed
          if (newX !== this.currentState.position.x || newY !== this.currentState.position.y) {
            this.container.style.left = `${newX}px`;
            this.container.style.top = `${newY}px`;
            // Update storage with corrected position
            sentryChanStorage.updatePosition(newX, newY);
            console.log(`[Sentry-chan] Position adjusted to fit larger avatar: ${newX}, ${newY}`);
          }

          console.log(`[Sentry-chan] Container resized to natural proportions: ${containerWidth}x${containerHeight}px`);
        }

        avatarImage.appendChild(this.avatarImg);
        console.log('[Sentry-chan] Avatar setup complete');
      } else {
        throw new Error('Failed to preload idle image');
      }
    } catch (error) {
      console.warn('[Sentry-chan] Failed to load avatar PNG, using fallback:', error);
      avatarImage.innerHTML = `
          <div style="width: 100%; height: 100%; display: flex; align-items: center; justify-content: center; color: #8B5CF6; font-size: 24px;">
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

    // Create chat bubble
    this.createChatBubble();

    // Assemble UI
    this.container.appendChild(avatarImage);
    this.container.appendChild(hoverControls);
    if (this.chatBubble) {
      this.container.appendChild(this.chatBubble);
    }
    this.shadowRoot.appendChild(this.container);
    this.shadowRoot.appendChild(this.restoreTab);

    this.avatar = avatarImage;

    // Start idle animations if enabled
    this.updateAnimations();
  }

  private async preloadAvatarImages(): Promise<void> {
    console.log('[Sentry-chan] Preloading avatar images...');

    try {
      // Preload idle image
      const idleUrl = chrome.runtime.getURL('assets/sentry_chan_idle.png');
      this.idleImage = await this.loadImage(idleUrl);
      console.log('[Sentry-chan] Idle image preloaded');

      // Preload grab image
      const grabUrl = chrome.runtime.getURL('assets/sentry_chan_cursor_grab.png');
      this.grabImage = await this.loadImage(grabUrl);
      console.log('[Sentry-chan] Grab image preloaded');
    } catch (error) {
      console.error('[Sentry-chan] Failed to preload images:', error);
      throw error;
    }
  }

  private loadImage(url: string): Promise<HTMLImageElement> {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error(`Failed to load image: ${url}`));
      img.src = url;
      // Set timeout for loading
      setTimeout(() => reject(new Error(`Image load timeout: ${url}`)), 5000);
    });
  }

  private switchToGrabImage(): void {
    if (this.avatarImg && this.grabImage) {
      this.avatarImg.src = this.grabImage.src;
      console.log('[Sentry-chan] Switched to grab image');
    }
  }

  private switchToIdleImage(): void {
    if (this.avatarImg && this.idleImage) {
      this.avatarImg.src = this.idleImage.src;
      console.log('[Sentry-chan] Switched to idle image');
    }
  }

  private createChatBubble(): void {
    // Create bubble container
    this.chatBubble = document.createElement('div');
    this.chatBubble.className = 'chat-bubble';

    // Create text element
    this.bubbleText = document.createElement('p');
    this.bubbleText.className = 'bubble-text';

    // Create close button
    this.bubbleCloseButton = document.createElement('button');
    this.bubbleCloseButton.className = 'bubble-close';
    this.bubbleCloseButton.setAttribute('aria-label', 'Close chat bubble');
    this.bubbleCloseButton.setAttribute('title', 'Close');

    // Assemble bubble
    this.chatBubble.appendChild(this.bubbleText);
    this.chatBubble.appendChild(this.bubbleCloseButton);

    // Setup bubble event listeners
    this.setupBubbleEventListeners();
  }

  private setupBubbleEventListeners(): void {
    if (!this.chatBubble || !this.bubbleCloseButton) return;

    // Close button click
    this.bubbleCloseButton.addEventListener('click', e => {
      e.stopPropagation();
      this.dismissBubble();
    });

    // Bubble click during typing - skip to complete
    this.chatBubble.addEventListener('click', e => {
      if (this.bubbleState === 'typing') {
        e.stopPropagation();
        this.skipTypewriter();
      }
    });
  }

  private getBubblePosition(): { position: string; arrow: string } {
    if (!this.container) {
      return { position: 'bubble-position-top-left', arrow: 'arrow-bottom' };
    }

    const avatarRect = this.container.getBoundingClientRect();
    const windowWidth = window.innerWidth;
    const windowHeight = window.innerHeight;

    const bubbleWidth = 280; // max-width
    const bubbleHeight = 80; // estimated height
    const margin = 16;

    // Check available space in each direction
    const spaceTop = avatarRect.top;
    const spaceBottom = windowHeight - avatarRect.bottom;
    const spaceLeft = avatarRect.left;
    const spaceRight = windowWidth - avatarRect.right;

    // Prefer bottom-right, then try other positions
    if (spaceBottom >= bubbleHeight + margin && spaceRight >= bubbleWidth + margin) {
      return { position: 'bubble-position-bottom-right', arrow: 'arrow-top' };
    }

    if (spaceBottom >= bubbleHeight + margin && spaceLeft >= bubbleWidth + margin) {
      return { position: 'bubble-position-bottom-left', arrow: 'arrow-top' };
    }

    if (spaceTop >= bubbleHeight + margin && spaceRight >= bubbleWidth + margin) {
      return { position: 'bubble-position-top-right', arrow: 'arrow-bottom' };
    }

    if (spaceTop >= bubbleHeight + margin && spaceLeft >= bubbleWidth + margin) {
      return { position: 'bubble-position-top-left', arrow: 'arrow-bottom' };
    }

    if (spaceRight >= bubbleWidth + margin) {
      return { position: 'bubble-position-right', arrow: 'arrow-left' };
    }

    if (spaceLeft >= bubbleWidth + margin) {
      return { position: 'bubble-position-left', arrow: 'arrow-right' };
    }

    // Fallback to top-left if no good position found
    return { position: 'bubble-position-top-left', arrow: 'arrow-bottom' };
  }

  private showChatBubble(message: string): void {
    if (!this.chatBubble || !this.bubbleText || this.bubbleActive) {
      return; // Rate limiting - only one bubble at a time
    }

    console.log('[Sentry-chan] Showing chat bubble:', message);

    this.bubbleActive = true;
    this.bubbleState = 'appearing';
    this.currentMessage = message;
    this.currentCharIndex = 0;

    // Clear any existing timers
    this.clearBubbleTimers();

    // Position the bubble
    const { position, arrow } = this.getBubblePosition();

    // Reset classes
    this.chatBubble.className = `chat-bubble ${position} ${arrow}`;
    this.bubbleText.className = 'bubble-text';
    this.bubbleText.textContent = '';

    // Show bubble with fade-in
    requestAnimationFrame(() => {
      if (this.chatBubble) {
        this.chatBubble.classList.add('visible');
        this.bubbleState = 'typing';
        this.bubbleText?.classList.add('typing');
        this.startTypewriter();
      }
    });
  }

  private startTypewriter(): void {
    if (!this.bubbleText || this.bubbleState !== 'typing') return;

    const char = this.currentMessage[this.currentCharIndex];
    if (!char) {
      // Typing complete
      this.completeTypewriter();
      return;
    }

    // Add character to display
    this.bubbleText.textContent = this.currentMessage.substring(0, this.currentCharIndex + 1);
    this.currentCharIndex++;

    // Calculate delay for next character
    let delay = TYPEWRITER_SPEED;

    // Add pause for punctuation
    if (/[.?!]/.test(char)) {
      delay += PUNCTUATION_PAUSE_LONG;
    } else if (/[,;]/.test(char)) {
      delay += PUNCTUATION_PAUSE_SHORT;
    }

    // Schedule next character
    this.typewriterTimer = setTimeout(() => {
      this.startTypewriter();
    }, delay);
  }

  private skipTypewriter(): void {
    if (this.bubbleState !== 'typing' || !this.bubbleText) return;

    console.log('[Sentry-chan] Skipping typewriter animation');

    // Clear timer and show complete text immediately
    this.clearBubbleTimers();
    this.bubbleText.textContent = this.currentMessage;
    this.completeTypewriter();
  }

  private completeTypewriter(): void {
    if (!this.bubbleText) return;

    console.log('[Sentry-chan] Typewriter animation complete');

    this.bubbleState = 'complete';
    this.bubbleText.classList.remove('typing');

    // Start auto-dismiss timer
    this.dismissTimer = setTimeout(() => {
      this.dismissBubble();
    }, BUBBLE_AUTO_DISMISS_DELAY);
  }

  private dismissBubble(): void {
    if (!this.chatBubble || this.bubbleState === 'dismissing' || this.bubbleState === 'idle') {
      return;
    }

    console.log('[Sentry-chan] Dismissing chat bubble');

    this.bubbleState = 'dismissing';
    this.clearBubbleTimers();

    // Fade out
    this.chatBubble.classList.remove('visible');
    this.chatBubble.classList.add('dismissing');

    // Reset state after animation
    setTimeout(() => {
      this.bubbleState = 'idle';
      this.bubbleActive = false;
      this.currentMessage = '';
      this.currentCharIndex = 0;

      if (this.chatBubble) {
        this.chatBubble.classList.remove('dismissing');
      }
    }, BUBBLE_FADE_DURATION);
  }

  private clearBubbleTimers(): void {
    if (this.typewriterTimer) {
      clearTimeout(this.typewriterTimer);
      this.typewriterTimer = null;
    }

    if (this.dismissTimer) {
      clearTimeout(this.dismissTimer);
      this.dismissTimer = null;
    }
  }

  private getRandomQuip(): string {
    return CHAT_QUIPS[Math.floor(Math.random() * CHAT_QUIPS.length)];
  }

  private setupEventListeners(): void {
    if (!this.container || !this.hideButton || !this.restoreTab) return;

    // Hide button click
    this.hideButton.addEventListener('click', e => {
      e.stopPropagation();
      this.hideAvatar();
    });

    // Restore tab click
    this.restoreTab.addEventListener('click', e => {
      e.stopPropagation();
      this.showAvatar();
    });

    // Avatar click for chat bubble (before drag events)
    this.container.addEventListener('click', this.handleAvatarClick.bind(this));

    // Drag and drop
    this.container.addEventListener('mousedown', this.handleMouseDown.bind(this));
    this.container.addEventListener('touchstart', this.handleTouchStart.bind(this), { passive: false });

    // Global mouse events
    document.addEventListener('mousemove', this.handleMouseMove.bind(this));
    document.addEventListener('mouseup', this.handleMouseUp.bind(this));
    document.addEventListener('touchmove', this.handleTouchMove.bind(this), { passive: false });
    document.addEventListener('touchend', this.handleTouchEnd.bind(this));

    // Prevent context menu on avatar
    this.container.addEventListener('contextmenu', e => {
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
    document.addEventListener('keydown', e => {
      // Check for Ctrl+Shift+. (period)
      if (e.ctrlKey && e.shiftKey && e.code === 'Period') {
        // Don't trigger if user is typing in an input field
        const activeElement = document.activeElement;
        if (
          activeElement &&
          (activeElement.tagName === 'INPUT' ||
            activeElement.tagName === 'TEXTAREA' ||
            activeElement.hasAttribute('contenteditable'))
        ) {
          return;
        }

        e.preventDefault();
        this.toggleVisibility();
      }
    });
  }

  private handleAvatarClick(e: MouseEvent): void {
    // Only trigger chat bubble if it wasn't a drag operation
    if (this.isDragging || Date.now() - this.dragStartTime < 200) {
      return; // Was a drag or too close to drag end
    }

    e.stopPropagation();

    // Don't show bubble if clicking on hide button or during bubble interaction
    if (e.target === this.hideButton || this.bubbleActive) {
      return;
    }

    // Show random quip
    const message = this.getRandomQuip();
    this.showChatBubble(message);
  }

  private handleMouseDown(e: MouseEvent): void {
    if (e.button !== 0) return; // Only left mouse button

    e.preventDefault();
    e.stopPropagation();

    // Record drag start info for click detection
    this.dragStartTime = Date.now();
    this.dragStartPos = { x: e.clientX, y: e.clientY };

    this.startDrag(e.clientX, e.clientY);
  }

  private handleTouchStart(e: TouchEvent): void {
    if (e.touches.length !== 1) return;

    e.preventDefault();
    e.stopPropagation();

    const touch = e.touches[0];

    // Record drag start info for click detection
    this.dragStartTime = Date.now();
    this.dragStartPos = { x: touch.clientX, y: touch.clientY };

    this.startDrag(touch.clientX, touch.clientY);
  }

  private startDrag(clientX: number, clientY: number): void {
    if (!this.container || !this.currentState) return;

    // Calculate drag offset but don't mark as dragging yet
    const rect = this.container.getBoundingClientRect();
    this.dragOffset = {
      x: clientX - rect.left,
      y: clientY - rect.top,
    };

    // We'll mark as dragging in updateDragPosition if movement exceeds threshold
  }

  private beginActualDrag(): void {
    if (!this.container || this.isDragging) return;

    console.log('[Sentry-chan] Beginning actual drag operation');

    this.isDragging = true;
    this.container.classList.add('dragging');

    // Switch to grab image
    this.switchToGrabImage();

    // Update storage state
    sentryChanStorage.setDragging(true);

    // Disable text selection
    document.body.style.userSelect = 'none';
  }

  private handleMouseMove(e: MouseEvent): void {
    // Check if we should start dragging based on movement threshold
    if (!this.isDragging && this.dragStartTime > 0) {
      const distance = Math.sqrt(
        Math.pow(e.clientX - this.dragStartPos.x, 2) + Math.pow(e.clientY - this.dragStartPos.y, 2),
      );

      if (distance > 5) {
        // 5px threshold to distinguish click from drag
        this.beginActualDrag();
      }
    }

    if (!this.isDragging) return;

    e.preventDefault();
    this.updateDragPosition(e.clientX, e.clientY);
  }

  private handleTouchMove(e: TouchEvent): void {
    if (e.touches.length !== 1) return;

    const touch = e.touches[0];

    // Check if we should start dragging based on movement threshold
    if (!this.isDragging && this.dragStartTime > 0) {
      const distance = Math.sqrt(
        Math.pow(touch.clientX - this.dragStartPos.x, 2) + Math.pow(touch.clientY - this.dragStartPos.y, 2),
      );

      if (distance > 5) {
        // 5px threshold to distinguish tap from drag
        this.beginActualDrag();
      }
    }

    if (!this.isDragging) return;

    e.preventDefault();
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

  private handleMouseUp(): void {
    // Reset drag detection even if not actively dragging
    const wasDragging = this.isDragging;

    if (wasDragging) {
      this.endDrag();
    }

    // Reset drag detection state
    this.dragStartTime = 0;
    this.dragStartPos = { x: 0, y: 0 };
  }

  private handleTouchEnd(): void {
    // Reset drag detection even if not actively dragging
    const wasDragging = this.isDragging;

    if (wasDragging) {
      this.endDrag();
    }

    // Reset drag detection state
    this.dragStartTime = 0;
    this.dragStartPos = { x: 0, y: 0 };
  }

  private async endDrag(): Promise<void> {
    if (!this.isDragging || !this.container) return;

    this.isDragging = false;
    this.container.classList.remove('dragging');

    // Switch back to idle image
    this.switchToIdleImage();

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
    return new Promise(resolve => {
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
    if (!this.currentState) {
      console.log('[Sentry-chan] toggleVisibility: No current state');
      return;
    }

    console.log('[Sentry-chan] toggleVisibility: Current visible state:', this.currentState.visible);

    if (this.currentState.visible) {
      await this.hideAvatar();
    } else {
      await this.showAvatar();
    }
  }

  private async hideAvatar(): Promise<void> {
    if (!this.container || !this.restoreTab) return;

    // Dismiss any active chat bubble
    if (this.bubbleActive) {
      this.dismissBubble();
    }

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
    if (!this.container || !this.restoreTab || !this.currentState) {
      console.log('[Sentry-chan] updateVisibility: Missing elements or state');
      return;
    }

    console.log('[Sentry-chan] updateVisibility: Setting visibility to', this.currentState.visible);

    if (this.currentState.visible) {
      this.container.classList.remove('hidden');
      this.restoreTab.classList.remove('visible');
      console.log('[Sentry-chan] Avatar shown');
    } else {
      // Get position before hiding
      const rect = this.container.getBoundingClientRect();
      const restoreX = rect.left + rect.width / 2 - 16;
      const restoreY = rect.bottom - 6;

      this.container.classList.add('hidden');

      // Position and show restore tab
      setTimeout(() => {
        if (this.restoreTab) {
          this.restoreTab.style.left = `${restoreX}px`;
          this.restoreTab.style.top = `${restoreY}px`;
          this.restoreTab.classList.add('visible');
          console.log('[Sentry-chan] Avatar hidden, restore tab shown');
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
    if (!this.container || !this.currentState) {
      console.log('[Sentry-chan] updateUI: Missing container or state');
      return;
    }

    console.log('[Sentry-chan] updateUI: Updating with state:', {
      visible: this.currentState.visible,
      enabled: this.currentState.enabled,
      domainEnabled: this.currentState.domainEnabled,
      position: this.currentState.position,
      size: this.currentState.size,
    });

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

    // Clear chat bubble timers
    this.clearBubbleTimers();

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

const initializeSentryChan = () => {
  console.log('[Sentry-chan] initializeSentryChan called');
  if (!sentryChanInstance) {
    console.log('[Sentry-chan] Creating new avatar instance');
    sentryChanInstance = new SentryChanAvatar();
  } else {
    console.log('[Sentry-chan] Avatar instance already exists');
  }
};

const destroySentryChan = () => {
  if (sentryChanInstance) {
    sentryChanInstance.destroy();
    sentryChanInstance = null;
  }
};

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
console.log('[Sentry-chan] Current URL:', window.location.href);
console.log('[Sentry-chan] Document ready state:', document.readyState);

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
const EDGE_SNAP_THRESHOLD = 50; // Distance from edge to trigger edge snapping
const ANIMATION_DURATION = 200;
const DEBOUNCE_DELAY = 150;
// Avatar size is now dynamically controlled via storage settings

// Animation frame utilities
const animationFrame: number | null = null;
let dragAnimationFrame: number | null = null;

// Chat bubble constants
const TYPEWRITER_SPEED = 40; // ms per character
const PUNCTUATION_PAUSE_LONG = 120; // ms for .?!
const PUNCTUATION_PAUSE_SHORT = 60; // ms for ,;
const BUBBLE_AUTO_DISMISS_DELAY = 3000; // ms after completion
const BUBBLE_FADE_DURATION = 200; // ms for fade animations

// Speech animation constants
const SPEECH_ANIMATION_INTERVAL = 100; // ms between mouth open/close during speech

// Activity detection constants
const INACTIVITY_THRESHOLD = 10000; // ms before going sleepy
const SLEEPY_BLINK_MIN_INTERVAL = 2000; // ms minimum between blinks
const SLEEPY_BLINK_MAX_INTERVAL = 4000; // ms maximum between blinks
const SLEEPY_BLINK_DURATION = 300; // ms for eyes closed during blink
const SLEEPY_MESSAGE_MIN_INTERVAL = 15000; // ms minimum between sleepy voice lines
const SLEEPY_MESSAGE_MAX_INTERVAL = 30000; // ms maximum between sleepy voice lines

// Panicked state constants
const PANICKED_DURATION = 6000; // ms to stay in panicked state

// Celebrating state constants
const CELEBRATING_DURATION = 3000; // ms to stay in celebrating state

// DOM observation constants
const DOM_OBSERVATION_DEBOUNCE = 500; // ms to debounce DOM changes
const AUTO_BUBBLE_COOLDOWN = 10000; // ms cooldown between automatic bubbles

// Section detection constants
const SECTION_VISIBILITY_THRESHOLD = 0.5; // 50% of element must be visible
const SECTION_TRIGGER_DELAY = 1000; // ms delay before triggering section  message

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

// Sleepy state voice lines
const SLEEPY_QUIPS = [
  "Where is the dev, it's boring... 😴",
  'Is anyone even working on this code? *yawn* 🥱',
  "I guess I'll just take a little nap while waiting... 💤",
];

// Introduction messages for keyboard shortcuts
const INTRO_MESSAGES = {
  introduction:
    "I'm Sentry-chan, your new debugging companion. I'll be here with you while you explore Sentry and track down errors and bugs.",
  role: 'My main role is to guide you and help ease the stress of solving bugs—so you can stay focused and motivated.',
  encouragement: "Come on—let's take a look inside Sentry, and see how we can make debugging more enjoyable!",
};

// Contextual messages based on page content
const CONTEXTUAL_MESSAGES = {
  unhandledError: 'Oh no, this unhandled error looks serious! 😱',
  errorResolved: 'Yayy, bug resolved - good job!! 🎉',
  performance: 'Performance looks good! 📈',
  manyErrors: 'Lots of errors to investigate! 🕵️‍♀️',
  welcomeBack: "Welcome back! Let's get back to debugging! 💪",
  stackTrace: 'These stacktraces are useful for debugging! 🔍',
  breadcrumbs: 'Breadcrumbs help trace the user journey! 🍞',
  tags: 'Tags provide helpful context for errors! 🏷️',
  releases: 'Release tracking helps identify when issues started! 📦',
};

class SentryChanAvatar {
  private shadowRoot: ShadowRoot | null = null;
  private container: HTMLElement | null = null;
  private avatar: HTMLElement | null = null;
  private avatarImg: HTMLImageElement | null = null;
  private hideButton: HTMLElement | null = null;
  private restoreTab: HTMLElement | null = null;
  private leaningContainer: HTMLElement | null = null;

  private isDragging = false;
  private dragOffset = { x: 0, y: 0 };
  private currentState: SentryChanStateType | null = null;
  private dragStartTime = 0;
  private dragStartPos = { x: 0, y: 0 };

  // Image caching for drag states
  private idleMouthClosedImage: HTMLImageElement | null = null; // Default idle state
  private idleMouthOpenImage: HTMLImageElement | null = null; // For speech animation
  private grabImage: HTMLImageElement | null = null;

  // Sleepy state images
  private sleepyEyesOpenImage: HTMLImageElement | null = null; // Default sleepy state
  private sleepyEyesClosedImage: HTMLImageElement | null = null; // For blinking animation

  // Panicked state image
  private panickedImage: HTMLImageElement | null = null;

  // Celebrating state image
  private celebratingImage: HTMLImageElement | null = null;

  // Leaning over state image
  private leaningOverImage: HTMLImageElement | null = null;

  // Thinking state image
  private thinkingImage: HTMLImageElement | null = null;

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

  // Speech animation properties
  private speechAnimationTimer: NodeJS.Timeout | null = null;
  private isSpeechMouthOpen = false; // Default to mouth closed

  // Activity detection and sleepy state
  private lastActivityTime = Date.now();
  private inactivityTimer: NodeJS.Timeout | null = null;
  private sleepyBlinkTimer: NodeJS.Timeout | null = null;
  private sleepyMessageTimer: NodeJS.Timeout | null = null;
  private isSleepy = false;
  private isSleepyEyesClosed = false;

  // Panicked state
  private isPanicked = false;
  private panickedTimer: NodeJS.Timeout | null = null;

  // Celebrating state
  private isCelebrating = false;
  private celebratingTimer: NodeJS.Timeout | null = null;

  // Thinking state
  private isThinking = false;
  private thinkingTimer: NodeJS.Timeout | null = null;

  // DOM observation for automatic triggers
  private domObserver: MutationObserver | null = null;
  private domObservationTimer: NodeJS.Timeout | null = null;
  private lastAutoBubbleTime = 0;
  private lastUnhandledErrorCount = 0;

  // Section detection
  private intersectionObserver: IntersectionObserver | null = null;
  private observedSections = new Set<Element>();
  private lastTriggeredSection: string | null = null;
  private sectionTriggerTimer: NodeJS.Timeout | null = null;

  constructor() {
    this.initialize();
  }

  private async initialize(): Promise<void> {
    console.log('[Sentry-chan] Initializing debugging companion...');

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
      this.setupActivityDetection();
      this.setupDOMObservation();
      this.setupSectionDetection();
      this.setupResolveButtonDetection();
      this.setupJSONViewDetection();

      // Update visibility based on state
      this.updateVisibility();

      // If snap to edge is enabled, snap to nearest edge
      if (this.currentState.snapToEdge) {
        await this.snapToNearestEdge();
      }

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

      /* Leaning container styles */
      .leaning-container {
        position: fixed;
        z-index: 2147483647;
        opacity: 0;
        transform: translateY(20px);
        transition: all 0.3s ease;
        pointer-events: none;
      }

      .leaning-container.visible {
        opacity: 1;
        transform: translateY(0);
        pointer-events: auto;
      }

      .leaning-container:hover {
        transform: translateY(-5px);
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

    // Create leaning container now that images are loaded
    this.createLeaningContainer();

    // Load PNG avatar
    try {
      console.log('[Sentry-chan] Setting up avatar with idle image');

      // Create img element for PNG using preloaded image (default to mouth closed)
      if (this.idleMouthClosedImage) {
        this.avatarImg = this.idleMouthClosedImage.cloneNode() as HTMLImageElement;
        this.avatarImg.alt = 'Sentry-chan Avatar';
        this.avatarImg.style.cssText = `
          width: 100%;
          height: 100%;
        `;

        // Update container to match image's natural dimensions
        if (this.container && this.currentState) {
          // Use the actual size from storage instead of hardcoded scale
          const desiredSize = this.currentState.size;
          const aspectRatio = this.idleMouthClosedImage.naturalHeight / this.idleMouthClosedImage.naturalWidth;
          const containerWidth = desiredSize;
          const containerHeight = desiredSize * aspectRatio;

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
        throw new Error('Failed to preload idle mouth closed image');
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
    if (this.leaningContainer) {
      document.body.appendChild(this.leaningContainer);
    }

    this.avatar = avatarImage;

    // Start idle animations if enabled
    this.updateAnimations();
  }

  private async preloadAvatarImages(): Promise<void> {
    console.log('[Sentry-chan] Preloading avatar images...');

    try {
      // Preload idle mouth closed image (default idle state)
      const idleMouthClosedUrl = chrome.runtime.getURL('assets/sentry_chan_idle_mouth_closed.png');
      this.idleMouthClosedImage = await this.loadImage(idleMouthClosedUrl);
      console.log('[Sentry-chan] Idle mouth closed image preloaded');

      // Preload idle mouth open image (for speech animation)
      const idleMouthOpenUrl = chrome.runtime.getURL('assets/sentry_chan_idle_mouth_open.png');
      this.idleMouthOpenImage = await this.loadImage(idleMouthOpenUrl);
      console.log('[Sentry-chan] Idle mouth open image preloaded');

      // Preload grab image
      const grabUrl = chrome.runtime.getURL('assets/sentry_chan_cursor_grab.png');
      this.grabImage = await this.loadImage(grabUrl);
      console.log('[Sentry-chan] Grab image preloaded');

      // Preload sleepy blinking images
      const sleepyEyesOpenUrl = chrome.runtime.getURL('assets/sentry_chan_sleepy_holding_coffee_eyes_open.png');
      this.sleepyEyesOpenImage = await this.loadImage(sleepyEyesOpenUrl);
      console.log('[Sentry-chan] Sleepy eyes open image preloaded');

      const sleepyEyesClosedUrl = chrome.runtime.getURL('assets/sentry_chan_sleepy_holding_coffee_eyes_closed.png');
      this.sleepyEyesClosedImage = await this.loadImage(sleepyEyesClosedUrl);
      console.log('[Sentry-chan] Sleepy eyes closed image preloaded');

      // Preload panicked image
      const panickedUrl = chrome.runtime.getURL('assets/sentry_chan_panicked.png');
      this.panickedImage = await this.loadImage(panickedUrl);
      console.log('[Sentry-chan] Panicked image preloaded');

      // Preload celebrating image
      const celebratingUrl = chrome.runtime.getURL('assets/sentry_chan_celebrating.png');
      this.celebratingImage = await this.loadImage(celebratingUrl);
      console.log('[Sentry-chan] Celebrating image preloaded');

      // Preload leaning over image
      const leaningOverUrl = chrome.runtime.getURL('assets/sentry_chan_leaning_over.png');
      this.leaningOverImage = await this.loadImage(leaningOverUrl);
      console.log('[Sentry-chan] Leaning over image preloaded');

      // Preload thinking image
      const thinkingUrl = chrome.runtime.getURL('assets/sentry_chan_thinking.png');
      this.thinkingImage = await this.loadImage(thinkingUrl);
      console.log('[Sentry-chan] Thinking image preloaded');
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
    // Default idle state is mouth closed
    if (this.avatarImg && this.idleMouthClosedImage) {
      this.avatarImg.src = this.idleMouthClosedImage.src;
      console.log('[Sentry-chan] Switched to idle image (mouth closed)');
    }
  }

  private switchToIdleMouthOpenImage(): void {
    if (this.avatarImg && this.idleMouthOpenImage) {
      this.avatarImg.src = this.idleMouthOpenImage.src;
      console.log('[Sentry-chan] Switched to idle mouth open image');
    }
  }

  private switchToSleepyEyesOpenImage(): void {
    if (this.avatarImg && this.sleepyEyesOpenImage) {
      this.avatarImg.src = this.sleepyEyesOpenImage.src;
      console.log('[Sentry-chan] Switched to sleepy eyes open image');
    }
  }

  private switchToSleepyEyesClosedImage(): void {
    if (this.avatarImg && this.sleepyEyesClosedImage) {
      this.avatarImg.src = this.sleepyEyesClosedImage.src;
      console.log('[Sentry-chan] Switched to sleepy eyes closed image');
    }
  }

  private switchToPanickedImage(): void {
    if (this.avatarImg && this.panickedImage) {
      this.avatarImg.src = this.panickedImage.src;
      console.log('[Sentry-chan] Switched to panicked image');
    }
  }

  private switchToCelebratingImage(): void {
    if (this.avatarImg && this.celebratingImage) {
      this.avatarImg.src = this.celebratingImage.src;
      console.log('[Sentry-chan] Switched to celebrating image');
    }
  }

  private switchToThinkingImage(): void {
    if (this.avatarImg && this.thinkingImage) {
      this.avatarImg.src = this.thinkingImage.src;
      console.log('[Sentry-chan] Switched to thinking image');
    }
  }

  private startSpeechAnimation(): void {
    if (this.speechAnimationTimer) {
      return; // Already running
    }

    // Don't animate if panicked, celebrating, or thinking (but allow sleepy speech)
    if (this.isPanicked || this.isCelebrating || this.isThinking) {
      return;
    }

    console.log('[Sentry-chan] Starting speech animation');

    // Disable CSS animations that could interfere with speech animation
    if (this.avatar) {
      this.avatar.classList.remove('animate-blink', 'animate-bounce', 'animate-sip');
    }

    // Start with appropriate closed state based on current state
    this.isSpeechMouthOpen = false;
    if (this.isSleepy) {
      this.switchToSleepyEyesOpenImage(); // Use sleepy eyes open as default for sleepy speech
    } else {
      this.switchToIdleImage(); // Use idle mouth closed for normal speech
    }

    this.speechAnimationTimer = setInterval(() => {
      if (this.bubbleState !== 'typing') {
        // Stop animation if not typing anymore
        this.stopSpeechAnimation();
        return;
      }

      // Stop animation if state changed to panicked, celebrating, or thinking
      if (this.isPanicked || this.isCelebrating || this.isThinking) {
        this.stopSpeechAnimation();
        return;
      }

      // Alternate based on current state
      if (this.isSleepy) {
        // For sleepy state: alternate between eyes open and eyes closed
        if (this.isSpeechMouthOpen) {
          this.switchToSleepyEyesOpenImage(); // eyes open
        } else {
          this.switchToSleepyEyesClosedImage(); // eyes closed (like blinking while talking)
        }
      } else {
        // For idle state: alternate between mouth closed and mouth open
        if (this.isSpeechMouthOpen) {
          this.switchToIdleImage(); // mouth closed
        } else {
          this.switchToIdleMouthOpenImage(); // mouth open
        }
      }
      this.isSpeechMouthOpen = !this.isSpeechMouthOpen;
    }, SPEECH_ANIMATION_INTERVAL);
  }

  private stopSpeechAnimation(): void {
    if (this.speechAnimationTimer) {
      clearInterval(this.speechAnimationTimer);
      this.speechAnimationTimer = null;
      console.log('[Sentry-chan] Stopped speech animation');

      // Return to appropriate state when done talking
      if (this.isSleepy) {
        this.switchToSleepyEyesOpenImage(); // Return to sleepy eyes open
      } else if (!this.isPanicked && !this.isCelebrating && !this.isThinking) {
        this.switchToIdleImage(); // Return to idle mouth closed
      }

      // Re-enable idle animations after a short delay to avoid conflicts
      setTimeout(() => {
        if (!this.speechAnimationTimer && !this.bubbleActive) {
          this.updateAnimations();
        }
      }, 500);
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
      this.dismissBubble(true); // Manual dismissal
    });

    // Bubble click during typing - skip to complete
    this.chatBubble.addEventListener('click', e => {
      if (this.bubbleState === 'typing') {
        e.stopPropagation();
        this.skipTypewriter();
      }
    });
  }

  private createLeaningContainer(): void {
    if (!this.leaningOverImage) {
      return;
    }

    // Create leaning container
    this.leaningContainer = document.createElement('div');
    this.leaningContainer.className = 'leaning-container';

    // Create leaning image
    const leaningImg = this.leaningOverImage.cloneNode() as HTMLImageElement;
    leaningImg.alt = 'Sentry-chan leaning over';
    leaningImg.style.cssText = `
      width: 100%;
      height: 100%;
      cursor: pointer;
    `;

    this.leaningContainer.appendChild(leaningImg);

    // Position at bottom center
    this.positionLeaningContainer();

    // Add click handler to restore visibility
    this.leaningContainer.addEventListener('click', () => {
      this.showAvatar();
    });
  }

  private positionLeaningContainer(): void {
    if (!this.leaningContainer || !this.leaningOverImage) return;

    const windowWidth = window.innerWidth;
    const windowHeight = window.innerHeight;
    const scale = 0.105; // Scale factor for the leaning image
    const imageWidth = this.leaningOverImage.naturalWidth * scale;
    const imageHeight = this.leaningOverImage.naturalHeight * scale;

    // Position at bottom center
    const centerX = (windowWidth - imageWidth) / 2;
    const bottomY = windowHeight - imageHeight;

    this.leaningContainer.style.cssText = `
      position: fixed !important;
      left: ${centerX}px !important;
      top: ${bottomY}px !important;
      width: ${imageWidth}px !important;
      height: ${imageHeight}px !important;
      z-index: 2147483647 !important;
      opacity: 0 !important;
      transform: translateY(20px) !important;
      transition: all 0.3s ease !important;
      pointer-events: none !important;
    `;
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

    // Prefer top positions first when space is available, then fall back to bottom
    if (spaceTop >= bubbleHeight + margin && spaceRight >= bubbleWidth + margin) {
      return { position: 'bubble-position-top-right', arrow: 'arrow-bottom' };
    }

    if (spaceTop >= bubbleHeight + margin && spaceLeft >= bubbleWidth + margin) {
      return { position: 'bubble-position-top-left', arrow: 'arrow-bottom' };
    }

    if (spaceBottom >= bubbleHeight + margin && spaceRight >= bubbleWidth + margin) {
      return { position: 'bubble-position-bottom-right', arrow: 'arrow-top' };
    }

    if (spaceBottom >= bubbleHeight + margin && spaceLeft >= bubbleWidth + margin) {
      return { position: 'bubble-position-bottom-left', arrow: 'arrow-top' };
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

  private showChatBubble(message: string, recordActivity: boolean = true): void {
    if (!this.chatBubble || !this.bubbleText || this.bubbleActive) {
      return; // Rate limiting - only one bubble at a time
    }

    console.log('[Sentry-chan] Showing chat bubble:', message);

    // Record activity only if requested (don't wake up from automatic sleepy messages)
    if (recordActivity) {
      this.recordActivity();
    }

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
        this.startSpeechAnimation(); // Start speech animation when typing begins
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

    // Record activity
    this.recordActivity();

    // Clear timer and show complete text immediately
    this.clearBubbleTimers();
    this.bubbleText.textContent = this.currentMessage;
    this.stopSpeechAnimation(); // Stop speech animation when skipping
    this.completeTypewriter();
  }

  private completeTypewriter(): void {
    if (!this.bubbleText) return;

    console.log('[Sentry-chan] Typewriter animation complete');

    this.bubbleState = 'complete';
    this.bubbleText.classList.remove('typing');
    this.stopSpeechAnimation(); // Stop speech animation when typing is complete

    // Start auto-dismiss timer
    this.dismissTimer = setTimeout(() => {
      this.dismissBubble();
    }, BUBBLE_AUTO_DISMISS_DELAY);
  }

  private dismissBubble(isManualDismissal: boolean = false): void {
    if (!this.chatBubble || this.bubbleState === 'dismissing' || this.bubbleState === 'idle') {
      return;
    }

    console.log('[Sentry-chan] Dismissing chat bubble');

    // Record activity only if manually dismissed (don't wake up from automatic sleepy bubble dismissals)
    if (isManualDismissal) {
      this.recordActivity();
    }

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

    // Also stop speech animation
    this.stopSpeechAnimation();
  }

  private getRandomQuip(): string {
    return CHAT_QUIPS[Math.floor(Math.random() * CHAT_QUIPS.length)];
  }

  private getRandomSleepyQuip(): string {
    return SLEEPY_QUIPS[Math.floor(Math.random() * SLEEPY_QUIPS.length)];
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

    // Handle window resize to reposition leaning container
    window.addEventListener('resize', () => {
      if (this.leaningContainer && !this.currentState?.visible) {
        this.positionLeaningContainer();
      }
    });
  }

  private setupStorageListener(): void {
    // Listen for storage changes from other parts of the extension
    this.unsubscribe = sentryChanStorage.subscribe(async () => {
      const newState = await sentryChanStorage.get();
      if (newState) {
        const previousSnapToEdge = this.currentState?.snapToEdge;
        this.currentState = newState;

        // If snap to edge was just enabled, snap to nearest edge
        if (newState.snapToEdge && !previousSnapToEdge) {
          await this.snapToNearestEdge();
        }

        this.updateUI();
      }
    });
  }

  private setupKeyboardShortcuts(): void {
    // Listen for keyboard shortcuts
    document.addEventListener('keydown', e => {
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

      // Check for Ctrl+Shift combinations
      if (e.ctrlKey && e.shiftKey) {
        switch (e.code) {
          case 'Period': // Ctrl+Shift+. (period) - toggle visibility
            e.preventDefault();
            this.toggleVisibility();
            break;

          case 'KeyA': // Ctrl+Shift+A - introduction message
            e.preventDefault();
            this.recordActivity();
            this.showChatBubble(INTRO_MESSAGES.introduction);
            break;

          case 'KeyB': // Ctrl+Shift+B - role message
            e.preventDefault();
            this.recordActivity();
            this.showChatBubble(INTRO_MESSAGES.role);
            break;

          case 'KeyC': // Ctrl+Shift+C - encouragement message
            e.preventDefault();
            this.recordActivity();
            this.showChatBubble(INTRO_MESSAGES.encouragement);
            break;
        }
      }
    });
  }

  private setupActivityDetection(): void {
    // Track user activity for sleepy state
    const activityEvents = ['mousedown', 'mousemove', 'keydown', 'scroll', 'touchstart', 'click'];

    const handleActivity = () => {
      this.recordActivity();
    };

    // Add activity listeners to document
    activityEvents.forEach(event => {
      document.addEventListener(event, handleActivity, { passive: true });
    });

    // Add activity listeners to window for scroll events
    window.addEventListener('scroll', handleActivity, { passive: true });

    // Start inactivity monitoring
    this.startInactivityMonitoring();
  }

  private recordActivity(): void {
    const now = Date.now();
    this.lastActivityTime = now;

    // Wake up from sleepy state if active
    if (this.isSleepy) {
      this.wakeUpFromSleepy();
    }

    // Reset inactivity timer
    this.resetInactivityTimer();
  }

  private startInactivityMonitoring(): void {
    this.resetInactivityTimer();
  }

  private resetInactivityTimer(): void {
    if (this.inactivityTimer) {
      clearTimeout(this.inactivityTimer);
    }

    this.inactivityTimer = setTimeout(() => {
      this.enterSleepyState();
    }, INACTIVITY_THRESHOLD);
  }

  private enterSleepyState(): void {
    if (
      this.isSleepy ||
      this.isDragging ||
      this.bubbleActive ||
      this.isPanicked ||
      this.isCelebrating ||
      this.isThinking
    ) {
      return; // Don't go sleepy during interactions, when panicked, celebrating, or thinking
    }

    console.log('[Sentry-chan] Entering sleepy state - no activity detected');

    this.isSleepy = true;
    this.isSleepyEyesClosed = false;
    this.switchToSleepyEyesOpenImage(); // Default sleepy state is eyes open

    // Start random blinking cycle
    this.scheduleSleepyBlink();

    // Start random sleepy voice lines
    this.scheduleSleepyMessage();
  }

  private scheduleSleepyBlink(): void {
    if (!this.isSleepy) return;

    // Random interval between 2-4 seconds for natural blinking
    const randomInterval =
      SLEEPY_BLINK_MIN_INTERVAL + Math.random() * (SLEEPY_BLINK_MAX_INTERVAL - SLEEPY_BLINK_MIN_INTERVAL);

    this.sleepyBlinkTimer = setTimeout(() => {
      if (this.isSleepy && !this.isSleepyEyesClosed) {
        this.startSleepyBlink();
      }
    }, randomInterval);
  }

  private startSleepyBlink(): void {
    if (!this.isSleepy || this.isSleepyEyesClosed) return;

    console.log('[Sentry-chan] Blinking sleepy eyes');

    this.isSleepyEyesClosed = true;
    this.switchToSleepyEyesClosedImage();

    // Return to eyes open after blink duration
    setTimeout(() => {
      if (this.isSleepy) {
        this.isSleepyEyesClosed = false;
        this.switchToSleepyEyesOpenImage();

        // Schedule next blink
        this.scheduleSleepyBlink();
      }
    }, SLEEPY_BLINK_DURATION);
  }

  private scheduleSleepyMessage(): void {
    if (!this.isSleepy) return;

    // Random interval between 15-30 seconds for sleepy voice lines
    const randomInterval =
      SLEEPY_MESSAGE_MIN_INTERVAL + Math.random() * (SLEEPY_MESSAGE_MAX_INTERVAL - SLEEPY_MESSAGE_MIN_INTERVAL);

    this.sleepyMessageTimer = setTimeout(() => {
      if (this.isSleepy && !this.bubbleActive) {
        this.showSleepyMessage();
      }
    }, randomInterval);
  }

  private showSleepyMessage(): void {
    if (!this.isSleepy || this.bubbleActive) return;

    console.log('[Sentry-chan] Showing sleepy voice line');

    const sleepyMessage = this.getRandomSleepyQuip();
    this.showAutomaticBubble(sleepyMessage, false); // Don't wake up from sleepy messages

    // Schedule next sleepy message
    this.scheduleSleepyMessage();
  }

  private wakeUpFromSleepy(): void {
    if (!this.isSleepy) return;

    console.log('[Sentry-chan] Waking up from sleepy state');

    this.isSleepy = false;
    this.isSleepyEyesClosed = false;

    // Clear sleepy timers
    if (this.sleepyBlinkTimer) {
      clearTimeout(this.sleepyBlinkTimer);
      this.sleepyBlinkTimer = null;
    }

    if (this.sleepyMessageTimer) {
      clearTimeout(this.sleepyMessageTimer);
      this.sleepyMessageTimer = null;
    }

    // Return to idle image (unless panicked, celebrating, or thinking)
    if (!this.isPanicked && !this.isCelebrating && !this.isThinking) {
      this.switchToIdleImage();
    }

    // Show welcome back message if not already showing a bubble
    if (!this.bubbleActive && !this.isPanicked && !this.isCelebrating && !this.isThinking) {
      // Small delay to let the image switch complete
      setTimeout(() => {
        this.showAutomaticBubble(CONTEXTUAL_MESSAGES.welcomeBack);
      }, 200);
    }
  }

  private enterPanickedState(): void {
    if (this.isPanicked) {
      return; // Already panicked
    }

    console.log('[Sentry-chan] Entering panicked state due to unhandled error');

    // Clear any existing states
    this.wakeUpFromSleepy();

    this.isPanicked = true;
    this.switchToPanickedImage();

    // Clear any existing panicked timer
    if (this.panickedTimer) {
      clearTimeout(this.panickedTimer);
    }

    // Return to idle after 6 seconds
    this.panickedTimer = setTimeout(() => {
      this.exitPanickedState();
    }, PANICKED_DURATION);
  }

  private exitPanickedState(): void {
    if (!this.isPanicked) return;

    console.log('[Sentry-chan] Exiting panicked state');

    this.isPanicked = false;

    // Clear panicked timer
    if (this.panickedTimer) {
      clearTimeout(this.panickedTimer);
      this.panickedTimer = null;
    }

    // Return to idle image
    this.switchToIdleImage();
  }

  private enterCelebratingState(): void {
    if (this.isCelebrating) {
      return; // Already celebrating
    }

    console.log('[Sentry-chan] Entering celebrating state - bug resolved!');

    // Clear any existing states
    this.wakeUpFromSleepy();
    this.exitPanickedState();

    this.isCelebrating = true;
    this.switchToCelebratingImage();

    // Clear any existing celebrating timer
    if (this.celebratingTimer) {
      clearTimeout(this.celebratingTimer);
    }

    // Show celebration message
    this.showAutomaticBubble(CONTEXTUAL_MESSAGES.errorResolved);

    // Return to idle after 3 seconds
    this.celebratingTimer = setTimeout(() => {
      this.exitCelebratingState();
    }, CELEBRATING_DURATION);
  }

  private exitCelebratingState(): void {
    if (!this.isCelebrating) return;

    console.log('[Sentry-chan] Exiting celebrating state');

    this.isCelebrating = false;

    // Clear celebrating timer
    if (this.celebratingTimer) {
      clearTimeout(this.celebratingTimer);
      this.celebratingTimer = null;
    }

    // Return to idle image
    this.switchToIdleImage();
  }

  private enterThinkingState(): void {
    if (this.isThinking) {
      return; // Already thinking
    }

    console.log('[Sentry-chan] Entering thinking state - analyzing JSON');

    // Clear any existing states
    this.wakeUpFromSleepy();
    this.exitPanickedState();
    this.exitCelebratingState();

    this.isThinking = true;
    this.switchToThinkingImage();

    // Show thinking message
    this.showAutomaticBubble('Whoa, this JSON looks way too complicated');

    // Clear any existing thinking timer
    if (this.thinkingTimer) {
      clearTimeout(this.thinkingTimer);
    }

    // Return to idle after 5 seconds
    this.thinkingTimer = setTimeout(() => {
      this.exitThinkingState();
    }, 5000);
  }

  private exitThinkingState(): void {
    if (!this.isThinking) return;

    console.log('[Sentry-chan] Exiting thinking state');

    this.isThinking = false;

    // Clear thinking timer
    if (this.thinkingTimer) {
      clearTimeout(this.thinkingTimer);
      this.thinkingTimer = null;
    }

    // Return to idle image
    this.switchToIdleImage();
  }

  private setupDOMObservation(): void {
    // Create observer to watch for page content changes
    this.domObserver = new MutationObserver(() => {
      this.debouncedPageAnalysis();
    });

    // Start observing the document body for changes
    this.domObserver.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['class', 'data-sentry-element'],
    });

    // Do initial page analysis
    this.debouncedPageAnalysis();
  }

  private debouncedPageAnalysis(): void {
    if (this.domObservationTimer) {
      clearTimeout(this.domObservationTimer);
    }

    this.domObservationTimer = setTimeout(() => {
      this.analyzePageContent();
      this.observeSections(); // Re-scan for new sections after DOM changes
    }, DOM_OBSERVATION_DEBOUNCE);
  }

  private analyzePageContent(): void {
    if (!this.currentState?.visible || this.bubbleActive) {
      return; // Don't analyze if avatar is hidden or bubble is active
    }

    // Check cooldown for automatic bubbles
    const now = Date.now();
    if (now - this.lastAutoBubbleTime < AUTO_BUBBLE_COOLDOWN) {
      return;
    }

    try {
      // Look for unhandled error elements
      const unhandledElements = document.querySelectorAll('[data-sentry-element="UnhandledTagWrapper"]');

      const currentUnhandledCount = unhandledElements.length;

      // Trigger bubble and panicked state if new unhandled errors appeared
      if (currentUnhandledCount > this.lastUnhandledErrorCount && currentUnhandledCount > 0) {
        console.log(`[Sentry-chan] Detected ${currentUnhandledCount} unhandled errors on page`);

        // Enter panicked state
        this.enterPanickedState();

        // Show error message bubble
        this.showAutomaticBubble(CONTEXTUAL_MESSAGES.unhandledError);
      }

      this.lastUnhandledErrorCount = currentUnhandledCount;
    } catch (error) {
      console.warn('[Sentry-chan] Error analyzing page content:', error);
    }
  }

  private setupSectionDetection(): void {
    // Create intersection observer to detect when sections come into view
    this.intersectionObserver = new IntersectionObserver(
      entries => {
        entries.forEach(entry => {
          if (entry.isIntersecting && entry.intersectionRatio >= SECTION_VISIBILITY_THRESHOLD) {
            this.handleSectionVisible(entry.target);
          }
        });
      },
      {
        threshold: SECTION_VISIBILITY_THRESHOLD,
        rootMargin: '0px',
      },
    );

    // Start observing sections
    this.observeSections();
  }

  private observeSections(): void {
    // Define section selectors and their corresponding messages
    const sectionSelectors = [
      {
        selector: '[data-sentry-element="TitleWrapper"]',
        textContent: 'Stack Trace',
        message: CONTEXTUAL_MESSAGES.stackTrace,
      },
      {
        selector: '[data-sentry-element="TitleWrapper"]',
        textContent: 'Breadcrumbs',
        message: CONTEXTUAL_MESSAGES.breadcrumbs,
      },
      {
        selector: '[data-sentry-element="TitleWrapper"]',
        textContent: 'Tags',
        message: CONTEXTUAL_MESSAGES.tags,
      },
      {
        selector: '[data-sentry-element="TitleWrapper"]',
        textContent: 'Releases',
        message: CONTEXTUAL_MESSAGES.releases,
      },
    ];

    sectionSelectors.forEach(({ selector, textContent, message }) => {
      const elements = document.querySelectorAll(selector);

      elements.forEach(element => {
        // Check if element contains the expected text
        if (textContent && !element.textContent?.includes(textContent)) {
          return;
        }

        if (!this.observedSections.has(element)) {
          this.observedSections.add(element);
          this.intersectionObserver?.observe(element);

          // Store message on element for retrieval
          (
            element as HTMLElement & { __sentryChanMessage?: string; __sentryChanSectionId?: string }
          ).__sentryChanMessage = message;
          (
            element as HTMLElement & { __sentryChanMessage?: string; __sentryChanSectionId?: string }
          ).__sentryChanSectionId = textContent;
        }
      });
    });
  }

  private handleSectionVisible(element: Element): void {
    const elementWithData = element as HTMLElement & { __sentryChanMessage?: string; __sentryChanSectionId?: string };
    const message = elementWithData.__sentryChanMessage;
    const sectionId = elementWithData.__sentryChanSectionId;

    if (!message || !sectionId) return;

    // Prevent duplicate triggers for the same section
    if (this.lastTriggeredSection === sectionId) {
      return;
    }

    // Check cooldown
    const now = Date.now();
    if (now - this.lastAutoBubbleTime < AUTO_BUBBLE_COOLDOWN) {
      return;
    }

    console.log(`[Sentry-chan] Section "${sectionId}" came into view`);

    // Delay trigger to ensure user is actually reading the section
    if (this.sectionTriggerTimer) {
      clearTimeout(this.sectionTriggerTimer);
    }

    this.sectionTriggerTimer = setTimeout(() => {
      // Double-check the element is still visible
      const rect = element.getBoundingClientRect();
      const windowHeight = window.innerHeight;

      if (rect.top < windowHeight && rect.bottom > 0) {
        this.lastTriggeredSection = sectionId;
        this.showAutomaticBubble(message);

        // Reset after a delay to allow re-triggering if user navigates away and back
        setTimeout(() => {
          this.lastTriggeredSection = null;
        }, 30000); // 30 seconds
      }
    }, SECTION_TRIGGER_DELAY);
  }

  private setupResolveButtonDetection(): void {
    // Use event delegation to catch resolve button clicks
    document.addEventListener(
      'click',
      e => {
        const target = e.target as HTMLElement;

        // Check if clicked element or its parent is a resolve button
        const resolveButton = this.findResolveButton(target);
        if (resolveButton) {
          console.log('[Sentry-chan] Resolve button clicked!');
          this.handleResolveButtonClick();
        }
      },
      true,
    ); // Use capture phase to catch before other handlers
  }

  private findResolveButton(element: HTMLElement): HTMLElement | null {
    // Check up to 3 levels up the DOM tree
    let current: HTMLElement | null = element;
    let levels = 0;

    while (current && levels < 3) {
      // Check for resolve button characteristics
      if (
        current.tagName === 'BUTTON' &&
        (current.getAttribute('aria-label') === 'Resolve' ||
          current.textContent?.includes('Resolve') ||
          current.querySelector('[data-sentry-element="ButtonLabel"]')?.textContent?.includes('Resolve'))
      ) {
        return current;
      }

      current = current.parentElement;
      levels++;
    }

    return null;
  }

  private handleResolveButtonClick(): void {
    // Record activity
    this.recordActivity();

    // Enter celebrating state
    this.enterCelebratingState();
  }

  private setupJSONViewDetection(): void {
    // Check initial URL
    this.checkForJSONView();

    // Listen for URL changes (for SPAs)
    let lastUrl = location.href;
    const urlObserver = new MutationObserver(() => {
      const currentUrl = location.href;
      if (currentUrl !== lastUrl) {
        lastUrl = currentUrl;
        // Small delay to let the page settle
        setTimeout(() => {
          this.checkForJSONView();
        }, 500);
      }
    });

    // Observe for URL changes
    urlObserver.observe(document, { subtree: true, childList: true });

    // Also listen for popstate events (back/forward navigation)
    window.addEventListener('popstate', () => {
      setTimeout(() => {
        this.checkForJSONView();
      }, 500);
    });
  }

  private checkForJSONView(): void {
    const currentUrl = window.location.href;

    // Check if URL matches the JSON event view pattern
    // Pattern: /api/0/projects/{org}/{project}/events/{eventId}/json/
    const jsonEventPattern = /\/api\/0\/projects\/[^/]+\/[^/]+\/events\/[a-f0-9]+\/json\/?$/i;

    if (jsonEventPattern.test(currentUrl)) {
      console.log('[Sentry-chan] JSON event view detected:', currentUrl);

      // Small delay to ensure the page content has loaded
      setTimeout(() => {
        this.enterThinkingState();
      }, 1000);
    } else {
      // Exit thinking state if we navigate away from JSON view
      if (this.isThinking) {
        this.exitThinkingState();
      }
    }
  }

  private showAutomaticBubble(message: string, recordActivity: boolean = true): void {
    if (this.bubbleActive) {
      return; // Respect rate limiting
    }

    console.log('[Sentry-chan] Showing automatic bubble:', message);

    this.lastAutoBubbleTime = Date.now();
    this.showChatBubble(message, recordActivity);
  }

  private handleAvatarClick(e: MouseEvent): void {
    // Record activity for sleepy state
    this.recordActivity();

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

    // Record activity
    this.recordActivity();

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

      let constrainedX = Math.max(0, Math.min(x, maxX));
      let constrainedY = Math.max(0, Math.min(y, maxY));

      // Apply edge constraint if snap to edge is enabled
      if (this.currentState?.snapToEdge) {
        const edgePosition = this.constrainToEdge(constrainedX, constrainedY);
        constrainedX = edgePosition.x;
        constrainedY = edgePosition.y;
      }

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

    // Check for corner snapping first (takes priority) - only if snap to edge is disabled
    if (!this.currentState?.snapToEdge) {
      const snapCorner = this.getSnapCorner(x, y);
      if (snapCorner && this.currentState) {
        await sentryChanStorage.snapToCorner(snapCorner, this.currentState.size);
        // Update storage state
        await sentryChanStorage.setDragging(false);
        return;
      }
    }

    // Update storage with current position (edge constraint already applied during drag if enabled)
    await this.debouncedUpdatePosition(x, y);

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

  private getEdgeSnapPosition(x: number, y: number): { x: number; y: number } | null {
    if (!this.currentState || !this.container) return null;

    const threshold = EDGE_SNAP_THRESHOLD;
    const windowWidth = window.innerWidth;
    const windowHeight = window.innerHeight;
    const avatarWidth = this.container.offsetWidth;
    const avatarHeight = this.container.offsetHeight;
    const padding = 10; // Small padding from the exact edge

    let snapX = x;
    let snapY = y;
    let shouldSnap = false;

    // Check left edge
    if (x < threshold) {
      snapX = padding;
      shouldSnap = true;
    }
    // Check right edge
    else if (x + avatarWidth > windowWidth - threshold) {
      snapX = windowWidth - avatarWidth - padding;
      shouldSnap = true;
    }

    // Check top edge
    if (y < threshold) {
      snapY = padding;
      shouldSnap = true;
    }
    // Check bottom edge
    else if (y + avatarHeight > windowHeight - threshold) {
      snapY = windowHeight - avatarHeight - padding;
      shouldSnap = true;
    }

    return shouldSnap ? { x: snapX, y: snapY } : null;
  }

  private constrainToEdge(x: number, y: number): { x: number; y: number } {
    if (!this.container) return { x, y };

    const windowWidth = window.innerWidth;
    const windowHeight = window.innerHeight;
    const avatarWidth = this.container.offsetWidth;
    const avatarHeight = this.container.offsetHeight;
    const padding = 10;

    // Find the closest edge
    const distanceToLeft = x;
    const distanceToRight = windowWidth - (x + avatarWidth);
    const distanceToTop = y;
    const distanceToBottom = windowHeight - (y + avatarHeight);

    const minDistance = Math.min(distanceToLeft, distanceToRight, distanceToTop, distanceToBottom);

    // Constrain to the closest edge
    if (minDistance === distanceToLeft) {
      // Left edge
      return { x: padding, y: Math.max(padding, Math.min(y, windowHeight - avatarHeight - padding)) };
    } else if (minDistance === distanceToRight) {
      // Right edge
      return {
        x: windowWidth - avatarWidth - padding,
        y: Math.max(padding, Math.min(y, windowHeight - avatarHeight - padding)),
      };
    } else if (minDistance === distanceToTop) {
      // Top edge
      return { x: Math.max(padding, Math.min(x, windowWidth - avatarWidth - padding)), y: padding };
    } else {
      // Bottom edge
      return {
        x: Math.max(padding, Math.min(x, windowWidth - avatarWidth - padding)),
        y: windowHeight - avatarHeight - padding,
      };
    }
  }

  private async snapToNearestEdge(): Promise<void> {
    if (!this.container || !this.currentState) return;

    const currentX = this.container.offsetLeft;
    const currentY = this.container.offsetTop;
    const edgePosition = this.constrainToEdge(currentX, currentY);

    await this.snapToEdgeWithAnimation(edgePosition.x, edgePosition.y);
  }

  private async snapToEdgeWithAnimation(targetX: number, targetY: number): Promise<void> {
    if (!this.container) return;

    const startX = this.container.offsetLeft;
    const startY = this.container.offsetTop;
    const deltaX = targetX - startX;
    const deltaY = targetY - startY;

    // If already at target position, just update storage
    if (Math.abs(deltaX) < 1 && Math.abs(deltaY) < 1) {
      await sentryChanStorage.updatePosition(targetX, targetY);
      return;
    }

    // Animate to edge
    const duration = ANIMATION_DURATION;
    const startTime = performance.now();

    const animate = (currentTime: number) => {
      if (!this.container) return;

      const elapsed = currentTime - startTime;
      const progress = Math.min(elapsed / duration, 1);

      // Use easeOutCubic for smooth animation
      const easeProgress = 1 - Math.pow(1 - progress, 3);

      const currentX = startX + deltaX * easeProgress;
      const currentY = startY + deltaY * easeProgress;

      this.container.style.left = `${currentX}px`;
      this.container.style.top = `${currentY}px`;

      if (progress < 1) {
        requestAnimationFrame(animate);
      } else {
        // Animation complete, update storage
        sentryChanStorage.updatePosition(targetX, targetY);
      }
    };

    requestAnimationFrame(animate);
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

    // Record activity
    this.recordActivity();

    // Dismiss any active chat bubble
    if (this.bubbleActive) {
      this.dismissBubble();
    }

    // Clear activity timers and DOM observation when hidden
    this.clearActivityTimers();
    this.clearDOMObservation();

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

    // Record activity
    this.recordActivity();

    // Hide restore tab
    this.restoreTab.classList.remove('visible');

    // Show avatar with delay
    setTimeout(() => {
      if (this.container) {
        this.container.classList.remove('hidden');
      }
    }, 100);

    // Restart activity monitoring and DOM observation when shown
    this.startInactivityMonitoring();
    this.setupDOMObservation();

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

      // Hide leaning container
      if (this.leaningContainer) {
        this.leaningContainer.classList.remove('visible');
        this.leaningContainer.style.opacity = '0';
        this.leaningContainer.style.transform = 'translateY(20px)';
        this.leaningContainer.style.pointerEvents = 'none';
      }

      // Restart activity monitoring and DOM observation when visible
      this.startInactivityMonitoring();
      this.setupDOMObservation();

      console.log('[Sentry-chan] Avatar shown');
    } else {
      // Clear activity timers, DOM observation, and all states when hidden
      this.clearActivityTimers();
      this.clearDOMObservation();
      this.isSleepy = false;
      this.isSleepyEyesClosed = false;
      this.isPanicked = false;
      this.isCelebrating = false;
      this.isThinking = false;

      this.container.classList.add('hidden');
      this.restoreTab.classList.remove('visible');

      // Show leaning container at bottom center
      if (this.leaningContainer) {
        // Always re-append the leaning container to ensure it's in the DOM
        if (!this.leaningContainer.parentElement) {
          document.body.appendChild(this.leaningContainer);
        }

        this.positionLeaningContainer();

        setTimeout(() => {
          if (this.leaningContainer) {
            this.leaningContainer.classList.add('visible');
            // Override the opacity and transform to make it visible
            this.leaningContainer.style.opacity = '1';
            this.leaningContainer.style.transform = 'translateY(0)';
            this.leaningContainer.style.pointerEvents = 'auto';
          }
        }, ANIMATION_DURATION);
      }
    }
  }

  private updateAnimations(): void {
    if (!this.avatar || !this.currentState) return;

    // Don't apply CSS animations during speech animation to avoid conflicts
    if (this.speechAnimationTimer) {
      return;
    }

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

    // Update container dimensions based on the new size
    if (this.idleMouthClosedImage) {
      const desiredSize = this.currentState.size;
      const aspectRatio = this.idleMouthClosedImage.naturalHeight / this.idleMouthClosedImage.naturalWidth;
      const containerWidth = desiredSize;
      const containerHeight = desiredSize * aspectRatio;

      this.container.style.width = `${containerWidth}px`;
      this.container.style.height = `${containerHeight}px`;

      // Ensure avatar stays within viewport bounds after resize
      const windowWidth = window.innerWidth;
      const windowHeight = window.innerHeight;

      let newX = this.currentState.position.x;
      let newY = this.currentState.position.y;

      // Adjust position if avatar would be off-screen
      if (newX + containerWidth > windowWidth) {
        newX = Math.max(0, windowWidth - containerWidth - 20);
      }
      if (newY + containerHeight > windowHeight) {
        newY = Math.max(0, windowHeight - containerHeight - 20);
      }

      // Update position if needed
      if (newX !== this.currentState.position.x || newY !== this.currentState.position.y) {
        this.container.style.left = `${newX}px`;
        this.container.style.top = `${newY}px`;
        // Update storage with corrected position
        sentryChanStorage.updatePosition(newX, newY);
      }
    }

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

    // Clear speech animation timer
    this.stopSpeechAnimation();

    // Clear activity detection timers
    this.clearActivityTimers();

    // Clear DOM observation
    this.clearDOMObservation();

    if (this.unsubscribe) {
      this.unsubscribe();
    }

    // Remove leaning container from document body if it exists
    if (this.leaningContainer && this.leaningContainer.parentElement) {
      this.leaningContainer.remove();
    }

    const shadowContainer = document.getElementById(SHADOW_ROOT_ID);
    if (shadowContainer) {
      shadowContainer.remove();
    }
  }

  private clearActivityTimers(): void {
    if (this.inactivityTimer) {
      clearTimeout(this.inactivityTimer);
      this.inactivityTimer = null;
    }

    if (this.sleepyBlinkTimer) {
      clearTimeout(this.sleepyBlinkTimer);
      this.sleepyBlinkTimer = null;
    }

    if (this.sleepyMessageTimer) {
      clearTimeout(this.sleepyMessageTimer);
      this.sleepyMessageTimer = null;
    }

    if (this.panickedTimer) {
      clearTimeout(this.panickedTimer);
      this.panickedTimer = null;
    }

    if (this.celebratingTimer) {
      clearTimeout(this.celebratingTimer);
      this.celebratingTimer = null;
    }

    if (this.thinkingTimer) {
      clearTimeout(this.thinkingTimer);
      this.thinkingTimer = null;
    }
  }

  private clearDOMObservation(): void {
    if (this.domObserver) {
      this.domObserver.disconnect();
      this.domObserver = null;
    }

    if (this.domObservationTimer) {
      clearTimeout(this.domObservationTimer);
      this.domObservationTimer = null;
    }

    // Clear section detection
    if (this.intersectionObserver) {
      this.intersectionObserver.disconnect();
      this.intersectionObserver = null;
    }

    if (this.sectionTriggerTimer) {
      clearTimeout(this.sectionTriggerTimer);
      this.sectionTriggerTimer = null;
    }

    this.observedSections.clear();
    this.lastTriggeredSection = null;
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

import 'webextension-polyfill';
import { sentryChanStorage } from '@extension/storage';

console.log('[Sentry-chan] Background script loaded');

// Handle extension installation and updates
chrome.runtime.onInstalled.addListener(async (details) => {
  console.log('[Sentry-chan] Extension installed/updated:', details.reason);
  
  if (details.reason === 'install') {
    // On first install, show welcome message or open options
    console.log('[Sentry-chan] First-time installation');
    
    // Initialize storage with default values
    try {
      await sentryChanStorage.get();
      console.log('[Sentry-chan] Storage initialized successfully');
    } catch (error) {
      console.error('[Sentry-chan] Failed to initialize storage:', error);
    }
  } else if (details.reason === 'update') {
    console.log('[Sentry-chan] Extension updated from version:', details.previousVersion);
    // Handle any migration logic here if needed
  }
});

// Handle keyboard commands
chrome.commands.onCommand.addListener(async (command) => {
  console.log('[Sentry-chan] Command received:', command);
  
  if (command === 'toggle-avatar') {
    try {
      // Toggle the avatar visibility
      await sentryChanStorage.toggleVisibility();
      console.log('[Sentry-chan] Avatar visibility toggled via keyboard shortcut');
    } catch (error) {
      console.error('[Sentry-chan] Failed to toggle avatar:', error);
    }
  }
});

// Handle storage quota exceeded errors
chrome.storage.onChanged.addListener((changes, areaName) => {
  if (areaName === 'sync' && changes['sentry-chan-state']) {
    console.log('[Sentry-chan] Storage sync updated');
  }
});

// Handle extension startup
chrome.runtime.onStartup.addListener(() => {
  console.log('[Sentry-chan] Extension startup');
});

// Keep the service worker alive (for Manifest V3)
let keepAliveInterval: NodeJS.Timeout;

function keepAlive() {
  keepAliveInterval = setInterval(() => {
    chrome.runtime.getPlatformInfo(() => {
      // This API call keeps the service worker alive
    });
  }, 20000); // 20 seconds
}

function stopKeepAlive() {
  if (keepAliveInterval) {
    clearInterval(keepAliveInterval);
  }
}

// Start keep-alive when background script loads
keepAlive();

// Stop keep-alive when the service worker is about to be terminated
chrome.runtime.onSuspend?.addListener(() => {
  console.log('[Sentry-chan] Background script suspending');
  stopKeepAlive();
});

// Log any unhandled errors
if (typeof globalThis !== 'undefined') {
  globalThis.addEventListener('error', (event) => {
    console.error('[Sentry-chan] Background script error:', event.error);
  });
  
  globalThis.addEventListener('unhandledrejection', (event) => {
    console.error('[Sentry-chan] Background script unhandled rejection:', event.reason);
  });
}

console.log('[Sentry-chan] Background script initialization complete');

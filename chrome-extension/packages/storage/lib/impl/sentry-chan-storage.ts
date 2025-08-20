import { createStorage, StorageEnum } from '../base/index.js';
import type { SentryChanStateType, SentryChanStorageType } from '../types.js';

// Default state for Sentry-chan (position will be calculated lazily)
const getDefaultState = (): SentryChanStateType => {
  const windowWidth = typeof window !== 'undefined' ? window.innerWidth : 1200;
  const windowHeight = typeof window !== 'undefined' ? window.innerHeight : 800;

  return {
    // Visibility settings
    enabled: true,
    visible: true,
    startVisible: true,

    // Position and size
    position: { x: windowWidth - 100, y: windowHeight - 100 },
    size: 80,
    corner: 'bottom-right',

    // Animation settings
    enableAnimations: true,
    animationState: 'idle',

    // Domain-specific settings
    domainEnabled: true,

    // Edge snapping
    snapToEdge: false,

    // Internal state
    isDragging: false,
    lastInteraction: Date.now(),
  };
};

// Create the storage instance with sync storage for cross-device persistence
const storage = createStorage<SentryChanStateType>('sentry-chan-state', getDefaultState(), {
  storageEnum: StorageEnum.Sync,
  liveUpdate: true,
  serialization: {
    serialize: (value: SentryChanStateType) => JSON.stringify(value),
    deserialize: (text: string) => {
      try {
        const parsed = JSON.parse(text);
        const defaults = getDefaultState();
        // Ensure all required properties exist with fallbacks
        return {
          ...defaults,
          ...parsed,
          // Ensure position is valid
          position: parsed.position || defaults.position,
        };
      } catch {
        return getDefaultState();
      }
    },
  },
});

export const sentryChanStorage: SentryChanStorageType = {
  ...storage,

  // Toggle visibility
  toggleVisibility: async () => {
    await storage.set(state => ({
      ...state,
      visible: !state.visible,
      lastInteraction: Date.now(),
    }));
  },

  // Set visibility to specific state
  setVisibility: async (visible: boolean) => {
    await storage.set(state => ({
      ...state,
      visible,
      lastInteraction: Date.now(),
    }));
  },

  // Update position
  updatePosition: async (x: number, y: number) => {
    await storage.set(state => ({
      ...state,
      position: { x, y },
      lastInteraction: Date.now(),
    }));
  },

  // Update size
  updateSize: async (size: number) => {
    await storage.set(state => ({
      ...state,
      size: Math.max(64, Math.min(128, size)), // Clamp between 64-128px
      lastInteraction: Date.now(),
    }));
  },

  // Update corner preference
  updateCorner: async (corner: SentryChanStateType['corner']) => {
    await storage.set(state => ({
      ...state,
      corner,
      lastInteraction: Date.now(),
    }));
  },

  // Snap to corner
  snapToCorner: async (corner: SentryChanStateType['corner'], avatarSize?: number) => {
    const windowWidth = typeof window !== 'undefined' ? window.innerWidth : 1200;
    const windowHeight = typeof window !== 'undefined' ? window.innerHeight : 800;

    // Get current state to use actual avatar size if not provided
    const currentState = await storage.get();
    const actualSize = avatarSize || currentState.size;
    const padding = 20; // Padding from edges

    let position: { x: number; y: number };

    switch (corner) {
      case 'top-left':
        position = { x: padding, y: padding };
        break;
      case 'top-right':
        position = { x: windowWidth - actualSize - padding, y: padding };
        break;
      case 'bottom-left':
        position = { x: padding, y: windowHeight - actualSize - padding };
        break;
      case 'bottom-right':
      default:
        position = { x: windowWidth - actualSize - padding, y: windowHeight - actualSize - padding };
        break;
    }

    await storage.set(state => ({
      ...state,
      position,
      corner,
      lastInteraction: Date.now(),
    }));
  },

  // Toggle animations
  toggleAnimations: async () => {
    await storage.set(state => ({
      ...state,
      enableAnimations: !state.enableAnimations,
      lastInteraction: Date.now(),
    }));
  },

  // Update animation state
  updateAnimationState: async (animationState: SentryChanStateType['animationState']) => {
    await storage.set(state => ({
      ...state,
      animationState,
      lastInteraction: Date.now(),
    }));
  },

  // Toggle enabled state
  toggleEnabled: async () => {
    await storage.set(state => ({
      ...state,
      enabled: !state.enabled,
      lastInteraction: Date.now(),
    }));
  },

  // Toggle domain-specific enabled state
  toggleDomainEnabled: async () => {
    await storage.set(state => ({
      ...state,
      domainEnabled: !state.domainEnabled,
      lastInteraction: Date.now(),
    }));
  },

  // Toggle snap to edge
  toggleSnapToEdge: async () => {
    await storage.set(state => ({
      ...state,
      snapToEdge: !state.snapToEdge,
      lastInteraction: Date.now(),
    }));
  },

  // Set dragging state
  setDragging: async (isDragging: boolean) => {
    await storage.set(state => ({
      ...state,
      isDragging,
      lastInteraction: Date.now(),
    }));
  },

  // Reset all data
  resetAll: async () => {
    await storage.set(getDefaultState());
  },

  // Reset position only
  resetPosition: async () => {
    const windowWidth = typeof window !== 'undefined' ? window.innerWidth : 1200;
    const windowHeight = typeof window !== 'undefined' ? window.innerHeight : 800;

    await storage.set(state => ({
      ...state,
      position: {
        x: windowWidth - 100,
        y: windowHeight - 100,
      },
      corner: 'bottom-right',
      lastInteraction: Date.now(),
    }));
  },
};

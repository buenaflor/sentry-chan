import type { ValueOrUpdateType } from './base/index.js';

export type BaseStorageType<D> = {
  get: () => Promise<D>;
  set: (value: ValueOrUpdateType<D>) => Promise<void>;
  getSnapshot: () => D | null;
  subscribe: (listener: () => void) => () => void;
};

// Sentry-chan specific types
export interface SentryChanStateType {
  // Visibility settings
  enabled: boolean;
  visible: boolean;
  startVisible: boolean;
  
  // Position and size
  position: { x: number; y: number };
  size: number;
  corner: 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right';
  
  // Animation settings
  enableAnimations: boolean;
  animationState: 'idle' | 'blink' | 'happy' | 'sip';
  
  // Domain-specific settings
  domainEnabled: boolean;
  
  // Internal state
  isDragging: boolean;
  lastInteraction: number;
}

export type SentryChanStorageType = BaseStorageType<SentryChanStateType> & {
  // Visibility controls
  toggleVisibility: () => Promise<void>;
  setVisibility: (visible: boolean) => Promise<void>;
  
  // Position and size controls
  updatePosition: (x: number, y: number) => Promise<void>;
  updateSize: (size: number) => Promise<void>;
  updateCorner: (corner: SentryChanStateType['corner']) => Promise<void>;
  snapToCorner: (corner: SentryChanStateType['corner'], avatarSize?: number) => Promise<void>;
  
  // Animation controls
  toggleAnimations: () => Promise<void>;
  updateAnimationState: (animationState: SentryChanStateType['animationState']) => Promise<void>;
  
  // Feature toggles
  toggleEnabled: () => Promise<void>;
  toggleDomainEnabled: () => Promise<void>;
  
  // Internal state
  setDragging: (isDragging: boolean) => Promise<void>;
  
  // Reset functions
  resetAll: () => Promise<void>;
  resetPosition: () => Promise<void>;
};

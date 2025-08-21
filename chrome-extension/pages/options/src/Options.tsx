import '@src/Options.css';
import { t } from '@extension/i18n';
import { useStorage, withErrorBoundary, withSuspense } from '@extension/shared';
import { sentryChanStorage } from '@extension/storage';
import { cn, ErrorDisplay, LoadingSpinner } from '@extension/ui';
import { useState, useCallback, useRef, useEffect } from 'react';
import type { SentryChanStateType } from '@extension/storage';
import type React from 'react';

const Options = () => {
  const state = useStorage(sentryChanStorage);
  const [showResetConfirm, setShowResetConfirm] = useState(false);
  const lastUpdateRef = useRef<number>(0);
  const [currentSize, setCurrentSize] = useState(state.size);

  // Update local size state when storage changes
  useEffect(() => {
    setCurrentSize(state.size);
  }, [state.size]);

  const handleSizeChange = useCallback((event: React.ChangeEvent<HTMLInputElement>) => {
    const size = parseInt(event.target.value);

    // Update local state immediately for responsive UI
    setCurrentSize(size);

    // Throttle storage updates to ~60fps for smooth avatar updates without overwhelming storage
    const now = Date.now();
    if (now - lastUpdateRef.current >= 16) {
      // ~60fps
      lastUpdateRef.current = now;
      sentryChanStorage.updateSize(size).catch(console.error);
    }
  }, []);

  const handleCornerChange = async (corner: SentryChanStateType['corner']) => {
    await sentryChanStorage.updateCorner(corner);
  };

  const handleToggleAnimations = async () => {
    await sentryChanStorage.toggleAnimations();
  };

  const handleToggleStartVisible = async () => {
    await sentryChanStorage.set(currentState => ({
      ...currentState,
      startVisible: !currentState.startVisible,
    }));
  };

  const handleResetAll = async () => {
    if (showResetConfirm) {
      await sentryChanStorage.resetAll();
      setShowResetConfirm(false);
    } else {
      setShowResetConfirm(true);
      // Auto-cancel after 5 seconds
      setTimeout(() => setShowResetConfirm(false), 5000);
    }
  };

  const openShortcutsPage = () => {
    chrome.tabs.create({ url: 'chrome://extensions/shortcuts' });
  };

  return (
    <div className="sentry-chan-options">
      {/* Header */}
      <div className="options-header">
        <div className="header-content">
          <div className="logo-section">
            <img src={chrome.runtime.getURL('icon-128.png')} alt="Sentry-chan" className="options-logo" />
            <div>
              <h1>Sentry-chan Options</h1>
              <p className="subtitle">Configure your debugging companion</p>
            </div>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="options-content">
        <div className="options-container">
          {/* General Settings */}
          <div className="settings-section">
            <h2 className="section-title">General Settings</h2>

            <div className="setting-item">
              <div className="setting-info">
                <label className="setting-label">{t('startVisible')}</label>
                <p className="setting-description">Show the avatar when loading Sentry pages</p>
              </div>
              <label className="toggle-switch" htmlFor="start-visible-toggle" aria-label="Toggle start visible setting">
                <input
                  id="start-visible-toggle"
                  type="checkbox"
                  checked={state.startVisible}
                  onChange={handleToggleStartVisible}
                />
                <span className="toggle-slider"></span>
              </label>
            </div>


          </div>

          {/* Appearance Settings */}
          <div className="settings-section">
            <h2 className="section-title">Appearance</h2>

            <div className="setting-item">
              <div className="setting-info">
                <label className="setting-label">{t('avatarSize')}</label>
                <p className="setting-description">Adjust the size of the avatar (64-512px)</p>
              </div>
              <div className="size-control">
                <input
                  type="range"
                  min="64"
                  max="512"
                  step="4"
                  value={currentSize}
                  onChange={handleSizeChange}
                  className="size-slider"
                />
                <span className="size-value">{currentSize}px</span>
              </div>
            </div>


          </div>

          {/* Keyboard Shortcuts */}
          <div className="settings-section">
            <h2 className="section-title">Keyboard Shortcuts</h2>

            <div className="setting-item">
              <div className="setting-info">
                <span className="setting-label">Toggle Avatar Visibility</span>
                <p className="setting-description">
                  Current shortcut: <code>Ctrl+Shift+Period</code>
                </p>
              </div>
              <button className="options-button secondary" onClick={openShortcutsPage}>
                Configure Shortcuts
              </button>
            </div>
          </div>

          {/* Advanced Settings */}
          <div className="settings-section">
            <h2 className="section-title">Advanced</h2>

            <div className="setting-item">
              <div className="setting-info">
                <span className="setting-label">Current Position</span>
                <p className="setting-description">
                  X: {Math.round(state.position.x)}px, Y: {Math.round(state.position.y)}px
                </p>
              </div>
              <button className="options-button secondary" onClick={() => sentryChanStorage.resetPosition()}>
                Reset Position
              </button>
            </div>

            <div className="setting-item">
              <div className="setting-info">
                <label className="setting-label">{t('resetAllData')}</label>
                <p className="setting-description">Reset all settings to default values</p>
              </div>
              <button
                className={cn('options-button', showResetConfirm ? 'danger' : 'secondary')}
                onClick={handleResetAll}>
                {showResetConfirm ? 'Click again to confirm' : 'Reset All Data'}
              </button>
            </div>
          </div>

          {/* About Section */}
          <div className="settings-section">
            <h2 className="section-title">About</h2>

            <div className="about-content">
              <p>
                <strong>Sentry-chan</strong> is a debugging companion that appears on Sentry pages.
              </p>
              <ul>
                <li>🎨 Drag-and-drop</li>
                <li>⌨️ Keyboard shortcuts support</li>
                <li>💬 Motivational messages</li>
                <li>💪 Helps you fight the battle against bugs</li>
              </ul>

              <div className="version-info">
                <small>Version: {chrome.runtime.getManifest().version}</small>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default withErrorBoundary(withSuspense(Options, <LoadingSpinner />), ErrorDisplay);

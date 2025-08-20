import '@src/Options.css';
import { t } from '@extension/i18n';
import { useStorage, withErrorBoundary, withSuspense } from '@extension/shared';
import { sentryChanStorage } from '@extension/storage';
import type { SentryChanStateType } from '@extension/storage';
import { cn, ErrorDisplay, LoadingSpinner } from '@extension/ui';
import React, { useState } from 'react';

const Options = () => {
  const state = useStorage(sentryChanStorage);
  const [showResetConfirm, setShowResetConfirm] = useState(false);

  const handleSizeChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const size = parseInt(event.target.value);
    await sentryChanStorage.updateSize(size);
  };

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
            <img
              src={chrome.runtime.getURL('assets/sentry_chan_idle.png')}
              alt="Sentry-chan"
              className="options-logo"
            />
            <div>
              <h1>Sentry-chan Options</h1>
              <p className="subtitle">Configure your floating mascot</p>
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
              <label className="toggle-switch">
                <input type="checkbox" checked={state.startVisible} onChange={handleToggleStartVisible} />
                <span className="toggle-slider"></span>
              </label>
            </div>

            <div className="setting-item">
              <div className="setting-info">
                <label className="setting-label">{t('enableAnimations')}</label>
                <p className="setting-description">Enable idle animations (blinking, bouncing)</p>
              </div>
              <label className="toggle-switch">
                <input type="checkbox" checked={state.enableAnimations} onChange={handleToggleAnimations} />
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
                <p className="setting-description">Adjust the size of the avatar (64-128px)</p>
              </div>
              <div className="size-control">
                <input
                  type="range"
                  min="64"
                  max="128"
                  step="4"
                  value={state.size}
                  onChange={handleSizeChange}
                  className="size-slider"
                />
                <span className="size-value">{state.size}px</span>
              </div>
            </div>

            <div className="setting-item">
              <div className="setting-info">
                <label className="setting-label">{t('defaultCorner')}</label>
                <p className="setting-description">Preferred corner when avatar snaps to edge</p>
              </div>
              <div className="corner-grid">
                {[
                  { value: 'top-left', label: 'Top Left' },
                  { value: 'top-right', label: 'Top Right' },
                  { value: 'bottom-left', label: 'Bottom Left' },
                  { value: 'bottom-right', label: 'Bottom Right' },
                ].map(corner => (
                  <label key={corner.value} className="corner-option">
                    <input
                      type="radio"
                      name="corner"
                      value={corner.value}
                      checked={state.corner === corner.value}
                      onChange={() => handleCornerChange(corner.value as SentryChanStateType['corner'])}
                    />
                    <span className="corner-label">{corner.label}</span>
                  </label>
                ))}
              </div>
            </div>
          </div>

          {/* Keyboard Shortcuts */}
          <div className="settings-section">
            <h2 className="section-title">Keyboard Shortcuts</h2>

            <div className="setting-item">
              <div className="setting-info">
                <label className="setting-label">Toggle Avatar Visibility</label>
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
                <label className="setting-label">Current Position</label>
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
                <strong>Sentry-chan</strong> is a lightweight floating mascot that appears on Sentry pages.
              </p>
              <ul>
                <li>🎭 Non-intrusive design with shadow DOM isolation</li>
                <li>🎨 Smooth animations and drag-and-drop</li>
                <li>💾 Cross-device settings sync</li>
                <li>⌨️ Keyboard shortcuts support</li>
                <li>🔒 Privacy-focused with no telemetry</li>
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

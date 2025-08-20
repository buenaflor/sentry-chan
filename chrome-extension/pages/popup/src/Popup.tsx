import '@src/Popup.css';
import { t } from '@extension/i18n';
import { useStorage, withErrorBoundary, withSuspense } from '@extension/shared';
import { sentryChanStorage } from '@extension/storage';
import { cn, ErrorDisplay, LoadingSpinner } from '@extension/ui';
import React, { useState, useEffect } from 'react';

const Popup = () => {
  const state = useStorage(sentryChanStorage);

  const handleToggleEnabled = async () => {
    await sentryChanStorage.toggleEnabled();
  };

  const handleToggleDomainEnabled = async () => {
    await sentryChanStorage.toggleDomainEnabled();
  };

  const handleToggleVisibility = async () => {
    await sentryChanStorage.toggleVisibility();
  };

  const handleResetPosition = async () => {
    await sentryChanStorage.resetPosition();
  };

  const openOptions = () => {
    chrome.runtime.openOptionsPage();
  };

  const [isOnSentryPage, setIsOnSentryPage] = useState(false);

  // Check if current page is on a Sentry domain
  useEffect(() => {
    chrome.tabs.query({ active: true, currentWindow: true }, tabs => {
      const currentTab = tabs[0];
      const url = currentTab?.url || '';
      const isSentryDomain = url.includes('sentry.io') || url.includes('sentry.dev') || url.includes('sentry.com');
      setIsOnSentryPage(isSentryDomain);
    });
  }, []);

  return (
    <div className="sentry-chan-popup">
      {/* Header */}
      <div className="popup-header">
        <div className="logo-container">
          <img src={chrome.runtime.getURL('icon-128.png')} alt="Sentry-chan" className="popup-logo" />
        </div>
        <div className="title-container">
          <h1>Sentry-chan</h1>
          <p className="subtitle">Floating Mascot</p>
        </div>
      </div>

      {/* Main Controls */}
      <div className="popup-content">
        {/* Global Enable/Disable */}
        <div className="control-group">
          <div className="control-item">
            <label className="control-label">
              <input
                type="checkbox"
                checked={state.enabled}
                onChange={handleToggleEnabled}
                className="control-checkbox"
              />
              <span className="checkmark"></span>
              {t('enableOnSentry')}
            </label>
          </div>
        </div>

        {/* Domain-specific control */}
        <div className="control-group">
          <div className="control-item">
            <label className="control-label">
              <input
                type="checkbox"
                checked={state.domainEnabled}
                onChange={handleToggleDomainEnabled}
                disabled={!state.enabled}
                className="control-checkbox"
              />
              <span className="checkmark"></span>
              Enable on this domain
            </label>
          </div>
        </div>

        {/* Status indicator */}
        <div className="status-indicator">
          {isOnSentryPage ? (
            <span className="status-on-sentry">📍 On Sentry page</span>
          ) : (
            <span className="status-other">ℹ️ Not on Sentry page</span>
          )}
        </div>

        {/* Quick Actions */}
        <div className="control-group">
          <button
            onClick={handleToggleVisibility}
            disabled={!state.enabled || !state.domainEnabled}
            className={cn('popup-button', 'primary', {
              disabled: !state.enabled || !state.domainEnabled,
            })}>
            {state.visible ? t('hideAvatar') : t('showAvatar')}
          </button>

          <button
            onClick={handleResetPosition}
            disabled={!state.enabled || !state.domainEnabled}
            className={cn('popup-button', 'secondary', {
              disabled: !state.enabled || !state.domainEnabled,
            })}>
            {t('resetPosition')}
          </button>
        </div>

        {/* Options Button */}
        <div className="control-group">
          <button onClick={openOptions} className="popup-button outline">
            {t('openOptions')}
          </button>
        </div>

        {/* Keyboard Shortcut Info */}
        <div className="info-section">
          <small className="keyboard-hint">{t('keyboardShortcut')}</small>
        </div>
      </div>
    </div>
  );
};

export default withErrorBoundary(withSuspense(Popup, <LoadingSpinner />), ErrorDisplay);

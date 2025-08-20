import '@src/Popup.css';
import { t } from '@extension/i18n';
import { useStorage, withErrorBoundary, withSuspense } from '@extension/shared';
import { sentryChanStorage } from '@extension/storage';
import { ErrorDisplay, LoadingSpinner } from '@extension/ui';

const Popup = () => {
  const state = useStorage(sentryChanStorage);

  const handleToggleVisibility = async () => {
    await sentryChanStorage.toggleVisibility();
  };

  const handleToggleSnapToEdge = async () => {
    await sentryChanStorage.toggleSnapToEdge();
  };

  const handleResetPosition = async () => {
    await sentryChanStorage.resetPosition();
  };

  const openOptions = () => {
    chrome.runtime.openOptionsPage();
  };

  return (
    <div className="sentry-chan-popup">
      {/* Header */}
      <div className="popup-header">
        <div className="logo-container">
          <img src={chrome.runtime.getURL('icon-128.png')} alt="Sentry-chan" className="popup-logo" />
        </div>
        <div className="title-container">
          <h1>Sentry-chan</h1>
          <p className="subtitle">Debugging Companion</p>
        </div>
      </div>

      {/* Main Controls */}
      <div className="popup-content">
        {/* Snap to edge control */}
        <div className="control-group">
          <div className="control-item">
            <label className="control-label">
              <input
                type="checkbox"
                checked={state.snapToEdge}
                onChange={handleToggleSnapToEdge}
                className="control-checkbox"
              />
              <span className="checkmark"></span>
              Snap to edge
            </label>
          </div>
        </div>

        {/* Quick Actions */}
        <div className="control-group">
          <button onClick={handleToggleVisibility} className="popup-button primary">
            {state.visible ? t('hideAvatar') : t('showAvatar')}
          </button>

          <button onClick={handleResetPosition} className="popup-button secondary">
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

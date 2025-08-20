import { readFileSync } from 'node:fs';
import { IS_DEV } from '@extension/env';
import type { ManifestType } from '@extension/shared';

const packageJson = JSON.parse(readFileSync('./package.json', 'utf8'));

/**
 * Sentry-chan: Floating Mascot Chrome Extension
 * A lightweight floating avatar for Sentry pages with drag-and-drop,
 * hide/show functionality, and persistent state management.
 */
const manifest = {
  manifest_version: 3,
  default_locale: 'en',
  name: '__MSG_extensionName__',
  version: packageJson.version,
  description: '__MSG_extensionDescription__',

  // Minimal permissions for security and privacy
  permissions: ['storage', 'activeTab'],
  host_permissions: [
    '*://*.sentry.io/*',
    '*://*.sentry.dev/*',
    '*://*.sentry.com/*'
  ],

  // Extension UI
  options_page: 'options/index.html',
  action: {
    default_popup: 'popup/index.html',
    default_icon: 'icon-34.png',
  },

  // Icons
  icons: {
    '128': 'icon-128.png',
    '34': 'icon-34.png',
  },

  // Content script only for Sentry pages
  content_scripts: [
    {
      matches: [
        '*://*.sentry.io/*',
        '*://*.sentry.dev/*',
        '*://*.sentry.com/*'
      ],
      js: ['content/sentryChan.iife_dev.js'],
      run_at: 'document_idle',
    },
  ],

  // Web accessible resources for the mascot assets
  web_accessible_resources: [
    {
      resources: ['assets/*', 'icon-128.png', 'icon-34.png'],
      matches: [
        '*://*.sentry.io/*',
        '*://*.sentry.dev/*',
        '*://*.sentry.com/*'
      ],
    },
  ],

  // Commands for keyboard shortcuts
  commands: {
    'toggle-avatar': {
      suggested_key: {
        default: 'Ctrl+Shift+Period',
      },
      description: 'Toggle Sentry-chan avatar visibility',
    },
  },
} satisfies ManifestType;

export default manifest;

(function () {
  'use strict';

  const markers = [
    '__webdriver_evaluate',
    '__selenium_evaluate',
    '__webdriver_script_fn',
    '__fxdriver_evaluate',
    '__driver_unwrapped',
    '__webdriver_unwrapped',
    '__driver_evaluate',
    '__selenium_unwrapped',
    '__fxdriver_unwrapped',
    'callSelenium',
    '_selenium',
    'calledSelenium',
    '__nightmare',
    '__phantomas',
    'domAutomation',
    'domAutomationController',
  ];

  markers.forEach(function (m) {
    delete window[m];
    delete navigator[m];
  });

  Object.defineProperty(navigator, 'webdriver', {
    get: function () {
      return undefined;
    },
    configurable: true,
    enumerable: true,
  });

  if (!window.chrome) {
    window.chrome = {};
  }

  window.chrome.runtime = {
    connect: function () {
      return {
        postMessage: function () {},
        onMessage: { addListener: function () {} },
        onDisconnect: { addListener: function () {} },
      };
    },
    sendMessage: function (extensionId, message, responseCallback) {
      if (responseCallback) {
        setTimeout(function () {
          responseCallback({});
        }, 0);
      }
    },
    onMessage: { addListener: function () {} },
    onConnect: { addListener: function () {} },
  };

  window.chrome.app = {
    isInstalled: false,
    InstallState: {
      DISABLED: 'disabled',
      ENABLED: 'enabled',
      NOT_INSTALLED: 'not_installed',
    },
    RunningState: {
      CANNOT_RUN: 'cannot_run',
      READY: 'ready',
      RUNNING: 'running',
    },
    getDetails: function () {
      return {};
    },
    getIsInstalled: function () {
      return false;
    },
  };

  const originalQuery = navigator.permissions.query.bind(navigator.permissions);
  navigator.permissions.query = function (permission) {
    if (permission === 'notifications') {
      return Promise.resolve({
        state:
          Notification.permission === 'granted'
            ? 'granted'
            : Notification.permission === 'denied'
              ? 'denied'
              : 'prompt',
        addEventListener: function () {},
        removeEventListener: function () {},
        dispatchEvent: function () {
          return false;
        },
      });
    }
    return originalQuery(permission);
  };
})();
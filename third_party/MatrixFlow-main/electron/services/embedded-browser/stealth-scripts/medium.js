(function () {
  'use strict';

  function createMimeType(type, description, suffixes) {
    const mime = Object.create(null);
    mime.type = type;
    mime.description = description;
    mime.suffixes = suffixes;
    mime.enabledPlugin = null;
    return mime;
  }

  function createPlugin(name, description, filename) {
    const plugin = Object.create(Plugin.prototype);
    plugin.name = name;
    plugin.description = description;
    plugin.filename = filename;
    plugin.version = '';
    plugin.length = 0;
    return plugin;
  }

  const pdfPlugin = createPlugin('Chrome PDF Plugin', '', 'internal-pdf-viewer');
  const pdfViewer = createPlugin('Chrome PDF Viewer', '', 'mhjfbmdgcfjbbpaeojofohoefgiehjai');
  const naclPlugin = createPlugin('Native Client', '', 'internal-nacl-plugin');

  const pdfMime = createMimeType('application/pdf', 'Portable Document Format', 'pdf');
  const chromePdfMime = createMimeType(
    'application/x-google-chrome-pdf',
    'Portable Document Format',
    'pdf'
  );

  pdfMime.enabledPlugin = pdfPlugin;
  chromePdfMime.enabledPlugin = pdfPlugin;
  pdfPlugin[0] = pdfMime;
  pdfPlugin.length = 1;

  pdfViewer[0] = chromePdfMime;
  pdfViewer.length = 1;
  chromePdfMime.enabledPlugin = pdfViewer;

  Object.defineProperty(navigator, 'plugins', {
    get: function () {
      return [pdfPlugin, pdfViewer, naclPlugin];
    },
    configurable: true,
    enumerable: true,
  });

  Object.defineProperty(navigator, 'mimeTypes', {
    get: function () {
      return [pdfMime, chromePdfMime];
    },
    configurable: true,
    enumerable: true,
  });
})();
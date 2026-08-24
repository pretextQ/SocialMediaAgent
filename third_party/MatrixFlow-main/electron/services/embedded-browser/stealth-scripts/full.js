function initFullStealth(ACCOUNT_SEED, WEBGL_VENDOR, WEBGL_RENDERER) {
  'use strict';

  let seed = ACCOUNT_SEED >>> 0;
  function lcg() {
    seed = (Math.imul(1664525, seed) + 1013904223) >>> 0;
    return seed / 0x100000000;
  }

  const originalToDataURL = HTMLCanvasElement.prototype.toDataURL;
  HTMLCanvasElement.prototype.toDataURL = function () {
    const ctx = this.getContext('2d');
    if (ctx) {
      const imageData = ctx.getImageData(0, 0, this.width, this.height);
      const data = imageData.data;
      for (let i = 0; i < data.length; i += 4) {
        const noise = Math.floor((lcg() - 0.5) * 2);
        data[i] = (data[i] + noise + 256) % 256;
        data[i + 1] = (data[i + 1] + noise + 256) % 256;
        data[i + 2] = (data[i + 2] + noise + 256) % 256;
      }
      ctx.putImageData(imageData, 0, 0);
    }
    return originalToDataURL.apply(this, arguments);
  };

  const WEBGL_VENDOR_CONST = 0x9245;
  const WEBGL_RENDERER_CONST = 0x9246;

  function patchWebGL(getter) {
    return function (param) {
      if (param === WEBGL_VENDOR_CONST) {
        return WEBGL_VENDOR;
      }
      if (param === WEBGL_RENDERER_CONST) {
        return WEBGL_RENDERER;
      }
      return getter.apply(this, arguments);
    };
  }

  const origGetParameter = WebGLRenderingContext.prototype.getParameter;
  WebGLRenderingContext.prototype.getParameter = patchWebGL(origGetParameter);

  const origGetParameter2 = WebGL2RenderingContext.prototype.getParameter;
  if (origGetParameter2) {
    WebGL2RenderingContext.prototype.getParameter = patchWebGL(origGetParameter2);
  }

  const OrigRTCPeerConnection = window.RTCPeerConnection;
  if (OrigRTCPeerConnection) {
    window.RTCPeerConnection = function (config, constraints) {
      const pc = new OrigRTCPeerConnection(config, constraints);
      const originalSetConfiguration = pc.setConfiguration.bind(pc);
      pc.setConfiguration = function (cfg) {
        if (cfg && cfg.iceServers) {
          cfg.iceServers = cfg.iceServers.map(function (server) {
            const cleaned = Object.assign({}, server);
            if (cleaned.urls) {
              if (typeof cleaned.urls === 'string') {
                cleaned.urls = cleaned.urls.replace(/=[0-9.]+:[0-9]+$/, '');
              } else if (Array.isArray(cleaned.urls)) {
                cleaned.urls = cleaned.urls.map(function (url) {
                  return url.replace(/=[0-9.]+:[0-9]+$/, '');
                });
              }
            }
            return cleaned;
          });
        }
        return originalSetConfiguration(cfg);
      };
      return pc;
    };
    window.RTCPeerConnection.prototype = OrigRTCPeerConnection.prototype;
    window.RTCPeerConnection.generateCertificate = OrigRTCPeerConnection.generateCertificate;
  }
}

module.exports = { initFullStealth };
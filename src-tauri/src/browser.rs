use anyhow::{anyhow, Context, Result as AnyhowResult};
use serde::{Deserialize, Serialize};
use tauri::webview::WebviewBuilder;
use tauri::{AppHandle, Emitter, Manager, Url, WebviewUrl};

const BROWSER_WEBVIEW_LABEL: &str = "in-app-browser";
const BROWSER_PAGE_EVENT: &str = "kodeks://browser-page";
const BROWSER_INSPECT_EVENT: &str = "kodeks://browser-inspect";

const INSPECT_INIT_SCRIPT: &str = r#"
(function () {
  if (window.__KODEKS_BROWSER_INSPECT_BOOTSTRAPPED__) {
    return;
  }

  window.__KODEKS_BROWSER_INSPECT_BOOTSTRAPPED__ = true;
  window.__KODEKS_BROWSER_PICK_MODE__ = false;
  window.__KODEKS_BROWSER_HIGHLIGHTED_NODE__ = null;
  window.__KODEKS_BROWSER_HIGHLIGHTED_STYLE__ = null;
  window.__KODEKS_BROWSER_TOOLTIP_NODE__ = null;

  function textSnippet(node) {
    if (!node || typeof node.textContent !== 'string') {
      return '';
    }
    return node.textContent.replace(/\s+/g, ' ').trim().slice(0, 240);
  }

  function cssEscape(value) {
    if (window.CSS && typeof window.CSS.escape === 'function') {
      return window.CSS.escape(value);
    }
    return String(value).replace(/[^a-zA-Z0-9_-]/g, '\\$&');
  }

  function selectorFor(node) {
    if (!(node instanceof Element)) {
      return '';
    }

    if (node.id) {
      return '#' + cssEscape(node.id);
    }

    var parts = [];
    var cursor = node;
    while (cursor && cursor.nodeType === Node.ELEMENT_NODE && parts.length < 6) {
      var part = cursor.tagName.toLowerCase();
      if (cursor.classList && cursor.classList.length > 0) {
        part += '.' + Array.from(cursor.classList).slice(0, 3).map(cssEscape).join('.');
      }

      if (cursor.parentElement) {
        var siblings = Array.from(cursor.parentElement.children).filter(function (entry) {
          return entry.tagName === cursor.tagName;
        });
        if (siblings.length > 1) {
          var index = siblings.indexOf(cursor) + 1;
          part += ':nth-of-type(' + index + ')';
        }
      }

      parts.unshift(part);
      cursor = cursor.parentElement;
    }

    return parts.join(' > ');
  }

  function reactFiberFromNode(node) {
    if (!(node instanceof Element)) {
      return null;
    }

    var cursor = node;
    while (cursor && cursor.nodeType === Node.ELEMENT_NODE) {
      var keys = Object.keys(cursor);
      for (var index = 0; index < keys.length; index += 1) {
        var key = keys[index];
        if (
          key.indexOf('__reactFiber$') === 0
          || key.indexOf('__reactInternalInstance$') === 0
        ) {
          var candidate = cursor[key];
          if (candidate && typeof candidate === 'object') {
            return candidate;
          }
        }
      }
      cursor = cursor.parentElement;
    }

    return null;
  }

  function reactTypeDisplayName(type) {
    if (!type) {
      return '';
    }

    if (typeof type === 'string') {
      return type;
    }

    if (typeof type === 'function') {
      var fnName = type.displayName || type.name || '';
      return typeof fnName === 'string' ? fnName.trim() : '';
    }

    if (typeof type === 'object') {
      if (typeof type.displayName === 'string' && type.displayName.trim()) {
        return type.displayName.trim();
      }

      if (typeof type.name === 'string' && type.name.trim()) {
        return type.name.trim();
      }

      if (type.render) {
        var renderName = reactTypeDisplayName(type.render);
        if (renderName) {
          return 'ForwardRef(' + renderName + ')';
        }
      }

      if (type.type) {
        var innerName = reactTypeDisplayName(type.type);
        if (innerName) {
          return 'Memo(' + innerName + ')';
        }
      }
    }

    return '';
  }

  function isComponentDisplayName(name) {
    if (!name) {
      return false;
    }
    if (name.indexOf('Memo(') === 0 || name.indexOf('ForwardRef(') === 0) {
      return true;
    }
    return /^[A-Z]/.test(name);
  }

  function reactFiberDisplayName(fiber) {
    if (!fiber || typeof fiber !== 'object') {
      return '';
    }

    var name = reactTypeDisplayName(fiber.type || fiber.elementType || null);
    if (!name || !isComponentDisplayName(name)) {
      return '';
    }
    return name;
  }

  function normalizeComponentSourcePath(rawPath) {
    if (typeof rawPath !== 'string') {
      return '';
    }

    var value = rawPath.trim();
    if (!value) {
      return '';
    }

    if (value.indexOf('file://') === 0) {
      try {
        value = new URL(value).pathname || value;
      } catch (_) {
      }
    }

    try {
      value = decodeURIComponent(value);
    } catch (_) {
    }

    value = value
      .replace(/^webpack-internal:\/\/\/\.?\/?/, '')
      .replace(/^webpack:\/\/\/\.?\/?/, '')
      .replace(/^\/@fs\//, '/')
      .replace(/\?.*$/, '')
      .replace(/#.*$/, '')
      .replace(/\\/g, '/');

    var srcIndex = value.lastIndexOf('/src/');
    if (srcIndex >= 0) {
      return value.slice(srcIndex + 1);
    }

    var appIndex = value.lastIndexOf('/app/');
    if (appIndex >= 0) {
      return value.slice(appIndex + 1);
    }

    var componentsIndex = value.lastIndexOf('/components/');
    if (componentsIndex >= 0) {
      return value.slice(componentsIndex + 1);
    }

    if (value.startsWith('/')) {
      return value;
    }

    return value.replace(/^\.?\//, '');
  }

  function reactFiberSourcePath(fiber) {
    if (!fiber || typeof fiber !== 'object') {
      return '';
    }

    var source = fiber._debugSource;
    if (!source && fiber._debugOwner && typeof fiber._debugOwner === 'object') {
      source = fiber._debugOwner._debugSource;
    }

    if (!source || typeof source !== 'object') {
      return '';
    }

    var fileName = typeof source.fileName === 'string' ? source.fileName : '';
    return normalizeComponentSourcePath(fileName);
  }

  function reactMetadataFor(node) {
    var empty = {
      reactComponentName: null,
      reactComponentChain: [],
      reactComponentSource: null
    };

    try {
      var start = reactFiberFromNode(node);
      if (!start) {
        return empty;
      }

      var chain = [];
      var seen = new Set();
      var cursor = start;
      var depth = 0;
      var maxDepth = 120;
      var sourcePath = null;

      while (cursor && depth < maxDepth) {
        if (seen.has(cursor)) {
          break;
        }
        seen.add(cursor);

        var name = reactFiberDisplayName(cursor);
        if (name) {
          if (chain.length === 0 || chain[chain.length - 1] !== name) {
            chain.push(name);
          }
          if (!sourcePath) {
            var maybeSourcePath = reactFiberSourcePath(cursor);
            if (maybeSourcePath) {
              sourcePath = maybeSourcePath;
            }
          }
        }

        cursor = cursor.return || null;
        depth += 1;
      }

      return {
        reactComponentName: chain.length > 0 ? chain[0] : null,
        reactComponentChain: chain,
        reactComponentSource: sourcePath
      };
    } catch (_) {
      return empty;
    }
  }

  function emitSelection(payload) {
    try {
      var encoded = encodeURIComponent(JSON.stringify(payload));
      window.location.href = 'kodeks-inspect://select?payload=' + encoded;
    } catch (_) {
    }
  }

  function isToolingElement(node) {
    if (!(node instanceof Element)) {
      return false;
    }
    return !!node.closest('#eruda, .eruda-container, [id^="eruda"], #__kodeks-hunt-tooltip');
  }

  function truncateText(value, maxLength) {
    if (typeof value !== 'string') {
      return '';
    }
    if (value.length <= maxLength) {
      return value;
    }
    return value.slice(0, Math.max(0, maxLength - 1)) + '…';
  }

  function elementLabel(node) {
    if (!(node instanceof Element)) {
      return '';
    }
    var selector = selectorFor(node);
    if (selector) {
      return selector;
    }
    return node.tagName ? node.tagName.toLowerCase() : '';
  }

  function ensureTooltip() {
    var tooltip = window.__KODEKS_BROWSER_TOOLTIP_NODE__;
    if (tooltip instanceof HTMLElement && tooltip.isConnected) {
      return tooltip;
    }

    tooltip = document.createElement('div');
    tooltip.id = '__kodeks-hunt-tooltip';
    tooltip.style.position = 'fixed';
    tooltip.style.left = '0px';
    tooltip.style.top = '0px';
    tooltip.style.transform = 'translate(12px, 14px)';
    tooltip.style.zIndex = '2147483647';
    tooltip.style.pointerEvents = 'none';
    tooltip.style.maxWidth = '380px';
    tooltip.style.padding = '5px 8px';
    tooltip.style.borderRadius = '8px';
    tooltip.style.background = 'rgba(8, 10, 16, 0.92)';
    tooltip.style.border = '1px solid rgba(59, 130, 246, 0.75)';
    tooltip.style.color = '#dbeafe';
    tooltip.style.fontSize = '11px';
    tooltip.style.fontFamily = 'ui-monospace, SFMono-Regular, Menlo, Monaco, monospace';
    tooltip.style.whiteSpace = 'nowrap';
    tooltip.style.overflow = 'hidden';
    tooltip.style.textOverflow = 'ellipsis';
    tooltip.style.boxShadow = '0 10px 24px rgba(0, 0, 0, 0.35)';
    tooltip.style.display = 'none';
    (document.body || document.documentElement).appendChild(tooltip);
    window.__KODEKS_BROWSER_TOOLTIP_NODE__ = tooltip;
    return tooltip;
  }

  function hideTooltip() {
    var tooltip = window.__KODEKS_BROWSER_TOOLTIP_NODE__;
    if (tooltip instanceof HTMLElement) {
      tooltip.style.display = 'none';
    }
  }

  function showTooltip(node, clientX, clientY) {
    if (!(node instanceof Element) || isToolingElement(node)) {
      hideTooltip();
      return;
    }

    var tooltip = ensureTooltip();
    var label = truncateText(elementLabel(node), 78);
    tooltip.textContent = label || 'element';
    tooltip.style.left = String(Math.round(clientX)) + 'px';
    tooltip.style.top = String(Math.round(clientY)) + 'px';
    tooltip.style.display = 'block';
  }

  function clearHighlight() {
    var highlighted = window.__KODEKS_BROWSER_HIGHLIGHTED_NODE__;
    var previous = window.__KODEKS_BROWSER_HIGHLIGHTED_STYLE__;

    if (highlighted instanceof Element && previous) {
      highlighted.style.outline = previous.outline || '';
      highlighted.style.outlineOffset = previous.outlineOffset || '';
      highlighted.style.boxShadow = previous.boxShadow || '';
    }

    window.__KODEKS_BROWSER_HIGHLIGHTED_NODE__ = null;
    window.__KODEKS_BROWSER_HIGHLIGHTED_STYLE__ = null;
  }

  function setHighlight(node) {
    if (!(node instanceof Element) || isToolingElement(node)) {
      clearHighlight();
      return;
    }

    if (window.__KODEKS_BROWSER_HIGHLIGHTED_NODE__ === node) {
      return;
    }

    clearHighlight();

    window.__KODEKS_BROWSER_HIGHLIGHTED_STYLE__ = {
      outline: node.style.outline || '',
      outlineOffset: node.style.outlineOffset || '',
      boxShadow: node.style.boxShadow || ''
    };

    node.style.outline = '2px solid #3b82f6';
    node.style.outlineOffset = '2px';
    node.style.boxShadow = 'inset 0 0 0 1px rgba(59, 130, 246, 0.35)';
    window.__KODEKS_BROWSER_HIGHLIGHTED_NODE__ = node;
  }

  function handleHover(event) {
    if (!window.__KODEKS_BROWSER_PICK_MODE__) {
      return;
    }

    if (!(event.target instanceof Element)) {
      return;
    }

    setHighlight(event.target);
    showTooltip(event.target, event.clientX, event.clientY);
  }

  function handlePick(event) {
    if (!window.__KODEKS_BROWSER_PICK_MODE__) {
      return;
    }

    if (!(event.target instanceof Element)) {
      return;
    }

    if (isToolingElement(event.target)) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();

    var target = event.target;
    setHighlight(target);
    showTooltip(target, event.clientX, event.clientY);
    var reactMeta = reactMetadataFor(target);
    emitSelection({
      pageUrl: window.location.href,
      selector: selectorFor(target),
      tag: target.tagName ? target.tagName.toLowerCase() : '',
      id: target.id || null,
      className: target.className || null,
      textSnippet: textSnippet(target),
      reactComponentName: reactMeta.reactComponentName,
      reactComponentChain: reactMeta.reactComponentChain,
      reactComponentSource: reactMeta.reactComponentSource,
      timestamp: Date.now()
    });
  }

  document.addEventListener('mousemove', handleHover, true);
  document.addEventListener('click', handlePick, true);

  window.__KODEKS_SET_INSPECT_MODE = function (enabled) {
    window.__KODEKS_BROWSER_PICK_MODE__ = !!enabled;
    var root = document.documentElement;
    if (!root || !root.style) {
      return;
    }
    if (window.__KODEKS_BROWSER_PICK_MODE__) {
      root.style.cursor = 'crosshair';
    } else {
      root.style.cursor = '';
      clearHighlight();
      hideTooltip();
    }
  };
})();
"#;

const TOUCH_EMULATION_BOOTSTRAP_SCRIPT: &str = r#"
(function () {
  if (window.__KODEKS_TOUCH_EMULATION_BOOTSTRAPPED__) {
    return;
  }

  window.__KODEKS_TOUCH_EMULATION_BOOTSTRAPPED__ = true;

  var state = {
    enabled: false,
    listenersInstalled: false
  };

  function installMaxTouchPointsOverride() {
    try {
      Object.defineProperty(navigator, 'maxTouchPoints', {
        configurable: true,
        get: function () {
          return state.enabled ? 5 : 0;
        }
      });
    } catch (_) {
    }
  }

  function createTouch(target, source) {
    if (typeof Touch !== 'function') {
      return null;
    }

    try {
      return new Touch({
        identifier: Date.now(),
        target: target,
        clientX: source.clientX,
        clientY: source.clientY,
        screenX: source.screenX,
        screenY: source.screenY,
        pageX: source.pageX,
        pageY: source.pageY,
        radiusX: 8,
        radiusY: 8,
        rotationAngle: 0,
        force: 0.65
      });
    } catch (_) {
      return null;
    }
  }

  function createTouchEvent(type, source) {
    if (typeof TouchEvent !== 'function' || !(source.target instanceof Element)) {
      return null;
    }

    var touch = createTouch(source.target, source);
    if (!touch) {
      return null;
    }

    var activeTouches = type === 'touchend' || type === 'touchcancel' ? [] : [touch];
    try {
      return new TouchEvent(type, {
        bubbles: true,
        cancelable: true,
        composed: true,
        touches: activeTouches,
        targetTouches: activeTouches,
        changedTouches: [touch]
      });
    } catch (_) {
      return null;
    }
  }

  function dispatchSyntheticTouch(type, source) {
    if (!(source.target instanceof Element)) {
      return false;
    }

    var event = createTouchEvent(type, source);
    if (!event) {
      return false;
    }

    source.target.dispatchEvent(event);
    return true;
  }

  function handlePointer(event) {
    if (!state.enabled) {
      return;
    }

    if (event.pointerType && event.pointerType !== 'mouse' && event.pointerType !== 'pen') {
      return;
    }

    var mappedType = null;
    if (event.type === 'pointerdown') {
      mappedType = 'touchstart';
    } else if (event.type === 'pointermove') {
      mappedType = 'touchmove';
    } else if (event.type === 'pointerup') {
      mappedType = 'touchend';
    } else if (event.type === 'pointercancel') {
      mappedType = 'touchcancel';
    }

    if (!mappedType) {
      return;
    }

    var dispatched = dispatchSyntheticTouch(mappedType, event);
    if (dispatched && event.type === 'pointerdown') {
      event.preventDefault();
    }
  }

  function installListeners() {
    if (state.listenersInstalled) {
      return;
    }

    state.listenersInstalled = true;
    document.addEventListener('pointerdown', handlePointer, true);
    document.addEventListener('pointermove', handlePointer, true);
    document.addEventListener('pointerup', handlePointer, true);
    document.addEventListener('pointercancel', handlePointer, true);
  }

  function updateRootAttributes(config) {
    var root = document.documentElement;
    if (!(root instanceof HTMLElement)) {
      return;
    }

    if (state.enabled) {
      root.dataset.kodeksTouchEmulation = 'on';
      root.classList.add('kodeks-touch-emulation');
    } else {
      root.dataset.kodeksTouchEmulation = 'off';
      root.classList.remove('kodeks-touch-emulation');
    }

    if (config && typeof config.viewportPresetId === 'string' && config.viewportPresetId.trim()) {
      root.dataset.kodeksViewportPreset = config.viewportPresetId.trim();
    } else {
      root.dataset.kodeksViewportPreset = 'responsive';
    }

    if (config && typeof config.orientation === 'string' && config.orientation.trim()) {
      root.dataset.kodeksViewportOrientation = config.orientation.trim();
    } else {
      root.dataset.kodeksViewportOrientation = 'portrait';
    }
  }

  installMaxTouchPointsOverride();
  installListeners();

  window.__KODEKS_SET_TOUCH_EMULATION = function (config) {
    var normalized = config;
    if (!normalized || typeof normalized !== 'object') {
      normalized = { enabled: !!config };
    }

    state.enabled = !!normalized.enabled;
    window.__KODEKS_BROWSER_TOUCH_EMULATION__ = {
      enabled: state.enabled,
      viewportPresetId:
        typeof normalized.viewportPresetId === 'string' && normalized.viewportPresetId.trim()
          ? normalized.viewportPresetId.trim()
          : 'responsive',
      orientation:
        typeof normalized.orientation === 'string' && normalized.orientation.trim()
          ? normalized.orientation.trim()
          : 'portrait'
    };
    updateRootAttributes(window.__KODEKS_BROWSER_TOUCH_EMULATION__);
  };
})();
"#;

const CLEAR_STORAGE_SCRIPT: &str = r#"
(() => {
  try {
    window.localStorage && window.localStorage.clear();
  } catch (_) {}
  try {
    window.sessionStorage && window.sessionStorage.clear();
  } catch (_) {}
})();
"#;

const ENABLE_IN_PAGE_DEVTOOLS_SCRIPT: &str = r#"
(() => {
  const state = (window.__KODEKS_ERUDA_STATE__ = window.__KODEKS_ERUDA_STATE__ || {
    enabled: false,
    loading: false,
    initialized: false
  });
  state.enabled = true;

  const apply = () => {
    if (!window.eruda) {
      if (state.loading) {
        return;
      }
      state.loading = true;
      const script = document.createElement('script');
      script.src = 'https://cdn.jsdelivr.net/npm/eruda';
      script.async = true;
      script.onload = () => {
        state.loading = false;
        apply();
      };
      script.onerror = () => {
        state.loading = false;
        window.__KODEKS_ERUDA_LAST_ERROR__ = 'Failed to load embedded devtools';
      };
      (document.head || document.documentElement).appendChild(script);
      return;
    }

    if (!state.initialized) {
      window.eruda.init({
        autoScale: true,
        useShadowDom: true
      });
      state.initialized = true;
    }

    try {
      window.eruda.show();
    } catch (_) {}

    try {
      const entryButton = window.eruda.get && window.eruda.get('entryBtn');
      if (entryButton && typeof entryButton.hide === 'function') {
        entryButton.hide();
      }
    } catch (_) {}
  };

  apply();
})();
"#;

const DISABLE_IN_PAGE_DEVTOOLS_SCRIPT: &str = r#"
(() => {
  const state = (window.__KODEKS_ERUDA_STATE__ = window.__KODEKS_ERUDA_STATE__ || {
    enabled: false,
    loading: false,
    initialized: false
  });
  state.enabled = false;

  if (!window.eruda) {
    return;
  }

  try {
    window.eruda.hide();
  } catch (_) {}
})();
"#;

#[derive(Debug, Clone, Copy, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum BrowserClearTarget {
    Cache,
    LocalStorage,
    SystemStorage,
    Cookies,
}

#[derive(Debug, Clone, Copy, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BrowserViewport {
    pub x: f64,
    pub y: f64,
    pub width: f64,
    pub height: f64,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum BrowserViewportOrientation {
    Portrait,
    Landscape,
}

impl Default for BrowserViewportOrientation {
    fn default() -> Self {
        Self::Portrait
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BrowserEmulation {
    #[serde(default = "default_browser_viewport_preset_id")]
    pub viewport_preset_id: String,
    #[serde(default)]
    pub orientation: BrowserViewportOrientation,
    #[serde(default)]
    pub touch_enabled: bool,
}

impl Default for BrowserEmulation {
    fn default() -> Self {
        Self {
            viewport_preset_id: default_browser_viewport_preset_id(),
            orientation: BrowserViewportOrientation::default(),
            touch_enabled: false,
        }
    }
}

fn default_browser_viewport_preset_id() -> String {
    "responsive".to_string()
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BrowserPageEvent {
    pub url: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BrowserInspectEvent {
    pub page_url: String,
    pub selector: String,
    pub tag: String,
    pub id: Option<String>,
    pub class_name: Option<String>,
    pub text_snippet: Option<String>,
    pub react_component_name: Option<String>,
    #[serde(default)]
    pub react_component_chain: Vec<String>,
    pub react_component_source: Option<String>,
    pub timestamp: Option<i64>,
}

#[derive(Debug, Default)]
pub struct BrowserManager {
    visible: bool,
    inspect_mode: bool,
    in_page_devtools_open: bool,
    emulation: BrowserEmulation,
}

impl BrowserManager {
    pub fn open(&mut self, app: &AppHandle, url: &str) -> AnyhowResult<()> {
        let parsed = parse_browser_url(url)?;
        let webview = self.ensure_webview(app, parsed.clone())?;
        webview.navigate(parsed.clone())?;
        webview.show()?;
        webview.set_focus()?;
        self.visible = true;
        self.apply_inspect_mode(app)?;
        self.apply_in_page_devtools(app)?;
        self.apply_emulation(app)?;
        emit_page_event(app, parsed.as_str())
    }

    pub fn navigate(&mut self, app: &AppHandle, url: &str) -> AnyhowResult<()> {
        let parsed = parse_browser_url(url)?;
        let webview = self.ensure_webview(app, parsed.clone())?;
        webview.navigate(parsed.clone())?;
        self.apply_inspect_mode(app)?;
        self.apply_in_page_devtools(app)?;
        self.apply_emulation(app)?;
        emit_page_event(app, parsed.as_str())
    }

    pub fn reload(&mut self, app: &AppHandle) -> AnyhowResult<()> {
        let webview = self
            .current_webview(app)
            .ok_or_else(|| anyhow!("browser webview is not ready"))?;
        webview.reload()?;
        Ok(())
    }

    pub fn set_visible(&mut self, app: &AppHandle, visible: bool) -> AnyhowResult<()> {
        let Some(webview) = self.current_webview(app) else {
            self.visible = visible;
            return Ok(());
        };

        if visible {
            webview.show()?;
            webview.set_focus()?;
            self.apply_inspect_mode(app)?;
            self.apply_in_page_devtools(app)?;
            self.apply_emulation(app)?;
        } else {
            webview.hide()?;
        }

        self.visible = visible;
        Ok(())
    }

    pub fn set_bounds(&mut self, app: &AppHandle, viewport: BrowserViewport) -> AnyhowResult<()> {
        let Some(webview) = self.current_webview(app) else {
            return Ok(());
        };

        let width = viewport.width.max(1.0);
        let height = viewport.height.max(1.0);
        webview.set_position(tauri::LogicalPosition::new(viewport.x, viewport.y))?;
        webview.set_size(tauri::LogicalSize::new(width, height))?;
        Ok(())
    }

    pub fn toggle_devtools(
        &mut self,
        app: &AppHandle,
        force_open: Option<bool>,
    ) -> AnyhowResult<bool> {
        let next = force_open.unwrap_or(!self.in_page_devtools_open);
        self.in_page_devtools_open = next;
        self.apply_in_page_devtools(app)?;
        Ok(next)
    }

    pub fn set_emulation(&mut self, app: &AppHandle, emulation: BrowserEmulation) -> AnyhowResult<()> {
        self.emulation = emulation;
        self.apply_emulation(app)
    }

    pub fn clear_data(
        &mut self,
        app: &AppHandle,
        target: BrowserClearTarget,
    ) -> AnyhowResult<()> {
        let webview = self
            .current_webview(app)
            .ok_or_else(|| anyhow!("browser webview is not ready"))?;

        match target {
            BrowserClearTarget::LocalStorage => {
                webview.eval(CLEAR_STORAGE_SCRIPT)?;
                webview.reload()?;
            }
            BrowserClearTarget::Cache
            | BrowserClearTarget::SystemStorage
            | BrowserClearTarget::Cookies => {
                webview.clear_all_browsing_data()?;
                webview.reload()?;
            }
        }

        Ok(())
    }

    pub fn set_inspect_mode(&mut self, app: &AppHandle, enabled: bool) -> AnyhowResult<()> {
        self.inspect_mode = enabled;
        self.apply_inspect_mode(app)
    }

    fn apply_inspect_mode(&self, app: &AppHandle) -> AnyhowResult<()> {
        let Some(webview) = self.current_webview(app) else {
            return Ok(());
        };

        let script = format!(
            "if (window.__KODEKS_SET_INSPECT_MODE) window.__KODEKS_SET_INSPECT_MODE({});",
            if self.inspect_mode { "true" } else { "false" }
        );
        webview.eval(script)?;
        Ok(())
    }

    fn apply_in_page_devtools(&self, app: &AppHandle) -> AnyhowResult<()> {
        let Some(webview) = self.current_webview(app) else {
            return Ok(());
        };

        // Keep native inspector closed; this feature uses an embedded page inspector.
        webview.close_devtools();

        if self.in_page_devtools_open {
            webview.eval(ENABLE_IN_PAGE_DEVTOOLS_SCRIPT)?;
        } else {
            webview.eval(DISABLE_IN_PAGE_DEVTOOLS_SCRIPT)?;
        }

        Ok(())
    }

    fn apply_emulation(&self, app: &AppHandle) -> AnyhowResult<()> {
        let Some(webview) = self.current_webview(app) else {
            return Ok(());
        };

        webview.eval(TOUCH_EMULATION_BOOTSTRAP_SCRIPT)?;

        let payload = serde_json::to_string(&serde_json::json!({
            "enabled": self.emulation.touch_enabled,
            "viewportPresetId": self.emulation.viewport_preset_id.as_str(),
            "orientation": match self.emulation.orientation {
                BrowserViewportOrientation::Portrait => "portrait",
                BrowserViewportOrientation::Landscape => "landscape",
            },
        }))?;
        let script =
            format!("if (window.__KODEKS_SET_TOUCH_EMULATION) window.__KODEKS_SET_TOUCH_EMULATION({payload});");
        webview.eval(script)?;
        Ok(())
    }

    fn ensure_webview(&mut self, app: &AppHandle, initial_url: Url) -> AnyhowResult<tauri::Webview> {
        if let Some(webview) = self.current_webview(app) {
            return Ok(webview);
        }

        let window = app
            .get_window("main")
            .ok_or_else(|| anyhow!("main window is unavailable"))?;

        let inspect_app = app.clone();
        let page_app = app.clone();

        let builder = WebviewBuilder::new(BROWSER_WEBVIEW_LABEL, WebviewUrl::External(initial_url))
            .devtools(true)
            .initialization_script(INSPECT_INIT_SCRIPT)
            .on_navigation(move |url| !handle_navigation(&inspect_app, url))
            .on_page_load(move |_webview, payload| {
                let _ = emit_page_event(&page_app, payload.url().as_ref());
            });

        let webview = window.add_child(
            builder,
            tauri::LogicalPosition::new(0.0, 0.0),
            tauri::LogicalSize::new(80.0, 80.0),
        )?;
        webview.set_auto_resize(false)?;
        webview.hide()?;
        Ok(webview)
    }

    fn current_webview(&self, app: &AppHandle) -> Option<tauri::Webview> {
        app.get_webview(BROWSER_WEBVIEW_LABEL)
    }
}

fn parse_browser_url(raw: &str) -> AnyhowResult<Url> {
    let trimmed = raw.trim();
    if trimmed.is_empty() {
        return Err(anyhow!("browser URL cannot be empty"));
    }

    let parsed = Url::parse(trimmed).with_context(|| format!("invalid browser URL: {trimmed}"))?;
    if parsed.scheme() != "http" && parsed.scheme() != "https" {
        return Err(anyhow!("only http/https URLs are supported"));
    }

    Ok(parsed)
}

fn handle_navigation(app: &AppHandle, url: &Url) -> bool {
    if url.scheme() != "kodeks-inspect" {
        return false;
    }

    if let Some(payload) = decode_inspect_payload(url) {
        let _ = app.emit(BROWSER_INSPECT_EVENT, payload);
    }

    true
}

fn decode_inspect_payload(url: &Url) -> Option<BrowserInspectEvent> {
    let payload = url
        .query_pairs()
        .find_map(|(key, value)| (key == "payload").then(|| value.into_owned()))?;

    serde_json::from_str::<BrowserInspectEvent>(&payload).ok()
}

fn emit_page_event(app: &AppHandle, url: &str) -> AnyhowResult<()> {
    app.emit(
        BROWSER_PAGE_EVENT,
        BrowserPageEvent {
            url: url.to_string(),
        },
    )
    .map_err(Into::into)
}

#[cfg(test)]
mod tests {
    use super::{BrowserEmulation, BrowserInspectEvent, BrowserViewportOrientation};
    use serde_json::json;

    #[test]
    fn browser_inspect_event_deserializes_with_basic_fields() {
        let payload = json!({
            "pageUrl": "http://localhost:5173/",
            "selector": "button.primary",
            "tag": "button",
            "textSnippet": "Save",
            "id": "save-btn",
            "className": "primary"
        });

        let event: BrowserInspectEvent =
            serde_json::from_value(payload).expect("event should deserialize");
        assert_eq!(event.selector, "button.primary");
        assert_eq!(event.tag, "button");
        assert_eq!(event.text_snippet.as_deref(), Some("Save"));
        assert_eq!(event.id.as_deref(), Some("save-btn"));
        assert_eq!(event.class_name.as_deref(), Some("primary"));
        assert_eq!(event.react_component_name.as_deref(), None);
        assert!(event.react_component_chain.is_empty());
        assert_eq!(event.react_component_source.as_deref(), None);
    }

    #[test]
    fn browser_inspect_event_deserializes_with_optional_fields() {
        let payload = json!({
            "pageUrl": "http://localhost:5173/",
            "selector": "h1.hero-title",
            "tag": "h1",
            "id": "hero-title",
            "className": "hero-title",
            "textSnippet": "Hero title",
            "reactComponentName": "StatCard",
            "reactComponentChain": ["StatCard", "Home", "ClientPageRoot"],
            "reactComponentSource": "src/components/StatCard.tsx",
            "timestamp": 123456
        });

        let event: BrowserInspectEvent =
            serde_json::from_value(payload).expect("event should deserialize");
        assert_eq!(event.selector, "h1.hero-title");
        assert_eq!(event.tag, "h1");
        assert_eq!(event.id.as_deref(), Some("hero-title"));
        assert_eq!(event.class_name.as_deref(), Some("hero-title"));
        assert_eq!(event.text_snippet.as_deref(), Some("Hero title"));
        assert_eq!(event.react_component_name.as_deref(), Some("StatCard"));
        assert_eq!(
            event.react_component_chain,
            vec![
                "StatCard".to_string(),
                "Home".to_string(),
                "ClientPageRoot".to_string(),
            ]
        );
        assert_eq!(
            event.react_component_source.as_deref(),
            Some("src/components/StatCard.tsx")
        );
        assert_eq!(event.timestamp, Some(123456));
    }

    #[test]
    fn browser_emulation_deserializes_with_touch_and_orientation() {
        let payload = json!({
            "viewportPresetId": "iphone-14",
            "orientation": "landscape",
            "touchEnabled": true
        });

        let emulation: BrowserEmulation =
            serde_json::from_value(payload).expect("emulation should deserialize");
        assert_eq!(emulation.viewport_preset_id, "iphone-14");
        assert!(emulation.touch_enabled);
        assert!(matches!(
            emulation.orientation,
            BrowserViewportOrientation::Landscape
        ));
    }
}

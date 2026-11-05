/* dsh-thinking-zh client — a floating dock.
 *
 * One draggable ball lives in a page corner; clicking it opens a small panel
 * with one row per feature. The ball is mounted on <body> and positioned with
 * `position: fixed`, so it never depends on the composer's internal DOM (which
 * carries build-hashed CSS-module class names and changes between releases).
 *
 * This file is a DSH client plugin (package.json `dsh.client` +
 * `exports["./client"]`), registered through the page's module loader. That is
 * the only client path the Electron window honours: its main window loads
 * `dsh://app/`, not the HTTP origin, so `webServer.tapIndex` injection never
 * reaches it.
 *
 * Adding a feature: append a descriptor to FEATURES below and a matching
 * lib/features/<id>.js on the host side. The panel renders whatever it finds.
 */
window.__ModuleLoader__.load({
  id: 'dsh-thinking-zh',
  factory: function (require) {
    var module = { exports: {} }
    var exports = module.exports
    Object.defineProperty(exports, Symbol.toStringTag, { value: 'Module' })

  var BALL = 46
  var MARGIN = 14
  var POS_KEY = 'dsh-floatdock:pos:v1'

  var ICON_BALL =
    '<svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden="true">' +
    '<rect x="3" y="3" width="6" height="6" rx="1.8" fill="currentColor"/>' +
    '<rect x="11" y="3" width="6" height="6" rx="1.8" fill="currentColor" opacity=".5"/>' +
    '<rect x="3" y="11" width="6" height="6" rx="1.8" fill="currentColor" opacity=".5"/>' +
    '<rect x="11" y="11" width="6" height="6" rx="1.8" fill="currentColor"/>' +
    '</svg>'

  var ICON_ZH =
    '<svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">' +
    '<rect x="3.4" y="3.4" width="9.2" height="9.2" rx="1.6" stroke="currentColor" stroke-width="1.2"/>' +
    '<path d="M8 1.7v12.6" stroke="currentColor" stroke-width="1.2" stroke-linecap="round"/>' +
    '</svg>'

  var ICON_FISH =
    '<svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">' +
    '<path d="M2.7 8c1.5-2.8 3.8-4.2 6-4.2 2.3 0 4 1.5 4.7 4.2-.7 2.7-2.4 4.2-4.7 4.2-2.2 0-4.5-1.4-6-4.2Z" stroke="currentColor" stroke-width="1.2" stroke-linejoin="round"/>' +
    '<path d="M13.4 8c.8-.8 1.5-1.3 2-1.5M13.4 8c.8.8 1.5 1.3 2 1.5" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" opacity=".8"/>' +
    '<circle cx="6.2" cy="6.9" r=".8" fill="currentColor"/>' +
    '</svg>'

  var ICON_GEAR =
    '<svg width="15" height="15" viewBox="0 0 16 16" fill="none" aria-hidden="true">' +
    '<circle cx="8" cy="8" r="2.1" stroke="currentColor" stroke-width="1.25"/>' +
    '<path d="M8 1.9v1.5M8 12.6v1.5M1.9 8h1.5M12.6 8h1.5M3.7 3.7l1.1 1.1M11.2 11.2l1.1 1.1M12.3 3.7l-1.1 1.1M4.8 11.2l-1.1 1.1" stroke="currentColor" stroke-width="1.25" stroke-linecap="round"/>' +
    '</svg>'

  /* ---------------- feature registry ---------------- */

  var FEATURES = [
    {
      id: 'thinking-zh',
      title: '思考链中文',
      hint: '模型从源头用中文推理，术语保留英文',
      icon: ICON_ZH,
      api: '/dsh-thinking-zh/state',
      state: { enabled: true, mode: 'zh' },
      modes: [
        { id: 'zh', label: '中文优先' },
        { id: 'mixed', label: '中英混用' },
        { id: 'auto', label: '跟随用户' },
      ],
    },
    {
      id: 'qq-bigfish',
      title: 'QQ 大肥鱼',
      hint: '把 DeepSeek 部署到 QQ 群',
      icon: ICON_FISH,
      api: '/dsh-thinking-zh/qq-bigfish',
      // 开关走独立端点：桥接用 socialV2.paused 表示「下线」，语义与 enabled 不同。
      toggle: { path: '/dsh-thinking-zh/qq-bigfish/toggle', key: 'online', statusKey: 'online' },
      offText: '已下线',
      settings: true,
      state: { enabled: true },
    },
  ]

  var ball = null
  var panel = null
  var toastEl = null
  var toastTimer = 0
  var open = false
  var drag = null
  var lastTap = 0
  var pos = { left: 0, top: 0 }

  /* ---------------- geometry ---------------- */

  function clampPos(left, top) {
    var maxL = Math.max(MARGIN, window.innerWidth - BALL - MARGIN)
    var maxT = Math.max(MARGIN, window.innerHeight - BALL - MARGIN)
    return {
      left: Math.min(Math.max(MARGIN, left), maxL),
      top: Math.min(Math.max(MARGIN, top), maxT),
    }
  }

  function defaultPos() {
    return clampPos(window.innerWidth - BALL - 18, window.innerHeight - BALL - 132)
  }

  function loadPos() {
    try {
      var raw = JSON.parse(window.localStorage.getItem(POS_KEY) || 'null')
      if (raw && typeof raw.left === 'number' && typeof raw.top === 'number') return raw
    } catch (e) {}
    return null
  }

  function savePos() {
    try {
      window.localStorage.setItem(POS_KEY, JSON.stringify({ left: pos.left, top: pos.top }))
    } catch (e) {}
  }

  function applyPos() {
    if (!ball) return
    ball.style.left = Math.round(pos.left) + 'px'
    ball.style.top = Math.round(pos.top) + 'px'
  }

  /* ---------------- styles ---------------- */

  function injectStyle() {
    if (document.getElementById('dsh-fb-style')) return
    var style = document.createElement('style')
    style.id = 'dsh-fb-style'
    style.textContent = [
      '@keyframes dsh-fb-pop{from{opacity:0;transform:translateY(6px) scale(.97)}to{opacity:1;transform:none}}',
      '@keyframes dsh-fb-fade{from{opacity:0}to{opacity:1}}',

      '.dsh-fb-ball{position:fixed;width:' + BALL + 'px;height:' + BALL + 'px;border-radius:50%;',
      'display:grid;place-items:center;z-index:2147482000;cursor:grab;touch-action:none;user-select:none;',
      'background:var(--dsw-alias-bg-layer-2,#202024);',
      'background:color-mix(in srgb,var(--dsw-alias-bg-layer-2,#202024) 80%,transparent);',
      'border:1px solid var(--dsw-alias-border-l2,rgba(127,127,127,.26));',
      'color:var(--dsw-alias-brand-primary,#4d6bfe);',
      'box-shadow:0 8px 26px rgba(0,0,0,.3),0 1px 0 rgba(255,255,255,.06) inset;',
      'backdrop-filter:blur(12px);-webkit-backdrop-filter:blur(12px);',
      'transition:transform .16s ease,box-shadow .16s ease,border-color .16s ease;',
      'animation:dsh-fb-fade .2s ease}',
      '.dsh-fb-ball:hover{transform:scale(1.07);border-color:var(--dsw-alias-brand-primary,rgba(77,107,254,.5))}',
      '.dsh-fb-ball[data-drag="1"]{cursor:grabbing;transform:scale(1.03);transition:none}',
      '.dsh-fb-ball[data-open="1"]{border-color:var(--dsw-alias-brand-primary,rgba(77,107,254,.55))}',
      '.dsh-fb-ball svg{pointer-events:none;display:block}',

      '.dsh-fb-panel{position:fixed;z-index:2147482001;width:304px;max-width:calc(100vw - 16px);',
      'border-radius:14px;box-sizing:border-box;overflow:hidden;',
      'background:var(--dsw-alias-bg-layer-2,#202024);',
      'border:1px solid var(--dsw-alias-border-l2,rgba(127,127,127,.24));',
      'box-shadow:0 20px 52px rgba(0,0,0,.38);',
      'color:var(--dsw-alias-label-primary,#ececec);',
      'font-family:var(--dsw-font-family,inherit);font-size:13px;',
      'animation:dsh-fb-pop .16s ease}',

      '.dsh-fb-head{display:flex;align-items:center;justify-content:space-between;',
      'padding:11px 12px 9px 14px;font-size:11.5px;font-weight:600;letter-spacing:.04em;',
      'color:var(--dsw-alias-label-tertiary,#8d8d94)}',
      '.dsh-fb-x{width:22px;height:22px;border:none;border-radius:6px;background:transparent;cursor:pointer;',
      'color:var(--dsw-alias-label-tertiary,#8d8d94);display:grid;place-items:center;padding:0;font-size:15px;line-height:1}',
      '.dsh-fb-x:hover{background:var(--dsw-alias-interactive-bg-hover,rgba(127,127,127,.14));',
      'color:var(--dsw-alias-label-primary,#ececec)}',

      '.dsh-fb-sep{height:1px;background:var(--dsw-alias-border-l1,rgba(127,127,127,.18))}',

      '.dsh-fb-item{padding:2px 0 4px}',
      '.dsh-fb-row{display:flex;align-items:center;gap:10px;padding:9px 14px;cursor:pointer}',
      '.dsh-fb-row:hover{background:var(--dsw-alias-interactive-bg-hover,rgba(127,127,127,.09))}',
      '.dsh-fb-ico{flex:none;width:28px;height:28px;border-radius:8px;display:grid;place-items:center;',
      'background:var(--dsw-alias-interactive-bg-hover,rgba(127,127,127,.12));',
      'background:color-mix(in srgb,var(--dsw-alias-brand-primary,#4d6bfe) 14%,transparent);',
      'color:var(--dsw-alias-brand-primary,#4d6bfe)}',
      '.dsh-fb-ico svg{display:block}',
      '.dsh-fb-text{flex:1;min-width:0;display:flex;flex-direction:column;gap:2px}',
      '.dsh-fb-text b{font-weight:600;font-size:13px;line-height:1.35}',
      '.dsh-fb-text span{font-size:11.5px;line-height:1.4;color:var(--dsw-alias-label-tertiary,#8d8d94);',
      'overflow:hidden;text-overflow:ellipsis;white-space:nowrap}',

      '.dsh-fb-switch{flex:none;width:38px;height:21px;border-radius:999px;border:none;padding:0;cursor:pointer;',
      'background:var(--dsw-alias-border-l3,#3d3d44);position:relative;transition:background .15s ease}',
      '.dsh-fb-switch[data-on="1"]{background:var(--dsw-alias-brand-primary,#4d6bfe)}',
      '.dsh-fb-switch::after{content:"";position:absolute;top:2.5px;left:2.5px;width:16px;height:16px;',
      'border-radius:50%;background:#fff;box-shadow:0 1px 3px rgba(0,0,0,.28);transition:transform .15s ease}',
      '.dsh-fb-switch[data-on="1"]::after{transform:translateX(17px)}',

      '.dsh-fb-modes{display:flex;gap:5px;padding:0 14px 8px 52px;flex-wrap:wrap}',
      '.dsh-fb-mode{border:none;cursor:pointer;padding:4px 10px;border-radius:7px;font-size:11.5px;line-height:1.4;',
      'font-family:inherit;background:var(--dsw-alias-interactive-bg-hover,rgba(127,127,127,.13));',
      'color:var(--dsw-alias-label-secondary,#a5a5ad);transition:background .13s ease,color .13s ease}',
      '.dsh-fb-mode:hover{color:var(--dsw-alias-label-primary,#ececec)}',
      '.dsh-fb-mode[data-active="1"]{background:rgba(77,107,254,.16);',
      'background:color-mix(in srgb,var(--dsw-alias-brand-primary,#4d6bfe) 20%,transparent);',
      'color:var(--dsw-alias-brand-primary,#4d6bfe);font-weight:600}',

      '.dsh-fb-foot{padding:8px 14px 10px;font-size:11px;line-height:1.5;',
      'color:var(--dsw-alias-label-tertiary,#7f7f87);border-top:1px solid var(--dsw-alias-border-l1,rgba(127,127,127,.14))}',

      '.dsh-fb-toast{position:fixed;z-index:2147482002;transform:translateX(-50%);padding:7px 13px;',
      'border-radius:8px;background:var(--dsw-alias-tooltip-bg,rgba(0,0,0,.86));color:#fff;',
      'font-size:12.5px;line-height:1.4;font-family:var(--dsw-font-family,inherit);white-space:nowrap;',
      'pointer-events:none;transition:opacity .16s ease;max-width:74vw}',

      /* ── 设置按钮（在开关左边） ── */
      '.dsh-fb-gear{flex:none;width:26px;height:26px;border:none;border-radius:7px;background:transparent;cursor:pointer;',
      'color:var(--dsw-alias-label-tertiary,#8d8d94);display:grid;place-items:center;padding:0;transition:background .13s ease,color .13s ease}',
      '.dsh-fb-gear:hover{background:var(--dsw-alias-interactive-bg-hover,rgba(127,127,127,.16));',
      'color:var(--dsw-alias-brand-primary,#4d6bfe)}',
      '.dsh-fb-gear svg{display:block}',

      /* ── 大设置窗口 ── */
      '.dsh-fb-modal{position:fixed;inset:0;z-index:2147482100;display:grid;place-items:center;',
      'background:rgba(0,0,0,.42);-webkit-backdrop-filter:blur(2px);backdrop-filter:blur(2px);animation:dsh-fb-fade .14s ease}',
      '.dsh-fb-dialog{position:relative;width:min(940px,94vw);height:min(700px,88vh);display:flex;flex-direction:column;overflow:hidden;',
      'border-radius:16px;background:var(--dsw-alias-bg-layer-1,#17171a);',
      'border:1px solid var(--dsw-alias-border-l2,rgba(127,127,127,.26));box-shadow:0 28px 80px rgba(0,0,0,.5);',
      'color:var(--dsw-alias-label-primary,#ececec);font-family:var(--dsw-font-family,inherit);font-size:13px;',
      'animation:dsh-fb-pop .18s ease}',
      '.dsh-fb-dlg-head{display:flex;align-items:center;justify-content:space-between;padding:13px 14px 11px 16px;',
      'border-bottom:1px solid var(--dsw-alias-border-l1,rgba(127,127,127,.16))}',
      '.dsh-fb-dlg-title{display:flex;align-items:center;gap:9px}',
      '.dsh-fb-dlg-ico{display:grid;place-items:center;width:26px;height:26px;border-radius:8px;',
      'background:color-mix(in srgb,var(--dsw-alias-brand-primary,#4d6bfe) 15%,transparent);',
      'color:var(--dsw-alias-brand-primary,#4d6bfe)}',
      '.dsh-fb-dlg-ico svg{display:block}',
      '.dsh-fb-dlg-title b{font-size:14px;font-weight:600}',
      '.dsh-fb-dlg-sub{font-size:11.5px;color:var(--dsw-alias-label-tertiary,#8d8d94)}',
      '.dsh-fb-tabs{display:flex;gap:4px;padding:8px 12px 0;flex-wrap:wrap;',
      'border-bottom:1px solid var(--dsw-alias-border-l1,rgba(127,127,127,.16))}',
      '.dsh-fb-tab{border:none;background:transparent;cursor:pointer;font-family:inherit;font-size:12.5px;',
      'padding:7px 12px;border-radius:8px 8px 0 0;color:var(--dsw-alias-label-secondary,#a5a5ad)}',
      '.dsh-fb-tab:hover{color:var(--dsw-alias-label-primary,#ececec)}',
      '.dsh-fb-tab[data-active="1"]{color:var(--dsw-alias-brand-primary,#4d6bfe);font-weight:600;',
      'background:color-mix(in srgb,var(--dsw-alias-brand-primary,#4d6bfe) 11%,transparent)}',
      '.dsh-fb-dlg-body{flex:1;overflow:auto;padding:16px}',
      '.dsh-bili{max-width:860px;margin:0 auto;display:flex;flex-direction:column;gap:14px}',
      '.dsh-bili-hero{position:relative;overflow:hidden;padding:20px 22px;border-radius:16px;',
      'background:linear-gradient(115deg,rgba(244,114,160,.16),rgba(99,135,238,.11));border:1px solid rgba(235,131,168,.24)}',
      '.dsh-bili-eyebrow{font-size:10px;letter-spacing:.14em;color:#e88ba9;font-weight:700}',
      '.dsh-bili-hero h3{font-size:20px;margin:7px 0 5px;line-height:1.25;color:var(--dsw-alias-label-primary,#ececec)}',
      '.dsh-bili-hero p,.dsh-bili-sub{margin:0;color:var(--dsw-alias-label-secondary,#aaaab3);font-size:12px;line-height:1.6}',
      '.dsh-bili-badge{display:inline-flex;align-items:center;gap:6px;margin-top:12px;padding:5px 9px;border-radius:999px;',
      'background:rgba(226,161,67,.13);color:#e2ae63;font-size:11px;font-weight:600}',
      '.dsh-bili-badge.ready{background:rgba(64,170,116,.14);color:#79cd9b}',
      '.dsh-bili-card{padding:17px 18px;border:1px solid var(--dsw-alias-border-l1,rgba(127,127,127,.18));',
      'border-radius:14px;background:var(--dsw-alias-bg-layer-2,#202024)}',
      '.dsh-bili-head{display:flex;gap:12px;align-items:flex-start;justify-content:space-between;margin-bottom:14px}',
      '.dsh-bili-head h4{margin:0 0 3px;font-size:14px;font-weight:650;color:var(--dsw-alias-label-primary,#ececec)}',
      '.dsh-bili-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px}',
      '.dsh-bili-field{display:flex;flex-direction:column;gap:6px;min-width:0}',
      '.dsh-bili-field label{font-size:12px;font-weight:600;color:var(--dsw-alias-label-primary,#ececec)}',
      '.dsh-bili-field small{color:var(--dsw-alias-label-tertiary,#92929b);font-size:11px;line-height:1.45}',
      '.dsh-bili-field .dsh-fb-input{width:100%;box-sizing:border-box;min-width:0}',
      '.dsh-rhythm .wide{grid-column:1/-1}.dsh-rhythm .dsh-bili-card>.dsh-fb-input{width:100%;box-sizing:border-box}',
      '.dsh-fb-input:disabled{opacity:.55;cursor:not-allowed}',
      '.dsh-fb-toast.in-dialog{position:absolute;z-index:2;left:auto;right:16px;top:54px;transform:none;white-space:normal;max-width:calc(100% - 58px);box-shadow:0 6px 24px rgba(0,0,0,.3)}',
      '.dsh-token-log{max-height:440px;overflow:auto;border:1px solid var(--dsw-alias-border-l1,rgba(127,127,127,.18));border-radius:10px}',
      '.dsh-token-row{padding:12px 14px;border-bottom:1px solid var(--dsw-alias-border-l1,rgba(127,127,127,.14));overflow-wrap:anywhere}',
      '.dsh-token-row:last-child{border-bottom:0}.dsh-token-rowhead{display:flex;justify-content:space-between;align-items:flex-start;gap:12px;margin-bottom:5px}.dsh-token-rowhead strong{font-size:12px}',
      '.dsh-bili-toggle{display:flex;align-items:center;justify-content:space-between;gap:14px;padding:12px 13px;',
      'border-radius:10px;background:var(--dsw-alias-bg-layer-1,rgba(0,0,0,.12));cursor:pointer}',
      '.dsh-bili-toggle span{display:block;min-width:0}.dsh-bili-toggle strong{display:block;font-size:12px;font-weight:600}',
      '.dsh-bili-toggle small{display:block;font-size:11px;line-height:1.45;margin-top:3px;color:var(--dsw-alias-label-tertiary,#92929b)}',
      '.dsh-bili-toggle input{appearance:none;flex:none;width:36px;height:21px;border-radius:20px;cursor:pointer;',
      'background:rgba(127,127,127,.35);position:relative;transition:background .16s;margin:0}',
      '.dsh-bili-toggle input:before{content:"";position:absolute;left:3px;top:3px;width:15px;height:15px;border-radius:50%;background:#fff;transition:transform .16s}',
      '.dsh-bili-toggle input:checked{background:#d76d96}.dsh-bili-toggle input:checked:before{transform:translateX(15px)}',
      '.dsh-bili-toggle input:focus-visible{outline:2px solid #ed90b2;outline-offset:3px}',
      '.dsh-bili-log{max-height:230px;overflow:auto;border:1px solid var(--dsw-alias-border-l1,rgba(127,127,127,.14));border-radius:10px}',
      '.dsh-bili-logrow{display:grid;grid-template-columns:145px minmax(0,1fr) auto;gap:10px;align-items:center;padding:10px 12px;',
      'font-size:12px;border-bottom:1px solid var(--dsw-alias-border-l1,rgba(127,127,127,.12))}',
      '.dsh-bili-logrow:last-child{border-bottom:0}.dsh-bili-logtime{color:var(--dsw-alias-label-tertiary,#92929b);font-size:11px}',
      '.dsh-bili-logstate{font-size:11px;color:#80cfa5}.dsh-bili-logstate.bad{color:#e68b8b}',
      '.dsh-bili-logempty{padding:19px 14px;text-align:center;color:var(--dsw-alias-label-tertiary,#92929b);font-size:12px;line-height:1.6}',
      '.dsh-bili-qr img{display:block;margin:12px 0;border-radius:10px;background:white;padding:7px;max-width:200px;width:100%;box-sizing:border-box}',
      '@media(max-width:600px){.dsh-bili-grid{grid-template-columns:1fr}.dsh-bili-hero{padding:17px}.dsh-bili-card{padding:15px}.dsh-bili-logrow{grid-template-columns:1fr auto}.dsh-bili-logtime{grid-column:1/-1}}',
      '.dsh-fb-sec{margin-bottom:18px}',
      '.dsh-fb-sec h4{margin:0 0 9px;font-size:11.5px;font-weight:600;letter-spacing:.04em;',
      'color:var(--dsw-alias-label-tertiary,#8d8d94)}',
      '.dsh-fb-kv{display:flex;justify-content:space-between;gap:14px;padding:6px 0;font-size:12.5px;',
      'border-bottom:1px dashed var(--dsw-alias-border-l1,rgba(127,127,127,.14))}',
      '.dsh-fb-kv:last-child{border-bottom:none}',
      '.dsh-fb-kv span:first-child{color:var(--dsw-alias-label-tertiary,#8d8d94);flex:none}',
      '.dsh-fb-kv span:last-child{text-align:right;word-break:break-all}',
      '.dsh-fb-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(228px,1fr));gap:11px}',
      '.dsh-fb-field{display:flex;flex-direction:column;gap:5px}',
      '.dsh-fb-field label{font-size:11.5px;color:var(--dsw-alias-label-secondary,#a5a5ad)}',
      '.dsh-fb-field small{font-size:10.5px;line-height:1.45;color:var(--dsw-alias-label-tertiary,#7f7f87)}',
      '.dsh-fb-input,.dsh-fb-area{font-family:inherit;font-size:12.5px;box-sizing:border-box;width:100%;',
      'padding:7px 9px;border-radius:8px;border:1px solid var(--dsw-alias-border-l2,rgba(127,127,127,.3));',
      'background:var(--dsw-alias-bg-layer-2,#202024);color:var(--dsw-alias-label-primary,#ececec)}',
      '.dsh-fb-input:focus,.dsh-fb-area:focus{outline:none;border-color:var(--dsw-alias-brand-primary,#4d6bfe)}',
      '.dsh-fb-area{min-height:260px;resize:vertical;line-height:1.55;margin-top:8px;',
      'font-family:ui-monospace,SFMono-Regular,Menlo,monospace}',
      '.dsh-fb-modal button.dsh-fb-btn{border:none;cursor:pointer;font-family:inherit;font-size:12.5px;padding:8px 15px;border-radius:9px;',
      'background:#6740a7;color:#fff;font-weight:600;transition:filter .13s ease}',
      '.dsh-fb-modal button.dsh-fb-btn:hover{filter:brightness(1.12)}',
      '.dsh-fb-modal button.dsh-fb-btn:focus-visible{outline:2px solid #b983ee;outline-offset:3px}',
      '.dsh-fb-modal button.dsh-fb-btn[disabled]{opacity:.6;cursor:not-allowed;filter:none}',
      '.dsh-fb-modal button.dsh-fb-btn.ghost{background:#4b4853;color:#fff;font-weight:500}',
      '.dsh-fb-modal button.dsh-fb-btn.danger{background:#a72f3b;color:#fff}',
      '.dsh-fb-actions{display:flex;gap:8px;align-items:center;margin-top:12px;flex-wrap:wrap}',
      '.dsh-fb-check{display:flex;align-items:center;gap:8px;padding:5px 0;font-size:12.5px;line-height:1.45}',
      '.dsh-fb-dot{flex:none;width:8px;height:8px;border-radius:50%}',
      '.dsh-fb-dot.ok{background:#3fbf6f}',
      '.dsh-fb-dot.bad{background:#d64040}',
      '.dsh-fb-empty{color:var(--dsw-alias-label-tertiary,#7f7f87);font-size:12.5px;padding:8px 0;line-height:1.5}',
      '.dsh-fb-warn{color:#e0a33a;font-size:11.5px;line-height:1.55;margin-top:8px}',
      '.dsh-fb-cards{display:grid;grid-template-columns:repeat(auto-fill,minmax(162px,1fr));gap:10px}',
      '.dsh-fb-card{padding:11px 13px;border-radius:11px;background:var(--dsw-alias-bg-layer-2,#202024);',
      'border:1px solid var(--dsw-alias-border-l1,rgba(127,127,127,.16))}',
      '.dsh-fb-card b{display:block;font-size:18px;font-weight:600;margin-bottom:3px;word-break:break-all}',
      '.dsh-fb-card span{font-size:11px;color:var(--dsw-alias-label-tertiary,#8d8d94)}',
      '.dsh-fb-thumb{width:100%;height:84px;object-fit:contain;border-radius:8px;margin-bottom:8px;display:block;',
      'background:var(--dsw-alias-bg-layer-1,#17171a)}',
      '.dsh-fb-modal button.dsh-fb-mini{border:none;cursor:pointer;font-family:inherit;font-size:11px;padding:3px 8px;border-radius:6px;',
      'background:#4b4853;color:#fff;margin-right:5px;margin-top:6px;transition:filter .13s ease}',
      '.dsh-fb-modal button.dsh-fb-mini:hover{filter:brightness(1.12)}',
      '.dsh-fb-modal button.dsh-fb-mini:focus-visible{outline:2px solid #b983ee;outline-offset:3px}',
      '.dsh-fb-modal button.dsh-fb-mini.danger{background:#a72f3b;color:#fff}',
    ].join('')
    document.head.appendChild(style)
  }

  /* ---------------- state ---------------- */

  function normalizeFeatureState(feature, value) {
    var raw = value && typeof value === 'object' ? value : {}
    // statusKey 允许 feature 用别的字段名表达开关（QQ 大肥鱼用 online）
    var key = (feature.toggle && feature.toggle.statusKey) || 'enabled'
    feature.state.enabled = typeof raw[key] === 'boolean' ? raw[key] : true
    if (feature.modes) {
      var ids = feature.modes.map(function (m) { return m.id })
      feature.state.mode = ids.indexOf(raw.mode) !== -1 ? raw.mode : ids[0]
    }
  }

  function patchFeature(feature, patch, okText) {
    var prev = { enabled: feature.state.enabled, mode: feature.state.mode }
    if (typeof patch.enabled === 'boolean') feature.state.enabled = patch.enabled
    if (patch.mode) feature.state.mode = patch.mode
    renderPanel()

    // feature 可用 toggle 指定独立端点与字段名：QQ 大肥鱼的开关语义是「上线/下线」，
// 走 /qq-bigfish/toggle 且 body 为 { online: bool }，与 thinking-zh 的 { enabled } 不同。
    var target = (feature.toggle && feature.toggle.path) || feature.api
    var body = patch
    if (feature.toggle && typeof patch.enabled === 'boolean') {
      body = {}
      body[feature.toggle.key || 'online'] = patch.enabled
    }

    fetch(target, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      cache: 'no-store',
      body: JSON.stringify(body),
    })
      .then(function (res) {
        if (!res.ok) throw new Error('HTTP ' + res.status)
        return res.json()
      })
      .then(function (data) {
        if (data && data.state) normalizeFeatureState(feature, data.state)
        renderPanel()
        if (okText) toast(okText)
      })
      .catch(function () {
        feature.state.enabled = prev.enabled
        feature.state.mode = prev.mode
        renderPanel()
        toast('保存失败，请重试')
      })
  }

  function syncFeature(feature) {
    return fetch(feature.api, { cache: 'no-store' })
      .then(function (res) {
        return res.ok ? res.json() : null
      })
      .then(function (data) {
        if (!data || !data.state) return
        normalizeFeatureState(feature, data.state)
        if (open) renderPanel()
      })
      .catch(function () {})
  }

  /* ---------------- panel ---------------- */

  function togglePanel() {
    if (open) closePanel()
    else openPanel()
  }

  function openPanel() {
    if (open) return
    open = true
    ball.dataset.open = '1'

    panel = document.createElement('div')
    panel.className = 'dsh-fb-panel'
    panel.setAttribute('role', 'dialog')
    panel.setAttribute('aria-label', '小工具箱')

    var head = document.createElement('div')
    head.className = 'dsh-fb-head'
    var title = document.createElement('span')
    title.textContent = '小工具箱'
    var close = document.createElement('button')
    close.type = 'button'
    close.className = 'dsh-fb-x'
    close.setAttribute('aria-label', '关闭')
    close.textContent = '✕'
    close.addEventListener('click', function (e) {
      e.stopPropagation()
      closePanel()
    })
    head.appendChild(title)
    head.appendChild(close)

    var body = document.createElement('div')
    body.className = 'dsh-fb-body'

    var foot = document.createElement('div')
    foot.className = 'dsh-fb-foot'
    foot.textContent = '拖动小球可移动位置 · 双击小球复位'

    var sep = document.createElement('div')
    sep.className = 'dsh-fb-sep'

    panel.appendChild(head)
    panel.appendChild(body)
    panel.appendChild(sep)
    panel.appendChild(foot)
    document.body.appendChild(panel)

    renderPanel()
    positionPanel()

    setTimeout(function () {
      document.addEventListener('pointerdown', onDocDown, true)
    }, 0)
    document.addEventListener('keydown', onKeyDown, true)
    window.addEventListener('resize', positionPanel)
  }

  function closePanel() {
    if (!open) return
    open = false
    if (ball) ball.dataset.open = '0'
    if (panel && panel.parentNode) panel.parentNode.removeChild(panel)
    panel = null
    document.removeEventListener('pointerdown', onDocDown, true)
    document.removeEventListener('keydown', onKeyDown, true)
    window.removeEventListener('resize', positionPanel)
  }

  function onDocDown(e) {
    if (!open) return
    if (panel && panel.contains(e.target)) return
    if (ball && (e.target === ball || ball.contains(e.target))) return
    closePanel()
  }

  function onKeyDown(e) {
    if (e.key === 'Escape') closePanel()
  }

  function positionPanel() {
    if (!panel || !ball) return
    panel.style.visibility = 'hidden'
    panel.style.display = 'block'
    var pr = panel.getBoundingClientRect()
    var gap = 10
    var rightHalf = pos.left + BALL / 2 > window.innerWidth / 2
    var left = rightHalf ? pos.left + BALL - pr.width : pos.left
    left = Math.max(8, Math.min(window.innerWidth - pr.width - 8, left))
    var top = pos.top - pr.height - gap
    if (top < 8) top = Math.min(window.innerHeight - pr.height - 8, pos.top + BALL + gap)
    panel.style.left = Math.round(left) + 'px'
    panel.style.top = Math.round(Math.max(8, top)) + 'px'
    panel.style.visibility = 'visible'
  }

  function renderPanel() {
    if (!panel) return
    var body = panel.querySelector('.dsh-fb-body')
    if (!body) return
    body.textContent = ''
    for (var i = 0; i < FEATURES.length; i++) body.appendChild(featureItem(FEATURES[i]))
    if (open) positionPanel()
  }

  function featureItem(feature) {
    var item = document.createElement('div')
    item.className = 'dsh-fb-item'

    var row = document.createElement('div')
    row.className = 'dsh-fb-row'

    var ico = document.createElement('span')
    ico.className = 'dsh-fb-ico'
    ico.innerHTML = feature.icon

    var text = document.createElement('div')
    text.className = 'dsh-fb-text'
    var title = document.createElement('b')
    title.textContent = feature.title
    var hint = document.createElement('span')
    hint.textContent = feature.state.enabled ? feature.hint : (feature.offText || '已关闭')
    text.appendChild(title)
    text.appendChild(hint)

    var sw = document.createElement('button')
    sw.type = 'button'
    sw.className = 'dsh-fb-switch'
    sw.dataset.on = feature.state.enabled ? '1' : '0'
    sw.setAttribute('aria-pressed', feature.state.enabled ? 'true' : 'false')
    sw.setAttribute('aria-label', feature.title)

    function flip(e) {
      if (e) e.stopPropagation()
      var next = !feature.state.enabled
      patchFeature(
        feature,
        { enabled: next },
        next ? '已开启「' + feature.title + '」· 下一轮生效' : '已关闭「' + feature.title + '」'
      )
    }

    sw.addEventListener('click', flip)
    row.addEventListener('click', flip)

    row.appendChild(ico)
    row.appendChild(text)

    if (feature.settings) {
      // 齿轮必须自己 stopPropagation：整行点击是「切换开关」，
      // 不拦住的话点设置会顺手把机器人下线。
      var gear = document.createElement('button')
      gear.type = 'button'
      gear.className = 'dsh-fb-gear'
      gear.title = '打开设置'
      gear.setAttribute('aria-label', feature.title + ' · 设置')
      gear.innerHTML = ICON_GEAR
      gear.addEventListener('click', function (e) {
        e.stopPropagation()
        openSettings(feature)
      })
      row.appendChild(gear)
    }

    row.appendChild(sw)
    item.appendChild(row)

    if (feature.modes && feature.state.enabled) {
      var modes = document.createElement('div')
      modes.className = 'dsh-fb-modes'
      for (var i = 0; i < feature.modes.length; i++) {
        ;(function (mode) {
          var b = document.createElement('button')
          b.type = 'button'
          b.className = 'dsh-fb-mode'
          b.dataset.active = feature.state.mode === mode.id ? '1' : '0'
          b.textContent = mode.label
          b.addEventListener('click', function (e) {
            e.stopPropagation()
            patchFeature(feature, { enabled: true, mode: mode.id }, '已切换为「' + mode.label + '」· 下一轮生效')
          })
          modes.appendChild(b)
        })(feature.modes[i])
      }
      item.appendChild(modes)
    }

    return item
  }

  /* ---------------- settings modal ---------------- */

  var TABS = [
    { id: 'status', label: '状态' },
    { id: 'rhythm', label: '回复节奏' },
    { id: 'bili', label: 'B站' },
    { id: 'onebot-gateway', label: 'QQ 接口' },
    { id: 'xiaoheihe', label: '小黑盒' },
    { id: 'persona', label: '人格' },
    { id: 'tokens', label: 'Token 花费' },
    { id: 'stickers', label: '表情' },
    { id: 'access', label: '访问控制' },
    { id: 'backend', label: '后端' },
    { id: 'diagnose', label: '诊断' },
  ]

  // 显示时换算为分钟、秒和百分比，保存时仍用毫秒和 0~1。
  var RHYTHM_GROUPS = [
    { title: '主动聊天', fields: [
      ['proactive.enabled', '允许主动聊天', '安静一段时间后随机考虑主动开口。', 'bool', true],
      ['proactive.prompt', '主动聊天时的提示词', '模型也可以选择不发消息。', 'text', '（安静了一阵，想说什么可以说。）'],
      ['proactive.startTime', '允许发送的开始时间', '北京时间；与结束时间相同表示全天。', 'time', '00:00'],
      ['proactive.endTime', '允许发送的结束时间', '北京时间；早于开始时间表示跨午夜。', 'time', '00:00'],
      ['proactive.maxDaily', '每天最多主动几次', '北京时间自然日计算；填 0 不主动发消息。', 'number', 5],
      ['proactive.maxPerWake', '每次主动最多发几条', '按发送尝试计数，失败也占额度。', 'number', 1],
      ['proactive.checkIntervalMinMs', '检查间隔最短（分钟）', '在最短与最长间隔之间随机选择。', 'minutes', 1800000],
      ['proactive.checkIntervalMaxMs', '检查间隔最长（分钟）', '检查不代表一定发送消息。', 'minutes', 5400000],
      ['proactive.idleThresholdMs', '聊天安静多久后考虑主动（分钟）', '近期有互动时实际触发概率还会降低。', 'minutes', 900000],
      ['proactive.probability', '每次检查的基础触发概率（%）', '例如 30 表示 30%；实际概率可能调整。', 'percent', 0.3],
    ] },
    { title: '收到消息后', fields: [
      ['autoReplyCheckMs', '旧版消息轮询间隔（秒）', '当前使用消息事件驱动，此旧选项已停用，仅保留历史值。', 'seconds'],
      ['replyCheck.windowMs', '回复后继续留意的时长（秒）', '仅私聊：窗口内收到回应时唤醒，没人回应不会空转。范围 5～300 秒。', 'seconds', 90000],
      ['wake.batchWindowMs', '默认消息合并窗口（秒）', '群聊：从触发唤醒的第一条消息起固定等待，不因新消息延长。私聊未单独设置时也使用此时长，但会按私聊规则重新计时；会话单独配置优先。', 'seconds'],
      ['wake.batchWindowMsPrivate', '私聊：最后一条消息后的等待时间（秒）', '私聊收到新文字或图片后重新计时；累计等待上限为 30 秒或此设置值中的较大者。填 0 使用默认窗口时长，仍按私聊规则计时。', 'seconds'],
      ['wait.defaultMs', '等待新消息的默认时长（秒）', '模型使用等待消息工具时的默认值。', 'seconds'],
      ['wait.defaultQuietMs', '判断对方说完的安静时间（秒）', '连续安静这么久后认为对方暂时说完。', 'seconds'],
      ['wake.maxWakePerHour', '每小时最多唤醒次数', '限制反复唤醒；私聊如有独立上限，以私聊值为准。'],
      ['context.recentLimit', '保留的近期聊天条数', '限制近期消息缓存；每轮实际带入条数仍受上下文设置约束。'],
    ] },
    { title: '发送消息', fields: [
      ['send.firstReplyMinMs','收到消息后，首次回复至少等待（秒）','用于私聊；从最后一条来信起算，处理时间也算。填 0 不额外等待，与连续发言间隔独立。','seconds',0],
      ['send.enforceMinimumGap','不同发送调用也遵守最短间隔','文字、表情等连续发送均受约束。','bool',true],
      ['send.burstMaxMessages', '一轮回复最多拆成几条', '限制一次回复拆分出的消息数。'],
      ['send.burstIntervalMinMs', '机器人连续发言最短间隔（秒）', '多条消息自动发送时，在最短与最长间隔之间随机选择。', 'seconds'],
      ['send.burstIntervalMaxMs', '两条消息最长间隔（秒）', '自动间隔的上限；工具指定间隔或较长停顿策略可单独调整。', 'seconds'],
      ['send.maxSendPerMinute', '每分钟最多发送几条', '达到上限后会限流。'],
      ['send.maxSendPerHour', '每小时最多发送几条', '达到上限后会限流。'],
      ['send.maxMessageChars', '单条消息最多字数', '超过上限的工具发送会被拒绝，模型需要缩短或拆分。'],
    ] },
    { title: '上下文与执行预算', fields: [
      ['compaction.enabled','自动整理上下文','在安全边界压缩历史，保留角色和记忆。','bool',true],
      ['compaction.thresholdTokens','整理软阈值（输入 Token）','达到后在闲置边界整理。','number',40000],
      ['compaction.hardThresholdTokens','下一轮输入硬上限','超过后先整理再继续；整理失败保留消息并显示原因。','number',80000],
      ['compaction.idleMs','闲置多久后整理（分钟）','不打断正在执行的工具。','minutes',300000],
      ['economy.enabled','限制单轮执行预算','限制模型往返和重复失败，避免失控循环。','bool',true],
      ['economy.chatMaxRequests','普通聊天每轮最多请求','不是 QQ 消息条数；包含工具后续决策。','number',8],
      ['economy.chatMaxInputTokens','普通聊天每轮输入预算','按已完成请求累计，允许正在执行的一次完成。','number',400000],
      ['economy.ownerTaskMode','主人私聊使用任务预算','复杂工作时开启，普通聊天建议关闭；不改变工具权限。','bool',false],
      ['economy.taskMaxRequests','任务每轮最多请求','用于后台 B 站父协调与主人任务模式。','number',40],
      ['economy.taskMaxInputTokens','任务每轮输入预算','独立于主动聊天次数和 B 站每日次数。','number',1500000],
      ['economy.biliMaxRequests','B站子任务每轮最多请求','独立于每日次数和时长限制。','number',40],
      ['economy.biliMaxInputTokens','B站子任务每轮输入预算','保留主人手动刷站的每日次数和时长豁免。','number',1500000],
      ['economy.maxRepeatedFailures','同一工具失败上限','达到后停止本轮，避免反复重试。','number',2],
      ['economy.maxModelFailures','连续模型失败上限','包括服务异常，限制单步重试。','number',2],
    ] },
    { title: 'QQ 空间', fields: [
      ['qzone.enabled', '允许发布说说', '开启只代表允许发布，不会自动创建定时任务。', 'bool'],
      ['qzone.maxPerDay', '每天最多发布几条说说', '这是上限，不是必须发布的数量。'],
    ] },
  ]

  var modal = null
  var mState = { feature: null, tab: 'status', data: {}, note: '' }
  var tokenQuery = { window: 'today', view: 'turns', category: 'all', offset: 0 }

  function fetchJson(url, options) {
    return fetch(url, options || { cache: 'no-store' })
      .then(function (res) { return res.json().catch(function () { return null }) })
      .catch(function () { return null })
  }

  function postJson(url, body) {
    return fetchJson(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      cache: 'no-store',
      body: JSON.stringify(body || {}),
    })
  }

  function h(tag, cls, text) {
    var el = document.createElement(tag)
    if (cls) el.className = cls
    if (text !== undefined && text !== null) el.textContent = text
    return el
  }

  function section(titleText, nodes) {
    var s = h('div', 'dsh-fb-sec')
    s.appendChild(h('h4', null, titleText))
    for (var i = 0; i < nodes.length; i++) s.appendChild(nodes[i])
    return s
  }

  function kv(k, v) {
    var row = h('div', 'dsh-fb-kv')
    row.appendChild(h('span', null, k))
    row.appendChild(h('span', null, (v === undefined || v === null || v === '') ? '—' : String(v)))
    return row
  }

  function statusLine(text, ok) {
    var row = h('div', 'dsh-fb-check')
    row.appendChild(h('span', 'dsh-fb-dot ' + (ok ? 'ok' : 'bad')))
    row.appendChild(h('span', null, text))
    return row
  }

  function actionsRow(buttons) {
    var row = h('div', 'dsh-fb-actions')
    for (var i = 0; i < buttons.length; i++) {
      (function (spec) {
        var b = h('button', 'dsh-fb-btn' + (spec.ghost ? ' ghost' : '') + (spec.danger ? ' danger' : ''), spec.label)
        b.type = 'button'
        b.addEventListener('click', spec.onClick)
        row.appendChild(b)
      })(buttons[i])
    }
    return row
  }

  function openSettings(feature) {
    closeSettings()
    closePanel()
    mState.feature = feature
    mState.tab = 'status'
    mState.data = {}
    mState.note = ''

    var wrap = h('div', 'dsh-fb-modal')
    wrap.setAttribute('role', 'dialog')
    wrap.setAttribute('aria-modal', 'true')
    wrap.setAttribute('aria-label', feature.title + ' 设置')
    wrap.addEventListener('click', function (e) { if (e.target === wrap) closeSettings() })

    var dlg = h('div', 'dsh-fb-dialog')
    var head = h('div', 'dsh-fb-dlg-head')
    var title = h('div', 'dsh-fb-dlg-title')
    var ico = h('span', 'dsh-fb-dlg-ico')
    ico.innerHTML = feature.icon
    title.appendChild(ico)
    title.appendChild(h('b', null, feature.title))
    title.appendChild(h('span', 'dsh-fb-dlg-sub', '设置'))
    var x = h('button', 'dsh-fb-x', '✕')
    x.type = 'button'
    x.setAttribute('aria-label', '关闭')
    x.addEventListener('click', closeSettings)
    head.appendChild(title)
    head.appendChild(x)

    var tabs = h('div', 'dsh-fb-tabs')
    var body = h('div', 'dsh-fb-dlg-body')
    dlg.appendChild(head)
    dlg.appendChild(tabs)
    dlg.appendChild(body)
    wrap.appendChild(dlg)
    document.body.appendChild(wrap)
    modal = { wrap: wrap, tabs: tabs, body: body }

    document.addEventListener('keydown', onModalKey, true)
    renderTabs()
    loadTab('status')
  }

  function closeSettings() {
    if (!modal) return
    document.removeEventListener('keydown', onModalKey, true)
    if (modal.wrap.parentNode) modal.wrap.parentNode.removeChild(modal.wrap)
    modal = null
  }

  function onModalKey(e) {
    if (e.key === 'Escape') {
      e.stopPropagation()
      closeSettings()
    }
  }

  function renderTabs() {
    if (!modal) return
    modal.tabs.textContent = ''
    for (var i = 0; i < TABS.length; i++) {
      (function (tab) {
        var b = h('button', 'dsh-fb-tab', tab.label)
        b.type = 'button'
        b.dataset.active = mState.tab === tab.id ? '1' : '0'
        b.addEventListener('click', function () { loadTab(tab.id) })
        modal.tabs.appendChild(b)
      })(TABS[i])
    }
  }

  function setBody(nodes) {
    if (!modal) return
    modal.body.textContent = ''
    for (var i = 0; i < nodes.length; i++) modal.body.appendChild(nodes[i])
  }

  function loadTab(tabId) {
    mState.tab = tabId
    mState.note = ''
    renderTabs()
    setBody([h('div', 'dsh-fb-empty', '加载中…')])
    var f = mState.feature
    var url = f.api
    if (tabId === 'rhythm') url = f.api + '/settings'
    else if (tabId === 'bili') url = f.api + '/bili'
    else if (tabId === 'onebot-gateway') url = f.api + '/onebot-gateway'
    else if (tabId === 'xiaoheihe') url = f.api + '/xiaoheihe'
    else if (tabId === 'persona') url = f.api + '/persona'
    else if (tabId === 'tokens') url = f.api + '/tokens?' + Object.keys(tokenQuery).map(function (key) { return encodeURIComponent(key) + '=' + encodeURIComponent(tokenQuery[key]) }).join('&')
    else if (tabId === 'stickers') url = f.api + '/stickers'
    else if (tabId === 'access') url = f.api + '/access'
    else if (tabId === 'backend') url = f.api + '/backend'
    else if (tabId === 'diagnose') url = f.api + '/diagnose'
    fetchJson(url).then(function (data) {
      if (!modal) return
      // 竞态守卫：慢页签（「后端」要 spawn PowerShell，可能 1~3 秒）的响应
      // 常常在用户已经切走之后才回来；若无条件写入 mState.data，
      // 就会拿旧页签的数据去渲染新页签（表现为"诊断"页签只剩标题）。
      if (mState.tab !== tabId) return
      mState.data = data || {}
      renderTab()
    })
  }

  function renderTab() {
    if (!modal) return
    var d = mState.data
    if (!d || d.ok === false) {
      setBody([
        h('div', 'dsh-fb-empty', '读不到数据'),
        h('div', 'dsh-fb-warn', (d && d.error) || '未知错误（桥接可能没有运行）'),
        actionsRow([{ label: '重试', onClick: function () { loadTab(mState.tab) } }]),
      ])
      return
    }
    if (mState.tab === 'status') return renderStatusTab(d)
    if (mState.tab === 'rhythm') return renderRhythmTab(d)
    if (mState.tab === 'bili') return renderBiliTab(d)
    if (mState.tab === 'onebot-gateway') return renderOnebotGatewayTab(d)
    if (mState.tab === 'xiaoheihe') return renderXiaoheiheTab(d)
    if (mState.tab === 'persona') return renderPersonaTab(d)
    if (mState.tab === 'tokens') return renderTokensTab(d)
    if (mState.tab === 'stickers') return renderStickersTab(d)
    if (mState.tab === 'access') return renderAccessTab(d)
    if (mState.tab === 'backend') return renderBackendTab(d)
    if (mState.tab === 'diagnose') return renderDiagnoseTab(d)
  }

  function renderBiliTab(d) {
    var cfg = JSON.parse(JSON.stringify(d.config || {}))
    var root = h('div', 'dsh-bili')
    var hero = h('div', 'dsh-bili-hero')
    hero.appendChild(h('div', 'dsh-bili-eyebrow', 'BILIBILI · 探索设置'))
    hero.appendChild(h('h3', null, '让大肥鱼去 B 站看看'))
    hero.appendChild(h('p', null, '设置感兴趣的内容、浏览节奏和互动范围。'))
    hero.appendChild(h('div', 'dsh-bili-badge' + (d.implementationReady ? ' ready' : ''), d.implementationReady ? '● 刷站任务已接入' : '● 刷站任务尚未接入 · 自动刷站暂不会运行'))
    if (d.automation) {
      var today = new Date().toLocaleDateString('sv-SE', { timeZone: 'Asia/Shanghai' })
      var runStatus = { reserved: '正在派发子任务', running: '子 Agent 正在浏览', stopping: '到时停止中' }[d.automation.active] || '等待下一次安排'
      hero.appendChild(h('p', 'dsh-bili-sub', runStatus + ' · 今天已安排 ' + ((d.automation.counts || {})[today] || 0) + ' / ' + cfg.dailyRuns + ' 次'))
    }
    root.appendChild(hero)

    function card(title, description) {
      var box = h('section', 'dsh-bili-card'), head = h('div', 'dsh-bili-head'), titleBox = h('div')
      titleBox.appendChild(h('h4', null, title)); titleBox.appendChild(h('p', 'dsh-bili-sub', description)); head.appendChild(titleBox); box.appendChild(head)
      return box
    }
    function fields(box, specs) {
      var grid = h('div', 'dsh-bili-grid')
      specs.forEach(function (f) {
        var value = getPath(cfg, f[0]), input = h('input', f[2] === 'bool' ? '' : 'dsh-fb-input')
        input.dataset.biliKey = f[0]; input.dataset.biliType = f[2]
        if (f[2] === 'bool') {
          input.type = 'checkbox'; input.checked = value === true
          var toggle = h('label', 'dsh-bili-toggle'), info = h('span')
          info.appendChild(h('strong', null, f[1])); info.appendChild(h('small', null, f[3])); toggle.appendChild(info); toggle.appendChild(input); grid.appendChild(toggle)
        } else {
          input.type = f[2] === 'number' ? 'number' : 'text'
          input.value = Array.isArray(value) ? value.join(', ') : String(value == null ? '' : value)
          if (f[2] === 'number') { input.min = f[0] === 'durationMinutes' ? '1' : '0'; input.max = f[0] === 'durationMinutes' ? '1440' : '100'; input.step = '1' }
          var field = h('div', 'dsh-bili-field'), label = h('label', null, f[1])
          var inputId = 'bili-' + f[0].replace(/\./g, '-')
          input.id = inputId; label.htmlFor = inputId
          field.appendChild(label); field.appendChild(input); field.appendChild(h('small', null, f[3])); grid.appendChild(field)
        }
      })
      box.appendChild(grid); root.appendChild(box)
    }
    fields(card('浏览安排', '设置自主浏览的开关和上限。主人主动发起的任务不占自动额度。'), [
      ['enabled', '启用 B站功能', 'bool', '允许使用 B 站功能。'], ['autoEnabled', '允许自主刷站', 'bool', '无需等待你的消息，自主安排浏览。'],
      ['dailyRuns', '每天最多刷几次', 'number', '按北京时间自然日计算。'], ['durationMinutes', '每次最长分钟数', 'number', '从子 Agent 实际开始执行时计时。'],
    ])
    fields(card('发现内容', '选择想关注的方向；没有字幕的视频会跳过。'), [
      ['sources.keywords', '搜索关键词', 'list', '多个关键词用逗号分隔。'], ['sources.followUids', 'UP 主 UID', 'list', '多个 UID 用逗号分隔。'],
      ['sources.recommendations', '使用推荐流', 'bool', '把推荐视频加入候选内容。'],
    ])
    fields(card('互动范围', '选择允许的互动方式，并设置每天的上限。'), [
      ['interactions.likeEnabled', '允许点赞', 'bool', '自主判断是否为视频点赞。'], ['interactions.commentEnabled', '允许评论', 'bool', '自主判断是否参与评论。'],
      ['interactions.likeDailyLimit', '每天最多点赞数', 'number', '填 0 表示不点赞。'], ['interactions.commentDailyLimit', '每天最多评论数', 'number', '填 0 表示不评论。'],
      ['interactions.mentionEnabled', '允许 @', 'bool', '评论时仅可 @ 名单中的账号。'], ['interactions.mentionUids', '允许 @ 的 UID', 'list', '多个 UID 用逗号分隔；名单为空时不能开启。'],
      ['interactions.dmEnabled', '允许发送 B站私信', 'bool', '仅能向名单中的账号发送，默认关闭。'], ['interactions.dmDailyLimit', '每天最多私信数', 'number', '按北京时间计算，填 0 表示不发送。'],
      ['interactions.dmUids', '允许私信的 UID', 'list', '多个 UID 用逗号分隔；名单为空时不能开启。'],
      ['interactions.dmReadEnabled', '允许读取 B站私信', 'bool', '只读取名单内的会话，默认关闭。'], ['interactions.dmReadUids', '允许读取会话的 UID', 'list', '多个 UID 用逗号分隔；名单为空时不能开启。'],
    ])
    root.appendChild(actionsRow([{ label: '保存 B站设置', onClick: function () {
      var inputs = modal.body.querySelectorAll('input[data-bili-key]')
      for (var i = 0; i < inputs.length; i++) {
        var x = inputs[i], parts = x.dataset.biliKey.split('.'), obj = cfg
        for (var j = 0; j < parts.length - 1; j++) obj = obj[parts[j]]
        if (x.dataset.biliType === 'number' && (!x.value || !x.validity.valid)) { toast('请检查次数和时长'); x.focus(); return }
        obj[parts[parts.length - 1]] = x.dataset.biliType === 'bool' ? x.checked : x.dataset.biliType === 'list' ? x.value.split(/[,，\n]/).map(function (v) { return v.trim() }).filter(Boolean) : Number(x.value)
      }
      postJson(mState.feature.api + '/bili', { action: 'save', config: cfg }).then(function (r) { toast(r && r.ok ? 'B站设置已保存' : ((r && r.error) || '保存失败')) })
    }}]))
    var login = card('B站账号', '使用独立账号扫码登录，登录信息保存在服务器。')
    var loginStatus = h('div', 'dsh-bili-sub', '正在检查登录状态…')
    loginStatus.setAttribute('aria-live', 'polite')
    login.appendChild(loginStatus)
    function refreshLoginStatus() {
      loginStatus.textContent = '正在检查登录状态…'
      postJson(mState.feature.api + '/bili', { action: 'status' }).then(function (r) {
        if (!modal || mState.tab !== 'bili') return
        if (!r || !r.ok || !r.result) { loginStatus.textContent = '登录状态暂时不可用，请稍后重试。'; return }
        var result = r.result
        loginStatus.textContent = result.logged_in === true ? '● 已登录' + (result.username ? ' · ' + result.username : '') : '● 未登录或登录状态无法验证，请重新扫码或稍后重试。'
      })
    }
    var qr = h('div', 'dsh-bili-qr dsh-bili-sub', '需要登录时，点击下方按钮获取二维码。')
    login.appendChild(qr)
    login.appendChild(actionsRow([{ label: '获取登录二维码', onClick: function () {
      postJson(mState.feature.api + '/bili', { action: 'start' }).then(function (r) {
        if (!r || !r.ok) { toast((r && r.error) || '获取二维码失败'); return }
        var data = r.result || {}; qr.textContent = data.message || data.status || ''
        if (typeof data.qrcode_image === 'string' && /^data:image\/png;base64,[A-Za-z0-9+/=]+$/.test(data.qrcode_image)) { var img = document.createElement('img'); img.src = data.qrcode_image; img.alt = 'B站登录二维码'; qr.appendChild(img) }
      })
    } }, { label: '确认扫码结果', ghost: true, onClick: function () {
      postJson(mState.feature.api + '/bili', { action: 'check' }).then(function (r) { qr.textContent = r && r.ok ? ((r.result && (r.result.message || r.result.status)) || '已检查') : ((r && r.error) || '检查失败'); if (r && r.ok && r.result && (r.result.status === 'done' || r.result.status === 'already_logged_in')) refreshLoginStatus() })
    } }, { label: '刷新登录状态', ghost: true, onClick: refreshLoginStatus }]))
    root.appendChild(login)

    var logs = card('刷视频日志', '显示视频读取、点赞、评论、回复和私信的记录。')
    var logBox = h('div', 'dsh-bili-log'); logBox.setAttribute('aria-live', 'polite'); logs.appendChild(logBox)
    function refreshLogs() {
      logBox.textContent = ''; logBox.appendChild(h('div', 'dsh-bili-logempty', '正在加载日志…'))
      fetchJson(mState.feature.api + '/bili?view=logs').then(function (r) {
        if (!modal || mState.tab !== 'bili') return
        logBox.textContent = ''
        if (!r || !r.ok) { logBox.appendChild(h('div', 'dsh-bili-logempty', (r && r.error) || '日志暂时不可用')); return }
        if (!Array.isArray(r.entries) || !r.entries.length) { logBox.appendChild(h('div', 'dsh-bili-logempty', '暂无刷视频记录。')); return }
        r.entries.forEach(function (entry) {
          var row = h('div', 'dsh-bili-logrow'), stamp = new Date(entry.time)
          row.appendChild(h('span', 'dsh-bili-logtime', isNaN(stamp.getTime()) ? '—' : stamp.toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai', hour12: false })))
          var detail = h('div')
          detail.appendChild(h('span', null, entry.action || 'B站操作'))
          if (typeof entry.bvid === 'string' && /^BV[0-9A-Za-z]{10}$/.test(entry.bvid)) {
            var link = h('a', null, entry.bvid); link.href = 'https://www.bilibili.com/video/' + entry.bvid; link.target = '_blank'; link.rel = 'noopener noreferrer'; link.style.marginLeft = '8px'; link.style.color = '#e88ba9'; detail.appendChild(link)
          }
          if (entry.replyTo) detail.appendChild(h('div', 'dsh-bili-sub', (entry.action === '私信' ? '收件人：' : '回复对象：') + entry.replyTo))
          if (Array.isArray(entry.mentionUids) && entry.mentionUids.length) detail.appendChild(h('div', 'dsh-bili-sub', '@ UID：' + entry.mentionUids.join('、')))
          if (entry.content) detail.appendChild(h('div', 'dsh-bili-sub', '内容：' + entry.content))
          row.appendChild(detail)
          row.appendChild(h('span', 'dsh-bili-logstate' + (entry.state === '失败' ? ' bad' : ''), entry.state || '—'))
          logBox.appendChild(row)
        })
      })
    }
    logs.appendChild(actionsRow([{ label: '刷新日志', ghost: true, onClick: refreshLogs }]))
    root.appendChild(logs)
    setBody([root]); refreshLogs(); refreshLoginStatus()
  }

  function renderStatusTab(d) {
    var online = d.online === true
    var sl = d.snowluma || {}
    var nodes = []

    var btn = h('button', 'dsh-fb-btn' + (online ? ' ghost' : ''), online ? '下线（暂停机器人）' : '上线（恢复机器人）')
    btn.type = 'button'
    btn.addEventListener('click', function () {
      btn.disabled = true
      btn.textContent = '处理中…'
      postJson(mState.feature.toggle.path, { online: !online }).then(function (r) {
        toast(r && r.ok ? (online ? '机器人已下线' : '机器人已上线') : '操作失败')
        loadTab('status')
        syncFeature(mState.feature)
      })
    })
    nodes.push(section('开关', [btn]))

    // SnowLuma 区块**常驻显示**（不只是未运行时）。
    // 早先写成「仅在 sl.connected !== true 时显示」，结果用户点开找不到启动选项 ——
    // 那时它恰好在运行；更糟的是桥接若没跑，整页都读不到数据，连区块都渲染不出来。
    // 现在标题与按钮随状态变化，入口永远在。
    var slRunning = sl.connected === true
    var slRow = h('div', 'dsh-fb-actions')
    if (!slRunning) {
      var launchBtn = h('button', 'dsh-fb-btn', '启动 SnowLuma')
      launchBtn.type = 'button'
      launchBtn.addEventListener('click', function () {
        launchBtn.disabled = true
        launchBtn.textContent = '启动中…（等到桥接连上，最多 90 秒）'
        postJson(mState.feature.api + '/launch-snowluma', {}).then(function (res) {
          toast(res && res.ok ? (res.message || '已启动') : ((res && res.error) || '启动失败'))
          loadTab('status')
        })
      })
      slRow.appendChild(launchBtn)
    } else {
      slRow.appendChild(h('span', 'dsh-fb-check-ok', '✓ 运行中'))
    }
    var webuiBtn = h('button', 'dsh-fb-btn ghost', '打开 WebUI')
    webuiBtn.type = 'button'
    webuiBtn.addEventListener('click', function () {
      fetchJson(mState.feature.api + '/open-snowluma?target=webui').then(function (res) {
        toast(res && res.ok ? '已打开 WebUI' : ((res && res.error) || '打开失败'))
      })
    })
    var dirBtn = h('button', 'dsh-fb-btn ghost', '打开目录')
    dirBtn.type = 'button'
    dirBtn.addEventListener('click', function () {
      fetchJson(mState.feature.api + '/open-snowluma?target=dir').then(function (res) {
        toast(res && res.ok ? '已打开目录' : ((res && res.error) || '打开失败'))
      })
    })
    slRow.appendChild(webuiBtn)
    slRow.appendChild(dirBtn)
    nodes.push(section(slRunning ? 'SnowLuma（运行中）' : 'SnowLuma（未运行）', [
      slRow,
      h('div', 'dsh-fb-warn', slRunning
        ? '进程在跑，但是否能收 QQ 消息要看账号是否在线 —— 见上面的自检。'
        : '启动的是你本机已安装的 SnowLuma（路径取自 config.json 的 snowluma.launcherPath），本工具不包含也不分发它。若启动后仍收不到 QQ 消息，通常是要去 WebUI 扫码登录。'),
    ]))

    nodes.push(section('自检', [
      statusLine('DSH 已就绪' + (d.mode ? '（模式 ' + d.mode + '）' : ''), d.dshReady === true),
      statusLine('SnowLuma 已连接' + (sl.accountOnline ? '（账号在线）' : ''), sl.connected === true),
      statusLine('SnowLuma 上游健康' + (sl.goodSource ? '（来源 ' + sl.goodSource + '）' : ''), sl.good === true),
      statusLine('机器人上线中', online),
    ]))

    nodes.push(section('连接信息', [
      kv('桥接目录', d.bridge && d.bridge.dir),
      kv('控制台', d.bridge && d.bridge.consoleUrl),
      kv('DSH 地址', d.bridge && d.bridge.baseUrl),
      kv('管理员 QQ', d.ownerQQ),
      kv('私聊白名单', (d.allowPrivate || []).join('、')),
      kv('群白名单', (d.allowGroups || []).length ? d.allowGroups.join('、') : '（未接入任何群）'),
      kv('当前角色', d.role || '（未启用角色扮演）'),
      kv('角色模式', d.roleMode),
    ]))

    if (sl.hint) nodes.push(h('div', 'dsh-fb-warn', 'SnowLuma 提示：' + sl.hint))
    setBody(nodes)
  }

  function getPath(obj, pathStr) {
    var parts = pathStr.split('.')
    var cur = obj
    for (var i = 0; i < parts.length; i++) {
      if (cur === null || cur === undefined || typeof cur !== 'object') return undefined
      cur = cur[parts[i]]
    }
    return cur
  }

  function renderRhythmTab(d) {
    var r = d.rhythm || {}
    var nodes = []
    var root = h('div', 'dsh-bili dsh-rhythm')
    var hero = h('div', 'dsh-bili-hero')
    hero.appendChild(h('div', 'dsh-bili-eyebrow', 'QQ · 对话设置'))
    hero.appendChild(h('h3', null, '让聊天按你的节奏来'))
    hero.appendChild(h('p', null, '调整思考强度、主动聊天、消息等待与发送频率。'))
    hero.appendChild(h('div', 'dsh-bili-badge ready', '● 节奏设置保存后生效 · 思考强度单独保存'))
    root.appendChild(hero)
    function rhythmCard(title, children) {
      var box = h('section', 'dsh-bili-card'), head = h('div', 'dsh-bili-head')
      head.appendChild(h('h4', null, title)); box.appendChild(head)
      children.forEach(function (child) { box.appendChild(child) })
      return box
    }
    if (d.optimization && Array.isArray(d.optimization.conversations)) {
      var statusRows = d.optimization.conversations.map(function (row) {
        var text = row.key + ' · 上次输入 ' + Number(row.contextTokens || 0).toLocaleString() + ' Token'
        if (row.compacting) text += ' · 正在整理'
        else if (row.measuredAfterCompaction === false) text += ' · 已整理，等待下一次请求测量'
        if (row.contextBlocked) text += ' · ' + row.contextBlocked
        if (row.lastBudgetLimit) text += ' · 最近停止原因：' + row.lastBudgetLimit.reason
        return h('p', 'dsh-bili-sub', text)
      })
      if (statusRows.length) nodes.push(rhythmCard('执行状态', statusRows))
    }
    var model = d.model
    if (model && Array.isArray(model.options)) {
      var select = h('select', 'dsh-fb-input')
      select.setAttribute('aria-label', '思考强度')
      var names = { low: '低', high: '高', max: '最高' }
      model.options.forEach(function (value) {
        var option = h('option', null, (names[value] || value) + '（' + value + '）')
        option.value = value; select.appendChild(option)
      })
      if (model.options.indexOf(model.reasoningEffort) < 0) {
        var current = h('option', null, '当前：' + model.reasoningEffort)
        current.value = model.reasoningEffort; select.appendChild(current)
      }
      select.value = model.reasoningEffort
      var saveEffort = h('button', 'dsh-fb-btn', '保存思考强度')
      saveEffort.type = 'button'
      saveEffort.addEventListener('click', function () {
        saveEffort.disabled = true
        postJson(mState.feature.api + '/settings', { action: 'set-effort', reasoningEffort: select.value }).then(function (res) {
          saveEffort.disabled = false
          toast(res && res.ok ? '思考强度已保存，下一次会话处理时应用' : ((res && res.error) || '保存失败'))
          if (res && res.ok) loadTab('rhythm')
        })
      })
      var effortActions = h('div', 'dsh-fb-actions'); effortActions.appendChild(saveEffort)
      nodes.push(rhythmCard('思考强度', [select, h('p', 'dsh-bili-sub', '下次 QQ 会话处理时应用；模型需要支持相应强度。调整模型也可能改变 DSH 新会话的默认模型。'), effortActions]))
    } else nodes.push(rhythmCard('思考强度', [h('div', 'dsh-fb-warn', '暂时无法读取模型设置，请检查桥接与 DSH 的连接。')]))
    RHYTHM_GROUPS.forEach(function (group) {
      var grid = h('div', 'dsh-bili-grid')
      group.fields.forEach(function (spec) {
        var field = h('div', 'dsh-bili-field')
        var label = h('label', null, spec[1])
        var v = getPath(r, spec[0])
        if (v === undefined || v === null) v = spec[4]
        var input = h('input', spec[3] === 'bool' ? '' : 'dsh-fb-input')
        if (spec[3] === 'bool') {
          input.type = 'checkbox'; input.checked = v === true
          field = h('label', 'dsh-bili-toggle')
          var info = h('span'); info.appendChild(h('strong', null, spec[1])); info.appendChild(h('small', null, spec[2])); field.appendChild(info)
        }
        else {
          input.type = spec[3] === 'text' || spec[3] === 'time' ? spec[3] : 'number'
          if (spec[3] === 'minutes') v = v === undefined ? v : v / 60000
          if (spec[3] === 'seconds') v = v === undefined ? v : v / 1000
          if (spec[3] === 'percent') v = v === undefined ? v : v * 100
          if (input.type === 'number') { input.min = '0'; input.step = 'any' }
          if (spec[3] === 'percent') input.max = '100'
          if (spec[0] === 'proactive.maxDaily') { input.max = '100'; input.step = '1' }
          if (spec[0] === 'proactive.maxPerWake') { input.min = '1'; input.max = '100'; input.step = '1' }
          if (spec[0] === 'proactive.prompt') input.maxLength = 2000
          if (spec[0] === 'proactive.prompt') field.className += ' wide'
          if (spec[0] === 'autoReplyCheckMs') input.disabled = true
          if (spec[0] === 'replyCheck.windowMs') { input.min = '5'; input.max = '300' }
          if (spec[0] === 'qzone.maxPerDay') { input.min = '1'; input.max = '20'; input.step = '1' }
          input.value = (v === undefined || v === null) ? '' : String(v)
          input.id = 'rhythm-' + spec[0].replace(/\./g, '-')
          label.htmlFor = input.id; field.appendChild(label)
        }
        input.dataset.key = spec[0]; input.dataset.unit = spec[3] || ''
        field.appendChild(input)
        if (spec[3] !== 'bool') {
          var hint = spec[2]
          if (spec[0] === 'wake.batchWindowMs' && r.wake && Number(r.wake.batchWindowMsPrivate) > 0) hint += ' 当前私聊：' + (r.wake.batchWindowMsPrivate / 1000) + ' 秒。'
          if (spec[0] === 'wake.maxWakePerHour' && r.wake && Number.isFinite(Number(r.wake.maxWakePerHourPrivate))) hint += ' 当前私聊上限：' + r.wake.maxWakePerHourPrivate + ' 次（0 表示不设上限）。'
          field.appendChild(h('small', null, hint))
        }
        grid.appendChild(field)
      })
      nodes.push(rhythmCard(group.title, [grid]))
    })
    nodes.push(actionsRow([
      { label: '保存节奏设置', onClick: function () { saveRhythm(r) } },
      { label: '放弃改动', ghost: true, onClick: function () { loadTab('rhythm') } },
    ]))
    nodes.push(h('div', 'dsh-fb-warn', '节奏设置保存后生效。发送过于频繁可能触发 QQ 风控。'))
    if (mState.note) nodes.push(h('div', 'dsh-fb-warn', mState.note))
    nodes.forEach(function (node) { root.appendChild(node) })
    setBody([root])
  }

  function saveRhythm(original) {
    if (!modal) return
    // 深拷贝后逐字段覆盖：必须整体回写，因为桥接的 config 接口是浅合并，
    // 子对象（send/wait/wake）传局部会把其余字段清掉。
    var rhythm = JSON.parse(JSON.stringify(original || {}))
    var inputs = modal.body.querySelectorAll('input[data-key]')
    for (var i = 0; i < inputs.length; i++) {
      var input = inputs[i]
      if (input.disabled) continue
      var parts = input.dataset.key.split('.')
      var cur = rhythm
      for (var k = 0; k < parts.length - 1; k++) {
        if (!cur[parts[k]] || typeof cur[parts[k]] !== 'object') cur[parts[k]] = {}
        cur = cur[parts[k]]
      }
      if (input.type === 'checkbox') {
        cur[parts[parts.length - 1]] = input.checked === true
        continue
      }
      if (input.type === 'text' || input.type === 'time') {
        if (input.type === 'time' && !input.value) { toast('请填写有效的主动聊天时间'); input.focus(); return }
        cur[parts[parts.length - 1]] = input.value
        continue
      }
      if (!input.validity.valid) { toast('请检查数值范围'); input.focus(); return }
      var num = Number(input.value)
      if (input.value === '' || !isFinite(num)) continue
      if (input.dataset.unit === 'minutes') num = Math.round(num * 60000)
      if (input.dataset.unit === 'seconds') num = Math.round(num * 1000)
      if (input.dataset.unit === 'percent') num = num / 100
      cur[parts[parts.length - 1]] = num
    }
    if (rhythm.proactive && Number(rhythm.proactive.checkIntervalMinMs) > Number(rhythm.proactive.checkIntervalMaxMs)) {
      toast('检查间隔最短值不能大于最长值')
      return
    }
    if (rhythm.send && Number(rhythm.send.burstIntervalMinMs) > Number(rhythm.send.burstIntervalMaxMs)) {
      toast('消息间隔最短值不能大于最长值')
      return
    }
    setBody([h('div', 'dsh-fb-empty', '保存中…')])
    postJson(mState.feature.api + '/settings', { rhythm: rhythm }).then(function (res) {
      if (res && res.ok) {
        toast('节奏已保存')
        loadTab('rhythm')
      } else {
        mState.note = (res && res.error) || '保存失败'
        renderRhythmTab(mState.data)
      }
    })
  }

  function renderOnebotGatewayTab(d) {
    var cfg=d.config||{}, allowed=new Set(cfg.allowed||[]), actions=Array.isArray(d.actions)?d.actions:[], stats=d.stats||{}, root=h('div','dsh-bili'),hero=h('div','dsh-bili-hero')
    hero.appendChild(h('div','dsh-bili-eyebrow','ONEBOT · 接口网关'));hero.appendChild(h('h3',null,'QQ 接口权限'));hero.appendChild(h('p',null,'仅主人私聊可使用已允许的接口。目录参数可能不完整，请核对后再启用。'));root.appendChild(hero)
    var syncBox=h('section','dsh-bili-card');syncBox.appendChild(h('h4',null,'同步当前 SnowLuma 接口目录'));syncBox.appendChild(h('p','dsh-bili-sub','使用 WebUI 密码读取当前实例的接口清单；密码和临时登录令牌不会保存。涉及凭据的接口不会开放。'))
    var syncGrid=h('div','dsh-bili-grid');function syncField(title,type,value){var f=h('div','dsh-bili-field'), l=h('label',null,title), i=h('input','dsh-fb-input');i.type=type;i.value=value||'';i.autocomplete='off';f.appendChild(l);f.appendChild(i);syncGrid.appendChild(f);return i}
    var syncUrl=syncField('SnowLuma WebUI 地址','text','http://'+location.hostname+':5099'),syncPassword=syncField('WebUI 密码','password',''),syncTotp=syncField('二次验证码（如已开启）','password','');syncBox.appendChild(syncGrid)
    var syncStatus=h('div','dsh-bili-sub','');syncStatus.setAttribute('aria-live','polite');syncBox.appendChild(syncStatus)
    syncBox.appendChild(actionsRow([{label:'同步接口目录',onClick:function(){if(!syncPassword.value){syncStatus.textContent='请输入 WebUI 密码。';return}syncStatus.textContent='正在同步…';var payload={action:'sync',url:syncUrl.value,password:syncPassword.value,totp:syncTotp.value};syncPassword.value='';syncTotp.value='';postJson(mState.feature.api+'/onebot-gateway',payload).then(function(r){if(!r||!r.ok){syncStatus.textContent=(r&&r.error)||'同步失败';return}syncStatus.textContent='已读取 '+r.result.total+' 个接口；新增 '+r.result.added+' 个，移除 '+r.result.removed+' 个。';fetchJson(mState.feature.api+'/onebot-gateway').then(function(next){if(next&&next.ok){actions=Array.isArray(next.actions)?next.actions:[];stats=next.stats||{};renderList()}})})}}]));root.appendChild(syncBox)
    var panel=h('section','dsh-bili-card'),toggle=h('label','dsh-bili-toggle'),label=h('strong',null,'启用 QQ 接口网关'),enabled=document.createElement('input');enabled.type='checkbox';enabled.checked=cfg.enabled===true;toggle.appendChild(label);toggle.appendChild(enabled);panel.appendChild(toggle)
    var counts=h('p','dsh-bili-sub');panel.appendChild(counts)
    panel.appendChild(actionsRow([{label:'全选所有可授权接口',onClick:function(){actions.forEach(function(a){allowed.add(a.name)});renderList()}},{label:'取消全选',ghost:true,onClick:function(){actions.forEach(function(a){allowed.delete(a.name)});renderList()}}]))
    panel.appendChild(h('p','dsh-bili-sub','全选和取消全选对所有可授权接口生效，不受下方搜索影响。选择后请点击“保存网关权限”。'))
    var search=h('input','dsh-fb-input');search.placeholder='搜索接口名或用途';panel.appendChild(search)
    panel.appendChild(actionsRow([{label:'选中搜索结果',ghost:true,onClick:function(){visibleActions().forEach(function(a){allowed.add(a.name)});renderList()}},{label:'取消选中搜索结果',ghost:true,onClick:function(){visibleActions().forEach(function(a){allowed.delete(a.name)});renderList()}}]))
    panel.appendChild(h('p','dsh-bili-sub','搜索结果操作只影响当前匹配的接口。选中写操作后，也会授予对应写入权限。'))
    var listing=h('div','dsh-bili-log');panel.appendChild(listing)
    function visibleActions(){var q=search.value.trim().toLowerCase();return actions.filter(function(a){return !q||(String(a.name)+' '+String(a.summary)).toLowerCase().includes(q)})}
    function renderList(){listing.textContent='';var visible=visibleActions(), known=new Set(actions.map(function(a){return a.name})), selected=actions.filter(function(a){return allowed.has(a.name)}).length, missing=Array.from(allowed).filter(function(name){return !known.has(name)}).length;counts.textContent='接口总数 '+(stats.total==null?actions.length:stats.total)+' · 可授权 '+actions.length+' · 已选择 '+selected+' · 筛选结果 '+visible.length+(missing?' · '+missing+' 个旧接口已不存在，保存时移除':'');if(!visible.length){listing.appendChild(h('div','dsh-bili-logempty','没有匹配接口，或尚未取得能力目录。'));return}
      visible.forEach(function(a){var row=h('label','dsh-bili-toggle'),info=h('span'),check=document.createElement('input');check.type='checkbox';check.checked=allowed.has(a.name);info.appendChild(h('strong',null,a.name+' · '+(a.summary||'未提供说明')));info.appendChild(h('small',null,(a.readOnly?'只读':'写操作')+' · 参数：'+((a.params||[]).join('、')||'无')+' · '+(a.schemaComplete?'含参数说明':'类型未由目录确认')));check.addEventListener('change',function(){if(check.checked)allowed.add(a.name);else allowed.delete(a.name);renderList()});row.appendChild(info);row.appendChild(check);listing.appendChild(row)})}
    search.addEventListener('input',renderList);renderList();var result=h('div','dsh-bili-sub','');result.setAttribute('aria-live','polite');panel.appendChild(result)
    panel.appendChild(actionsRow([{label:'保存网关权限',onClick:function(){var known=new Set(actions.map(function(a){return a.name}));postJson(mState.feature.api+'/onebot-gateway',{config:{enabled:enabled.checked,allowed:Array.from(allowed).filter(function(name){return known.has(name)})}}).then(function(r){result.textContent=r&&r.ok?'网关设置已保存。':((r&&r.error)||'保存失败')})}}]));root.appendChild(panel)
    var log=h('section','dsh-bili-card');log.appendChild(h('h4',null,'最近接口调用'));var rows=h('div','dsh-bili-log');log.appendChild(rows);if(!Array.isArray(d.logs)||!d.logs.length)rows.appendChild(h('div','dsh-bili-logempty','暂无调用记录。'));else d.logs.forEach(function(item){var row=h('div','dsh-bili-logrow'),stamp=new Date(item.time);row.appendChild(h('span','dsh-bili-logtime',isNaN(stamp.getTime())?'—':stamp.toLocaleString('zh-CN',{timeZone:'Asia/Shanghai',hour12:false})));row.appendChild(h('span',null,item.action||'—'));row.appendChild(h('span','dsh-bili-logstate',({accepted:'已接受',rejected:'已拒绝',failed:'失败',unknown:'结果未知'})[item.result]||'—'));rows.appendChild(row)});root.appendChild(log);setBody([root])
  }

  function renderXiaoheiheTab(d) {
    var root = h('div', 'dsh-bili'), nodes = [], hero = h('div', 'dsh-bili-hero')
    hero.appendChild(h('div', 'dsh-bili-eyebrow', 'XIAOHEIHE · 探索设置'))
    hero.appendChild(h('h3', null, '让大肥鱼去小黑盒看看'))
    hero.appendChild(h('p', null, '设置浏览节奏和关注话题，查看账号与浏览记录。'))
    hero.appendChild(h('div', 'dsh-bili-badge' + (d.automationReady ? ' ready' : ''), d.automationReady ? '● 刷帖任务已接入' : '● 刷帖任务暂不可用'))
    if (d.automation) {
      var today = new Date().toLocaleDateString('sv-SE', { timeZone: 'Asia/Shanghai' })
      var runStatus = { reserved: '等待子任务确认', running: '子 Agent 正在浏览', stopping: '到时停止中' }[d.automation.active] || '等待下一次安排'
      hero.appendChild(h('p', 'dsh-bili-sub', runStatus + ' · 今天已安排 ' + ((d.automation.counts || {})[today] || 0) + ' / ' + ((d.config || {}).dailyRuns || 0) + ' 次'))
    }
    root.appendChild(hero)
    var box = h('section', 'dsh-bili-card'), status = h('div', 'dsh-bili-sub', d.configured ? '● 已保存账号，登录有效性尚未验证。' : '● 尚未登录，请使用独立账号扫码。')
    var qr = h('div', 'dsh-bili-qr'), session = ''
    box.appendChild(h('h4', null, '小黑盒账号'))
    box.appendChild(h('p', 'dsh-bili-sub', '使用独立账号扫码登录，登录信息保存在服务器。'))
    box.appendChild(status); box.appendChild(qr)
    box.appendChild(actionsRow([{ label:'获取登录二维码', onClick:function () {
      postJson(mState.feature.api + '/xiaoheihe', { action:'start' }).then(function (r) {
        if (!r || !r.ok || !r.result) { status.textContent = (r && r.error) || '获取二维码失败'; return }
        session = r.result.sessionId; qr.textContent = ''; status.textContent = '请使用小黑盒 App 扫码并在手机确认。'
        if (/^data:image\/png;base64,[A-Za-z0-9+/=]+$/.test(r.result.image || '')) { var img=document.createElement('img'); img.src=r.result.image; img.alt='小黑盒登录二维码'; qr.appendChild(img) }
      })
    } }, { label:'确认扫码结果', ghost:true, onClick:function () {
      if (!session) { status.textContent='请先获取二维码。'; return }
      postJson(mState.feature.api + '/xiaoheihe', { action:'poll', sessionId:session }).then(function(r) {
        if (!r || !r.ok || !r.result) { status.textContent=(r && r.error) || '检查失败'; return }
        var messages={waiting:'等待扫码。',scanned:'已扫码，请在手机确认。',authenticated:'已保存登录账号。',expired:'二维码已过期，请重新获取。',requires_2fa:'账号需要额外验证。'}
        status.textContent=messages[r.result.status] || '当前状态：' + r.result.status
        if (r.result.status === 'authenticated' || r.result.status === 'expired') { session=''; qr.textContent='' }
      })
    } }]))
    nodes.push(box)
    var config=d.config || {}, panel=h('section','dsh-bili-card'), grid=h('div','dsh-bili-grid')
    panel.appendChild(h('h4',null,'浏览安排'))
    panel.appendChild(h('p','dsh-bili-sub','每次从子任务实际开始计时；任务结果仅交给主人会话，不自动发送 QQ 汇报。'))
    function field(label, type, value) {
      var wrap=h(type==='checkbox'?'label':'div',type==='checkbox'?'dsh-bili-toggle':'dsh-bili-field'), text=h(type==='checkbox'?'strong':'label',null,label), input=document.createElement('input')
      input.type=type; if(type==='checkbox') input.checked=!!value; else input.value=value == null ? '' : value
      if(type!=='checkbox') input.className='dsh-fb-input'
      wrap.appendChild(text); wrap.appendChild(input); grid.appendChild(wrap); return input
    }
    var enabled=field('启用小黑盒功能','checkbox',config.enabled), automatic=field('允许自主浏览','checkbox',config.autoEnabled)
    var runs=field('每天最多浏览次数','number',config.dailyRuns), duration=field('每次最长分钟数','number',config.durationMinutes)
    runs.min='0'; runs.max='100'; duration.min='1'; duration.max='1440'; runs.step=duration.step='1'
    var topics=field('关注话题（逗号分隔）','text',(config.topics||[]).join('，'))
    panel.appendChild(grid)
    var saveStatus=h('div','dsh-bili-sub',''); saveStatus.setAttribute('aria-live','polite'); panel.appendChild(saveStatus)
    panel.appendChild(actionsRow([{ label:'保存小黑盒设置', onClick:function () {
      if (!runs.validity.valid || !duration.validity.valid || !runs.value || !duration.value) { saveStatus.textContent='请检查次数和时长。'; return }
      var data={enabled:enabled.checked,autoEnabled:automatic.checked,dailyRuns:Number(runs.value),durationMinutes:Number(duration.value),topics:topics.value.split(/[,，\n]/).map(function(x){return x.trim()}).filter(Boolean)}
      postJson(mState.feature.api+'/xiaoheihe',{action:'save',config:data}).then(function(r){saveStatus.textContent=r && r.ok ? '小黑盒设置已保存。' : ((r && r.error)||'保存失败。')})
    }}]))
    panel.appendChild(h('p','dsh-bili-sub','公开评论、回复、发帖未开放；只读取帖子和评论。'))
    nodes.push(panel)
    var records=h('section','dsh-bili-card'); records.appendChild(h('h4',null,'浏览日志')); records.appendChild(h('p','dsh-bili-sub','显示帖子读取结果及原文链接。'))
    var logBox=h('div','dsh-bili-log'); records.appendChild(logBox)
    function renderLogs(logs) {
      logBox.textContent=''
      if (!Array.isArray(logs) || !logs.length) { logBox.appendChild(h('div','dsh-bili-logempty','暂无浏览记录。')); return }
      logs.forEach(function(item){ var row=h('div','dsh-bili-logrow'), stamp=new Date(item.at), detail=h('div'); row.appendChild(h('span','dsh-bili-logtime',isNaN(stamp.getTime())?'—':stamp.toLocaleString('zh-CN',{timeZone:'Asia/Shanghai',hour12:false}))); detail.appendChild(h('span',null,item.action||'小黑盒操作')); if(item.postId && /^\d+$/.test(String(item.postId))) { var a=h('a',null,item.title||item.postId); a.href='https://www.xiaoheihe.cn/app/bbs/link/'+item.postId; a.target='_blank'; a.rel='noopener noreferrer'; a.style.marginLeft='8px'; a.style.color='#e88ba9'; detail.appendChild(a) } row.appendChild(detail); row.appendChild(h('span','dsh-bili-logstate'+(item.result==='失败'?' bad':''),item.result||'—')); logBox.appendChild(row) })
    }
    records.appendChild(actionsRow([{label:'刷新日志',ghost:true,onClick:function(){logBox.textContent='正在加载日志…';fetchJson(mState.feature.api+'/xiaoheihe').then(function(r){if(!modal||mState.tab!=='xiaoheihe')return;if(!r||!r.ok){logBox.textContent=(r&&r.error)||'日志暂时不可用';return}renderLogs(r.logs)})}}]))
    renderLogs(d.logs)
    nodes.push(records)
    nodes.forEach(function(node){root.appendChild(node)})
    setBody([root])
  }

  function renderPersonaTab(d) {
    var list = Array.isArray(d.roles) ? d.roles : []
    var summaries = Array.isArray(d.summaries) ? d.summaries : []
    var limits = d.limits || {}
    var nodes = []

    var pick = h('select', 'dsh-fb-input')
    var opt0 = h('option', null, '（未启用角色扮演）')
    opt0.value = ''
    pick.appendChild(opt0)
    for (var i = 0; i < list.length; i++) {
      var o = h('option', null, list[i])
      o.value = list[i]
      if (d.current === list[i]) o.selected = true
      pick.appendChild(o)
    }

    // 当前角色常驻回显。toast 一闪就过，而下拉框在"切换其实没生效"时会回到空白，
// 用户根本看不出到底切没切。这一行跟着 loadTab 重新渲染，是权威状态。
    var currentLine = h('div', 'dsh-fb-empty')
    currentLine.textContent = d.current
      ? ('当前角色：' + d.current + '（系统上下文最多约 2 分钟更新，新会话会立即读取）')
      : '当前角色：未启用（选一张卡 → 点「设为当前角色」）'

    var meta = h('div', 'dsh-fb-empty')
    var warn = h('div', 'dsh-fb-warn')
    var area = h('textarea', 'dsh-fb-area')
    area.placeholder = '选择上方角色卡后在这里编辑…'

    function loadOne(name) {
      if (!name) { area.value = ''; meta.textContent = ''; warn.textContent = ''; return }
      fetchJson(mState.feature.api + '/persona?name=' + encodeURIComponent(name)).then(function (one) {
        area.value = (one && (one.content || one.text)) || ''
        var s = null
        for (var j = 0; j < summaries.length; j++) if (summaries[j].name === name) s = summaries[j]
        if (s) {
          meta.textContent = s.chars + ' 字 · 实际注入 ' + s.injectedV2 + ' 字 · ' + s.lines + ' 行'
          warn.textContent = s.truncated
            ? ('⚠ 角色卡 ' + s.chars + ' 字，超过注入上限 ' + (limits.injectMaxChars || '?') + ' 字，超出部分不会生效（可调高上限，但过大也会拖慢每轮）')
            : ''
        } else { meta.textContent = ''; warn.textContent = '' }
      })
    }
    pick.addEventListener('change', function () { loadOne(pick.value) })

    nodes.push(section('角色卡（人格层）', [currentLine, pick, meta, area]))

    var ownInfo = h('div', 'dsh-fb-empty', '正在读取当前角色的自主设定…')
    var ownArea = h('textarea', 'dsh-fb-area')
    ownArea.placeholder = '她会在这里记录逐渐形成的性格、喜好和说话方式。'
    var ownHistory = h('select', 'dsh-fb-input')
    var ownEnabled = false
    function loadEvolution() {
      fetchJson(mState.feature.api + '/persona?evolution=1').then(function (res) {
        if (!res || !res.ok) { ownInfo.textContent = (res && res.error) || '读取失败'; return }
        ownEnabled = res.enabled !== false
        ownArea.value = res.content || ''
        ownInfo.textContent = '当前角色：' + res.role + ' · 自主设定' + (ownEnabled ? '已开启' : '已关闭') + ' · 最多 ' + res.maxChars + ' 字 · 自动修改至少间隔 24 小时'
        ownHistory.textContent = ''
        var initial = h('option', null, '选择历史版本')
        initial.value = ''
        ownHistory.appendChild(initial)
        ;(res.history || []).forEach(function (item, index) {
          var option = h('option', null, (item.updatedAt ? new Date(item.updatedAt).toLocaleString() : '初始空设定') + ' · ' + (item.content || '（空）').slice(0, 40))
          option.value = String(index)
          ownHistory.appendChild(option)
        })
      }).catch(function (err) { ownInfo.textContent = String(err.message || err) })
    }
    function evolutionAction(body) {
      postJson(mState.feature.api + '/persona', body).then(function (res) {
        toast(res && res.ok ? '自主设定已更新' : ((res && res.error) || '操作失败'))
        loadEvolution()
      }).catch(function (err) { toast(String(err.message || err)) })
    }
    nodes.push(section('自主设定', [ownInfo, h('div', 'dsh-fb-empty', '与基础角色卡分开保存；关闭后停止自动修改和注入。'), ownArea, actionsRow([
      { label: '保存自主设定', onClick: function () { evolutionAction({ action: 'evolution-save', content: ownArea.value }) } },
      { label: '开启 / 关闭自主设定', ghost: true, onClick: function () { evolutionAction({ action: 'evolution-enable', enabled: !ownEnabled }) } },
    ]), ownHistory, actionsRow([{ label: '恢复选中版本', ghost: true, onClick: function () {
      if (ownHistory.value === '') { toast('请先选择历史版本'); return }
      evolutionAction({ action: 'evolution-rollback', index: Number(ownHistory.value) })
    } }])]))
    loadEvolution()

    var limitInput = h('input', 'dsh-fb-input')
    limitInput.type = 'number'
    limitInput.value = String(limits.injectMaxChars || '')
    var limitField = h('div', 'dsh-fb-field')
    limitField.appendChild(h('label', null, '注入字数上限（当前 ' + (limits.injectMaxChars || '?') + '）'))
    limitField.appendChild(limitInput)
    nodes.push(section('上限与统计', [
      limitField,
      kv('角色数', list.length),
      kv('名称长度上限', limits.nameMax),
      kv('单卡字节上限', limits.contentMaxBytes),
    ]))

    nodes.push(actionsRow([
      { label: '保存角色卡', onClick: function () {
        if (!pick.value) { toast('请先选择一个角色卡'); return }
        postJson(mState.feature.api + '/persona', { action: 'save', name: pick.value, content: area.value }).then(function (res) {
          toast(res && res.ok ? '角色卡已保存' : ((res && res.error) || '保存失败'))
          loadTab('persona')
        })
      } },
      { label: '设为当前角色', ghost: true, onClick: function () {
        postJson(mState.feature.api + '/persona', { action: 'activate', name: pick.value || null }).then(function (res) {
          // 提示里带上"这次到底切成了谁"：以前只说"已切换当前角色"，而桥接那边
          // 因为字段名不一致其实清空了角色，用户看到成功的提示、下拉框却是空的。
          var ok = res && res.ok
          toast(ok
            ? (res.role ? ('已切换到「' + res.role + '」，下一轮唤醒生效') : '已取消角色扮演')
            : ((res && res.error) || '切换失败'))
          loadTab('persona')
        })
      } },
      { label: '应用上限', ghost: true, onClick: function () {
        postJson(mState.feature.api + '/persona', { action: 'limit', injectMaxChars: Number(limitInput.value) }).then(function (res) {
          toast(res && res.ok ? '上限已更新' : ((res && res.error) || '更新失败'))
          loadTab('persona')
        })
      } },
      { label: '删除', danger: true, onClick: function () {
        if (!pick.value) return
        postJson(mState.feature.api + '/persona', { action: 'delete', name: pick.value }).then(function (res) {
          toast(res && res.ok ? '已删除' : ((res && res.error) || '删除失败'))
          loadTab('persona')
        })
      } },
    ]))
    if (warn.textContent) nodes.push(warn)
    setBody(nodes)
    loadOne(pick.value)
  }

  function renderTokensTab(d) {
    var t = d.totals || {}
    var symbol = d.symbol || '¥'
    var root = h('div', 'dsh-bili'), hero = h('div', 'dsh-bili-hero')
    hero.appendChild(h('div', 'dsh-bili-eyebrow', 'TOKEN · 用量账本'))
    hero.appendChild(h('h3', null, '每次消耗，都有迹可查'))
    hero.appendChild(h('p', null, '按北京时间查询对话、模型请求、工具调用和 B 站任务。'))
    root.appendChild(hero)
    function box(title) { var el = h('section', 'dsh-bili-card'), head = h('div', 'dsh-bili-head'); head.appendChild(h('h4', null, title)); el.appendChild(head); root.appendChild(el); return el }
    function number(value) { return Number(value || 0).toLocaleString('zh-CN') }
    function money(value) { return symbol + Number(value || 0).toFixed(6) }
    function stamp(value) { return value ? new Date(value).toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai', hour12: false }) : '—' }
    function dateInput(value) { return value ? new Date(value + 8 * 3600000).toISOString().slice(0, 16) : '' }
    var filter = box('查询范围'), grid = h('div', 'dsh-bili-grid')
    function field(text, input, id) { var el = h('div', 'dsh-bili-field'), label = h('label', null, text); input.id = id; label.htmlFor = id; el.appendChild(label); el.appendChild(input); grid.appendChild(el) }
    var from = h('input', 'dsh-fb-input'), to = h('input', 'dsh-fb-input')
    from.type = to.type = 'datetime-local'; from.value = tokenQuery.from || dateInput(d.range && d.range.from); to.value = tokenQuery.to || dateInput(d.range && d.range.to)
    field('开始时间（含）', from, 'token-from'); field('结束时间（不含）', to, 'token-to')
    function select(options, value) { var el = h('select', 'dsh-fb-input'); options.forEach(function (x) { var o = h('option', null, x[1]); o.value = x[0]; el.appendChild(o) }); el.value = value; return el }
    var category = select([['all', '全部用途'], ['chat', 'QQ 对话'], ['bili', '刷 B站'], ['internal', '其他子任务 / 内部任务']], tokenQuery.category)
    var view = select([['turns', '每轮对话'], ['requests', '每次模型请求'], ['tools', '每次工具调用'], ['tasks', '每次 B站任务']], tokenQuery.view)
    field('用途', category, 'token-category'); field('日志类型', view, 'token-view'); filter.appendChild(grid)
    function preset(window) { tokenQuery = {window:window,view:view.value,category:category.value,offset:0}; loadTab('tokens') }
    filter.appendChild(actionsRow([
      {label:'查询', onClick:function () { if (!from.value || !to.value || from.value >= to.value) { toast('请填写有效的开始和结束时间'); return }; tokenQuery = {from:from.value,to:to.value,view:view.value,category:category.value,offset:0}; loadTab('tokens') }},
      {label:'今天', ghost:true, onClick:function () { preset('today') }}, {label:'昨天', ghost:true, onClick:function () { preset('yesterday') }},
      {label:'近 7 天', ghost:true, onClick:function () { preset('7d') }}, {label:'全部明细', ghost:true, onClick:function () { preset('all') }},
    ]))
    filter.appendChild(h('p', 'dsh-bili-sub', '日期和时间均按北京时间；选择某一天可用当天 00:00 至次日 00:00。'))
    var cards = h('div', 'dsh-fb-cards')
    function card(value, label) {
      var c = h('div', 'dsh-fb-card')
      c.appendChild(h('b', null, value))
      c.appendChild(h('span', null, label))
      return c
    }
    cards.appendChild(card(money(t.cost), '所选范围估算花费'))
    cards.appendChild(card(number(t.tokens), '所选范围 Token'))
    cards.appendChild(card(number(t.requests), '模型请求次数'))
    cards.appendChild(card(number(t.cacheHit), '缓存命中输入'))
    cards.appendChild(card(number(t.cacheMiss), '未命中输入'))
    cards.appendChild(card(number(t.cacheWrite), '缓存写入'))
    cards.appendChild(card(number(t.output), '输出 Token'))
    cards.appendChild(card(money(d.cumulative && d.cumulative.cost), '全部会话累计估算 · 含历史基线'))
    box('用量与花费').appendChild(cards)
    var logs = box('消耗日志 · ' + number(d.total) + ' 条'), list = h('div', 'dsh-token-log')
    var labels = {chat:'QQ 对话', bili:'刷 B站', internal:'内部任务'}, states = {completed:'完成',failed:'失败',running:'进行中',recorded:'已记录',cancelled:'已取消',interrupted:'已中断'}
    ;(d.entries || []).forEach(function (entry) {
      var row = h('div', 'dsh-token-row'), head = h('div', 'dsh-token-rowhead')
      var title = d.view === 'tools' ? entry.tool : d.view === 'tasks' ? 'B站任务 ' + String(entry.runId || entry.id).slice(0, 12) : '第 ' + entry.turn + ' 轮' + (d.view === 'requests' ? ' · 步骤 ' + entry.step + (entry.retry ? ' · 重试 ' + entry.retry : '') : '')
      head.appendChild(h('strong', null, title)); head.appendChild(h('span', 'dsh-bili-sub', d.view === 'tools' ? '无独立 Token 回执' : entry.cost === null ? '用量待确认' : money(entry.cost))); row.appendChild(head)
      row.appendChild(h('div', 'dsh-bili-sub', stamp(entry.startedAt) + ' · ' + (labels[entry.category] || entry.category || '未归属') + ' · ' + (entry.key || '未归属会话')))
      if (d.view === 'tools') {
        var related = entry.related
        row.appendChild(h('div', 'dsh-bili-sub', (states[entry.status] || entry.status || '已记录') + (entry.durationMs !== null ? ' · 耗时 ' + number(entry.durationMs) + ' 毫秒' : '') + (related ? ' · 关联步骤 ' + number(related.tokens) + ' Token / ' + money(related.cost) + '（共享参考，不另计费）' : ' · 未获取关联模型步骤的用量明细')))
      } else if (entry.tokens === null) row.appendChild(h('div', 'dsh-bili-sub', (states[entry.status] || entry.status || '已记录') + ' · 尚未收到模型用量回执，不能视为零花费。'))
      else row.appendChild(h('div', 'dsh-bili-sub', number(entry.tokens) + ' Token · 未命中 ' + number(entry.cacheMiss) + ' / 命中 ' + number(entry.cacheHit) + ' / 写入 ' + number(entry.cacheWrite) + ' / 输出 ' + number(entry.output) + (entry.requests ? ' · ' + entry.requests + ' 次模型请求' : '') + (entry.model ? ' · ' + entry.model : '')))
      row.appendChild(h('div', 'dsh-bili-sub', '会话 ' + entry.sessionId + (entry.runId ? ' · 任务 ' + entry.runId : '')))
      list.appendChild(row)
    })
    if (!(d.entries || []).length) list.appendChild(h('div', 'dsh-bili-logempty', '该时间范围内没有相应明细。'))
    logs.appendChild(list)
    logs.appendChild(actionsRow([
      {label:'上一页',ghost:true,onClick:function () { tokenQuery.offset = Math.max(0, (d.offset || 0) - (d.limit || 50)); loadTab('tokens') }},
      {label:'下一页',ghost:true,onClick:function () { if (d.hasMore) { tokenQuery.offset = (d.offset || 0) + (d.limit || 50); loadTab('tokens') } }},
      {label:'刷新',ghost:true,onClick:function () { loadTab('tokens') }},
    ]))
    root.appendChild(h('p', 'dsh-bili-sub', d.note || '金额按配置价目表估算。'))
    if (d.coverage) root.appendChild(h('p', 'dsh-bili-sub', '当前保留 ' + number(d.coverage.retainedRequests) + ' 条请求明细（上限 ' + number(d.coverage.detailLimit) + ' 条）；仅剩累计基线的历史不能精确分配到日期或工具。'))
    setBody([root])
  }

  function renderStickersTab(d) {
    var list = Array.isArray(d.stickers) ? d.stickers : []
    var total = (d.total === undefined || d.total === null) ? list.length : d.total
    var api = mState.feature.api + '/stickers'
    var nodes = []

    // ── 上传 ──
    // 不走 window.prompt：Electron 里它不可靠；这里用隐藏 file input + 常驻备注框。
    var fileInput = h('input')
    fileInput.type = 'file'
    fileInput.accept = 'image/png,image/jpeg,image/gif,image/webp'
    fileInput.style.display = 'none'
    document.body.appendChild(fileInput)

    var noteInput = h('input', 'dsh-fb-input')
    noteInput.placeholder = '备注（可选，≤20 字）'
    noteInput.maxLength = 20
    noteInput.style.maxWidth = '240px'

    var pickBtn = h('button', 'dsh-fb-btn', '选择图片上传')
    pickBtn.type = 'button'
    pickBtn.addEventListener('click', function () { fileInput.click() })

    fileInput.addEventListener('change', function () {
      var file = fileInput.files && fileInput.files[0]
      if (!file) return
      if (file.size > 2 * 1024 * 1024) {
        toast('图片 ' + (file.size / 1048576).toFixed(2) + 'MB，超过 2MB 上限')
        return
      }
      pickBtn.disabled = true
      pickBtn.textContent = '上传中…'
      var reader = new FileReader()
      reader.onload = function () {
        postJson(api, { action: 'upload', data: String(reader.result || ''), note: noteInput.value || '' })
          .then(function (res) {
            toast(res && res.ok ? '已加入 QQ 收藏表情' : ((res && res.error) || '上传失败'))
            loadTab('stickers')
          })
      }
      reader.onerror = function () { toast('读取文件失败') }
      reader.readAsDataURL(file)
    })

    var upRow = h('div', 'dsh-fb-actions')
    upRow.appendChild(pickBtn)
    upRow.appendChild(noteInput)
    nodes.push(section('上传新表情', [
      upRow,
      h('div', 'dsh-fb-warn', '支持 png / jpg / gif / webp，单张上限 2MB。上传会直接加入你 QQ 账号的收藏表情，之后 AI 通过 qq_list_stickers 就能看到并使用它。'),
    ]))

    // ── 列表 ──
    var grid = h('div', 'dsh-fb-cards')
    if (!list.length) {
      grid.appendChild(h('div', 'dsh-fb-empty', '还没有收藏表情。上传一张试试；也可以让机器人在群里「偷图」（它会自己判断哪张有意思）。'))
    }
    for (var i = 0; i < list.length; i++) {
      (function (s) {
        var card = h('div', 'dsh-fb-card')
        if (s.url) {
          var img = h('img', 'dsh-fb-thumb')
          img.src = s.url
          img.alt = s.desc || '表情'
          img.loading = 'lazy'
          card.appendChild(img)
        }
        card.appendChild(h('span', null, s.desc || s.localNote || '(无备注)'))
        card.appendChild(h('span', null, String(s.id || '').slice(-14)))

        var editBtn = h('button', 'dsh-fb-mini', '改备注')
        editBtn.type = 'button'
        editBtn.addEventListener('click', function () {
          if (card.querySelector('.dsh-fb-inline-edit')) return
          var row = h('div', 'dsh-fb-actions dsh-fb-inline-edit')
          var input = h('input', 'dsh-fb-input')
          input.value = s.desc || ''
          input.maxLength = 20
          input.style.maxWidth = '130px'
          var save = h('button', 'dsh-fb-mini', '保存')
          save.type = 'button'
          save.addEventListener('click', function () {
            postJson(api, { action: 'remark', stickerId: s.id, remark: input.value.slice(0, 20) })
              .then(function (res) {
                toast(res && res.ok ? '备注已更新' : ((res && res.error) || '更新失败'))
                loadTab('stickers')
              })
          })
          var cancel = h('button', 'dsh-fb-mini', '取消')
          cancel.type = 'button'
          cancel.addEventListener('click', function () { if (row.parentNode) row.parentNode.removeChild(row) })
          row.appendChild(input)
          row.appendChild(save)
          row.appendChild(cancel)
          card.appendChild(row)
        })
        card.appendChild(editBtn)

        // 二次确认不用 window.confirm（Electron 下不可靠）：按钮点两下才真删。
        var delBtn = h('button', 'dsh-fb-mini danger', '删除')
        delBtn.type = 'button'
        delBtn.addEventListener('click', function () {
          if (delBtn.dataset.armed === '1') {
            postJson(api, { action: 'delete', stickerId: s.id }).then(function (res) {
              toast(res && res.ok ? '已删除' : ((res && res.error) || '删除失败'))
              loadTab('stickers')
            })
            return
          }
          delBtn.dataset.armed = '1'
          delBtn.textContent = '确认删除？'
          setTimeout(function () {
            if (delBtn.parentNode) { delBtn.dataset.armed = '0'; delBtn.textContent = '删除' }
          }, 4000)
        })
        card.appendChild(delBtn)
        grid.appendChild(card)
      })(list[i])
    }
    nodes.push(section('收藏表情（' + total + ' 个）', [grid]))

    nodes.push(actionsRow([
      { label: '刷新', ghost: true, onClick: function () { loadTab('stickers') } },
      { label: '同步 QQ 收藏', ghost: true, onClick: function () {
        postJson(api, { action: 'sync' }).then(function (res) {
          toast(res && res.ok ? ('已同步 ' + (res.total || 0) + ' 个') : ((res && res.error) || '同步失败'))
          loadTab('stickers')
        })
      } },
    ]))
    setBody(nodes)
  }

  function renderAccessTab(d) {
    var allow = d.allow || { private: [], groups: [] }
    var deny = d.deny || { private: [], groups: [] }
    var api = mState.feature.api + '/access'
    var nodes = []

    nodes.push(section('管理员（Owner：全部工具权限）', [
      statusLine('管理员 QQ：' + (d.ownerQQ || '（未设置）'), !!d.ownerQQ),
      h('div', 'dsh-fb-warn', '只有管理员能用工具。改管理员请去桥接控制台 http://127.0.0.1:3100 的「访问与安全」页（这里故意不提供，避免误改把自己锁在外面）。'),
    ]))

    function bucket(title, kind, list, isDeny, emptyHint) {
      var rows = []
      if (!list.length) {
        rows.push(h('div', 'dsh-fb-empty', emptyHint))
      } else {
        for (var i = 0; i < list.length; i++) {
          (function (id) {
            var row = h('div', 'dsh-fb-actions')
            var lab = h('span', null, String(id))
            lab.style.minWidth = '150px'
            lab.style.fontSize = '12px'
            row.appendChild(lab)
            // 管理员账号受保护：踢出它是当前最反直觉的坑 ——
            // reserved2 模式的准入只看 allow/deny，不看 ownerQQ，
            // 所以把自己踢出 = 自己彻底收不到服务（虽然还能用工具箱救回来）。
            var isOwnerRow = !isDeny && String(id) === String(d.ownerQQ || '')
            var btn = h('button', 'dsh-fb-mini' + (isDeny ? '' : ' danger'), isDeny ? '解除拉黑' : '踢出（拉黑）')
            btn.type = 'button'
            if (isOwnerRow) {
              btn.disabled = true
              btn.textContent = '管理员（不可踢出）'
              btn.style.opacity = '0.5'
              btn.style.cursor = 'not-allowed'
            } else {
              btn.addEventListener('click', function () {
                postJson(api, { action: isDeny ? 'unblock' : 'block', kind: kind, id: id }).then(function (res) {
                  toast(res && res.ok ? (isDeny ? '已解除' : '已踢出并拉黑') : ((res && res.error) || '操作失败'))
                  loadTab('access')
                })
              })
            }
            row.appendChild(btn)
            rows.push(row)
          })(list[i])
        }
      }
      nodes.push(section(title + '（' + list.length + '）', rows))
    }

    bucket('私聊白名单（可用只读工具）', 'private', allow.private, false, '还没有授权的私聊。')
    bucket('群白名单', 'group', allow.groups, false, '还没有授权的群。')
    bucket('私聊黑名单（不读、不存、不回）', 'private', deny.private, true, '黑名单为空。')
    bucket('群黑名单（不读、不存、不回）', 'group', deny.groups, true, '黑名单为空。')

    // 添加区
    var idInput = h('input', 'dsh-fb-input')
    idInput.placeholder = 'QQ 号 或 群号'
    idInput.style.maxWidth = '150px'
    var kindSel = h('select', 'dsh-fb-input')
    var o1 = h('option', null, '私聊'); o1.value = 'private'
    var o2 = h('option', null, '群'); o2.value = 'group'
    kindSel.appendChild(o1); kindSel.appendChild(o2)
    var addAllow = h('button', 'dsh-fb-btn', '加入白名单')
    addAllow.type = 'button'
    addAllow.addEventListener('click', function () { send('allow') })
    var addBlock = h('button', 'dsh-fb-btn ghost', '拉黑')
    addBlock.type = 'button'
    addBlock.addEventListener('click', function () { send('block') })
    function send(act) {
      var v = String(idInput.value || '').trim()
      if (!/^\d+$/.test(v)) { toast('请输入纯数字的 QQ 号或群号'); return }
      postJson(api, { action: act, kind: kindSel.value, id: v }).then(function (res) {
        toast(res && res.ok ? (act === 'allow' ? '已加入白名单' : '已拉黑') : ((res && res.error) || '操作失败'))
        loadTab('access')
      })
    }
    var addRow = h('div', 'dsh-fb-actions')
    addRow.appendChild(idInput); addRow.appendChild(kindSel)
    addRow.appendChild(addAllow); addRow.appendChild(addBlock)
    nodes.push(section('手动添加', [
      addRow,
      h('div', 'dsh-fb-warn', '白名单 = 允许它跟机器人对话；黑名单 = 完全无视（消息不进上下文、不消耗 token）。两个名单互斥，加入一边会自动从另一边移除。'),
      h('div', 'dsh-fb-warn', '⚠️ 当前是 reserved2 模式：准入只看白名单，不看管理员身份 —— 所以管理员账号也必须在白名单里才会被响应（本页已禁止踢出管理员，避免误操作把自己锁在外面）。'),
    ]))

    nodes.push(actionsRow([
      { label: '刷新', ghost: true, onClick: function () { loadTab('access') } },
    ]))
    setBody(nodes)
  }

  function renderBackendTab(d) {
    var list = Array.isArray(d.backends) ? d.backends : []
    var nodes = [section('桥接当前指向', [kv('DSH 地址', d.current)])]

    var rows = []
    if (!list.length) {
      rows.push(h('div', 'dsh-fb-empty', d.supported === false ? '当前平台不支持自动发现（仅 Windows）' : '没有发现运行中的 DSH 实例'))
    }
    for (var i = 0; i < list.length; i++) {
      (function (bk) {
        var row = h('div', 'dsh-fb-kv')
        row.appendChild(h('span', null, bk.label + ' · PID ' + bk.pid))
        row.appendChild(h('span', null, bk.url + (bk.current ? ' ← 当前' : '')))
        rows.push(row)
        if (!bk.current) {
          rows.push(actionsRow([{ label: '切换到' + bk.label, ghost: true, onClick: function () {
            postJson(mState.feature.api + '/backend', { url: bk.url }).then(function (res) {
              toast(res && res.ok ? (res.restartNote || '已切换') : ((res && res.error) || '切换失败'))
              loadTab('backend')
            })
          } }]))
        }
      })(list[i])
    }
    nodes.push(section('可用的 DSH 实例', rows))
    nodes.push(h('div', 'dsh-fb-warn', '切换会让桥接改连另一个 DSH 并自动重启。注意取舍：桌面端被关闭时机器人会一并下线；CLI 版可以独立常驻。'))
    setBody(nodes)
  }

  function renderDiagnoseTab(d) {
    var checks = Array.isArray(d.checks) ? d.checks : []
    var rows = []
    for (var i = 0; i < checks.length; i++) {
      var c = checks[i]
      rows.push(statusLine(c.name + (c.detail ? '：' + c.detail : ''), c.ok === true))
    }
    var nodes = [section(d.ok ? '自检全部通过' : '自检发现问题', rows)]
    if (d.model) nodes.push(section('DSH 模型', [kv('当前模型', (d.model.provider ? d.model.provider + ' / ' : '') + (d.model.model || '—')), kv('思考强度', d.model.reasoningEffort)]))
    nodes.push(actionsRow([{ label: '重新检测', onClick: function () { loadTab('diagnose') } }]))
    setBody(nodes)
  }

  /* ---------------- toast ---------------- */

  function toast(text) {
    if (toastEl && toastEl.parentNode) toastEl.parentNode.removeChild(toastEl)
    var cx = Math.max(80, Math.min(window.innerWidth - 80, pos.left + BALL / 2))
    var cy = Math.max(8, pos.top - 44)
    var el = document.createElement('div')
    el.className = 'dsh-fb-toast' + (modal ? ' in-dialog' : '')
    el.setAttribute('role', 'status')
    el.setAttribute('aria-live', 'polite')
    el.textContent = text
    if (modal) modal.wrap.querySelector('.dsh-fb-dialog').appendChild(el)
    else {
      el.style.left = Math.round(cx) + 'px'
      el.style.top = Math.round(cy) + 'px'
      document.body.appendChild(el)
    }
    toastEl = el
    if (toastTimer) clearTimeout(toastTimer)
    toastTimer = setTimeout(function () {
      el.style.opacity = '0'
      setTimeout(function () {
        if (el.parentNode) el.parentNode.removeChild(el)
        if (toastEl === el) toastEl = null
      }, 180)
    }, 1900)
  }

  /* ---------------- ball ---------------- */

  function resetPos(announce) {
    pos = defaultPos()
    applyPos()
    savePos()
    if (open) positionPanel()
    if (announce) toast('已复位到默认位置')
  }

  function createBall() {
    var el = document.createElement('div')
    el.className = 'dsh-fb-ball'
    el.id = 'dsh-floatdock-ball'
    el.setAttribute('role', 'button')
    el.setAttribute('tabindex', '0')
    el.setAttribute('aria-label', '打开小工具箱')
    el.title = '小工具箱 · 点击展开 / 拖动移动 / 双击复位'
    el.innerHTML = ICON_BALL

    el.addEventListener('pointerdown', function (e) {
      if (e.button !== 0) return
      e.preventDefault()
      try { el.setPointerCapture(e.pointerId) } catch (err) {}
      drag = { x: e.clientX, y: e.clientY, left: pos.left, top: pos.top, moved: false }
    })

    el.addEventListener('pointermove', function (e) {
      if (!drag) return
      var dx = e.clientX - drag.x
      var dy = e.clientY - drag.y
      if (!drag.moved && Math.abs(dx) + Math.abs(dy) < 5) return
      drag.moved = true
      el.dataset.drag = '1'
      pos = clampPos(drag.left + dx, drag.top + dy)
      applyPos()
      if (open) positionPanel()
    })

    function finish() {
      if (!drag) return
      var moved = drag.moved
      drag = null
      el.dataset.drag = '0'
      if (moved) {
        savePos()
        return
      }
      var now = Date.now()
      if (now - lastTap < 320) {
        lastTap = 0
        closePanel()
        resetPos(true)
        return
      }
      lastTap = now
      togglePanel()
    }

    el.addEventListener('pointerup', finish)
    el.addEventListener('pointercancel', function () {
      if (!drag) return
      drag = null
      el.dataset.drag = '0'
      savePos()
    })

    el.addEventListener('keydown', function (e) {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault()
        togglePanel()
      }
    })

    return el
  }

  /* ---------------- boot ---------------- */

  function boot() {
    injectStyle()

    ball = createBall()
    var saved = loadPos() || defaultPos()
    pos = clampPos(saved.left, saved.top)
    applyPos()
    document.body.appendChild(ball)
    savePos()

    for (var i = 0; i < FEATURES.length; i++) syncFeature(FEATURES[i])

    window.addEventListener('resize', function () {
      var next = clampPos(pos.left, pos.top)
      if (next.left !== pos.left || next.top !== pos.top) {
        pos = next
        applyPos()
        savePos()
      }
      if (open) positionPanel()
    })

    window.addEventListener('focus', function () {
      for (var j = 0; j < FEATURES.length; j++) syncFeature(FEATURES[j])
    })
    document.addEventListener('visibilitychange', function () {
      if (document.hidden) return
      for (var j = 0; j < FEATURES.length; j++) syncFeature(FEATURES[j])
    })
  }

  function apply() {
    if (window.__dshFloatDock) return
    window.__dshFloatDock = true
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', boot)
    } else {
      boot()
    }
  }

  exports.name = 'dsh-thinking-zh'
  exports.inject = []
  exports.apply = apply

  return module.exports
  },
})

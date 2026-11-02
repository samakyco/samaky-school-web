/* Samaky demo pages: a tiny renderer for the dashboard templates.
   It fills in {{values}}, repeats <sc-for> lists, shows <sc-if> blocks,
   and re-draws the page when a button changes the page's state. */
(function () {
  'use strict';
  var WHOLE = /^\s*\{\{\s*([^}]+?)\s*\}\}\s*$/;
  var ANY = /\{\{\s*([^}]+?)\s*\}\}/g;
  var instance, template, root, pending = false, mounted = false;
  var dynamicCache = new WeakMap();

  function DCLogic(props) { this.props = props || {}; this.state = {}; }
  DCLogic.prototype.setState = function (patch) {
    var next = typeof patch === 'function' ? patch(this.state, this.props) : patch;
    this.state = Object.assign({}, this.state, next);
    schedule();
  };
  DCLogic.prototype.forceUpdate = function () { schedule(); };
  DCLogic.prototype.renderVals = function () { return {}; };
  window.DCLogic = DCLogic;

  function schedule() {
    if (pending) return;
    pending = true;
    requestAnimationFrame(function () { pending = false; render(); });
  }

  function lookup(path, scopes) {
    path = path.trim();
    if (path === 'true') return true;
    if (path === 'false') return false;
    if (path === 'null') return null;
    if (/^-?\d+(\.\d+)?$/.test(path)) return Number(path);
    if (/^(['"]).*\1$/.test(path)) return path.slice(1, -1);
    var parts = path.split('.');
    for (var i = scopes.length - 1; i >= 0; i--) {
      var s = scopes[i];
      if (s && Object.prototype.hasOwnProperty.call(s, parts[0])) {
        var v = s[parts[0]];
        for (var j = 1; j < parts.length; j++) { if (v == null) return undefined; v = v[parts[j]]; }
        return v;
      }
    }
    return undefined;
  }

  function interp(text, scopes) {
    return text.replace(ANY, function (m, p) { var v = lookup(p, scopes); return v == null ? '' : String(v); });
  }

  function isDynamic(node) {
    if (dynamicCache.has(node)) return dynamicCache.get(node);
    var html = node.nodeType === 1 ? node.outerHTML : node.nodeValue;
    var d = html.indexOf('{{') !== -1 || /<sc-(for|if)/i.test(html);
    dynamicCache.set(node, d);
    return d;
  }

  function build(node, scopes, parent) {
    if (node.nodeType === 3) {
      parent.appendChild(document.createTextNode(node.nodeValue.indexOf('{{') === -1 ? node.nodeValue : interp(node.nodeValue, scopes)));
      return;
    }
    if (node.nodeType !== 1) return;
    var tag = node.localName;
    if (tag === 'sc-for') {
      var lm = WHOLE.exec(node.getAttribute('list') || '');
      var list = lm ? lookup(lm[1], scopes) : [];
      var as = node.getAttribute('as') || 'item';
      (list || []).forEach(function (item, i) {
        var scope = { $index: i }; scope[as] = item;
        var next = scopes.concat([scope]);
        node.childNodes.forEach(function (c) { build(c, next, parent); });
      });
      return;
    }
    if (tag === 'sc-if') {
      var vm = WHOLE.exec(node.getAttribute('value') || '');
      var val = vm ? lookup(vm[1], scopes) : node.getAttribute('value');
      if (val) node.childNodes.forEach(function (c) { build(c, scopes, parent); });
      return;
    }
    if (!isDynamic(node)) { parent.appendChild(document.importNode(node, true)); return; }
    var el = node.namespaceURI === 'http://www.w3.org/1999/xhtml'
      ? document.createElement(tag)
      : document.createElementNS(node.namespaceURI, node.localName);
    Array.prototype.forEach.call(node.attributes, function (a) {
      var m = WHOLE.exec(a.value);
      if (/^on[a-z]+$/.test(a.name) && m) {
        var fn = lookup(m[1], scopes);
        if (typeof fn === 'function') el.addEventListener(a.name.slice(2), function (e) { fn(e); });
        return;
      }
      if (m) {
        var raw = lookup(m[1], scopes);
        if (raw === false || raw == null) return;
        el.setAttribute(a.name, raw === true ? '' : String(raw));
        return;
      }
      el.setAttribute(a.name, a.value.indexOf('{{') === -1 ? a.value : interp(a.value, scopes));
    });
    node.childNodes.forEach(function (c) { build(c, scopes, el); });
    parent.appendChild(el);
  }

  function render() {
    var vals = instance.renderVals() || {};
    var frag = document.createDocumentFragment();
    template.childNodes.forEach(function (c) { build(c, [vals], frag); });
    root.replaceChildren(frag);
    if (!mounted) {
      mounted = true;
      if (typeof instance.componentDidMount === 'function') instance.componentDidMount();
    }
  }

  document.addEventListener('DOMContentLoaded', function () {
    template = document.getElementById('dc-template').content;
    root = document.getElementById('dc-root');
    var code = document.getElementById('dc-logic').textContent;
    var Component = new Function('DCLogic', code + '\n;return Component;')(DCLogic);
    instance = new Component({});
    render();
  });
})();

/* NeuroBot — core-part2.js (classic script; extends window.NB). */
(function () {
  "use strict";
  if (!window.NB) return;

  var $ = NB.$, $$ = NB.$$, el = NB.el, esc = NB.esc, uid = NB.uid;

  /* ---------- CRUD ---------- */
  function mutate(fn) { NB.setStore(fn(NB.getStore())); }

  function logActivity(kind, title) {
    return function (s) {
      var entry = { id: uid(), kind: kind, title: title, createdAt: Date.now() };
      return Object.assign({}, s, { activity: [entry].concat(s.activity).slice(0, 50) });
    };
  }

  NB.addNote = function (d) {
    mutate(function (s) {
      return Object.assign(
        logActivity("note", "Note captured: " + d.title)(s),
        { notes: [Object.assign({ id: uid(), kind: "note", createdAt: Date.now() }, d)].concat(s.notes) }
      );
    });
  };
  NB.updateNote = function (id, patch) {
    mutate(function (s) { return Object.assign({}, s, { notes: s.notes.map(function (n) { return n.id === id ? Object.assign({}, n, patch) : n; }) }); });
  };
  NB.removeNote = function (id) {
    mutate(function (s) { return Object.assign({}, s, { notes: s.notes.filter(function (n) { return n.id !== id; }) }); });
  };

  NB.addIdea = function (d) {
    mutate(function (s) {
      return Object.assign(
        logActivity("idea", "Idea logged: " + d.title)(s),
        { ideas: [Object.assign({ id: uid(), kind: "idea", createdAt: Date.now() }, d)].concat(s.ideas) }
      );
    });
  };
  NB.updateIdea = function (id, patch) {
    mutate(function (s) { return Object.assign({}, s, { ideas: s.ideas.map(function (i) { return i.id === id ? Object.assign({}, i, patch) : i; }) }); });
  };
  NB.removeIdea = function (id) {
    mutate(function (s) { return Object.assign({}, s, { ideas: s.ideas.filter(function (i) { return i.id !== id; }) }); });
  };

  NB.addGoal = function (d) {
    mutate(function (s) {
      return Object.assign(
        logActivity("goal", "Goal set: " + d.title)(s),
        { goals: [Object.assign({ id: uid(), kind: "goal", createdAt: Date.now() }, d)].concat(s.goals) }
      );
    });
  };
  NB.updateGoal = function (id, patch) {
    mutate(function (s) { return Object.assign({}, s, { goals: s.goals.map(function (g) { return g.id === id ? Object.assign({}, g, patch) : g; }) }); });
  };
  NB.removeGoal = function (id) {
    mutate(function (s) { return Object.assign({}, s, { goals: s.goals.filter(function (g) { return g.id !== id; }) }); });
  };

  NB.addKnowledge = function (d) {
    mutate(function (s) {
      return Object.assign(
        logActivity("knowledge", "Knowledge captured: " + d.title)(s),
        { knowledge: [Object.assign({ id: uid(), kind: "knowledge", createdAt: Date.now() }, d)].concat(s.knowledge) }
      );
    });
  };
  NB.updateKnowledge = function (id, patch) {
    mutate(function (s) { return Object.assign({}, s, { knowledge: s.knowledge.map(function (k) { return k.id === id ? Object.assign({}, k, patch) : k; }) }); });
  };
  NB.removeKnowledge = function (id) {
    mutate(function (s) { return Object.assign({}, s, { knowledge: s.knowledge.filter(function (k) { return k.id !== id; }) }); });
  };

  NB.removeActivity = function (id) {
    mutate(function (s) { return Object.assign({}, s, { activity: s.activity.filter(function (a) { return a.id !== id; }) }); });
  };

  NB.togglePin = function (kind, id) {
    mutate(function (s) {
      var key = kind === "knowledge" ? "knowledge" : kind + "s";
      var list = s[key];
      if (!list) return s;
      var next = {};
      next[key] = list.map(function (x) { return x.id === id ? Object.assign({}, x, { pinned: !x.pinned }) : x; });
      return Object.assign({}, s, next);
    });
  };

  NB.resetDemo = function () { NB.setStore(seed()); };
  NB.clearAll = function () { NB.setStore({ notes: [], ideas: [], goals: [], knowledge: [], activity: [] }); };

  NB.totalItems = function () {
    var s = NB.getStore();
    return s.notes.length + s.ideas.length + s.goals.length + s.knowledge.length;
  };

  /* ---------- Toast ---------- */

  NB.toast = function (msg, tone) {
    var root = $("#toast-root");
    if (!root) return;
    var t = el('<div class="toast ' + (tone || "ok") + '">' + esc(msg) + "</div>");
    root.appendChild(t);
    setTimeout(function () { t.classList.add("show"); }, 10);
    setTimeout(function () { t.classList.remove("show"); setTimeout(function () { t.remove(); }, 300); }, 2600);
  };

  /* ---------- Modal ---------- */

  NB.openModal = function (opts) {
    opts = opts || {};
    var root = $("#modal-root");
    if (!root) return { close: function () {}, body: document.createElement("div") };
    root.innerHTML = "";
    var title = opts.title || (opts.subtitle ? "" : "neurobot");
    var backdrop = el(
      '<div class="modal-backdrop open">' +
        '<div class="modal ' + (opts.large ? "modal-lg" : "") + '" role="dialog" aria-modal="true">' +
          '<div class="modal-head">' +
            '<span class="term-dots"><i></i><i></i><i></i></span>' +
            '<span class="term-title">' + esc(opts.subtitle || "") + "</span>" +
            '<span class="modal-heading">' + esc(title) + "</span>" +
            '<button class="modal-close" aria-label="Close">✕</button>' +
          "</div>" +
          '<div class="modal-body"></div>' +
        "</div>" +
      "</div>"
    );
    var close = function () {
      backdrop.remove();
      document.removeEventListener("keydown", onKey);
    };
    var onKey = function (e) { if (e.key === "Escape") close(); };
    document.addEventListener("keydown", onKey);
    backdrop.addEventListener("click", function (e) { if (e.target === backdrop) close(); });
    $(".modal-close", backdrop).addEventListener("click", close);
    root.appendChild(backdrop);
    return { close: close, body: $(".modal-body", backdrop) };
  };

  /* ---------- Capture form ---------- */

  function optionList(list, selected) {
    return list.map(function (o) {
      var value = typeof o === "string" ? o : o.value;
      var label = typeof o === "string" ? o : o.label;
      return '<option value="' + esc(value) + '"' + (value === selected ? " selected" : "") + ">" + esc(label) + "</option>";
    }).join("");
  }

  function captureFormHTML(kind, item) {
    var m = NB.ITEM_META[kind];
    var v = function (f, fb) { return item ? (item[f] != null ? item[f] : (fb == null ? "" : fb)) : (fb == null ? "" : fb); };
    var catField =
      kind === "knowledge"
        ? '<div class="field"><label>Topic</label><select id="f-topic">' + optionList(NB.TOPICS, v("topic", NB.TOPICS[0])) + "</select></div>" +
          '<div class="field"><label>Source</label><input id="f-source" placeholder="paper, course, person…" value="' + esc(v("source")) + '" /></div>'
        : '<div class="field"><label>Category</label><select id="f-category">' + optionList(NB.CATEGORIES, v("category", "General")) + "</select></div>";

    if (kind === "note" || kind === "knowledge") {
      return (
        '<div class="field"><label>Title</label><input id="f-title" placeholder="' + m.label + ' title…" value="' + esc(v("title")) + '" required /></div>' +
        '<div class="field"><label>' + (kind === "note" ? "Note" : "Knowledge") + '</label><textarea id="f-body" placeholder="Write it down…">' + esc(v("body")) + "</textarea></div>" +
        '<div class="field">' + catField + "</div>"
      );
    }
    if (kind === "idea") {
      return (
        '<div class="field"><label>Title</label><input id="f-title" placeholder="Idea title…" value="' + esc(v("title")) + '" required /></div>' +
        '<div class="field"><label>Description</label><textarea id="f-body" placeholder="Describe the idea…">' + esc(v("body")) + "</textarea></div>" +
        '<div class="field-row">' +
          '<div class="field">' + catField + "</div>" +
          '<div class="field"><label>Status</label><select id="f-status">' + optionList(NB.IDEA_STATUSES, v("status", "new")) + "</select></div>" +
        "</div>"
      );
    }
    /* goal */
    return (
      '<div class="field"><label>Title</label><input id="f-title" placeholder="Goal title…" value="' + esc(v("title")) + '" required /></div>' +
      '<div class="field"><label>Description</label><textarea id="f-body" placeholder="What does success look like?">' + esc(v("body")) + "</textarea></div>" +
      '<div class="field-row">' +
        '<div class="field"><label>Progress %</label><input id="f-progress" type="number" min="0" max="100" value="' + v("progress", 0) + '" /></div>' +
        '<div class="field"><label>Deadline</label><input id="f-deadline" type="date" value="' + esc(v("deadline")) + '" /></div>' +
      "</div>" +
      '<div class="field-row">' +
        '<div class="field">' + catField + "</div>" +
        '<div class="field"><label>Status</label><select id="f-status">' + optionList(NB.GOAL_STATUSES, v("status", "active")) + "</select></div>" +
      "</div>"
    );
  }

  NB.openCapture = function (kind, item, onSaved) {
    var m = NB.ITEM_META[kind];
    var modal = NB.openModal({
      subtitle: "$ neurobot " + kind + (item ? " --edit" : " --new"),
      title: item ? "Edit " + m.label : "New " + m.label,
    });
    modal.body.innerHTML =
      '<form id="capture-form" class="grid">' +
        captureFormHTML(kind, item) +
        '<div class="form-actions">' +
          '<button type="button" class="btn btn-outline btn-sm" data-cancel>Cancel</button>' +
          '<button type="submit" class="btn btn-primary btn-sm">' + (item ? "Save changes" : "Save " + m.label) + "</button>" +
        "</div>" +
      "</form>";
    var form = $("#capture-form", modal.body);
    setTimeout(function () { var t = $("#f-title", form); if (t) t.focus(); }, 30);
    $("[data-cancel]", form).addEventListener("click", modal.close);
    form.addEventListener("submit", function (e) {
      e.preventDefault();
      var val = function (sel) {
        var n = $(sel, form);
        return n ? String(n.value).trim() : "";
      };
      if (!val("#f-title")) return;
      var d;
      if (kind === "note") {
        d = { title: val("#f-title"), body: val("#f-body"), category: val("#f-category") || "General" };
        item ? NB.updateNote(item.id, d) : NB.addNote(d);
      } else if (kind === "idea") {
        d = { title: val("#f-title"), body: val("#f-body"), category: val("#f-category") || "General", status: val("#f-status") };
        item ? NB.updateIdea(item.id, d) : NB.addIdea(d);
      } else if (kind === "goal") {
        d = {
          title: val("#f-title"), body: val("#f-body"),
          progress: Math.max(0, Math.min(100, Number(val("#f-progress")) || 0)),
          deadline: val("#f-deadline") || new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10),
          status: val("#f-status"),
        };
        item ? NB.updateGoal(item.id, d) : NB.addGoal(d);
      } else {
        d = { title: val("#f-title"), body: val("#f-body"), topic: val("#f-topic"), source: val("#f-source") || "captured manually" };
        item ? NB.updateKnowledge(item.id, d) : NB.addKnowledge(d);
      }
      modal.close();
      NB.toast(item ? m.label + " updated." : m.label + " captured to your brain.");
      if (onSaved) onSaved();
    });
  };

  /* ---------- Neural graph (SVG, visual demo) ---------- */

  NB.renderGraph = function (target, opts) {
    if (!target) return;
    opts = opts || {};
    var W = 800, H = opts.height || 320;
    var nodes = [
      { id: "ai", label: "Artificial Intelligence", x: 50, y: 30, hub: true },
      { id: "ml", label: "Machine Learning", x: 27, y: 52 },
      { id: "prog", label: "Programming", x: 74, y: 50 },
      { id: "nb", label: "NeuroBot", x: 50, y: 74, hub: true },
      { id: "ent", label: "Entrepreneurship", x: 20, y: 22 },
      { id: "edu", label: "Education", x: 82, y: 20 },
    ];
    var edges = [["ai","ml"],["ai","prog"],["ai","ent"],["ai","edu"],["ai","nb"],["ml","prog"],["ml","nb"],["prog","nb"],["edu","prog"],["ent","ml"]];
    var px = function (n) { return (n.x / 100) * W; };
    var py = function (n) { return (n.y / 100) * H; };
    var edgesSvg = edges.map(function (e) {
      var A = nodes.filter(function (n) { return n.id === e[0]; })[0];
      var B = nodes.filter(function (n) { return n.id === e[1]; })[0];
      var x1 = px(A), y1 = py(A), x2 = px(B), y2 = py(B);
      var mx = (x1 + x2) / 2 + (y2 - y1) * 0.18;
      var my = (y1 + y2) / 2 - (x2 - x1) * 0.18;
      return '<path class="graph-edge" d="M ' + x1 + " " + y1 + " Q " + mx + " " + my + " " + x2 + " " + y2 + '" />';
    }).join("");
    var nodesSvg = nodes.map(function (n) {
      var r = n.hub ? 26 : 17, fs = n.hub ? 10.5 : 9;
      return (
        '<g class="graph-node ' + (n.hub ? "hub" : "") + '" transform="translate(' + px(n) + "," + py(n) + ')">' +
          '<circle r="' + r + '" />' +
          '<text text-anchor="middle" y="' + (r + fs + 3) + '" font-size="' + fs + '">' + esc(n.label) + "</text>" +
        "</g>"
      );
    }).join("");
    target.innerHTML = '<svg class="graph-svg" viewBox="0 0 ' + W + " " + H + '" role="img" aria-label="Knowledge graph (visual demo)">' + edgesSvg + nodesSvg + "</svg>";
  };
})();

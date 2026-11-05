(function () {
  const { findByProps } = vendetta.metro;
  const { React, ReactNative: RN } = vendetta.metro.common;
  const { before } = vendetta.patcher;
  const { storage } = vendetta.plugin;
  const { useProxy } = vendetta.storage;
  const { Forms } = vendetta.ui.components;
  const { FormSection, FormRow, FormDivider } = Forms;
  const h = React.createElement;

  const t = (fr, en) => (storage.lang === "fr" ? fr : en);

  const BG_MODE = {
    staysActiveInBackground: true,
    playsInSilentModeIOS: true,
    shouldDuckAndroid: false,
    playThroughEarpieceAndroid: false,
  };

  let patches = [];
  let appStateSub = null;
  let origStateDesc = null;
  const status = { audioApi: false, modeForced: false, videoCount: 0, jsxPatched: false, keepActive: false };

  // ---------- utilitaires ----------
  function forEachExport(cb) {
    const mods = vendetta.metro.modules || {};
    for (const id in mods) {
      try {
        const m = mods[id];
        if (!m || !m.isInitialized) continue;
        const e = m.publicModule && m.publicModule.exports;
        if (!e) continue;
        cb(e, id);
        if (e.default) cb(e.default, id);
      } catch (err) {}
    }
  }

  function scanNames(re, hideHooks) {
    const out = [];
    forEachExport(function (c, id) {
      if (c && (typeof c === "function" || typeof c === "object")) {
        const n = c.displayName || c.name;
        if (typeof n === "string" && re.test(n)) out.push(n + "#" + id);
      }
    });
    let r = Array.from(new Set(out));
    if (hideHooks) r = r.filter((n) => !/^(use|get|is|are|track)/.test(n));
    return r.slice(0, 60);
  }

  function describeByName(name) {
    const res = [];
    forEachExport(function (c, id) {
      if (c && typeof c === "function" && (c.displayName === name || c.name === name)) {
        let keys = [];
        try { keys = Object.getOwnPropertyNames(c.prototype || {}).concat(Object.keys(c)); } catch (e) {}
        res.push(name + "#" + id + ": " + (keys.filter((k) => k !== "constructor").join(", ") || "-"));
      }
    });
    return res;
  }

  function getAudioApi() {
    try {
      const a = findByProps("Sound", "setAudioModeAsync");
      if (a && a.setAudioModeAsync) return a;
    } catch (e) {}
    try {
      const m = findByProps("Audio", "Video");
      if (m && m.Audio && m.Audio.setAudioModeAsync) return m.Audio;
    } catch (e) {}
    return null;
  }

  function applyMode(api) {
    try {
      const r = api.setAudioModeAsync(BG_MODE);
      if (r && r.catch) r.catch(function () {});
    } catch (e) {}
  }

  // ---------- option expérimentale : l'app reste "active" pour Discord ----------
  function enableKeepActive() {
    try {
      const AS = RN.AppState;
      if (!AS || status.keepActive) return;
      origStateDesc = Object.getOwnPropertyDescriptor(AS, "currentState");
      Object.defineProperty(AS, "currentState", { configurable: true, get: function () { return "active"; } });
      patches.push(
        before("addEventListener", AS, function (args) {
          if (args[0] === "change" || args[0] === "blur") {
            const orig = args[1];
            args[1] = function () { return typeof orig === "function" ? orig("active") : undefined; };
          }
        })
      );
      status.keepActive = true;
    } catch (e) {}
  }

  function disableKeepActive() {
    try {
      if (origStateDesc) Object.defineProperty(RN.AppState, "currentState", origStateDesc);
    } catch (e) {}
    origStateDesc = null;
    status.keepActive = false;
  }

  // ---------- réglages ----------
  function Settings() {
    useProxy(storage);
    const [diag, setDiag] = React.useState("");
    const lang = storage.lang === "fr" ? "fr" : "en";
    const yn = (v) => (v ? "✓" : "✗");
    return h(
      RN.ScrollView,
      null,
      h(
        FormSection,
        { title: "Language / Langue", titleStyleType: "no_border" },
        h(FormRow, {
          label: lang === "fr" ? "Français  ✓  (appuie pour English)" : "English  ✓  (tap for Français)",
          onPress: function () { storage.lang = lang === "fr" ? "en" : "fr"; },
        })
      ),
      h(
        FormSection,
        { title: t("État", "Status") },
        h(FormRow, { label: yn(status.audioApi) + "  " + t("Moteur audio (expo-av) trouvé", "Audio engine (expo-av) found") }),
        h(FormDivider),
        h(FormRow, { label: status.videoCount + "  " + t("lecteurs Video patchés", "Video players patched") }),
        h(FormDivider),
        h(FormRow, { label: yn(status.keepActive) + "  " + t("App gardée « active »", "App kept \"active\"") })
      ),
      h(
        FormSection,
        { title: t("Option expérimentale", "Experimental option") },
        h(FormRow, {
          label: (storage.keepActive ? "ON" : "OFF") + "  " + t("Garder l'app « active » pour Discord", "Keep the app \"active\" for Discord"),
          subLabel: t(
            "Peut gêner les notifications. Redémarre Discord après changement.",
            "May affect notifications. Restart Discord after changing."
          ),
          onPress: function () {
            storage.keepActive = !storage.keepActive;
            if (storage.keepActive) enableKeepActive();
            else disableKeepActive();
          },
        })
      ),
      h(
        FormSection,
        { title: "Diagnostic" },
        h(FormRow, {
          label: t("Scanner : lecteur de messages vocaux", "Scan: voice message player"),
          onPress: function () {
            const a = scanNames(/VoiceMessage|AudioAttachment|AudioMessage|Waveform|MediaPlayer|AudioPlayer|Playback|SoundPlayer|^Video$/, false);
            const d = describeByName("SoundPlayer").concat(describeByName("Video"));
            setDiag((a.join("\n") || "none") + "\n\n" + d.join("\n"));
          },
        }),
        h(RN.Text, { selectable: true, style: { color: "#aaa", padding: 12 } }, diag)
      )
    );
  }

  return {
    onLoad: function () {
      if (storage.lang === undefined) storage.lang = "en";

      // 1) expo-av (s'il existe)
      const api = getAudioApi();
      if (api) {
        status.audioApi = true;
        patches.push(
          before("setAudioModeAsync", api, function (args) {
            args[0] = Object.assign({}, args[0], { staysActiveInBackground: true });
          })
        );
        applyMode(api);
        try {
          appStateSub = RN.AppState.addEventListener("change", function (s) {
            if (s !== "active") applyMode(api);
          });
        } catch (e) {}
      }

      // 2) tous les composants "Video" : lecture en arrière-plan
      try {
        const comps = [];
        forEachExport(function (c) {
          if (typeof c === "function" && (c.displayName === "Video" || c.name === "Video") && comps.indexOf(c) < 0) comps.push(c);
        });
        status.videoCount = comps.length;
        const jsxRt = findByProps("jsx", "jsxs");
        if (comps.length && jsxRt) {
          ["jsx", "jsxs"].forEach(function (k) {
            if (typeof jsxRt[k] !== "function") return;
            patches.push(
              before(k, jsxRt, function (args) {
                if (args[1] && comps.indexOf(args[0]) >= 0) {
                  args[1] = Object.assign({}, args[1], {
                    playInBackground: true,
                    playWhenInactive: true,
                    ignoreSilentSwitch: "ignore",
                  });
                }
              })
            );
          });
          status.jsxPatched = true;
        }
      } catch (e) {}

      // 3) option expérimentale (désactivée par défaut)
      if (storage.keepActive) enableKeepActive();
    },
    onUnload: function () {
      patches.forEach(function (p) { p(); });
      patches = [];
      disableKeepActive();
      try { if (appStateSub && appStateSub.remove) appStateSub.remove(); } catch (e) {}
      appStateSub = null;
    },
    settings: Settings,
  };
})()

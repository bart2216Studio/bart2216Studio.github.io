(function () {
  const { findByProps, findByName } = vendetta.metro;
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
  const status = { audioApi: false, modeForced: false, videoFound: false, jsxPatched: false };

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

  function scanModules(re) {
    const out = [];
    const mods = vendetta.metro.modules || {};
    for (const id in mods) {
      try {
        const m = mods[id];
        if (!m || !m.isInitialized) continue;
        const e = m.publicModule && m.publicModule.exports;
        if (!e) continue;
        for (const c of [e, e.default]) {
          if (c && (typeof c === "function" || typeof c === "object")) {
            const n = c.displayName || c.name;
            if (typeof n === "string" && re.test(n)) out.push(n + "#" + id);
          }
        }
      } catch (err) {}
    }
    return Array.from(new Set(out)).filter((n) => !/^(use|get|is|are|track)/.test(n)).slice(0, 40);
  }

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
        h(FormRow, { label: yn(status.audioApi) + "  " + t("Moteur audio trouvé", "Audio engine found") }),
        h(FormDivider),
        h(FormRow, { label: yn(status.modeForced) + "  " + t("Arrière-plan forcé", "Background mode forced") }),
        h(FormDivider),
        h(FormRow, { label: yn(status.videoFound) + "  " + t("Lecteur vidéo/audio trouvé", "Video/audio player found") }),
        h(FormDivider),
        h(FormRow, { label: yn(status.jsxPatched) + "  " + t("Option de lecture en fond ajoutée", "Background playback option added") })
      ),
      h(
        FormSection,
        { title: "Diagnostic" },
        h(FormRow, {
          label: t("Scanner les modules audio", "Scan audio modules"),
          onPress: function () {
            setDiag(scanModules(/Sound|AudioPlayer|AudioManager|AudioModule|MediaPlayer|VideoPlayer|^Video$/).join("\n") || "none");
          },
        }),
        h(RN.Text, { selectable: true, style: { color: "#aaa", padding: 12 } }, diag)
      )
    );
  }

  return {
    onLoad: function () {
      if (storage.lang === undefined) storage.lang = "en";

      // 1) expo-av : forcer "continuer en arrière-plan" à chaque réglage du mode audio
      const api = getAudioApi();
      if (api) {
        status.audioApi = true;
        patches.push(
          before("setAudioModeAsync", api, function (args) {
            args[0] = Object.assign({}, args[0], { staysActiveInBackground: true });
          })
        );
        applyMode(api);
        status.modeForced = true;
        // ré-applique au moment où l'app passe en arrière-plan
        try {
          appStateSub = RN.AppState.addEventListener("change", function (s) {
            if (s !== "active") applyMode(api);
          });
        } catch (e) {}
      }

      // 2) react-native-video : ajouter playInBackground aux lecteurs
      try {
        const V = findByName("Video", false);
        const Vc = V && (V.default || V);
        const jsxRt = findByProps("jsx", "jsxs");
        if (Vc) status.videoFound = true;
        if (Vc && jsxRt) {
          ["jsx", "jsxs"].forEach(function (k) {
            if (typeof jsxRt[k] !== "function") return;
            patches.push(
              before(k, jsxRt, function (args) {
                if (args[0] === Vc && args[1]) {
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
    },
    onUnload: function () {
      patches.forEach(function (p) { p(); });
      patches = [];
      try { if (appStateSub && appStateSub.remove) appStateSub.remove(); } catch (e) {}
      appStateSub = null;
    },
    settings: Settings,
  };
})()

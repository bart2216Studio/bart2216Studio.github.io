(function () {
  const { findByProps } = vendetta.metro;
  const { React, ReactNative: RN } = vendetta.metro.common;
  const FluxDispatcher = vendetta.metro.common.FluxDispatcher || findByProps("dispatch", "subscribe");
  const { storage } = vendetta.plugin;
  const { useProxy } = vendetta.storage;
  const { Forms } = vendetta.ui.components;
  const { FormSection, FormRow, FormDivider } = Forms;
  const h = React.createElement;

  const t = (fr, en) => (storage.lang === "fr" ? fr : en);

  const DEFAULTS = {
    enabled: true,
    interval: 60,
    showTitle: true,
    showGame: true,
    showViewers: false,
    showElapsed: true,
    showThumbnail: true,
    showButton: true,
    buttonLabel: "Watch on Twitch",
    activityName: "",
    appId: "",
  };
  const cfg = (k) => (storage[k] === undefined ? DEFAULTS[k] : storage[k]);

  // ---------- état affiché dans les réglages ----------
  const status = { state: "idle", info: "", last: 0 };
  const subs = new Set();
  const notify = () => subs.forEach((f) => f());
  function useStatus() {
    const [, force] = React.useReducer((x) => x + 1, 0);
    React.useEffect(() => {
      subs.add(force);
      return () => { subs.delete(force); };
    }, []);
    return status;
  }
  function setStatus(state, info) {
    status.state = state; status.info = info || ""; status.last = Date.now();
    notify();
  }

  // ---------- API Twitch ----------
  async function getToken(force) {
    const id = String(storage.clientId || "").trim();
    const secret = String(storage.clientSecret || "").trim();
    const now = Date.now();
    if (!force && storage.token && storage.tokenFor === id && storage.tokenExp && now < storage.tokenExp - 60000) {
      return storage.token;
    }
    const body =
      "client_id=" + encodeURIComponent(id) +
      "&client_secret=" + encodeURIComponent(secret) +
      "&grant_type=client_credentials";
    const r = await fetch("https://id.twitch.tv/oauth2/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: body,
    });
    const j = await r.json();
    if (!r.ok || !j.access_token) throw new Error(j.message || "token " + r.status);
    storage.token = j.access_token;
    storage.tokenExp = now + (j.expires_in || 0) * 1000;
    storage.tokenFor = id;
    return j.access_token;
  }

  async function fetchStream(login) {
    const id = String(storage.clientId || "").trim();
    const url = "https://api.twitch.tv/helix/streams?user_login=" + encodeURIComponent(login);
    const call = async (token) =>
      fetch(url, { headers: { "Client-Id": id, Authorization: "Bearer " + token } });
    let r = await call(await getToken(false));
    if (r.status === 401) r = await call(await getToken(true));
    if (!r.ok) throw new Error("Twitch " + r.status);
    const j = await r.json();
    return (j.data && j.data[0]) || null;
  }

  // ---------- activité Discord ----------
  let thumbCache = { key: "", id: null };

  async function getThumbAsset(appId, url) {
    const key = appId + "|" + url;
    if (thumbCache.key === key) return thumbCache.id;
    try {
      const u = findByProps("fetchAssetIds");
      if (!u) return null;
      const ids = await u.fetchAssetIds(appId, [url]);
      thumbCache = { key: key, id: (ids && ids[0]) || null };
      return thumbCache.id;
    } catch (e) {
      return null;
    }
  }

  async function buildActivity(s) {
    const login = s.user_login;
    const watchUrl = "https://twitch.tv/" + login;
    const act = {
      name: String(cfg("activityName") || s.user_name || login).slice(0, 128),
      type: 1,
      url: watchUrl,
      flags: 0,
    };
    if (cfg("showTitle") && s.title) act.details = String(s.title).slice(0, 128);
    const parts = [];
    if (cfg("showGame") && s.game_name) parts.push(s.game_name);
    if (cfg("showViewers")) parts.push(s.viewer_count + " " + t("spectateurs", "viewers"));
    if (parts.length) act.state = parts.join(" • ").slice(0, 128);
    if (cfg("showElapsed") && s.started_at) act.timestamps = { start: Date.parse(s.started_at) };

    const appId = String(cfg("appId") || "").trim();
    if (appId) {
      act.application_id = appId;
      if (cfg("showThumbnail") && s.thumbnail_url) {
        const thumb =
          s.thumbnail_url.replace("{width}", "440").replace("{height}", "248") +
          "?t=" + Math.floor(Date.now() / 300000);
        const id = await getThumbAsset(appId, thumb);
        if (id) act.assets = { large_image: id, large_text: String(s.title || "").slice(0, 128) };
      }
      if (cfg("showButton")) {
        act.buttons = [String(cfg("buttonLabel") || "Watch on Twitch").slice(0, 32)];
        act.metadata = { button_urls: [watchUrl] };
      }
    }
    return act;
  }

  function setActivity(activity) {
    try {
      FluxDispatcher.dispatch({
        type: "LOCAL_ACTIVITY_UPDATE",
        activity: activity,
        pid: 1608,
        socketId: "TwitchStatus@bart_2216Studio",
      });
    } catch (e) {}
  }

  // ---------- boucle de vérification ----------
  let timer = null;
  let busy = false;

  async function check() {
    if (busy) return;
    busy = true;
    try {
      if (!cfg("enabled")) {
        setActivity(null);
        setStatus("disabled");
        return;
      }
      const login = String(storage.channel || "").trim().toLowerCase();
      if (!String(storage.clientId || "").trim() || !String(storage.clientSecret || "").trim() || !login) {
        setActivity(null);
        setStatus("missing");
        return;
      }
      const s = await fetchStream(login);
      if (s && s.type === "live") {
        setActivity(await buildActivity(s));
        setStatus("live", s.title || "");
      } else {
        setActivity(null);
        setStatus("offline");
      }
    } catch (e) {
      setStatus("error", String((e && e.message) || e));
    } finally {
      busy = false;
    }
  }

  function start() {
    if (timer) clearInterval(timer);
    const sec = Math.max(30, Number(cfg("interval")) || 60);
    check();
    timer = setInterval(check, sec * 1000);
  }

  // ---------- interface ----------
  function Field(p) {
    return h(
      RN.View,
      { style: { paddingHorizontal: 16, paddingVertical: 8 } },
      h(RN.Text, { style: { color: "#b5bac1", fontSize: 12, marginBottom: 4 } }, p.label),
      h(RN.TextInput, {
        value: p.value,
        onChangeText: p.onChange,
        onEndEditing: start,
        placeholder: p.placeholder,
        placeholderTextColor: "#777",
        autoCapitalize: "none",
        autoCorrect: false,
        secureTextEntry: !!p.secure,
        keyboardType: p.numeric ? "numeric" : "default",
        style: { color: "#fff", backgroundColor: "#1e1f22", borderRadius: 8, paddingHorizontal: 12, paddingVertical: 10 },
      })
    );
  }

  function Toggle(p) {
    return h(FormRow, {
      label: (cfg(p.k) ? "✓" : "✗") + "  " + p.label,
      onPress: function () {
        storage[p.k] = !cfg(p.k);
        check();
      },
    });
  }

  function Settings() {
    useProxy(storage);
    const st = useStatus();
    const lang = storage.lang === "fr" ? "fr" : "en";
    const labels = {
      idle: t("En attente", "Waiting"),
      disabled: t("Désactivé", "Disabled"),
      missing: t("Renseigne Client ID, Secret et chaîne", "Fill in Client ID, Secret and channel"),
      live: t("🔴 EN LIVE", "🔴 LIVE"),
      offline: t("Hors ligne", "Offline"),
      error: t("Erreur", "Error"),
    };
    const ago = st.last ? Math.round((Date.now() - st.last) / 1000) + "s" : "-";

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
        h(FormRow, { label: labels[st.state] || st.state, subLabel: (st.info ? st.info + "\n" : "") + t("Dernière vérif : ", "Last check: ") + ago }),
        h(FormDivider),
        h(FormRow, { label: t("Vérifier maintenant", "Check now"), onPress: check }),
        h(FormDivider),
        h(FormRow, {
          label: t("Effacer le statut", "Clear status"),
          onPress: function () { setActivity(null); setStatus("idle"); },
        })
      ),
      h(
        FormSection,
        { title: t("API Twitch", "Twitch API") },
        h(Field, { label: "Client ID", value: storage.clientId || "", onChange: function (v) { storage.clientId = v; } }),
        h(Field, { label: "Client Secret", secure: true, value: storage.clientSecret || "", onChange: function (v) { storage.clientSecret = v; } }),
        h(RN.Text, { style: { color: "#888", fontSize: 11, paddingHorizontal: 16, paddingBottom: 8 } },
          t("Crée une application sur dev.twitch.tv/console. Le secret reste sur ce téléphone.",
            "Create an app at dev.twitch.tv/console. The secret stays on this phone."))
      ),
      h(
        FormSection,
        { title: t("Chaîne et rafraîchissement", "Channel and refresh") },
        h(Field, { label: t("Nom de ta chaîne Twitch", "Your Twitch channel name"), placeholder: "bart_2216", value: storage.channel || "", onChange: function (v) { storage.channel = v; } }),
        h(Field, { label: t("Intervalle (secondes, min 30)", "Interval (seconds, min 30)"), numeric: true, value: String(cfg("interval")), onChange: function (v) { storage.interval = Number(v.replace(/[^0-9]/g, "")) || 60; } })
      ),
      h(
        FormSection,
        { title: t("Affichage", "Display") },
        h(Toggle, { k: "enabled", label: t("Plugin activé", "Plugin enabled") }),
        h(FormDivider),
        h(Toggle, { k: "showTitle", label: t("Titre du live", "Stream title") }),
        h(FormDivider),
        h(Toggle, { k: "showGame", label: t("Jeu / catégorie", "Game / category") }),
        h(FormDivider),
        h(Toggle, { k: "showViewers", label: t("Nombre de spectateurs", "Viewer count") }),
        h(FormDivider),
        h(Toggle, { k: "showElapsed", label: t("Temps écoulé", "Elapsed time") }),
        h(FormDivider),
        h(Toggle, { k: "showThumbnail", label: t("Miniature (Application ID requis)", "Thumbnail (Application ID needed)") }),
        h(FormDivider),
        h(Toggle, { k: "showButton", label: t("Bouton (Application ID requis)", "Button (Application ID needed)") }),
        h(Field, { label: t("Texte du bouton", "Button label"), value: cfg("buttonLabel"), onChange: function (v) { storage.buttonLabel = v; } }),
        h(Field, { label: t("Nom affiché (vide = nom de la chaîne)", "Displayed name (empty = channel name)"), value: cfg("activityName"), onChange: function (v) { storage.activityName = v; } }),
        h(Field, { label: "Discord Application ID (" + t("optionnel", "optional") + ")", numeric: true, value: cfg("appId"), onChange: function (v) { storage.appId = v.replace(/[^0-9]/g, ""); } }),
        h(RN.Text, { style: { color: "#888", fontSize: 11, paddingHorizontal: 16, paddingBottom: 8 } },
          t("Crée une application sur discord.com/developers pour la miniature et le bouton.",
            "Create an app at discord.com/developers for the thumbnail and button."))
      )
    );
  }

  return {
    onLoad: function () {
      if (storage.lang === undefined) storage.lang = "en";
      start();
    },
    onUnload: function () {
      if (timer) { clearInterval(timer); timer = null; }
      setActivity(null);
    },
    settings: Settings,
  };
})()

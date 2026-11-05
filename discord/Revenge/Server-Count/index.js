(function () {
  const { findByStoreName, findByProps } = vendetta.metro;
  const { React, ReactNative: RN } = vendetta.metro.common;
  const { after } = vendetta.patcher;
  const { storage } = vendetta.plugin;
  const { useProxy } = vendetta.storage;
  const { showToast } = vendetta.ui.toasts;
  const { Forms } = vendetta.ui.components;
  const { FormSection, FormRow, FormDivider } = Forms;
  const h = React.createElement;

  const GuildStore = findByStoreName("GuildStore");
  const storesMod = findByProps("useStateFromStores");
  const useStateFromStores = storesMod && storesMod.useStateFromStores;

  const TEXTS = {
    en: { one: "server", many: "servers", notFound: "Server Count: GuildsBarFooterWrapper not found" },
    fr: { one: "serveur", many: "serveurs", notFound: "Server Count : GuildsBarFooterWrapper introuvable" },
  };
  const tr = () => (storage.lang === "fr" ? TEXTS.fr : TEXTS.en);

  function countGuilds() {
    try {
      if (GuildStore.getGuildCount) return GuildStore.getGuildCount();
      return Object.keys(GuildStore.getGuilds()).length;
    } catch (e) {
      return 0;
    }
  }

  function Counter() {
    useProxy(storage); // se met à jour quand la langue change
    const n = useStateFromStores ? useStateFromStores([GuildStore], countGuilds) : countGuilds();
    const t = tr();
    return h(
      RN.View,
      { style: { alignItems: "center", paddingVertical: 6 } },
      h(RN.Text, { style: { color: "#b5bac1", fontSize: 13, fontWeight: "700" } }, String(n)),
      h(RN.Text, { style: { color: "#b5bac1", fontSize: 10 } }, n > 1 ? t.many : t.one)
    );
  }

  function Settings() {
    useProxy(storage);
    const current = storage.lang === "fr" ? "fr" : "en";
    const langs = [["en", "English"], ["fr", "Français"]];
    return h(
      RN.ScrollView,
      null,
      h(
        FormSection,
        { title: "Language / Langue", titleStyleType: "no_border" },
        langs.map(function (l, i) {
          return h(
            React.Fragment,
            { key: l[0] },
            i > 0 && h(FormDivider),
            h(FormRow, {
              label: l[1] + (current === l[0] ? "  ✓" : ""),
              onPress: function () { storage.lang = l[0]; },
            })
          );
        })
      )
    );
  }

  // retrouve un composant par son nom dans le registre des modules
  function findExport(name) {
    const mods = vendetta.metro.modules || {};
    for (const id in mods) {
      try {
        const m = mods[id];
        if (!m || !m.isInitialized) continue;
        const e = m.publicModule && m.publicModule.exports;
        if (!e) continue;
        const d = e.default;
        if (typeof d === "function" && (d.displayName === name || d.name === name)) return { obj: e, key: "default" };
        if (typeof e === "object") {
          for (const k of Object.keys(e)) {
            const v = e[k];
            if (typeof v === "function" && (v.displayName === name || v.name === name)) return { obj: e, key: k };
          }
        }
      } catch (err) {}
    }
    return null;
  }

  let patches = [];
  let timer = null;

  function tryPatch() {
    const target = findExport("GuildsBarFooterWrapper");
    if (!target) return false;
    patches.push(
      after(target.key, target.obj, function (_, tree) {
        return h(RN.View, null, tree, h(Counter));
      })
    );
    return true;
  }

  return {
    onLoad: function () {
      if (storage.lang === undefined) storage.lang = "en";
      if (tryPatch()) return;
      // le module peut ne pas être encore chargé : on réessaie quelques secondes
      let tries = 0;
      timer = setInterval(function () {
        tries++;
        if (tryPatch()) {
          clearInterval(timer);
          timer = null;
        } else if (tries >= 20) {
          clearInterval(timer);
          timer = null;
          showToast(tr().notFound);
        }
      }, 1500);
    },
    onUnload: function () {
      if (timer) { clearInterval(timer); timer = null; }
      patches.forEach(function (p) { p(); });
      patches = [];
    },
    settings: Settings,
  };
})()

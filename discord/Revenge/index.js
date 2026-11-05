(function () {
  const { findByStoreName, findByProps } = vendetta.metro;
  const { React, ReactNative: RN } = vendetta.metro.common;
  const { after } = vendetta.patcher;
  const { showToast } = vendetta.ui.toasts;
  const h = React.createElement;

  const GuildStore = findByStoreName("GuildStore");
  const storesMod = findByProps("useStateFromStores");
  const useStateFromStores = storesMod && storesMod.useStateFromStores;

  function countGuilds() {
    try {
      if (GuildStore.getGuildCount) return GuildStore.getGuildCount();
      return Object.keys(GuildStore.getGuilds()).length;
    } catch (e) {
      return 0;
    }
  }

  function Counter() {
    const n = useStateFromStores ? useStateFromStores([GuildStore], countGuilds) : countGuilds();
    return h(
      RN.View,
      { style: { alignItems: "center", paddingVertical: 6 } },
      h(RN.Text, { style: { color: "#b5bac1", fontSize: 13, fontWeight: "700" } }, String(n)),
      h(RN.Text, { style: { color: "#b5bac1", fontSize: 10 } }, n > 1 ? "serveurs" : "serveur")
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

  return {
    onLoad: function () {
      const target = findExport("GuildsBarFooterWrapper");
      if (!target) {
        showToast("Server Count : GuildsBarFooterWrapper introuvable");
        return;
      }
      patches.push(
        after(target.key, target.obj, function (_, tree) {
          return h(RN.View, null, tree, h(Counter));
        })
      );
    },
    onUnload: function () {
      patches.forEach(function (p) { p(); });
      patches = [];
    },
  };
})()

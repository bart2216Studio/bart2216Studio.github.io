(function () {
  const { findByProps, findByStoreName, findByName } = vendetta.metro;
  const { React, ReactNative: RN } = vendetta.metro.common;
  const { before, after } = vendetta.patcher;
  const { storage } = vendetta.plugin;
  const { useProxy } = vendetta.storage;
  const { showToast } = vendetta.ui.toasts;
  const { Forms } = vendetta.ui.components;
  const { FormSection, FormRow, FormDivider } = Forms;
  const h = React.createElement;

  const LazyActionSheet = findByProps("openLazy", "hideActionSheet");
  const ReadStateStore = findByStoreName("ReadStateStore");
  const ChannelStore = findByStoreName("ChannelStore");
  const storesMod = findByProps("useStateFromStores");
  const useStateFromStores = storesMod && storesMod.useStateFromStores;

  // storage.exceptions = { [channelId]: { guildId, name } }
  const getEx = () => storage.exceptions || {};
  const isEx = (id) => !!getEx()[id];

  function toggleException(channel) {
    if (!storage.exceptions) storage.exceptions = {};
    if (storage.exceptions[channel.id]) {
      delete storage.exceptions[channel.id];
      showToast("Retiré des exceptions : #" + channel.name);
    } else {
      storage.exceptions[channel.id] = { guildId: channel.guild_id, name: channel.name };
      showToast("Ajouté aux exceptions : #" + channel.name);
    }
  }

  function openChannel(id, guildId) {
    try {
      const nav = findByProps("transitionToGuild");
      if (nav && nav.transitionToGuild) return nav.transitionToGuild(guildId, id);
    } catch (e) {}
    try {
      const sel = findByProps("selectChannel");
      if (sel) return sel.selectChannel(guildId, id);
    } catch (e) {}
    showToast("Impossible d'ouvrir le salon");
  }

  // ---- état non lu (fonctionne même si le serveur est muté) ----
  function useExceptions() {
    useProxy(storage);
    const ids = Object.keys(getEx());
    const sig = useStateFromStores
      ? useStateFromStores([ReadStateStore], () =>
          ids.map((id) =>
            id + ":" + (ReadStateStore.hasUnread(id) ? 1 : 0) + ":" + (ReadStateStore.getMentionCount(id) || 0)
          ).join("|")
        )
      : "";
    return ids.map((id, i) => {
      const part = (sig.split("|")[i] || "").split(":");
      return {
        id: id,
        guildId: getEx()[id].guildId,
        name: getEx()[id].name,
        unread: part[1] === "1",
        mentions: Number(part[2] || 0),
      };
    });
  }

  // ---- raccourcis en haut de la liste des serveurs ----
  function Shortcuts() {
    const items = useExceptions().filter((e) => e.unread);
    if (!items.length) return null;
    return h(
      RN.View,
      { style: { alignItems: "center", paddingTop: 6 } },
      items.map((e) =>
        h(
          RN.Pressable,
          {
            key: "ex-" + e.id,
            onPress: () => openChannel(e.id, e.guildId),
            style: {
              width: 48, height: 48, borderRadius: 16, marginBottom: 8,
              alignItems: "center", justifyContent: "center", backgroundColor: "#5865F2",
            },
          },
          h(RN.Text, { style: { color: "#fff", fontWeight: "700" } }, "#" + (e.name || "?").slice(0, 2)),
          e.mentions > 0
            ? h(
                RN.View,
                { style: { position: "absolute", right: -4, bottom: -4, minWidth: 18, height: 18, borderRadius: 9, backgroundColor: "#ED4245", alignItems: "center", justifyContent: "center", paddingHorizontal: 4 } },
                h(RN.Text, { style: { color: "#fff", fontSize: 11, fontWeight: "700" } }, String(e.mentions))
              )
            : h(RN.View, { style: { position: "absolute", left: -6, width: 6, height: 20, borderRadius: 3, backgroundColor: "#fff" } })
        )
      )
    );
  }

  // ---- ligne dans le menu d'appui long d'un salon ----
  const isRow = (el) =>
    !!(el && el.props &&
      (typeof el.props.label === "string" || typeof el.props.message === "string") &&
      (typeof el.props.onPress === "function" || typeof el.props.onPressRow === "function"));

  function findRowArray(node, depth) {
    depth = depth || 0;
    if (!node || typeof node !== "object" || depth > 15) return;
    const children = node.props && node.props.children;
    if (Array.isArray(children)) {
      if (children.some(isRow)) return children;
      for (const c of children) {
        const f = findRowArray(c, depth + 1);
        if (f) return f;
      }
    } else if (children) return findRowArray(children, depth + 1);
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
    return Array.from(new Set(out)).filter((n) => !/^(use|get|is|are|compute|track|transition)/.test(n)).slice(0, 40);
  }

  // ---- réglages ----
  function Settings() {
    const items = useExceptions();
    const [scan, setScan] = React.useState("");
    return h(
      RN.ScrollView,
      null,
      h(
        FormSection,
        { title: "Salons en exception", titleStyleType: "no_border" },
        items.length
          ? items.map((e, i) =>
              h(
                React.Fragment,
                { key: e.id },
                i > 0 && h(FormDivider),
                h(FormRow, {
                  label: "#" + e.name + (e.unread ? "  ●" : ""),
                  subLabel: "Appuie pour retirer",
                  onPress: () => toggleException({ id: e.id, name: e.name }),
                })
              )
            )
          : h(FormRow, { label: "Aucune exception", subLabel: "Appui long sur un salon → Add to exception" })
      ),
      h(
        FormSection,
        { title: "Diagnostic" },
        h(FormRow, {
          label: "Debug (toasts) : " + (storage.debug ? "ON" : "OFF"),
          onPress: () => { storage.debug = !storage.debug; },
        }),
        h(FormDivider),
        h(RN.Text, { selectable: true, style: { color: "#aaa", padding: 12 } },
          "Clés de menus vues :\n" + ((storage.seenKeys || []).join("\n") || "(aucune)")),
        h(FormDivider),
        h(FormRow, {
          label: "Scanner les composants",
          subLabel: "GuildsBar, MP non lus, menus de salon",
          onPress: () =>
            setScan(
              "== GuildsBar ==\n" + (scanModules(/GuildsBar|GuildsList|GuildsNav/).join("\n") || "rien") +
              "\n\n== MP non lus ==\n" + (scanModules(/Unread|DMsBar|DMList|PrivateChannels/).join("\n") || "rien") +
              "\n\n== Menu salon ==\n" + (scanModules(/ChannelLongPress|ChannelActionSheet|ChannelContextMenu|ChannelActions/).join("\n") || "rien")
            ),
        }),
        h(RN.Text, { selectable: true, style: { color: "#aaa", padding: 12 } }, scan)
      )
    );
  }

  let patches = [];

  return {
    onLoad: function () {
      if (storage.debug === undefined) storage.debug = true;
      // 1) bouton dans le menu du salon (+ diagnostic)
      patches.push(
        before("openLazy", LazyActionSheet, function (args) {
          const component = args[0];
          const key = String(args[1] || "");
          const props = args[2] || {};
          if (!storage.seenKeys) storage.seenKeys = [];
          if (storage.seenKeys.indexOf(key) < 0 && storage.seenKeys.length < 40) storage.seenKeys.push(key);
          if (props.message) return;
          const channel = props.channel || (props.channelId && ChannelStore.getChannel(props.channelId));
          if (storage.debug) showToast("SE key=" + key + " salon=" + (channel ? "oui" : "non"));
          if (!channel || !channel.guild_id) return;
          if (!component || typeof component.then !== "function") return;

          component.then(function (instance) {
            const unpatch = after("default", instance, function (_, tree) {
              React.useEffect(function () { return function () { unpatch(); }; }, []);
              const rows = findRowArray(tree);
              if (storage.debug) showToast("SE lignes: " + (rows ? rows.length : "aucune"));
              if (!rows) return;
              const sample = rows.find(isRow);
              const onPress = function () {
                LazyActionSheet.hideActionSheet();
                toggleException(channel);
              };
              const label = isEx(channel.id) ? "Remove from exceptions" : "Add to exception";
              const rowProps = sample.props.onPressRow
                ? { key: "se-toggle", message: label, onPressRow: onPress }
                : { key: "se-toggle", label: label, onPress: onPress };
              rows.splice(1, 0, h(sample.type, rowProps));
            });
          });
        })
      );

      // 2) raccourcis en haut de la liste des serveurs (meilleur effort)
      const names = ["GuildsBar", "ConnectedGuildsBar", "GuildsList", "GuildsNav"];
      let done = false;
      for (const n of names) {
        try {
          const mod = findByName(n, false);
          if (mod && typeof mod.default === "function") {
            patches.push(
              after("default", mod, function (_, tree) {
                return h(RN.View, { style: { flex: 1 } }, h(Shortcuts), h(RN.View, { style: { flex: 1 } }, tree));
              })
            );
            showToast("Server Exceptions : liste trouvée (" + n + ")");
            done = true;
            break;
          }
        } catch (e) {}
      }
      if (!done) showToast("Server Exceptions : liste des serveurs introuvable, voir les réglages");
    },
    onUnload: function () {
      patches.forEach(function (p) { p(); });
      patches = [];
    },
    settings: Settings,
  };
})()

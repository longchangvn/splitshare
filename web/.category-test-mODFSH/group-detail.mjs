// src/pages/GroupDetail.jsx
import { useEffect as useEffect8, useMemo as useMemo2, useRef as useRef2, useState as useState8 } from "react";
import { Link as Link4, useLocation as useLocation3, useNavigate as useNavigate3, useParams as useParams3 } from "react-router-dom";
import {
  ActionIcon as ActionIcon3,
  Anchor as Anchor3,
  Avatar as Avatar3,
  Box as Box6,
  Button as Button4,
  Card as Card3,
  Collapse,
  CopyButton,
  Group as Group7,
  Indicator,
  Loader as Loader2,
  Menu as Menu2,
  Modal as Modal4,
  Progress,
  SegmentedControl,
  Select as Select4,
  Skeleton as Skeleton2,
  Stack as Stack5,
  Tabs,
  Text as Text8,
  Textarea,
  TextInput as TextInput2,
  Title as Title2,
  Tooltip as Tooltip2
} from "@mantine/core";
import { useMediaQuery as useMediaQuery2 } from "@mantine/hooks";
import { notifications as notifications2 } from "@mantine/notifications";

// src/api.js
var BASE = (import.meta.env.VITE_API_BASE || "").replace(/\/+$/, "");
function getAccess() {
  return localStorage.getItem("ss_at");
}
function getRefresh() {
  return localStorage.getItem("ss_rt");
}
function setTokens(at, rt) {
  if (at) localStorage.setItem("ss_at", at);
  else localStorage.removeItem("ss_at");
  if (rt) localStorage.setItem("ss_rt", rt);
  else localStorage.removeItem("ss_rt");
}
function clearTokens() {
  localStorage.removeItem("ss_at");
  localStorage.removeItem("ss_rt");
}
var ApiError = class extends Error {
  constructor(status, data) {
    super(data?.message || `HTTP ${status}`);
    this.status = status;
    this.code = data?.code;
    this.fields = data?.fields;
  }
};
async function req(method, path, body, extra = {}) {
  const headers = { ...extra.headers || {} };
  let payload;
  if (body !== void 0 && !extra.form) {
    headers["Content-Type"] = "application/json";
    payload = JSON.stringify(body);
  } else if (extra.form) {
    payload = extra.form;
  }
  if (getAccess()) headers["Authorization"] = `Bearer ${getAccess()}`;
  const r = await fetch(BASE + path, { method, headers, body: payload });
  const text = await r.text();
  const data = text ? JSON.parse(text) : null;
  if (!r.ok) throw new ApiError(r.status, data);
  return data;
}
var inflightRefresh = null;
async function doRefresh() {
  const rt = getRefresh();
  if (!rt) throw new ApiError(401, { code: "SESSION_EXPIRED", message: "Session expired." });
  const r = await fetch(`${BASE}/api/v1/auth/refresh`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ refresh_token: rt })
  });
  const text = await r.text();
  const data = text ? JSON.parse(text) : null;
  if (!r.ok) {
    clearTokens();
    throw new ApiError(r.status, { code: "SESSION_EXPIRED", message: "Session expired." });
  }
  setTokens(data.access_token, data.refresh_token);
}
async function reqAuth(method, path, body, extra = {}) {
  try {
    return await req(method, path, body, extra);
  } catch (err) {
    const isAuthPath = path.startsWith("/api/v1/auth/");
    if (!(err instanceof ApiError) || err.status !== 401 || isAuthPath || extra._retried) throw err;
    if (!inflightRefresh) {
      inflightRefresh = doRefresh().finally(() => {
        inflightRefresh = null;
      });
    }
    await inflightRefresh;
    return req(method, path, body, { ...extra, _retried: true });
  }
}
var api = {
  get: (p) => reqAuth("GET", p),
  post: (p, b) => reqAuth("POST", p, b ?? {}),
  postForm: (p, form) => reqAuth("POST", p, void 0, { form }),
  patch: (p, b) => reqAuth("PATCH", p, b ?? {}),
  del: (p) => reqAuth("DELETE", p)
};
var CURRENCY_SYMBOL = {
  USD: "$",
  EUR: "\u20AC",
  GBP: "\xA3",
  VND: "\u20AB"
};
function fmt(cents, currency = "USD") {
  const code = String(currency || "USD").toUpperCase();
  const value = Number(cents || 0) / 100;
  const amount = new Intl.NumberFormat("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  }).format(Number.isFinite(value) ? value : 0);
  const sym = CURRENCY_SYMBOL[code];
  return sym ? `${sym}${amount}` : `${code} ${amount}`;
}

// src/auth.jsx
import { createContext as createContext2, useContext as useContext2, useEffect as useEffect2, useState as useState2 } from "react";
import { useNavigate } from "react-router-dom";
import { Alert, Center, Loader } from "@mantine/core";

// src/prefs.jsx
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";

// src/i18n/messages.js
var LOCALES = ["en", "vi"];
var LOCALE_META = {
  en: { code: "EN", label: "English", native: "English" },
  vi: { code: "VI", label: "Vietnamese", native: "Ti\u1EBFng Vi\u1EC7t" }
};

// src/prefs.jsx
var PrefsContext = createContext(null);
function usePrefs() {
  const ctx = useContext(PrefsContext);
  if (!ctx) throw new Error("usePrefs must be used within PrefsProvider");
  return ctx;
}
function useT() {
  return usePrefs().t;
}

// src/auth.jsx
var Ctx = createContext2(null);
var useAuth = () => useContext2(Ctx);
function Err({ e }) {
  const t = useT();
  if (!e) return null;
  const msg = e instanceof ApiError ? `${e.code || e.status}: ${e.message}` : String(e?.message || e);
  return /* @__PURE__ */ React.createElement(Alert, { color: "red", variant: "light", title: t("errors.genericTitle"), mt: "sm" }, msg);
}

// src/components/Shell.jsx
import { useEffect as useEffect3, useId, useState as useState3 } from "react";
import { Link, useLocation as useLocation2 } from "react-router-dom";
import { AppShell, Avatar, Box as Box2, Group as Group2, Modal, Text as Text2, Tooltip } from "@mantine/core";
import { useMediaQuery } from "@mantine/hooks";

// src/components/Net.jsx
var GROUP_PASTELS = [
  ["#dcefe6", "#b7d9c8"],
  ["#e3eef5", "#c2d6e6"],
  ["#efe8dc", "#ddd0bc"],
  ["#e7f0ea", "#c5d8ce"],
  ["#efe6e4", "#dfcbc7"],
  ["#e6ebe8", "#cdd6d1"],
  ["#e8edf2", "#c8d2dc"],
  ["#ebe8e2", "#d4cfc4"]
];
function pastelFor(name) {
  let h = 0;
  const s = String(name || "");
  for (let i = 0; i < s.length; i += 1) h = h * 31 + s.charCodeAt(i) >>> 0;
  const [from, to] = GROUP_PASTELS[h % GROUP_PASTELS.length];
  return { from, to };
}
function displayNameOf(members, userId) {
  const m = (members || []).find((x) => x.user_id === userId);
  return m?.display_name || userId.slice(0, 8);
}
function initialsOf(name) {
  if (!name) return "?";
  const parts = String(name).trim().split(/\s+/);
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}
var ACTIVITY_KIND_KEYS = ["join", "expense", "payment", "comment", "nudge"];
function ActivityKindThumb({ kind, className = "" }) {
  const t = useT();
  const key = String(kind || "other").toLowerCase();
  const known = ACTIVITY_KIND_KEYS.includes(key);
  const label = known ? t(`activity.kindShort.${key}`) : key.slice(0, 4).toUpperCase();
  const full = known ? t(`activity.kind.${key}`) : key;
  return /* @__PURE__ */ React.createElement(
    "span",
    {
      className: `activity-kind-thumb is-${key} ${className}`.trim(),
      "aria-label": full,
      title: full
    },
    /* @__PURE__ */ React.createElement("span", { className: "activity-kind-label" }, label)
  );
}

// src/components/BottomNav.jsx
import { Box, Group, Text } from "@mantine/core";
import { useLocation, useNavigate as useNavigate2 } from "react-router-dom";
var ACTIVE = "#0f6e56";
var IDLE = "#94a3b8";
function I({ children }) {
  return /* @__PURE__ */ React.createElement(
    "svg",
    {
      width: 22,
      height: 22,
      viewBox: "0 0 24 24",
      fill: "none",
      stroke: "currentColor",
      strokeWidth: 1.75,
      strokeLinecap: "round",
      strokeLinejoin: "round",
      "aria-hidden": true,
      style: { display: "block", flex: "none" }
    },
    children
  );
}
var HomeIcon = () => /* @__PURE__ */ React.createElement(I, null, /* @__PURE__ */ React.createElement("rect", { x: "3.5", y: "3.5", width: "7.2", height: "7.2", rx: "2.1" }), /* @__PURE__ */ React.createElement("rect", { x: "13.3", y: "3.5", width: "7.2", height: "7.2", rx: "2.1" }), /* @__PURE__ */ React.createElement("rect", { x: "3.5", y: "13.3", width: "7.2", height: "7.2", rx: "2.1" }), /* @__PURE__ */ React.createElement("rect", { x: "13.3", y: "13.3", width: "7.2", height: "7.2", rx: "2.1" }));
var GroupsIcon = () => /* @__PURE__ */ React.createElement(I, null, /* @__PURE__ */ React.createElement("rect", { x: "7", y: "3.6", width: "13.2", height: "13.2", rx: "3" }), /* @__PURE__ */ React.createElement("path", { d: "M5.2 8.4A2.8 2.8 0 0 0 3.6 11v7.2A3.2 3.2 0 0 0 6.8 21.4h7.4a2.8 2.8 0 0 0 2.6-1.8" }));
var ActivityIcon = () => /* @__PURE__ */ React.createElement(I, null, /* @__PURE__ */ React.createElement("circle", { cx: "12", cy: "12", r: "8" }), /* @__PURE__ */ React.createElement("path", { d: "M12 8.2V12l2.7 1.7" }), /* @__PURE__ */ React.createElement("circle", { cx: "12", cy: "12", r: "0.9", fill: "currentColor", stroke: "none" }));
var SettingsIcon = () => /* @__PURE__ */ React.createElement(I, null, /* @__PURE__ */ React.createElement("circle", { cx: "12", cy: "12", r: "3" }), /* @__PURE__ */ React.createElement("path", { d: "M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09a1.65 1.65 0 0 0-1-1.51 1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09a1.65 1.65 0 0 0 1.51-1 1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9c.26.6.9 1.02 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1Z" }));
function usePrimaryNav() {
  const nav = useNavigate2();
  const loc = useLocation();
  const t = useT();
  const path = loc.pathname;
  const active = path === "/activity" ? "activity" : path === "/settings" || path.startsWith("/settings/") ? "settings" : path === "/groups" || path.startsWith("/groups/") ? "groups" : path === "/" ? "home" : null;
  return [
    { id: "home", label: t("nav.dashboard"), short: t("nav.home"), icon: /* @__PURE__ */ React.createElement(HomeIcon, null), active: active === "home", onClick: () => nav("/") },
    { id: "groups", label: t("nav.groups"), short: t("nav.groups"), icon: /* @__PURE__ */ React.createElement(GroupsIcon, null), active: active === "groups", onClick: () => nav("/groups") },
    { id: "activity", label: t("nav.activity"), short: t("nav.activity"), icon: /* @__PURE__ */ React.createElement(ActivityIcon, null), active: active === "activity", onClick: () => nav("/activity") },
    { id: "settings", label: t("nav.settings"), short: t("nav.settings"), icon: /* @__PURE__ */ React.createElement(SettingsIcon, null), active: active === "settings", onClick: () => nav("/settings") }
  ];
}
function Tab({ label, icon, active, onClick }) {
  return /* @__PURE__ */ React.createElement(
    Box,
    {
      component: "button",
      type: "button",
      onClick,
      "aria-current": active ? "page" : void 0,
      "aria-label": label,
      style: {
        flex: 1,
        background: "none",
        border: 0,
        padding: "8px 0 6px",
        minHeight: 56,
        minWidth: 44,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: 2,
        color: active ? ACTIVE : IDLE,
        cursor: "pointer"
      }
    },
    icon,
    /* @__PURE__ */ React.createElement(Text, { component: "span", size: "xs", fw: active ? 700 : 500, style: { color: "inherit" } }, label)
  );
}
function BottomNav() {
  const items = usePrimaryNav();
  const t = useT();
  return /* @__PURE__ */ React.createElement(
    Box,
    {
      component: "nav",
      "aria-label": t("shell.primaryNav"),
      className: "bottom-nav no-print",
      pos: "fixed",
      bottom: 0,
      left: 0,
      right: 0,
      style: {
        zIndex: 100,
        paddingBottom: "env(safe-area-inset-bottom)"
      }
    },
    /* @__PURE__ */ React.createElement(Group, { gap: 0, grow: true, wrap: "nowrap" }, items.map((item) => /* @__PURE__ */ React.createElement(
      Tab,
      {
        key: item.id,
        label: item.short,
        icon: item.icon,
        active: item.active,
        onClick: item.onClick
      }
    )))
  );
}

// src/components/Shell.jsx
var COLLAPSE_KEY = "ss-nav-collapsed";
function BrandMark({ size = 22 }) {
  const maskId = `brand-socket-${useId().replace(/:/g, "")}`;
  const h = Math.round(size * 48 / 42);
  return /* @__PURE__ */ React.createElement("svg", { className: "brand-mark", viewBox: "0 0 42 48", width: size, height: h, "aria-hidden": true }, /* @__PURE__ */ React.createElement("defs", null, /* @__PURE__ */ React.createElement("mask", { id: maskId }, /* @__PURE__ */ React.createElement("rect", { width: "42", height: "48", fill: "#fff" }), /* @__PURE__ */ React.createElement("circle", { cx: "22", cy: "24", r: "7.5", fill: "#000" }))), /* @__PURE__ */ React.createElement("rect", { className: "piece-a", x: "2", y: "8", width: "16", height: "32", rx: "8" }), /* @__PURE__ */ React.createElement("circle", { className: "piece-a", cx: "20", cy: "24", r: "7.5" }), /* @__PURE__ */ React.createElement("rect", { className: "piece-b", x: "22", y: "8", width: "16", height: "32", rx: "8", mask: `url(#${maskId})` }));
}
function CollapseIcon() {
  return /* @__PURE__ */ React.createElement("svg", { className: "collapse-chevron", width: 18, height: 18, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 1.8, strokeLinecap: "round", strokeLinejoin: "round", "aria-hidden": true }, /* @__PURE__ */ React.createElement("path", { d: "M15 6l-6 6 6 6" }));
}
function SunIcon() {
  return /* @__PURE__ */ React.createElement("svg", { width: 18, height: 18, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 1.8, strokeLinecap: "round", strokeLinejoin: "round", "aria-hidden": true }, /* @__PURE__ */ React.createElement("circle", { cx: "12", cy: "12", r: "4" }), /* @__PURE__ */ React.createElement("path", { d: "M12 2.5v2.2M12 19.3v2.2M4.5 12H2.3M21.7 12h-2.2M5.6 5.6l1.6 1.6M16.8 16.8l1.6 1.6M16.8 7.2l1.6-1.6M5.6 18.4l1.6-1.6" }));
}
function MoonIcon() {
  return /* @__PURE__ */ React.createElement("svg", { width: 18, height: 18, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 1.8, strokeLinecap: "round", strokeLinejoin: "round", "aria-hidden": true }, /* @__PURE__ */ React.createElement("path", { d: "M20.2 13.4A8.2 8.2 0 0 1 10.6 3.8 8.4 8.4 0 1 0 20.2 13.4Z" }));
}
function CheckIcon() {
  return /* @__PURE__ */ React.createElement("svg", { width: 16, height: 16, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 2.2, strokeLinecap: "round", strokeLinejoin: "round", "aria-hidden": true }, /* @__PURE__ */ React.createElement("path", { d: "M5 12.5l4.2 4.2L19 7" }));
}
function Shell({ children }) {
  const { user } = useAuth();
  const { theme, toggleTheme, locale, setLocale, localeMeta, t } = usePrefs();
  const onProfile = useLocation2().pathname === "/profile";
  const items = usePrimaryNav();
  const isDesktop = useMediaQuery("(min-width: 48em)");
  const [collapsed, setCollapsed] = useState3(() => localStorage.getItem(COLLAPSE_KEY) === "1");
  const [langOpen, setLangOpen] = useState3(false);
  useEffect3(() => {
    localStorage.setItem(COLLAPSE_KEY, collapsed ? "1" : "0");
  }, [collapsed]);
  const avatarPastel = pastelFor(user?.display_name || user?.username || "?");
  const themeLabel = theme === "dark" ? t("shell.themeToLight") : t("shell.themeToDark");
  const langLabel = t("shell.language");
  const pickLocale = (next) => {
    setLocale(next);
    setLangOpen(false);
  };
  return /* @__PURE__ */ React.createElement(
    AppShell,
    {
      className: collapsed ? "shell-collapsed" : "shell-expanded",
      layout: "alt",
      transitionDuration: 340,
      transitionTimingFunction: "cubic-bezier(0.22, 1, 0.36, 1)",
      header: { height: 62, collapsed: !!isDesktop },
      navbar: {
        width: collapsed ? 104 : 292,
        breakpoint: "sm",
        collapsed: { mobile: true }
      },
      padding: { base: 12, sm: 18 }
    },
    /* @__PURE__ */ React.createElement(AppShell.Header, { className: "mobile-header" }, /* @__PURE__ */ React.createElement(Group2, { h: "100%", px: "md", justify: "space-between", wrap: "nowrap", className: "mobile-header-inner" }, /* @__PURE__ */ React.createElement(Link, { to: "/", className: "brand-logo is-light mobile-brand", "aria-label": t("shell.brand") }, /* @__PURE__ */ React.createElement(BrandMark, { size: 26 }), /* @__PURE__ */ React.createElement("span", { className: "brand-word" }, t("shell.brand"))), /* @__PURE__ */ React.createElement(Group2, { gap: 8, wrap: "nowrap" }, /* @__PURE__ */ React.createElement(
      "button",
      {
        type: "button",
        className: "mobile-pref-btn",
        "aria-label": themeLabel,
        title: themeLabel,
        onClick: toggleTheme
      },
      theme === "dark" ? /* @__PURE__ */ React.createElement(SunIcon, null) : /* @__PURE__ */ React.createElement(MoonIcon, null)
    ), /* @__PURE__ */ React.createElement(
      "button",
      {
        type: "button",
        className: "mobile-pref-btn is-lang",
        "aria-label": langLabel,
        title: langLabel,
        "aria-haspopup": "dialog",
        onClick: () => setLangOpen(true)
      },
      /* @__PURE__ */ React.createElement("span", { className: "lang-code" }, localeMeta.code)
    ), /* @__PURE__ */ React.createElement(
      Link,
      {
        to: "/profile",
        className: `mobile-avatar${onProfile ? " is-active" : ""}`,
        "aria-label": user ? t("shell.accountNamed", { name: user.display_name }) : t("shell.account"),
        "aria-current": onProfile ? "page" : void 0,
        style: { "--av-from": avatarPastel.from, "--av-to": avatarPastel.to }
      },
      /* @__PURE__ */ React.createElement("span", { className: "mobile-avatar-ring" }, /* @__PURE__ */ React.createElement("span", { className: "mobile-avatar-face" }, user ? initialsOf(user.display_name) : "?"))
    )))),
    /* @__PURE__ */ React.createElement(AppShell.Navbar, null, /* @__PURE__ */ React.createElement(Box2, { component: "nav", className: "sidebar-card", "aria-label": t("shell.primaryNav") }, /* @__PURE__ */ React.createElement(Group2, { className: "sidebar-brand", wrap: "nowrap", gap: 0 }, /* @__PURE__ */ React.createElement(Link, { to: "/", className: "brand-logo", "aria-label": t("shell.brand") }, /* @__PURE__ */ React.createElement(BrandMark, null), /* @__PURE__ */ React.createElement("span", { className: "brand-word" }, t("shell.brand"))), /* @__PURE__ */ React.createElement(
      "button",
      {
        type: "button",
        className: "sidebar-collapse",
        "aria-label": collapsed ? t("shell.expandSidebar") : t("shell.collapseSidebar"),
        "aria-expanded": !collapsed,
        onClick: () => setCollapsed((v) => !v)
      },
      /* @__PURE__ */ React.createElement(CollapseIcon, null)
    )), /* @__PURE__ */ React.createElement(Box2, { className: "sidebar-links" }, items.map((item) => /* @__PURE__ */ React.createElement(Tooltip, { key: item.id, label: item.label, position: "right", disabled: !collapsed, openDelay: 300 }, /* @__PURE__ */ React.createElement(
      "button",
      {
        type: "button",
        className: "side-link",
        "aria-current": item.active ? "page" : void 0,
        "aria-label": item.label,
        onClick: item.onClick
      },
      /* @__PURE__ */ React.createElement("span", { className: "side-icon" }, item.icon),
      /* @__PURE__ */ React.createElement("span", { className: "side-label" }, item.label)
    )))), /* @__PURE__ */ React.createElement(Box2, { className: "sidebar-user" }, /* @__PURE__ */ React.createElement("div", { className: "sidebar-utils" }, /* @__PURE__ */ React.createElement(Tooltip, { label: themeLabel, position: "right", disabled: !collapsed, openDelay: 300 }, /* @__PURE__ */ React.createElement(
      "button",
      {
        type: "button",
        className: "sidebar-util-btn",
        "aria-label": themeLabel,
        onClick: toggleTheme
      },
      /* @__PURE__ */ React.createElement("span", { className: "sidebar-util-icon" }, theme === "dark" ? /* @__PURE__ */ React.createElement(SunIcon, null) : /* @__PURE__ */ React.createElement(MoonIcon, null)),
      /* @__PURE__ */ React.createElement("span", { className: "sidebar-util-label" }, theme === "dark" ? t("shell.themeLight") : t("shell.themeDark"))
    )), /* @__PURE__ */ React.createElement(Tooltip, { label: langLabel, position: "right", disabled: !collapsed, openDelay: 300 }, /* @__PURE__ */ React.createElement(
      "button",
      {
        type: "button",
        className: "sidebar-util-btn",
        "aria-label": langLabel,
        "aria-haspopup": "dialog",
        onClick: () => setLangOpen(true)
      },
      /* @__PURE__ */ React.createElement("span", { className: "sidebar-util-icon is-lang", "aria-hidden": true }, /* @__PURE__ */ React.createElement("span", { className: "lang-code" }, localeMeta.code)),
      /* @__PURE__ */ React.createElement("span", { className: "sidebar-util-label" }, localeMeta.native)
    ))), user && /* @__PURE__ */ React.createElement(
      Group2,
      {
        gap: 10,
        wrap: "nowrap",
        component: Link,
        to: "/profile",
        className: "sidebar-account",
        "aria-current": onProfile ? "page" : void 0,
        "aria-label": user.display_name
      },
      /* @__PURE__ */ React.createElement(Avatar, { className: "sidebar-avatar", color: "teal", radius: "xl" }, initialsOf(user.display_name)),
      /* @__PURE__ */ React.createElement(Box2, { className: "sidebar-account-copy", "aria-hidden": collapsed }, /* @__PURE__ */ React.createElement(Text2, { size: "sm", fw: 700, truncate: true }, user.display_name), /* @__PURE__ */ React.createElement(Text2, { className: user.email_verified ? "sidebar-verify is-ok" : "sidebar-verify", size: "xs", truncate: true }, user.email_verified ? t("shell.emailVerified") : t("shell.emailNotVerified")))
    )))),
    /* @__PURE__ */ React.createElement(AppShell.Main, null, /* @__PURE__ */ React.createElement(Box2, { className: "app-stage" }, /* @__PURE__ */ React.createElement(Box2, { className: "app-stage-scroll" }, children, /* @__PURE__ */ React.createElement(Box2, { className: "mobile-spacer no-print", h: 76, "aria-hidden": true })))),
    /* @__PURE__ */ React.createElement(BottomNav, null),
    /* @__PURE__ */ React.createElement(
      Modal,
      {
        opened: langOpen,
        onClose: () => setLangOpen(false),
        title: t("shell.chooseLanguage"),
        centered: true,
        size: "xs",
        radius: "lg",
        classNames: { content: "lang-modal", header: "lang-modal-header", title: "lang-modal-title", body: "lang-modal-body" }
      },
      /* @__PURE__ */ React.createElement("div", { className: "lang-options", role: "listbox", "aria-label": t("shell.language") }, LOCALES.map((code) => {
        const meta = LOCALE_META[code];
        const active = locale === code;
        return /* @__PURE__ */ React.createElement(
          "button",
          {
            key: code,
            type: "button",
            role: "option",
            "aria-selected": active,
            className: `lang-option${active ? " is-active" : ""}`,
            onClick: () => pickLocale(code)
          },
          /* @__PURE__ */ React.createElement("span", { className: "lang-code" }, meta.code),
          /* @__PURE__ */ React.createElement("span", { className: "lang-option-copy" }, /* @__PURE__ */ React.createElement("span", { className: "lang-option-native" }, meta.native), /* @__PURE__ */ React.createElement("span", { className: "lang-option-label" }, meta.label)),
          active ? /* @__PURE__ */ React.createElement("span", { className: "lang-option-check" }, /* @__PURE__ */ React.createElement(CheckIcon, null)) : null
        );
      }))
    )
  );
}

// src/components/Mobile.jsx
import { Box as Box3, Card, Group as Group3, Menu, Stack, Table, Text as Text3, ActionIcon } from "@mantine/core";
function RowMenu({ label, children }) {
  return /* @__PURE__ */ React.createElement(Menu, { position: "bottom-end", withinPortal: false }, /* @__PURE__ */ React.createElement(Menu.Target, null, /* @__PURE__ */ React.createElement(ActionIcon, { variant: "subtle", title: label, "aria-label": label }, "\u22EF")), /* @__PURE__ */ React.createElement(Menu.Dropdown, null, children));
}

// src/components/Forms.jsx
import { useEffect as useEffect4, useRef, useState as useState4 } from "react";
import {
  Alert as Alert2,
  Button,
  Checkbox,
  Group as Group4,
  Modal as Modal2,
  Select,
  Stack as Stack2,
  Text as Text4,
  TextInput
} from "@mantine/core";
import { notifications } from "@mantine/notifications";

// src/categories.js
function categoryLabel(cat, t) {
  if (!cat) return "";
  if (cat.is_default) {
    const k = `forms.expense.cat.${cat.key}`;
    const tr = t(k);
    if (tr !== k) return tr;
  }
  return cat.name || cat.key;
}
function categoryLabelForKey(key, categories, t) {
  if (!key) return "";
  const hit = (categories || []).find((c) => c.key === key);
  if (hit) return categoryLabel(hit, t);
  const k = `forms.expense.cat.${key}`;
  const tr = t(k);
  return tr !== k ? tr : key;
}
function categorySelectData(categories, t) {
  return (categories || []).map((c) => ({
    value: c.key,
    label: categoryLabel(c, t)
  }));
}

// src/components/Forms.jsx
var splitVal = (s, type) => {
  if (!s) return "";
  if (type === "EXACT" && s.exact_cents != null) return (s.exact_cents / 100).toString();
  if (type === "PERCENT" && s.percent != null) return s.percent.toString();
  if (type === "SHARES" && s.shares != null) return s.shares.toString();
  return "";
};
var shortName = (name) => {
  if (!name || name.length <= 28) return name || "";
  const dot = name.lastIndexOf(".");
  const ext = dot > 0 ? name.slice(dot) : "";
  const base = dot > 0 ? name.slice(0, dot) : name;
  const keep = Math.max(0, 26 - ext.length);
  return `${base.slice(0, Math.min(18, keep))}\u2026${base.slice(-Math.max(0, keep - 18))}${ext}`;
};
var equalPercent = (n) => {
  const base = Math.floor(1e4 / n);
  const out = Array(n).fill(base);
  for (let i = 0; i < 1e4 - base * n; i++) out[i] += 1;
  return out.map((c) => (c / 100).toString());
};
var MAX_MONEY_AMOUNT = 1e6;
function sanitizeMoneyInput(raw) {
  let s = String(raw ?? "").replace(/[^\d.]/g, "");
  const dot = s.indexOf(".");
  if (dot !== -1) {
    s = `${s.slice(0, dot + 1)}${s.slice(dot + 1).replace(/\./g, "")}`;
    const [whole, dec = ""] = s.split(".");
    s = `${whole.slice(0, 7)}.${dec.slice(0, 2)}`;
  } else {
    s = s.slice(0, 7);
  }
  if (s.startsWith(".")) s = `0${s}`;
  return s;
}
function isValidMoneyAmount(raw) {
  if (!raw || !/^\d+(\.\d{1,2})?$/.test(raw)) return false;
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 && n <= MAX_MONEY_AMOUNT;
}
function moneyAmountError(raw, t) {
  if (!raw) return null;
  if (!/^\d+(\.\d{1,2})?$/.test(raw)) return t("forms.payment.invalidAmount");
  const n = Number(raw);
  if (!Number.isFinite(n) || n <= 0) return t("forms.payment.invalidAmount");
  if (n > MAX_MONEY_AMOUNT) return t("forms.payment.amountMax", { max: "1,000,000" });
  return null;
}
function ExpenseForm({ groupId, members, existing, copyFrom, onDone, currency = "" }) {
  const t = useT();
  const source = existing ?? copyFrom ?? null;
  const isCopy = !!copyFrom && !existing;
  const activeIds = new Set(members.map((m) => m.user_id));
  const initSel = () => {
    if (existing) return existing.splits.map((s) => s.user_id);
    if (copyFrom) {
      const kept = copyFrom.splits.map((s) => s.user_id).filter((id) => activeIds.has(id));
      return kept.length > 0 ? kept : members.map((m) => m.user_id);
    }
    return members.map((m) => m.user_id);
  };
  const initValues = (type2, sel2) => {
    const out = {};
    if (type2 === "SHARES") {
      for (const id of sel2) out[id] = "1";
    }
    if (!source || !source.splits) return out;
    for (const s of source.splits) {
      if (!sel2.includes(s.user_id)) continue;
      const v = splitVal(s, type2);
      if (v !== "") out[s.user_id] = v;
      else if (type2 === "SHARES" && !(s.user_id in out)) out[s.user_id] = "1";
    }
    return out;
  };
  const [title, setTitle] = useState4(
    existing?.title ?? (copyFrom ? t("forms.expense.copyOf", { title: copyFrom.title }) : "")
  );
  const [amount, setAmount] = useState4(
    source ? (source.amount_cents / 100).toFixed(2) : ""
  );
  const [amountErr, setAmountErr] = useState4(null);
  const [payer, setPayer] = useState4(() => {
    const p = source?.payer_id;
    if (p && activeIds.has(p)) return p;
    return members[0]?.user_id || "";
  });
  const [type, setType] = useState4(source?.split_type || "EQUAL");
  const [sel, setSel] = useState4(initSel);
  const [values, setValues] = useState4(() => initValues(source?.split_type || "EQUAL", initSel()));
  const [stashed, setStashed] = useState4({});
  const [preview, setPreview] = useState4(null);
  const [confirm, setConfirm] = useState4(null);
  const [pending, setPending] = useState4(null);
  const [saving, setSaving] = useState4(false);
  const [imgErrs, setImgErrs] = useState4([]);
  const [e, setE] = useState4(null);
  const todayStr = () => (/* @__PURE__ */ new Date()).toISOString().slice(0, 10);
  const [categories, setCategories] = useState4([]);
  const [category, setCategory] = useState4(source?.category || "food");
  const [newCatName, setNewCatName] = useState4("");
  const [addingCat, setAddingCat] = useState4(false);
  const [catModalOpen, setCatModalOpen] = useState4(false);
  const [catModalErr, setCatModalErr] = useState4(null);
  const [spentAt, setSpentAt] = useState4(() => source?.spent_at ? String(source.spent_at).slice(0, 10) : todayStr());
  const [tax, setTax] = useState4(source?.tax_cents ? (source.tax_cents / 100).toFixed(2) : "");
  const [tip, setTip] = useState4(source?.tip_cents ? (source.tip_cents / 100).toFixed(2) : "");
  const [fee, setFee] = useState4(source?.fee_cents ? (source.fee_cents / 100).toFixed(2) : "");
  const [origCur, setOrigCur] = useState4(source?.orig_currency || "");
  const [origAmt, setOrigAmt] = useState4(source?.orig_amount_cents ? (source.orig_amount_cents / 100).toFixed(2) : "");
  const [fxRate, setFxRate] = useState4(source?.fx_rate != null ? String(source.fx_rate) : "");
  const [guests, setGuests] = useState4(() => (source?.guests || []).map((g) => ({
    label: g.label,
    amount: (g.share_cents / 100).toFixed(2),
    covered_by: g.covered_by
  })));
  const [onlyPresent, setOnlyPresent] = useState4(false);
  const dropped = copyFrom ? copyFrom.splits.map((s) => s.user_id).filter((id) => !activeIds.has(id)) : [];
  const changeType = (nextType) => {
    setType(nextType);
    if (nextType === "EQUAL") return;
    setValues((prev) => {
      const checked = sel.filter((id) => !(id in prev) || prev[id] === "");
      if (checked.length === 0) return prev;
      const next = { ...prev };
      if (nextType === "PERCENT") {
        const all = sel.filter((id) => !(id in next) || next[id] === "");
        const dist = equalPercent(sel.length);
        sel.forEach((id, i) => {
          if (all.includes(id)) next[id] = dist[i];
        });
      } else if (nextType === "SHARES") {
        checked.forEach((id) => {
          next[id] = "1";
        });
      }
      return next;
    });
  };
  const toggle = (id) => {
    if (sel.includes(id)) {
      setSel(sel.filter((x) => x !== id));
      setStashed({ ...stashed, ...id in values ? { [id]: values[id] } : {} });
      setValues((prev) => {
        const n = { ...prev };
        delete n[id];
        return n;
      });
    } else {
      setSel([...sel, id]);
      if (id in stashed) {
        setValues((prev) => ({ ...prev, [id]: stashed[id] }));
      } else if (type === "SHARES") {
        setValues((prev) => ({ ...prev, [id]: prev[id] ?? "1" }));
      }
    }
  };
  const setVal = (id, v) => setValues((prev) => ({ ...prev, [id]: v }));
  const build = () => {
    const body = {
      title,
      amount: Number(amount),
      payer_id: payer,
      split_type: type,
      participant_ids: sel,
      category,
      spent_at: spentAt ? (/* @__PURE__ */ new Date(`${spentAt}T12:00:00Z`)).toISOString() : null,
      only_present: onlyPresent
    };
    if (tax !== "") body.tax = Number(tax);
    if (tip !== "") body.tip = Number(tip);
    if (fee !== "") body.fee = Number(fee);
    if (origCur.trim() !== "") {
      body.orig_currency = origCur.trim().toUpperCase();
      body.orig_amount = Number(origAmt);
      body.fx_rate = Number(fxRate);
    }
    if (guests.length > 0) {
      body.guests = guests.map((g) => ({
        label: g.label,
        amount_cents: Math.round(Number(g.amount || 0) * 100),
        covered_by: g.covered_by
      }));
    }
    if (type === "EXACT") {
      body.exact = sel.map((id) => ({ user_id: id, amount_cents: Math.round(Number(values[id] || 0) * 100) }));
    }
    if (type === "PERCENT") {
      body.percent = sel.map((id) => ({ user_id: id, percent: Number(values[id] || 0) }));
    }
    if (type === "SHARES") {
      body.shares = sel.map((id) => ({
        user_id: id,
        shares: values[id] === "" || values[id] == null ? 1 : Math.max(1, Math.round(Number(values[id] || 1)))
      }));
    }
    return body;
  };
  const totals = (() => {
    if (type === "EQUAL" || sel.length === 0) return null;
    const nums = sel.map((id) => Number(values[id] || 0));
    if (nums.some((n) => Number.isNaN(n))) return null;
    if (type === "EXACT") {
      const sum = nums.reduce((a, b) => a + b, 0);
      return {
        text: t("forms.expense.totalsExact", { sum: sum.toFixed(2), total: Number(amount || 0).toFixed(2) }),
        ok: Math.abs(sum - Number(amount || 0)) < 5e-3
      };
    }
    if (type === "PERCENT") {
      const sum = nums.reduce((a, b) => a + b, 0);
      return { text: t("forms.expense.totalsPercent", { sum }), ok: Math.abs(sum - 100) < 1e-9 };
    }
    return { text: t("forms.expense.totalsShares", { sum: nums.reduce((a, b) => a + b, 0) }), ok: true };
  })();
  useEffect4(() => {
    let cancelled = false;
    (async () => {
      try {
        const rows = await api.get(`/api/v1/groups/${groupId}/categories`);
        if (cancelled) return;
        const list = Array.isArray(rows) ? rows : [];
        setCategories(list);
        setCategory((prev) => {
          if (list.some((c) => c.key === prev)) return prev;
          if (source?.category && list.some((c) => c.key === source.category)) return source.category;
          return list.find((c) => c.key === "food")?.key || list.find((c) => c.key === "other")?.key || list[0]?.key || prev;
        });
      } catch (err) {
        if (!cancelled) setE(err);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [groupId]);
  const openAddCategory = () => {
    setNewCatName("");
    setCatModalErr(null);
    setCatModalOpen(true);
  };
  const addCategoryFromModal = async () => {
    const name = newCatName.trim();
    if (!name) return;
    setAddingCat(true);
    setCatModalErr(null);
    try {
      const created = await api.post(`/api/v1/groups/${groupId}/categories`, { name });
      setCategories((prev) => [...prev, created]);
      setCategory(created.key);
      setNewCatName("");
      setCatModalOpen(false);
      notifications.show({ message: t("groupDetail.categoryAdded"), color: "teal" });
    } catch (err) {
      setCatModalErr(err);
    } finally {
      setAddingCat(false);
    }
  };
  useEffect4(() => {
    if (!amount || sel.length === 0) {
      setPreview(null);
      return;
    }
    const timer = setTimeout(async () => {
      try {
        const b = build();
        const url = existing ? `/api/v1/expenses/${existing.expense_id}/preview-edit` : `/api/v1/groups/${groupId}/expenses/preview-split`;
        setPreview(await api.post(url, b));
        setE(null);
      } catch (err) {
        setPreview(null);
        setE(err);
      }
    }, 350);
    return () => clearTimeout(timer);
  }, [
    amount,
    type,
    payer,
    category,
    spentAt,
    tax,
    tip,
    fee,
    origCur,
    origAmt,
    fxRate,
    JSON.stringify(guests),
    onlyPresent,
    sel.join(","),
    Object.values(values).join("|")
  ]);
  const [staged, setStaged] = useState4([]);
  const fileRef = useRef(null);
  const RECEIPT_ACCEPT = "image/jpeg,image/png,image/webp,image/heic,image/heif,.jpg,.jpeg,.png,.webp,.heic,.heif";
  const maxStaged = 5;
  const onPickFiles = (ev) => {
    const picked = Array.from(ev.target.files || []);
    ev.target.value = "";
    if (picked.length === 0) return;
    const ok = [];
    for (const f of picked) {
      if (f.size > 10 * 1024 * 1024) {
        setE({ message: t("forms.expense.over10mb", { name: f.name }) });
        continue;
      }
      ok.push(f);
    }
    setStaged((prev) => [...prev, ...ok].slice(0, Math.max(0, maxStaged)));
  };
  const uploadStaged = async (newExpenseId) => {
    const failures = [];
    for (const file of staged) {
      try {
        const form = new FormData();
        form.append("file", file, file.name);
        await api.postForm(`/api/v1/expenses/${newExpenseId}/images`, form);
      } catch (err) {
        failures.push(`${file.name}: ${err.message}`);
      }
    }
    return failures;
  };
  const onAmountChange = (raw) => {
    const next = sanitizeMoneyInput(raw);
    setAmount(next);
    setAmountErr(moneyAmountError(next, t));
  };
  const submit = async (ev) => {
    ev.preventDefault();
    if (saving) return;
    const amtErr = moneyAmountError(amount, t) || (!amount ? t("forms.payment.invalidAmount") : null);
    if (amtErr || !isValidMoneyAmount(amount)) {
      setAmountErr(amtErr || t("forms.payment.invalidAmount"));
      return;
    }
    setE(null);
    setImgErrs([]);
    setSaving(true);
    try {
      if (!existing) {
        const r = await api.post(`/api/v1/groups/${groupId}/expenses`, build());
        const newId = r.expense?.expense_id;
        if (newId && staged.length > 0) {
          const failures = await uploadStaged(newId);
          if (failures.length > 0) {
            setImgErrs(failures);
            notifications.show({ title: t("forms.expense.savedSomeFailed"), message: failures.join("; "), color: "orange" });
          } else {
            notifications.show({ title: t("forms.expense.savedWithReceipts"), color: "teal" });
          }
        }
        onDone(r);
      } else {
        const r = await api.patch(
          `/api/v1/expenses/${existing.expense_id}`,
          { expected_version: existing.version, ...build() }
        );
        onDone(r);
      }
    } catch (err) {
      setE(err);
    } finally {
      setSaving(false);
    }
  };
  const submitEdit = async (ev) => {
    ev.preventDefault();
    const names = preview?.unsettled_user_ids || [];
    if (names.length > 0 && !pending) {
      const resolved = names.map((id) => {
        const share = preview.shares?.[id] != null ? ` \u2192 ${(preview.shares[id] / 100).toFixed(2)}` : "";
        return `${displayNameOf(members, id)} ($0.00${share})`;
      });
      setPending(true);
      setConfirm(resolved);
      return;
    }
    setConfirm(null);
    setPending(null);
    await submit(ev);
  };
  const boxLabel = type === "EXACT" ? t("forms.expense.exactBox") : type === "PERCENT" ? t("forms.expense.percentBox") : t("forms.expense.sharesBox");
  const receiptCount = existing ? source?.images?.length || 0 : staged.length;
  const equalNote = (() => {
    if (type !== "EQUAL" || !preview?.shares) return null;
    const entries = Object.entries(preview.shares);
    if (entries.length === 0) return null;
    const vals = entries.map(([, v]) => v);
    const lo = Math.min(...vals);
    const hi = Math.max(...vals);
    const base = fmt(lo, currency);
    if (hi === lo) {
      return t("forms.expense.equalNoteOk", { base, count: entries.length });
    }
    const lucky = entries.filter(([, v]) => v === hi).map(([id]) => displayNameOf(members, id)).join(", ");
    return t("forms.expense.equalNoteLucky", { base, count: entries.length, lucky });
  })();
  const splitTypes = [
    { value: "EQUAL", label: t("forms.expense.equal") },
    { value: "EXACT", label: t("forms.expense.exact") },
    { value: "PERCENT", label: t("forms.expense.percent") },
    { value: "SHARES", label: t("forms.expense.shares") }
  ];
  const catData = categorySelectData(categories, t);
  const saveActionLabel = isCopy ? t("forms.expense.saveCopy") : t("forms.expense.addExpense");
  return /* @__PURE__ */ React.createElement(React.Fragment, null, /* @__PURE__ */ React.createElement("form", { className: "wizard-form", onSubmit: existing ? submitEdit : submit }, isCopy && dropped.length > 0 && /* @__PURE__ */ React.createElement(Alert2, { color: "yellow", variant: "light", title: t("forms.expense.formerExcluded") }, /* @__PURE__ */ React.createElement(Text4, { size: "sm" }, dropped.map((id) => id.slice(0, 8)).join(", "))), /* @__PURE__ */ React.createElement("div", { className: "wizard-fields" }, /* @__PURE__ */ React.createElement("div", { className: "wizard-person wizard-pay-hint" }, /* @__PURE__ */ React.createElement(Group4, { gap: "xs", wrap: "nowrap", style: { minWidth: 0 } }, receiptCount > 0 ? Array.from({ length: Math.min(receiptCount, 3) }).map((_, i) => /* @__PURE__ */ React.createElement("span", { key: i, className: "wizard-receipt-thumb", "aria-hidden": true }, "\u{1F9FE}")) : /* @__PURE__ */ React.createElement("span", { className: "wizard-receipt-slot", "aria-hidden": true }, "\uFF0B"), /* @__PURE__ */ React.createElement("div", { style: { minWidth: 0, flex: 1 } }, /* @__PURE__ */ React.createElement(Text4, { size: "sm", fw: 600 }, t("forms.expense.receiptsCount", { count: receiptCount })), /* @__PURE__ */ React.createElement(Text4, { size: "xs", c: "dimmed" }, existing ? t("forms.expense.receiptsManage") : t("forms.expense.receiptsHint"))), !existing && /* @__PURE__ */ React.createElement(React.Fragment, null, /* @__PURE__ */ React.createElement(
    "input",
    {
      ref: fileRef,
      type: "file",
      accept: RECEIPT_ACCEPT,
      multiple: true,
      style: { display: "none" },
      onChange: onPickFiles
    }
  ), /* @__PURE__ */ React.createElement(
    Button,
    {
      size: "xs",
      variant: "light",
      style: { flex: "none" },
      disabled: maxStaged <= 0 || staged.length >= maxStaged,
      onClick: () => fileRef.current?.click()
    },
    maxStaged <= 0 || staged.length >= maxStaged ? t("forms.expense.addReceiptFull") : t("forms.expense.addReceipt")
  ))), !existing && staged.length > 0 && /* @__PURE__ */ React.createElement(Stack2, { gap: 4 }, staged.map((f, i) => /* @__PURE__ */ React.createElement(Group4, { key: `${f.name}-${f.size}-${i}`, gap: "xs", wrap: "nowrap", style: { minWidth: 0 } }, /* @__PURE__ */ React.createElement(Text4, { size: "xs", style: { flex: 1, minWidth: 0 }, truncate: true, title: f.name }, "\u{1F9FE} ", shortName(f.name)), /* @__PURE__ */ React.createElement(Text4, { size: "xs", c: "dimmed", style: { flex: "none" } }, (f.size / 1024).toFixed(0), "KB"), /* @__PURE__ */ React.createElement(Button, { size: "xs", variant: "subtle", color: "red", style: { flex: "none" }, onClick: () => setStaged(staged.filter((_, j) => j !== i)) }, "X"))), /* @__PURE__ */ React.createElement(Text4, { size: "xs", c: "dimmed" }, t("forms.expense.uploadsOnSave", { action: saveActionLabel })))), /* @__PURE__ */ React.createElement(
    TextInput,
    {
      label: t("forms.expense.title"),
      required: true,
      placeholder: t("forms.expense.titlePh"),
      value: title,
      onChange: (x) => setTitle(x.target.value)
    }
  ), /* @__PURE__ */ React.createElement(
    TextInput,
    {
      label: t("forms.expense.amount"),
      required: true,
      inputMode: "decimal",
      placeholder: "0.00",
      value: amount,
      error: amountErr,
      onChange: (x) => onAmountChange(x.target.value),
      onBlur: () => {
        if (amount) setAmountErr(moneyAmountError(amount, t));
      }
    }
  ), /* @__PURE__ */ React.createElement("div", { className: "wizard-field" }, /* @__PURE__ */ React.createElement("span", { className: "wizard-label" }, t("forms.expense.category")), /* @__PURE__ */ React.createElement(Group4, { gap: "xs", align: "flex-end", wrap: "nowrap" }, /* @__PURE__ */ React.createElement(
    Select,
    {
      style: { flex: 1 },
      value: category || null,
      onChange: (v) => setCategory(v || ""),
      data: catData,
      searchable: true,
      comboboxProps: { withinPortal: true },
      "aria-label": t("forms.expense.category")
    }
  ), /* @__PURE__ */ React.createElement(
    Button,
    {
      type: "button",
      variant: "light",
      color: "teal",
      className: "wizard-cat-add",
      onClick: openAddCategory
    },
    t("forms.expense.addCategoryBtn")
  ))), /* @__PURE__ */ React.createElement(
    TextInput,
    {
      label: t("forms.expense.spentOn"),
      type: "date",
      value: spentAt,
      onChange: (x) => setSpentAt(x.target.value)
    }
  ), /* @__PURE__ */ React.createElement(
    Select,
    {
      label: t("forms.expense.payer"),
      value: payer || null,
      onChange: (v) => setPayer(v || ""),
      data: members.map((m) => ({ value: m.user_id, label: m.display_name })),
      comboboxProps: { withinPortal: true }
    }
  ), /* @__PURE__ */ React.createElement("details", { className: "wizard-optional" }, /* @__PURE__ */ React.createElement("summary", null, t("forms.expense.billDetails")), /* @__PURE__ */ React.createElement("div", { className: "wizard-optional-body" }, /* @__PURE__ */ React.createElement(Group4, { gap: "xs", grow: true }, /* @__PURE__ */ React.createElement(TextInput, { label: t("forms.expense.taxOpt"), inputMode: "decimal", placeholder: "0.00", value: tax, onChange: (x) => setTax(x.target.value) }), /* @__PURE__ */ React.createElement(TextInput, { label: t("forms.expense.tipOpt"), inputMode: "decimal", placeholder: "0.00", value: tip, onChange: (x) => setTip(x.target.value) }), /* @__PURE__ */ React.createElement(TextInput, { label: t("forms.expense.feeOpt"), inputMode: "decimal", placeholder: "0.00", value: fee, onChange: (x) => setFee(x.target.value) })), /* @__PURE__ */ React.createElement("div", { className: "wizard-field" }, /* @__PURE__ */ React.createElement("span", { className: "wizard-label" }, t("forms.expense.foreign")), /* @__PURE__ */ React.createElement(Group4, { gap: "xs", grow: true }, /* @__PURE__ */ React.createElement(TextInput, { placeholder: "JPY", value: origCur, onChange: (x) => setOrigCur(x.target.value) }), /* @__PURE__ */ React.createElement(TextInput, { placeholder: t("forms.expense.fxAmount"), inputMode: "decimal", value: origAmt, onChange: (x) => setOrigAmt(x.target.value) }), /* @__PURE__ */ React.createElement(TextInput, { placeholder: t("forms.expense.fxRate"), inputMode: "decimal", value: fxRate, onChange: (x) => setFxRate(x.target.value) })), origCur.trim() !== "" && origAmt !== "" && fxRate !== "" && !Number.isNaN(Number(origAmt) * Number(fxRate)) && /* @__PURE__ */ React.createElement(Text4, { size: "xs", c: "dimmed", mt: 6 }, t("forms.expense.fxApprox", { amount: (Number(origAmt) * Number(fxRate)).toFixed(2) }))), /* @__PURE__ */ React.createElement("div", { className: "wizard-field" }, /* @__PURE__ */ React.createElement(Group4, { justify: "space-between", mb: 6 }, /* @__PURE__ */ React.createElement("span", { className: "wizard-label", style: { marginBottom: 0 } }, t("forms.expense.guestShares")), /* @__PURE__ */ React.createElement(
    "button",
    {
      type: "button",
      className: "wizard-chip",
      onClick: () => setGuests([...guests, { label: "", amount: "", covered_by: sel[0] || payer }])
    },
    t("forms.expense.addGuest")
  )), guests.map((g, i) => /* @__PURE__ */ React.createElement(Group4, { key: i, gap: "xs", mb: 6, wrap: "nowrap" }, /* @__PURE__ */ React.createElement(
    TextInput,
    {
      placeholder: t("forms.expense.guestLabel"),
      value: g.label,
      style: { flex: 2 },
      onChange: (x) => setGuests(guests.map((gg, j) => j === i ? { ...gg, label: x.target.value } : gg))
    }
  ), /* @__PURE__ */ React.createElement(
    TextInput,
    {
      placeholder: "$",
      inputMode: "decimal",
      value: g.amount,
      style: { flex: 1 },
      onChange: (x) => setGuests(guests.map((gg, j) => j === i ? { ...gg, amount: x.target.value } : gg))
    }
  ), /* @__PURE__ */ React.createElement(
    Select,
    {
      value: g.covered_by,
      style: { flex: 2 },
      onChange: (v) => setGuests(guests.map((gg, j) => j === i ? { ...gg, covered_by: v } : gg)),
      data: members.map((m) => ({ value: m.user_id, label: m.display_name })),
      comboboxProps: { withinPortal: true }
    }
  ), /* @__PURE__ */ React.createElement(Button, { size: "xs", variant: "subtle", color: "red", onClick: () => setGuests(guests.filter((_, j) => j !== i)) }, "X"))), guests.length === 0 && /* @__PURE__ */ React.createElement(Text4, { size: "xs", c: "dimmed" }, t("forms.expense.guestHint"))), /* @__PURE__ */ React.createElement(
    Checkbox,
    {
      checked: onlyPresent,
      onChange: (x) => setOnlyPresent(x.currentTarget.checked),
      label: t("forms.expense.onlyPresent")
    }
  ))), /* @__PURE__ */ React.createElement("div", { className: "wizard-field" }, /* @__PURE__ */ React.createElement("span", { className: "wizard-label" }, t("forms.expense.method")), /* @__PURE__ */ React.createElement("div", { className: "wizard-chips", role: "radiogroup", "aria-label": t("forms.expense.method") }, splitTypes.map((st) => /* @__PURE__ */ React.createElement(
    "button",
    {
      key: st.value,
      type: "button",
      role: "radio",
      className: type === st.value ? "wizard-chip is-on" : "wizard-chip",
      "aria-checked": type === st.value,
      onClick: () => changeType(st.value)
    },
    st.label
  )))), equalNote && /* @__PURE__ */ React.createElement(Text4, { size: "xs", c: "dimmed" }, equalNote), /* @__PURE__ */ React.createElement("div", { className: "wizard-field" }, /* @__PURE__ */ React.createElement("span", { className: "wizard-label" }, t("forms.expense.participants")), /* @__PURE__ */ React.createElement(Stack2, { gap: 8 }, members.map((m) => /* @__PURE__ */ React.createElement("div", { key: m.user_id, className: "wizard-person" }, /* @__PURE__ */ React.createElement(
    Checkbox,
    {
      checked: sel.includes(m.user_id),
      onChange: () => toggle(m.user_id),
      label: m.display_name
    }
  ), type !== "EQUAL" && sel.includes(m.user_id) && /* @__PURE__ */ React.createElement(
    TextInput,
    {
      className: "split-value",
      "aria-label": `${boxLabel} for ${m.display_name}`,
      placeholder: type === "SHARES" ? "1" : boxLabel,
      inputMode: type === "SHARES" ? "numeric" : "decimal",
      min: type === "SHARES" ? 1 : void 0,
      value: values[m.user_id] ?? (type === "SHARES" ? "1" : ""),
      onChange: (x) => setVal(m.user_id, x.target.value),
      style: { width: 110 }
    }
  ))))), type !== "EQUAL" && totals && /* @__PURE__ */ React.createElement(Text4, { size: "sm", c: totals.ok ? "teal" : "orange" }, totals.text), preview && /* @__PURE__ */ React.createElement("div", { className: "wizard-person wizard-pay-hint" }, /* @__PURE__ */ React.createElement(Text4, { size: "sm", fw: 600 }, t("forms.expense.livePreview")), /* @__PURE__ */ React.createElement(Text4, { size: "sm" }, Object.entries(preview.shares || {}).map(([id, v]) => `${displayNameOf(members, id)} ${fmt(v, currency)}`).join(" \xB7 ")), preview.unsettled_user_ids?.length > 0 && /* @__PURE__ */ React.createElement(Text4, { size: "sm", fw: 600, c: "orange" }, t("forms.expense.unsettle", { count: preview.unsettled_user_ids.length })))), confirm && /* @__PURE__ */ React.createElement(Alert2, { color: "orange", variant: "light", title: t("forms.expense.unsettleConfirm") }, /* @__PURE__ */ React.createElement(Text4, { size: "sm", mb: "xs" }, t("forms.expense.unsettleContinue", { names: confirm.join(", ") })), /* @__PURE__ */ React.createElement(Group4, { gap: "xs" }, /* @__PURE__ */ React.createElement(Button, { className: "wizard-primary", size: "sm", type: "submit", loading: saving }, t("forms.expense.yesSave")), /* @__PURE__ */ React.createElement(Button, { className: "wizard-back", size: "sm", onClick: () => {
    setConfirm(null);
    setPending(null);
  } }, t("common.cancel")))), !confirm && /* @__PURE__ */ React.createElement(
    Button,
    {
      className: "wizard-primary",
      fullWidth: true,
      type: "submit",
      loading: saving
    },
    existing ? t("common.saveChanges") : saveActionLabel
  ), imgErrs.length > 0 && /* @__PURE__ */ React.createElement(Alert2, { color: "orange", variant: "light", title: t("forms.expense.receiptFailed") }, /* @__PURE__ */ React.createElement(Text4, { size: "sm" }, imgErrs.join("; "))), /* @__PURE__ */ React.createElement(Err, { e })), /* @__PURE__ */ React.createElement(
    Modal2,
    {
      opened: catModalOpen,
      onClose: () => {
        if (!addingCat) setCatModalOpen(false);
      },
      title: t("forms.expense.addCategory"),
      centered: true,
      size: "sm",
      radius: "lg",
      overlayProps: { backgroundOpacity: 0.45, blur: 4 },
      zIndex: 400
    },
    /* @__PURE__ */ React.createElement(Stack2, { gap: "sm" }, /* @__PURE__ */ React.createElement(
      TextInput,
      {
        label: t("groupDetail.categoryName"),
        placeholder: t("forms.expense.addCategoryPh"),
        value: newCatName,
        "data-autofocus": true,
        autoFocus: true,
        onChange: (x) => setNewCatName(x.target.value),
        onKeyDown: (ev) => {
          if (ev.key === "Enter") {
            ev.preventDefault();
            addCategoryFromModal();
          }
        }
      }
    ), /* @__PURE__ */ React.createElement(Err, { e: catModalErr }), /* @__PURE__ */ React.createElement(Group4, { justify: "flex-end", gap: "xs" }, /* @__PURE__ */ React.createElement(
      Button,
      {
        variant: "default",
        disabled: addingCat,
        onClick: () => setCatModalOpen(false)
      },
      t("common.cancel")
    ), /* @__PURE__ */ React.createElement(
      Button,
      {
        color: "teal",
        loading: addingCat,
        disabled: !newCatName.trim(),
        onClick: addCategoryFromModal
      },
      t("forms.expense.addCategoryBtn")
    )))
  ));
}
function PaymentForm({ groupId, members, preset, onDone }) {
  const t = useT();
  const options = [...members];
  for (const key of ["from_user_id", "to_user_id"]) {
    const id = preset?.[key];
    if (id && !options.some((m) => m.user_id === id)) {
      options.push({
        user_id: id,
        display_name: t("forms.payment.formerMember", { id: id.slice(0, 8) })
      });
    }
  }
  const [from, setFrom] = useState4(preset?.from_user_id || "");
  const [to, setTo] = useState4(preset?.to_user_id || "");
  const [amount, setAmount] = useState4(preset?.amount_cents != null ? (preset.amount_cents / 100).toFixed(2) : "");
  const [method, setMethod] = useState4("transfer");
  const [note, setNote] = useState4("");
  const [proofRef, setProofRef] = useState4("");
  const [handles, setHandles] = useState4([]);
  const [e, setE] = useState4(null);
  const [amountErr, setAmountErr] = useState4(null);
  const [paying, setPaying] = useState4(false);
  useEffect4(() => {
    if (!to) {
      setHandles([]);
      return;
    }
    api.get(`/api/v1/users/${to}/handles`).then(setHandles).catch(() => setHandles([]));
  }, [to]);
  const onAmountChange = (raw) => {
    const next = sanitizeMoneyInput(raw);
    setAmount(next);
    setAmountErr(moneyAmountError(next, t));
  };
  const go = async (ev) => {
    ev.preventDefault();
    if (paying) return;
    const err = moneyAmountError(amount, t) || (!amount ? t("forms.payment.invalidAmount") : null);
    if (err || !isValidMoneyAmount(amount)) {
      setAmountErr(err || t("forms.payment.invalidAmount"));
      return;
    }
    setAmountErr(null);
    setPaying(true);
    try {
      const r = await api.post(
        `/api/v1/groups/${groupId}/payments`,
        { from_user_id: from, to_user_id: to, amount: Number(amount), method, note: note || null, proof_ref: proofRef || null }
      );
      onDone(r);
    } catch (err2) {
      setE(err2);
    } finally {
      setPaying(false);
    }
  };
  const data = options.map((m) => ({ value: m.user_id, label: m.display_name }));
  const toName = options.find((m) => m.user_id === to)?.display_name;
  const methods = [
    { value: "cash", label: t("forms.payment.cash") },
    { value: "transfer", label: t("forms.payment.bank") },
    { value: "other", label: t("forms.payment.other") }
  ];
  return /* @__PURE__ */ React.createElement("form", { className: "wizard-form", onSubmit: go }, /* @__PURE__ */ React.createElement("div", { className: "wizard-fields" }, /* @__PURE__ */ React.createElement(
    Select,
    {
      label: t("forms.payment.from"),
      required: true,
      searchable: true,
      value: from || null,
      onChange: (v) => setFrom(v || ""),
      data,
      comboboxProps: { withinPortal: true }
    }
  ), /* @__PURE__ */ React.createElement(
    Select,
    {
      label: t("forms.payment.to"),
      required: true,
      searchable: true,
      value: to || null,
      onChange: (v) => setTo(v || ""),
      data,
      comboboxProps: { withinPortal: true }
    }
  ), /* @__PURE__ */ React.createElement(
    TextInput,
    {
      label: t("forms.expense.amount"),
      required: true,
      inputMode: "decimal",
      placeholder: "0.00",
      value: amount,
      error: amountErr,
      onChange: (x) => onAmountChange(x.target.value),
      onBlur: () => {
        if (amount) setAmountErr(moneyAmountError(amount, t));
      }
    }
  ), to && /* @__PURE__ */ React.createElement("div", { className: "wizard-person wizard-pay-hint" }, /* @__PURE__ */ React.createElement(Text4, { size: "sm", fw: 600 }, isValidMoneyAmount(amount) ? t("forms.payment.payNamedAmount", { name: toName, amount }) : t("forms.payment.payNamed", { name: toName })), handles.length === 0 ? /* @__PURE__ */ React.createElement(Text4, { size: "xs", c: "dimmed" }, t("forms.payment.noAccountsHint", { name: toName })) : handles.map((h) => /* @__PURE__ */ React.createElement(Text4, { key: h.handle_id, size: "sm" }, h.label, ": ", /* @__PURE__ */ React.createElement("b", null, h.details)))), /* @__PURE__ */ React.createElement("div", { className: "wizard-field" }, /* @__PURE__ */ React.createElement("span", { className: "wizard-label" }, t("forms.payment.method")), /* @__PURE__ */ React.createElement("div", { className: "wizard-chips", role: "radiogroup", "aria-label": t("forms.payment.method") }, methods.map((m) => /* @__PURE__ */ React.createElement(
    "button",
    {
      key: m.value,
      type: "button",
      role: "radio",
      className: method === m.value ? "wizard-chip is-on" : "wizard-chip",
      "aria-checked": method === m.value,
      onClick: () => setMethod(m.value)
    },
    m.label
  )))), /* @__PURE__ */ React.createElement(
    TextInput,
    {
      label: t("forms.payment.note"),
      placeholder: t("forms.payment.notePh"),
      value: note,
      onChange: (x) => setNote(x.target.value)
    }
  ), /* @__PURE__ */ React.createElement(
    TextInput,
    {
      label: t("forms.payment.proofRef"),
      description: t("forms.payment.proofHint"),
      placeholder: t("forms.payment.proofPh"),
      value: proofRef,
      onChange: (x) => setProofRef(x.target.value)
    }
  )), /* @__PURE__ */ React.createElement(Button, { className: "wizard-primary", fullWidth: true, type: "submit", loading: paying }, t("forms.payment.record")), /* @__PURE__ */ React.createElement(Err, { e }));
}

// src/pages/Statement.jsx
import { useEffect as useEffect5, useState as useState5 } from "react";
import { Link as Link2, useParams } from "react-router-dom";
import { Anchor, Box as Box4, Card as Card2, Group as Group5, Select as Select2, Stack as Stack3, Table as Table2, Text as Text5, Title, ScrollArea } from "@mantine/core";
function StatementPanel({ groupId, members = [], currency = "", embedded = false }) {
  const t = useT();
  const [uid, setUid] = useState5(members[0]?.user_id || "");
  const [stmt, setStmt] = useState5(null);
  const [e, setE] = useState5(null);
  useEffect5(() => {
    if (!uid && members[0]?.user_id) setUid(members[0].user_id);
  }, [members, uid]);
  useEffect5(() => {
    if (!groupId || !uid) return;
    let cancel = false;
    api.get(`/api/v1/groups/${groupId}/statement/${uid}`).then((d) => {
      if (!cancel) {
        setStmt(d);
        setE(null);
      }
    }).catch((err) => {
      if (!cancel) setE(err);
    });
    return () => {
      cancel = true;
    };
  }, [groupId, uid]);
  return /* @__PURE__ */ React.createElement(Stack3, { gap: "sm" }, !embedded && /* @__PURE__ */ React.createElement(Text5, { size: "sm", fw: 600 }, "Statement"), /* @__PURE__ */ React.createElement(Err, { e }), /* @__PURE__ */ React.createElement(
    Select2,
    {
      label: "Member",
      value: uid,
      onChange: (v) => setUid(v || ""),
      data: members.map((m) => ({ value: m.user_id, label: m.display_name }))
    }
  ), /* @__PURE__ */ React.createElement(Box4, { hiddenFrom: "sm" }, /* @__PURE__ */ React.createElement(Stack3, { gap: "xs" }, (stmt?.entries || []).map((r, i) => /* @__PURE__ */ React.createElement(Card2, { key: i, withBorder: true, radius: "md", padding: "sm" }, /* @__PURE__ */ React.createElement(Group5, { justify: "space-between", wrap: "nowrap" }, /* @__PURE__ */ React.createElement("div", { style: { minWidth: 0 } }, /* @__PURE__ */ React.createElement(Text5, { size: "sm", fw: 600, truncate: true }, r.entry.title), /* @__PURE__ */ React.createElement(Text5, { size: "xs", c: "dimmed" }, r.entry.kind, " \xB7 ", new Date(r.entry.at).toLocaleDateString())), /* @__PURE__ */ React.createElement("div", { style: { textAlign: "right", flex: "none" } }, /* @__PURE__ */ React.createElement(Text5, { size: "sm" }, fmt(r.entry.amount_cents, currency)), /* @__PURE__ */ React.createElement(Text5, { size: "xs", c: "dimmed" }, "\u2192 ", fmt(r.running_cents, currency)))))), stmt && /* @__PURE__ */ React.createElement(Card2, { withBorder: true, radius: "md", padding: "sm" }, /* @__PURE__ */ React.createElement(Group5, { justify: "space-between" }, /* @__PURE__ */ React.createElement(Text5, { size: "sm", fw: 600 }, "Closing net"), /* @__PURE__ */ React.createElement(Text5, { size: "sm", fw: 600 }, fmt(stmt.closing_cents, currency)))))), /* @__PURE__ */ React.createElement(Box4, { visibleFrom: "sm" }, /* @__PURE__ */ React.createElement(ScrollArea, null, /* @__PURE__ */ React.createElement(Table2, { striped: true, highlightOnHover: true, withTableBorder: true, miw: 520 }, /* @__PURE__ */ React.createElement(Table2.Thead, null, /* @__PURE__ */ React.createElement(Table2.Tr, null, /* @__PURE__ */ React.createElement(Table2.Th, null, "Date"), /* @__PURE__ */ React.createElement(Table2.Th, null, "Event"), /* @__PURE__ */ React.createElement(Table2.Th, null, "Amount"), /* @__PURE__ */ React.createElement(Table2.Th, null, "Running"))), /* @__PURE__ */ React.createElement(Table2.Tbody, null, (stmt?.entries || []).map((r, i) => /* @__PURE__ */ React.createElement(Table2.Tr, { key: i }, /* @__PURE__ */ React.createElement(Table2.Td, null, new Date(r.entry.at).toLocaleDateString()), /* @__PURE__ */ React.createElement(Table2.Td, null, r.entry.kind, ": ", r.entry.title), /* @__PURE__ */ React.createElement(Table2.Td, null, fmt(r.entry.amount_cents, currency)), /* @__PURE__ */ React.createElement(Table2.Td, null, fmt(r.running_cents, currency))))), /* @__PURE__ */ React.createElement(Table2.Tfoot, null, /* @__PURE__ */ React.createElement(Table2.Tr, null, /* @__PURE__ */ React.createElement(Table2.Td, { colSpan: 3 }, /* @__PURE__ */ React.createElement(Text5, { size: "sm", fw: 600 }, "Closing net")), /* @__PURE__ */ React.createElement(Table2.Td, null, /* @__PURE__ */ React.createElement(Text5, { size: "sm", fw: 600 }, stmt ? fmt(stmt.closing_cents, currency) : "\u2014"))))))), /* @__PURE__ */ React.createElement(Text5, { size: "xs", c: "dimmed" }, "paid = you paid the bill \xB7 share = your part \xB7 payment_out = you paid someone (reduces your debt)."));
}

// src/pages/Report.jsx
import { useEffect as useEffect7, useState as useState7 } from "react";
import { Link as Link3, useParams as useParams2 } from "react-router-dom";
import { Anchor as Anchor2, Avatar as Avatar2, Box as Box5, Button as Button3, Table as Table3, Text as Text7 } from "@mantine/core";

// src/components/MoneyCharts.jsx
var PALETTE = [
  "#2dd4bf",
  "#38bdf8",
  "#fb7185",
  "#a78bfa",
  "#fbbf24",
  "#4ade80",
  "#60a5fa",
  "#f472b6",
  "#34d399",
  "#22d3ee"
];
function colorAt(i) {
  return PALETTE[i % PALETTE.length];
}
function chartColorFor(key) {
  const s = String(key ?? "");
  let h = 0;
  for (let i = 0; i < s.length; i += 1) h = h * 31 + s.charCodeAt(i) >>> 0;
  return colorAt(h);
}
function MoneyDonut({
  rows,
  valueKey,
  currency,
  emptyLabel,
  hideLegend = false,
  size = 168
}) {
  const t = useT();
  const empty = emptyLabel ?? t("charts.noData");
  const data = (rows || []).map((r2, i) => {
    const key = r2.key || r2.user_id || i;
    return {
      key,
      label: r2.label || r2.display_name || "\u2014",
      value: Math.max(0, Number(r2[valueKey] ?? r2.value) || 0),
      color: chartColorFor(key)
    };
  }).filter((r2) => r2.value > 0);
  const total = data.reduce((a, r2) => a + r2.value, 0);
  if (total <= 0) {
    return /* @__PURE__ */ React.createElement("div", { className: `money-donut is-empty${hideLegend ? " is-solo" : ""}` }, /* @__PURE__ */ React.createElement("span", { className: "money-donut-empty" }, empty));
  }
  const stroke = 26;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  let offset = 0;
  return /* @__PURE__ */ React.createElement("div", { className: `money-donut${hideLegend ? " is-solo" : ""}` }, /* @__PURE__ */ React.createElement("svg", { className: "money-donut-svg", viewBox: `0 0 ${size} ${size}`, width: size, height: size, "aria-hidden": true }, /* @__PURE__ */ React.createElement("circle", { className: "money-donut-track", cx: size / 2, cy: size / 2, r, fill: "none", strokeWidth: stroke }), data.map((seg) => {
    const len = seg.value / total * c;
    const dash = `${len} ${c - len}`;
    const el = /* @__PURE__ */ React.createElement(
      "circle",
      {
        key: seg.key,
        cx: size / 2,
        cy: size / 2,
        r,
        fill: "none",
        stroke: seg.color,
        strokeWidth: stroke,
        strokeDasharray: dash,
        strokeDashoffset: -offset,
        strokeLinecap: "round",
        transform: `rotate(-90 ${size / 2} ${size / 2})`
      }
    );
    offset += len;
    return el;
  }), /* @__PURE__ */ React.createElement("text", { x: "50%", y: "47%", textAnchor: "middle", className: "money-donut-total-label" }, t("charts.total")), /* @__PURE__ */ React.createElement("text", { x: "50%", y: "58%", textAnchor: "middle", className: "money-donut-total-value" }, fmt(total, currency))), !hideLegend && /* @__PURE__ */ React.createElement("ul", { className: "money-donut-legend" }, data.map((seg) => /* @__PURE__ */ React.createElement("li", { key: seg.key }, /* @__PURE__ */ React.createElement("span", { className: "money-swatch", style: { background: seg.color } }), /* @__PURE__ */ React.createElement("span", { className: "money-leg-label" }, seg.label), /* @__PURE__ */ React.createElement("span", { className: "money-leg-value" }, fmt(seg.value, currency))))));
}
function PaidShareBars({ summary, currency }) {
  const t = useT();
  const rows = [...summary || []].sort((a, b) => Math.max(b.total_paid_cents, b.total_share_cents) - Math.max(a.total_paid_cents, a.total_share_cents));
  const rawMax = Math.max(1, ...rows.flatMap((m) => [m.total_paid_cents || 0, m.total_share_cents || 0]));
  const niceStep = (() => {
    const rough = rawMax / 4;
    const pow = 10 ** Math.floor(Math.log10(Math.max(rough, 1)));
    const n = rough / pow;
    const nice = n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10;
    return nice * pow;
  })();
  const max = Math.max(niceStep * 4, Math.ceil(rawMax / niceStep) * niceStep);
  const ticks = [0, 1, 2, 3, 4].map((i) => Math.round(max * i / 4));
  if (rows.length === 0) {
    return /* @__PURE__ */ React.createElement("div", { className: "money-bars is-empty" }, t("charts.noMemberTotals"));
  }
  const shortName2 = (name) => {
    const parts = String(name || "").trim().split(/\s+/);
    if (parts.length === 1) return parts[0].slice(0, 12);
    return `${parts[0].slice(0, 10)} ${parts[parts.length - 1][0] || ""}`.trim();
  };
  return /* @__PURE__ */ React.createElement("div", { className: "money-bars", role: "img", "aria-label": t("charts.paidVsShareAria") }, /* @__PURE__ */ React.createElement("div", { className: "money-bars-legend" }, /* @__PURE__ */ React.createElement("span", null, /* @__PURE__ */ React.createElement("i", { className: "money-swatch is-paid" }), " ", t("charts.paid")), /* @__PURE__ */ React.createElement("span", null, /* @__PURE__ */ React.createElement("i", { className: "money-swatch is-share" }), " ", t("charts.share"))), /* @__PURE__ */ React.createElement("div", { className: "money-bars-frame" }, /* @__PURE__ */ React.createElement("div", { className: "money-bars-yaxis", "aria-hidden": true }, [...ticks].reverse().map((tick) => /* @__PURE__ */ React.createElement("span", { key: tick }, fmt(tick, currency)))), /* @__PURE__ */ React.createElement("div", { className: "money-bars-main" }, /* @__PURE__ */ React.createElement("div", { className: "money-bars-scroll" }, /* @__PURE__ */ React.createElement("div", { className: "money-bars-plot" }, /* @__PURE__ */ React.createElement("div", { className: "money-bars-grid", "aria-hidden": true }, ticks.map((tick) => /* @__PURE__ */ React.createElement("span", { key: tick, className: "money-bars-gridline" }))), /* @__PURE__ */ React.createElement("div", { className: "money-bars-chart" }, rows.map((m, idx) => {
    const paid = m.total_paid_cents || 0;
    const share = m.total_share_cents || 0;
    const paidTip = t("charts.paidTip", { amount: fmt(paid, currency) });
    const shareTip = t("charts.shareTip", { amount: fmt(share, currency) });
    const edge = idx === 0 ? " is-first" : idx === rows.length - 1 ? " is-last" : "";
    return /* @__PURE__ */ React.createElement("div", { key: m.user_id, className: `money-bars-col${edge}` }, /* @__PURE__ */ React.createElement("div", { className: "money-bars-pair" }, /* @__PURE__ */ React.createElement(
      "div",
      {
        className: "money-bars-vfill is-paid",
        style: { height: `${paid / max * 100}%` },
        tabIndex: 0,
        role: "img",
        "aria-label": `${m.display_name}: ${paidTip}`
      },
      /* @__PURE__ */ React.createElement("span", { className: "money-bar-tip" }, paidTip)
    ), /* @__PURE__ */ React.createElement(
      "div",
      {
        className: "money-bars-vfill is-share",
        style: { height: `${share / max * 100}%` },
        tabIndex: 0,
        role: "img",
        "aria-label": `${m.display_name}: ${shareTip}`
      },
      /* @__PURE__ */ React.createElement("span", { className: "money-bar-tip" }, shareTip)
    )));
  }))), /* @__PURE__ */ React.createElement("div", { className: "money-bars-xlabels" }, rows.map((m) => /* @__PURE__ */ React.createElement("div", { key: m.user_id, className: "money-bars-name", title: m.display_name }, /* @__PURE__ */ React.createElement("span", null, shortName2(m.display_name)))))))));
}

// src/components/SettlementBox.jsx
import { useEffect as useEffect6, useState as useState6 } from "react";
import {
  ActionIcon as ActionIcon2,
  Alert as Alert3,
  Button as Button2,
  Group as Group6,
  Modal as Modal3,
  Select as Select3,
  Skeleton,
  Spoiler,
  Stack as Stack4,
  Text as Text6
} from "@mantine/core";
function InfoIcon() {
  return /* @__PURE__ */ React.createElement("svg", { width: "18", height: "18", viewBox: "0 0 24 24", fill: "none", "aria-hidden": true }, /* @__PURE__ */ React.createElement("circle", { cx: "12", cy: "12", r: "9", stroke: "currentColor", strokeWidth: "1.8" }), /* @__PURE__ */ React.createElement("path", { d: "M12 11v5.5", stroke: "currentColor", strokeWidth: "1.8", strokeLinecap: "round" }), /* @__PURE__ */ React.createElement("circle", { cx: "12", cy: "8", r: "1.1", fill: "currentColor" }));
}
function StatusGlyph({ settled }) {
  if (settled) {
    return /* @__PURE__ */ React.createElement("span", { className: "report-status-glyph is-settled", "aria-hidden": true }, /* @__PURE__ */ React.createElement("svg", { width: "22", height: "22", viewBox: "0 0 24 24", fill: "none" }, /* @__PURE__ */ React.createElement("circle", { cx: "12", cy: "12", r: "10", stroke: "currentColor", strokeWidth: "1.8" }), /* @__PURE__ */ React.createElement("path", { d: "M7.5 12.5 10.5 15.5 16.5 9", stroke: "currentColor", strokeWidth: "2", strokeLinecap: "round", strokeLinejoin: "round" })));
  }
  return /* @__PURE__ */ React.createElement("span", { className: "report-status-glyph is-open", "aria-hidden": true }, /* @__PURE__ */ React.createElement("svg", { width: "22", height: "22", viewBox: "0 0 24 24", fill: "none" }, /* @__PURE__ */ React.createElement("circle", { cx: "12", cy: "12", r: "10", stroke: "currentColor", strokeWidth: "1.8" }), /* @__PURE__ */ React.createElement("path", { d: "M12 7.5v6", stroke: "currentColor", strokeWidth: "2", strokeLinecap: "round" }), /* @__PURE__ */ React.createElement("circle", { cx: "12", cy: "16.5", r: "1.15", fill: "currentColor" })));
}
function formatWhen(iso) {
  try {
    return new Date(iso).toLocaleString(void 0, {
      dateStyle: "medium",
      timeStyle: "short"
    });
  } catch {
    return iso;
  }
}
function SettlementBox({ groupId, currency, members, onPay, plan: planProp = null }) {
  const t = useT();
  const [plan, setPlan] = useState6(planProp);
  const [hist, setHist] = useState6([]);
  const [viewV, setViewV] = useState6(null);
  const [payments, setPayments] = useState6([]);
  const [open, setOpen] = useState6(false);
  const [e, setE] = useState6(null);
  const load = () => api.get(`/api/v1/groups/${groupId}/settlement`).then((p) => {
    setPlan(p);
    setViewV(null);
    setE(null);
  }).catch(setE);
  useEffect6(() => {
    if (planProp) {
      setPlan(planProp);
      return;
    }
    load();
  }, [groupId, planProp]);
  useEffect6(() => {
    api.get(`/api/v1/groups/${groupId}/ledger?type=payment&limit=100`).then((r) => setPayments(r.items || [])).catch(() => {
    });
  }, [groupId]);
  const loadHist = async () => {
    try {
      setHist(await api.get(`/api/v1/groups/${groupId}/settlement/history`));
    } catch (err) {
      setE(err);
    }
  };
  if (!plan && !e) {
    return /* @__PURE__ */ React.createElement(Skeleton, { height: 96, radius: "lg", className: "report-metric report-status-card" });
  }
  const view = viewV ? hist.find((h) => h.version === viewV) : plan;
  const ex = view?.explanation || {};
  const transfers = view?.transfers || [];
  const historical = viewV !== null;
  const settled = transfers.length === 0;
  const tone = settled ? "settled" : "open";
  const statusTitle = settled ? t("settlement.statusSettled") : t("settlement.statusOpen");
  const subtitle = settled ? t("settlement.statusSettledHint") : t("settlement.statusOpenHint", {
    n: transfers.length,
    saved: ex.saved ?? "\u2014"
  });
  const netEntries = Object.entries(ex.before_nets || {});
  const balanceRows = netEntries.length > 0 ? netEntries.map(([uid, cents]) => ({
    id: uid,
    name: displayNameOf(members, uid),
    cents
  })) : (members || []).map((m) => ({
    id: m.user_id,
    name: m.display_name,
    cents: 0
  }));
  return /* @__PURE__ */ React.createElement(React.Fragment, null, /* @__PURE__ */ React.createElement("section", { className: `report-metric report-status-card is-${tone}` }, /* @__PURE__ */ React.createElement("div", { className: "report-status-row" }, /* @__PURE__ */ React.createElement(StatusGlyph, { settled }), /* @__PURE__ */ React.createElement("div", { className: "report-status-copy" }, /* @__PURE__ */ React.createElement("span", { className: "report-status-title" }, statusTitle), /* @__PURE__ */ React.createElement("p", { className: "report-status-sub" }, subtitle)), /* @__PURE__ */ React.createElement(
    ActionIcon2,
    {
      className: "report-status-info",
      variant: "subtle",
      radius: "xl",
      size: "md",
      "aria-label": t("settlement.viewDetails"),
      title: t("settlement.viewDetails"),
      onClick: () => setOpen(true)
    },
    /* @__PURE__ */ React.createElement(InfoIcon, null)
  ))), /* @__PURE__ */ React.createElement(
    Modal3,
    {
      opened: open,
      onClose: () => setOpen(false),
      title: /* @__PURE__ */ React.createElement("span", { className: "wizard-title-name" }, t("settlement.detailTitle")),
      centered: true,
      size: "lg",
      classNames: { content: "wizard-modal-content settle-modal", header: "wizard-modal-header" }
    },
    !view ? /* @__PURE__ */ React.createElement(Err, { e }) : /* @__PURE__ */ React.createElement("div", { className: "settle-detail" }, historical && /* @__PURE__ */ React.createElement(Alert3, { color: "yellow", variant: "light", mb: "sm" }, t("settlement.historical", { version: viewV })), /* @__PURE__ */ React.createElement("div", { className: `settle-hero is-${tone}` }, /* @__PURE__ */ React.createElement(StatusGlyph, { settled }), /* @__PURE__ */ React.createElement("div", { className: "settle-hero-copy" }, /* @__PURE__ */ React.createElement("span", { className: `net-chip is-${settled ? "settled" : "owe"}` }, settled ? t("net.settledUp") : t("settlement.needsAction")), /* @__PURE__ */ React.createElement("p", { className: "settle-hero-sub" }, subtitle))), /* @__PURE__ */ React.createElement("section", { className: "settle-block" }, /* @__PURE__ */ React.createElement("h4", { className: "settle-block-title" }, t("settlement.netBalances")), balanceRows.length === 0 ? /* @__PURE__ */ React.createElement("p", { className: "settle-empty" }, t("settlement.noNets")) : /* @__PURE__ */ React.createElement("ul", { className: "settle-balance-list" }, balanceRows.map((row) => {
      const toneNet = row.cents === 0 ? "settled" : row.cents < 0 ? "owe" : "owed";
      return /* @__PURE__ */ React.createElement("li", { key: row.id, className: "settle-balance-row" }, /* @__PURE__ */ React.createElement("span", { className: "settle-balance-name" }, row.name), /* @__PURE__ */ React.createElement("span", { className: `settle-balance-amt is-${toneNet}` }, row.cents === 0 ? t("common.settled") : fmt(row.cents, currency)));
    }))), /* @__PURE__ */ React.createElement("section", { className: "settle-block" }, /* @__PURE__ */ React.createElement("h4", { className: "settle-block-title" }, t("settlement.finalTransfers")), transfers.length === 0 ? /* @__PURE__ */ React.createElement("p", { className: "settle-empty" }, t("settlement.allSettledHint")) : /* @__PURE__ */ React.createElement("ul", { className: "settle-xfer-list" }, transfers.map((xfer, i) => /* @__PURE__ */ React.createElement("li", { key: i, className: "settle-xfer-row" }, /* @__PURE__ */ React.createElement("div", { className: "settle-xfer-main" }, /* @__PURE__ */ React.createElement("span", { className: "settle-xfer-people" }, displayNameOf(members, xfer.from_user_id), /* @__PURE__ */ React.createElement("span", { className: "settle-xfer-arrow", "aria-hidden": true }, "\u2192"), displayNameOf(members, xfer.to_user_id)), /* @__PURE__ */ React.createElement("span", { className: "settle-xfer-amt" }, fmt(xfer.amount_cents, currency))), !historical && onPay && /* @__PURE__ */ React.createElement(
      Button2,
      {
        size: "xs",
        variant: "filled",
        color: "teal",
        onClick: () => {
          onPay(xfer);
          setOpen(false);
        }
      },
      t("groupDetail.pay")
    ))))), /* @__PURE__ */ React.createElement("section", { className: "settle-block" }, /* @__PURE__ */ React.createElement("h4", { className: "settle-block-title" }, t("settlement.completed", { count: payments.length })), payments.length === 0 ? /* @__PURE__ */ React.createElement("p", { className: "settle-empty" }, t("settlement.noTransfers")) : /* @__PURE__ */ React.createElement("ul", { className: "settle-pay-list" }, payments.map((p) => /* @__PURE__ */ React.createElement("li", { key: p.id, className: "settle-pay-row" }, /* @__PURE__ */ React.createElement("div", { className: "settle-pay-main" }, /* @__PURE__ */ React.createElement("span", { className: "settle-pay-people" }, p.from_name || displayNameOf(members, p.from_user_id), /* @__PURE__ */ React.createElement("span", { className: "settle-xfer-arrow", "aria-hidden": true }, "\u2192"), p.to_name || displayNameOf(members, p.to_user_id)), /* @__PURE__ */ React.createElement("span", { className: "settle-pay-amt" }, fmt(p.amount_cents, currency))), /* @__PURE__ */ React.createElement("div", { className: "settle-pay-meta" }, /* @__PURE__ */ React.createElement("span", null, formatWhen(p.created_at)), p.reversed && /* @__PURE__ */ React.createElement("span", { className: "settle-pay-tag is-rev" }, t("settlement.reversed")), !p.reversed && String(p.status).toUpperCase() === "LOCKED" && /* @__PURE__ */ React.createElement("span", { className: "settle-pay-tag is-ok" }, t("common.settled"))))))), (ex.steps || []).length > 0 && /* @__PURE__ */ React.createElement(
      Spoiler,
      {
        className: "settle-spoiler",
        maxHeight: 0,
        showLabel: t("settlement.steps"),
        hideLabel: t("settlement.hide")
      },
      /* @__PURE__ */ React.createElement("ol", { className: "settle-steps" }, (ex.steps || []).map((step, i) => /* @__PURE__ */ React.createElement("li", { key: i }, step)))
    ), /* @__PURE__ */ React.createElement(
      Spoiler,
      {
        className: "settle-spoiler",
        maxHeight: 0,
        showLabel: t("settlement.viewRaw"),
        hideLabel: t("settlement.hide")
      },
      /* @__PURE__ */ React.createElement(Text6, { size: "sm", c: "dimmed" }, t("settlement.rawHint", {
        raw: ex.raw_debts ?? "\u2014",
        n: transfers.length
      }))
    ), /* @__PURE__ */ React.createElement("div", { className: "settle-footer" }, /* @__PURE__ */ React.createElement(Group6, { gap: "xs" }, /* @__PURE__ */ React.createElement(Button2, { size: "xs", variant: "default", radius: "xl", onClick: loadHist }, t("settlement.history")), /* @__PURE__ */ React.createElement(Button2, { size: "xs", variant: "default", radius: "xl", onClick: load }, t("common.refresh")), hist.length > 0 && /* @__PURE__ */ React.createElement(
      Select3,
      {
        size: "xs",
        placeholder: t("settlement.current"),
        clearable: true,
        value: viewV ? String(viewV) : null,
        onChange: (v) => setViewV(v ? Number(v) : null),
        data: hist.map((h) => ({
          value: String(h.version),
          label: `v${h.version} \xB7 ${formatWhen(h.computed_at)}`
        }))
      }
    )), /* @__PURE__ */ React.createElement(Text6, { size: "xs", c: "dimmed", className: "settle-version" }, "v", view.version, " \xB7 ", formatWhen(view.computed_at))), /* @__PURE__ */ React.createElement(Err, { e }))
  ));
}

// src/pages/Report.jsx
function netTone(cents) {
  if (cents === 0) return "settled";
  return cents < 0 ? "owe" : "owed";
}
function netLabel(cents, currency, settledLabel) {
  if (cents === 0) return settledLabel || "Settled";
  return fmt(cents, currency);
}
function formatDate(iso, withTime = false) {
  try {
    const d = new Date(iso);
    return withTime ? d.toLocaleString(void 0, { dateStyle: "medium", timeStyle: "short" }) : d.toLocaleDateString(void 0, { dateStyle: "medium" });
  } catch {
    return iso || "\u2014";
  }
}
function kindLabel(kind, t) {
  if (kind === "expense") return t("groupDetail.expense");
  if (kind === "payment") return t("groupDetail.payment");
  return kind || "\u2014";
}
function PrintPageHead({ title, hint }) {
  return /* @__PURE__ */ React.createElement("div", { className: "report-doc-section-head is-page" }, /* @__PURE__ */ React.createElement("div", { className: "report-doc-sec-copy" }, /* @__PURE__ */ React.createElement("h2", null, title), hint ? /* @__PURE__ */ React.createElement("p", null, hint) : null));
}
function ReportDecor() {
  return /* @__PURE__ */ React.createElement("svg", { className: "report-doc-decor", viewBox: "0 0 160 120", "aria-hidden": true }, /* @__PURE__ */ React.createElement("rect", { x: "78", y: "18", width: "70", height: "86", rx: "6", fill: "#e7f5ef", stroke: "#0f766e", strokeWidth: "2.5" }), /* @__PURE__ */ React.createElement("rect", { x: "88", y: "32", width: "28", height: "6", rx: "2", fill: "#0f766e", opacity: "0.35" }), /* @__PURE__ */ React.createElement("rect", { x: "88", y: "44", width: "42", height: "6", rx: "2", fill: "#0f766e", opacity: "0.22" }), /* @__PURE__ */ React.createElement("rect", { x: "88", y: "56", width: "36", height: "6", rx: "2", fill: "#0f766e", opacity: "0.22" }), /* @__PURE__ */ React.createElement("circle", { cx: "128", cy: "78", r: "18", fill: "#fff", stroke: "#0f766e", strokeWidth: "2.5" }), /* @__PURE__ */ React.createElement("path", { d: "M128 78 L128 64 A14 14 0 0 1 140 78 Z", fill: "#3dde84" }), /* @__PURE__ */ React.createElement("path", { d: "M128 78 L140 78 A14 14 0 0 1 122 90 Z", fill: "#0f766e" }), /* @__PURE__ */ React.createElement("rect", { x: "12", y: "48", width: "58", height: "54", rx: "8", fill: "#0f766e" }), /* @__PURE__ */ React.createElement("rect", { x: "22", y: "58", width: "16", height: "12", rx: "2", fill: "#3dde84" }), /* @__PURE__ */ React.createElement("rect", { x: "44", y: "58", width: "16", height: "12", rx: "2", fill: "#e7f5ef" }), /* @__PURE__ */ React.createElement("rect", { x: "22", y: "76", width: "16", height: "12", rx: "2", fill: "#e7f5ef" }), /* @__PURE__ */ React.createElement("rect", { x: "44", y: "76", width: "16", height: "12", rx: "2", fill: "#3dde84" }), /* @__PURE__ */ React.createElement("circle", { cx: "42", cy: "36", r: "14", fill: "#149a62", opacity: "0.9" }), /* @__PURE__ */ React.createElement("rect", { x: "36", y: "30", width: "12", height: "14", rx: "2", fill: "#fff", opacity: "0.9" }));
}
function ReportDocFooter({ detail, pageNo, totalPages, t }) {
  return /* @__PURE__ */ React.createElement("footer", { className: "report-doc-sheet-foot" }, /* @__PURE__ */ React.createElement("div", { className: "report-doc-sheet-foot-brand" }, /* @__PURE__ */ React.createElement(BrandMark, { size: 16 }), /* @__PURE__ */ React.createElement("span", null, t("report.brand"))), /* @__PURE__ */ React.createElement("div", { className: "report-doc-sheet-foot-meta" }, /* @__PURE__ */ React.createElement("span", null, detail.name), /* @__PURE__ */ React.createElement("span", { className: "report-doc-sheet-foot-page" }, t("report.pageOf", { current: pageNo, total: totalPages }))));
}
function ReportPrintDoc({
  detail,
  summary,
  plan,
  breakdown = [],
  ledgerItems,
  reporterName,
  generatedAt
}) {
  const t = useT();
  const c = detail.currency;
  const members = detail.members || [];
  const rows = [...summary || []].sort((a, b) => a.display_name.localeCompare(b.display_name));
  const transfers = plan?.transfers || [];
  const settled = transfers.length === 0;
  const totalSpend = rows.reduce((a, m) => a + (m.total_paid_cents || 0), 0);
  const expenses = (ledgerItems || []).filter((item) => item.kind === "expense");
  const statement = [...ledgerItems || []].sort(
    (a, b) => new Date(a.created_at) - new Date(b.created_at)
  );
  const categoryRows = [...breakdown || []].map((b) => {
    const cat = String(b.category || "other").trim().toLowerCase() || "other";
    const nameKey = `forms.expense.cat.${cat}`;
    const translated = t(nameKey);
    const name = translated === nameKey ? b.category || t("forms.expense.cat.other") : translated;
    return {
      key: cat,
      label: name,
      count: b.expense_count,
      value: b.paid_cents,
      paid_cents: b.paid_cents
    };
  }).sort((a, b) => b.value - a.value);
  const categoryTotal = categoryRows.reduce((a, r) => a + r.value, 0);
  const sheets = [
    {
      id: "cover",
      cover: true
    },
    {
      id: "overview",
      title: t("report.byCategory"),
      hint: t("report.byCategoryHint"),
      body: /* @__PURE__ */ React.createElement(React.Fragment, null, categoryRows.length === 0 ? /* @__PURE__ */ React.createElement("p", { className: "report-doc-empty" }, t("report.noCategories")) : /* @__PURE__ */ React.createElement("div", { className: "report-doc-category" }, /* @__PURE__ */ React.createElement("div", { className: "report-doc-category-chart" }, /* @__PURE__ */ React.createElement(
        MoneyDonut,
        {
          rows: categoryRows,
          valueKey: "paid_cents",
          currency: c,
          emptyLabel: t("report.noCategoriesYet"),
          size: 168,
          hideLegend: true
        }
      )), /* @__PURE__ */ React.createElement("table", { className: "report-doc-table" }, /* @__PURE__ */ React.createElement("thead", null, /* @__PURE__ */ React.createElement("tr", null, /* @__PURE__ */ React.createElement("th", null, t("common.category")), /* @__PURE__ */ React.createElement("th", { className: "is-num" }, t("report.amount")), /* @__PURE__ */ React.createElement("th", { className: "is-num" }, "%"))), /* @__PURE__ */ React.createElement("tbody", null, categoryRows.map((row) => {
        const pct = categoryTotal > 0 ? Math.round(row.value / categoryTotal * 100) : 0;
        return /* @__PURE__ */ React.createElement("tr", { key: row.key }, /* @__PURE__ */ React.createElement("td", null, /* @__PURE__ */ React.createElement("span", { className: "report-doc-cat-swatch", style: { background: chartColorFor(row.key) }, "aria-hidden": true }), row.label, /* @__PURE__ */ React.createElement("span", { className: "report-doc-cat-count" }, " ", "(", t(row.count === 1 ? "report.catCountOne" : "report.catCount", { count: row.count }), ")")), /* @__PURE__ */ React.createElement("td", { className: "is-num" }, fmt(row.value, c)), /* @__PURE__ */ React.createElement("td", { className: "is-num" }, pct, "%"));
      }), /* @__PURE__ */ React.createElement("tr", { className: "is-total" }, /* @__PURE__ */ React.createElement("td", null, t("common.total")), /* @__PURE__ */ React.createElement("td", { className: "is-num" }, fmt(categoryTotal, c)), /* @__PURE__ */ React.createElement("td", { className: "is-num" }, "100%"))))))
    },
    {
      id: "balance",
      title: t("report.balanceSheet"),
      hint: t("report.balanceSheetHint"),
      body: transfers.length === 0 ? /* @__PURE__ */ React.createElement("p", { className: "report-doc-empty" }, settled ? t("report.allSettled") : t("report.emptyTransfers")) : /* @__PURE__ */ React.createElement("table", { className: "report-doc-table" }, /* @__PURE__ */ React.createElement("thead", null, /* @__PURE__ */ React.createElement("tr", null, /* @__PURE__ */ React.createElement("th", null, "#"), /* @__PURE__ */ React.createElement("th", null, t("report.from")), /* @__PURE__ */ React.createElement("th", null, t("report.to")), /* @__PURE__ */ React.createElement("th", { className: "is-num" }, t("report.amount")))), /* @__PURE__ */ React.createElement("tbody", null, transfers.map((xfer, i) => /* @__PURE__ */ React.createElement("tr", { key: `${xfer.from_user_id}-${xfer.to_user_id}-${i}` }, /* @__PURE__ */ React.createElement("td", null, i + 1), /* @__PURE__ */ React.createElement("td", null, displayNameOf(members, xfer.from_user_id)), /* @__PURE__ */ React.createElement("td", null, displayNameOf(members, xfer.to_user_id)), /* @__PURE__ */ React.createElement("td", { className: "is-num" }, fmt(xfer.amount_cents, c))))))
    },
    {
      id: "cashflow",
      title: t("report.membersCashflow"),
      hint: t("report.membersCashflowHint"),
      body: /* @__PURE__ */ React.createElement(React.Fragment, null, /* @__PURE__ */ React.createElement("table", { className: "report-doc-table" }, /* @__PURE__ */ React.createElement("thead", null, /* @__PURE__ */ React.createElement("tr", null, /* @__PURE__ */ React.createElement("th", null, t("report.member")), /* @__PURE__ */ React.createElement("th", { className: "is-num" }, t("report.spentCol")), /* @__PURE__ */ React.createElement("th", { className: "is-num" }, t("report.shareCol")), /* @__PURE__ */ React.createElement("th", null, t("report.status")))), /* @__PURE__ */ React.createElement("tbody", null, rows.map((m) => /* @__PURE__ */ React.createElement("tr", { key: m.user_id }, /* @__PURE__ */ React.createElement("td", null, m.display_name), /* @__PURE__ */ React.createElement("td", { className: "is-num" }, fmt(m.total_paid_cents, c)), /* @__PURE__ */ React.createElement("td", { className: "is-num" }, fmt(m.total_share_cents, c)), /* @__PURE__ */ React.createElement("td", { className: `is-${netTone(m.net_cents)}` }, netLabel(m.net_cents, c, t("common.settled"))))))))
    },
    {
      id: "statement",
      title: t("report.statementTitle"),
      hint: t("report.statementHint"),
      body: statement.length === 0 ? /* @__PURE__ */ React.createElement("p", { className: "report-doc-empty" }, t("report.emptyStatement")) : /* @__PURE__ */ React.createElement("table", { className: "report-doc-table" }, /* @__PURE__ */ React.createElement("thead", null, /* @__PURE__ */ React.createElement("tr", null, /* @__PURE__ */ React.createElement("th", null, t("report.date")), /* @__PURE__ */ React.createElement("th", null, t("report.kind")), /* @__PURE__ */ React.createElement("th", null, t("report.event")), /* @__PURE__ */ React.createElement("th", { className: "is-num" }, t("report.amount")))), /* @__PURE__ */ React.createElement("tbody", null, statement.map((item) => /* @__PURE__ */ React.createElement("tr", { key: `${item.kind}-${item.id}` }, /* @__PURE__ */ React.createElement("td", null, formatDate(item.created_at)), /* @__PURE__ */ React.createElement("td", null, kindLabel(item.kind, t)), /* @__PURE__ */ React.createElement("td", null, item.title), /* @__PURE__ */ React.createElement("td", { className: "is-num" }, fmt(item.amount_cents, c))))))
    },
    {
      id: "expenses",
      title: t("report.expensesTitle"),
      hint: t("report.expensesHint"),
      body: expenses.length === 0 ? /* @__PURE__ */ React.createElement("p", { className: "report-doc-empty" }, t("report.emptyExpenses")) : /* @__PURE__ */ React.createElement("table", { className: "report-doc-table" }, /* @__PURE__ */ React.createElement("thead", null, /* @__PURE__ */ React.createElement("tr", null, /* @__PURE__ */ React.createElement("th", null, t("report.date")), /* @__PURE__ */ React.createElement("th", null, t("report.event")), /* @__PURE__ */ React.createElement("th", null, t("common.category")), /* @__PURE__ */ React.createElement("th", null, t("report.payer")), /* @__PURE__ */ React.createElement("th", { className: "is-num" }, t("report.amount")), /* @__PURE__ */ React.createElement("th", null, t("report.status")))), /* @__PURE__ */ React.createElement("tbody", null, expenses.map((item) => {
        const cat = item.category ? t(`forms.expense.cat.${item.category}`) : "\u2014";
        return /* @__PURE__ */ React.createElement("tr", { key: item.id }, /* @__PURE__ */ React.createElement("td", null, formatDate(item.created_at)), /* @__PURE__ */ React.createElement("td", null, item.title), /* @__PURE__ */ React.createElement("td", null, cat === `forms.expense.cat.${item.category}` ? item.category : cat), /* @__PURE__ */ React.createElement("td", null, item.payer_name || displayNameOf(members, item.payer_id)), /* @__PURE__ */ React.createElement("td", { className: "is-num" }, fmt(item.amount_cents, c)), /* @__PURE__ */ React.createElement("td", null, item.status === "LOCKED" ? t("groupDetail.statusLocked") : item.status === "OPEN" ? t("groupDetail.statusOpen") : item.status || "\u2014"));
      })))
    }
  ];
  const totalPages = sheets.length;
  const memberCount = members.length;
  const transferCount = transfers.length;
  const topCats = categoryRows.slice(0, 3);
  const avgPaid = memberCount > 0 ? Math.round(totalSpend / memberCount) : 0;
  const coverHeader = /* @__PURE__ */ React.createElement("div", { className: `report-cover is-${settled ? "settled" : "open"}` }, /* @__PURE__ */ React.createElement("header", { className: "report-cover-top" }, /* @__PURE__ */ React.createElement("div", { className: "report-cover-top-copy" }, /* @__PURE__ */ React.createElement("p", { className: "report-cover-kicker" }, t("report.brand")), /* @__PURE__ */ React.createElement("h1", { className: "report-cover-title" }, t("report.tripReport")), /* @__PURE__ */ React.createElement("p", { className: "report-cover-group" }, detail.name), /* @__PURE__ */ React.createElement("div", { className: "report-cover-meta" }, /* @__PURE__ */ React.createElement("span", { className: "report-cover-meta-item" }, /* @__PURE__ */ React.createElement("span", { className: "report-cover-meta-label" }, t("report.createdOn")), /* @__PURE__ */ React.createElement("span", { className: "report-cover-meta-value" }, formatDate(generatedAt, true))), /* @__PURE__ */ React.createElement("span", { className: "report-cover-meta-dot", "aria-hidden": true }, "\xB7"), /* @__PURE__ */ React.createElement("span", { className: "report-cover-meta-item" }, /* @__PURE__ */ React.createElement("span", { className: "report-cover-meta-label" }, t("report.currency")), /* @__PURE__ */ React.createElement("span", { className: "report-cover-meta-value" }, c)), plan?.version != null && /* @__PURE__ */ React.createElement(React.Fragment, null, /* @__PURE__ */ React.createElement("span", { className: "report-cover-meta-dot", "aria-hidden": true }, "\xB7"), /* @__PURE__ */ React.createElement("span", { className: "report-cover-meta-item" }, /* @__PURE__ */ React.createElement("span", { className: "report-cover-meta-label" }, t("report.settlement")), /* @__PURE__ */ React.createElement("span", { className: "report-cover-meta-value" }, t("report.settlementVer", { version: plan.version }))))), /* @__PURE__ */ React.createElement("div", { className: "report-cover-status" }, /* @__PURE__ */ React.createElement("span", { className: `report-doc-pill is-${settled ? "settled" : "open"}` }, settled ? t("report.statusSettled") : t("report.statusOpen")))), /* @__PURE__ */ React.createElement(ReportDecor, null)), /* @__PURE__ */ React.createElement("section", { className: "report-doc-block is-metrics" }, /* @__PURE__ */ React.createElement("h2", { className: "report-doc-block-title" }, t("report.keyMetrics")), /* @__PURE__ */ React.createElement("table", { className: "report-doc-table is-metrics" }, /* @__PURE__ */ React.createElement("thead", null, /* @__PURE__ */ React.createElement("tr", null, /* @__PURE__ */ React.createElement("th", null, t("report.metric")), /* @__PURE__ */ React.createElement("th", { className: "is-num" }, t("report.value")), /* @__PURE__ */ React.createElement("th", null, t("report.note")))), /* @__PURE__ */ React.createElement("tbody", null, /* @__PURE__ */ React.createElement("tr", null, /* @__PURE__ */ React.createElement("td", null, t("report.totalSpend")), /* @__PURE__ */ React.createElement("td", { className: "is-num" }, fmt(totalSpend, c)), /* @__PURE__ */ React.createElement("td", null, /* @__PURE__ */ React.createElement("span", { className: "report-doc-chip is-ok" }, t("report.coverSpendHint")))), /* @__PURE__ */ React.createElement("tr", null, /* @__PURE__ */ React.createElement("td", null, t("report.coverMembers")), /* @__PURE__ */ React.createElement("td", { className: "is-num" }, memberCount), /* @__PURE__ */ React.createElement("td", null, /* @__PURE__ */ React.createElement("span", { className: "report-doc-chip" }, t(memberCount === 1 ? "report.coverMembersHintOne" : "report.coverMembersHint", { count: memberCount })))), /* @__PURE__ */ React.createElement("tr", null, /* @__PURE__ */ React.createElement("td", null, t("report.expenses")), /* @__PURE__ */ React.createElement("td", { className: "is-num" }, expenses.length), /* @__PURE__ */ React.createElement("td", null, /* @__PURE__ */ React.createElement("span", { className: "report-doc-chip" }, t("report.avgPerMember", { amount: fmt(avgPaid, c) })))), /* @__PURE__ */ React.createElement("tr", null, /* @__PURE__ */ React.createElement("td", null, t("report.settlement")), /* @__PURE__ */ React.createElement("td", { className: "is-num" }, transferCount), /* @__PURE__ */ React.createElement("td", null, /* @__PURE__ */ React.createElement("span", { className: `report-doc-chip ${settled ? "is-ok" : "is-warn"}` }, settled ? t("report.coverTransfersClear") : t(transferCount === 1 ? "report.coverTransfersOne" : "report.coverTransfers", { count: transferCount }))))))), /* @__PURE__ */ React.createElement("div", { className: "report-doc-split" }, /* @__PURE__ */ React.createElement("section", { className: "report-doc-block" }, /* @__PURE__ */ React.createElement("h2", { className: "report-doc-block-title" }, t("report.keyHighlights")), topCats.length === 0 ? /* @__PURE__ */ React.createElement("p", { className: "report-doc-empty" }, t("report.noCategories")) : /* @__PURE__ */ React.createElement("div", { className: "report-doc-highlights" }, topCats.map((row) => {
    const pct = categoryTotal > 0 ? Math.round(row.value / categoryTotal * 100) : 0;
    return /* @__PURE__ */ React.createElement("div", { key: row.key, className: "report-doc-highlight" }, /* @__PURE__ */ React.createElement("div", { className: "report-doc-ring", style: { "--pct": pct } }, /* @__PURE__ */ React.createElement("span", { className: "report-doc-ring-hole" }, /* @__PURE__ */ React.createElement("b", null, pct, "%"))), /* @__PURE__ */ React.createElement("p", { className: "report-doc-highlight-label" }, /* @__PURE__ */ React.createElement("strong", null, row.label), /* @__PURE__ */ React.createElement("span", null, fmt(row.value, c))));
  })), /* @__PURE__ */ React.createElement("p", { className: "report-cover-lead" }, settled ? t("report.coverLeadSettled") : t("report.coverLeadOpen", { count: transferCount }))), /* @__PURE__ */ React.createElement("section", { className: "report-doc-block" }, /* @__PURE__ */ React.createElement("h2", { className: "report-doc-block-title" }, t("report.settlement")), transfers.length === 0 ? /* @__PURE__ */ React.createElement("div", { className: "report-doc-settle-empty" }, /* @__PURE__ */ React.createElement("span", { "aria-hidden": true }, "\u2713"), /* @__PURE__ */ React.createElement("p", null, t("report.allSettled"))) : /* @__PURE__ */ React.createElement("ul", { className: "report-doc-challenge-list" }, transfers.slice(0, 5).map((xfer, i) => /* @__PURE__ */ React.createElement("li", { key: `${xfer.from_user_id}-${xfer.to_user_id}-${i}` }, /* @__PURE__ */ React.createElement("span", { className: "report-doc-challenge-icon", "aria-hidden": true }, i + 1), /* @__PURE__ */ React.createElement("p", null, /* @__PURE__ */ React.createElement("strong", null, displayNameOf(members, xfer.from_user_id)), " \u2192 ", /* @__PURE__ */ React.createElement("strong", null, displayNameOf(members, xfer.to_user_id)), ": ", fmt(xfer.amount_cents, c))))), /* @__PURE__ */ React.createElement("p", { className: "report-doc-meta-line" }, t("report.reporter"), ": ", reporterName || "\u2014", " \xB7 ", t("report.createdOn"), ": ", formatDate(generatedAt, true)))));
  return /* @__PURE__ */ React.createElement("article", { className: "report-doc only-print", id: "group-report-print", "aria-label": t("report.tripReport") }, sheets.map((sheet, i) => {
    const pageNo = i + 1;
    const isCover = !!sheet.cover;
    return /* @__PURE__ */ React.createElement(
      "section",
      {
        key: sheet.id,
        className: `report-doc-sheet${i > 0 ? " report-doc-page" : ""}${isCover ? " is-cover" : ""}`
      },
      isCover ? /* @__PURE__ */ React.createElement(React.Fragment, null, coverHeader, /* @__PURE__ */ React.createElement(ReportDocFooter, { detail, pageNo, totalPages, t })) : /* @__PURE__ */ React.createElement(React.Fragment, null, /* @__PURE__ */ React.createElement("div", { className: "report-doc-page-banner" }, /* @__PURE__ */ React.createElement("div", { className: "report-doc-page-banner-brand" }, /* @__PURE__ */ React.createElement(BrandMark, { size: 14 }), /* @__PURE__ */ React.createElement("span", { className: "report-doc-page-kicker" }, detail.name)), /* @__PURE__ */ React.createElement("span", { className: "report-doc-page-num" }, t("report.tripReport"))), /* @__PURE__ */ React.createElement(PrintPageHead, { title: sheet.title, hint: sheet.hint }), /* @__PURE__ */ React.createElement("div", { className: "report-doc-sheet-body" }, sheet.body), /* @__PURE__ */ React.createElement(ReportDocFooter, { detail, pageNo, totalPages, t }))
    );
  }));
}
function ReportPanel({
  groupId,
  detail: detailProp = null,
  summary: summaryProp = null,
  embedded = false,
  onPay = null,
  categoryManager = null
}) {
  const { user } = useAuth();
  const [detail, setDetail] = useState7(detailProp);
  const [summary, setSummary] = useState7(summaryProp);
  const [plan, setPlan] = useState7(null);
  const [breakdown, setBreakdown] = useState7([]);
  const [ledgerItems, setLedgerItems] = useState7([]);
  const [generatedAt] = useState7(() => (/* @__PURE__ */ new Date()).toISOString());
  const t = useT();
  const [e, setE] = useState7(null);
  useEffect7(() => {
    setDetail(detailProp);
  }, [detailProp]);
  useEffect7(() => {
    setSummary(summaryProp);
  }, [summaryProp]);
  useEffect7(() => {
    if (!groupId) return;
    let cancel = false;
    const needDetail = !detailProp;
    const needSummary = !summaryProp;
    Promise.all([
      needDetail ? api.get(`/api/v1/groups/${groupId}`) : Promise.resolve(detailProp),
      needSummary ? api.get(`/api/v1/groups/${groupId}/summary`) : Promise.resolve(summaryProp),
      api.get(`/api/v1/groups/${groupId}/settlement`).catch(() => null),
      api.get(`/api/v1/groups/${groupId}/breakdown`).catch(() => []),
      api.get(`/api/v1/groups/${groupId}/ledger?limit=100&sort=created_at`).catch(() => ({ items: [] }))
    ]).then(([d, s, p, b, ledger]) => {
      if (cancel) return;
      setDetail(d);
      setSummary(s);
      setPlan(p);
      setBreakdown(b || []);
      setLedgerItems(ledger?.items || []);
      setE(null);
    }).catch((err) => {
      if (!cancel) setE(err);
    });
    return () => {
      cancel = true;
    };
  }, [groupId]);
  if (!detail) return /* @__PURE__ */ React.createElement(Text7, { size: "sm", c: "dimmed" }, t("common.loading"), /* @__PURE__ */ React.createElement(Err, { e }));
  const c = detail.currency;
  const members = detail.members || [];
  const rows = summary || [];
  const totalPaid = rows.reduce((a, m) => a + m.total_paid_cents, 0);
  const totalShare = rows.reduce((a, m) => a + m.total_share_cents, 0);
  const paidRows = [...rows].sort((a, b) => b.total_paid_cents - a.total_paid_cents).map((m) => ({ key: m.user_id, label: m.display_name, value: m.total_paid_cents, total_paid_cents: m.total_paid_cents }));
  const shareRows = [...rows].sort((a, b) => b.total_share_cents - a.total_share_cents).map((m) => ({ key: m.user_id, label: m.display_name, value: m.total_share_cents, total_share_cents: m.total_share_cents }));
  const categoryRows = [...breakdown].map((b) => {
    const cat = String(b.category || "other").trim().toLowerCase() || "other";
    const nameKey = `forms.expense.cat.${cat}`;
    const translated = t(nameKey);
    const name = translated === nameKey ? b.category || t("forms.expense.cat.other") : translated;
    return {
      key: cat,
      label: name,
      count: b.expense_count,
      value: b.paid_cents,
      paid_cents: b.paid_cents
    };
  }).sort((a, b) => b.value - a.value);
  const categoryTotal = breakdown.reduce((a, b) => a + b.paid_cents, 0);
  const reporterName = user?.display_name || user?.username || "";
  const runPrint = () => {
    const prev = document.title;
    document.title = t("report.docTitle", { name: detail.name });
    window.print();
    document.title = prev;
  };
  return /* @__PURE__ */ React.createElement("div", { id: "group-report", className: "report-panel" }, /* @__PURE__ */ React.createElement("div", { className: "report-screen no-print" }, /* @__PURE__ */ React.createElement("div", { className: "report-panel-head" }, /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement(Text7, { className: "report-panel-kicker" }, t("report.title")), !embedded && /* @__PURE__ */ React.createElement(Text7, { size: "sm", fw: 600 }, detail.name)), !embedded && /* @__PURE__ */ React.createElement(Button3, { size: "xs", variant: "light", radius: "xl", onClick: runPrint }, t("report.print"))), /* @__PURE__ */ React.createElement(Err, { e }), /* @__PURE__ */ React.createElement("div", { className: `report-metrics${detail.budget ? " has-budget" : ""}` }, /* @__PURE__ */ React.createElement(
    SettlementBox,
    {
      groupId,
      currency: c,
      members,
      plan,
      onPay
    }
  ), /* @__PURE__ */ React.createElement("div", { className: "report-metric" }, /* @__PURE__ */ React.createElement("span", { className: "report-metric-label" }, t("report.totalPaid")), /* @__PURE__ */ React.createElement("span", { className: "report-metric-value" }, fmt(totalPaid, c))), /* @__PURE__ */ React.createElement("div", { className: "report-metric" }, /* @__PURE__ */ React.createElement("span", { className: "report-metric-label" }, t("report.totalShare")), /* @__PURE__ */ React.createElement("span", { className: "report-metric-value" }, fmt(totalShare, c))), /* @__PURE__ */ React.createElement("div", { className: "report-metric" }, /* @__PURE__ */ React.createElement("span", { className: "report-metric-label" }, t("common.members")), /* @__PURE__ */ React.createElement("span", { className: "report-metric-value" }, members.length), /* @__PURE__ */ React.createElement("span", { className: "report-metric-sub" }, detail.mode || "shared", " \xB7 ", c)), detail.budget && /* @__PURE__ */ React.createElement("div", { className: `report-metric${detail.budget.over ? " is-alert" : ""}` }, /* @__PURE__ */ React.createElement("span", { className: "report-metric-label" }, t("report.budget")), /* @__PURE__ */ React.createElement("span", { className: "report-metric-value" }, detail.budget.pct, "%"), /* @__PURE__ */ React.createElement("span", { className: "report-metric-sub" }, fmt(detail.budget.spent_cents, c), " / ", fmt(detail.budget.budget_cents, c)))), /* @__PURE__ */ React.createElement("section", { className: "report-card" }, /* @__PURE__ */ React.createElement("div", { className: "report-settle-head" }, /* @__PURE__ */ React.createElement("h3", { className: "report-card-title" }, t("report.settlement")), (plan?.transfers || []).length > 0 && /* @__PURE__ */ React.createElement("span", { className: "report-settle-count" }, t(
    plan.transfers.length === 1 ? "report.transferCountOne" : "report.transferCount",
    { count: plan.transfers.length }
  ))), (plan?.transfers || []).length === 0 ? /* @__PURE__ */ React.createElement("div", { className: "report-settle-empty" }, /* @__PURE__ */ React.createElement("span", { className: "report-settle-empty-icon", "aria-hidden": true }, "\u2713"), /* @__PURE__ */ React.createElement(Text7, { size: "sm" }, t("report.allSettled"))) : /* @__PURE__ */ React.createElement("ul", { className: "report-settle-list" }, (plan?.transfers || []).map((xfer, i) => /* @__PURE__ */ React.createElement("li", { key: i, className: "report-settle-row" }, /* @__PURE__ */ React.createElement("span", { className: "report-settle-step", "aria-hidden": true }, i + 1), /* @__PURE__ */ React.createElement("div", { className: "report-settle-people" }, /* @__PURE__ */ React.createElement("span", { className: "report-settle-name" }, displayNameOf(members, xfer.from_user_id)), /* @__PURE__ */ React.createElement("span", { className: "report-settle-arrow", "aria-hidden": true }, "\u2192"), /* @__PURE__ */ React.createElement("span", { className: "report-settle-name" }, displayNameOf(members, xfer.to_user_id))), /* @__PURE__ */ React.createElement("span", { className: "report-settle-amt" }, fmt(xfer.amount_cents, c)), onPay && /* @__PURE__ */ React.createElement(
    Button3,
    {
      size: "compact-xs",
      variant: "light",
      color: "teal",
      className: "report-settle-pay",
      onClick: () => onPay(xfer)
    },
    t("groupDetail.pay")
  )))), /* @__PURE__ */ React.createElement(Text7, { size: "xs", c: "dimmed", mt: "sm", className: "report-settle-meta" }, t("report.generated", { when: (/* @__PURE__ */ new Date()).toLocaleString() }))), /* @__PURE__ */ React.createElement("div", { className: "report-charts-row" }, /* @__PURE__ */ React.createElement("section", { className: "report-card" }, /* @__PURE__ */ React.createElement("h3", { className: "report-card-title" }, t("report.paidVsShare")), /* @__PURE__ */ React.createElement(PaidShareBars, { summary: rows, currency: c })), /* @__PURE__ */ React.createElement("section", { className: "report-card" }, /* @__PURE__ */ React.createElement("h3", { className: "report-card-title" }, t("report.whoPaid")), /* @__PURE__ */ React.createElement(MoneyDonut, { rows: paidRows, valueKey: "total_paid_cents", currency: c, emptyLabel: t("report.noPayments") })), /* @__PURE__ */ React.createElement("section", { className: "report-card" }, /* @__PURE__ */ React.createElement("h3", { className: "report-card-title" }, t("report.whoOwesShare")), /* @__PURE__ */ React.createElement(MoneyDonut, { rows: shareRows, valueKey: "total_share_cents", currency: c, emptyLabel: t("report.noShares") }))), /* @__PURE__ */ React.createElement("section", { className: "report-card" }, /* @__PURE__ */ React.createElement("h3", { className: "report-card-title" }, t("report.perPerson")), /* @__PURE__ */ React.createElement(Box5, { hiddenFrom: "sm" }, /* @__PURE__ */ React.createElement("div", { className: "report-person-list" }, rows.map((m) => {
    const tone = netTone(m.net_cents);
    const color = chartColorFor(m.user_id);
    return /* @__PURE__ */ React.createElement("div", { key: m.user_id, className: "report-person" }, /* @__PURE__ */ React.createElement("div", { className: "report-person-top" }, /* @__PURE__ */ React.createElement("div", { className: "report-member" }, /* @__PURE__ */ React.createElement(
      Avatar2,
      {
        className: "report-member-avatar",
        radius: "xl",
        size: 28,
        style: { background: color, color: "#fff" }
      },
      initialsOf(m.display_name)
    ), /* @__PURE__ */ React.createElement(Text7, { size: "sm", fw: 700 }, m.display_name)), /* @__PURE__ */ React.createElement("span", { className: `report-net is-${tone}` }, netLabel(m.net_cents, c, t("common.settled")))), /* @__PURE__ */ React.createElement("div", { className: "report-person-meta" }, /* @__PURE__ */ React.createElement("span", null, t("report.paid"), " ", /* @__PURE__ */ React.createElement("b", null, fmt(m.total_paid_cents, c))), /* @__PURE__ */ React.createElement("span", null, t("report.share"), " ", /* @__PURE__ */ React.createElement("b", null, fmt(m.total_share_cents, c)))));
  }))), /* @__PURE__ */ React.createElement(Box5, { visibleFrom: "sm" }, /* @__PURE__ */ React.createElement(Table3, { className: "report-table", withTableBorder: false, withColumnBorders: false, withRowBorders: false, horizontalSpacing: "md", verticalSpacing: "sm" }, /* @__PURE__ */ React.createElement(Table3.Thead, null, /* @__PURE__ */ React.createElement(Table3.Tr, null, /* @__PURE__ */ React.createElement(Table3.Th, null, t("report.member")), /* @__PURE__ */ React.createElement(Table3.Th, null, t("report.paid")), /* @__PURE__ */ React.createElement(Table3.Th, null, t("report.share")), /* @__PURE__ */ React.createElement(Table3.Th, null, t("report.net")))), /* @__PURE__ */ React.createElement(Table3.Tbody, null, rows.map((m) => {
    const tone = netTone(m.net_cents);
    const color = chartColorFor(m.user_id);
    return /* @__PURE__ */ React.createElement(Table3.Tr, { key: m.user_id }, /* @__PURE__ */ React.createElement(Table3.Td, null, /* @__PURE__ */ React.createElement("div", { className: "report-member" }, /* @__PURE__ */ React.createElement(
      Avatar2,
      {
        className: "report-member-avatar",
        radius: "xl",
        size: 30,
        style: { background: color, color: "#fff" }
      },
      initialsOf(m.display_name)
    ), /* @__PURE__ */ React.createElement("span", { className: "report-member-name" }, m.display_name))), /* @__PURE__ */ React.createElement(Table3.Td, { className: "report-td-num" }, fmt(m.total_paid_cents, c)), /* @__PURE__ */ React.createElement(Table3.Td, { className: "report-td-num" }, fmt(m.total_share_cents, c)), /* @__PURE__ */ React.createElement(Table3.Td, null, /* @__PURE__ */ React.createElement("span", { className: `report-net is-${tone}` }, netLabel(m.net_cents, c, t("common.settled")))));
  }))))), /* @__PURE__ */ React.createElement("section", { className: "report-card" }, /* @__PURE__ */ React.createElement("h3", { className: "report-card-title" }, t("report.byCategory")), categoryRows.length > 0 ? /* @__PURE__ */ React.createElement("div", { className: "report-category" }, /* @__PURE__ */ React.createElement("div", { className: "report-category-chart" }, /* @__PURE__ */ React.createElement(
    MoneyDonut,
    {
      rows: categoryRows,
      valueKey: "paid_cents",
      currency: c,
      emptyLabel: t("report.noCategoriesYet"),
      hideLegend: true,
      size: 180
    }
  )), /* @__PURE__ */ React.createElement("div", { className: "report-cat-panel", role: "list" }, categoryRows.map((row) => {
    const pct = categoryTotal > 0 ? Math.round(row.value / categoryTotal * 100) : 0;
    return /* @__PURE__ */ React.createElement("div", { key: row.key, className: "report-cat-row", role: "listitem" }, /* @__PURE__ */ React.createElement("span", { className: "report-cat-swatch", style: { background: chartColorFor(row.key) }, "aria-hidden": true }), /* @__PURE__ */ React.createElement("div", { className: "report-cat-copy" }, /* @__PURE__ */ React.createElement("div", { className: "report-cat-head" }, /* @__PURE__ */ React.createElement("span", { className: "report-cat-name" }, row.label), /* @__PURE__ */ React.createElement("span", { className: "report-cat-count" }, t(row.count === 1 ? "report.catCountOne" : "report.catCount", { count: row.count }))), /* @__PURE__ */ React.createElement("div", { className: "report-cat-track", "aria-hidden": true }, /* @__PURE__ */ React.createElement("span", { className: "report-cat-fill", style: { width: `${pct}%`, background: chartColorFor(row.key) } }))), /* @__PURE__ */ React.createElement("div", { className: "report-cat-nums" }, /* @__PURE__ */ React.createElement("span", { className: "report-cat-amount" }, fmt(row.value, c)), /* @__PURE__ */ React.createElement("span", { className: "report-cat-pct" }, pct, "%")));
  }), /* @__PURE__ */ React.createElement("div", { className: "report-cat-row is-total", role: "listitem" }, /* @__PURE__ */ React.createElement("span", { className: "report-cat-swatch is-total", "aria-hidden": true }), /* @__PURE__ */ React.createElement("div", { className: "report-cat-copy" }, /* @__PURE__ */ React.createElement("span", { className: "report-cat-name" }, t("common.total"))), /* @__PURE__ */ React.createElement("div", { className: "report-cat-nums" }, /* @__PURE__ */ React.createElement("span", { className: "report-cat-amount" }, fmt(categoryTotal, c)), /* @__PURE__ */ React.createElement("span", { className: "report-cat-pct" }, "100%"))))) : /* @__PURE__ */ React.createElement(Text7, { size: "sm", c: "dimmed" }, t("report.noCategories"))), categoryManager), /* @__PURE__ */ React.createElement(
    ReportPrintDoc,
    {
      detail,
      summary: rows,
      plan,
      breakdown,
      ledgerItems,
      reporterName,
      generatedAt
    }
  ));
}

// src/pages/GroupDetail.jsx
var CAT_TILE = {
  food: ["\u{1F35C}", "#0ea5e9"],
  transport: ["\u{1F695}", "#8b5cf6"],
  stay: ["\u{1F3E0}", "#f59e0b"],
  activity: ["\u{1F39F}", "#ec4899"],
  shopping: ["\u{1F6CD}", "#10b981"],
  health: ["\u{1F48A}", "#ef4444"],
  bills: ["\u{1F4A1}", "#f59e0b"],
  other: ["\u{1F9FE}", "#0d9488"]
};
function tileFor(t) {
  if (t.kind === "payment") return ["\u{1F4B8}", "#0f172a"];
  const hit = CAT_TILE[t.category] || CAT_TILE.other;
  if (t.has_image) return ["\u{1F9FE}", hit[1]];
  return hit;
}
function GroupDetail() {
  const t = useT();
  const { user } = useAuth();
  const { id } = useParams3();
  const nav = useNavigate3();
  const [detail, setDetail] = useState8(null);
  const [ledger, setLedger] = useState8(null);
  const [ledgerLoading, setLedgerLoading] = useState8(false);
  const [summary, setSummary] = useState8(null);
  const [me, setMe] = useState8(null);
  const [plan, setPlan] = useState8(null);
  const [type, setType] = useState8("all");
  const [q, setQ] = useState8("");
  const [payer, setPayer] = useState8("");
  const [fStatus, setFStatus] = useState8("");
  const [fCat, setFCat] = useState8("");
  const [fMin, setFMin] = useState8("");
  const [fMax, setFMax] = useState8("");
  const [fFrom, setFFrom] = useState8("");
  const [fTo, setFTo] = useState8("");
  const [fSort, setFSort] = useState8("newest");
  const [showF, setShowF] = useState8(false);
  const activeFilters = [payer, fStatus, fCat, fMin, fMax, fFrom, fTo].filter((v) => v !== "").length + (fSort === "newest" ? 0 : 1);
  const [activity, setActivity] = useState8([]);
  const [payHist, setPayHist] = useState8([]);
  const [activityPage, setActivityPage] = useState8(1);
  const ACTIVITY_PAGE_SIZE = 10;
  const [rules, setRules] = useState8([]);
  const [categories, setCategories] = useState8([]);
  const [catBusy, setCatBusy] = useState8(false);
  const [categoryModalOpen, setCategoryModalOpen] = useState8(false);
  const [categoryTarget, setCategoryTarget] = useState8(null);
  const [categoryName, setCategoryName] = useState8("");
  const [categoryDeleteTarget, setCategoryDeleteTarget] = useState8(null);
  const [renameOpen, setRenameOpen] = useState8(false);
  const [renName, setRenName] = useState8("");
  const [renaming, setRenaming] = useState8(false);
  const [showExp, setShowExp] = useState8(false);
  const [editOpen, setEditOpen] = useState8(false);
  const [editExisting, setEditExisting] = useState8(null);
  const [editBusy, setEditBusy] = useState8(false);
  const [payOpen, setPayOpen] = useState8(false);
  const [payPreset, setPayPreset] = useState8(null);
  const [shareOpen, setShareOpen] = useState8(false);
  const [leaveOpen, setLeaveOpen] = useState8(false);
  const [deleteOpen, setDeleteOpen] = useState8(false);
  const [leaveBusy, setLeaveBusy] = useState8(false);
  const [deleteBusy, setDeleteBusy] = useState8(false);
  const [removeOpen, setRemoveOpen] = useState8(false);
  const [removeBusy, setRemoveBusy] = useState8(false);
  const [removeTarget, setRemoveTarget] = useState8(null);
  const [inviteOpen, setInviteOpen] = useState8(false);
  const [inviteTab, setInviteTab] = useState8("email");
  const [inviteEmails, setInviteEmails] = useState8("");
  const [inviteBusy, setInviteBusy] = useState8(false);
  const [inviteLinkLive, setInviteLinkLive] = useState8("");
  const [rotateBusy, setRotateBusy] = useState8(false);
  const [contactQ, setContactQ] = useState8("");
  const [contacts, setContacts] = useState8([]);
  const [contactBusy, setContactBusy] = useState8(false);
  const [newSheetOpen, setNewSheetOpen] = useState8(false);
  const [activityLoading, setActivityLoading] = useState8(false);
  const ledgerReq = useRef2(0);
  const [e, setE] = useState8(null);
  const isMobile = useMediaQuery2("(max-width: 36em)");
  const location = useLocation3();
  const [copyFrom, setCopyFrom] = useState8(() => location.state?.copyFrom ?? null);
  const ALL_TABS = ["ledger", "balances", "statement", "people", "activity", "recurring"];
  const [tab, setTab] = useState8("ledger");
  useEffect8(() => {
    let t2 = location.state?.tab;
    if (t2 === "payments") t2 = "activity";
    if (t2 === "report") {
      setTimeout(() => {
        document.getElementById("group-report")?.scrollIntoView({ behavior: "smooth", block: "start" });
      }, 80);
      return;
    }
    if (t2 && ALL_TABS.includes(t2)) {
      setTab(t2);
      if (t2 === "activity") {
        loadActivityFeed();
      }
    }
  }, [location.state]);
  useEffect8(() => {
    if (location.state?.copyFrom) {
      setCopyFrom(location.state.copyFrom);
      setShowExp(true);
      nav(location.pathname, { replace: true });
    }
  }, []);
  const validId = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id || "");
  const loadCategories = async () => {
    if (!validId) return;
    try {
      const rows = await api.get(`/api/v1/groups/${id}/categories`);
      const list = Array.isArray(rows) ? rows : [];
      setCategories(list);
    } catch (err) {
      setE(err);
    }
  };
  const load = async () => {
    if (!validId) {
      setE({ message: t("errors.invalidGroupLink") });
      return;
    }
    try {
      const [d, m, s, p] = await Promise.all([
        api.get(`/api/v1/groups/${id}`),
        api.get(`/api/v1/groups/${id}/me`),
        api.get(`/api/v1/groups/${id}/summary`),
        api.get(`/api/v1/groups/${id}/settlement`).catch(() => null)
      ]);
      setDetail(d);
      setMe(m);
      setSummary(s);
      setPlan(p);
      setE(null);
      loadCategories();
    } catch (err) {
      setE(err);
    }
  };
  const loadLedger = async () => {
    if (!validId) return;
    const req2 = ++ledgerReq.current;
    setLedgerLoading(true);
    try {
      const params = new URLSearchParams({ type, q, limit: "100" });
      if (payer) params.set("payer_id", payer);
      if (fStatus) params.set("status", fStatus);
      if (fCat) params.set("category", fCat);
      if (fMin !== "") params.set("min_amount", String(Math.round(Number(fMin) * 100)));
      if (fMax !== "") params.set("max_amount", String(Math.round(Number(fMax) * 100)));
      if (fFrom) params.set("from_date", (/* @__PURE__ */ new Date(`${fFrom}T00:00:00Z`)).toISOString());
      if (fTo) params.set("to_date", (/* @__PURE__ */ new Date(`${fTo}T23:59:59Z`)).toISOString());
      if (fSort === "oldest") params.set("sort", "created_at");
      const res = await api.get(`/api/v1/groups/${id}/ledger?${params.toString()}`);
      const items = res?.items || [];
      const missing = items.filter((it) => it.kind === "expense" && !it.category);
      if (missing.length > 0) {
        const pairs = await Promise.all(missing.map(async (it) => {
          try {
            const d = await api.get(`/api/v1/expenses/${it.id}`);
            return [it.id, d?.expense?.category || null];
          } catch {
            return [it.id, null];
          }
        }));
        const byId = Object.fromEntries(pairs);
        res.items = items.map((it) => byId[it.id] ? { ...it, category: byId[it.id] } : it);
      }
      if (req2 === ledgerReq.current) setLedger(res);
    } catch (err) {
      setE(err);
    } finally {
      if (req2 === ledgerReq.current) setLedgerLoading(false);
    }
  };
  const loadActivity = async () => {
    setActivityLoading(true);
    try {
      setActivity(await api.get(`/api/v1/groups/${id}/activity?limit=50`));
    } catch (err) {
      setE(err);
    } finally {
      setActivityLoading(false);
    }
  };
  const loadPayHist = async () => {
    try {
      const r = await api.get(`/api/v1/groups/${id}/ledger?type=payment&limit=100`);
      setPayHist(r.items || []);
    } catch {
    }
  };
  const loadActivityFeed = async () => {
    setActivityPage(1);
    await Promise.all([loadActivity(), loadPayHist(), loadRules()]);
  };
  const loadRules = async () => {
    try {
      setRules(await api.get(`/api/v1/groups/${id}/recurring`));
    } catch (err) {
      setE(err);
    }
  };
  const loadSummary = async () => {
    if (!validId) return;
    try {
      const [s, p] = await Promise.all([
        api.get(`/api/v1/groups/${id}/summary`),
        api.get(`/api/v1/groups/${id}/settlement`).catch(() => null)
      ]);
      setSummary(s);
      setPlan(p);
    } catch (err) {
      setE(err);
    }
  };
  useEffect8(() => {
    load();
  }, [id]);
  useEffect8(() => {
    loadLedger();
  }, [id, type]);
  const qTimer = useRef2(null);
  useEffect8(() => {
    if (!isMobile) return;
    if (qTimer.current) clearTimeout(qTimer.current);
    qTimer.current = setTimeout(() => {
      loadLedger();
    }, 600);
    return () => {
      if (qTimer.current) clearTimeout(qTimer.current);
    };
  }, [q]);
  const members = detail?.members || [];
  const remove = (uid, name) => {
    setRemoveTarget({ uid, name });
    setE(null);
    setRemoveOpen(true);
  };
  const confirmRemove = async () => {
    if (!removeTarget) return;
    setRemoveBusy(true);
    try {
      await api.del(`/api/v1/groups/${id}/members/${removeTarget.uid}`);
      setRemoveOpen(false);
      setRemoveTarget(null);
      load();
    } catch (err) {
      setRemoveOpen(false);
      setRemoveTarget(null);
      setE(err);
    } finally {
      setRemoveBusy(false);
    }
  };
  const leave = () => setLeaveOpen(true);
  const delGroup = () => setDeleteOpen(true);
  const confirmLeave = async () => {
    setLeaveBusy(true);
    try {
      await api.post(`/api/v1/groups/${id}/leave`, {});
      setLeaveOpen(false);
      nav("/");
    } catch (err) {
      setLeaveOpen(false);
      setE(err);
    } finally {
      setLeaveBusy(false);
    }
  };
  const confirmDelete = async () => {
    setDeleteBusy(true);
    try {
      await api.del(`/api/v1/groups/${id}`);
      setDeleteOpen(false);
      nav("/");
    } catch (err) {
      setDeleteOpen(false);
      setE(err);
    } finally {
      setDeleteBusy(false);
    }
  };
  const canEditExpense = (item) => {
    if (!item || item.kind !== "expense") return false;
    if (String(item.status || "").toUpperCase() === "LOCKED") return false;
    const role = detail?.my_role;
    if (role === "owner" || role === "treasurer") return true;
    const me2 = user?.user_id;
    return !!(me2 && item.created_by && item.created_by === me2);
  };
  const copyExpense = async (item) => {
    try {
      const d = await api.get(`/api/v1/expenses/${item.id}`);
      nav(`/groups/${id}`, { state: { copyFrom: d.expense } });
      setCopyFrom(d.expense);
      setShowExp(true);
    } catch (err) {
      setE(err);
    }
  };
  const editExpense = async (item) => {
    if (!canEditExpense(item) || editBusy) return;
    setEditBusy(true);
    setE(null);
    try {
      const d = await api.get(`/api/v1/expenses/${item.id}`);
      setEditExisting(d.expense);
      setEditOpen(true);
    } catch (err) {
      setE(err);
    } finally {
      setEditBusy(false);
    }
  };
  const closeEdit = () => {
    setEditOpen(false);
    setEditExisting(null);
  };
  const nudge = async (uid, name) => {
    try {
      await api.post(`/api/v1/groups/${id}/nudges`, { user_ids: [uid] });
      notifications2.show({ title: t("groupDetail.nudged", { name }), color: "teal" });
      loadActivity();
    } catch (err) {
      setE(err);
    }
  };
  const reversePay = async (pid) => {
    try {
      await api.post(`/api/v1/payments/${pid}/reverse`, {});
      notifications2.show({ title: t("groupDetail.paymentReversed"), color: "teal" });
      load();
      loadLedger();
      loadSummary();
      loadActivityFeed();
    } catch (err) {
      setE(err);
    }
  };
  const setRole = async (uid, role) => {
    try {
      await api.patch(`/api/v1/groups/${id}/members/${uid}`, { role });
      notifications2.show({ title: t("groupDetail.roleUpdated", { role }), color: "teal" });
      load();
    } catch (err) {
      setE(err);
    }
  };
  const setDeposit = async (uid, paid) => {
    try {
      await api.patch(`/api/v1/groups/${id}/members/${uid}/deposit`, { paid });
      load();
    } catch (err) {
      setE(err);
    }
  };
  const openAddCategory = () => {
    setCategoryTarget(null);
    setCategoryName("");
    setE(null);
    setCategoryModalOpen(true);
  };
  const openEditCategory = (category) => {
    setCategoryTarget(category);
    setCategoryName(category.name);
    setE(null);
    setCategoryModalOpen(true);
  };
  const saveCategory = async (ev) => {
    ev.preventDefault();
    const name = categoryName.trim();
    if (!name) return;
    setCatBusy(true);
    setE(null);
    try {
      if (categoryTarget) {
        await api.patch(`/api/v1/groups/${id}/categories/${categoryTarget.category_id}`, { name });
      } else {
        await api.post(`/api/v1/groups/${id}/categories`, { name });
      }
      await loadCategories();
      setCategoryModalOpen(false);
      notifications2.show({ message: t(categoryTarget ? "groupDetail.categorySaved" : "groupDetail.categoryAdded"), color: "teal" });
    } catch (err) {
      setE(err);
    } finally {
      setCatBusy(false);
    }
  };
  const confirmDeleteCategory = async () => {
    if (!categoryDeleteTarget) return;
    setCatBusy(true);
    setE(null);
    try {
      await api.del(`/api/v1/groups/${id}/categories/${categoryDeleteTarget.category_id}`);
      await loadCategories();
      setCategoryDeleteTarget(null);
      notifications2.show({ message: t("groupDetail.categoryDeleted"), color: "teal" });
    } catch (err) {
      setE(err);
    } finally {
      setCatBusy(false);
    }
  };
  const exportPdf = () => {
    const prev = document.title;
    if (detail?.name) document.title = t("report.docTitle", { name: detail.name });
    document.getElementById("group-report-print")?.scrollIntoView({ behavior: "smooth", block: "start" });
    window.setTimeout(() => {
      window.print();
      document.title = prev;
    }, 180);
  };
  const inviteByEmail = async (ev) => {
    ev.preventDefault();
    const list = inviteEmails.split(/[\s,;]+/).map((s) => s.trim()).filter(Boolean);
    if (list.length === 0) {
      setE({ message: t("errors.needEmail") });
      return;
    }
    setInviteBusy(true);
    try {
      const r = await api.post(`/api/v1/groups/${id}/invites`, { emails: list });
      notifications2.show({
        title: t("invite.sent"),
        message: `added: ${(r.added || []).join(", ") || "\u2014"} \xB7 pending: ${(r.pending || []).join(", ") || "\u2014"}`,
        color: "teal"
      });
      setInviteEmails("");
      setE(null);
      load();
    } catch (err) {
      setE(err);
    } finally {
      setInviteBusy(false);
    }
  };
  const searchContacts = async (ev) => {
    ev?.preventDefault?.();
    setContactBusy(true);
    try {
      setContacts(await api.get(`/api/v1/contacts?q=${encodeURIComponent(contactQ)}`));
      setE(null);
    } catch (err) {
      setE(err);
    } finally {
      setContactBusy(false);
    }
  };
  const addFromContact = async (uid, name) => {
    try {
      await api.post(`/api/v1/groups/${id}/members`, { user_ids: [uid] });
      notifications2.show({ title: t("invite.memberAdded", { name }), color: "teal" });
      setContacts((prev) => prev.filter((c) => c.user_id !== uid));
      load();
    } catch (err) {
      setE(err);
    }
  };
  const rotateInviteLink = async () => {
    setRotateBusy(true);
    try {
      const r = await api.post(`/api/v1/groups/${id}/rotate-invite`, {});
      const next = r.invite_link || "";
      setInviteLinkLive(next);
      await load();
      notifications2.show({
        title: t("invite.rotated"),
        message: t("invite.rotatedHint"),
        color: "teal"
      });
      setE(null);
    } catch (err) {
      setE(err);
    } finally {
      setRotateBusy(false);
    }
  };
  const openInvite = (tab2 = "email") => {
    setInviteTab(tab2);
    setInviteLinkLive(detail?.invite_link || "");
    setInviteOpen(true);
  };
  const openRename = () => {
    setRenName(detail?.name || "");
    setRenameOpen(true);
  };
  const saveRename = async (ev) => {
    ev.preventDefault();
    const next = renName.trim();
    if (!next || next === detail?.name) {
      setRenameOpen(false);
      return;
    }
    setRenaming(true);
    try {
      await api.patch(`/api/v1/groups/${id}`, { name: next });
      setRenameOpen(false);
      await load();
      notifications2.show({ title: t("groupDetail.groupRenamed"), color: "teal" });
      setE(null);
    } catch (err) {
      setE(err);
    } finally {
      setRenaming(false);
    }
  };
  const totals = useMemo2(() => {
    const items = ledger?.items || [];
    return {
      amount: items.reduce((a, t2) => a + (t2.amount_cents || 0), 0),
      mine: items.reduce((a, t2) => a + (t2.my_share_cents || 0), 0)
    };
  }, [ledger]);
  const payments = useMemo2(
    () => (ledger?.items || []).filter((t2) => t2.kind === "payment"),
    [ledger]
  );
  const activityFeed = useMemo2(() => {
    const payRows = (payHist.length > 0 ? payHist : payments).map((p) => ({
      key: `pay-${p.id}`,
      sortAt: p.created_at,
      kind: "payment",
      payment: p
    }));
    const actRows = (activity || []).filter((a) => a.kind !== "payment").map((a, i) => ({
      key: `act-${a.kind}-${a.at}-${i}`,
      sortAt: a.at,
      kind: a.kind,
      activity: a
    }));
    return [...payRows, ...actRows].sort((a, b) => new Date(b.sortAt) - new Date(a.sortAt));
  }, [payHist, payments, activity]);
  const activityPageCount = Math.max(1, Math.ceil(activityFeed.length / ACTIVITY_PAGE_SIZE));
  const activityPageSafe = Math.min(activityPage, activityPageCount);
  const activitySlice = useMemo2(() => {
    const start = (activityPageSafe - 1) * ACTIVITY_PAGE_SIZE;
    return activityFeed.slice(start, start + ACTIVITY_PAGE_SIZE);
  }, [activityFeed, activityPageSafe]);
  useEffect8(() => {
    if (activityPage > activityPageCount) setActivityPage(activityPageCount);
  }, [activityPage, activityPageCount]);
  const transfers = plan?.transfers || [];
  const byDebtor = useMemo2(() => {
    const m = /* @__PURE__ */ new Map();
    for (const t2 of transfers) {
      if (!m.has(t2.from_user_id)) m.set(t2.from_user_id, []);
      m.get(t2.from_user_id).push(t2);
    }
    return [...m.entries()];
  }, [transfers]);
  const debtors = useMemo2(
    () => (summary || []).filter((x) => x.owe_cents > 0),
    [summary]
  );
  const groupSettled = useMemo2(() => {
    if (plan) return (plan.transfers || []).length === 0;
    if (summary) return summary.every((m) => (m.net_cents || 0) === 0);
    return null;
  }, [plan, summary]);
  const groupStatusTone = groupSettled == null ? null : groupSettled ? "settled" : "open";
  const groupStatusLabel = groupSettled == null ? null : groupSettled ? t("settlement.statusSettled") : t("settlement.statusOpen");
  const groupStatusHint = groupSettled == null ? void 0 : groupSettled ? t("settlement.statusSettledHint") : t("settlement.statusOpenHint", {
    n: transfers.length || debtors.length || 0,
    saved: plan?.explanation?.saved ?? "\u2014"
  });
  if (!detail) {
    return /* @__PURE__ */ React.createElement(Shell, null, /* @__PURE__ */ React.createElement(Skeleton2, { height: 32, width: "60%", radius: "md" }), /* @__PURE__ */ React.createElement(Stack5, { gap: "md", mt: "md" }, /* @__PURE__ */ React.createElement(Skeleton2, { height: 52, radius: "md" }), /* @__PURE__ */ React.createElement(Skeleton2, { height: 180, radius: "md" }), /* @__PURE__ */ React.createElement(Skeleton2, { height: 120, radius: "md" })), /* @__PURE__ */ React.createElement(Err, { e }));
  }
  const heroPastel = pastelFor(detail.name);
  return /* @__PURE__ */ React.createElement(Shell, null, /* @__PURE__ */ React.createElement("div", { className: "gd-chrome" }, /* @__PURE__ */ React.createElement(Anchor3, { component: Link4, to: "/groups", size: "sm", className: "gd-back no-print" }, t("common.backToGroups")), /* @__PURE__ */ React.createElement(
    "div",
    {
      className: "gd-hero",
      style: {
        "--gt-from": heroPastel.from,
        "--gt-to": heroPastel.to
      }
    },
    /* @__PURE__ */ React.createElement("span", { className: "gd-hero-bg", "aria-hidden": true }),
    /* @__PURE__ */ React.createElement("span", { className: "gd-hero-scrim", "aria-hidden": true }),
    /* @__PURE__ */ React.createElement("div", { className: "gd-hero-bar" }, /* @__PURE__ */ React.createElement("div", { className: "gd-tags" }, detail.my_role === "owner" && /* @__PURE__ */ React.createElement("span", { className: "gd-tag is-owner" }, t("common.owner")), detail.my_role === "treasurer" && /* @__PURE__ */ React.createElement("span", { className: "gd-tag" }, t("common.treasurer")), /* @__PURE__ */ React.createElement("span", { className: "gd-tag" }, t("groupDetail.membersCount", {
      count: members.length,
      unit: members.length === 1 ? t("common.person") : t("common.people")
    })), /* @__PURE__ */ React.createElement("span", { className: "gd-tag" }, detail.currency), detail.mode && detail.mode !== "shared" && /* @__PURE__ */ React.createElement("span", { className: "gd-tag" }, detail.mode))),
    /* @__PURE__ */ React.createElement("div", { className: "gd-hero-main" }, /* @__PURE__ */ React.createElement("div", { className: "gd-title-row" }, /* @__PURE__ */ React.createElement(Title2, { order: 2, className: "gd-title", lineClamp: 1 }, detail.name), detail.my_role === "owner" && /* @__PURE__ */ React.createElement(
      ActionIcon3,
      {
        variant: "subtle",
        color: "gray",
        size: "sm",
        title: t("groupDetail.rename"),
        "aria-label": t("groupDetail.rename"),
        onClick: openRename,
        className: "gd-rename"
      },
      "\u270E"
    ), /* @__PURE__ */ React.createElement(
      ActionIcon3,
      {
        variant: "subtle",
        color: "gray",
        size: "sm",
        title: t("groupDetail.inviteLink"),
        "aria-label": t("groupDetail.inviteLink"),
        onClick: () => setShareOpen(true),
        className: "gd-rename"
      },
      /* @__PURE__ */ React.createElement(GdActionIcon, { name: "share" })
    )), /* @__PURE__ */ React.createElement("div", { className: "gd-net" }, groupStatusTone && /* @__PURE__ */ React.createElement("span", { className: `net-chip is-${groupStatusTone}`, title: groupStatusHint }, groupStatusLabel), plan?.version != null && /* @__PURE__ */ React.createElement("span", { className: "gd-settle-ver" }, t("report.settlementVer", { version: plan.version })))),
    detail.budget && /* @__PURE__ */ React.createElement("div", { className: "gd-budget" }, /* @__PURE__ */ React.createElement(Group7, { justify: "space-between", gap: "xs" }, /* @__PURE__ */ React.createElement(Text8, { size: "xs", c: "dimmed" }, "Budget ", fmt(detail.budget.spent_cents, detail.currency), " / ", fmt(detail.budget.budget_cents, detail.currency), " \xB7 ", detail.budget.over ? t("groupDetail.budgetOver") : detail.budget.alert ? t("groupDetail.budgetNear") : t("groupDetail.budgetOnTrack")), /* @__PURE__ */ React.createElement(Text8, { size: "xs", c: "dimmed" }, detail.budget.pct, "%")), /* @__PURE__ */ React.createElement(
      Progress,
      {
        value: Math.min(100, detail.budget.pct),
        color: detail.budget.over ? "red" : detail.budget.alert ? "orange" : "teal",
        size: "sm",
        radius: "xl",
        mt: 4,
        "aria-label": `Budget ${detail.budget.pct} percent`
      }
    ))
  ), /* @__PURE__ */ React.createElement(Err, { e })), /* @__PURE__ */ React.createElement(Stack5, { gap: "xl", mt: "md" }, isMobile ? /* @__PURE__ */ React.createElement("div", { className: "sticky-bar gd-actions is-calm" }, /* @__PURE__ */ React.createElement("button", { type: "button", className: "gd-action-cta", onClick: () => setNewSheetOpen(true) }, /* @__PURE__ */ React.createElement(GdActionIcon, { name: "plus" }), /* @__PURE__ */ React.createElement("span", null, t("groupDetail.addExpense"), " / ", t("groupDetail.payment"))), /* @__PURE__ */ React.createElement("div", { className: "gd-action-quiet" }, /* @__PURE__ */ React.createElement("button", { type: "button", className: "gd-action-ghost", onClick: () => openInvite("email") }, /* @__PURE__ */ React.createElement(GdActionIcon, { name: "invite" }), /* @__PURE__ */ React.createElement("span", null, t("groupDetail.inviteMembers"))), /* @__PURE__ */ React.createElement("button", { type: "button", className: "gd-action-ghost", onClick: exportPdf }, /* @__PURE__ */ React.createElement(GdActionIcon, { name: "export" }), /* @__PURE__ */ React.createElement("span", null, t("groupDetail.exportPdf")))), /* @__PURE__ */ React.createElement("details", { className: "gd-action-danger" }, /* @__PURE__ */ React.createElement("summary", null, t("groupDetail.groupSettings")), /* @__PURE__ */ React.createElement("div", { className: "gd-action-danger-opts" }, /* @__PURE__ */ React.createElement("button", { type: "button", onClick: leave }, /* @__PURE__ */ React.createElement(GdActionIcon, { name: "leave" }), /* @__PURE__ */ React.createElement("span", null, t("groupDetail.leaveGroup"))), detail.my_role === "owner" && /* @__PURE__ */ React.createElement("button", { type: "button", onClick: delGroup }, /* @__PURE__ */ React.createElement(GdActionIcon, { name: "trash" }), /* @__PURE__ */ React.createElement("span", null, t("groupDetail.deleteGroup")), /* @__PURE__ */ React.createElement("span", { className: "gd-action-owner" }, t("common.owner")))))) : /* @__PURE__ */ React.createElement("div", { className: "gd-actions" }, /* @__PURE__ */ React.createElement(
    "button",
    {
      type: "button",
      className: "gd-action-btn is-expense",
      onClick: () => setShowExp(true)
    },
    /* @__PURE__ */ React.createElement(GdActionIcon, { name: "expense" }),
    /* @__PURE__ */ React.createElement("span", null, t("groupDetail.addExpense"))
  ), /* @__PURE__ */ React.createElement(
    "button",
    {
      type: "button",
      className: "gd-action-btn is-pay",
      onClick: () => {
        setPayPreset(null);
        setPayOpen(true);
      }
    },
    /* @__PURE__ */ React.createElement(GdActionIcon, { name: "pay" }),
    /* @__PURE__ */ React.createElement("span", null, t("groupDetail.recordPayment"))
  ), /* @__PURE__ */ React.createElement("button", { type: "button", className: "gd-action-btn", onClick: exportPdf }, /* @__PURE__ */ React.createElement(GdActionIcon, { name: "export" }), /* @__PURE__ */ React.createElement("span", null, t("groupDetail.exportPdf"))), /* @__PURE__ */ React.createElement("button", { type: "button", className: "gd-action-btn", onClick: () => openInvite("email") }, /* @__PURE__ */ React.createElement(GdActionIcon, { name: "invite" }), /* @__PURE__ */ React.createElement("span", null, t("groupDetail.inviteMembers"))), /* @__PURE__ */ React.createElement("button", { type: "button", className: "gd-action-btn is-danger", onClick: leave }, /* @__PURE__ */ React.createElement(GdActionIcon, { name: "leave" }), /* @__PURE__ */ React.createElement("span", null, t("groupDetail.leaveGroup"))), detail.my_role === "owner" && /* @__PURE__ */ React.createElement("button", { type: "button", className: "gd-action-btn is-danger", onClick: delGroup }, /* @__PURE__ */ React.createElement(GdActionIcon, { name: "trash" }), /* @__PURE__ */ React.createElement("span", null, t("groupDetail.delete")))), /* @__PURE__ */ React.createElement("div", { className: "sticky-spacer" }), /* @__PURE__ */ React.createElement(
    ReportPanel,
    {
      groupId: id,
      detail,
      summary,
      embedded: true,
      onPay: (xfer) => {
        setPayPreset(xfer);
        setPayOpen(true);
      },
      categoryManager: /* @__PURE__ */ React.createElement(
        CategoryManager,
        {
          categories,
          t,
          onAdd: openAddCategory,
          onEdit: openEditCategory,
          onDelete: setCategoryDeleteTarget
        }
      )
    }
  ), /* @__PURE__ */ React.createElement(Card3, { withBorder: true, shadow: "sm", padding: "md", radius: "md", className: "gd-tabs" }, /* @__PURE__ */ React.createElement(Tabs, { value: tab, onChange: (v) => {
    let nv = v ?? "ledger";
    if (nv === "payments") nv = "activity";
    if (nv === "report") nv = "ledger";
    setTab(nv);
    if (nv === "activity") loadActivityFeed();
    if (nv === "recurring" && rules.length === 0) loadRules();
  } }, /* @__PURE__ */ React.createElement("div", { className: "tab-rail" }, /* @__PURE__ */ React.createElement(Tabs.List, { mb: "sm" }, /* @__PURE__ */ React.createElement(Tabs.Tab, { value: "ledger" }, ledger?.total != null ? t("groupDetail.tabExpensesCount", { count: ledger.total }) : t("groupDetail.tabExpenses")), /* @__PURE__ */ React.createElement(Tabs.Tab, { value: "balances" }, t("groupDetail.tabBalances")), /* @__PURE__ */ React.createElement(Tabs.Tab, { value: "statement" }, t("groupDetail.tabStatement")), /* @__PURE__ */ React.createElement(Tabs.Tab, { value: "people" }, t("groupDetail.tabPeople"), " (", members.length, ")"), /* @__PURE__ */ React.createElement(Tabs.Tab, { value: "activity" }, t("groupDetail.tabActivity")), /* @__PURE__ */ React.createElement(Tabs.Tab, { value: "recurring" }, t("groupDetail.tabRecurring")))), /* @__PURE__ */ React.createElement(Tabs.Panel, { value: "statement" }, /* @__PURE__ */ React.createElement(
    StatementPanel,
    {
      groupId: id,
      members,
      currency: detail.currency,
      embedded: true
    }
  )), /* @__PURE__ */ React.createElement(Tabs.Panel, { value: "ledger" }, /* @__PURE__ */ React.createElement(Box6, { visibleFrom: "sm" }, /* @__PURE__ */ React.createElement("form", { className: "ledger-toolbar", onSubmit: (ev) => {
    ev.preventDefault();
    loadLedger();
  } }, /* @__PURE__ */ React.createElement("div", { className: "ledger-toolbar-main" }, /* @__PURE__ */ React.createElement(
    SegmentedControl,
    {
      size: "xs",
      value: type,
      onChange: setType,
      data: [
        { value: "all", label: t("groupDetail.filterAll") },
        { value: "expense", label: t("groupDetail.filterExpenses") },
        { value: "payment", label: t("groupDetail.filterPayments") }
      ]
    }
  ), /* @__PURE__ */ React.createElement(
    TextInput2,
    {
      className: "ledger-toolbar-search",
      size: "xs",
      placeholder: t("groupDetail.searchItem"),
      value: q,
      onChange: (x) => setQ(x.target.value)
    }
  ), /* @__PURE__ */ React.createElement(
    Select4,
    {
      size: "xs",
      value: fSort,
      onChange: setFSort,
      data: [
        { value: "newest", label: t("common.newest") },
        { value: "oldest", label: t("common.oldest") }
      ],
      className: "ledger-toolbar-sort"
    }
  ), /* @__PURE__ */ React.createElement(Button4, { size: "xs", variant: "default", type: "submit", loading: ledgerLoading }, t("groupDetail.go"))), /* @__PURE__ */ React.createElement("div", { className: "ledger-toolbar-more" }, /* @__PURE__ */ React.createElement(
    Select4,
    {
      size: "xs",
      placeholder: t("groupDetail.filterPayer"),
      clearable: true,
      value: payer,
      onChange: (v) => setPayer(v || ""),
      data: members.map((m) => ({ value: m.user_id, label: m.display_name }))
    }
  ), /* @__PURE__ */ React.createElement(
    Select4,
    {
      size: "xs",
      placeholder: t("common.status"),
      clearable: true,
      value: fStatus,
      onChange: (v) => setFStatus(v || ""),
      data: [
        { value: "OPEN", label: t("groupDetail.statusOpen") },
        { value: "LOCKED", label: t("groupDetail.statusLocked") }
      ]
    }
  ), /* @__PURE__ */ React.createElement(
    Select4,
    {
      size: "xs",
      placeholder: t("common.category"),
      clearable: true,
      value: fCat,
      onChange: (v) => setFCat(v || ""),
      data: categorySelectData(categories, t)
    }
  ), /* @__PURE__ */ React.createElement(TextInput2, { size: "xs", placeholder: t("groupDetail.minAmount"), inputMode: "decimal", value: fMin, onChange: (x) => setFMin(x.target.value) }), /* @__PURE__ */ React.createElement(TextInput2, { size: "xs", placeholder: t("groupDetail.maxAmount"), inputMode: "decimal", value: fMax, onChange: (x) => setFMax(x.target.value) }), /* @__PURE__ */ React.createElement(TextInput2, { size: "xs", type: "date", "aria-label": t("common.from"), value: fFrom, onChange: (x) => setFFrom(x.target.value) }), /* @__PURE__ */ React.createElement(TextInput2, { size: "xs", type: "date", "aria-label": t("common.to"), value: fTo, onChange: (x) => setFTo(x.target.value) })))), /* @__PURE__ */ React.createElement(Box6, { hiddenFrom: "sm" }, /* @__PURE__ */ React.createElement(Group7, { gap: "xs", mb: "sm", wrap: "nowrap" }, /* @__PURE__ */ React.createElement(
    TextInput2,
    {
      size: "sm",
      placeholder: t("groupDetail.searchExpenses"),
      value: q,
      onChange: (x) => setQ(x.target.value),
      style: { flex: 1 },
      "aria-label": t("groupDetail.searchExpenses")
    }
  ), /* @__PURE__ */ React.createElement(Indicator, { label: activeFilters > 0 ? activeFilters : "", disabled: activeFilters === 0, size: 16 }, /* @__PURE__ */ React.createElement(
    ActionIcon3,
    {
      size: "lg",
      variant: "default",
      onClick: () => setShowF(!showF),
      title: t("common.filters"),
      "aria-label": activeFilters > 0 ? t("groupDetail.filtersActive", { count: activeFilters }) : t("common.filters"),
      "aria-expanded": showF
    },
    "\u29E9"
  ))), /* @__PURE__ */ React.createElement(Collapse, { in: showF }, /* @__PURE__ */ React.createElement(Stack5, { gap: "xs", mb: "sm" }, /* @__PURE__ */ React.createElement(
    SegmentedControl,
    {
      size: "xs",
      value: type,
      onChange: setType,
      data: [
        { value: "all", label: t("groupDetail.filterAll") },
        { value: "expense", label: t("groupDetail.filterExpenses") },
        { value: "payment", label: t("groupDetail.filterPayments") }
      ]
    }
  ), /* @__PURE__ */ React.createElement(
    Select4,
    {
      size: "sm",
      label: t("groupDetail.payerParty"),
      placeholder: t("common.anyone"),
      clearable: true,
      value: payer,
      onChange: (v) => setPayer(v || ""),
      data: members.map((m) => ({ value: m.user_id, label: m.display_name }))
    }
  ), /* @__PURE__ */ React.createElement(Group7, { gap: "xs", grow: true }, /* @__PURE__ */ React.createElement(
    Select4,
    {
      size: "sm",
      label: t("common.status"),
      placeholder: t("common.any"),
      clearable: true,
      value: fStatus,
      onChange: (v) => setFStatus(v || ""),
      data: [
        { value: "OPEN", label: t("groupDetail.statusOpen") },
        { value: "LOCKED", label: t("groupDetail.statusLocked") }
      ]
    }
  ), /* @__PURE__ */ React.createElement(
    Select4,
    {
      size: "sm",
      label: t("common.category"),
      placeholder: t("common.any"),
      clearable: true,
      value: fCat,
      onChange: (v) => setFCat(v || ""),
      data: categorySelectData(categories, t)
    }
  )), /* @__PURE__ */ React.createElement(Group7, { gap: "xs", grow: true }, /* @__PURE__ */ React.createElement(TextInput2, { size: "sm", label: t("groupDetail.minAmount"), inputMode: "decimal", value: fMin, onChange: (x) => setFMin(x.target.value) }), /* @__PURE__ */ React.createElement(TextInput2, { size: "sm", label: t("groupDetail.maxAmount"), inputMode: "decimal", value: fMax, onChange: (x) => setFMax(x.target.value) })), /* @__PURE__ */ React.createElement(Group7, { gap: "xs", grow: true }, /* @__PURE__ */ React.createElement(TextInput2, { size: "sm", label: t("common.from"), type: "date", value: fFrom, onChange: (x) => setFFrom(x.target.value) }), /* @__PURE__ */ React.createElement(TextInput2, { size: "sm", label: t("common.to"), type: "date", value: fTo, onChange: (x) => setFTo(x.target.value) })), /* @__PURE__ */ React.createElement(
    Select4,
    {
      size: "sm",
      label: t("common.sort"),
      value: fSort,
      onChange: setFSort,
      data: [
        { value: "newest", label: t("common.newest") },
        { value: "oldest", label: t("common.oldest") }
      ]
    }
  ), /* @__PURE__ */ React.createElement(Button4, { size: "sm", onClick: () => {
    setShowF(false);
    loadLedger();
  }, loading: ledgerLoading }, t("common.apply"))))), /* @__PURE__ */ React.createElement(Box6, { hiddenFrom: "sm" }, /* @__PURE__ */ React.createElement("div", { className: "ledger-list" }, (ledger?.items || []).map((item) => /* @__PURE__ */ React.createElement(
    "div",
    {
      key: item.id,
      className: `ledger-row${item.kind === "expense" ? " is-link" : ""}${item.reversed ? " is-reversed" : ""}`,
      tabIndex: item.kind === "expense" ? 0 : void 0,
      role: item.kind === "expense" ? "link" : void 0,
      "aria-label": item.kind === "expense" ? t("groupDetail.openItem", { title: item.title }) : void 0,
      onClick: item.kind === "expense" ? () => nav(`/groups/${id}/expenses/${item.id}`) : void 0,
      onKeyDown: item.kind === "expense" ? (ev) => {
        if (ev.key === "Enter" || ev.key === " ") {
          ev.preventDefault();
          nav(`/groups/${id}/expenses/${item.id}`);
        }
      } : void 0
    },
    /* @__PURE__ */ React.createElement(Avatar3, { className: "ledger-thumb", radius: "md", size: 40, style: { background: tileFor(item)[1] } }, tileFor(item)[0]),
    /* @__PURE__ */ React.createElement("div", { className: "ledger-copy" }, /* @__PURE__ */ React.createElement("span", { className: "ledger-title" }, item.title, item.has_image ? " \u{1F9FE}" : "", item.reversed ? ` (${t("common.reversed")})` : ""), /* @__PURE__ */ React.createElement("span", { className: "ledger-meta" }, item.kind === "expense" ? [
      item.category ? categoryLabelForKey(item.category, categories, t) : null,
      item.payer_name || displayNameOf(members, item.payer_id)
    ].filter(Boolean).join(" \xB7 ") : `${item.from_name || item.from_user_id?.slice(0, 8)} \u2192 ${item.to_name || item.to_user_id?.slice(0, 8)}`)),
    /* @__PURE__ */ React.createElement("div", { className: "ledger-amounts" }, /* @__PURE__ */ React.createElement("span", { className: "ledger-amount" }, fmt(item.amount_cents, detail.currency)), /* @__PURE__ */ React.createElement("span", { className: "ledger-meta" }, t("groupDetail.myShare"), " ", item.my_share_cents != null ? fmt(item.my_share_cents, detail.currency) : "\u2014"), /* @__PURE__ */ React.createElement("span", { className: `ledger-status is-${String(item.status || "").toLowerCase()}` }, item.status === "LOCKED" ? t("groupDetail.statusLocked") : t("groupDetail.statusOpen"))),
    item.kind === "expense" && /* @__PURE__ */ React.createElement("div", { className: "ledger-actions", onClick: (ev) => ev.stopPropagation(), onKeyDown: (ev) => ev.stopPropagation() }, /* @__PURE__ */ React.createElement(ActionIcon3, { size: "sm", variant: "subtle", title: t("groupDetail.copyExpense"), "aria-label": t("groupDetail.copyNamed", { title: item.title }), onClick: () => copyExpense(item) }, "\u29C9"), canEditExpense(item) && /* @__PURE__ */ React.createElement(ActionIcon3, { size: "sm", variant: "subtle", title: t("groupDetail.editExpense"), "aria-label": t("groupDetail.editNamed", { title: item.title }), onClick: () => editExpense(item), loading: editBusy }, "\u270E"))
  )), (ledger?.items || []).length > 0 && /* @__PURE__ */ React.createElement("div", { className: "ledger-row is-total" }, /* @__PURE__ */ React.createElement("div", { className: "ledger-copy" }, /* @__PURE__ */ React.createElement("span", { className: "ledger-title" }, t("groupDetail.totalCount", { count: ledger.items.length }))), /* @__PURE__ */ React.createElement("div", { className: "ledger-amounts" }, /* @__PURE__ */ React.createElement("span", { className: "ledger-amount" }, fmt(totals.amount, detail.currency)), /* @__PURE__ */ React.createElement("span", { className: "ledger-meta" }, t("groupDetail.mine"), " ", fmt(totals.mine, detail.currency)))))), /* @__PURE__ */ React.createElement(Box6, { visibleFrom: "sm" }, /* @__PURE__ */ React.createElement("div", { className: "ledger-list is-table" }, /* @__PURE__ */ React.createElement("div", { className: "ledger-row is-head", role: "row" }, /* @__PURE__ */ React.createElement("span", null, t("groupDetail.colItem")), /* @__PURE__ */ React.createElement("span", null, t("groupDetail.colCategory")), /* @__PURE__ */ React.createElement("span", null, t("groupDetail.colParty")), /* @__PURE__ */ React.createElement("span", { className: "is-num" }, t("groupDetail.colAmount")), /* @__PURE__ */ React.createElement("span", { className: "is-num" }, t("groupDetail.colMyShare")), /* @__PURE__ */ React.createElement("span", { className: "is-status" }, t("groupDetail.colStatus")), /* @__PURE__ */ React.createElement("span", { className: "is-actions", "aria-hidden": true })), (ledger?.items || []).map((item) => /* @__PURE__ */ React.createElement("div", { key: item.id, className: `ledger-row is-desk${item.reversed ? " is-reversed" : ""}`, role: "row" }, /* @__PURE__ */ React.createElement("span", { className: "ledger-cell ledger-title" }, item.kind === "expense" ? /* @__PURE__ */ React.createElement(Anchor3, { component: Link4, to: `/groups/${id}/expenses/${item.id}` }, item.title) : item.title, item.has_image ? " \u{1F9FE}" : "", item.reversed ? ` (${t("common.reversed")})` : ""), /* @__PURE__ */ React.createElement("span", { className: "ledger-cell ledger-meta" }, item.kind === "expense" && item.category ? categoryLabelForKey(item.category, categories, t) : "\u2014"), /* @__PURE__ */ React.createElement("span", { className: "ledger-cell ledger-meta" }, item.kind === "expense" ? item.payer_name || displayNameOf(members, item.payer_id) : `${item.from_name || item.from_user_id?.slice(0, 8)} \u2192 ${item.to_name || item.to_user_id?.slice(0, 8)}`), /* @__PURE__ */ React.createElement("span", { className: "ledger-cell ledger-amount is-num" }, fmt(item.amount_cents, detail.currency)), /* @__PURE__ */ React.createElement("span", { className: "ledger-cell ledger-meta is-num" }, item.my_share_cents != null ? fmt(item.my_share_cents, detail.currency) : "\u2014"), /* @__PURE__ */ React.createElement("span", { className: "ledger-cell is-status" }, /* @__PURE__ */ React.createElement("span", { className: `ledger-status is-${String(item.status || "").toLowerCase()}` }, item.status === "LOCKED" ? t("groupDetail.statusLocked") : t("groupDetail.statusOpen"))), /* @__PURE__ */ React.createElement("span", { className: "ledger-cell ledger-actions is-actions" }, item.kind === "expense" ? /* @__PURE__ */ React.createElement(React.Fragment, null, /* @__PURE__ */ React.createElement(ActionIcon3, { size: "sm", variant: "subtle", title: t("groupDetail.copyExpense"), "aria-label": t("groupDetail.copyNamed", { title: item.title }), onClick: () => copyExpense(item) }, "\u29C9"), canEditExpense(item) && /* @__PURE__ */ React.createElement(ActionIcon3, { size: "sm", variant: "subtle", title: t("groupDetail.editExpense"), "aria-label": t("groupDetail.editNamed", { title: item.title }), onClick: () => editExpense(item), loading: editBusy }, "\u270E")) : null))), (ledger?.items || []).length > 0 && /* @__PURE__ */ React.createElement("div", { className: "ledger-row is-desk is-total", role: "row" }, /* @__PURE__ */ React.createElement("span", { className: "ledger-cell ledger-title" }, t("groupDetail.totalRows", { count: ledger.items.length })), /* @__PURE__ */ React.createElement("span", { className: "ledger-cell" }), /* @__PURE__ */ React.createElement("span", { className: "ledger-cell" }), /* @__PURE__ */ React.createElement("span", { className: "ledger-cell ledger-amount is-num" }, fmt(totals.amount, detail.currency)), /* @__PURE__ */ React.createElement("span", { className: "ledger-cell ledger-amount is-num" }, fmt(totals.mine, detail.currency)), /* @__PURE__ */ React.createElement("span", { className: "ledger-cell is-status" }), /* @__PURE__ */ React.createElement("span", { className: "ledger-cell is-actions" }))))), /* @__PURE__ */ React.createElement(Tabs.Panel, { value: "balances" }, /* @__PURE__ */ React.createElement(Text8, { size: "sm", fw: 600, mb: "sm" }, t("groupDetail.whoOwes")), debtors.length === 0 && transfers.length === 0 && /* @__PURE__ */ React.createElement(Text8, { c: "dimmed", size: "sm" }, t("groupDetail.allSettledNobody")), /* @__PURE__ */ React.createElement(Stack5, { gap: "sm" }, byDebtor.map(([from, list]) => /* @__PURE__ */ React.createElement(Card3, { key: from, withBorder: true, radius: "md", padding: "sm" }, /* @__PURE__ */ React.createElement(Group7, { gap: "sm", wrap: "nowrap" }, /* @__PURE__ */ React.createElement(Avatar3, { color: "gray", radius: "xl", size: "sm" }, initialsOf(displayNameOf(members, from))), /* @__PURE__ */ React.createElement("div", { style: { flex: 1 } }, /* @__PURE__ */ React.createElement(Group7, { gap: "xs" }, /* @__PURE__ */ React.createElement(Text8, { size: "sm", fw: 600 }, displayNameOf(members, from), " owes"), /* @__PURE__ */ React.createElement(Anchor3, { size: "xs", c: "dimmed", onClick: () => nudge(from, displayNameOf(members, from)) }, t("groupDetail.nudge"))), list.map((item, i) => /* @__PURE__ */ React.createElement(Group7, { key: i, gap: "xs", mt: 2 }, /* @__PURE__ */ React.createElement(Text8, { size: "sm" }, "\u2192 ", displayNameOf(members, item.to_user_id), " ", /* @__PURE__ */ React.createElement("b", null, fmt(item.amount_cents, detail.currency))), /* @__PURE__ */ React.createElement(Button4, { size: "xs", variant: "light", onClick: () => {
    setPayPreset(item);
    setPayOpen(true);
  } }, t("groupDetail.pay")))))))), byDebtor.length === 0 && debtors.map((m) => /* @__PURE__ */ React.createElement(Card3, { key: m.user_id, withBorder: true, radius: "md", padding: "sm" }, /* @__PURE__ */ React.createElement(Group7, { gap: "xs" }, /* @__PURE__ */ React.createElement(Text8, { size: "sm" }, /* @__PURE__ */ React.createElement("b", null, m.display_name), " owes ", /* @__PURE__ */ React.createElement("b", null, fmt(m.owe_cents, detail.currency))), /* @__PURE__ */ React.createElement(Anchor3, { size: "xs", c: "dimmed", onClick: () => nudge(m.user_id, m.display_name) }, t("groupDetail.nudge"))))))), /* @__PURE__ */ React.createElement(Tabs.Panel, { value: "activity" }, /* @__PURE__ */ React.createElement(Group7, { justify: "space-between", mb: "sm", wrap: "wrap" }, /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement(Text8, { size: "sm", fw: 600 }, "Activity"), /* @__PURE__ */ React.createElement(Text8, { size: "xs", c: "dimmed" }, t("groupDetail.transfersUpdates"), " \xB7 ", t("groupDetail.newestFirst"))), /* @__PURE__ */ React.createElement(Button4, { size: "xs", variant: "subtle", onClick: loadActivityFeed, loading: activityLoading }, t("common.refresh"))), activityLoading && activityFeed.length === 0 && /* @__PURE__ */ React.createElement(Stack5, { gap: "xs" }, /* @__PURE__ */ React.createElement(Skeleton2, { height: 52, radius: "md" }), /* @__PURE__ */ React.createElement(Skeleton2, { height: 52, radius: "md" })), !activityLoading && activityFeed.length === 0 && /* @__PURE__ */ React.createElement(Text8, { size: "sm", c: "dimmed" }, t("groupDetail.activityEmpty")), activityFeed.length > 0 && /* @__PURE__ */ React.createElement("div", { className: "activity-list" }, activityFeed.length > ACTIVITY_PAGE_SIZE && /* @__PURE__ */ React.createElement("div", { className: "activity-pager" }, /* @__PURE__ */ React.createElement("span", { className: "activity-pager-range" }, t("activity.range", {
    from: (activityPageSafe - 1) * ACTIVITY_PAGE_SIZE + 1,
    to: Math.min(activityPageSafe * ACTIVITY_PAGE_SIZE, activityFeed.length),
    total: activityFeed.length
  })), /* @__PURE__ */ React.createElement("div", { className: "activity-pager-controls" }, /* @__PURE__ */ React.createElement(
    "button",
    {
      type: "button",
      className: "activity-pager-btn",
      disabled: activityPageSafe <= 1,
      onClick: () => setActivityPage((p) => Math.max(1, p - 1))
    },
    t("common.prev")
  ), /* @__PURE__ */ React.createElement("div", { className: "activity-pager-pages" }, Array.from({ length: activityPageCount }, (_, i) => i + 1).filter((n) => n === 1 || n === activityPageCount || Math.abs(n - activityPageSafe) <= 1).reduce((acc, n, idx, arr) => {
    if (idx > 0 && n - arr[idx - 1] > 1) acc.push("\u2026");
    acc.push(n);
    return acc;
  }, []).map((n, i) => n === "\u2026" ? /* @__PURE__ */ React.createElement("span", { key: `e${i}`, className: "activity-pager-ellipsis" }, "\u2026") : /* @__PURE__ */ React.createElement(
    "button",
    {
      key: n,
      type: "button",
      className: `activity-pager-page${n === activityPageSafe ? " is-active" : ""}`,
      onClick: () => setActivityPage(n)
    },
    n
  ))), /* @__PURE__ */ React.createElement(
    "button",
    {
      type: "button",
      className: "activity-pager-btn",
      disabled: activityPageSafe >= activityPageCount,
      onClick: () => setActivityPage((p) => Math.min(activityPageCount, p + 1))
    },
    t("common.next")
  ))), activitySlice.map((row) => {
    if (row.payment) {
      const p = row.payment;
      const from = p.from_name || (p.from_user_id ? displayNameOf(members, p.from_user_id) : "Someone");
      const to = p.to_name || (p.to_user_id ? displayNameOf(members, p.to_user_id) : "Someone");
      const title = `${from} \u2192 ${to}`;
      const meta = [
        fmt(p.amount_cents, detail.currency),
        new Date(p.created_at).toLocaleString(),
        p.reversed ? "reversed" : null,
        p.status && p.status !== "OPEN" ? p.status.toLowerCase() : null
      ].filter(Boolean).join(" \xB7 ");
      return /* @__PURE__ */ React.createElement("div", { key: row.key, className: `activity-row is-static${p.reversed ? " is-reversed" : ""}` }, /* @__PURE__ */ React.createElement(ActivityKindThumb, { kind: "payment" }), /* @__PURE__ */ React.createElement("span", { className: "activity-copy" }, /* @__PURE__ */ React.createElement("span", { className: "activity-text" }, title), /* @__PURE__ */ React.createElement("span", { className: "activity-meta" }, meta)), !p.reversed && String(p.status).toUpperCase() === "OPEN" && (isMobile ? /* @__PURE__ */ React.createElement(RowMenu, { label: `Actions for transfer ${fmt(p.amount_cents, detail.currency)}` }, /* @__PURE__ */ React.createElement(Menu2.Item, { onClick: () => reversePay(p.id) }, t("groupDetail.reverse"))) : /* @__PURE__ */ React.createElement(Button4, { size: "xs", variant: "subtle", onClick: () => reversePay(p.id) }, t("groupDetail.reverse"))));
    }
    const a = row.activity;
    return /* @__PURE__ */ React.createElement("div", { key: row.key, className: "activity-row is-static" }, /* @__PURE__ */ React.createElement(ActivityKindThumb, { kind: a.kind }), /* @__PURE__ */ React.createElement("span", { className: "activity-copy" }, /* @__PURE__ */ React.createElement("span", { className: "activity-text" }, a.text), /* @__PURE__ */ React.createElement("span", { className: "activity-meta" }, new Date(a.at).toLocaleString())));
  }))), /* @__PURE__ */ React.createElement(Tabs.Panel, { value: "recurring" }, /* @__PURE__ */ React.createElement(Group7, { justify: "space-between", mb: "sm" }, /* @__PURE__ */ React.createElement(Text8, { size: "sm", fw: 600 }, t("groupDetail.recurringBills")), /* @__PURE__ */ React.createElement(Button4, { size: "xs", variant: "subtle", onClick: loadRules }, t("common.refresh"))), /* @__PURE__ */ React.createElement(RecurringForm, { groupId: id, members, onDone: loadRules }), /* @__PURE__ */ React.createElement(Stack5, { gap: "xs", mt: "sm" }, rules.map((r) => /* @__PURE__ */ React.createElement(Card3, { key: r.rule_id, withBorder: true, radius: "md", padding: "sm" }, /* @__PURE__ */ React.createElement(Group7, { justify: "space-between", wrap: "nowrap" }, /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement(Text8, { size: "sm", fw: 600 }, r.title, " ", /* @__PURE__ */ React.createElement(Text8, { span: true, c: "dimmed" }, "\xB7 ", r.frequency, " \xB7 next ", new Date(r.next_run_at).toLocaleDateString())), /* @__PURE__ */ React.createElement(Text8, { size: "xs", c: "dimmed" }, fmt(r.amount_cents, detail.currency), " \xB7 ", r.active ? "active" : "paused")), /* @__PURE__ */ React.createElement(Group7, { gap: "xs" }, /* @__PURE__ */ React.createElement(Button4, { size: "xs", variant: "subtle", onClick: async () => {
    await api.patch(`/api/v1/groups/${id}/recurring/${r.rule_id}`, { active: !r.active });
    loadRules();
  } }, r.active ? "Pause" : "Resume"), /* @__PURE__ */ React.createElement(Button4, { size: "xs", variant: "subtle", color: "red", onClick: async () => {
    await api.del(`/api/v1/groups/${id}/recurring/${r.rule_id}`);
    loadRules();
  } }, "Delete"))))), rules.length === 0 && /* @__PURE__ */ React.createElement(Text8, { size: "sm", c: "dimmed" }, t("groupDetail.noRecurring")))), /* @__PURE__ */ React.createElement(Tabs.Panel, { value: "people" }, /* @__PURE__ */ React.createElement("div", { className: "gd-people" }, members.map((m) => {
    const pastel = pastelFor(m.display_name || m.username);
    const roleLabel = m.role === "owner" ? t("common.owner") : m.role === "treasurer" ? t("common.treasurer") : t("common.member");
    const roleClass = m.role === "owner" ? "is-owner" : m.role === "treasurer" ? "is-treasurer" : "is-member";
    const canAct = detail.mode === "event" || detail.my_role === "owner";
    const depositLabel = m.deposit_paid ? t("groupDetail.unmarkDeposit") : t("groupDetail.markDeposit");
    const treasurerLabel = m.role === "treasurer" ? t("groupDetail.removeTreasurer") : t("groupDetail.makeTreasurer");
    return /* @__PURE__ */ React.createElement("div", { key: m.user_id, className: "gd-person" }, /* @__PURE__ */ React.createElement(
      "span",
      {
        className: "gd-person-avatar",
        style: { "--gt-from": pastel.from, "--gt-to": pastel.to },
        "aria-hidden": true
      },
      initialsOf(m.display_name)
    ), /* @__PURE__ */ React.createElement("div", { className: "gd-person-body" }, /* @__PURE__ */ React.createElement("div", { className: "gd-person-top" }, /* @__PURE__ */ React.createElement(Text8, { className: "gd-person-name", truncate: true }, m.display_name), /* @__PURE__ */ React.createElement("span", { className: `gd-person-tag ${roleClass}` }, roleLabel), detail.mode === "event" && /* @__PURE__ */ React.createElement("span", { className: `gd-person-tag ${m.deposit_paid ? "is-deposit" : "is-deposit-due"}` }, m.deposit_paid ? t("groupDetail.depositPaid") : t("groupDetail.depositDue"))), /* @__PURE__ */ React.createElement(Text8, { className: "gd-person-handle", truncate: true }, "@", m.username)), canAct && /* @__PURE__ */ React.createElement("div", { className: "gd-person-actions" }, detail.mode === "event" && /* @__PURE__ */ React.createElement(Tooltip2, { label: depositLabel, withArrow: true, openDelay: 200 }, /* @__PURE__ */ React.createElement(
      "button",
      {
        type: "button",
        className: `gd-person-action${m.deposit_paid ? " is-on" : ""}`,
        "aria-label": depositLabel,
        onClick: () => setDeposit(m.user_id, !m.deposit_paid)
      },
      /* @__PURE__ */ React.createElement(GdActionIcon, { name: m.deposit_paid ? "deposit-on" : "deposit" })
    )), detail.my_role === "owner" && m.role !== "owner" && /* @__PURE__ */ React.createElement(Tooltip2, { label: treasurerLabel, withArrow: true, openDelay: 200 }, /* @__PURE__ */ React.createElement(
      "button",
      {
        type: "button",
        className: `gd-person-action${m.role === "treasurer" ? " is-on" : ""}`,
        "aria-label": treasurerLabel,
        onClick: () => setRole(m.user_id, m.role === "treasurer" ? "member" : "treasurer")
      },
      /* @__PURE__ */ React.createElement(GdActionIcon, { name: "treasurer" })
    )), detail.my_role === "owner" && m.role !== "owner" && /* @__PURE__ */ React.createElement(Tooltip2, { label: t("common.remove"), withArrow: true, openDelay: 200 }, /* @__PURE__ */ React.createElement(
      "button",
      {
        type: "button",
        className: "gd-person-action is-danger",
        "aria-label": t("groupDetail.removeNamed", { name: m.display_name }),
        onClick: () => remove(m.user_id, m.display_name)
      },
      /* @__PURE__ */ React.createElement(GdActionIcon, { name: "trash" })
    ))));
  })))))), /* @__PURE__ */ React.createElement(
    Modal4,
    {
      opened: newSheetOpen,
      onClose: () => setNewSheetOpen(false),
      title: "+ New",
      centered: !isMobile,
      fullScreen: false,
      size: "sm",
      styles: isMobile ? { content: { marginTop: "auto", marginBottom: 0, borderRadius: "16px 16px 0 0" } } : void 0
    },
    /* @__PURE__ */ React.createElement(Stack5, { gap: "sm" }, /* @__PURE__ */ React.createElement(
      Button4,
      {
        size: "md",
        fullWidth: true,
        className: "gd-sheet-btn is-expense",
        onClick: () => {
          setNewSheetOpen(false);
          setShowExp(true);
        }
      },
      "\u{1F9FE}\xA0 ",
      t("groupDetail.addExpense")
    ), /* @__PURE__ */ React.createElement(
      Button4,
      {
        size: "md",
        fullWidth: true,
        className: "gd-sheet-btn is-pay",
        onClick: () => {
          setNewSheetOpen(false);
          setPayPreset(null);
          setPayOpen(true);
        }
      },
      "\u{1F4B8}\xA0 ",
      t("groupDetail.recordPayment")
    ))
  ), /* @__PURE__ */ React.createElement(
    Modal4,
    {
      opened: showExp,
      onClose: () => {
        setShowExp(false);
        setCopyFrom(null);
      },
      closeOnClickOutside: false,
      title: /* @__PURE__ */ React.createElement("span", { className: "wizard-title-name" }, copyFrom ? t("groupDetail.copyExpense") : t("groupDetail.newExpense")),
      classNames: {
        content: "wizard-modal-content",
        header: "wizard-modal-header",
        body: "wizard-modal-body",
        title: "wizard-modal-title"
      },
      centered: true,
      size: 560,
      radius: 24,
      padding: 0,
      overlayProps: { backgroundOpacity: 0.55, blur: 8 },
      fullScreen: isMobile
    },
    /* @__PURE__ */ React.createElement(
      ExpenseForm,
      {
        groupId: id,
        members,
        copyFrom,
        currency: detail.currency,
        onDone: () => {
          setShowExp(false);
          setCopyFrom(null);
          load();
          loadLedger();
          loadSummary();
        }
      }
    )
  ), /* @__PURE__ */ React.createElement(
    Modal4,
    {
      opened: editOpen,
      onClose: closeEdit,
      closeOnClickOutside: false,
      title: /* @__PURE__ */ React.createElement("span", { className: "wizard-title-name" }, t("groupDetail.editExpense")),
      classNames: {
        content: "wizard-modal-content",
        header: "wizard-modal-header",
        body: "wizard-modal-body",
        title: "wizard-modal-title"
      },
      centered: true,
      size: 560,
      radius: 24,
      padding: 0,
      overlayProps: { backgroundOpacity: 0.55, blur: 8 },
      fullScreen: isMobile
    },
    editExisting && /* @__PURE__ */ React.createElement(
      ExpenseForm,
      {
        key: editExisting.expense_id,
        groupId: id,
        members,
        existing: editExisting,
        currency: detail.currency,
        onDone: () => {
          closeEdit();
          load();
          loadLedger();
          loadSummary();
        }
      }
    )
  ), /* @__PURE__ */ React.createElement(
    Modal4,
    {
      opened: payOpen,
      onClose: () => setPayOpen(false),
      closeOnClickOutside: false,
      title: /* @__PURE__ */ React.createElement("span", { className: "wizard-title-name" }, t("groupDetail.recordPayment")),
      classNames: {
        content: "wizard-modal-content",
        header: "wizard-modal-header",
        body: "wizard-modal-body",
        title: "wizard-modal-title"
      },
      centered: true,
      size: 520,
      radius: 24,
      padding: 0,
      overlayProps: { backgroundOpacity: 0.55, blur: 8 },
      fullScreen: isMobile
    },
    /* @__PURE__ */ React.createElement(
      PaymentForm,
      {
        groupId: id,
        members,
        preset: payPreset,
        onDone: (r) => {
          setPayOpen(false);
          setPayPreset(null);
          load();
          loadLedger();
          loadSummary();
          loadActivityFeed();
          notifications2.show({
            title: r.fully_settled ? "Fully settled" : "Payment recorded",
            color: "teal"
          });
        }
      }
    )
  ), /* @__PURE__ */ React.createElement(
    Modal4,
    {
      opened: shareOpen,
      onClose: () => setShareOpen(false),
      closeOnClickOutside: false,
      title: /* @__PURE__ */ React.createElement("span", { className: "wizard-title-name" }, t("groupDetail.inviteLink")),
      classNames: {
        content: "wizard-modal-content",
        header: "wizard-modal-header",
        body: "wizard-modal-body",
        title: "wizard-modal-title"
      },
      centered: true,
      size: 480,
      radius: 24,
      padding: 0,
      overlayProps: { backgroundOpacity: 0.55, blur: 8 },
      fullScreen: isMobile
    },
    /* @__PURE__ */ React.createElement("div", { className: "wizard-form confirm-dialog" }, detail.invite_link ? /* @__PURE__ */ React.createElement(React.Fragment, null, /* @__PURE__ */ React.createElement(Text8, { className: "confirm-dialog-text" }, "Anyone with this link can join the group."), /* @__PURE__ */ React.createElement(TextInput2, { readOnly: true, value: detail.invite_link }), /* @__PURE__ */ React.createElement(CopyButton, { value: detail.invite_link }, ({ copied, copy }) => /* @__PURE__ */ React.createElement(Button4, { className: "wizard-primary", fullWidth: true, onClick: copy }, copied ? t("invite.linkCopied") : t("wizard.copyInviteLink")))) : /* @__PURE__ */ React.createElement(Text8, { className: "confirm-dialog-text" }, "Only the owner or treasurer can share an invite link."))
  ), /* @__PURE__ */ React.createElement(
    Modal4,
    {
      opened: removeOpen,
      onClose: () => !removeBusy && setRemoveOpen(false),
      closeOnClickOutside: !removeBusy,
      title: /* @__PURE__ */ React.createElement("span", { className: "wizard-title-name" }, t("groupDetail.removeMember")),
      classNames: {
        content: "wizard-modal-content",
        header: "wizard-modal-header",
        body: "wizard-modal-body",
        title: "wizard-modal-title"
      },
      centered: true,
      size: 420,
      radius: 24,
      padding: 0,
      overlayProps: { backgroundOpacity: 0.55, blur: 8 }
    },
    /* @__PURE__ */ React.createElement("div", { className: "wizard-form confirm-dialog" }, /* @__PURE__ */ React.createElement(Text8, { className: "confirm-dialog-text" }, "Remove ", /* @__PURE__ */ React.createElement("b", null, removeTarget?.name), "? Blocked while they hold a balance. History is kept."), /* @__PURE__ */ React.createElement(Group7, { gap: "sm", grow: true }, /* @__PURE__ */ React.createElement(Button4, { className: "wizard-back", onClick: () => setRemoveOpen(false), disabled: removeBusy }, "Cancel"), /* @__PURE__ */ React.createElement(Button4, { className: "wizard-primary is-danger", loading: removeBusy, onClick: confirmRemove }, "Remove")), /* @__PURE__ */ React.createElement(Err, { e }))
  ), /* @__PURE__ */ React.createElement(
    Modal4,
    {
      opened: leaveOpen,
      onClose: () => !leaveBusy && setLeaveOpen(false),
      closeOnClickOutside: !leaveBusy,
      title: /* @__PURE__ */ React.createElement("span", { className: "wizard-title-name" }, t("groupDetail.leaveGroup")),
      classNames: {
        content: "wizard-modal-content",
        header: "wizard-modal-header",
        body: "wizard-modal-body",
        title: "wizard-modal-title"
      },
      centered: true,
      size: 420,
      radius: 24,
      padding: 0,
      overlayProps: { backgroundOpacity: 0.55, blur: 8 }
    },
    /* @__PURE__ */ React.createElement("div", { className: "wizard-form confirm-dialog" }, /* @__PURE__ */ React.createElement(Text8, { className: "confirm-dialog-text" }, "Leave ", /* @__PURE__ */ React.createElement("b", null, detail?.name), "? You\u2019ll lose access until someone invites you again. Blocked while you hold a balance."), /* @__PURE__ */ React.createElement(Group7, { gap: "sm", grow: true }, /* @__PURE__ */ React.createElement(Button4, { className: "wizard-back", onClick: () => setLeaveOpen(false), disabled: leaveBusy }, "Cancel"), /* @__PURE__ */ React.createElement(Button4, { className: "wizard-primary is-danger", loading: leaveBusy, onClick: confirmLeave }, "Leave")), /* @__PURE__ */ React.createElement(Err, { e }))
  ), /* @__PURE__ */ React.createElement(
    Modal4,
    {
      opened: deleteOpen,
      onClose: () => !deleteBusy && setDeleteOpen(false),
      closeOnClickOutside: !deleteBusy,
      title: /* @__PURE__ */ React.createElement("span", { className: "wizard-title-name" }, t("groupDetail.deleteGroup")),
      classNames: {
        content: "wizard-modal-content",
        header: "wizard-modal-header",
        body: "wizard-modal-body",
        title: "wizard-modal-title"
      },
      centered: true,
      size: 420,
      radius: 24,
      padding: 0,
      overlayProps: { backgroundOpacity: 0.55, blur: 8 }
    },
    /* @__PURE__ */ React.createElement("div", { className: "wizard-form confirm-dialog" }, /* @__PURE__ */ React.createElement(Text8, { className: "confirm-dialog-text" }, "Delete ", /* @__PURE__ */ React.createElement("b", null, detail?.name), "? This can\u2019t be undone. Only possible when there are no expenses or everything is fully settled."), /* @__PURE__ */ React.createElement(Group7, { gap: "sm", grow: true }, /* @__PURE__ */ React.createElement(Button4, { className: "wizard-back", onClick: () => setDeleteOpen(false), disabled: deleteBusy }, "Cancel"), /* @__PURE__ */ React.createElement(Button4, { className: "wizard-primary is-danger", loading: deleteBusy, onClick: confirmDelete }, "Delete")), /* @__PURE__ */ React.createElement(Err, { e }))
  ), /* @__PURE__ */ React.createElement(
    Modal4,
    {
      opened: inviteOpen,
      onClose: () => {
        setInviteOpen(false);
        setInviteEmails("");
        setContactQ("");
        setContacts([]);
        setE(null);
      },
      closeOnClickOutside: false,
      title: /* @__PURE__ */ React.createElement("span", { className: "wizard-title-name" }, t("invite.title")),
      classNames: {
        content: "wizard-modal-content invite-modal-content",
        header: "wizard-modal-header",
        body: "wizard-modal-body",
        title: "wizard-modal-title"
      },
      centered: true,
      size: 520,
      radius: 24,
      padding: 0,
      overlayProps: { backgroundOpacity: 0.55, blur: 8 },
      fullScreen: isMobile
    },
    /* @__PURE__ */ React.createElement("div", { className: "wizard-form invite-dialog" }, /* @__PURE__ */ React.createElement(
      Tabs,
      {
        value: inviteTab,
        onChange: (v) => setInviteTab(v || "email"),
        className: "invite-tabs",
        color: "teal"
      },
      /* @__PURE__ */ React.createElement(Tabs.List, { grow: true }, /* @__PURE__ */ React.createElement(Tabs.Tab, { value: "email" }, t("invite.byEmail")), /* @__PURE__ */ React.createElement(Tabs.Tab, { value: "contacts" }, t("invite.fromContacts")), /* @__PURE__ */ React.createElement(Tabs.Tab, { value: "link" }, t("invite.inviteLink"))),
      /* @__PURE__ */ React.createElement(Tabs.Panel, { value: "email" }, /* @__PURE__ */ React.createElement("form", { className: "wizard-form", onSubmit: inviteByEmail }, /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement(
        Textarea,
        {
          placeholder: t("wizard.emailsPh"),
          minRows: 4,
          value: inviteEmails,
          onChange: (x) => setInviteEmails(x.target.value),
          "aria-label": t("invite.emails")
        }
      ), /* @__PURE__ */ React.createElement(Text8, { size: "xs", c: "dimmed", mt: 6 }, t("invite.emailsHint"))), /* @__PURE__ */ React.createElement(Button4, { className: "wizard-primary", fullWidth: true, type: "submit", loading: inviteBusy }, t("invite.sendInvites")))),
      /* @__PURE__ */ React.createElement(Tabs.Panel, { value: "contacts" }, /* @__PURE__ */ React.createElement("form", { className: "wizard-form", onSubmit: searchContacts }, /* @__PURE__ */ React.createElement(Group7, { gap: "xs", align: "flex-end", wrap: "nowrap" }, /* @__PURE__ */ React.createElement(
        TextInput2,
        {
          label: t("wizard.searchContacts"),
          placeholder: t("wizard.searchPh"),
          value: contactQ,
          onChange: (x) => setContactQ(x.target.value),
          style: { flex: 1 }
        }
      ), /* @__PURE__ */ React.createElement(Button4, { className: "wizard-search", type: "submit", variant: "default", loading: contactBusy }, t("common.search"))), /* @__PURE__ */ React.createElement(Stack5, { gap: 8 }, contacts.map((c) => /* @__PURE__ */ React.createElement("div", { className: "wizard-person", key: c.user_id }, /* @__PURE__ */ React.createElement(Group7, { gap: "sm", wrap: "nowrap", style: { minWidth: 0, flex: 1 } }, /* @__PURE__ */ React.createElement(
        "span",
        {
          className: "gd-person-avatar",
          style: {
            "--gt-from": pastelFor(c.display_name).from,
            "--gt-to": pastelFor(c.display_name).to,
            width: 36,
            height: 36,
            fontSize: 11
          },
          "aria-hidden": true
        },
        initialsOf(c.display_name)
      ), /* @__PURE__ */ React.createElement("div", { style: { minWidth: 0 } }, /* @__PURE__ */ React.createElement(Text8, { size: "sm", fw: 600, truncate: true }, c.display_name), /* @__PURE__ */ React.createElement(Text8, { size: "xs", c: "dimmed", truncate: true }, "@", c.username))), /* @__PURE__ */ React.createElement(
        "button",
        {
          type: "button",
          className: "wizard-chip",
          onClick: () => addFromContact(c.user_id, c.display_name)
        },
        t("common.add")
      ))), !contactBusy && contacts.length === 0 && contactQ.trim() !== "" && /* @__PURE__ */ React.createElement(Text8, { size: "sm", c: "dimmed" }, t("invite.noContacts")), !contactBusy && contacts.length === 0 && contactQ.trim() === "" && /* @__PURE__ */ React.createElement(Text8, { size: "sm", c: "dimmed" }, t("invite.searchYourContacts"))))),
      /* @__PURE__ */ React.createElement(Tabs.Panel, { value: "link" }, /* @__PURE__ */ React.createElement("div", { className: "wizard-form" }, inviteLinkLive || detail.invite_link ? /* @__PURE__ */ React.createElement(React.Fragment, null, /* @__PURE__ */ React.createElement(Text8, { className: "invite-link-hint" }, t("invite.linkBody")), /* @__PURE__ */ React.createElement(Group7, { gap: "xs", align: "flex-end", wrap: "nowrap" }, /* @__PURE__ */ React.createElement(
        TextInput2,
        {
          readOnly: true,
          value: inviteLinkLive || detail.invite_link,
          style: { flex: 1 },
          "aria-label": t("invite.inviteLink")
        }
      ), detail.my_role === "owner" && /* @__PURE__ */ React.createElement(
        Button4,
        {
          className: "wizard-search",
          variant: "default",
          loading: rotateBusy,
          onClick: rotateInviteLink
        },
        t("invite.rotate")
      )), /* @__PURE__ */ React.createElement(CopyButton, { value: inviteLinkLive || detail.invite_link }, ({ copied, copy }) => /* @__PURE__ */ React.createElement(Button4, { className: "wizard-primary", fullWidth: true, onClick: copy }, copied ? t("invite.linkCopied") : t("wizard.copyInviteLink")))) : /* @__PURE__ */ React.createElement(Text8, { className: "invite-link-hint" }, t("invite.ownerOnlyLink"))))
    ), /* @__PURE__ */ React.createElement(Err, { e }))
  ), /* @__PURE__ */ React.createElement(
    Modal4,
    {
      opened: categoryModalOpen,
      onClose: () => !catBusy && setCategoryModalOpen(false),
      closeOnClickOutside: !catBusy,
      title: /* @__PURE__ */ React.createElement("span", { className: "wizard-title-name" }, t(categoryTarget ? "groupDetail.categoryRename" : "groupDetail.categoryAdd")),
      classNames: {
        content: "wizard-modal-content",
        header: "wizard-modal-header",
        body: "wizard-modal-body",
        title: "wizard-modal-title"
      },
      centered: true,
      size: 440,
      radius: 24,
      padding: 0,
      overlayProps: { backgroundOpacity: 0.55, blur: 8 }
    },
    /* @__PURE__ */ React.createElement("form", { className: "wizard-form", onSubmit: saveCategory }, /* @__PURE__ */ React.createElement(
      TextInput2,
      {
        label: t("groupDetail.categoryName"),
        placeholder: t("forms.expense.addCategoryPh"),
        autoFocus: true,
        required: true,
        value: categoryName,
        onChange: (x) => setCategoryName(x.target.value)
      }
    ), /* @__PURE__ */ React.createElement(Button4, { className: "wizard-primary", fullWidth: true, type: "submit", loading: catBusy, disabled: !categoryName.trim() }, t(categoryTarget ? "common.saveChanges" : "groupDetail.categoryAdd")), /* @__PURE__ */ React.createElement(Err, { e }))
  ), /* @__PURE__ */ React.createElement(
    Modal4,
    {
      opened: !!categoryDeleteTarget,
      onClose: () => !catBusy && setCategoryDeleteTarget(null),
      closeOnClickOutside: !catBusy,
      title: /* @__PURE__ */ React.createElement("span", { className: "wizard-title-name" }, t("groupDetail.categoryDelete")),
      classNames: {
        content: "wizard-modal-content",
        header: "wizard-modal-header",
        body: "wizard-modal-body",
        title: "wizard-modal-title"
      },
      centered: true,
      size: 420,
      radius: 24,
      padding: 0,
      overlayProps: { backgroundOpacity: 0.55, blur: 8 }
    },
    /* @__PURE__ */ React.createElement("div", { className: "wizard-form confirm-dialog" }, /* @__PURE__ */ React.createElement(Text8, { className: "confirm-dialog-text" }, t("groupDetail.categoryDeleteBody", { name: categoryLabel(categoryDeleteTarget, t) })), /* @__PURE__ */ React.createElement(Group7, { gap: "sm", grow: true }, /* @__PURE__ */ React.createElement(Button4, { className: "wizard-back", onClick: () => setCategoryDeleteTarget(null), disabled: catBusy }, t("common.cancel")), /* @__PURE__ */ React.createElement(Button4, { className: "wizard-primary is-danger", loading: catBusy, onClick: confirmDeleteCategory }, t("common.delete"))), /* @__PURE__ */ React.createElement(Err, { e }))
  ), /* @__PURE__ */ React.createElement(Modal4, { opened: renameOpen, onClose: () => setRenameOpen(false), title: t("groupDetail.rename"), centered: true, size: "sm" }, /* @__PURE__ */ React.createElement("form", { onSubmit: saveRename }, /* @__PURE__ */ React.createElement(Stack5, { gap: "sm" }, /* @__PURE__ */ React.createElement(
    TextInput2,
    {
      label: t("wizard.groupName"),
      required: true,
      autoFocus: true,
      value: renName,
      onChange: (x) => setRenName(x.target.value),
      "data-autofocus": true
    }
  ), /* @__PURE__ */ React.createElement(Group7, { justify: "flex-end", gap: "xs" }, /* @__PURE__ */ React.createElement(Button4, { variant: "default", onClick: () => setRenameOpen(false) }, t("common.cancel")), /* @__PURE__ */ React.createElement(Button4, { type: "submit", loading: renaming }, t("groupDetail.renameSave"))), /* @__PURE__ */ React.createElement(Err, { e })))));
}
function CategoryManager({ categories, t, onAdd, onEdit, onDelete }) {
  return /* @__PURE__ */ React.createElement("section", { className: "category-manager", "aria-label": t("groupDetail.tabCategories") }, /* @__PURE__ */ React.createElement(Group7, { justify: "space-between", mb: "sm", wrap: "wrap" }, /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement(Text8, { size: "sm", fw: 700 }, t("groupDetail.tabCategories")), /* @__PURE__ */ React.createElement(Text8, { size: "xs", c: "dimmed" }, t("groupDetail.categoriesHint"))), /* @__PURE__ */ React.createElement("button", { type: "button", className: "gd-action-btn settings-add-btn", onClick: onAdd }, /* @__PURE__ */ React.createElement(GdActionIcon, { name: "plus" }), /* @__PURE__ */ React.createElement("span", null, t("groupDetail.categoryAdd")))), /* @__PURE__ */ React.createElement("div", { className: "settings-list category-manager-list" }, categories.map((category) => /* @__PURE__ */ React.createElement("div", { key: category.category_id, className: "settings-row" }, /* @__PURE__ */ React.createElement("div", { className: "settings-row-body" }, /* @__PURE__ */ React.createElement(Text8, { className: "settings-row-title" }, categoryLabel(category, t)), /* @__PURE__ */ React.createElement(Text8, { className: "settings-row-sub" }, category.is_default ? t("groupDetail.categoryDefault") : category.key)), /* @__PURE__ */ React.createElement("div", { className: "settings-row-actions" }, /* @__PURE__ */ React.createElement(Tooltip2, { label: t("common.edit"), withArrow: true, openDelay: 200 }, /* @__PURE__ */ React.createElement("button", { type: "button", className: "gd-person-action", "aria-label": `${t("common.edit")} ${categoryLabel(category, t)}`, onClick: () => onEdit(category) }, /* @__PURE__ */ React.createElement(GdActionIcon, { name: "edit" }))), !category.is_default && /* @__PURE__ */ React.createElement(Tooltip2, { label: t("common.delete"), withArrow: true, openDelay: 200 }, /* @__PURE__ */ React.createElement("button", { type: "button", className: "gd-person-action is-danger", "aria-label": `${t("common.delete")} ${categoryLabel(category, t)}`, onClick: () => onDelete(category) }, /* @__PURE__ */ React.createElement(GdActionIcon, { name: "trash" })))))), categories.length === 0 && /* @__PURE__ */ React.createElement(Text8, { size: "sm", c: "dimmed" }, t("groupDetail.noCategories"))));
}
function GdActionIcon({ name }) {
  const common = { width: 16, height: 16, viewBox: "0 0 24 24", fill: "none", "aria-hidden": true };
  if (name === "pay") {
    return /* @__PURE__ */ React.createElement("svg", { ...common }, /* @__PURE__ */ React.createElement("path", { d: "M4 9h16M4 15h16M7 9V7.8A1.8 1.8 0 0 1 8.8 6h6.4A1.8 1.8 0 0 1 17 7.8V9", stroke: "currentColor", strokeWidth: "1.8", strokeLinecap: "round" }), /* @__PURE__ */ React.createElement("rect", { x: "3", y: "9", width: "18", height: "10", rx: "2.2", stroke: "currentColor", strokeWidth: "1.8" }));
  }
  if (name === "expense") {
    return /* @__PURE__ */ React.createElement("svg", { ...common }, /* @__PURE__ */ React.createElement("path", { d: "M8 7h8M8 11h8M8 15h5", stroke: "currentColor", strokeWidth: "1.8", strokeLinecap: "round" }), /* @__PURE__ */ React.createElement("path", { d: "M6 3.5h12A2.5 2.5 0 0 1 20.5 6v14.2l-2.8-1.6-2.7 1.6-2.8-1.6-2.7 1.6-2.8-1.6-2.7 1.6V6A2.5 2.5 0 0 1 6 3.5Z", stroke: "currentColor", strokeWidth: "1.8", strokeLinejoin: "round" }));
  }
  if (name === "edit") {
    return /* @__PURE__ */ React.createElement("svg", { ...common, width: 17, height: 17 }, /* @__PURE__ */ React.createElement("path", { d: "M4.5 19.5h4.1L19.2 8.9a2.1 2.1 0 0 0 0-3l-1.1-1.1a2.1 2.1 0 0 0-3 0L4.5 15.4v4.1Z", stroke: "currentColor", strokeWidth: "1.75", strokeLinejoin: "round" }), /* @__PURE__ */ React.createElement("path", { d: "M13.4 6.6 17.4 10.6", stroke: "currentColor", strokeWidth: "1.75", strokeLinecap: "round" }));
  }
  if (name === "export") {
    return /* @__PURE__ */ React.createElement("svg", { ...common }, /* @__PURE__ */ React.createElement("path", { d: "M12 4v10M8.5 8.5 12 5l3.5 3.5", stroke: "currentColor", strokeWidth: "1.8", strokeLinecap: "round", strokeLinejoin: "round" }), /* @__PURE__ */ React.createElement("path", { d: "M5 16.5V18a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-1.5", stroke: "currentColor", strokeWidth: "1.8", strokeLinecap: "round" }));
  }
  if (name === "invite") {
    return /* @__PURE__ */ React.createElement("svg", { ...common }, /* @__PURE__ */ React.createElement("path", { d: "M16 11a4 4 0 1 0-4-4 4 4 0 0 0 4 4Z", stroke: "currentColor", strokeWidth: "1.8" }), /* @__PURE__ */ React.createElement("path", { d: "M14 14.5c3.2.2 5.5 1.6 5.5 4v1H14", stroke: "currentColor", strokeWidth: "1.8", strokeLinecap: "round" }), /* @__PURE__ */ React.createElement("path", { d: "M8.5 12.5v6M5.5 15.5h6", stroke: "currentColor", strokeWidth: "1.8", strokeLinecap: "round" }));
  }
  if (name === "leave") {
    return /* @__PURE__ */ React.createElement("svg", { ...common }, /* @__PURE__ */ React.createElement("path", { d: "M10 5H7a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h3", stroke: "currentColor", strokeWidth: "1.8", strokeLinecap: "round" }), /* @__PURE__ */ React.createElement("path", { d: "M14 8l4 4-4 4M9.5 12H18", stroke: "currentColor", strokeWidth: "1.8", strokeLinecap: "round", strokeLinejoin: "round" }));
  }
  if (name === "trash") {
    return /* @__PURE__ */ React.createElement("svg", { ...common, strokeLinecap: "round", strokeLinejoin: "round" }, /* @__PURE__ */ React.createElement("path", { d: "M4 7h16", stroke: "currentColor", strokeWidth: "1.75" }), /* @__PURE__ */ React.createElement("path", { d: "M9 7V5.2A1.2 1.2 0 0 1 10.2 4h3.6A1.2 1.2 0 0 1 15 5.2V7", stroke: "currentColor", strokeWidth: "1.75" }), /* @__PURE__ */ React.createElement("path", { d: "M6.5 7v11.2A1.8 1.8 0 0 0 8.3 20h7.4a1.8 1.8 0 0 0 1.8-1.8V7", stroke: "currentColor", strokeWidth: "1.75" }), /* @__PURE__ */ React.createElement("path", { d: "M10 11v5.5M14 11v5.5", stroke: "currentColor", strokeWidth: "1.75" }));
  }
  if (name === "deposit" || name === "deposit-on") {
    return /* @__PURE__ */ React.createElement("svg", { ...common }, /* @__PURE__ */ React.createElement("rect", { x: "3.25", y: "6.25", width: "17.5", height: "11.5", rx: "2.75", stroke: "currentColor", strokeWidth: "1.75" }), /* @__PURE__ */ React.createElement("path", { d: "M3.25 10h17.5", stroke: "currentColor", strokeWidth: "1.75" }), /* @__PURE__ */ React.createElement("circle", { cx: "16.25", cy: "14", r: "1.15", fill: "currentColor" }), name === "deposit-on" && /* @__PURE__ */ React.createElement("path", { d: "M7.75 14.1 9.35 15.6 12.5 12.2", stroke: "currentColor", strokeWidth: "1.75", strokeLinecap: "round", strokeLinejoin: "round" }));
  }
  if (name === "treasurer") {
    return /* @__PURE__ */ React.createElement("svg", { ...common }, /* @__PURE__ */ React.createElement("path", { d: "M12 4.2 13.85 9l5.15.4-3.95 3.25 1.25 5.05L12 15.1 7.7 17.7l1.25-5.05L5 9.4 10.15 9 12 4.2Z", stroke: "currentColor", strokeWidth: "1.75", strokeLinejoin: "round" }));
  }
  if (name === "share") {
    return /* @__PURE__ */ React.createElement("svg", { ...common, width: 14, height: 14 }, /* @__PURE__ */ React.createElement("circle", { cx: "18", cy: "5", r: "2.4", stroke: "currentColor", strokeWidth: "1.7" }), /* @__PURE__ */ React.createElement("circle", { cx: "18", cy: "19", r: "2.4", stroke: "currentColor", strokeWidth: "1.7" }), /* @__PURE__ */ React.createElement("circle", { cx: "6", cy: "12", r: "2.4", stroke: "currentColor", strokeWidth: "1.7" }), /* @__PURE__ */ React.createElement("path", { d: "M8.2 10.9 15.8 6.2M8.2 13.1 15.8 17.8", stroke: "currentColor", strokeWidth: "1.7", strokeLinecap: "round" }));
  }
  if (name === "copy") {
    return /* @__PURE__ */ React.createElement("svg", { ...common, width: 14, height: 14 }, /* @__PURE__ */ React.createElement("rect", { x: "8", y: "8", width: "10", height: "10", rx: "2", stroke: "currentColor", strokeWidth: "1.8" }), /* @__PURE__ */ React.createElement("path", { d: "M6 15H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v1", stroke: "currentColor", strokeWidth: "1.8", strokeLinecap: "round" }));
  }
  if (name === "close") {
    return /* @__PURE__ */ React.createElement("svg", { ...common }, /* @__PURE__ */ React.createElement("path", { d: "M7 7l10 10M17 7 7 17", stroke: "currentColor", strokeWidth: "1.8", strokeLinecap: "round" }));
  }
  return /* @__PURE__ */ React.createElement("svg", { ...common }, /* @__PURE__ */ React.createElement("path", { d: "M12 5v14M5 12h14", stroke: "currentColor", strokeWidth: "1.8", strokeLinecap: "round" }));
}
function RecurringForm({ groupId, members, onDone }) {
  const t = useT();
  const [title, setTitle] = useState8("");
  const [amount, setAmount] = useState8("");
  const [payer, setPayer] = useState8(members[0]?.user_id || "");
  const [freq, setFreq] = useState8("monthly");
  const [e, setE] = useState8(null);
  const [busy, setBusy] = useState8(false);
  const go = async (ev) => {
    ev.preventDefault();
    setBusy(true);
    try {
      await api.post(`/api/v1/groups/${groupId}/recurring`, {
        title,
        amount: Number(amount),
        split_type: "EQUAL",
        payer_id: payer,
        participant_ids: members.map((m) => m.user_id),
        frequency: freq
      });
      setTitle("");
      setAmount("");
      onDone();
    } catch (err) {
      setE(err);
    } finally {
      setBusy(false);
    }
  };
  return /* @__PURE__ */ React.createElement("form", { onSubmit: go }, /* @__PURE__ */ React.createElement(Group7, { gap: "xs", align: "flex-end" }, /* @__PURE__ */ React.createElement(TextInput2, { label: t("groupDetail.recurringTitle"), required: true, placeholder: t("groupDetail.rentPh"), value: title, onChange: (x) => setTitle(x.target.value), style: { flex: 2 } }), /* @__PURE__ */ React.createElement(TextInput2, { label: "Amount", required: true, inputMode: "decimal", value: amount, onChange: (x) => setAmount(x.target.value), style: { flex: 1 } }), /* @__PURE__ */ React.createElement(Select4, { label: t("groupDetail.recurringPayer"), value: payer, onChange: setPayer, data: members.map((m) => ({ value: m.user_id, label: m.display_name })), style: { flex: 2 } }), /* @__PURE__ */ React.createElement(Select4, { label: t("groupDetail.every"), value: freq, onChange: setFreq, data: ["weekly", "monthly"], style: { width: 110 } }), /* @__PURE__ */ React.createElement(Button4, { type: "submit", loading: busy }, "Add")), /* @__PURE__ */ React.createElement(Err, { e }));
}
export {
  CategoryManager,
  GroupDetail
};

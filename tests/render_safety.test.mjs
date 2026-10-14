import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import vm from "node:vm";

const require = createRequire(import.meta.url);
const React = require("react");
const { renderToStaticMarkup } = require("react-dom/server");
const ts = require("typescript");

function strictContainer(name) {
  return function Container({ children }) {
    React.Children.forEach(children, (child) => {
      if (typeof child === "string" || typeof child === "number") {
        throw new Error(`Unexpected text node in ${name}: ${JSON.stringify(child)}`);
      }
    });
    return React.createElement("div", null, children);
  };
}

const View = strictContainer("View");
const native = {
  View,
  ScrollView: strictContainer("ScrollView"),
  TouchableOpacity: strictContainer("TouchableOpacity"),
  ActivityIndicator: () => React.createElement("i"),
  TextInput: () => React.createElement("input"),
  Text: ({ children }) => React.createElement("span", null, children),
  Platform: { OS: "web" },
  Alert: { alert() {} },
  Linking: { openURL: async () => {} },
  ImageBackground: View,
  Image: { resolveAssetSource: () => ({ uri: "/hero.jpg" }) },
  Share: { share: async () => {} },
  Modal: ({ visible, children }) => visible ? React.createElement("div", null, children) : null,
};
const ui = {
  C: {
    bg: "#fff",
    paper: "#fff",
    ink: "#000",
    muted: "#666",
    orange: "#f50",
    orangeLight: "#fee",
    border: "#ddd",
    green: "#080",
  },
  Txt: native.Text,
  Ico: () => React.createElement("i"),
  Btn: () => React.createElement("button"),
  Chip: () => React.createElement("button"),
  Panel: View,
  Field: () => React.createElement("input"),
  Pill: View,
  Photo: View,
  Line: View,
  Header: View,
  Empty: View,
  BottomNav: View,
  SwitchLine: View,
  webStyle: {},
};
const restaurant = {
  id: "restaurant",
  slug: "restaurant",
  name: "Restaurant",
  address: "Address",
  accepting_orders: true,
  pickup_enabled: true,
  dinein_enabled: true,
  prep_buffer_minutes: 5,
};
const app = {
  loading: false,
  busy: false,
  error: null,
  restaurant,
  items: [],
  offers: [],
  orders: [],
  myOrders: [],
  cart: [],
  catalog: [],
  userId: "staff",
  isMerchant: true,
  customerProfile: null,
  refresh: async () => {},
  addCart() {},
  changeQty() {},
  clearCart() {},
  updateOffer: async () => {},
  createOffer: async () => {},
  updateItem: async () => {},
  createItem: async () => {},
  deleteItem: async () => {},
  uploadPhoto: async () => {},
  updateRestaurant: async () => {},
  advanceOrder: async () => {},
  startCheckout: async () => ({}),
  abandonCheckout: async () => {},
  completeOnboarding: async () => {},
  updateCustomerProfile: async () => {},
  requestPhoneVerification: async () => {},
  verifyCustomerPhone: async () => {},
  signInMerchantPassword: async () => {},
  sendMerchantEmailOtp: async () => {},
  verifyMerchantEmailOtp: async () => {},
  logout: async () => {},
  setConsent: async () => {},
};

function loadComponent(file, exportName) {
  const source = readFileSync(new URL(`../${file}`, import.meta.url), "utf8");
  const code = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
      jsx: ts.JsxEmit.ReactJSX,
      esModuleInterop: true,
    },
  }).outputText;
  const module = { exports: {} };
  const mocks = {
    react: React,
    "react/jsx-runtime": require("react/jsx-runtime"),
    "react-native": native,
    "expo-router": { useRouter: () => ({ push() {}, replace() {} }) },
    "../lib/store": { useApp: () => app },
    "../components/UI": ui,
    "../lib/notifications": { enableWebPush: async () => {}, notifyInTab() {} },
    "../lib/supabase": { supabase: null, invoke: async () => ({}) },
    "../lib/errors": {
      errorMessage: (error) =>
        error instanceof Error ? error.message : String(error),
    },
    "../lib/types": {
      DEPOSIT_PAISE: 3000,
      rupees: (n) => `₹${n / 100}`,
      discount: () => 0,
      available: () => false,
      availabilityWindow: () => "Available",
    },
    "../lib/logic": {
      cartEligible: () => false,
      cartTotal: () => 0,
      parseShopperPhone: () => null,
    },
    "../../assets/images/chatako-food-deals-hero.jpg": 1,
  };
  vm.runInNewContext(code, {
    module,
    exports: module.exports,
    require: (name) => mocks[name] ?? require(name),
    process: { env: {} },
    URLSearchParams,
    Date,
    Math,
    Intl,
    setTimeout,
    clearTimeout,
  });
  return module.exports[exportName];
}

test("merchant dashboard renders without native text-child violations", () => {
  const MerchantApp = loadComponent("src/features/MerchantApp.tsx", "MerchantApp");
  assert.doesNotThrow(() => renderToStaticMarkup(React.createElement(MerchantApp)));
});

test("customer Explore renders without native text-child violations", () => {
  const MainApp = loadComponent("src/features/MainApp.tsx", "MainApp");
  app.userId = null;
  app.isMerchant = false;
  app.customerProfile = {
    id: "customer",
    full_name: "Customer",
    phone_e164: "+919876543210",
    phone_verified: true,
    onboarding_completed_at: "2026-10-13T00:00:00Z",
    marketing_opt_in: false,
  };
  assert.doesNotThrow(() => renderToStaticMarkup(React.createElement(MainApp)));
});

test("customer onboarding renders without native text-child violations", () => {
  const MainApp = loadComponent("src/features/MainApp.tsx", "MainApp");
  app.userId = null;
  app.isMerchant = false;
  app.customerProfile = null;
  assert.doesNotThrow(() => renderToStaticMarkup(React.createElement(MainApp)));
});

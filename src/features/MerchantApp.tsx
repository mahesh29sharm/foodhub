import React, { useEffect, useRef, useState } from "react";
import {
  View,
  ScrollView,
  TouchableOpacity,
  Alert,
  Platform,
  TextInput,
  Linking,
  Modal,
} from "react-native";
import { useRouter } from "expo-router";
import { useApp } from "../lib/store";
import {
  C,
  Txt,
  Ico,
  Btn,
  Chip,
  Panel,
  Field,
  Pill,
  Photo,
  Line,
  Header,
  Empty,
  BottomNav,
  SwitchLine,
  webStyle,
} from "../components/UI";
import {
  Offer,
  MenuItem,
  Order,
  MerchantOrderAction,
  available,
  availabilityWindow,
  rupees,
  discount,
} from "../lib/types";
import { enableWebPush, notifyInTab } from "../lib/notifications";
import { supabase } from "../lib/supabase";
import { errorMessage } from "../lib/errors";
type Tab = "Orders" | "Offers" | "Menu" | "Business";
const nextState: Partial<
  Record<Order["status"], { action: MerchantOrderAction; label: string }>
> = {
  awaiting_acceptance: {
    action: "accept_and_prepare",
    label: "Accept & Prepare",
  },
  accepted: { action: "ready", label: "Mark Ready" },
  preparing: { action: "ready", label: "Mark Ready" },
  ready: { action: "completed", label: "Complete Order" },
};
const showError = (e: unknown) => {
  const msg = errorMessage(e);
  if (Platform.OS === "web" && typeof window !== "undefined") window.alert(msg);
  else Alert.alert("Could not complete action", msg);
};
const confirmDelete = (name: string, remove: () => void) => {
  if (Platform.OS === "web" && typeof window !== "undefined") {
    if (
      window.confirm(
        `Delete ${name}? It will be hidden from customers and retained in order history.`,
      )
    )
      remove();
    return;
  }
  Alert.alert(
    "Delete menu item?",
    `${name} will be hidden from customers and retained in order history.`,
    [
      { text: "Cancel", style: "cancel" },
      { text: "Delete", style: "destructive", onPress: remove },
    ],
  );
};
export function MerchantApp() {
  const a = useApp(),
    router = useRouter();
  const [whatsOn, setWhatsOn] = useState(false),
    [staffPhone, setStaffPhone] = useState(""),
    [businessWhatsApp, setBusinessWhatsApp] = useState(""),
    [tab, setTab] = useState<Tab>("Orders"),
    [filter, setFilter] = useState("New"),
    [selected, setSelected] = useState<string | null>(null),
    [completionOrderId, setCompletionOrderId] = useState<string | null>(null),
    [pendingOrderId, setPendingOrderId] = useState<string | null>(null),
    [actionErrors, setActionErrors] = useState<
      Record<string, { message: string; action: MerchantOrderAction }>
    >({}),
    [editing, setEditing] = useState<string | null>(null),
    [editingMenu, setEditingMenu] = useState<string | null>(null),
    [showAdd, setShowAdd] = useState(false),
    [merchantEmail, setMerchantEmail] = useState(""),
    [merchantPassword, setMerchantPassword] = useState(""),
    [otp, setOtp] = useState(""),
    [otpSent, setOtpSent] = useState(false),
    [useEmailCode, setUseEmailCode] = useState(false),
    [pushStatus, setPushStatus] = useState(""),
    [merchantNotice, setMerchantNotice] = useState(""),
    [code, setCode] = useState(""),
    [paymentMethod, setPaymentMethod] = useState("UPI");
  const previousNewCount = useRef(0);
  const actionable = a.orders.filter(
    (o) =>
      !["completed", "rejected", "cancelled", "expired", "no_show"].includes(
        o.status,
      ),
  );
  const newOrders = actionable.filter(
    (x) => x.status === "awaiting_acceptance",
  );
  const inProgress = actionable.filter((x) =>
    ["accepted", "preparing"].includes(x.status),
  );
  const ready = actionable.filter((x) => x.status === "ready");
  const visibleOrders = (
    filter === "New"
      ? newOrders
      : filter === "Preparing"
        ? inProgress
        : filter === "Ready"
          ? ready
          : a.orders
  ).slice().sort((left, right) => {
    const priority = (order: Order) =>
      order.status === "awaiting_acceptance"
        ? 0
        : order.status === "accepted" || order.status === "preparing"
          ? 1
          : order.status === "ready"
            ? 2
            : 3;
    return priority(left) - priority(right) ||
      new Date(right.created_at).getTime() - new Date(left.created_at).getTime();
  });
  const currentOrder = a.orders.find((o) => o.id === selected);
  const completionOrder = a.orders.find((o) => o.id === completionOrderId);
  useEffect(() => {
    setBusinessWhatsApp(a.restaurant.whatsapp_business_phone || "");
  }, [a.restaurant.whatsapp_business_phone]);
  useEffect(() => {
    if (!supabase || !a.userId || !a.isMerchant) return;
    supabase
      .from("fd_restaurant_staff")
      .select("alert_whatsapp_opt_in,contact_phone")
      .eq("restaurant_id", a.restaurant.id)
      .eq("user_id", a.userId)
      .maybeSingle()
      .then(({ data }) => {
        if (data) {
          setWhatsOn(data.alert_whatsapp_opt_in);
          setStaffPhone(data.contact_phone || "");
        }
      });
  }, [a.userId, a.isMerchant, a.restaurant.id]);
  useEffect(() => {
    if (
      a.isMerchant &&
      newOrders.length > previousNewCount.current
    ) {
      notifyInTab(
        `New ${a.restaurant.name} order`,
        `${newOrders.length} booking(s) waiting to be accepted`,
      );
    }
    previousNewCount.current = newOrders.length;
  }, [a.isMerchant, a.restaurant.name, newOrders.length]);
  async function act(id: string, action: MerchantOrderAction) {
    if (pendingOrderId) return;
    setPendingOrderId(id);
    setActionErrors((errors) => {
      const next = { ...errors };
      delete next[id];
      return next;
    });
    try {
      if (action === "completed") {
        if (!/^\d{4}$/.test(code.trim()))
          throw Error("Enter the customer’s 4-digit code");
        await a.advanceOrder(id, "completed", paymentMethod, code.trim());
        setCode("");
        setCompletionOrderId(null);
      } else {
        await a.advanceOrder(id, action);
      }
    } catch (e) {
      setActionErrors((errors) => ({
        ...errors,
        [id]: {
          message: errorMessage(e),
          action,
        },
      }));
    } finally {
      setPendingOrderId(null);
    }
  }
  function rejectOrder(id: string) {
    const reject = () => void act(id, "rejected");
    if (Platform.OS === "web" && typeof window !== "undefined") {
      if (window.confirm("Reject this order and initiate its ₹30 refund?")) reject();
      return;
    }
    Alert.alert(
      "Reject order?",
      "The reserved stock will be released and the ₹30 refund will be initiated.",
      [
        { text: "Cancel", style: "cancel" },
        { text: "Reject & refund", style: "destructive", onPress: reject },
      ],
    );
  }
  function contactCustomer(order: Order) {
    const phone = order.customer_phone?.replace(/[^+\d]/g, "");
    if (!phone) {
      setActionErrors((errors) => ({
        ...errors,
        [order.id]: { message: "This order has no customer phone number", action: nextState[order.status]?.action || "ready" },
      }));
      return;
    }
    void Linking.openURL(`tel:${phone}`).catch((error) =>
      setActionErrors((errors) => ({
        ...errors,
        [order.id]: { message: errorMessage(error), action: nextState[order.status]?.action || "ready" },
      })),
    );
  }
  async function ensurePush() {
    try {
      await enableWebPush(a.restaurant.id);
      setPushStatus("Browser notifications enabled on this device");
    } catch (e) {
      setPushStatus(e instanceof Error ? e.message : String(e));
    }
  }
  if (!a.loading && !a.isMerchant) {
    return (
      <View
        style={{
          flex: 1,
          backgroundColor: C.bg,
          padding: 25,
          justifyContent: "center",
        }}
      >
        <View style={[webStyle, { maxWidth: 460, gap: 14 }]}>
          <Txt size={38}>👋</Txt>
          <Txt weight="bold" size={29}>
            Merchant sign-in
          </Txt>
          <Txt color={C.muted}>
            Use the same email account assigned as owner or staff in Supabase
            Auth. Signing in with a different phone account will not grant
            access.
          </Txt>
          {Boolean(a.error) && (
            <Panel style={{ backgroundColor: "#fff0e9" }}>
              <Txt color={C.orange}>{a.error}</Txt>
              <Btn
                label="Retry connection"
                small
                secondary
                onPress={() => void a.refresh()}
              />
            </Panel>
          )}
          {Boolean(a.userId) && (
            <Panel style={{ gap: 8 }}>
              <Txt weight="bold">
                Signed in, but not assigned to this merchant
              </Txt>
              <Txt color={C.muted} size={12}>
                Check fd_restaurant_staff for the signed-in Auth user ID and
                restaurant slug. If you onboarded an email user, do not sign in
                with a separate phone account.
              </Txt>
              <Btn
                label="Sign out and switch account"
                secondary
                small
                onPress={() => void a.logout()}
              />
            </Panel>
          )}
          <Panel style={{ gap: 12 }}>
            <Field
              label="Owner/staff email"
              placeholder="owner@restaurant.com"
              value={merchantEmail}
              onChangeText={setMerchantEmail}
              keyboardType="email-address"
            />
            {useEmailCode ? (
              <>
                {otpSent && (
                  <Field
                    label="Email verification code"
                    placeholder="6-digit code"
                    value={otp}
                    onChangeText={setOtp}
                    keyboardType="number-pad"
                  />
                )}
                <Btn
                  label={otpSent ? "Verify email code" : "Email a sign-in code"}
                  onPress={async () => {
                    try {
                      if (!merchantEmail.includes("@"))
                        throw Error("Enter a valid email address");
                      if (otpSent)
                        await a.verifyMerchantEmailOtp(merchantEmail, otp);
                      else {
                        await a.sendMerchantEmailOtp(merchantEmail);
                        setOtpSent(true);
                      }
                    } catch (e) {
                      showError(e);
                    }
                  }}
                />
                <Txt size={11} color={C.muted}>
                  Email-code login requires your Supabase email template to
                  include the OTP token. Default magic-link templates may need
                  editing.
                </Txt>
              </>
            ) : (
              <>
                <Field
                  label="Password"
                  secureTextEntry
                  placeholder="Existing account password"
                  value={merchantPassword}
                  onChangeText={setMerchantPassword}
                />
                <Btn
                  label="Sign in to dashboard"
                  onPress={async () => {
                    try {
                      if (!merchantEmail.includes("@") || !merchantPassword)
                        throw Error("Enter email and password");
                      await a.signInMerchantPassword(
                        merchantEmail,
                        merchantPassword,
                      );
                    } catch (e) {
                      showError(e);
                    }
                  }}
                />
              </>
            )}
            <Btn
              label={
                useEmailCode
                  ? "Use email and password instead"
                  : "Use email verification code instead"
              }
              secondary
              onPress={() => {
                setUseEmailCode(!useEmailCode);
                setOtpSent(false);
                setOtp("");
              }}
            />
          </Panel>
          <Btn
            label="Back to customer site"
            secondary
            onPress={() =>
              router.replace({
                pathname: "/",
                params: {
                  r:
                    a.restaurant.slug ||
                    process.env.EXPO_PUBLIC_RESTAURANT_SLUG ||
                    "",
                },
              })
            }
          />
          <Txt color={C.muted} size={12}>
            Merchant permissions come from this restaurant’s fd_restaurant_staff
            membership.
          </Txt>
        </View>
      </View>
    );
  }
  if (a.loading) {
    return (
      <View style={{ flex: 1, justifyContent: "center", alignItems: "center" }}>
        <Txt>Loading restaurant...</Txt>
      </View>
    );
  }
  return (
    <View style={{ flex: 1, backgroundColor: "#f7f7f3" }}>
      <ScrollView
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{
          paddingHorizontal: 18,
          paddingTop: Platform.OS === "web" ? 25 : 44,
          paddingBottom: 40,
        }}
      >
        <View style={webStyle}>
          <View
            style={{
              flexDirection: "row",
              justifyContent: "space-between",
              marginBottom: 10,
            }}
          >
            <TouchableOpacity
              onPress={() =>
                router.push({ pathname: "/", params: { r: a.restaurant.slug } })
              }
              style={{ flexDirection: "row", alignItems: "center", gap: 6 }}
            >
              <Ico name="arrow-back" size={17} />
              <Txt size={12} color={C.muted}>
                Customer site
              </Txt>
            </TouchableOpacity>
            <Pill label="SUPABASE LIVE" kind="green" />
          </View>
          <Header
            eyebrow={`${a.restaurant.name.toUpperCase()} / PARTNER`}
            title={
              selected
                ? "Order details"
                : tab === "Orders"
                  ? "Let’s get cooking."
                  : tab === "Offers"
                    ? "Make a deal."
                    : tab === "Menu"
                      ? "Your kitchen menu."
                      : "The big picture."
            }
            right={
              <TouchableOpacity
                onPress={ensurePush}
                style={{
                  padding: 10,
                  backgroundColor: C.paper,
                  borderRadius: 14,
                }}
              >
                <Ico name="notifications-outline" size={21} />
              </TouchableOpacity>
            }
          />
          {Boolean(pushStatus) && (
            <Panel style={{ backgroundColor: C.orangeLight, marginBottom: 13 }}>
              <Txt size={12}>{pushStatus}</Txt>
            </Panel>
          )}
          {Boolean(a.error) && (
            <Panel style={{ backgroundColor: "#fff0e9", marginBottom: 13 }}>
              <Txt color={C.orange}>{a.error}</Txt>
            </Panel>
          )}
          {selected && currentOrder ? (
            <>
              <TouchableOpacity
                onPress={() => {
                  setSelected(null);
                  setCode("");
                }}
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  gap: 8,
                  marginBottom: 13,
                }}
              >
                <Ico name="arrow-back" />
                <Txt>All orders</Txt>
              </TouchableOpacity>
              <Panel style={{ gap: 10 }}>
                <View
                  style={{
                    flexDirection: "row",
                    justifyContent: "space-between",
                  }}
                >
                  <Txt weight="bold" size={20}>
                    #{currentOrder.id.slice(0, 12)}
                  </Txt>
                  <Pill
                    label={currentOrder.status.replaceAll("_", " ")}
                    kind="orange"
                  />
                </View>
                <Txt color={C.muted}>
                  👤 {currentOrder.customer_name || "Customer"} ·{" "}
                  {currentOrder.customer_phone}
                </Txt>
                <Txt color={C.muted}>
                  {currentOrder.mode === "pickup" ? "🥡 Pickup" : "🍽️ Dine-in"}{" "}
                  ·{" "}
                  {new Date(currentOrder.arrival_at).toLocaleTimeString(
                    "en-IN",
                    {
                      timeZone: "Asia/Kolkata",
                      hour: "numeric",
                      minute: "2-digit",
                    },
                  )}
                </Txt>
                <Line />
                {currentOrder.rows.map((line, i) => (
                  <View
                    key={i}
                    style={{
                      flexDirection: "row",
                      justifyContent: "space-between",
                    }}
                  >
                    <Txt>
                      {line.quantity} × {line.name}
                    </Txt>
                    <Txt>{rupees(line.quantity * line.unit_paise)}</Txt>
                  </View>
                ))}
                <Line />
                <View
                  style={{
                    flexDirection: "row",
                    justifyContent: "space-between",
                  }}
                >
                  <Txt>Deposit already paid</Txt>
                  <Txt>₹30</Txt>
                </View>
                <View
                  style={{
                    flexDirection: "row",
                    justifyContent: "space-between",
                  }}
                >
                  <Txt weight="bold">Collect at store</Txt>
                  <Txt size={22} weight="bold">
                    {rupees(currentOrder.balance_paise)}
                  </Txt>
                </View>
              </Panel>
              <View style={{ gap: 9, marginTop: 15 }}>
                {nextState[currentOrder.status] && (
                  <Btn
                    label={nextState[currentOrder.status]!.label}
                    loading={pendingOrderId === currentOrder.id}
                    disabled={Boolean(pendingOrderId)}
                    onPress={() => {
                      const next = nextState[currentOrder.status]!;
                      if (next.action === "completed") {
                        setCompletionOrderId(currentOrder.id);
                      } else {
                        void act(currentOrder.id, next.action);
                      }
                    }}
                  />
                )}
                {currentOrder.status === "awaiting_acceptance" && (
                  <Btn
                    secondary
                    label="Reject & initiate refund"
                    disabled={Boolean(pendingOrderId)}
                    onPress={() => rejectOrder(currentOrder.id)}
                  />
                )}
                <Btn
                  secondary
                  label="Contact customer"
                  onPress={() => contactCustomer(currentOrder)}
                />
                {actionErrors[currentOrder.id] && (
                  <Panel style={{ backgroundColor: "#fff0e9", gap: 8 }}>
                    <Txt color={C.orange} size={12}>
                      {actionErrors[currentOrder.id].message}
                    </Txt>
                    <Btn
                      small
                      secondary
                      label="Retry"
                      loading={pendingOrderId === currentOrder.id}
                      onPress={() =>
                        void act(
                          currentOrder.id,
                          actionErrors[currentOrder.id].action,
                        )
                      }
                    />
                  </Panel>
                )}
              </View>
            </>
          ) : (
            <>
              {tab === "Orders" && (
                <>
                  <Panel style={{ marginBottom: 16 }}>
                    <SwitchLine
                      title="Accepting new reservations"
                      subtitle="Pause bookings with one tap during a rush."
                      value={a.restaurant.accepting_orders}
                      onPress={() =>
                        a
                          .updateRestaurant({
                            accepting_orders: !a.restaurant.accepting_orders,
                          })
                          .catch(showError)
                      }
                    />
                  </Panel>
                  <View
                    style={{ flexDirection: "row", gap: 8, marginBottom: 14 }}
                  >
                    {[
                      { n: newOrders.length, label: "New", color: C.orange },
                      {
                        n: inProgress.length,
                        label: "Preparing",
                        color: C.ink,
                      },
                      { n: ready.length, label: "Ready", color: C.green },
                    ].map((s) => (
                      <TouchableOpacity
                        key={s.label}
                        onPress={() => setFilter(s.label)}
                        style={{
                          flex: 1,
                          backgroundColor:
                            filter === s.label ? "#fff0e9" : "#fff",
                          borderColor: filter === s.label ? C.orange : C.border,
                          borderWidth: 1,
                          borderRadius: 14,
                          paddingVertical: 11,
                          paddingHorizontal: 8,
                          alignItems: "center",
                        }}
                      >
                        <Txt
                          size={13}
                          weight="bold"
                          color={filter === s.label ? s.color : C.muted}
                        >
                          {s.label} · {s.n}
                        </Txt>
                      </TouchableOpacity>
                    ))}
                  </View>
                  {visibleOrders.length === 0 ? (
                    <Empty
                      title="All caught up"
                      subtitle="New bookings will show up here as soon as payment is confirmed."
                    />
                  ) : (
                    visibleOrders.map((o) => {
                      const primary = nextState[o.status];
                      const actionError = actionErrors[o.id];
                      const isPending = pendingOrderId === o.id;
                      return (
                        <Panel key={o.id} style={{ marginBottom: 10, gap: 9 }}>
                          <View
                            style={{
                              flexDirection: "row",
                              justifyContent: "space-between",
                            }}
                          >
                            <Txt weight="bold" size={17}>
                              #{o.id.slice(0, 12)}
                            </Txt>
                            <Pill
                              label={o.status.replaceAll("_", " ")}
                              kind={o.status === "ready" ? "green" : "orange"}
                            />
                          </View>
                          <Txt weight="medium">
                            {o.rows
                              .map((r) => `${r.quantity} × ${r.name}`)
                              .join(", ")}
                          </Txt>
                          <View
                            style={{
                              flexDirection: "row",
                              justifyContent: "space-between",
                            }}
                          >
                            <Txt color={C.muted} size={12}>
                              {o.mode === "pickup" ? "🥡 Pickup" : "🍽️ Dine-in"}{" "}
                              ·{" "}
                              {new Date(o.arrival_at).toLocaleTimeString(
                                "en-IN",
                                {
                                  timeZone: "Asia/Kolkata",
                                  hour: "numeric",
                                  minute: "2-digit",
                                },
                              )}
                            </Txt>
                            <Txt weight="bold">
                              {rupees(o.balance_paise)} due
                            </Txt>
                          </View>
                          {primary && (
                            <Btn
                              label={primary.label}
                              loading={isPending}
                              disabled={Boolean(pendingOrderId)}
                              onPress={() => {
                                if (primary.action === "completed") {
                                  setCompletionOrderId(o.id);
                                  setCode("");
                                } else {
                                  void act(o.id, primary.action);
                                }
                              }}
                            />
                          )}
                          <View style={{ flexDirection: "row", gap: 7 }}>
                            {o.status === "awaiting_acceptance" && (
                              <Btn
                                small
                                secondary
                                label="Reject"
                                disabled={Boolean(pendingOrderId)}
                                style={{ flex: 1 }}
                                onPress={() => rejectOrder(o.id)}
                              />
                            )}
                            <Btn
                              small
                              secondary
                              label="Contact"
                              style={{ flex: 1 }}
                              onPress={() => contactCustomer(o)}
                            />
                            <Btn
                              small
                              secondary
                              label="Details"
                              style={{ flex: 1 }}
                              onPress={() => setSelected(o.id)}
                            />
                          </View>
                          {actionError && (
                            <View
                              style={{
                                backgroundColor: "#fff0e9",
                                borderRadius: 12,
                                padding: 10,
                                gap: 7,
                              }}
                            >
                              <Txt color={C.orange} size={12}>
                                {actionError.message}
                              </Txt>
                              <Btn
                                small
                                secondary
                                label="Retry"
                                loading={isPending}
                                disabled={Boolean(pendingOrderId) && !isPending}
                                onPress={() => void act(o.id, actionError.action)}
                              />
                            </View>
                          )}
                        </Panel>
                      );
                    })
                  )}
                </>
              )}
              {tab === "Offers" && (
                <>
                  <Panel
                    style={{
                      gap: 10,
                      marginBottom: 18,
                      backgroundColor: "#fff9f2",
                    }}
                  >
                    <View
                      style={{
                        flexDirection: "row",
                        justifyContent: "space-between",
                        alignItems: "center",
                      }}
                    >
                      <Txt size={18} weight="bold">
                        🏆 Top 3 today
                      </Txt>
                      <Pill label="PINNED" kind="orange" />
                    </View>
                    <Txt size={12} color={C.muted}>
                      Pin the three dishes you want customers to see first. One
                      tap to swap.
                    </Txt>
                    {[1, 2, 3].map((rank) => {
                      const o = a.offers.find(
                          (x) => x.featured_rank === rank && available(x),
                        ),
                        item = a.items.find((i) => i.id === o?.menu_item_id);
                      return (
                        <TouchableOpacity
                          key={rank}
                          onPress={() =>
                            setEditing(o?.menu_item_id || "pick-top-" + rank)
                          }
                          style={{
                            padding: 10,
                            borderRadius: 12,
                            backgroundColor: "#fff",
                            flexDirection: "row",
                            alignItems: "center",
                            gap: 11,
                          }}
                        >
                          <Txt size={17} weight="bold" color={C.orange}>
                            0{rank}
                          </Txt>
                          <Txt style={{ flex: 1 }} weight="medium">
                            {item?.name || "Choose a dish"}
                          </Txt>
                          <Ico name="swap-horizontal" color={C.muted} />
                        </TouchableOpacity>
                      );
                    })}
                  </Panel>
                  <View
                    style={{
                      flexDirection: "row",
                      justifyContent: "space-between",
                      alignItems: "center",
                      marginBottom: 11,
                    }}
                  >
                    <Txt weight="bold" size={20}>
                      Offers
                    </Txt>
                    <Btn
                      small
                      label="New deal +"
                      onPress={() => setEditing("new")}
                    />
                  </View>
                  {a.offers
                    .filter((o) => a.items.some((i) => i.id === o.menu_item_id))
                    .map((o) => {
                      const item = a.items.find(
                        (i) => i.id === o.menu_item_id,
                      )!, stockLeft=Math.max(0,o.stock_total-o.stock_reserved), isAvailable=available(o), status=!o.is_active?'Paused':stockLeft===0?'Sold out':isAvailable?'Live':new Date(o.ends_at).getTime()<Date.now()&&!o.is_everyday?'Expired':'Scheduled';
                      return (
                        <Panel key={o.id} style={{ marginBottom: 10 }}>
                          <View style={{ flexDirection: "row", gap: 12 }}>
                            <View style={{ width: 75 }}>
                              <Photo
                                url={item.image_url}
                                emoji={item.emoji}
                                height={76}
                              />
                            </View>
                            <View style={{ flex: 1, gap: 5 }}>
                              <Txt weight="bold">{item.name}</Txt>
                              <View
                                style={{
                                  flexDirection: "row",
                                  gap: 7,
                                  alignItems: "center",
                                }}
                              >
                                <Txt weight="bold" color={C.orange}>
                                  {rupees(o.price_paise)}
                                </Txt>
                                <Txt
                                  color={C.muted}
                                  size={11}
                                  style={{ textDecorationLine: "line-through" }}
                                >
                                  {rupees(item.price_paise)}
                                </Txt>
                                <Pill
                                  label={`${discount(item.price_paise, o.price_paise)}% off`}
                                  kind="green"
                                />
                              </View>
                              <Txt size={11} color={C.muted}>
                                {stockLeft}{" "}
                                portions available{" "}
                                {o.is_everyday ? "· Everyday" : ""}
                              </Txt>
                              <Txt size={11} color={C.muted}>
                                {availabilityWindow(o)} · {status}
                              </Txt>
                            </View>
                            <TouchableOpacity
                              onPress={() =>
                                a
                                  .updateOffer(o.id, {
                                    is_active: !o.is_active,
                                  })
                                  .catch(showError)
                              }
                            >
                              <Ico
                                name={
                                  o.is_active ? "pause-circle" : "play-circle"
                                }
                                size={27}
                                color={o.is_active ? C.orange : C.green}
                              />
                            </TouchableOpacity>
                          </View>
                          <Line />
                          <View
                            style={{
                              flexDirection: "row",
                              justifyContent: "space-between",
                              alignItems: "center",
                            }}
                          >
                            <View
                              style={{
                                flexDirection: "row",
                                gap: 8,
                                alignItems: "center",
                              }}
                            >
                              <TouchableOpacity
                                onPress={() =>
                                  a
                                    .updateOffer(o.id, {
                                      stock_total: Math.max(
                                        o.stock_reserved,
                                        o.stock_total - 5,
                                      ),
                                    })
                                    .catch(showError)
                                }
                                style={{
                                  padding: 9,
                                  backgroundColor: C.bg,
                                  borderRadius: 10,
                                }}
                              >
                                <Ico name="remove" size={18} />
                              </TouchableOpacity>
                              <Txt weight="bold">
                                {Math.max(0, o.stock_total - o.stock_reserved)}{" "}
                                left
                              </Txt>
                              <TouchableOpacity
                                onPress={() =>
                                  a
                                    .updateOffer(o.id, {
                                      stock_total: o.stock_total + 5,
                                    })
                                    .catch(showError)
                                }
                                style={{
                                  padding: 9,
                                  backgroundColor: C.bg,
                                  borderRadius: 10,
                                }}
                              >
                                <Ico name="add" size={18} />
                              </TouchableOpacity>
                            </View>
                            <TouchableOpacity
                              onPress={() => setEditing(o.menu_item_id)}
                            >
                              <Txt color={C.orange} weight="bold" size={13}>
                                Quick edit →
                              </Txt>
                            </TouchableOpacity>
                          </View>
                        </Panel>
                      );
                    })}
                </>
              )}
              {tab === "Menu" && (
                <>
                  <View
                    style={{
                      flexDirection: "row",
                      justifyContent: "space-between",
                      alignItems: "center",
                      marginBottom: 14,
                    }}
                  >
                    <Txt size={20} weight="bold">
                      All your dishes
                    </Txt>
                    <Btn
                      label="Add dish"
                      small
                      onPress={() => setShowAdd(true)}
                      icon="add"
                    />
                  </View>
                  <Txt color={C.muted} size={12} style={{ marginBottom: 16 }}>
                    Upload or replace a photo, edit details, or safely remove a
                    dish.
                  </Txt>
                  {!a.items.length ? (
                    <Empty
                      title="No dishes yet"
                      subtitle="Add your first real menu item to create an offer."
                    />
                  ) : (
                    a.items.map((item) => (
                      <Panel key={item.id} style={{ marginBottom: 10 }}>
                        <View
                          style={{
                            flexDirection: "row",
                            gap: 12,
                            alignItems: "center",
                          }}
                        >
                          <TouchableOpacity
                            onPress={() =>
                              a.uploadPhoto(item.id).catch(showError)
                            }
                            style={{ width: 86 }}
                          >
                            <Photo
                              url={item.image_url}
                              emoji={item.emoji}
                              height={86}
                            />
                            <View
                              style={{
                                position: "absolute",
                                bottom: 3,
                                right: 3,
                                backgroundColor: C.ink,
                                padding: 4,
                                borderRadius: 18,
                              }}
                            >
                              <Ico name="camera" size={12} color="#fff" />
                            </View>
                          </TouchableOpacity>
                          <View style={{ flex: 1, gap: 5 }}>
                            <Txt weight="bold">{item.name}</Txt>
                            <Txt color={C.muted} size={12}>
                              {item.category} · {rupees(item.price_paise)}
                            </Txt>
                            <View style={{ flexDirection: "row", gap: 5 }}>
                              {item.is_persistent && (
                                <Pill label="Everyday staple" kind="green" />
                              )}
                              <Pill
                                label={item.is_active ? "On menu" : "Hidden"}
                              />
                            </View>
                          </View>
                          <TouchableOpacity
                            onPress={() => setEditingMenu(item.id)}
                          >
                            <Ico name="create-outline" color={C.orange} />
                          </TouchableOpacity>
                        </View>
                        <Line />
                        <Btn
                          small
                          secondary
                          label={
                            item.image_url ? "Replace image" : "Upload image"
                          }
                          icon="camera-outline"
                          onPress={() =>
                            a.uploadPhoto(item.id).catch(showError)
                          }
                        />
                        <SwitchLine
                          title="Keep as an everyday staple"
                          value={item.is_persistent}
                          onPress={() =>
                            a
                              .updateItem(item.id, {
                                is_persistent: !item.is_persistent,
                              })
                              .catch(showError)
                          }
                        />
                        <SwitchLine
                          title="Show on menu"
                          value={item.is_active}
                          onPress={() =>
                            a
                              .updateItem(item.id, {
                                is_active: !item.is_active,
                              })
                              .catch(showError)
                          }
                        />
                        <Btn
                          small
                          secondary
                          label="Delete item"
                          icon="trash-outline"
                          onPress={() =>
                            confirmDelete(item.name, () =>
                              a.deleteItem(item.id).catch(showError),
                            )
                          }
                        />
                      </Panel>
                    ))
                  )}
                </>
              )}
              {tab === "Business" && (
                <>
                  <View
                    style={{ flexDirection: "row", gap: 10, marginBottom: 12 }}
                  >
                    {[
                      {
                        label: "Paid orders",
                        value: a.orders.filter((x) => x.status === "completed")
                          .length,
                      },
                      {
                        label: "Booked value",
                        value: rupees(
                          a.orders.reduce((s, o) => s + o.total_paise, 0),
                        ),
                      },
                    ].map((x) => (
                      <Panel key={x.label} style={{ flex: 1 }}>
                        <Txt size={12} color={C.muted}>
                          {x.label}
                        </Txt>
                        <Txt size={24} weight="bold">
                          {x.value}
                        </Txt>
                      </Panel>
                    ))}
                  </View>
                  <Panel style={{ gap: 12 }}>
                    <Txt weight="bold" size={18}>
                      Restaurant settings
                    </Txt>
                    <SwitchLine
                      title="Accepting new orders"
                      subtitle="Turns checkout on/off instantly"
                      value={a.restaurant.accepting_orders}
                      onPress={() =>
                        a
                          .updateRestaurant({
                            accepting_orders: !a.restaurant.accepting_orders,
                          })
                          .catch(showError)
                      }
                    />
                    <Line />
                    <SwitchLine
                      title="Pickup bookings"
                      value={a.restaurant.pickup_enabled}
                      onPress={() =>
                        a
                          .updateRestaurant({
                            pickup_enabled: !a.restaurant.pickup_enabled,
                          })
                          .catch(showError)
                      }
                    />
                    <SwitchLine
                      title="Dine-in bookings"
                      value={a.restaurant.dinein_enabled}
                      onPress={() =>
                        a
                          .updateRestaurant({
                            dinein_enabled: !a.restaurant.dinein_enabled,
                          })
                          .catch(showError)
                      }
                    />
                    <Line />
                    <Field
                      label="Chatako WhatsApp Business number (+91...)"
                      placeholder="+9198XXXXXXXX"
                      value={businessWhatsApp}
                      onChangeText={setBusinessWhatsApp}
                      keyboardType="phone-pad"
                    />
                    <Btn
                      small
                      secondary
                      label="Save business WhatsApp number"
                      onPress={() => {
                        const value = businessWhatsApp.trim();
                        if (value && !/^\+91[6-9]\d{9}$/.test(value)) {
                          showError("Use +91 followed by a valid 10-digit mobile number");
                          return;
                        }
                        void a.updateRestaurant({
                          whatsapp_business_phone: value || null,
                        }).catch(showError);
                      }}
                    />
                    <Txt size={11} color={C.muted}>
                      Used as the merchant’s contact number. The pilot does not
                      send automated marketing messages.
                    </Txt>
                    <Line />
                    <Btn
                      label="Enable browser order alerts"
                      onPress={ensurePush}
                      secondary
                      icon="notifications-outline"
                    />
                    <Line />
                    <SwitchLine
                      title="New order alerts on WhatsApp"
                      subtitle="Opt in for utility messages on this number."
                      value={whatsOn}
                      onPress={() => setWhatsOn(!whatsOn)}
                    />
                    <Field
                      label="My WhatsApp number (+91...)"
                      placeholder="+9198XXXXXXXX"
                      value={staffPhone}
                      onChangeText={setStaffPhone}
                      keyboardType="phone-pad"
                    />
                    <Btn
                      small
                      label="Save WhatsApp alert settings"
                      secondary
                      onPress={async () => {
                        try {
                          if (!supabase || !a.userId)
                            throw Error("Sign in first");
                          if (whatsOn && !/^\+91\d{10}$/.test(staffPhone))
                            throw Error("Use +91 followed by 10 digits");
                          const { error } = await supabase
                            .from("fd_restaurant_staff")
                            .update({
                              alert_whatsapp_opt_in: whatsOn,
                              contact_phone: staffPhone,
                            })
                            .eq("restaurant_id", a.restaurant.id)
                            .eq("user_id", a.userId);
                          if (error) throw error;
                          setPushStatus("WhatsApp alert preference saved");
                        } catch (e) {
                          showError(e);
                        }
                      }}
                    />
                    <Txt size={12} color={C.muted}>
                      Transactional order alerts are separate from customer
                      marketing consent.
                    </Txt>
                  </Panel>
                  <Panel style={{ marginTop: 14 }}>
                    <Txt weight="bold" size={16}>
                      Need to notify customers?
                    </Txt>
                    <Txt color={C.muted} size={12}>
                      Only customers who explicitly opted in are eligible for a
                      future manual campaign. No automated promotional messages
                      are enabled for this pilot.
                    </Txt>
                    <Btn
                      label="View manual campaign guidance"
                      small
                      secondary
                      onPress={() =>
                        setMerchantNotice(
                          "Use the consent list only for a carefully managed manual campaign. Never message customers who have not opted in.",
                        )
                      }
                      style={{ marginTop: 10 }}
                    />
                    {Boolean(merchantNotice) && (
                      <Txt size={12} color={C.orange} style={{ marginTop: 10 }}>
                        {merchantNotice}
                      </Txt>
                    )}
                  </Panel>
                  <Btn
                    label="Log out"
                    secondary
                    style={{ marginTop: 15 }}
                    onPress={a.logout}
                  />
                </>
              )}
            </>
          )}
        </View>
      </ScrollView>
      {!selected && (
        <BottomNav merchant active={tab} onSelect={(x: Tab) => setTab(x)} />
      )}
      <Modal
        visible={Boolean(completionOrder)}
        transparent
        animationType="slide"
        onRequestClose={() => {
          if (!pendingOrderId) setCompletionOrderId(null);
        }}
      >
        <View
          style={{
            flex: 1,
            justifyContent: "flex-end",
            backgroundColor: "rgba(34,30,26,0.38)",
          }}
        >
          <View
            style={{
              backgroundColor: C.paper,
              borderTopLeftRadius: 24,
              borderTopRightRadius: 24,
              padding: 20,
              paddingBottom: Platform.OS === "web" ? 24 : 36,
              gap: 13,
              width: "100%",
              maxWidth: 640,
              alignSelf: "center",
            }}
          >
            <View
              style={{
                flexDirection: "row",
                justifyContent: "space-between",
                alignItems: "center",
              }}
            >
              <View>
                <Txt weight="bold" size={20}>
                  Complete order
                </Txt>
                <Txt color={C.muted} size={12}>
                  #{completionOrder?.id.slice(0, 12)}
                </Txt>
              </View>
              <TouchableOpacity
                disabled={Boolean(pendingOrderId)}
                onPress={() => setCompletionOrderId(null)}
                style={{ padding: 8 }}
              >
                <Ico name="close" size={24} />
              </TouchableOpacity>
            </View>
            <Panel style={{ padding: 13 }}>
              <Txt color={C.muted} size={12}>
                Collect remaining balance
              </Txt>
              <Txt weight="bold" size={27}>
                {rupees(completionOrder?.balance_paise || 0)}
              </Txt>
            </Panel>
            <Field
              label="Customer's 4-digit code"
              placeholder="e.g. 1042"
              value={code}
              onChangeText={setCode}
              keyboardType="number-pad"
            />
            <Txt color={C.muted} size={12}>
              Payment received by
            </Txt>
            <View style={{ flexDirection: "row", gap: 7 }}>
              {["UPI", "Cash", "Other"].map((method) => (
                <Chip
                  key={method}
                  label={method}
                  active={paymentMethod === method}
                  onPress={() => setPaymentMethod(method)}
                />
              ))}
            </View>
            {completionOrder && actionErrors[completionOrder.id] && (
              <View
                style={{
                  backgroundColor: "#fff0e9",
                  borderRadius: 12,
                  padding: 10,
                }}
              >
                <Txt color={C.orange} size={12}>
                  {actionErrors[completionOrder.id].message}
                </Txt>
              </View>
            )}
            <Btn
              label="Verify code & complete"
              loading={pendingOrderId === completionOrder?.id}
              disabled={Boolean(pendingOrderId)}
              onPress={() => {
                if (completionOrder) void act(completionOrder.id, "completed");
              }}
            />
            <Txt size={11} color={C.muted}>
              Confirm the balance has actually been received before completing.
              The backend verifies the code before changing the order.
            </Txt>
          </View>
        </View>
      </Modal>
      {editing !== null && (
        <OfferEditor
          key={editing}
          id={editing}
          onClose={() => setEditing(null)}
        />
      )}
      {showAdd && <NewDish onClose={() => setShowAdd(false)} />}
      {editingMenu !== null && (
        <MenuItemEditor id={editingMenu} onClose={() => setEditingMenu(null)} />
      )}
    </View>
  );
}
function OfferEditor({ id, onClose }: { id: string; onClose: () => void }) {
  const a = useApp();
  const isNew = id === "new";
  const requestedRank = id.startsWith("pick-top-")
    ? Number(id.split("-")[2])
    : null;
  const target =
    isNew || requestedRank ? null : a.items.find((i) => i.id === id) || null;
  const previous = a.offers.find(
    (x) => x.menu_item_id === target?.id && x.is_active,
  );
  const [itemId, setItemId] = useState(target?.id || a.items[0]?.id || ""),
    [qty, setQty] = useState(String(previous?.stock_total || 10)),
    [customPrice, setCustomPrice] = useState(
      previous ? String(previous.price_paise / 100) : "",
    ),
    [discountPct, setDiscountPct] = useState(20),
    [everyday, setEveryday] = useState(!!previous?.is_everyday),
    [saving, setSaving] = useState(false);
  const item = a.items.find((x) => x.id === itemId);
  const active = a.offers.find((x) => x.menu_item_id === itemId && x.is_active);
  const price = customPrice
    ? Math.round(Number(customPrice) * 100)
    : Math.round(((item?.price_paise || 0) * (100 - discountPct)) / 100 / 100) *
      100;
  const apply = async () => {
    if (
      !item ||
      !Number.isInteger(+qty) ||
      +qty <= 0 ||
      price <= 3000 ||
      price >= item.price_paise
    ) {
      Alert.alert(
        "Invalid offer",
        "Use a discount price between ₹30 and the menu price, and positive stock.",
      );
      return;
    }
    setSaving(true);
    try {
      if (requestedRank) {
        if (!active) {
          await a.createOffer(
            item.id,
            discountPct,
            +qty,
            requestedRank,
            price,
            everyday,
          );
        } else {
          const occupying = a.offers.find(
            (x) => x.featured_rank === requestedRank && x.id !== active.id,
          );
          if (occupying)
            await a.updateOffer(occupying.id, { featured_rank: null });
          await a.updateOffer(active.id, { featured_rank: requestedRank });
        }
      } else if (active) {
        await a.updateOffer(active.id, {
          price_paise: price,
          stock_total: Math.max(active.stock_reserved, +qty),
          is_everyday: everyday,
        });
      } else {
        await a.createOffer(item.id, discountPct, +qty, null, price, everyday);
      }
      onClose();
    } catch (e) {
      showError(e);
    } finally {
      setSaving(false);
    }
  };
  return (
    <View
      style={{
        position: "absolute",
        top: 0,
        bottom: 0,
        left: 0,
        right: 0,
        backgroundColor: "rgba(22,20,18,.48)",
        justifyContent: "flex-end",
      }}
    >
      <ScrollView
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{
          backgroundColor: C.bg,
          borderTopLeftRadius: 26,
          borderTopRightRadius: 26,
          padding: 22,
          paddingBottom: 45,
          maxHeight: 680,
        }}
      >
        <View
          style={{
            flexDirection: "row",
            justifyContent: "space-between",
            alignItems: "center",
            marginBottom: 17,
          }}
        >
          <Txt size={22} weight="bold">
            {requestedRank
              ? `Set Top Pick #${requestedRank}`
              : isNew
                ? "Create a deal"
                : "Quick-edit offer"}
          </Txt>
          <TouchableOpacity onPress={onClose}>
            <Ico name="close-circle" size={28} />
          </TouchableOpacity>
        </View>
        <Txt weight="bold" style={{ marginBottom: 8 }}>
          Choose dish
        </Txt>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={{ gap: 7, marginBottom: 17 }}
        >
          {a.items.map((i) => (
            <Chip
              key={i.id}
              label={i.name}
              active={itemId === i.id}
              onPress={() => {
                setItemId(i.id);
                setCustomPrice("");
              }}
            />
          ))}
        </ScrollView>
        {item && (
          <>
            <View
              style={{
                flexDirection: "row",
                gap: 11,
                alignItems: "center",
                marginBottom: 17,
              }}
            >
              <View style={{ width: 75 }}>
                <Photo height={76} url={item.image_url} emoji={item.emoji} />
              </View>
              <View>
                <Txt weight="bold">{item.name}</Txt>
                <Txt color={C.muted}>
                  Regular price: {rupees(item.price_paise)}
                </Txt>
              </View>
            </View>
            <Txt weight="bold" style={{ marginBottom: 8 }}>
              One-tap discount
            </Txt>
            <View style={{ flexDirection: "row", gap: 8, marginBottom: 16 }}>
              {[10, 15, 20, 25, 30].map((p) => (
                <Chip
                  key={p}
                  label={`${p}% off`}
                  active={discountPct === p && !customPrice}
                  onPress={() => {
                    setDiscountPct(p);
                    setCustomPrice("");
                  }}
                />
              ))}
            </View>
            <View style={{ flexDirection: "row", gap: 12 }}>
              <Field
                label="Custom deal price (₹)"
                value={customPrice}
                onChangeText={setCustomPrice}
                placeholder={`${(price / 100).toFixed(0)}`}
                keyboardType="decimal-pad"
              />
              <Field
                label="Offer stock"
                value={qty}
                onChangeText={setQty}
                keyboardType="number-pad"
              />
            </View>
            <Panel
              style={{ marginVertical: 16, backgroundColor: C.orangeLight }}
            >
              <Txt weight="bold" size={20}>
                {rupees(price)}{" "}
                <Txt color={C.orange}>
                  {" "}
                  · {discount(item.price_paise, price)}% off
                </Txt>
              </Txt>
              <Txt size={12} color={C.muted}>
                Each customer pays ₹30 now and the balance when they visit.
              </Txt>
            </Panel>
            <SwitchLine
              title="Everyday offer"
              subtitle="Show it in your always-on selection."
              value={everyday}
              onPress={() => setEveryday(!everyday)}
            />
            <Btn
              disabled={saving}
              label={
                saving
                  ? "Saving..."
                  : requestedRank
                    ? "Pin to Top 3"
                    : isNew
                      ? "Publish offer"
                      : "Save quick changes"
              }
              onPress={apply}
            />
          </>
        )}
      </ScrollView>
    </View>
  );
}
function NewDish({ onClose }: { onClose: () => void }) {
  const a = useApp();
  const [name, setName] = useState(""),
    [price, setPrice] = useState(""),
    [category, setCategory] = useState("Momos"),
    [description, setDescription] = useState(""),
    [diet, setDiet] = useState<"veg" | "nonveg" | "egg">("veg"),
    [saving, setSaving] = useState(false);
  const save = async () => {
    if (!name.trim() || Number(price) <= 30) {
      Alert.alert(
        "Check details",
        "Enter a name and regular price greater than ₹30",
      );
      return;
    }
    setSaving(true);
    try {
      await a.createItem({
        name: name.trim(),
        price_paise: Math.round(Number(price) * 100),
        category,
        description,
        dietary: diet,
        prep_minutes: 15,
        emoji: "🍽️",
      });
      onClose();
    } catch (e) {
      showError(e);
    } finally {
      setSaving(false);
    }
  };
  return (
    <View
      style={{
        position: "absolute",
        top: 0,
        bottom: 0,
        left: 0,
        right: 0,
        backgroundColor: "rgba(22,20,18,.48)",
        justifyContent: "flex-end",
      }}
    >
      <ScrollView
        contentContainerStyle={{
          padding: 24,
          paddingBottom: 50,
          backgroundColor: C.bg,
          borderTopLeftRadius: 25,
          borderTopRightRadius: 25,
          gap: 12,
        }}
      >
        <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
          <Txt size={22} weight="bold">
            Add a dish
          </Txt>
          <TouchableOpacity onPress={onClose}>
            <Ico name="close-circle" size={27} />
          </TouchableOpacity>
        </View>
        <Field
          label="Dish name"
          value={name}
          onChangeText={setName}
          placeholder="e.g. Tandoori Momos"
        />
        <Field
          label="Regular price (₹)"
          value={price}
          onChangeText={setPrice}
          keyboardType="decimal-pad"
        />
        <Field label="Category" value={category} onChangeText={setCategory} />
        <Field
          label="Description"
          value={description}
          onChangeText={setDescription}
          multiline
        />
        <View style={{ flexDirection: "row", gap: 8 }}>
          {["veg", "nonveg", "egg"].map((x) => (
            <Chip
              key={x}
              label={x}
              active={diet === x}
              onPress={() => setDiet(x as any)}
            />
          ))}
        </View>
        <Btn
          label={saving ? "Saving..." : "Save dish"}
          disabled={saving}
          onPress={save}
        />
        <Txt color={C.muted} size={12}>
          After saving, tap the camera on the Menu screen to upload your real
          dish image.
        </Txt>
      </ScrollView>
    </View>
  );
}

function MenuItemEditor({ id, onClose }: { id: string; onClose: () => void }) {
  const a = useApp();
  const item = a.items.find((x) => x.id === id);
  const [name, setName] = useState(item?.name || "");
  const [category, setCategory] = useState(item?.category || "Food");
  const [description, setDescription] = useState(item?.description || "");
  const [price, setPrice] = useState(
    item ? String(item.price_paise / 100) : "",
  );
  const [prep, setPrep] = useState(item ? String(item.prep_minutes) : "15");
  const [saving, setSaving] = useState(false);
  if (!item) return null;
  async function save() {
    if (
      !name.trim() ||
      !Number.isFinite(+price) ||
      +price <= 30 ||
      !Number.isInteger(+prep) ||
      +prep < 1 ||
      +prep > 240
    ) {
      showError(
        "Enter a valid name, price above ₹30, and preparation time from 1 to 240 minutes.",
      );
      return;
    }
    setSaving(true);
    try {
      await a.updateItem(id, {
        name: name.trim(),
        description,
        category: category.trim() || "Food",
        price_paise: Math.round(+price * 100),
        prep_minutes: +prep,
      });
      onClose();
    } catch (e) {
      showError(e);
    } finally {
      setSaving(false);
    }
  }
  return (
    <View
      style={{
        position: "absolute",
        top: 0,
        bottom: 0,
        left: 0,
        right: 0,
        backgroundColor: "rgba(22,20,18,.48)",
        justifyContent: "flex-end",
      }}
    >
      <ScrollView
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{
          backgroundColor: C.bg,
          borderTopLeftRadius: 25,
          borderTopRightRadius: 25,
          padding: 24,
          paddingBottom: 48,
          gap: 12,
        }}
      >
        <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
          <Txt weight="bold" size={22}>
            Edit menu item
          </Txt>
          <TouchableOpacity onPress={onClose}>
            <Ico name="close-circle" size={27} />
          </TouchableOpacity>
        </View>
        <TouchableOpacity
          onPress={() => a.uploadPhoto(id).catch(showError)}
          style={{ width: 130 }}
        >
          <Photo url={item.image_url} emoji={item.emoji} height={115} />
          <Txt size={12} color={C.orange}>
            Change item photo ↗
          </Txt>
        </TouchableOpacity>
        <Field label="Dish name" value={name} onChangeText={setName} />
        <Field
          label="Regular price (₹)"
          value={price}
          onChangeText={setPrice}
          keyboardType="decimal-pad"
        />
        <Field label="Category" value={category} onChangeText={setCategory} />
        <Field
          label="Description"
          value={description}
          onChangeText={setDescription}
          multiline
        />
        <Field
          label="Preparation time (minutes)"
          value={prep}
          onChangeText={setPrep}
          keyboardType="number-pad"
        />
        <OfferWindowEditor itemId={id} />
        <Txt size={11} color={C.muted}>
          Updating menu price never changes the saved price of an existing
          order. Current live offers must remain below the new menu price.
        </Txt>
        <Btn
          label={saving ? "Saving..." : "Save item to Supabase"}
          disabled={saving}
          onPress={save}
        />
      </ScrollView>
    </View>
  );
}

function OfferWindowEditor({ itemId }: { itemId: string }) {
  const a = useApp(),
    offer = a.offers.find((x) => x.menu_item_id === itemId && x.is_active);
  const [start, setStart] = useState(offer?.starts_at || ""),
    [end, setEnd] = useState(offer?.ends_at || ""),
    [saving, setSaving] = useState(false);
  if (!offer) return null;
  async function save() {
    const from = new Date(start),
      to = new Date(end);
    if (
      !start ||
      !end ||
      Number.isNaN(from.getTime()) ||
      Number.isNaN(to.getTime()) ||
      to <= from
    ) {
      showError(
        "Enter valid ISO start and end times; end must be after start.",
      );
      return;
    }
    setSaving(true);
    try {
      await a.updateOffer(offer!.id, {
        starts_at: from.toISOString(),
        ends_at: to.toISOString(),
      });
    } catch (e) {
      showError(e);
    } finally {
      setSaving(false);
    }
  }
  return (
    <Panel style={{ gap: 10 }}>
      <Txt weight="bold">Customer availability window</Txt>
      <Txt size={11} color={C.muted}>
        Use ISO date/time with timezone, for example 2026-10-09T16:00:00+05:30.
      </Txt>
      <Field label="Available from" value={start} onChangeText={setStart} />
      <Field label="Available until" value={end} onChangeText={setEnd} />
      <Btn
        small
        secondary
        disabled={saving}
        label={saving ? "Saving window..." : "Save availability window"}
        onPress={save}
      />
    </Panel>
  );
}

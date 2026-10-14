import React, { useEffect, useMemo, useState } from "react";
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Platform,
  Linking,
  Alert,
  ImageBackground,
  Image,
  Share,
  TextInput,
  Modal,
} from "react-native";
import { useRouter } from "expo-router";
import { useApp } from "../lib/store";
import {
  DEPOSIT_PAISE,
  Fulfillment,
  Order,
  available,
  availabilityWindow,
  discount,
  rupees,
} from "../lib/types";
import { cartEligible, cartTotal, parseShopperPhone } from "../lib/logic";
import { supabase, invoke } from "../lib/supabase";
import { errorMessage } from "../lib/errors";
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

type Page =
  | "Explore"
  | "Dish"
  | "Cart"
  | "Checkout"
  | "Orders"
  | "Order"
  | "Profile";
const when = (s: string) =>
  new Date(s).toLocaleTimeString("en-IN", {
    timeZone: "Asia/Kolkata",
    hour: "numeric",
    minute: "2-digit",
  });
function ErrorNotice({ message }: { message: string | null }) {
  return message ? (
    <View
      style={{
        padding: 12,
        backgroundColor: "#ffefe9",
        borderRadius: 12,
        marginBottom: 13,
      }}
    >
      <Txt color="#a43822" size={12}>
        {message}
      </Txt>
    </View>
  ) : null;
}
function Back({ onPress, title }: { onPress: () => void; title: string }) {
  return (
    <TouchableOpacity
      onPress={onPress}
      style={{
        flexDirection: "row",
        alignItems: "center",
        gap: 9,
        marginBottom: 17,
      }}
    >
      <Ico name="arrow-back" />
      <Txt weight="bold" size={17}>
        {title}
      </Txt>
    </TouchableOpacity>
  );
}
export function MainApp() {
  const a = useApp(),
    router = useRouter();
  const [page, setPage] = useState<Page>("Explore"),
    [selected, setSelected] = useState<string | null>(null),
    [category, setCategory] = useState("All"),
    [query, setQuery] = useState(""),
    [veg, setVeg] = useState(false),
    [mode, setMode] = useState<Fulfillment>("pickup"),
    [arrival, setArrival] = useState(25),
    [customerName, setCustomerName] = useState(""),
    [customerPhone, setCustomerPhone] = useState(""),
    [marketing, setMarketing] = useState(true),
    [placing, setPlacing] = useState(false),
    [paymentError, setPaymentError] = useState<string | null>(null),
    [onboardingError, setOnboardingError] = useState<string | null>(null),
    [currentId, setCurrentId] = useState<string | null>(null),
    [onboarding, setOnboarding] = useState(false),
    [profileSaving, setProfileSaving] = useState(false);
  const heroImage = require("../../assets/images/chatako-food-deals-hero.jpg");
  const hasCompletedProfile = Boolean(
    a.customerProfile?.onboarding_completed_at &&
      (a.customerProfile.full_name?.trim().length || 0) >= 2 &&
      parseShopperPhone(a.customerProfile.phone_e164 || ""),
  );
  useEffect(() => {
    if (!a.customerProfile) return;
    setCustomerName(a.customerProfile.full_name || "");
    setCustomerPhone(a.customerProfile.phone_e164 || "");
    setMarketing(
      a.customerProfile.onboarding_completed_at
        ? a.customerProfile.marketing_opt_in
        : true,
    );
  }, [a.customerProfile]);
  useEffect(() => {
    if (Platform.OS !== "web" || typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    const dish = params.get("dish");
    if (dish && a.items.some((x) => x.id === dish)) {
      setSelected(dish);
      setPage("Dish");
    } else if (params.get("view") === "orders") setPage("Orders");
  }, [a.items]);
  const shareUrl = (itemId?: string) => {
    const site = (
      process.env.EXPO_PUBLIC_SITE_URL ||
      (Platform.OS === "web" && typeof window !== "undefined"
        ? window.location.origin
        : "")
    ).replace(/\/$/, "");
    return `${site}/?r=${encodeURIComponent(a.restaurant.slug)}${itemId ? `&dish=${encodeURIComponent(itemId)}` : ""}`;
  };
  const shareDeals = async (itemId?: string) => {
    const url = shareUrl(itemId);
    const message = itemId
      ? `Found a delicious deal at ${a.restaurant.name} on Chatako. Take a look: ${url}`
      : `Good food, better deals! See today's offers from ${a.restaurant.name} on Chatako: ${url}`;
    if (Platform.OS === "web" && typeof navigator !== "undefined") {
      try {
        if (navigator.share) {
          const imageUrl = Image.resolveAssetSource(heroImage).uri;
          const response = await fetch(imageUrl);
          const blob = await response.blob();
          const file = new File([blob], "chatako-food-deals.jpg", {
            type: blob.type || "image/jpeg",
          });
          const data: ShareData = { title: "Chatako food deals", text: message, url };
          if (navigator.canShare?.({ files: [file] })) data.files = [file];
          await navigator.share(data);
          return;
        }
      } catch (error) {
        if ((error as Error)?.name === "AbortError") return;
      }
      await Linking.openURL(`https://wa.me/?text=${encodeURIComponent(message)}`);
      return;
    }
    await Share.share({ title: "Chatako food deals", message, url });
  };
  const catalog = a.catalog.filter((x) => x.offer && available(x.offer));
  const visible = catalog.filter(
    ({ item }) =>
      (category === "All" || item.category === category) &&
      (!veg || item.dietary === "veg") &&
      (item.name.toLowerCase().includes(query.toLowerCase()) ||
        item.category.toLowerCase().includes(query.toLowerCase())),
  );
  const sorted = [...visible].sort(
    (a, b) =>
      (a.offer?.featured_rank || 99) - (b.offer?.featured_rank || 99) ||
      Number(b.offer?.is_everyday || b.item.is_persistent) -
        Number(a.offer?.is_everyday || a.item.is_persistent),
  );
  const categories = ["All", ...new Set(a.items.map((i) => i.category))];
  const current = a.orders.find((o) => o.id === currentId);
  const total = cartTotal(a.cart, a.catalog);
  const minimumArrival = Math.max(
    5,
    ...a.cart.map(
      (line) =>
        (a.catalog.find((x) => x.item.id === line.itemId)?.item.prep_minutes ||
          0) + a.restaurant.prep_buffer_minutes,
    ),
  );
  useEffect(() => {
    if (arrival < minimumArrival) setArrival(minimumArrival);
  }, [minimumArrival, arrival]);
  useEffect(() => {
    if (
      mode === "pickup" &&
      !a.restaurant.pickup_enabled &&
      a.restaurant.dinein_enabled
    )
      setMode("dinein");
    if (
      mode === "dinein" &&
      !a.restaurant.dinein_enabled &&
      a.restaurant.pickup_enabled
    )
      setMode("pickup");
  }, [mode, a.restaurant.pickup_enabled, a.restaurant.dinein_enabled]);
  const selectedItem = a.catalog.find((x) => x.item.id === selected);
  const canOrder = a.restaurant.accepting_orders && !a.loading;
  const orderRows = (order: Order) =>
    order.rows.map((row, i) => (
      <View
        key={i}
        style={{
          flexDirection: "row",
          justifyContent: "space-between",
          paddingVertical: 5,
        }}
      >
        <Txt>
          {row.quantity} × {row.name}
        </Txt>
        <Txt weight="medium">{rupees(row.unit_paise * row.quantity)}</Txt>
      </View>
    ));
  const push = (p: Page) => {
    setPaymentError(null);
    setPage(p);
  };
  const reorder = (order: Order) => {
    const eligible = order.rows.flatMap((row) => {
      const item = a.catalog.find(
        (entry) => entry.item.id === row.menu_item_id && available(entry.offer),
      );
      return item?.offer ? [{ item, quantity: row.quantity }] : [];
    });
    if (!eligible.length) {
      setPaymentError("None of the dishes in this order has an active offer right now.");
      return;
    }
    a.clearCart();
    eligible.forEach(({ item, quantity }) => {
      for (let count = 0; count < quantity; count += 1) {
        a.addCart(item.item.id, item.offer!.id);
      }
    });
    push("Cart");
  };
  const visitDate = new Date(Date.now() + (arrival + 1) * 60000).toISOString();
  const invalidConnection = !a.restaurant.id && !a.loading;
  const tryCheckout = async () => {
    setPlacing(true);
    setPaymentError(null);
    let unpaidOrderId: string | null = null;
    try {
      if (!canOrder)
        throw Error(
          `${a.restaurant.name} is not accepting bookings right now.`,
        );
      if (!cartEligible(a.cart, a.catalog))
        throw Error("Choose available deals totalling more than ₹30.");
      if (!a.userId || !hasCompletedProfile)
        throw Error("Complete your customer profile before checkout.");
      const create = await a.startCheckout(mode, visitDate);
      unpaidOrderId = create.order_id;
      if (Platform.OS !== "web") {
        throw Error(
          "Live checkout currently runs on the web. Add the Razorpay native SDK or hosted Checkout for Android before publishing native builds.",
        );
      }
      await loadRazorpay();
      await new Promise<void>((resolve, reject) => {
        const rz = new (window as any).Razorpay({
          key: create.key_id,
          amount: create.amount,
          currency: "INR",
          order_id: create.razorpay_order_id,
          name: a.restaurant.name,
          description: "₹30 food reservation deposit",
          prefill: { contact: customerPhone },
          handler: async (resp: any) => {
            try {
              await invoke("fd-verify-payment", {
                order_id: create.order_id,
                razorpay_payment_id: resp.razorpay_payment_id,
                razorpay_order_id: resp.razorpay_order_id,
                razorpay_signature: resp.razorpay_signature,
              });
              resolve();
            } catch (e) {
              reject(e);
            }
          },
          modal: {
            ondismiss: () =>
              reject(
                new Error("Payment cancelled. No reservation was charged."),
              ),
          },
        });
        rz.on("payment.failed", (resp: any) =>
          reject(new Error(resp?.error?.description || "Payment failed")),
        );
        rz.open();
      });
      unpaidOrderId = null;
      await a.refresh();
      a.clearCart();
      setCurrentId(create.order_id);
      push("Order");
    } catch (e) {
      if (unpaidOrderId) {
        try {
          await a.abandonCheckout(
            unpaidOrderId,
            "customer_checkout_interrupted",
          );
        } catch {
          /* webhook/expiry remains the final reconciliation path */
        }
      }
      setPaymentError(errorMessage(e));
    } finally {
      setPlacing(false);
    }
  };
  if (a.loading) {
    return (
      <View
        style={{
          flex: 1,
          justifyContent: "center",
          alignItems: "center",
          backgroundColor: C.bg,
          padding: 28,
        }}
      >
        <ActivityIndicator size="large" color={C.orange} />
        <Txt style={{ marginTop: 16 }}>Connecting to Supabase...</Txt>
      </View>
    );
  }
  if (invalidConnection) {
    return (
      <View
        style={{
          flex: 1,
          justifyContent: "center",
          alignItems: "center",
          backgroundColor: C.bg,
          padding: 28,
        }}
      >
        <View style={{ maxWidth: 470, width: "100%", gap: 12 }}>
          <Txt size={30}>🔌</Txt>
          <Txt size={24} weight="bold">
            Could not load the restaurant
          </Txt>
          <Txt color={C.muted}>
            {a.error || "No restaurant was returned from Supabase."}
          </Txt>
          <Btn label="Retry connection" onPress={() => void a.refresh()} />
          <Btn
            label="Merchant sign-in"
            secondary
            onPress={() =>
              router.push({
                pathname: "/merchant",
                params: {
                  r:
                    a.restaurant.slug ||
                    process.env.EXPO_PUBLIC_RESTAURANT_SLUG ||
                    "",
                },
              })
            }
          />
        </View>
      </View>
    );
  }
  return (
    <View style={{ flex: 1, backgroundColor: C.bg }}>
      <ScrollView
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{
          paddingHorizontal: 19,
          paddingTop: Platform.OS === "web" ? 26 : 44,
          paddingBottom: 34,
          flexGrow: 1,
        }}
      >
        <View style={webStyle}>
          {Boolean(a.error) && <ErrorNotice message={a.error} />}
          {page === "Explore" && (
            <>
              <View
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  justifyContent: "space-between",
                  marginBottom: 20,
                }}
              >
                <View>
                  <Txt size={12} color={C.muted}>
                    📍 {a.restaurant.address.split(",")[0]}
                  </Txt>
                  <Txt weight="bold" size={28}>
                    {a.restaurant.name}
                  </Txt>
                </View>
                <TouchableOpacity
                  onPress={() => push("Profile")}
                  style={{
                    padding: 11,
                    backgroundColor: C.paper,
                    borderRadius: 15,
                  }}
                >
                  <Ico name="person-circle-outline" size={26} />
                </TouchableOpacity>
              </View>
              <ImageBackground
                source={heroImage}
                resizeMode="cover"
                imageStyle={{ borderRadius: 23 }}
                style={{
                  minHeight: 310,
                  borderRadius: 23,
                  marginBottom: 24,
                  overflow: "hidden",
                  justifyContent: "flex-end",
                }}
              >
                <View
                  pointerEvents="none"
                  style={{
                    position: "absolute",
                    top: 0,
                    right: 0,
                    bottom: 0,
                    left: 0,
                    backgroundColor: "rgba(24,16,11,0.20)",
                  }}
                />
                <View
                  style={{
                    gap: 9,
                    padding: 22,
                    paddingTop: 104,
                  }}
                >
                  <Pill label="TODAY AT CHATAKO" kind="orange" />
                  <Txt
                    color="#fff"
                    size={31}
                    weight="bold"
                    style={{ lineHeight: 35, maxWidth: 420 }}
                  >
                    Good food. Better deals.
                  </Txt>
                  <Txt color="#fff" size={14} style={{ maxWidth: 470 }}>
                    Discover delicious deals around you. Reserve now, pick up or
                    dine in.
                  </Txt>
                  <TouchableOpacity
                    onPress={() => {
                      setCategory("All");
                      setQuery("");
                    }}
                    style={{
                      marginTop: 5,
                      alignSelf: "flex-start",
                      backgroundColor: C.orange,
                      paddingVertical: 12,
                      paddingHorizontal: 17,
                      borderRadius: 14,
                    }}
                  >
                    <Txt color="#fff" weight="bold">
                      Explore Today's Deals
                    </Txt>
                  </TouchableOpacity>
                </View>
              </ImageBackground>
              <View
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  backgroundColor: C.paper,
                  borderColor: C.border,
                  borderWidth: 1,
                  borderRadius: 15,
                  paddingHorizontal: 14,
                  gap: 9,
                  marginBottom: 15,
                  minHeight: 54,
                }}
              >
                <Ico name="search-outline" color={C.muted} size={22} />
                <TextInput
                  placeholder="Search dishes, momos, rolls..."
                  placeholderTextColor="#aaa198"
                  value={query}
                  onChangeText={setQuery}
                  style={{
                    flex: 1,
                    paddingVertical: 13,
                    fontSize: 15,
                    color: C.ink,
                    outlineStyle: "none",
                  } as any}
                />
              </View>
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                style={{ marginBottom: 22 }}
                contentContainerStyle={{ gap: 8 }}
              >
                {categories.map((cat) => (
                  <Chip
                    key={cat}
                    label={cat}
                    active={category === cat}
                    onPress={() => setCategory(cat)}
                  />
                ))}
              </ScrollView>
              <View
                style={{
                  flexDirection: "row",
                  justifyContent: "space-between",
                  alignItems: "center",
                  marginBottom: 13,
                }}
              >
                <View>
                  <Txt weight="bold" size={22}>
                    Today's best bites 🔥
                  </Txt>
                  <Txt size={12} color={C.muted}>
                    Hand-picked by {a.restaurant.name}
                  </Txt>
                </View>
                <Chip
                  label={veg ? "✓ Veg" : "Veg only"}
                  active={veg}
                  onPress={() => setVeg(!veg)}
                />
              </View>
              {!canOrder && (
                <Panel
                  style={{ backgroundColor: C.orangeLight, marginBottom: 14 }}
                >
                  <Txt color={C.orange} weight="bold">
                    {a.restaurant.name} is temporarily not accepting new
                    reservations.
                  </Txt>
                </Panel>
              )}
              {!sorted.length ? (
                <Empty
                  title="Nothing on offer right now"
                  subtitle="Check back later for fresh deals."
                />
              ) : (
                <View
                  style={{ flexDirection: "row", flexWrap: "wrap", gap: 13 }}
                >
                  {sorted.map(({ item, offer }) => (
                    <TouchableOpacity
                      key={item.id}
                      onPress={() => {
                        setSelected(item.id);
                        push("Dish");
                      }}
                      activeOpacity={0.86}
                      style={{
                        backgroundColor: C.paper,
                        borderRadius: 19,
                        padding: 9,
                        borderWidth: 1,
                        borderColor: C.border,
                        width: "47.8%",
                        minWidth: 140,
                        flexGrow: 1,
                        maxWidth: 280,
                      }}
                    >
                      <View>
                        <Photo
                          url={item.image_url}
                          emoji={item.emoji}
                          height={140}
                        />
                        <View style={{ position: "absolute", top: 8, left: 8 }}>
                          <Pill
                            label={`${discount(item.price_paise, offer!.price_paise)}% OFF`}
                            kind="green"
                          />
                        </View>
                      </View>
                      <View
                        style={{ paddingHorizontal: 5, paddingTop: 9, gap: 3 }}
                      >
                        <Txt weight="bold" numberOfLines={1}>
                          {item.name}
                        </Txt>
                        <Txt weight="bold" size={18}>
                          {rupees(offer!.price_paise)}
                        </Txt>
                        <Txt color={C.muted} size={11}>
                          {rupees(item.price_paise)} at restaurant
                        </Txt>
                        <Txt size={11} color={C.muted}>
                          {availabilityWindow(offer!)}
                        </Txt>
                        <Txt size={11} color={C.muted}>
                          Ready in ~{item.prep_minutes} min
                        </Txt>
                        {Boolean(offer?.featured_rank) && (
                          <Txt size={10} color={C.orange} weight="medium">
                            ★ Top pick today
                          </Txt>
                        )}
                      </View>
                    </TouchableOpacity>
                  ))}
                </View>
              )}
              <View style={{ marginTop: 25, marginBottom: 9 }}>
                <Panel style={{ backgroundColor: "#fff0e9", gap: 10 }}>
                  <Txt weight="bold" size={19}>
                    Share Deals with Friends
                  </Txt>
                  <Txt size={12} color={C.muted}>
                    Know someone who loves great street food? Send them today’s
                    {" "}{a.restaurant.name} deals—no referral codes or tracking.
                  </Txt>
                  <Btn
                    label="Share on WhatsApp"
                    icon="logo-whatsapp"
                    onPress={() => void shareDeals()}
                  />
                </Panel>
              </View>
            </>
          )}
          {page === "Dish" && selectedItem && (
            <>
              <Back title="Dish details" onPress={() => push("Explore")} />
              <Photo
                url={selectedItem.item.image_url}
                emoji={selectedItem.item.emoji}
                height={290}
              />
              <View style={{ marginTop: 18, gap: 9 }}>
                <Pill
                  label={
                    selectedItem.item.dietary === "veg"
                      ? "● Vegetarian"
                      : "● Non-vegetarian"
                  }
                  kind={
                    selectedItem.item.dietary === "veg" ? "green" : "orange"
                  }
                />
                <Txt size={27} weight="bold">
                  {selectedItem.item.name}
                </Txt>
                <Txt color={C.muted}>{selectedItem.item.description}</Txt>
                <View style={{ gap: 2 }}>
                  <Txt size={25} weight="bold">
                    {rupees(
                      selectedItem.offer?.price_paise ||
                        selectedItem.item.price_paise,
                    )}
                  </Txt>
                  <Txt color={C.muted}>
                    {rupees(selectedItem.item.price_paise)} at restaurant
                  </Txt>
                </View>
                <Panel>
                  <Txt weight="medium">
                    ⚡ Ready in ~{selectedItem.item.prep_minutes} min
                  </Txt>
                  {selectedItem.offer && (
                    <Txt size={12} color={C.muted}>
                      {availabilityWindow(selectedItem.offer)} ·{" "}
                      {Math.max(
                        0,
                        selectedItem.offer.stock_total -
                          selectedItem.offer.stock_reserved,
                      )}{" "}
                      portions left
                    </Txt>
                  )}
                  <Line />
                  <Txt weight="medium">📍 {a.restaurant.name}</Txt>
                  <Txt color={C.muted} size={12}>
                    {a.restaurant.address}
                  </Txt>
                </Panel>
                <Btn
                  label="Share on WhatsApp"
                  secondary
                  icon="logo-whatsapp"
                  onPress={() => void shareDeals(selectedItem.item.id)}
                />
                <Btn
                  label="Add to my order"
                  disabled={!selectedItem.offer || !canOrder}
                  onPress={() => {
                    a.addCart(selectedItem.item.id, selectedItem.offer!.id);
                    push("Cart");
                  }}
                />
              </View>
            </>
          )}
          {page === "Cart" && (
            <>
              <Back title="Your order" onPress={() => push("Explore")} />
              {!a.cart.length ? (
                <Empty
                  title="Your basket is empty"
                  subtitle="Find a delicious offer to get started."
                />
              ) : (
                <>
                  <Panel>
                    <Txt weight="bold" size={16}>
                      {a.restaurant.name}
                    </Txt>
                    <Txt color={C.muted} size={12}>
                      {a.restaurant.address}
                    </Txt>
                    <Line />
                    {a.cart.map((entry) => {
                      const x = a.catalog.find(
                        (v) => v.item.id === entry.itemId,
                      );
                      if (!x) return null;
                      return (
                        <View
                          key={entry.itemId}
                          style={{
                            flexDirection: "row",
                            gap: 12,
                            alignItems: "center",
                            paddingVertical: 10,
                          }}
                        >
                          <View style={{ width: 75 }}>
                            <Photo
                              url={x.item.image_url}
                              emoji={x.item.emoji}
                              height={72}
                            />
                          </View>
                          <View style={{ flex: 1, gap: 3 }}>
                            <Txt weight="bold">{x.item.name}</Txt>
                            <Txt color={C.orange} weight="bold">
                              {rupees(
                                (x.offer?.price_paise || x.item.price_paise) *
                                  entry.quantity,
                              )}
                            </Txt>
                          </View>
                          <View
                            style={{
                              flexDirection: "row",
                              alignItems: "center",
                              gap: 12,
                            }}
                          >
                            <TouchableOpacity
                              onPress={() =>
                                a.changeQty(entry.itemId, entry.quantity - 1)
                              }
                            >
                              <Ico name="remove-circle-outline" size={23} />
                            </TouchableOpacity>
                            <Txt>{entry.quantity}</Txt>
                            <TouchableOpacity
                              onPress={() =>
                                a.changeQty(entry.itemId, entry.quantity + 1)
                              }
                            >
                              <Ico name="add-circle-outline" size={23} />
                            </TouchableOpacity>
                          </View>
                        </View>
                      );
                    })}
                  </Panel>
                  <Panel style={{ marginTop: 14 }}>
                    <View
                      style={{
                        flexDirection: "row",
                        justifyContent: "space-between",
                      }}
                    >
                      <Txt color={C.muted}>Order total</Txt>
                      <Txt weight="bold" size={20}>
                        {rupees(total)}
                      </Txt>
                    </View>
                    <Line />
                    <View
                      style={{
                        flexDirection: "row",
                        justifyContent: "space-between",
                      }}
                    >
                      <Txt color={C.muted}>Pay now (advance)</Txt>
                      <Txt weight="bold">₹30</Txt>
                    </View>
                    <View
                      style={{
                        flexDirection: "row",
                        justifyContent: "space-between",
                        marginTop: 8,
                      }}
                    >
                      <Txt color={C.muted}>Pay at restaurant</Txt>
                      <Txt weight="bold">
                        {rupees(Math.max(0, total - DEPOSIT_PAISE))}
                      </Txt>
                    </View>
                  </Panel>
                  <View style={{ marginTop: 17 }}>
                    <Btn
                      label="Choose pickup or dine-in →"
                      disabled={!cartEligible(a.cart, a.catalog) || !canOrder}
                      onPress={() => push("Checkout")}
                    />
                    {total <= DEPOSIT_PAISE && (
                      <Txt color={C.muted} size={12} style={{ marginTop: 7 }}>
                        Reservations require an order above ₹30.
                      </Txt>
                    )}
                  </View>
                </>
              )}
            </>
          )}
          {page === "Checkout" && (
            <>
              <Back
                title="Confirm your reservation"
                onPress={() => push("Cart")}
              />
              <Txt size={18} weight="bold" style={{ marginBottom: 11 }}>
                How would you like your food?
              </Txt>
              <View style={{ flexDirection: "row", gap: 10, marginBottom: 24 }}>
                {(["pickup", "dinein"] as const).map((m) => {
                  const enabled =
                    m === "pickup"
                      ? a.restaurant.pickup_enabled
                      : a.restaurant.dinein_enabled;
                  return (
                    <TouchableOpacity
                      key={m}
                      disabled={!enabled}
                      onPress={() => setMode(m)}
                      style={{
                        flex: 1,
                        padding: 20,
                        gap: 8,
                        alignItems: "center",
                        borderWidth: 2,
                        borderColor: mode === m ? C.orange : C.border,
                        borderRadius: 18,
                        backgroundColor: C.paper,
                        opacity: enabled ? 1 : 0.4,
                      }}
                    >
                      <Ico
                        name={
                          m === "pickup"
                            ? "bag-handle-outline"
                            : "restaurant-outline"
                        }
                        size={27}
                        color={mode === m ? C.orange : C.ink}
                      />
                      <Txt weight="bold">
                        {m === "pickup" ? "Takeaway" : "Eat here"}
                      </Txt>
                    </TouchableOpacity>
                  );
                })}
              </View>
              <Txt weight="bold" size={18}>
                When will you arrive?
              </Txt>
              <Txt size={12} color={C.muted} style={{ marginBottom: 10 }}>
                Includes the merchant’s preparation time.
              </Txt>
              <View
                style={{
                  flexDirection: "row",
                  gap: 9,
                  marginBottom: 19,
                  flexWrap: "wrap",
                }}
              >
                {[minimumArrival, 20, 25, 35, 50, 80]
                  .filter(
                    (t, i, x) => t >= minimumArrival && x.indexOf(t) === i,
                  )
                  .map((t) => (
                    <Chip
                      key={t}
                      label={
                        t === minimumArrival
                          ? `Earliest · ${t} min`
                          : `${t} min`
                      }
                      active={arrival === t}
                      onPress={() => setArrival(t)}
                    />
                  ))}
              </View>
              {mode === "dinein" && (
                <Panel
                  style={{ marginBottom: 14, backgroundColor: C.orangeLight }}
                >
                  <Txt size={12}>
                    This reserves food, not a guaranteed table. Seating depends
                    on availability.
                  </Txt>
                </Panel>
              )}
              <Panel>
                <Txt weight="bold" size={17}>
                  Price breakdown
                </Txt>
                <Line />
                <View
                  style={{
                    flexDirection: "row",
                    justifyContent: "space-between",
                  }}
                >
                  <Txt color={C.muted}>Your order</Txt>
                  <Txt weight="bold">{rupees(total)}</Txt>
                </View>
                <View
                  style={{
                    flexDirection: "row",
                    justifyContent: "space-between",
                    marginTop: 10,
                  }}
                >
                  <Txt color={C.muted}>Pay now</Txt>
                  <Txt weight="bold" size={18}>
                    ₹30
                  </Txt>
                </View>
                <View
                  style={{
                    flexDirection: "row",
                    justifyContent: "space-between",
                    marginTop: 10,
                  }}
                >
                  <Txt color={C.muted}>Pay at {a.restaurant.name}</Txt>
                  <Txt weight="bold" size={18}>
                    {rupees(Math.max(0, total - DEPOSIT_PAISE))}
                  </Txt>
                </View>
                <Line />
                <Txt size={12} color={C.muted}>
                  Your ₹30 is deducted from the order total. Merchant rejection
                  triggers a full refund. Late cancellation and no-show
                  conditions apply.
                </Txt>
              </Panel>
              {!a.customerProfile?.phone_verified && (
                <Panel style={{ marginTop: 13, backgroundColor: C.orangeLight }}>
                  <Txt size={12} color={C.muted}>
                    Checking out as {a.customerProfile?.full_name}. Your saved
                    phone remains unverified; this does not affect payment or
                    WhatsApp consent.
                  </Txt>
                </Panel>
              )}
              <View style={{ marginTop: 18 }}>
                <ErrorNotice message={paymentError} />
                <Btn
                  disabled={placing}
                  label={
                    placing
                      ? "Working..."
                      : "Pay ₹30 to reserve"
                  }
                  onPress={tryCheckout}
                />
                <Txt
                  color={C.muted}
                  size={11}
                  style={{ marginTop: 10, textAlign: "center" }}
                >
                  By continuing, you agree to the cancellation and refund
                  policy.
                </Txt>
              </View>
            </>
          )}
          {page === "Orders" && (
            <>
              <Header eyebrow="YOUR ACTIVITY" title="My reservations" />
              {!a.customerProfile?.phone_verified && (
                <Panel style={{ backgroundColor: C.orangeLight, marginBottom: 13 }}>
                  <Txt color={C.muted} size={12}>
                    This history belongs to your secure session. Your phone is
                    still unverified and is never used to look up another account.
                  </Txt>
                </Panel>
              )}
              <ErrorNotice message={paymentError} />
              {!a.myOrders.length ? (
                <Empty
                  title="No reservations yet"
                  subtitle="Today's best bites are waiting on Explore."
                />
              ) : (
                a.myOrders.map((o) => (
                    <Panel key={o.id} style={{ marginBottom: 10, gap: 8 }}>
                      <TouchableOpacity
                        onPress={() => {
                          setCurrentId(o.id);
                          push("Order");
                        }}
                        style={{ gap: 6 }}
                      >
                      <View
                        style={{
                          flexDirection: "row",
                          justifyContent: "space-between",
                        }}
                      >
                        <Txt weight="bold">Order {o.id.slice(0, 8)}</Txt>
                        <Pill
                          label={o.status.replaceAll("_", " ")}
                          kind={o.status === "ready" ? "green" : "orange"}
                        />
                      </View>
                      <Txt color={C.muted} size={12}>
                        {o.rows
                          .map((x) => `${x.quantity}× ${x.name}`)
                          .join(", ")}
                      </Txt>
                      <View
                        style={{
                          flexDirection: "row",
                          justifyContent: "space-between",
                        }}
                      >
                        <Txt>
                          {o.mode === "pickup" ? "🥡 Pickup" : "🍽️ Dine-in"}
                        </Txt>
                        <Txt weight="bold">{rupees(o.total_paise)}</Txt>
                      </View>
                      </TouchableOpacity>
                      <Btn
                        small
                        secondary
                        label="Reorder available dishes"
                        icon="refresh-outline"
                        onPress={() => reorder(o)}
                      />
                    </Panel>
                ))
              )}
            </>
          )}
          {page === "Order" && current && (
            <>
              <Back title="Your reservation" onPress={() => push("Orders")} />
              <Panel style={{ alignItems: "center", gap: 9, marginBottom: 15 }}>
                <Txt size={44}>
                  {current.status === "completed"
                    ? "🎉"
                    : current.status === "ready"
                      ? "🥡"
                      : "🧑‍🍳"}
                </Txt>
                <Txt size={23} weight="bold">
                  {current.status === "ready"
                    ? "Your food is ready!"
                    : current.status === "completed"
                      ? "Enjoy your meal!"
                      : current.status === "awaiting_acceptance"
                        ? "Awaiting restaurant confirmation"
                        : current.status === "preparing"
                          ? "The kitchen is on it!"
                          : current.status === "accepted"
                            ? "Order confirmed!"
                            : current.status.replaceAll("_", " ")}
                </Txt>
                <Txt color={C.muted} size={12}>
                  Order #{current.id.slice(0, 12)} ·{" "}
                  {current.mode === "pickup" ? "Pickup" : "Dine-in"}
                </Txt>
                {Boolean(current.refund_status) && (
                  <Pill
                    label={`Refund: ${current.refund_status}`}
                    kind="orange"
                  />
                )}
                <Line style={{ width: "100%" }} />
                <Txt color={C.muted} size={11}>
                  SHOW THIS 4-DIGIT CODE TO STAFF
                </Txt>
                <Txt size={40} weight="bold" style={{ letterSpacing: 10 }}>
                  {current.code || "••••"}
                </Txt>
                <Txt color={C.muted} size={12}>
                  Expected arrival {when(current.arrival_at)}
                </Txt>
              </Panel>
              <Panel>
                <Txt weight="bold" size={16}>
                  Your dishes
                </Txt>
                <Line />
                {orderRows(current)}
                <Line />
                <View
                  style={{
                    flexDirection: "row",
                    justifyContent: "space-between",
                  }}
                >
                  <Txt>Already paid</Txt>
                  <Txt weight="bold">₹30</Txt>
                </View>
                <View
                  style={{
                    flexDirection: "row",
                    justifyContent: "space-between",
                    marginTop: 8,
                  }}
                >
                  <Txt>Balance at store</Txt>
                  <Txt weight="bold" size={19}>
                    {rupees(current.balance_paise)}
                  </Txt>
                </View>
              </Panel>
              {current.status === "awaiting_acceptance" && (
                <Btn
                  secondary
                  label="Cancel & request full refund"
                  style={{ marginTop: 13 }}
                  onPress={async () => {
                    try {
                      await invoke("fd-customer-cancel", {
                        order_id: current.id,
                      });
                      await a.refresh();
                    } catch (e) {
                      setPaymentError(
                        e instanceof Error ? e.message : String(e),
                      );
                    }
                  }}
                />
              )}
              <ErrorNotice message={paymentError} />
              <View style={{ flexDirection: "row", gap: 9, marginTop: 16 }}>
                <Btn
                  label="Directions"
                  icon="navigate-outline"
                  secondary
                  style={{ flex: 1 }}
                  onPress={() =>
                    Linking.openURL(
                      `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(a.restaurant.address)}`,
                    )
                  }
                />
                <Btn
                  label="Back to deals"
                  style={{ flex: 1 }}
                  onPress={() => push("Explore")}
                />
              </View>
            </>
          )}
          {page === "Profile" && (
            <>
              <Header eyebrow="WELCOME TO CHATAKO" title="Your account" />
              <Panel style={{ gap: 13 }}>
                <View
                  style={{
                    flexDirection: "row",
                    justifyContent: "space-between",
                    alignItems: "center",
                  }}
                >
                  <Txt size={19} weight="bold">Your details</Txt>
                  <Pill
                    label={a.customerProfile?.phone_verified ? "PHONE VERIFIED" : "UNVERIFIED"}
                    kind={a.customerProfile?.phone_verified ? "green" : "orange"}
                  />
                </View>
                <Field
                  label="Name"
                  value={customerName}
                  onChangeText={setCustomerName}
                  placeholder="Your name"
                />
                <Field
                  label="Indian mobile number (+91)"
                  value={customerPhone}
                  onChangeText={setCustomerPhone}
                  keyboardType="phone-pad"
                  placeholder="10-digit mobile number"
                />
                <Line />
                <SwitchLine
                  title={`WhatsApp deals from ${a.restaurant.name}`}
                  subtitle="Optional marketing only. Order updates use a separate preference."
                  value={marketing}
                  onPress={() => setMarketing(!marketing)}
                />
                <Btn
                  label="Save profile"
                  loading={profileSaving}
                  onPress={async () => {
                    setProfileSaving(true);
                    setPaymentError(null);
                    try {
                      const phone = parseShopperPhone(customerPhone);
                      if (!phone) throw Error("Enter a valid Indian mobile number");
                      await a.updateCustomerProfile(customerName, phone, marketing);
                      if (Platform.OS !== "web") Alert.alert("Saved", "Your profile has been saved");
                    } catch (e) {
                      setPaymentError(errorMessage(e));
                    } finally {
                      setProfileSaving(false);
                    }
                  }}
                />
                <ErrorNotice message={paymentError} />
                <Txt color={C.muted} size={11}>
                  Changing a verified number marks the new number unverified until
                  you confirm it during checkout. Consent can be withdrawn at any time.
                </Txt>
                {Boolean(a.restaurant.whatsapp_business_phone) && (
                  <Btn
                    label={`Message ${a.restaurant.name} on WhatsApp`}
                    secondary
                    icon="logo-whatsapp"
                    onPress={() => {
                      const phone = a.restaurant.whatsapp_business_phone!.replace(/\D/g, "");
                      const text = `Hi ${a.restaurant.name}, I found you through Chatako.`;
                      void Linking.openURL(
                        `https://wa.me/${phone}?text=${encodeURIComponent(text)}`,
                      );
                    }}
                  />
                )}
                <Btn
                  label="Open merchant dashboard"
                  secondary
                  icon="storefront-outline"
                  onPress={() =>
                    router.push({
                      pathname: "/merchant",
                      params: { r: a.restaurant.slug },
                    })
                  }
                />
                {Boolean(a.userId) && (
                  <Btn label="Log out" secondary onPress={a.logout} />
                )}
              </Panel>
            </>
          )}
        </View>
      </ScrollView>
      {page === "Explore" && a.cart.length > 0 && (
        <TouchableOpacity
          onPress={() => push("Cart")}
          style={{
            position: "absolute",
            bottom: 74,
            left: 22,
            right: 22,
            padding: 16,
            backgroundColor: C.ink,
            borderRadius: 17,
            flexDirection: "row",
            justifyContent: "space-between",
            alignItems: "center",
          }}
        >
          <Txt weight="bold" color="#fff">
            {a.cart.reduce((s, x) => s + x.quantity, 0)} items · {rupees(total)}
          </Txt>
          <Txt weight="bold" color="#fff">
            View basket →
          </Txt>
        </TouchableOpacity>
      )}
      {(["Explore", "Orders", "Profile"] as string[]).includes(page) && (
        <BottomNav active={page} onSelect={(n: Page) => push(n)} />
      )}
      <Modal
        visible={
          !a.loading &&
          !a.isMerchant &&
          !hasCompletedProfile
        }
        transparent
        animationType="fade"
        onRequestClose={() => {}}
      >
        <View
          style={{
            flex: 1,
            justifyContent: "center",
            alignItems: "center",
            padding: 18,
            backgroundColor: "rgba(31, 27, 23, 0.48)",
          }}
        >
          <Panel
            style={{
              width: "100%",
              maxWidth: 460,
              gap: 13,
              padding: 20,
              borderRadius: 22,
            }}
          >
            <View style={{ gap: 5 }}>
              <Txt size={24} weight="bold">
                Welcome to {a.restaurant.name}
              </Txt>
              <Txt color={C.muted} size={13}>
                Complete your profile once to explore deals and place orders.
              </Txt>
            </View>
            <Field
              label="Your name"
              placeholder="e.g. Priya"
              value={customerName}
              onChangeText={setCustomerName}
            />
            <Field
              label="Indian mobile number (+91)"
              placeholder="10-digit mobile number"
              value={customerPhone}
              onChangeText={setCustomerPhone}
              keyboardType="phone-pad"
            />
            <TouchableOpacity
              onPress={() => setMarketing((checked) => !checked)}
              accessibilityRole="checkbox"
              accessibilityState={{ checked: marketing }}
              style={{
                flexDirection: "row",
                gap: 10,
                alignItems: "flex-start",
              }}
            >
              <View
                style={{
                  width: 22,
                  height: 22,
                  borderRadius: 6,
                  borderWidth: 1,
                  borderColor: marketing ? C.green : C.border,
                  backgroundColor: marketing ? C.green : C.paper,
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                {marketing && <Ico name="checkmark" size={16} color="#fff" />}
              </View>
              <Txt size={13} style={{ flex: 1 }}>
                Send me food deals and offers from {a.restaurant.name} on
                WhatsApp.
              </Txt>
            </TouchableOpacity>
            <Txt color={C.muted} size={11}>
              Optional. Uncheck this if you do not want marketing messages. You
              can change your choice from Profile anytime.
            </Txt>
            <ErrorNotice message={onboardingError} />
            <Btn
              label="Continue to deals"
              loading={onboarding}
              disabled={onboarding}
              onPress={async () => {
                setOnboarding(true);
                setOnboardingError(null);
                try {
                  const phone = parseShopperPhone(customerPhone);
                  if (customerName.trim().length < 2) {
                    throw Error("Enter your name");
                  }
                  if (!phone) {
                    throw Error("Enter a valid Indian mobile number");
                  }
                  await a.completeOnboarding(customerName, phone, marketing);
                } catch (error) {
                  setOnboardingError(errorMessage(error));
                } finally {
                  setOnboarding(false);
                }
              }}
            />
            <Txt color={C.muted} size={11} style={{ textAlign: "center" }}>
              Your profile is linked to a secure session on this device.
            </Txt>
          </Panel>
        </View>
      </Modal>
    </View>
  );
}
async function loadRazorpay() {
  if (typeof document === "undefined")
    throw Error("Razorpay web checkout needs a browser");
  if ((window as any).Razorpay) return;
  await new Promise<void>((resolve, reject) => {
    const el = document.createElement("script");
    el.src = "https://checkout.razorpay.com/v1/checkout.js";
    el.onload = () => resolve();
    el.onerror = () => reject(new Error("Could not load checkout"));
    document.body.appendChild(el);
  });
}

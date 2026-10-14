import React from "react";
import {
  View,
  Text,
  TouchableOpacity,
  TextInput,
  Image,
  Platform,
  ViewStyle,
  ActivityIndicator,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
export const C = {
  bg: "#fff9f2",
  paper: "#ffffff",
  ink: "#221e1a",
  muted: "#80786f",
  orange: "#ef5a31",
  orangeLight: "#fff0e9",
  border: "#efe8df",
  green: "#198654",
  greenBg: "#eaf6ef",
  yellow: "#ffd35c",
  cream: "#fff3d2",
  navy: "#2b3130",
};
export function Txt({
  children,
  size = 14,
  weight = "normal",
  color = C.ink,
  style = {},
  numberOfLines,
}: any) {
  return (
    <Text
      numberOfLines={numberOfLines}
      style={[
        {
          fontSize: size,
          color,
          fontWeight:
            weight === "bold" ? "800" : weight === "medium" ? "600" : weight,
          lineHeight: size * 1.4,
        },
        style,
      ]}
    >
      {children}
    </Text>
  );
}
export function Ico({ name, size = 20, color = C.ink }: any) {
  return <Ionicons name={name} size={size} color={color} />;
}
export function Btn({
  label,
  onPress,
  secondary = false,
  disabled = false,
  small = false,
  icon,
  style,
  loading = false,
}: any) {
  return (
    <TouchableOpacity
      disabled={disabled || loading}
      onPress={onPress}
      activeOpacity={0.78}
      style={[
        {
          backgroundColor: secondary ? C.paper : C.orange,
          borderWidth: secondary ? 1 : 0,
          borderColor: C.border,
          paddingVertical: small ? 10 : 15,
          paddingHorizontal: small ? 13 : 19,
          borderRadius: 15,
          alignItems: "center",
          justifyContent: "center",
          flexDirection: "row",
          gap: 7,
          opacity: disabled || loading ? 0.55 : 1,
        },
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator color={secondary ? C.ink : "#fff"} size="small" />
      ) : Boolean(icon) ? (
        <Ico name={icon} size={17} color={secondary ? C.ink : "#fff"} />
      ) : null}
      <Txt
        color={secondary ? C.ink : "#fff"}
        weight="bold"
        size={small ? 13 : 15}
      >
        {label}
      </Txt>
    </TouchableOpacity>
  );
}
export function Chip({ label, active = false, onPress, accent = false }: any) {
  return (
    <TouchableOpacity
      disabled={!onPress}
      onPress={onPress}
      style={{
        paddingHorizontal: 13,
        paddingVertical: 9,
        borderRadius: 30,
        backgroundColor: active ? C.ink : accent ? C.greenBg : C.paper,
        borderWidth: 1,
        borderColor: active ? C.ink : C.border,
      }}
    >
      <Txt
        size={12}
        weight="medium"
        color={active ? "#fff" : accent ? C.green : C.ink}
      >
        {label}
      </Txt>
    </TouchableOpacity>
  );
}
export function Panel({ children, style = {} }: any) {
  return (
    <View
      style={[
        {
          backgroundColor: C.paper,
          padding: 16,
          borderRadius: 19,
          borderWidth: 1,
          borderColor: C.border,
        },
        style,
      ]}
    >
      {children}
    </View>
  );
}
export function Field({
  label,
  value,
  onChangeText,
  placeholder,
  keyboardType = "default",
  multiline = false,
  secureTextEntry = false,
}: any) {
  return (
    <View style={{ gap: 7, flex: 1 }}>
      <Txt size={12} weight="medium" color={C.muted}>
        {label}
      </Txt>
      <TextInput
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor="#b9b1a8"
        keyboardType={keyboardType}
        multiline={multiline}
        secureTextEntry={secureTextEntry}
        style={{
          borderWidth: 1,
          borderColor: C.border,
          borderRadius: 13,
          paddingHorizontal: 13,
          paddingVertical: 12,
          fontSize: 14,
          color: C.ink,
          backgroundColor: C.paper,
          minHeight: 46,
        }}
      />
    </View>
  );
}
export function Pill({ label, kind = "neutral" }: any) {
  return (
    <View
      style={{
        backgroundColor:
          kind === "green"
            ? C.greenBg
            : kind === "orange"
              ? C.orangeLight
              : C.bg,
        paddingVertical: 5,
        paddingHorizontal: 9,
        borderRadius: 8,
        alignSelf: "flex-start",
      }}
    >
      <Txt
        color={
          kind === "green" ? C.green : kind === "orange" ? C.orange : C.muted
        }
        weight="bold"
        size={11}
      >
        {label}
      </Txt>
    </View>
  );
}
export function Photo({ url, emoji, height = 160 }: any) {
  const [failed, setFailed] = React.useState(false);
  React.useEffect(() => setFailed(false), [url]);
  return (
    <View
      style={{
        height,
        borderRadius: 17,
        overflow: "hidden",
        backgroundColor: C.cream,
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      {url && !failed ? (
        <Image
          source={{ uri: url }}
          onError={() => setFailed(true)}
          resizeMode="cover"
          style={{ width: "100%", height: "100%" }}
        />
      ) : (
        <View style={{ alignItems: "center", gap: 4 }}>
          <Txt size={48}>{emoji || "🍽️"}</Txt>
          <Txt size={10} color={C.muted}>
            Food image coming soon
          </Txt>
        </View>
      )}
    </View>
  );
}
export function Line({ style }: any) {
  return (
    <View
      style={[
        { height: 1, backgroundColor: C.border, marginVertical: 10 },
        style,
      ]}
    />
  );
}
export function Header({ eyebrow, title, right }: any) {
  return (
    <View
      style={{
        flexDirection: "row",
        justifyContent: "space-between",
        alignItems: "center",
        marginBottom: 21,
      }}
    >
      <View style={{ gap: 2, flex: 1 }}>
        <Txt size={12} color={C.muted} weight="medium">
          {eyebrow}
        </Txt>
        <Txt size={26} weight="bold">
          {title}
        </Txt>
      </View>
      {right}
    </View>
  );
}
export function Empty({ icon = "fast-food-outline", title, subtitle }: any) {
  return (
    <Panel style={{ alignItems: "center", padding: 28, gap: 8 }}>
      <Ico name={icon} color={C.orange} size={32} />
      <Txt weight="bold" size={17}>
        {title}
      </Txt>
      <Txt size={13} color={C.muted} style={{ textAlign: "center" }}>
        {subtitle}
      </Txt>
    </Panel>
  );
}
export function SwitchLine({ title, subtitle, value, onPress }: any) {
  return (
    <TouchableOpacity
      onPress={onPress}
      style={{
        flexDirection: "row",
        justifyContent: "space-between",
        alignItems: "center",
        paddingVertical: 11,
        gap: 13,
      }}
    >
      <View style={{ flex: 1, gap: 2 }}>
        <Txt weight="medium">{title}</Txt>
        {Boolean(subtitle) && (
          <Txt color={C.muted} size={12}>
            {subtitle}
          </Txt>
        )}
      </View>
      <View
        style={{
          backgroundColor: value ? C.green : "#ccc4ba",
          borderRadius: 20,
          width: 45,
          height: 26,
          padding: 3,
          alignItems: value ? "flex-end" : "flex-start",
        }}
      >
        <View
          style={{
            width: 20,
            height: 20,
            borderRadius: 10,
            backgroundColor: "#fff",
          }}
        />
      </View>
    </TouchableOpacity>
  );
}
export function BottomNav({ active, onSelect, merchant = false }: any) {
  const tabs = merchant
    ? [
        ["Orders", "receipt-outline"],
        ["Offers", "pricetags-outline"],
        ["Menu", "restaurant-outline"],
        ["Business", "stats-chart-outline"],
      ]
    : [
        ["Explore", "compass-outline"],
        ["Orders", "receipt-outline"],
        ["Profile", "person-outline"],
      ];
  return (
    <View
      style={{
        flexDirection: "row",
        paddingTop: 10,
        paddingBottom: Platform.OS === "web" ? 18 : 20,
        backgroundColor: "#fff",
        borderTopColor: C.border,
        borderTopWidth: 1,
        justifyContent: "space-around",
        width: "100%",
      }}
    >
      {tabs.map(([label, icon]) => (
        <TouchableOpacity
          key={label}
          onPress={() => onSelect(label)}
          style={{ alignItems: "center", gap: 4, minWidth: 56 }}
        >
          <Ico
            name={icon}
            size={22}
            color={active === label ? C.orange : C.muted}
          />
          <Txt
            color={active === label ? C.orange : C.muted}
            weight="medium"
            size={10}
          >
            {label}
          </Txt>
        </TouchableOpacity>
      ))}
    </View>
  );
}
export const webStyle: ViewStyle = {
  width: "100%",
  maxWidth: 1080,
  alignSelf: "center",
};

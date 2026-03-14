import { Stack } from "expo-router";

export default function MenuLayout() {
  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="index" />
      <Stack.Screen name="add-edit-item" options={{ title: "Item" }} />
      <Stack.Screen name="item-details/[id]" options={{ title: "Item details" }} />
      <Stack.Screen name="categories" options={{ title: "Categories" }} />
      <Stack.Screen name="category-availability" options={{ title: "Availability" }} />
      <Stack.Screen name="combos/index" options={{ title: "Combos" }} />
      <Stack.Screen name="combos/new" options={{ title: "New combo" }} />
      <Stack.Screen name="combos/[id]" options={{ title: "Combo" }} />
      <Stack.Screen name="addon-library/index" options={{ title: "Addon Library" }} />
      <Stack.Screen name="addon-library/[id]" options={{ title: "Addon group" }} />
    </Stack>
  );
}

import * as IAP from "expo-iap";
import { Platform } from "react-native";
import monetization from "../../monetization.json";

const P = Platform.OS === "ios" ? ((monetization as { iosProductPrefix?: string }).iosProductPrefix ?? "") : "";
const to = (s: string) => (P && !s.startsWith(P) ? P + s : s);
const back = (s: unknown) => (P && typeof s === "string" && s.startsWith(P) ? s.slice(P.length) : s);
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const fix = (o: any) => (o && typeof o === "object" ? { ...o, ...(o.productId ? { productId: back(o.productId) } : {}), ...(o.id ? { id: back(o.id) } : {}) } : o);
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Any = any;

export * from "expo-iap";
export const fetchProducts = (async (args: Any) => {
  const r = await IAP.fetchProducts({ ...args, skus: (args?.skus ?? []).map(to) });
  return Array.isArray(r) ? r.map(fix) : r;
}) as typeof IAP.fetchProducts;
export const requestPurchase = ((args: Any) => {
  const req = { ...(args?.request ?? {}) };
  const sku = req.apple?.sku ?? req.ios?.sku ?? req.google?.skus?.[0] ?? req.android?.skus?.[0];
  if (Platform.OS === "ios" && sku) req.apple = { ...(req.apple ?? {}), sku: to(sku) };
  return IAP.requestPurchase({ ...args, request: req });
}) as typeof IAP.requestPurchase;
export const getAvailablePurchases = (async (...a: Any[]) => {
  const r = await (IAP.getAvailablePurchases as Any)(...a);
  return Array.isArray(r) ? r.map(fix) : r;
}) as typeof IAP.getAvailablePurchases;
export const purchaseUpdatedListener = ((cb: Any) => IAP.purchaseUpdatedListener((p: Any) => cb(fix(p)))) as typeof IAP.purchaseUpdatedListener;

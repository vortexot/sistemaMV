/** Cart state: persisted in localStorage, shared through context. */
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

export interface CartItem {
  product_id: string;
  name: string;
  brand: string;
  sku: string;
  price: number;
  promo_price: number | null;
  image_file_id: string | null;
  qty: number;
}

export const cartUnitPrice = (item: { price: number; promo_price: number | null }) =>
  item.promo_price ?? item.price;

export function cartTotals(items: CartItem[]) {
  const subtotal = items.reduce((sum, i) => sum + i.price * i.qty, 0);
  const descontos = items.reduce((sum, i) => sum + (i.price - cartUnitPrice(i)) * i.qty, 0);
  return {
    subtotal: Math.round(subtotal * 100) / 100,
    descontos: Math.round(descontos * 100) / 100,
    total: Math.round((subtotal - descontos) * 100) / 100,
  };
}

interface CartContextValue {
  items: CartItem[];
  add: (item: Omit<CartItem, "qty">, qty?: number) => void;
  remove: (productId: string) => void;
  setQty: (productId: string, qty: number) => void;
  clear: () => void;
  count: number;
}

const CartContext = createContext<CartContextValue | null>(null);
const STORAGE_KEY = "gs-cart-v1";

function readStorage(): CartItem[] {
  try {
    const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "[]");
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function CartProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<CartItem[]>(readStorage);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
  }, [items]);

  const add = useCallback((item: Omit<CartItem, "qty">, qty = 1) => {
    setItems((prev) => {
      const existing = prev.find((i) => i.product_id === item.product_id);
      if (existing) {
        return prev.map((i) =>
          i.product_id === item.product_id ? { ...i, qty: Math.min(99, i.qty + qty) } : i,
        );
      }
      return [...prev, { ...item, qty }];
    });
  }, []);

  const remove = useCallback((productId: string) => {
    setItems((prev) => prev.filter((i) => i.product_id !== productId));
  }, []);

  const setQty = useCallback((productId: string, qty: number) => {
    setItems((prev) =>
      prev.map((i) =>
        i.product_id === productId ? { ...i, qty: Math.max(1, Math.min(99, qty)) } : i,
      ),
    );
  }, []);

  const clear = useCallback(() => setItems([]), []);

  const value = useMemo<CartContextValue>(
    () => ({
      items,
      add,
      remove,
      setQty,
      clear,
      count: items.reduce((sum, i) => sum + i.qty, 0),
    }),
    [items, add, remove, setQty, clear],
  );

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
}

export function useCart(): CartContextValue {
  const ctx = useContext(CartContext);
  if (!ctx) throw new Error("useCart must be used within CartProvider");
  return ctx;
}
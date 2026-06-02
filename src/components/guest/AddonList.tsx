import { useEffect, useRef, useState } from "react";

interface Addon {
  id: string;
  name: string;
  description: string | null;
  price_pln: number | null;
}

interface OrderRecord {
  id: string;
  service_id: string;
  status: string;
  created_at: string;
}

interface Props {
  addons: Addon[];
  initialOrders: OrderRecord[];
}

interface OrderState {
  orderId: string;
  status: string;
}

function buildInitialOrders(initialOrders: OrderRecord[]): Partial<Record<string, OrderState>> {
  const map: Partial<Record<string, OrderState>> = {};
  // initialOrders already sorted created_at DESC; first occurrence per service_id is the latest
  for (const o of initialOrders) {
    map[o.service_id] ??= { orderId: o.id, status: o.status };
  }
  return map;
}

export default function AddonList({ addons, initialOrders }: Props) {
  const [orders, setOrders] = useState<Partial<Record<string, OrderState>>>(() => buildInitialOrders(initialOrders));
  const [loading, setLoading] = useState<Partial<Record<string, boolean>>>({});
  const [errors, setErrors] = useState<Partial<Record<string, string | null>>>({});

  const hasPending = Object.values(orders).some((o) => o?.status === "pending");
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (!hasPending) {
      if (intervalRef.current !== null) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
      return;
    }

    const poll = async () => {
      try {
        const res = await fetch("/api/guest/orders");
        if (!res.ok) return;
        const rows = (await res.json()) as OrderRecord[];
        setOrders(buildInitialOrders(rows));
      } catch {
        // silent — next poll will retry
      }
    };

    intervalRef.current = setInterval(() => void poll(), 20_000);
    return () => {
      if (intervalRef.current !== null) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, [hasPending]);

  const handleOrder = async (serviceId: string) => {
    setLoading((prev) => ({ ...prev, [serviceId]: true }));
    setErrors((prev) => ({ ...prev, [serviceId]: null }));
    try {
      const res = await fetch("/api/guest/orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ serviceId }),
      });
      const body = (await res.json()) as { orderId?: string; error?: string };
      const newOrderId = body.orderId;
      if (res.ok && newOrderId) {
        setOrders((prev) => ({ ...prev, [serviceId]: { orderId: newOrderId, status: "pending" } }));
      } else {
        setErrors((prev) => ({ ...prev, [serviceId]: body.error ?? "Failed to place order" }));
      }
    } catch {
      setErrors((prev) => ({ ...prev, [serviceId]: "Network error" }));
    } finally {
      setLoading((prev) => ({ ...prev, [serviceId]: false }));
    }
  };

  const handleCancel = async (serviceId: string, orderId: string) => {
    setLoading((prev) => ({ ...prev, [serviceId]: true }));
    setErrors((prev) => ({ ...prev, [serviceId]: null }));
    try {
      const res = await fetch(`/api/guest/orders/${orderId}`, { method: "PATCH" });
      const body = (await res.json()) as { status?: string; error?: string };
      if (res.ok) {
        setOrders((prev) => ({ ...prev, [serviceId]: { orderId, status: "cancelled" } }));
      } else {
        setErrors((prev) => ({ ...prev, [serviceId]: body.error ?? "Failed to cancel order" }));
      }
    } catch {
      setErrors((prev) => ({ ...prev, [serviceId]: "Network error" }));
    } finally {
      setLoading((prev) => ({ ...prev, [serviceId]: false }));
    }
  };

  if (addons.length === 0) {
    return <p className="text-sm text-gray-500">No add-ons available for your package.</p>;
  }

  return (
    <ul className="space-y-3">
      {addons.map((addon) => {
        const order = orders[addon.id];
        const isLoading = loading[addon.id] ?? false;
        const error = errors[addon.id] ?? null;
        const status = order?.status;

        return (
          <li key={addon.id} className="rounded-lg border border-gray-200 bg-white px-4 py-3">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="font-medium text-gray-900">{addon.name}</p>
                {addon.description && <p className="text-sm text-gray-500">{addon.description}</p>}
              </div>
              <div className="flex shrink-0 flex-col items-end gap-1">
                {status === "pending" && order && (
                  <>
                    <span className="rounded-full bg-yellow-100 px-2.5 py-0.5 text-xs font-medium text-yellow-800">
                      ⏳ Pending
                    </span>
                    <button
                      onClick={() => handleCancel(addon.id, order.orderId)}
                      disabled={isLoading}
                      className="mt-1 rounded-md bg-gray-100 px-3 py-1 text-sm font-medium text-gray-700 hover:bg-gray-200 disabled:opacity-50"
                    >
                      {isLoading ? "Cancelling…" : "Cancel"}
                    </button>
                  </>
                )}
                {status === "fulfilled" && (
                  <span className="rounded-full bg-green-100 px-2.5 py-0.5 text-xs font-medium text-green-800">
                    ✓ Fulfilled
                  </span>
                )}
                {(!status || status === "cancelled") && (
                  <>
                    {status === "cancelled" && (
                      <span className="rounded-full bg-gray-100 px-2.5 py-0.5 text-xs font-medium text-gray-600">
                        ✕ Cancelled
                      </span>
                    )}
                    {addon.price_pln !== null && <span className="text-sm text-gray-500">{addon.price_pln} PLN</span>}
                    <button
                      onClick={() => handleOrder(addon.id)}
                      disabled={isLoading}
                      className="mt-1 rounded-md bg-blue-600 px-3 py-1 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
                    >
                      {isLoading ? "Ordering…" : "Order"}
                    </button>
                  </>
                )}
              </div>
            </div>
            {error && <p className="mt-1 text-xs text-red-600">{error}</p>}
          </li>
        );
      })}
    </ul>
  );
}

import { useEffect, useRef, useState } from "react";
import { ServiceCard } from "@/components/guest/ServiceCard";

interface Addon {
  id: string;
  name: string;
  description: string | null;
  price_pln: number | null;
  image_url: string | null;
  category: string;
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
    return <p className="text-muted-foreground text-sm">No add-ons available for your package.</p>;
  }

  const anyError = Object.values(errors).find((e) => e != null);

  return (
    <>
      {anyError && <p className="text-destructive mb-3 text-sm">{anyError}</p>}
      <div className="grid grid-cols-1 gap-4 min-[360px]:grid-cols-2">
        {addons.map((addon) => {
          const order = orders[addon.id];
          const orderStatus = (order?.status ?? "none") as "none" | "pending" | "fulfilled" | "cancelled";
          const isLoading = loading[addon.id] ?? false;

          return (
            <ServiceCard
              key={addon.id}
              variant="addon"
              id={addon.id}
              name={addon.name}
              description={addon.description}
              category={addon.category}
              imageUrl={addon.image_url}
              price={addon.price_pln}
              orderStatus={orderStatus}
              onOrder={() => handleOrder(addon.id)}
              onCancel={() => order && handleCancel(addon.id, order.orderId)}
              isLoading={isLoading}
            />
          );
        })}
      </div>
    </>
  );
}

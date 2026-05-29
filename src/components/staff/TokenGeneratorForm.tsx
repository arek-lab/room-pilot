import { useState } from "react";
import QRCode from "react-qr-code";
import { User, Calendar, BedDouble, Package, QrCode } from "lucide-react";
import { FormField } from "@/components/auth/FormField";
import { ServerError } from "@/components/auth/ServerError";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface Props {
  packages: { id: string; name: string }[];
  rooms: { id: string; room_number: string }[];
}

interface GeneratedData {
  tokenValue: string;
  guestName: string;
  roomNumber: string;
  checkInDate: string;
  checkOutDate: string;
}

interface ApiErrorBody {
  error?: string;
}

function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

const selectBase =
  "w-full rounded-lg bg-white/10 border border-white/20 px-3 py-2 pl-10 text-white focus:outline-none focus:ring-2 focus:ring-purple-400 transition-colors appearance-none";

export default function TokenGeneratorForm({ packages, rooms }: Props) {
  const [view, setView] = useState<"form" | "generated">("form");
  const [guestName, setGuestName] = useState("");
  const [roomNumber, setRoomNumber] = useState("");
  const [packageId, setPackageId] = useState("");
  const [checkInDate, setCheckInDate] = useState("");
  const [checkOutDate, setCheckOutDate] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [generated, setGenerated] = useState<GeneratedData | null>(null);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();

    if (!guestName.trim() || !roomNumber || !packageId || !checkInDate || !checkOutDate) {
      setError("All fields are required");
      return;
    }
    if (checkOutDate <= checkInDate) {
      setError("Check-out date must be after check-in date");
      return;
    }

    setError(null);
    setLoading(true);

    try {
      const res = await fetch("/api/staff/generate-token", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ guestName, roomNumber, packageId, checkInDate, checkOutDate }),
      });

      const body: unknown = await res.json();

      if (!res.ok) {
        const errBody = body as ApiErrorBody;
        setError(errBody.error ?? "Something went wrong");
        return;
      }

      const data = body as GeneratedData;
      setGenerated({
        tokenValue: data.tokenValue,
        guestName: data.guestName,
        roomNumber: data.roomNumber,
        checkInDate: data.checkInDate,
        checkOutDate: data.checkOutDate,
      });
      setView("generated");
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  function reset() {
    setView("form");
    setGuestName("");
    setRoomNumber("");
    setPackageId("");
    setCheckInDate("");
    setCheckOutDate("");
    setError(null);
    setGenerated(null);
  }

  const today = isoDate(new Date());
  const checkOutMin = checkInDate ? isoDate(new Date(new Date(checkInDate + "T12:00:00").getTime() + 86400000)) : today;

  if (view === "generated" && generated) {
    const qrUrl = `${window.location.origin}/guest/verify?token=${encodeURIComponent(generated.tokenValue)}`;
    return (
      <div className="flex min-h-[calc(100vh-4rem)] items-center justify-center p-4 print:block print:p-0">
        <div className="w-full max-w-md rounded-2xl border border-white/10 bg-white/10 p-8 text-white backdrop-blur-xl print:border-0 print:bg-transparent print:shadow-none">
          <div className="mb-6 flex justify-center print:mb-4">
            <div className="rounded-xl bg-white p-3">
              <QRCode value={qrUrl} size={200} />
            </div>
          </div>

          <div className="mb-6 space-y-2 text-center">
            <p className="text-xl font-semibold">{generated.guestName}</p>
            <p className="text-blue-100/80">Room {generated.roomNumber}</p>
            <p className="text-sm text-blue-100/60">
              {generated.checkInDate} → {generated.checkOutDate}
            </p>
          </div>

          <div className="flex gap-3 print:hidden">
            <Button
              type="button"
              onClick={() => {
                window.print();
              }}
              className="flex-1 rounded-lg bg-purple-600 px-4 py-2 font-medium text-white transition-colors hover:bg-purple-500"
            >
              Print
            </Button>
            <Button
              type="button"
              onClick={reset}
              className="flex-1 rounded-lg border border-white/20 bg-white/10 px-4 py-2 font-medium text-white transition-colors hover:bg-white/20"
            >
              Generate Another
            </Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-[calc(100vh-4rem)] items-center justify-center p-4">
      <div className="w-full max-w-md rounded-2xl border border-white/10 bg-white/10 p-8 backdrop-blur-xl">
        <h1 className="mb-6 bg-gradient-to-r from-blue-200 to-purple-200 bg-clip-text text-2xl font-bold text-transparent">
          Generate Guest Token
        </h1>
        <form onSubmit={handleSubmit} className="space-y-4" noValidate>
          <FormField
            id="guestName"
            label="Guest Name"
            value={guestName}
            onChange={setGuestName}
            placeholder="Jan Kowalski"
            icon={<User className="size-4" />}
          />

          <div>
            <label htmlFor="roomNumber" className="mb-1 block text-sm text-blue-100/80">
              Room
            </label>
            <div className="relative">
              <span className="absolute top-1/2 left-3 size-4 -translate-y-1/2 text-white/40">
                <BedDouble className="size-4" />
              </span>
              <select
                id="roomNumber"
                value={roomNumber}
                onChange={(e) => {
                  setRoomNumber(e.target.value);
                }}
                className={cn(selectBase, !roomNumber && "text-white/40")}
              >
                <option value="" disabled className="bg-gray-900 text-white">
                  Select room
                </option>
                {rooms.map((r) => (
                  <option key={r.id} value={r.room_number} className="bg-gray-900 text-white">
                    {r.room_number}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <label htmlFor="packageId" className="mb-1 block text-sm text-blue-100/80">
              Package
            </label>
            <div className="relative">
              <span className="absolute top-1/2 left-3 size-4 -translate-y-1/2 text-white/40">
                <Package className="size-4" />
              </span>
              <select
                id="packageId"
                value={packageId}
                onChange={(e) => {
                  setPackageId(e.target.value);
                }}
                className={cn(selectBase, !packageId && "text-white/40")}
              >
                <option value="" disabled className="bg-gray-900 text-white">
                  Select package
                </option>
                {packages.map((p) => (
                  <option key={p.id} value={p.id} className="bg-gray-900 text-white">
                    {p.name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <FormField
            id="checkInDate"
            label="Check-in Date"
            type="date"
            value={checkInDate}
            onChange={setCheckInDate}
            icon={<Calendar className="size-4" />}
            min={today}
          />

          <FormField
            id="checkOutDate"
            label="Check-out Date"
            type="date"
            value={checkOutDate}
            onChange={setCheckOutDate}
            icon={<Calendar className="size-4" />}
            min={checkOutMin}
          />

          <ServerError message={error} />

          <Button
            type="submit"
            disabled={loading}
            className="w-full rounded-lg bg-purple-600 px-4 py-2 font-medium text-white transition-colors hover:bg-purple-500 disabled:opacity-60"
          >
            {loading ? (
              <span className="flex items-center justify-center gap-2">
                <span className="size-4 animate-spin rounded-full border-2 border-white/30 border-t-white" />
                Generating...
              </span>
            ) : (
              <span className="flex items-center justify-center gap-2">
                <QrCode className="size-4" />
                Generate Token
              </span>
            )}
          </Button>
        </form>
      </div>
    </div>
  );
}

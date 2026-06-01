import QRCode from "react-qr-code";

interface Room {
  room_number: string;
  qr_token: string;
}

interface Props {
  rooms: Room[];
  origin: string;
}

export default function RoomQrGrid({ rooms, origin }: Props) {
  return (
    <div className="grid grid-cols-2 gap-6 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
      {rooms.map((room) => {
        const url = `${origin}/qr/room/${room.qr_token}`;
        return (
          <div
            key={room.qr_token}
            className="flex flex-col items-center gap-3 rounded-xl border border-gray-200 bg-white p-4 shadow-sm"
          >
            <span className="text-sm font-semibold text-gray-500 uppercase tracking-wide">
              Room
            </span>
            <span className="text-3xl font-bold text-gray-900">{room.room_number}</span>
            <div className="rounded-lg bg-white p-2 ring-1 ring-gray-100">
              <QRCode value={url} size={140} />
            </div>
            <a
              href={url}
              className="truncate max-w-full text-xs text-blue-600 hover:underline"
              target="_blank"
              rel="noopener noreferrer"
            >
              {url}
            </a>
          </div>
        );
      })}
    </div>
  );
}

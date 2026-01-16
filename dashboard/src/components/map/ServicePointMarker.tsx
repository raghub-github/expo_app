"use client";

import Image from "next/image";

interface ServicePointMarkerProps {
  name: string;
  city: string;
  onClick?: () => void;
}

export function ServicePointMarker({ name, city, onClick }: ServicePointMarkerProps) {
  return (
    <div
      className="relative cursor-pointer group"
      onClick={onClick}
      style={{
        transform: 'translate(-50%, -50%)',
      }}
    >
      {/* Logo marker */}
      <div className="relative w-10 h-10 bg-white rounded-full shadow-lg border-2 border-blue-500 p-1 flex items-center justify-center transition-transform group-hover:scale-110">
        <Image
          src="/onlylogo.png"
          alt="GatiMitra"
          width={32}
          height={32}
          className="object-contain"
          priority
        />
      </div>
      
      {/* Tooltip on hover */}
      <div className="absolute bottom-full left-1/2 transform -translate-x-1/2 mb-2 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-10">
        <div className="bg-gray-900 text-white text-xs rounded-lg py-2 px-3 whitespace-nowrap shadow-lg">
          <div className="font-semibold">{name}</div>
          <div className="text-gray-300">{city}</div>
          <div className="absolute bottom-0 left-1/2 transform -translate-x-1/2 translate-y-full">
            <div className="border-4 border-transparent border-t-gray-900"></div>
          </div>
        </div>
      </div>
    </div>
  );
}

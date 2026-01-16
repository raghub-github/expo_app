"use client";
import React from 'react';
import { useSession } from "next-auth/react";
import { SidebarNav } from './SidebarNav';

// TODO: Replace with real admin check (e.g., from context or session)
const isAdmin = true;

export default function AdminLayout({ children }: { children: React.ReactNode }) {
    const { data: session, status } = useSession();
  if (!isAdmin) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-white">
        <div className="p-8 rounded-xl shadow border bg-white text-center">
          <h2 className="text-2xl font-bold text-red-600 mb-2">Access Denied</h2>
          <p className="text-gray-700">You do not have permission to view this page.</p>
        </div>
      </div>
    );
  }
  return (
    <div className="flex flex-col min-h-screen bg-white relative">
      <header className="bg-white shadow p-4 flex items-center justify-end">
        {status === "authenticated" && session?.user && (
          <div className="flex items-center gap-3">
            <span className="font-medium text-gray-900">{session.user.name}</span>
            {session.user.image && (
              <img src={session.user.image} alt="avatar" className="w-8 h-8 rounded-full border" />
            )}
          </div>
        )}
      </header>
      <div className="flex flex-1">
        <main className="flex-1 px-0 md:px-8 py-8 relative">
          {children}
        </main>
        <aside className="w-72 border-l bg-white shadow-lg hidden md:flex flex-col px-6 py-8 relative">
          <SidebarNav />
        </aside>
      </div>
    </div>
  );
}

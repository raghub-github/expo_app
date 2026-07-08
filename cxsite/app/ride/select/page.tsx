import { redirect } from 'next/navigation'

/** Web ride booking is disabled — book only in the GatiMitra mobile app. */
export default function RideSelectPage() {
  redirect('/ride')
}

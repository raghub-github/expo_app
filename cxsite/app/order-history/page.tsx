import { redirect } from 'next/navigation'

/** Duplicate of /orders — keep URL working via redirect. */
export default function Page() {
  redirect('/orders?filter=all&from=%2F')
}

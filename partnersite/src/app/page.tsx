import { redirect } from 'next/navigation'

export default function Home() {
  redirect('/auth?redirect=/partners/all-stores')
}

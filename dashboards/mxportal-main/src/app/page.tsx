import { redirect } from 'next/navigation'

export default function Home() {
  // Redirect to auth landing page
  redirect('/auth')
}

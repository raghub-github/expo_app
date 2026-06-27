import { redirect } from 'next/navigation'

/** Canonical URL for “Around you” is `/india/All/Stores`. */
export default function AroundYouRedirect() {
  redirect('/india/All/Stores')
}

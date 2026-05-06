import { redirect } from 'next/navigation'
// redirect → Next.js server-side redirect, runs before the page renders

export default function Home() {
  redirect('/dashboard')
  // Visiting "/" immediately sends you to /dashboard
  // Middleware then decides: logged in → show dashboard, not logged in → send to /login
}

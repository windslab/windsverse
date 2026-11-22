import MemberSignup from '../member-signup';
import { normalizeInviteCode } from '@/lib/referral';

export const metadata = {
  title: 'Daftar Member | Winds Space',
  description: 'Kartu member Winds Space: stamp, minuman gratis, poin, dan hadiah tahunan.',
};

// A friend's link carries their invite code: …/member/daftar?ajak=AJAK-XXXX.
export default async function MemberSignupPage({
  searchParams,
}: {
  searchParams: Promise<{ ajak?: string | string[] }>;
}) {
  const { ajak } = await searchParams;
  return <MemberSignup invite={normalizeInviteCode(Array.isArray(ajak) ? ajak[0] : ajak)} />;
}

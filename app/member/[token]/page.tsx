import MemberCard from '../member-card';

export const metadata = {
  title: 'Kartu Member | Winds Space',
  robots: { index: false },
};

export default async function MemberPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  return <MemberCard token={token} />;
}

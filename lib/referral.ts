// Bring a friend (member ajak teman). Every member has an invite code, AJAK- and four letters and
// digits, apart from the card code: the card code unlocks rewards, so it is never shared. A new
// member who signs up with someone's invite code is written down as their friend (a `referrals`
// record). The friend counts once their first paid order that earns a stamp is in: then both get
// a bonus stamp, and every third such friend gives the inviter a free drink. An inviter is
// rewarded for at most REFERRAL_MONTHLY_CAP friends a month; titles count every friend.
// The record keeps when the friend counted (written by the till as it happens), so a card never
// has to look through other members' orders.
import { CODE_ALPHABET } from './member-code';
import { localDate, type Row, type State } from './model';

export const REFERRAL_MONTHLY_CAP = 5;
export const FRIENDS_PER_DRINK = 3;
/** Titles on the card by friends brought in, from the lowest. */
export const REFERRAL_TITLES = [
  { friends: 3, name: 'Wind Caller' },
  { friends: 10, name: 'Storm Bringer' },
  { friends: 25, name: 'Legend of Windstopia' },
] as const;

const INVITE_PATTERN = /^AJAK-[2-9A-HJ-NP-Z]{4}$/;
export const isInviteCode = (code: unknown) =>
  typeof code === 'string' && INVITE_PATTERN.test(code);
/** "ajak 7kq4", "7KQ4" and "AJAK-7KQ4" all become "AJAK-7KQ4"; anything else ''. */
export function normalizeInviteCode(input: unknown) {
  const raw = String(input ?? '')
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '')
    .replace(/^AJAK/, '');
  const code = raw.length === 4 ? 'AJAK-' + raw : '';
  return isInviteCode(code) ? code : '';
}
export function newInviteCode(taken: Iterable<string>) {
  const used = new Set(taken);
  for (;;) {
    const chars = [...crypto.getRandomValues(new Uint8Array(4))].map(
      (b) => CODE_ALPHABET[b % CODE_ALPHABET.length],
    );
    const code = 'AJAK-' + chars.join('');
    if (!used.has(code)) return code;
  }
}

/** The month (WITA) a friend counted in, for the monthly cap. */
export const referralMonth = (at: string) => localDate(new Date(at)).slice(0, 7);

/** Friends of an inviter who counted, oldest first. */
const activeFriends = (s: Pick<State, 'referrals'>, inviterId: string) =>
  s.referrals
    .filter((r) => r.inviterId === inviterId && r.activatedAt)
    .sort((a, b) => String(a.activatedAt).localeCompare(String(b.activatedAt)));

/** Bonus stamps a member got from bringing friends and from being brought, with their time. */
export function referralStamps(s: Pick<State, 'referrals'>, memberId: string) {
  return [
    ...s.referrals
      .filter((r) => r.inviteeId === memberId && r.activatedAt)
      .map((r) => ({ at: r.activatedAt as string, friend: false })),
    ...activeFriends(s, memberId)
      .filter((r) => r.rewarded)
      .map((r) => ({ at: r.activatedAt as string, friend: true })),
  ];
}

/** One free drink for every FRIENDS_PER_DRINK rewarded friends: r1, r2, … */
export function referralDrinks(s: Pick<State, 'referrals'>, memberId: string) {
  const rewarded = activeFriends(s, memberId).filter((r) => r.rewarded);
  const drinks: { id: string; earnedAt: string }[] = [];
  for (let k = 1; k * FRIENDS_PER_DRINK <= rewarded.length; k++)
    drinks.push({ id: `r${k}`, earnedAt: rewarded[k * FRIENDS_PER_DRINK - 1].activatedAt });
  return drinks;
}

/** What a member's card shows about the friends they brought. */
export function referralSummary(s: Pick<State, 'referrals'>, member: Row, now = new Date()) {
  const invited = s.referrals.filter((r) => r.inviterId === member.id);
  const active = activeFriends(s, member.id);
  const rewarded = active.filter((r) => r.rewarded).length;
  const month = localDate(now).slice(0, 7);
  const thisMonth = active.filter(
    (r) => r.rewarded && referralMonth(r.activatedAt) === month,
  ).length;
  const title = [...REFERRAL_TITLES].reverse().find((t) => active.length >= t.friends);
  const next = REFERRAL_TITLES.find((t) => active.length < t.friends);
  return {
    inviteCode: (member.inviteCode as string) || '',
    invited: invited.length,
    waiting: invited.length - active.length,
    active: active.length,
    toNextDrink: FRIENDS_PER_DRINK - (rewarded % FRIENDS_PER_DRINK),
    rewardsLeftThisMonth: Math.max(0, REFERRAL_MONTHLY_CAP - thisMonth),
    title: title?.name ?? '',
    nextTitle: next ? { name: next.name, friendsLeft: next.friends - active.length } : null,
  };
}

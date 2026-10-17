import { useEffect, useRef, useState } from 'react';
import { Stack, useRouter, useSegments } from 'expo-router';
import { Alert, View, Text, Pressable } from 'react-native';
import { supabase } from '../lib/supabase';
import { refreshRemote, getRemote, fetchLatestNudge, dismissNudge, wasShown, Nudge, startRemoteAutoSync, stopRemoteAutoSync, subscribeRemote } from '../lib/remote';
import { startUsageTracking } from '../lib/usage';
import type { Session } from '@supabase/supabase-js';

function alertNudge(n: Nudge) {
  Alert.alert('Message from Teacher 👨‍🏫', n.message, [
    { text: 'Thanks!', onPress: () => dismissNudge(n.id) }
  ], { cancelable: false });
}

export default function Layout() {
  const [session, setSession] = useState<Session | null>(null);
  const [ready, setReady] = useState(false);
  const router = useRouter();
  const segments = useSegments();
  const revokedUserId = useRef<string | null>(null);

  // EXAM LOCK: checked first on mount and on every navigation.
  // A locked exam → hard redirect to /exam/[id]; no back, no close.
  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session); setReady(true);
      if (data.session?.user) startRemoteAutoSync(data.session.user.id);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => {
      setSession(s);
      if (s?.user) { startRemoteAutoSync(s.user.id); startUsageTracking(s.user.id); }
      else { revokedUserId.current = null; stopRemoteAutoSync(); }
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  // Any remote change (15s poll / app resume) that locks or releases an exam
  // navigates INSTANTLY — no need to wait for a screen change.
  useEffect(() => {
    if (!session?.user) return;
    return subscribeRemote(() => {
      const r = getRemote();
      if (r.profile && r.profile.role !== 'student') {
        if (revokedUserId.current !== session.user.id) {
          revokedUserId.current = session.user.id;
          void supabase.auth.signOut();
        }
        router.replace('/(auth)/login');
        return;
      }
      const inExam = segments[0] === 'exam';
      if (r.lockedExam && !inExam) router.replace(`/exam/${r.lockedExam.exam_id}`);
      if (!r.lockedExam && inExam) router.replace('/');
    });
  }, [session, segments, router]);

  useEffect(() => {
    if (!ready) return;
    const inExam = segments[0] === 'exam';
    const inAuthGroup = segments[0] === '(auth)';
    if (!session && !inAuthGroup) { router.replace('/(auth)/login'); return; }
    if (!session) return;
    (async () => {
      const r = await refreshRemote(session.user.id);
      if (r.profile && r.profile.role !== 'student') {
        if (revokedUserId.current !== session.user.id) {
          revokedUserId.current = session.user.id;
          void supabase.auth.signOut();
        }
        router.replace('/(auth)/login');
        return;
      }
      if (r.lockedExam && !inExam) router.replace(`/exam/${r.lockedExam.exam_id}`);
      if (!r.lockedExam && inExam) router.replace('/');
      const n = await fetchLatestNudge(session.user);
      if (n && !wasShown(n.id)) alertNudge(n);
    })();
  }, [ready, session, segments]);

  // REALTIME: admin inserts a user_id-targeted nudge while the student is online → pops instantly.
  useEffect(() => {
    if (!session?.user) return;
    const uid = session.user.id;
    const handle = (row: any) => {
      if (!row || wasShown(String(row.id))) return;
      alertNudge({ id: String(row.id), message: row.message });
    };
    const ch = supabase.channel(`nudges-${uid}`)
      .on('postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'smartple_nudges', filter: `user_id=eq.${uid}` },
        p => handle(p.new))
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [session]);

  if (!ready) return <View style={{ flex: 1, backgroundColor: '#FFF6E6' }} />;

  return (
    <>
      <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: '#FFF6E6' } }} />
    </>
  );
}

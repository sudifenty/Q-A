import { useCallback, useEffect, useState } from 'react';
import { View, Text, Pressable, StyleSheet, ScrollView, Alert } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { effectiveFilters, useRemoteState } from '../lib/remote';
import { PASS_MARK, TIER_NAMES, TIER_UNLOCK_KEY } from '../lib/types';
import { fetchQuestionsFor, logEvent, SQ } from '../lib/data';
import { setTopic } from '../lib/usage';

/**
 * Tier ladder: T1 Comfort → T5 PLE UNEB.
 * 80% (12/15) unlocks the next tier. Never says FAILED —
 * only "You need X more to level up".
 */
export default function Learn() {
  const { topic, subject, klass, subtopic } = useLocalSearchParams<{ topic: string; subject: string; klass: string; subtopic?: string }>();
  const router = useRouter();
  const remote = useRemoteState();
  const routeSubtopic = subtopic || null;
  const [maxTier, setMaxTier] = useState(1);
  const [tier, setTier] = useState<number | null>(null);
  const [qs, setQs] = useState<SQ[]>([]);
  const [idx, setIdx] = useState(0);
  const [picked, setPicked] = useState<string | null>(null);
  const [typed, setTyped] = useState('');
  const [score, setScore] = useState(0);
  const [done, setDone] = useState(false);
  const [startedAt, setStartedAt] = useState(Date.now());
  const [loadedPermissionKey, setLoadedPermissionKey] = useState('');

  const f = effectiveFilters(remote.profile?.class ?? klass);
  const activeTier = f.tier || tier;
  const routeAllowed = f.klass === klass &&
    (!f.subject || f.subject === subject) &&
    (!f.topic || f.topic === topic) &&
    (!f.subtopic || f.subtopic === routeSubtopic);
  const permissionKey = `${f.allowPracticeAnswers}|${f.allowPracticeNoAnswers}`;

  // Live settings are re-checked while a learner is on the tier screen.
  useEffect(() => {
    if (!routeAllowed) { router.replace('/'); return; }
    if (!f.allowPracticeAnswers && !f.allowPracticeNoAnswers) {
      Alert.alert('Locked by your teacher 🔒', 'Practice is turned off right now. Read your notes first.');
      router.back();
    }
  }, [routeAllowed, f.allowPracticeAnswers, f.allowPracticeNoAnswers, router]);

  // If a permission is tightened during a quiz, stop the old question set so
  // the learner must restart with only the newly permitted question type(s).
  useEffect(() => {
    if (tier !== null && loadedPermissionKey && loadedPermissionKey !== permissionKey) {
      setTier(null); setQs([]); setDone(false); setIdx(0);
    }
  }, [tier, loadedPermissionKey, permissionKey]);

  useEffect(() => {
    (async () => {
      const raw = await AsyncStorage.getItem(TIER_UNLOCK_KEY);
      const unlocks = raw ? JSON.parse(raw) : {};
      const key = `${klass}|${subject}|${topic}`;
      setMaxTier(unlocks[key] || 1);
    })();
  }, [klass, subject, topic]);

  const startTier = useCallback(async (t: number) => {
    if (f.tier && t !== f.tier) return;
    let rows = await fetchQuestionsFor({
      klass: f.klass,
      subject: f.subject || subject,
      topic: f.topic || topic,
      subtopic: f.subtopic || routeSubtopic,
      tier: t
    });
    if (!f.allowPracticeAnswers) rows = rows.filter(q => q.kind !== 'mcq');
    if (!f.allowPracticeNoAnswers) rows = rows.filter(q => q.kind === 'mcq' && !!q.options?.length);
    if (!rows.length) return Alert.alert('Coming soon', 'No permitted questions in this tier yet.');
    setTier(t); setQs(rows); setIdx(0); setScore(0); setDone(false);
    setPicked(null); setTyped(''); setStartedAt(Date.now());
    setLoadedPermissionKey(permissionKey);
    setTopic(`${topic} T${t}`);
  }, [f.klass, f.subject, f.topic, f.subtopic, f.tier, f.allowPracticeAnswers,
    f.allowPracticeNoAnswers, subject, topic, routeSubtopic, permissionKey]);

  // A newly forced tier takes effect inside an open quiz. If the teacher clears
  // the force, an inaccessible tier returns to the tier picker.
  useEffect(() => {
    if (tier !== null && f.tier && tier !== f.tier) void startTier(f.tier);
    else if (tier !== null && !f.tier && tier > maxTier) setTier(null);
  }, [tier, f.tier, maxTier, startTier]);

  const total = qs.length;
  const needed = Math.ceil(total * PASS_MARK);

  const logAttempt = (qq: SQ, correct: boolean, given: string, seconds: number) => {
    logEvent({
      questionId: qq.id, subject, topic, subtopic: qq.subtopic, tier: qq.tier,
      correct, seconds
    });
  };

  const check = () => {
    const qq = qs[idx];
    const given = (qq.kind === 'mcq' ? picked : typed) || '';
    const ok = qq.answer.split(',').map(a => a.trim().toLowerCase()).includes(given.trim().toLowerCase());
    logAttempt(qq, ok, given, Math.round((Date.now() - startedAt) / 1000));
    const newScore = score + (ok ? 1 : 0);
    setScore(newScore);
    setStartedAt(Date.now());
    if (idx + 1 < total) { setIdx(idx + 1); setPicked(null); setTyped(''); return; }

    setDone(true);
    if (newScore >= needed && activeTier && activeTier < 5) {
      AsyncStorage.getItem(TIER_UNLOCK_KEY).then(raw => {
        const unlocks = raw ? JSON.parse(raw) : {};
        const key = `${klass}|${subject}|${topic}`;
        unlocks[key] = Math.max(unlocks[key] || 1, activeTier + 1);
        AsyncStorage.setItem(TIER_UNLOCK_KEY, JSON.stringify(unlocks));
        setMaxTier(unlocks[key]);
      });
    }
  };

  const skip = () => {
    const qq = qs[idx];
    logEvent({ questionId: qq.id, subject, topic, subtopic: qq.subtopic, tier: qq.tier, skipped: true, seconds: 0 });
    if (idx + 1 < total) { setIdx(idx + 1); setPicked(null); setTyped(''); } else setDone(true);
  };

  // ---------- tier picker ----------
  if (!tier) return (
    <ScrollView style={s.page} contentContainerStyle={{ padding: 16 }}>
      <Pressable style={s.back} onPress={() => router.back()}><Text style={s.backT}>← Back</Text></Pressable>
      <Text style={s.h}>{topic}</Text>
      <Text style={s.sub}>{subject} · Class {klass} — climb the 5 tiers. 80% unlocks the next.</Text>
      {[1, 2, 3, 4, 5].map(t => {
        const open = f.tier ? t === f.tier : t <= maxTier;
        return (
          <Pressable key={t} style={[s.tier, !open && s.tierOff]} disabled={!open} onPress={() => startTier(t)}>
            <Text style={s.tierN}>T{t}</Text>
            <Text style={s.tierName}>{TIER_NAMES[t - 1]}</Text>
            <Text style={s.tierState}>{open ? (f.tier === t ? '▶ Forced by teacher' : '▶ Play') : `🔒 Score 80% in T${t - 1}`}</Text>
          </Pressable>
        );
      })}
    </ScrollView>
  );

  // ---------- results ----------
  if (done) {
    const passed = score >= needed;
    return (
      <View style={s.center}>
        <Text style={{ fontSize: 54 }}>{passed ? '🎉' : '💪'}</Text>
        <Text style={s.h}>{score} / {total}</Text>
        <Text style={s.msg}>
          {passed
            ? (activeTier! < 5 ? `Tier ${activeTier! + 1} unlocked!` : 'You beat the PLE tier — champion!')
            : `You need ${needed - score} more correct to level up. Try again — you are close!`}
        </Text>
        <Pressable style={s.btn} onPress={() => startTier(activeTier!)}><Text style={s.btnT}>Try this tier again</Text></Pressable>
        <Pressable style={s.btnGhost} onPress={() => setTier(null)}><Text style={s.btnGhostT}>Back to tiers</Text></Pressable>
      </View>
    );
  }

  // ---------- question ----------
  const qq = qs[idx];
  return (
    <ScrollView style={s.page} contentContainerStyle={{ padding: 16 }}>
      <Text style={s.progress}>Tier {activeTier} · {TIER_NAMES[activeTier! - 1]} — Q{idx + 1}/{total} · score {score}</Text>
      <View style={s.qcard}>
        <Text style={s.q}>{qq.prompt}</Text>
        {qq.kind === 'mcq'
          ? (qq.options || []).map(o => (
              <Pressable key={o} style={[s.opt, picked === o && s.optOn]} onPress={() => setPicked(o)}>
                <Text style={picked === o ? s.optOnT : s.optT}>{o}</Text>
              </Pressable>
            ))
          : <TextInputBox value={typed} onChange={setTyped} />}
      </View>
      <Pressable style={s.btn} onPress={check}
        disabled={qq.kind === 'mcq' ? !picked : !typed.trim()}>
        <Text style={s.btnT}>{idx + 1 === total ? 'Finish' : 'Check'}</Text>
      </Pressable>
      <Pressable style={s.btnGhost} onPress={skip}><Text style={s.btnGhostT}>Skip</Text></Pressable>
    </ScrollView>
  );
}

import { TextInput } from 'react-native';
function TextInputBox({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return <TextInput style={s.typeIn} value={value} onChangeText={onChange} placeholder="Type your answer…" placeholderTextColor="#B7AC93" />;
}

const s = StyleSheet.create({
  page: { flex: 1 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  back: { marginBottom: 8 }, backT: { color: '#2D6CDF', fontWeight: '800' },
  h: { fontSize: 24, fontWeight: '900', color: '#2D4159', textAlign: 'center' },
  sub: { color: '#8A7F6A', marginBottom: 14, textAlign: 'center' },
  msg: { fontSize: 17, color: '#2D4159', textAlign: 'center', marginVertical: 12, fontWeight: '700' },
  tier: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#fff', borderRadius: 16, padding: 14, marginBottom: 8, borderWidth: 1, borderColor: '#EFE6D2', gap: 12 },
  tierOff: { opacity: 0.5 },
  tierN: { fontWeight: '900', color: '#2D6CDF', fontSize: 18 },
  tierName: { fontWeight: '800', color: '#2D4159', flex: 1 },
  tierState: { fontSize: 12, color: '#8A7F6A' },
  progress: { color: '#8A7F6A', fontWeight: '700', marginBottom: 8 },
  qcard: { backgroundColor: '#fff', borderRadius: 18, padding: 18, borderWidth: 1, borderColor: '#EFE6D2', marginBottom: 12 },
  q: { fontSize: 18, fontWeight: '800', color: '#2D4159', marginBottom: 12 },
  opt: { borderWidth: 1.5, borderColor: '#E6DCC8', borderRadius: 12, padding: 13, marginBottom: 8 },
  optOn: { backgroundColor: '#2D6CDF', borderColor: '#2D6CDF' },
  optT: { color: '#2D4159', fontWeight: '700' },
  optOnT: { color: '#fff', fontWeight: '700' },
  typeIn: { borderWidth: 1.5, borderColor: '#E6DCC8', borderRadius: 12, padding: 13, fontSize: 16, color: '#2D4159' },
  btn: { backgroundColor: '#2D6CDF', borderRadius: 14, padding: 15, alignItems: 'center' },
  btnT: { color: '#fff', fontWeight: '900', fontSize: 16 },
  btnGhost: { padding: 14, alignItems: 'center', marginTop: 6 },
  btnGhostT: { color: '#8A7F6A', fontWeight: '700' }
});

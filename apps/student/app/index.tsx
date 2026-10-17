import { useCallback, useEffect, useState } from 'react';
import { View, Text, Pressable, StyleSheet, ScrollView, Alert } from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { supabase } from '../lib/supabase';
import { refreshRemote, effectiveFilters, fetchLatestNudge, dismissNudge, subscribeRemote, useRemoteState, useRemoteSyncStatus } from '../lib/remote';
import { fetchQuestionsFor } from '../lib/data';
import { SST_SEQUENCE_LABEL, SST_TOTAL_QUESTIONS } from '../lib/sstSequence';

const isSSTSubject = (subject: string) => ['sst', 'social studies'].includes(subject.trim().toLowerCase());

/**
 * Home. On every focus: re-fetch remote control + exam lock.
 * If an exam is locked → straight to the exam (no back).
 * allow_* flags hide/disable buttons; forced_* narrow what is shown.
 */
export default function Home() {
  const router = useRouter();
  const remote = useRemoteState();
  const syncStatus = useRemoteSyncStatus();
  const [topics, setTopics] = useState<{ topic: string; subject: string }[]>([]);

  const load = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    const r = await refreshRemote(user.id);
    if (r.lockedExam) { router.replace(`/exam/${r.lockedExam.exam_id}`); return; }

    const f = effectiveFilters(r.profile?.class ?? null);
    const rows = await fetchQuestionsFor({
      klass: f.klass, subject: f.subject, topic: f.topic, subtopic: f.subtopic
    });
    const uniq: Record<string, { topic: string; subject: string }> = {};
    for (const row of rows) {
      // SST is served from the question-only local bank below, not the remote
      // answer-key-backed quiz table.
      if (!row.topic || isSSTSubject(row.subject)) continue;
      uniq[`${row.subject}|${row.topic}`] = { topic: row.topic, subject: row.subject };
    }
    setTopics(Object.values(uniq));
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  // A Realtime event (or fallback poll) refreshes the visible topic list while
  // this screen is open; the hook also updates the controls and score cards.
  useEffect(() => subscribeRemote(() => { void load(); }), [load]);

  const profile = remote.profile;
  const f = effectiveFilters(profile?.class ?? null);
  const r = remote;
  // SST is one shared P3→P7 sequence, independent of the student's own class.
  const showSST = (!f.subject || isSSTSubject(f.subject)) &&
    (f.allowPracticeAnswers || f.allowPracticeNoAnswers);
  const locked = (allowed: boolean) => !allowed;

  const go = (topic: string, subject: string, screen: string) =>
    router.push({ pathname: `/${screen}`, params: {
      topic, subject, klass: f.klass, subtopic: f.subtopic || ''
    } } as any);

  const checkMessages = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    const n = await fetchLatestNudge(user);
    if (n) {
      Alert.alert('Message from Teacher 👨‍🏫', n.message, [
        { text: 'Thanks!', onPress: () => dismissNudge(n.id) }
      ], { cancelable: false });
    } else {
      Alert.alert('📬 No new messages', 'Nothing new from your teacher right now.');
    }
  };

  return (
    <ScrollView style={s.page} contentContainerStyle={{ padding: 16 }}>
      <Text style={s.hi}>Hello {profile?.display_name || 'learner'} 👋</Text>
      <Text style={s.sub}>Class {f.klass}{f.subject ? ` · ${f.subject}` : ''}{f.topic ? ` · ${f.topic}` : ''}{f.subtopic ? ` · ${f.subtopic}` : ''}</Text>
      <View style={[s.syncPill, syncStatus === 'live' ? s.syncLive : syncStatus === 'offline' ? s.syncOffline : s.syncFallback]}>
        <View style={[s.syncDot, syncStatus === 'offline' ? s.syncDotOff : syncStatus === 'live' ? s.syncDotLive : s.syncDotPending]} />
        <Text style={s.syncText}>
          {syncStatus === 'live' ? 'Live sync on' : syncStatus === 'offline' ? 'Offline · last-known controls' : 'Auto-refresh active'}
        </Text>
      </View>
      {r.assignment?.note ? <Text style={s.note}>📝 {r.assignment.note}</Text> : null}

      {r.examResults.length > 0 && (
        <View style={s.results}>
          <Text style={s.resultsTitle}>Recent exam scores</Text>
          {r.examResults.slice(0, 3).map(result => (
            <View key={result.id} style={s.resultRow}>
              <View style={{ flex: 1 }}>
                <Text style={s.resultName}>{result.title}</Text>
                {result.subject ? <Text style={s.resultSubject}>{result.subject}</Text> : null}
              </View>
              <Text style={s.resultScore}>{result.score == null ? 'Pending' : `${result.score}%`}</Text>
            </View>
          ))}
        </View>
      )}

      <Pressable style={s.msgBtn} onPress={checkMessages}>
        <Text style={s.msgBtnT}>📬 Check Messages</Text>
      </Pressable>

      <View style={s.modes}>
        <Pressable
          style={[s.mode, locked(f.allowNotes) && s.modeOff]}
          disabled={locked(f.allowNotes)}
          onPress={() => Alert.alert('Notes', 'Pick a topic below, then tap Notes.')}>
          <Text style={s.modeIco}>📖</Text>
          <Text style={s.modeT}>Notes</Text>
          {locked(f.allowNotes) && <Text style={s.off}>Off by teacher</Text>}
        </Pressable>
        <Pressable
          style={[s.mode, locked(f.allowPracticeAnswers) && s.modeOff]}
          disabled={locked(f.allowPracticeAnswers)}
          onPress={() => Alert.alert('Practice', 'Pick a topic below, then tap Practice.')}>
          <Text style={s.modeIco}>✏️</Text>
          <Text style={s.modeT}>With answers</Text>
          {locked(f.allowPracticeAnswers) && <Text style={s.off}>Off by teacher</Text>}
        </Pressable>
        <Pressable
          style={[s.mode, locked(f.allowPracticeNoAnswers) && s.modeOff]}
          disabled={locked(f.allowPracticeNoAnswers)}
          onPress={() => Alert.alert('Practice', 'Pick a topic below, then tap No-answers drill.')}>
          <Text style={s.modeIco}>🧠</Text>
          <Text style={s.modeT}>No answers</Text>
          {locked(f.allowPracticeNoAnswers) && <Text style={s.off}>Off by teacher</Text>}
        </Pressable>
      </View>

      {showSST && (
        <>
          <Text style={s.sec}>SST Revision</Text>
          <Text style={s.sstHint}>One continuous question sequence for every student · question-only · no answer key</Text>
          <Pressable style={s.card} onPress={() => router.push('/sst' as any)}>
            <Text style={s.cardT}>Start from Primary 3</Text>
            <Text style={s.cardS}>{SST_SEQUENCE_LABEL} · {SST_TOTAL_QUESTIONS.toLocaleString()} questions · 34 topics</Text>
            <View style={s.cardBtns}>
              <View style={[s.mini, s.miniGo]}>
                <Text style={s.miniT}>🌍 Start SST sequence</Text>
              </View>
            </View>
          </Pressable>
        </>
      )}

      <Text style={s.sec}>Topics</Text>
      {topics.map(t => (
        <View key={`${t.subject}|${t.topic}`} style={s.card}>
          <Text style={s.cardT}>{t.topic}</Text>
          <Text style={s.cardS}>{t.subject}</Text>
          <View style={s.cardBtns}>
            {f.allowNotes && <Pressable style={s.mini} onPress={() => go(t.topic, t.subject, 'notes')}><Text style={s.miniT}>📖 Notes</Text></Pressable>}
            {(f.allowPracticeAnswers || f.allowPracticeNoAnswers) && <Pressable style={s.mini} onPress={() => go(t.topic, t.subject, 'practice')}><Text style={s.miniT}>✏️ Practice</Text></Pressable>}
            {(f.allowPracticeAnswers || f.allowPracticeNoAnswers) && <Pressable style={[s.mini, s.miniGo]} onPress={() => go(t.topic, t.subject, 'learn')}><Text style={s.miniT}>🚀 Learn tiers</Text></Pressable>}
          </View>
        </View>
      ))}
      {!topics.length && !showSST && <Text style={s.empty}>No topics yet — your teacher will assign some.</Text>}
    </ScrollView>
  );
}

const s = StyleSheet.create({
  page: { flex: 1 },
  hi: { fontSize: 24, fontWeight: '900', color: '#2D4159' },
  sub: { color: '#8A7F6A', marginBottom: 10 },
  syncPill: { alignSelf: 'flex-start', flexDirection: 'row', alignItems: 'center', gap: 7, borderRadius: 20, paddingHorizontal: 10, paddingVertical: 6, marginBottom: 10 },
  syncLive: { backgroundColor: '#E5F6EA' },
  syncFallback: { backgroundColor: '#FFF3D6' },
  syncOffline: { backgroundColor: '#FDECEC' },
  syncDot: { width: 7, height: 7, borderRadius: 4 },
  syncDotLive: { backgroundColor: '#1E9E4A' },
  syncDotPending: { backgroundColor: '#C28A00' },
  syncDotOff: { backgroundColor: '#D64545' },
  syncText: { color: '#486049', fontSize: 11, fontWeight: '800' },
  results: { backgroundColor: '#EAF1FF', borderColor: '#C9DCFF', borderWidth: 1, borderRadius: 14, padding: 12, marginBottom: 12 },
  resultsTitle: { color: '#1D4ED8', fontWeight: '900', marginBottom: 5 },
  resultRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 7, borderTopWidth: 1, borderTopColor: '#D6E4FF' },
  resultName: { color: '#2D4159', fontWeight: '800' },
  resultSubject: { color: '#8A7F6A', fontSize: 11, marginTop: 1 },
  resultScore: { color: '#1D4ED8', fontWeight: '900', fontSize: 17, marginLeft: 10 },
  note: { backgroundColor: '#FFF3D6', borderRadius: 12, padding: 10, color: '#7A5B00', marginBottom: 10, fontWeight: '600' },
  msgBtn: { backgroundColor: '#E7F0FF', borderRadius: 12, paddingVertical: 10, paddingHorizontal: 14, marginBottom: 12, borderWidth: 1, borderColor: '#C9DCFF', alignItems: 'center' },
  msgBtnT: { fontWeight: '800', color: '#1D4ED8', fontSize: 14 },
  modes: { flexDirection: 'row', gap: 10, marginBottom: 16 },
  mode: { flex: 1, backgroundColor: '#fff', borderRadius: 16, padding: 14, alignItems: 'center', borderWidth: 1, borderColor: '#EFE6D2' },
  modeOff: { opacity: 0.45 },
  modeIco: { fontSize: 26 },
  modeT: { fontWeight: '800', color: '#2D4159', marginTop: 4 },
  off: { fontSize: 10, color: '#B00020', marginTop: 2 },
  sec: { fontWeight: '900', color: '#2D4159', marginBottom: 8, fontSize: 17 },
  sstHint: { color: '#8A7F6A', fontSize: 12, marginBottom: 8 },
  card: { backgroundColor: '#fff', borderRadius: 16, padding: 14, marginBottom: 10, borderWidth: 1, borderColor: '#EFE6D2' },
  cardT: { fontWeight: '800', color: '#2D4159', fontSize: 16 },
  cardS: { color: '#8A7F6A', fontSize: 12, marginBottom: 8 },
  cardBtns: { flexDirection: 'row', gap: 8 },
  mini: { backgroundColor: '#F3EDDD', borderRadius: 10, paddingHorizontal: 10, paddingVertical: 7 },
  miniGo: { backgroundColor: '#DCE9FF' },
  miniT: { fontWeight: '700', color: '#2D4159', fontSize: 12 },
  empty: { color: '#8A7F6A', textAlign: 'center', marginTop: 30 }
});

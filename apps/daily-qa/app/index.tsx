import { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { supabase, isSupabaseConfigured } from '../lib/supabase';
import { DailyQASet, getOrStartDailySet, markQuestionStudied } from '../lib/dailyQa';

const localDateKey = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

const dateLabel = (value?: string) => {
  if (!value) return '';
  const [year, month, day] = value.split('-').map(Number);
  if (!year || !month || !day) return value;
  return new Date(year, month - 1, day).toLocaleDateString('en-UG', { day: 'numeric', month: 'short' });
};

export default function DailyQAHome() {
  const [assignment, setAssignment] = useState<DailyQASet | null>(null);
  const [studentName, setStudentName] = useState('learner');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(async (quiet = false) => {
    if (!isSupabaseConfigured) {
      setError('This app still needs the shared Supabase URL and publishable/anon key in apps/daily-qa/.env.');
      setLoading(false);
      return;
    }
    if (!quiet) setLoading(true);
    setError('');
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        const { data: profile } = await supabase.from('smartple_profiles')
          .select('display_name,full_name')
          .eq('user_id', user.id)
          .maybeSingle();
        setStudentName(profile?.display_name || profile?.full_name || user.user_metadata?.full_name || 'learner');
      }
      setAssignment(await getOrStartDailySet());
    } catch (e: any) {
      setError(e?.message || 'Could not load today’s study set. Check your connection and try again.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    load();
    const timer = setInterval(() => load(true), 15000);
    return () => clearInterval(timer);
  }, [load]);

  const nextItem = useMemo(
    () => assignment?.items?.find(item => !item.completed_at) || null,
    [assignment]
  );

  const markStudied = async () => {
    if (!assignment?.assignment_id || !nextItem || busy) return;
    setBusy(true);
    setError('');
    try {
      const updated = await markQuestionStudied(assignment.assignment_id, nextItem.question_id);
      setAssignment(updated);
    } catch (e: any) {
      setError(e?.message || 'Your progress could not be saved. Please retry before continuing.');
    } finally {
      setBusy(false);
    }
  };

  const signOut = async () => { await supabase.auth.signOut(); };

  if (loading) {
    return <View style={s.center}><StatusBar style="dark" /><ActivityIndicator size="large" color="#287A55" /><Text style={s.loadingText}>Getting your daily questions…</Text></View>;
  }

  const refresh = () => { setRefreshing(true); load(true); };

  return (
    <View style={s.page}>
      <StatusBar style="dark" />
      <View style={s.header}>
        <View style={s.brandRow}>
          <View style={s.brandIcon}><Text style={s.brandIconText}>Q</Text></View>
          <View>
            <Text style={s.brandName}>Daily Q&amp;A</Text>
            <Text style={s.brandSub}>SMARTPLE STUDY</Text>
          </View>
        </View>
        <Pressable onPress={signOut} hitSlop={10}><Text style={s.signOut}>Sign out</Text></Pressable>
      </View>

      <ScrollView
        contentContainerStyle={s.content}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor="#287A55" />}
      >
        <View style={s.welcomeRow}>
          <View style={s.welcomeCopy}>
            <Text style={s.eyebrow}>YOUR DAILY REVISION</Text>
            <Text style={s.title}>Hello, {studentName}.</Text>
            <Text style={s.intro}>Study each question together with its answer guide—one at a time.</Text>
          </View>
          {!!assignment?.target && (
            <View style={s.targetBadge}>
              <Text style={s.targetNumber}>{assignment.target}</Text>
              <Text style={s.targetLabel}>today</Text>
            </View>
          )}
        </View>

        {!!error && (
          <View style={s.errorBox}>
            <Text style={s.errorText}>{error}</Text>
            <Pressable style={s.retryButton} onPress={refresh}><Text style={s.retryText}>Try again</Text></Pressable>
          </View>
        )}

        {!error && assignment?.status === 'paused' && (
          <View style={s.statusCard}>
            <View style={s.statusIcon}><Text style={s.statusIconText}>Ⅱ</Text></View>
            <Text style={s.statusTitle}>Your questions are paused</Text>
            <Text style={s.statusBody}>{assignment.message || 'Your admin has paused this study plan. Ask them to turn it on when you are ready to continue.'}</Text>
          </View>
        )}

        {!error && assignment?.status === 'exhausted' && (
          <View style={s.statusCard}>
            <View style={[s.statusIcon, s.statusIconGold]}><Text style={s.statusIconText}>✓</Text></View>
            <Text style={s.statusTitle}>You reached the end of this guide</Text>
            <Text style={s.statusBody}>{assignment.message || 'Your admin needs to add more question-and-answer items before another set can be assigned.'}</Text>
            <Pressable style={s.secondaryButton} onPress={refresh}><Text style={s.secondaryText}>Check again</Text></Pressable>
          </View>
        )}

        {!error && assignment?.status === 'active' && nextItem && (
          <>
            <View style={s.progressCard}>
              <View style={s.progressTop}>
                <Text style={s.progressTitle}>Set {assignment.set_number} · {dateLabel(assignment.assigned_date)}</Text>
                <Text style={s.progressCount}>{assignment.completed_count || 0}<Text style={s.progressTotal}> / {assignment.target}</Text></Text>
              </View>
              <View style={s.progressTrack}><View style={[s.progressFill, { width: `${Math.min(100, ((assignment.completed_count || 0) / (assignment.target || 1)) * 100)}%` }]} /></View>
              <Text style={s.progressCaption}>{assignment.completed_count || 0} of {assignment.target} questions studied</Text>
            </View>

            {assignment.assigned_date && assignment.assigned_date < localDateKey() ? (
              <View style={s.carryNote}><Text style={s.carryText}>You’re continuing an unfinished set. Finish this set before the next one opens.</Text></View>
            ) : null}

            {assignment.target !== assignment.requested_target && (
              <View style={s.carryNote}><Text style={s.carryText}>This is the final partial set in the current question bank: {assignment.target} questions are available.</Text></View>
            )}

            <View style={s.questionCard}>
              <View style={s.cardTop}>
                <Text style={s.questionNumber}>QUESTION {String(nextItem.position).padStart(2, '0')} / {assignment.target}</Text>
                <View style={s.topicPill}><Text style={s.topicText}>{nextItem.topic}</Text></View>
              </View>
              <Text style={s.question}>{nextItem.question}</Text>
              <View style={s.answerBox}>
                <View style={s.answerHeadingRow}><Text style={s.answerHeading}>ANSWER GUIDE</Text><Text style={s.answerHint}>Read and review</Text></View>
                <Text style={s.answer}>{nextItem.answer}</Text>
              </View>
            </View>

            <Text style={s.actionHint}>After studying the answer, mark this item done to continue.</Text>
            <Pressable style={[s.primaryButton, busy && s.buttonBusy]} onPress={markStudied} disabled={busy}>
              {busy ? <ActivityIndicator color="#fff" /> : <Text style={s.primaryButtonText}>Mark studied &amp; continue  →</Text>}
            </Pressable>
          </>
        )}

        {!error && assignment?.status === 'complete' && (
          <View style={s.statusCard}>
            <View style={s.statusIcon}><Text style={s.statusIconText}>✓</Text></View>
            <Text style={s.statusEyebrow}>SET {assignment.set_number} COMPLETE</Text>
            <Text style={s.statusTitle}>{assignment.target} questions studied.</Text>
            <Text style={s.statusBody}>
              {assignment.assigned_date && assignment.assigned_date < localDateKey()
                ? 'Great work catching up. Your current-day set can now be opened.'
                : 'You have completed every question in today’s set. Your progress has been recorded.'}
            </Text>
            {assignment.assigned_date && assignment.assigned_date < localDateKey() ? (
              <Pressable style={s.primaryButton} onPress={refresh}><Text style={s.primaryButtonText}>Check for today’s set  →</Text></Pressable>
            ) : (
              <Pressable style={s.secondaryButton} onPress={refresh}><Text style={s.secondaryText}>Refresh status</Text></Pressable>
            )}
          </View>
        )}

        <View style={s.footerNote}>
          <Text style={s.footerTitle}>One question at a time</Text>
          <Text style={s.footerBody}>The answer guide is shown with every question. Your admin can see your progress and when the full set is complete.</Text>
        </View>
      </ScrollView>
    </View>
  );
}

const s = StyleSheet.create({
  page: { flex: 1, backgroundColor: '#F7F8F3' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#F7F8F3' },
  loadingText: { marginTop: 12, color: '#718078', fontWeight: '700' },
  header: { paddingHorizontal: 19, paddingTop: 15, paddingBottom: 13, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: '#E5ECE4' },
  brandRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  brandIcon: { width: 38, height: 38, borderRadius: 13, backgroundColor: '#287A55', alignItems: 'center', justifyContent: 'center' },
  brandIconText: { color: '#fff', fontSize: 20, fontWeight: '900' },
  brandName: { color: '#25372D', fontSize: 16, fontWeight: '900' },
  brandSub: { color: '#829087', fontSize: 9, fontWeight: '900', letterSpacing: 1.1, marginTop: 2 },
  signOut: { color: '#718078', fontSize: 12, fontWeight: '800' },
  content: { width: '100%', maxWidth: 720, alignSelf: 'center', paddingHorizontal: 17, paddingTop: 24, paddingBottom: 42 },
  welcomeRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginBottom: 19 },
  welcomeCopy: { flex: 1 },
  eyebrow: { color: '#287A55', fontSize: 10, fontWeight: '900', letterSpacing: 1.15 },
  title: { color: '#20342A', fontSize: 29, fontWeight: '900', letterSpacing: -0.8, marginTop: 4 },
  intro: { color: '#748178', fontSize: 13, lineHeight: 19, marginTop: 5, maxWidth: 420 },
  targetBadge: { minWidth: 66, minHeight: 68, borderRadius: 17, backgroundColor: '#EAF5ED', alignItems: 'center', justifyContent: 'center', paddingHorizontal: 9 },
  targetNumber: { color: '#287A55', fontSize: 26, fontWeight: '900', lineHeight: 29 },
  targetLabel: { color: '#548065', fontSize: 10, fontWeight: '800', marginTop: 1 },
  errorBox: { padding: 14, borderRadius: 14, borderWidth: 1, borderColor: '#F0CCCC', backgroundColor: '#FFF3F1', marginBottom: 14 },
  errorText: { color: '#963A38', fontSize: 12, lineHeight: 18, fontWeight: '600' },
  retryButton: { alignSelf: 'flex-start', marginTop: 10, backgroundColor: '#fff', borderRadius: 9, paddingHorizontal: 12, paddingVertical: 8 },
  retryText: { color: '#7C3634', fontSize: 12, fontWeight: '800' },
  progressCard: { padding: 16, borderRadius: 17, backgroundColor: '#fff', borderWidth: 1, borderColor: '#E2EAE1', marginBottom: 14 },
  progressTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginBottom: 10 },
  progressTitle: { color: '#3F5146', fontSize: 12, fontWeight: '800' },
  progressCount: { color: '#287A55', fontSize: 15, fontWeight: '900' },
  progressTotal: { color: '#849087', fontSize: 12, fontWeight: '700' },
  progressTrack: { height: 7, borderRadius: 99, backgroundColor: '#EDF2EC', overflow: 'hidden' },
  progressFill: { height: 7, borderRadius: 99, backgroundColor: '#43A36B' },
  progressCaption: { color: '#8A968F', fontSize: 10, fontWeight: '600', marginTop: 7 },
  carryNote: { padding: 11, backgroundColor: '#FFF9ED', borderColor: '#F0E0C1', borderWidth: 1, borderRadius: 11, marginBottom: 12 },
  carryText: { color: '#7D5D28', fontSize: 11, lineHeight: 16, fontWeight: '600' },
  questionCard: { backgroundColor: '#fff', borderRadius: 21, borderWidth: 1, borderColor: '#E2EAE1', padding: 18, shadowColor: '#193B29', shadowOpacity: 0.045, shadowRadius: 14, shadowOffset: { width: 0, height: 6 }, elevation: 2 },
  cardTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 9 },
  questionNumber: { color: '#287A55', fontSize: 10, letterSpacing: 0.8, fontWeight: '900' },
  topicPill: { maxWidth: '58%', backgroundColor: '#EEF7EF', borderRadius: 999, paddingHorizontal: 9, paddingVertical: 6 },
  topicText: { color: '#4A7B58', fontSize: 9, fontWeight: '800' },
  question: { color: '#22362B', fontSize: 23, lineHeight: 30, letterSpacing: -0.4, fontWeight: '800', marginTop: 19, marginBottom: 19 },
  answerBox: { padding: 15, backgroundColor: '#F2F8F1', borderRadius: 14, borderWidth: 1, borderColor: '#E2EEE0', borderLeftWidth: 4, borderLeftColor: '#62A974' },
  answerHeadingRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  answerHeading: { color: '#397450', fontSize: 10, letterSpacing: 1, fontWeight: '900' },
  answerHint: { color: '#86978A', fontSize: 9, fontWeight: '700' },
  answer: { color: '#354A3B', fontSize: 15, lineHeight: 23, fontWeight: '600', marginTop: 9 },
  actionHint: { color: '#839087', fontSize: 11, lineHeight: 16, textAlign: 'center', marginTop: 16, marginBottom: 10 },
  primaryButton: { minHeight: 50, backgroundColor: '#287A55', borderRadius: 14, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 17, marginTop: 8 },
  buttonBusy: { opacity: 0.75 },
  primaryButtonText: { color: '#fff', fontSize: 14, fontWeight: '900' },
  secondaryButton: { backgroundColor: '#EDF5EC', paddingVertical: 11, paddingHorizontal: 15, borderRadius: 11, marginTop: 17, alignSelf: 'center' },
  secondaryText: { color: '#34734D', fontSize: 12, fontWeight: '800' },
  statusCard: { backgroundColor: '#fff', padding: 23, borderRadius: 20, borderWidth: 1, borderColor: '#E2EAE1', alignItems: 'center', marginTop: 5 },
  statusIcon: { width: 55, height: 55, borderRadius: 19, backgroundColor: '#EAF5ED', alignItems: 'center', justifyContent: 'center', marginBottom: 15 },
  statusIconGold: { backgroundColor: '#FFF4D8' },
  statusIconText: { color: '#287A55', fontSize: 26, fontWeight: '900' },
  statusEyebrow: { color: '#287A55', fontSize: 10, letterSpacing: 1.1, fontWeight: '900', marginBottom: 6 },
  statusTitle: { color: '#25372D', fontSize: 21, fontWeight: '900', textAlign: 'center', letterSpacing: -0.4 },
  statusBody: { color: '#748178', fontSize: 13, lineHeight: 20, textAlign: 'center', marginTop: 9, maxWidth: 430 },
  footerNote: { marginTop: 18, padding: 15, borderRadius: 14, backgroundColor: '#EFF4ED' },
  footerTitle: { color: '#4B6654', fontSize: 11, fontWeight: '900' },
  footerBody: { color: '#77867B', fontSize: 10, lineHeight: 16, marginTop: 4 }
});
